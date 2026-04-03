import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditOperationType, Prisma } from '@prisma/client';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditArchiveService } from './audit-archive.service';
import { AuditAccessScopeResult, AuditAccessScopeService } from './audit-access-scope.service';

type AuditLogsQuery = {
  entityType?: string;
  entityId?: string;
  action?: string;
  operationType?: string;
  module?: string;
  actorId?: string;
  requestId?: string;
  from?: string;
  to?: string;
  q?: string;
  includeArchived?: string;
  cursor?: string;
  limit?: number;
};

type AuditTier = 'hot' | 'cold' | 'mixed';
type AuditAccessScope = 'company' | 'branch' | 'department';

type ColdScanStats = {
  scannedFiles: number;
  scannedRows: number;
  durationMs: number;
};

type NormalizedQuery = {
  entityType: string;
  entityId: string;
  action: string;
  operationType: AuditOperationType | null;
  module: string;
  actorId: string;
  requestId: string;
  from: Date | null;
  to: Date | null;
  q: string;
};

type ApiAuditLogRow = Record<string, unknown> & {
  id: string;
  createdAt: string;
  changedFields: string[];
  dataTier: 'hot' | 'cold';
};

type ArchivedAuditLogRow = Record<string, unknown> & {
  id: string;
  createdAt: string;
};

@Injectable()
export class AuditService {
  private readonly defaultColdRangeDays: number;
  private readonly maxCursorOffsetRows: number;
  private readonly defaultActionTaxonomy = [
    'CREATE',
    'UPDATE',
    'DELETE',
    'UPSERT',
    'CREATE_MANY',
    'UPDATE_MANY',
    'DELETE_MANY',
    'APPROVE',
    'REJECT',
    'ISSUE',
    'PAY',
    'VOID',
    'SUBMIT',
    'DELEGATE',
    'ESCALATE',
    'SENSITIVE_READ'
  ];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditArchiveService) private readonly auditArchive: AuditArchiveService,
    @Inject(AuditAccessScopeService) private readonly auditAccessScope: AuditAccessScopeService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {
    this.defaultColdRangeDays = this.toInt(
      Number(this.config.get<string>('AUDIT_COLD_QUERY_MAX_DAYS')),
      31,
      1,
      366
    );
    this.maxCursorOffsetRows = this.toInt(
      Number(this.config.get<string>('AUDIT_QUERY_MAX_CURSOR_OFFSET_ROWS')),
      2000,
      200,
      20_000
    );
  }

  async listLogs(query: AuditLogsQuery) {
    const limit = this.toInt(query.limit, 50, 1, 200);
    const includeArchived = this.parseIncludeArchived(query.includeArchived);
    const normalized = this.normalizeQuery(query);
    const where = this.buildWhere(normalized);
    const access = await this.auditAccessScope.resolveCurrentUserScope();
    const scopedWhere = this.applyActorScope(where, access);
    const actorScopeSet = access.allowedActorIds ? new Set(access.allowedActorIds) : null;

    if (!includeArchived) {
      return this.listHotOnly({
        where: scopedWhere,
        limit,
        cursor: this.cleanString(query.cursor),
        tier: 'hot',
        accessScope: access.accessScope
      });
    }

    const policy = await this.runtimeSettings.getDataGovernanceRuntime();
    const hotThreshold = this.auditArchive.toHotThreshold(new Date(), policy.auditHotRetentionMonths);
    const shouldTouchCold = this.shouldTouchCold(normalized, hotThreshold);
    const shouldTouchHot = this.shouldTouchHot(normalized, hotThreshold);
    const queryTier: AuditTier = shouldTouchCold && shouldTouchHot ? 'mixed' : shouldTouchCold ? 'cold' : 'hot';

    if (shouldTouchCold) {
      this.assertColdQueryWindow(normalized, hotThreshold, this.defaultColdRangeDays);
      this.auditArchive.requireStorageEnabledForArchiveQuery();
    }

    if (!shouldTouchCold) {
      return this.listHotOnly({
        where: scopedWhere,
        limit,
        cursor: this.cleanString(query.cursor),
        tier: queryTier,
        accessScope: access.accessScope
      });
    }

    const offset = this.parseOffsetCursor(this.cleanString(query.cursor)) ?? 0;
    const fetchCount = offset + limit + 1;
    if (fetchCount > this.maxCursorOffsetRows) {
      throw new BadRequestException(
        `Khoảng phân trang quá lớn cho truy vấn archive (>${this.maxCursorOffsetRows} bản ghi). Hãy thu hẹp bộ lọc thời gian.`
      );
    }

    const hotRows = shouldTouchHot
      ? await this.prisma.client.auditLog.findMany({
          where: {
            AND: [scopedWhere, { createdAt: { gte: hotThreshold } }]
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: fetchCount
        })
      : [];

    const coldFrom = normalized.from as Date;
    const coldToCandidate = normalized.to as Date;
    const coldTo = coldToCandidate.getTime() > hotThreshold.getTime() ? hotThreshold : coldToCandidate;
    const coldResult = await this.auditArchive.queryArchivedLogs<ArchivedAuditLogRow>({
      tenantId: this.prisma.getTenantId(),
      from: coldFrom,
      to: coldTo,
      limit: fetchCount,
      offset: 0,
      matcher: (row) => this.matchesColdRow(row, normalized, hotThreshold, actorScopeSet)
    });

    const merged = this.mergeRows([
      ...hotRows.map((row) => this.normalizeHotRow(row)),
      ...coldResult.items.map((row) => this.normalizeColdRow(row))
    ]);

    const paged = merged.slice(offset, offset + limit + 1);
    const hasMore = paged.length > limit;
    const items = hasMore ? paged.slice(0, limit) : paged;

    return {
      items,
      pageInfo: {
        limit,
        hasMore,
        nextCursor: hasMore ? this.encodeOffsetCursor(offset + limit) : null,
        tier: queryTier,
        accessScope: access.accessScope,
        coldScanStats: {
          scannedFiles: coldResult.scannedFiles,
          scannedRows: coldResult.scannedRows,
          durationMs: coldResult.durationMs
        }
      }
    };
  }

  async getObjectHistory(entityType: string, entityId: string, query: AuditLogsQuery) {
    const normalizedEntityType = this.cleanString(entityType);
    const normalizedEntityId = this.cleanString(entityId);
    if (!normalizedEntityType || !normalizedEntityId) {
      throw new BadRequestException('Thiếu entityType hoặc entityId.');
    }

    return this.listLogs({
      ...query,
      entityType: normalizedEntityType,
      entityId: normalizedEntityId
    });
  }

  async getActions() {
    const access = await this.auditAccessScope.resolveCurrentUserScope();
    const where = access.allowedActorIds
      ? {
          actorId: {
            in: access.allowedActorIds
          }
        }
      : undefined;

    const grouped = await this.prisma.client.auditLog.groupBy({
      by: ['action'],
      where,
      _count: {
        _all: true
      }
    });

    const countMap = new Map(
      grouped
        .map((item) => ({
          action: this.cleanString(item.action).toUpperCase(),
          count: item._count._all
        }))
        .filter((item) => item.action)
        .map((item) => [item.action, item.count])
    );

    const mergedActions = Array.from(new Set([...this.defaultActionTaxonomy, ...countMap.keys()]));

    return {
      items: mergedActions
        .sort((left, right) => left.localeCompare(right))
        .map((action) => ({
          action,
          count: countMap.get(action) ?? 0
        }))
    };
  }

  async pruneLogsBefore(cutoff: Date) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.audit_prune = 'on'`);
      const deleted = await tx.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoff
          }
        }
      });
      return deleted.count;
    });
  }

  private async listHotOnly(args: {
    where: Prisma.AuditLogWhereInput;
    limit: number;
    cursor: string;
    tier: AuditTier;
    accessScope: AuditAccessScope;
  }) {
    const offsetCursor = this.parseOffsetCursor(args.cursor);

    if (offsetCursor !== null) {
      const rows = await this.prisma.client.auditLog.findMany({
        where: args.where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offsetCursor,
        take: args.limit + 1
      });
      const hasMore = rows.length > args.limit;
      const items = hasMore ? rows.slice(0, args.limit) : rows;

      return {
        items: items.map((row) => this.normalizeHotRow(row)),
        pageInfo: {
          limit: args.limit,
          hasMore,
          nextCursor: hasMore ? this.encodeOffsetCursor(offsetCursor + args.limit) : null,
          tier: args.tier,
          accessScope: args.accessScope
        }
      };
    }

    const rows = await this.prisma.client.auditLog.findMany({
      where: args.where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: args.limit + 1,
      ...(args.cursor
        ? {
            cursor: { id: args.cursor },
            skip: 1
          }
        : {})
    });

    const hasMore = rows.length > args.limit;
    const items = hasMore ? rows.slice(0, args.limit) : rows;

    return {
      items: items.map((row) => this.normalizeHotRow(row)),
      pageInfo: {
        limit: args.limit,
        hasMore,
        nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
        tier: args.tier,
        accessScope: args.accessScope
      }
    };
  }

  private normalizeQuery(query: AuditLogsQuery): NormalizedQuery {
    return {
      entityType: this.cleanString(query.entityType),
      entityId: this.cleanString(query.entityId),
      action: this.cleanString(query.action).toUpperCase(),
      operationType: this.parseOperationType(query.operationType),
      module: this.cleanString(query.module).toLowerCase(),
      actorId: this.cleanString(query.actorId),
      requestId: this.cleanString(query.requestId),
      from: this.parseDate(query.from),
      to: this.parseDate(query.to),
      q: this.cleanString(query.q)
    };
  }

  private shouldTouchCold(query: NormalizedQuery, hotThreshold: Date) {
    if (!query.from && !query.to) {
      return false;
    }

    if (query.from && query.to) {
      return query.from.getTime() < hotThreshold.getTime();
    }

    if (query.from && !query.to) {
      return query.from.getTime() < hotThreshold.getTime();
    }

    if (!query.from && query.to) {
      return query.to.getTime() < hotThreshold.getTime();
    }

    return false;
  }

  private shouldTouchHot(query: NormalizedQuery, hotThreshold: Date) {
    if (!query.from && !query.to) {
      return true;
    }

    if (query.from && query.to) {
      return query.to.getTime() >= hotThreshold.getTime();
    }

    if (query.from && !query.to) {
      return true;
    }

    if (!query.from && query.to) {
      return query.to.getTime() >= hotThreshold.getTime();
    }

    return true;
  }

  private assertColdQueryWindow(query: NormalizedQuery, hotThreshold: Date, maxDays: number) {
    if (!query.from || !query.to) {
      throw new BadRequestException(
        'Tra cứu archive yêu cầu truyền đầy đủ from/to. Vui lòng chọn khoảng thời gian cụ thể.'
      );
    }

    if (query.to.getTime() < query.from.getTime()) {
      throw new BadRequestException('Khoảng thời gian không hợp lệ: to phải lớn hơn hoặc bằng from.');
    }

    if (query.from.getTime() >= hotThreshold.getTime()) {
      return;
    }

    const rangeMs = query.to.getTime() - query.from.getTime();
    const rangeDays = Math.ceil(rangeMs / (24 * 60 * 60 * 1000));
    if (rangeDays > maxDays) {
      throw new BadRequestException(
        `Truy vấn archive tối đa ${maxDays} ngày mỗi lần để đảm bảo hiệu năng.`
      );
    }
  }

  private buildWhere(query: NormalizedQuery): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};

    const entityType = query.entityType;
    const entityId = query.entityId;
    const action = query.action;
    const moduleKey = query.module;
    const actorId = query.actorId;
    const requestId = query.requestId;
    const q = query.q;

    if (entityType) {
      where.entityType = {
        equals: entityType,
        mode: 'insensitive'
      };
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (action) {
      where.action = {
        equals: action,
        mode: 'insensitive'
      };
    }

    if (query.operationType) {
      where.operationType = query.operationType;
    }

    if (moduleKey) {
      where.module = {
        equals: moduleKey,
        mode: 'insensitive'
      };
    }

    if (actorId) {
      where.actorId = actorId;
    }

    if (requestId) {
      where.requestId = requestId;
    }

    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) {
      createdAt.gte = query.from;
    }
    if (query.to) {
      createdAt.lte = query.to;
    }
    if (createdAt.gte || createdAt.lte) {
      where.createdAt = createdAt;
    }

    if (q) {
      where.OR = [
        {
          entityType: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          entityId: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          action: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          module: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          actorId: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          requestId: {
            contains: q,
            mode: 'insensitive'
          }
        }
      ];
    }

    return where;
  }

  private normalizeHotRow(row: {
    id: string;
    createdAt: Date;
    changedFields: Prisma.JsonValue | null;
    [key: string]: unknown;
  }): ApiAuditLogRow {
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      changedFields: this.toStringArray(row.changedFields),
      dataTier: 'hot'
    };
  }

  private normalizeColdRow(row: Record<string, unknown>): ApiAuditLogRow {
    const createdAt = this.parseDate(String(row.createdAt ?? '')) ?? new Date(0);
    return {
      ...row,
      id: this.cleanString(row.id),
      createdAt: createdAt.toISOString(),
      changedFields: this.toStringArray(row.changedFields as Prisma.JsonValue | null),
      dataTier: 'cold'
    };
  }

  private mergeRows(rows: ApiAuditLogRow[]) {
    const deduped = new Map<string, ApiAuditLogRow>();
    for (const row of rows) {
      if (!row.id || deduped.has(row.id)) {
        continue;
      }
      deduped.set(row.id, row);
    }

    return Array.from(deduped.values()).sort((left, right) => {
      const leftTs = this.parseDate(left.createdAt)?.getTime() ?? 0;
      const rightTs = this.parseDate(right.createdAt)?.getTime() ?? 0;
      if (leftTs !== rightTs) {
        return rightTs - leftTs;
      }
      return right.id.localeCompare(left.id);
    });
  }

  private matchesColdRow(
    row: Record<string, unknown>,
    query: NormalizedQuery,
    hotThreshold: Date,
    actorScopeSet: Set<string> | null
  ) {
    const createdAt = this.parseDate(String(row.createdAt ?? ''));
    if (!createdAt) {
      return false;
    }

    if (query.from && createdAt.getTime() < query.from.getTime()) {
      return false;
    }
    if (query.to && createdAt.getTime() > query.to.getTime()) {
      return false;
    }
    if (createdAt.getTime() >= hotThreshold.getTime()) {
      return false;
    }

    const entityType = this.cleanString(row.entityType);
    const entityId = this.cleanString(row.entityId);
    const action = this.cleanString(row.action).toUpperCase();
    const moduleKey = this.cleanString(row.module).toLowerCase();
    const actorId = this.cleanString(row.actorId);
    const requestId = this.cleanString(row.requestId);
    const operationType = this.parseOperationType(this.cleanString(row.operationType));

    if (actorScopeSet && !actorScopeSet.has(actorId)) {
      return false;
    }

    if (query.entityType && query.entityType.toLowerCase() !== entityType.toLowerCase()) {
      return false;
    }
    if (query.entityId && query.entityId !== entityId) {
      return false;
    }
    if (query.action && query.action !== action) {
      return false;
    }
    if (query.operationType && query.operationType !== operationType) {
      return false;
    }
    if (query.module && query.module !== moduleKey) {
      return false;
    }
    if (query.actorId && query.actorId !== actorId) {
      return false;
    }
    if (query.requestId && query.requestId !== requestId) {
      return false;
    }

    if (!query.q) {
      return true;
    }

    const q = query.q.toLowerCase();
    const textFields = [
      entityType,
      entityId,
      action,
      moduleKey,
      actorId,
      requestId,
      this.cleanString(row.route),
      this.cleanString(row.method)
    ]
      .join(' ')
      .toLowerCase();

    return textFields.includes(q);
  }

  private parseIncludeArchived(value: string | undefined) {
    const normalized = this.cleanString(value).toLowerCase();
    if (!normalized) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
    return true;
  }

  private parseOffsetCursor(cursor: string) {
    if (!cursor) {
      return null;
    }

    if (/^\d+$/.test(cursor)) {
      const raw = Number(cursor);
      return Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : null;
    }

    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded) as { offset?: unknown };
      const offset = Number(parsed.offset);
      if (!Number.isFinite(offset)) {
        return null;
      }
      return Math.max(0, Math.trunc(offset));
    } catch {
      return null;
    }
  }

  private encodeOffsetCursor(offset: number) {
    return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
  }

  private parseDate(value: string | undefined) {
    const raw = this.cleanString(value);
    if (!raw) {
      return null;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseOperationType(value: string | undefined) {
    const normalized = this.cleanString(value).toUpperCase();
    if (!normalized) {
      return null;
    }

    if (normalized === AuditOperationType.READ || normalized === AuditOperationType.WRITE) {
      return normalized as AuditOperationType;
    }
    return null;
  }

  private toStringArray(value: Prisma.JsonValue | null) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }

  private toInt(value: number | undefined, fallback: number, min: number, max: number) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(normalized)));
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }

  private applyActorScope(where: Prisma.AuditLogWhereInput, access: AuditAccessScopeResult): Prisma.AuditLogWhereInput {
    if (!access.allowedActorIds) {
      return where;
    }

    return {
      AND: [
        where,
        {
          actorId: {
            in: access.allowedActorIds
          }
        }
      ]
    };
  }
}
