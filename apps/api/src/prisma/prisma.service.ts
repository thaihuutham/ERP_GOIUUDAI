import { AsyncLocalStorage } from 'async_hooks';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuditOperationType, Prisma, PrismaClient } from '@prisma/client';
import { AUDIT_ACTION_CONTEXT_KEY, AUDIT_REQUEST_CONTEXT_KEY } from '../common/audit/audit.constants';
import { AppendAuditLogInput, AuditActionContext, AuditRequestContext } from '../common/audit/audit.types';
import { computeChangedFields, createAuditHash, maskSensitiveFields } from '../common/audit/audit.util';
import { AUTH_USER_CONTEXT_KEY } from '../common/request/request.constants';
import { TENANT_CONTEXT_KEY } from '../common/tenant/tenant.constants';
import { createTenantPrismaExtension } from './tenant-prisma.extension';

const AUDIT_WRITE_OPERATIONS = new Set([
  'create',
  'update',
  'delete',
  'upsert',
  'createMany',
  'updateMany',
  'deleteMany'
]);

const AUDIT_EXCLUDED_MODELS = new Set(['AuditLog', 'AuditChainState']);
const DEFAULT_AUDIT_TECHNICAL_MODEL_DENYLIST = new Set(['Notification']);
const AUDIT_BULK_SNAPSHOT_LIMIT = 200;

type AuditQueryParams = {
  model?: string;
  action: string;
  args: Record<string, unknown> | undefined;
};

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly baseClient: PrismaClient;
  private readonly auditBypassContext = new AsyncLocalStorage<boolean>();
  private readonly auditModelDenylist: Set<string>;
  private isConnected = false;
  readonly client: PrismaClient;

  constructor(
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {
    this.baseClient = new PrismaClient({
      datasourceUrl: this.config.get<string>('DATABASE_URL')
    });
    this.auditModelDenylist = this.buildAuditModelDenylist();

    const resolveTenantId = () => this.cls.get(TENANT_CONTEXT_KEY) ?? this.config.get<string>('DEFAULT_TENANT_ID', 'GOIUUDAI');

    this.client = this.baseClient
      .$extends(this.createAuditPrismaExtension())
      .$extends(createTenantPrismaExtension(resolveTenantId)) as PrismaClient;
  }

  private createAuditPrismaExtension() {
    return Prisma.defineExtension((client) =>
      client.$extends({
        query: {
          $allModels: {
            $allOperations: async ({ model, operation, args, query }) => {
              return this.auditWriteMiddleware(
                {
                  model: model ?? undefined,
                  action: operation,
                  args: (args ?? undefined) as Record<string, unknown> | undefined
                },
                async (nextArgs) => (query as any)(nextArgs)
              );
            }
          }
        }
      })
    );
  }

  async onModuleInit(): Promise<void> {
    if (this.shouldSkipConnect()) {
      return;
    }

    await this.baseClient.$connect();
    this.isConnected = true;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    await this.baseClient.$disconnect();
  }

  getTenantId(): string {
    return this.cls.get(TENANT_CONTEXT_KEY) ?? this.config.get<string>('DEFAULT_TENANT_ID', 'GOIUUDAI');
  }

  getDelegate(model: string): any {
    const delegate = (this.client as any)[model];
    if (!delegate) {
      throw new Error(`Unknown Prisma delegate: ${model}`);
    }
    return delegate;
  }

  async appendAuditLog(input: AppendAuditLogInput) {
    const tenantId = this.cleanString(input.tenantId);
    if (!tenantId) {
      return;
    }

    const moduleKey = this.cleanString(input.module) || 'system';
    const entityType = this.cleanString(input.entityType) || 'UnknownEntity';
    const action = this.cleanString(input.action).toUpperCase() || 'UNKNOWN';
    const createdAt = input.createdAt ?? new Date();

    const beforeDataMasked = maskSensitiveFields(input.beforeData ?? null);
    const afterDataMasked = maskSensitiveFields(input.afterData ?? null);
    const metadataMasked = maskSensitiveFields(input.metadata ?? {});

    const changedFields = this.normalizeChangedFields(
      input.changedFields,
      beforeDataMasked,
      afterDataMasked
    );

    await this.runAuditBypass(async () => {
      await this.baseClient.$transaction(async (tx) => {
        await tx.auditChainState.upsert({
          where: {
            tenant_Id: tenantId
          },
          create: {
            tenant_Id: tenantId
          },
          update: {}
        });

        await tx.$executeRaw`SELECT 1 FROM "audit_chain_state" WHERE "tenant_Id" = ${tenantId} FOR UPDATE`;

        const chainState = await tx.auditChainState.findUnique({
          where: {
            tenant_Id: tenantId
          }
        });
        const prevHash = chainState?.lastHash ?? null;

        const hashPayload: Record<string, unknown> = {
          tenantId,
          module: moduleKey,
          entityType,
          entityId: this.cleanString(input.entityId) || null,
          action,
          operationType: input.operationType,
          actorId: this.cleanString(input.actorId) || null,
          actorRole: this.cleanString(input.actorRole) || null,
          requestId: this.cleanString(input.requestId) || null,
          route: this.cleanString(input.route) || null,
          method: this.cleanString(input.method).toUpperCase() || null,
          statusCode: typeof input.statusCode === 'number' ? input.statusCode : null,
          ip: this.cleanString(input.ip) || null,
          userAgent: this.cleanString(input.userAgent) || null,
          beforeData: beforeDataMasked,
          afterData: afterDataMasked,
          changedFields,
          metadata: metadataMasked,
          prevHash,
          createdAt: createdAt.toISOString()
        };
        const hash = createAuditHash(hashPayload);

        const log = await tx.auditLog.create({
          data: {
            tenant_Id: tenantId,
            module: moduleKey,
            entityType,
            entityId: this.cleanString(input.entityId) || null,
            action,
            operationType: input.operationType,
            actorId: this.cleanString(input.actorId) || null,
            actorRole: this.cleanString(input.actorRole) || null,
            requestId: this.cleanString(input.requestId) || null,
            route: this.cleanString(input.route) || null,
            method: this.cleanString(input.method).toUpperCase() || null,
            statusCode: typeof input.statusCode === 'number' ? input.statusCode : null,
            ip: this.cleanString(input.ip) || null,
            userAgent: this.cleanString(input.userAgent) || null,
            beforeData: this.toNullableJsonValue(beforeDataMasked),
            afterData: this.toNullableJsonValue(afterDataMasked),
            changedFields: this.toNullableJsonValue(changedFields),
            metadata: this.toNullableJsonValue(metadataMasked),
            prevHash,
            hash,
            createdAt
          }
        });

        await tx.auditChainState.update({
          where: {
            tenant_Id: tenantId
          },
          data: {
            lastLogId: log.id,
            lastHash: hash,
            lastEventAt: createdAt
          }
        });
      });
    });
  }

  private async auditWriteMiddleware(
    params: AuditQueryParams,
    next: (args: Record<string, unknown> | undefined) => Promise<unknown>
  ) {
    if (this.auditBypassContext.getStore() === true) {
      return next(params.args);
    }

    if (!params.model || !AUDIT_WRITE_OPERATIONS.has(params.action) || AUDIT_EXCLUDED_MODELS.has(params.model)) {
      return next(params.args);
    }
    if (this.auditModelDenylist.has(params.model)) {
      return next(params.args);
    }

    const tenantId = this.getTenantId();
    const requestContext = this.cls.get<AuditRequestContext | undefined>(AUDIT_REQUEST_CONTEXT_KEY);
    const actionContext = this.cls.get<AuditActionContext | undefined>(AUDIT_ACTION_CONTEXT_KEY);
    const actor = this.resolveActor();

    const beforeData = await this.captureBeforeSnapshot(params.model, params.action, params.args, tenantId);
    const result = await next(params.args);
    if (this.shouldSkipWriteNoise(params.action, result)) {
      return result;
    }
    const afterData = await this.captureAfterSnapshot(params.model, params.action, params.args, result);

    const changedFields = this.resolveChangedFields(params.action, params.args, beforeData, afterData);
    const entityId = this.resolveEntityId(actionContext, params.args, result, beforeData, afterData);

    await this.appendAuditLog({
      tenantId,
      module: this.cleanString(actionContext?.module) || this.cleanString(requestContext?.module) || params.model.toLowerCase(),
      entityType: this.cleanString(actionContext?.entityType) || params.model,
      entityId,
      action: this.cleanString(actionContext?.action) || this.mapDefaultAction(params.action),
      operationType: AuditOperationType.WRITE,
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      requestId: this.cleanString(requestContext?.requestId) || null,
      route: this.cleanString(requestContext?.route) || null,
      method: this.cleanString(requestContext?.method).toUpperCase() || null,
      statusCode: null,
      ip: this.cleanString(requestContext?.ip) || null,
      userAgent: this.cleanString(requestContext?.userAgent) || null,
      beforeData,
      afterData,
      changedFields,
      metadata: {
        prisma: {
          model: params.model,
          operation: params.action
        },
        ...(actionContext?.metadata ?? {}),
        request: {
          params: requestContext?.params ?? {},
          query: requestContext?.query ?? {}
        }
      }
    });

    return result;
  }

  private shouldSkipWriteNoise(action: string, result: unknown) {
    if ((action === 'updateMany' || action === 'deleteMany') && this.extractCount(result) === 0) {
      return true;
    }
    return false;
  }

  private extractCount(result: unknown) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return null;
    }
    if (!('count' in result)) {
      return null;
    }
    const raw = (result as Record<string, unknown>).count;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return null;
    }
    return Math.trunc(value);
  }

  private async captureBeforeSnapshot(
    model: string,
    action: string,
    args: AuditQueryParams['args'],
    tenantId: string
  ) {
    const shouldReadBefore = new Set(['update', 'delete', 'upsert', 'updateMany', 'deleteMany']);
    if (!shouldReadBefore.has(action)) {
      return null;
    }

    const where = this.readWhereFromArgs(args);
    if (!where) {
      return null;
    }

    const finalWhere = this.withTenantWhere(where, tenantId);
    if (!finalWhere) {
      return null;
    }

    return this.findManyByModel(model, finalWhere);
  }

  private async captureAfterSnapshot(
    _model: string,
    action: string,
    _args: AuditQueryParams['args'],
    result: unknown
  ) {
    if (action === 'createMany' || action === 'updateMany' || action === 'deleteMany') {
      if (result && typeof result === 'object' && 'count' in (result as Record<string, unknown>)) {
        return {
          count: Number((result as Record<string, unknown>).count ?? 0)
        };
      }
      return {
        count: 0
      };
    }

    return result;
  }

  private async findManyByModel(model: string, where: Record<string, unknown>) {
    const delegateName = this.toDelegateName(model);
    const delegate = (this.baseClient as any)[delegateName];
    if (!delegate || typeof delegate.findMany !== 'function') {
      return null;
    }

    return this.runAuditBypass(async () => {
      try {
        const result = await delegate.findMany({
          where,
          take: AUDIT_BULK_SNAPSHOT_LIMIT
        });
        return Array.isArray(result) ? result : null;
      } catch {
        return null;
      }
    });
  }

  private resolveChangedFields(action: string, args: AuditQueryParams['args'], beforeData: unknown, afterData: unknown) {
    if (action === 'create' && this.isPlainObject(afterData)) {
      return Object.keys(afterData);
    }

    if (action === 'delete') {
      const beforeRecord = this.pickFirstRecord(beforeData);
      if (this.isPlainObject(beforeRecord)) {
        return Object.keys(beforeRecord);
      }
      return [];
    }

    if (action === 'createMany' || action === 'updateMany' || action === 'deleteMany') {
      const data = this.readDataFromArgs(args);
      if (this.isPlainObject(data)) {
        return Object.keys(data);
      }
      return ['count'];
    }

    const beforeRecord = this.pickFirstRecord(beforeData);
    const afterRecord = this.pickFirstRecord(afterData);
    return computeChangedFields(beforeRecord, afterRecord);
  }

  private resolveEntityId(
    actionContext: AuditActionContext | undefined,
    args: AuditQueryParams['args'],
    result: unknown,
    beforeData: unknown,
    afterData: unknown
  ) {
    const explicitId = this.cleanString(actionContext?.entityId);
    if (explicitId) {
      return explicitId;
    }

    const afterRecord = this.pickFirstRecord(afterData);
    if (this.isPlainObject(afterRecord)) {
      const fromAfter = this.cleanString(afterRecord.id);
      if (fromAfter) {
        return fromAfter;
      }
    }

    if (this.isPlainObject(result)) {
      const fromResult = this.cleanString(result.id);
      if (fromResult) {
        return fromResult;
      }
    }

    const where = this.readWhereFromArgs(args);
    if (where && this.isPlainObject(where)) {
      const fromWhere = this.cleanString(where.id);
      if (fromWhere) {
        return fromWhere;
      }
    }

    const beforeRecord = this.pickFirstRecord(beforeData);
    if (this.isPlainObject(beforeRecord)) {
      const fromBefore = this.cleanString(beforeRecord.id);
      if (fromBefore) {
        return fromBefore;
      }
    }

    return null;
  }

  private pickFirstRecord(payload: unknown) {
    if (Array.isArray(payload)) {
      return payload[0] ?? null;
    }
    return payload;
  }

  private mapDefaultAction(action: string) {
    const map: Record<string, string> = {
      create: 'CREATE',
      update: 'UPDATE',
      delete: 'DELETE',
      upsert: 'UPSERT',
      createMany: 'CREATE_MANY',
      updateMany: 'UPDATE_MANY',
      deleteMany: 'DELETE_MANY'
    };
    return map[action] ?? action.toUpperCase();
  }

  private normalizeChangedFields(
    inputChangedFields: string[] | null | undefined,
    beforeData: unknown,
    afterData: unknown
  ) {
    if (Array.isArray(inputChangedFields) && inputChangedFields.length > 0) {
      return Array.from(new Set(inputChangedFields.map((item) => this.cleanString(item)).filter(Boolean)));
    }
    return computeChangedFields(beforeData, afterData);
  }

  private resolveActor() {
    const authUser = this.cls.get<Record<string, unknown> | undefined>(AUTH_USER_CONTEXT_KEY) ?? {};
    const actorId = this.cleanString(authUser.userId ?? authUser.sub) || null;
    const actorRole = this.cleanString(authUser.role) || null;
    return {
      actorId,
      actorRole
    };
  }

  private buildAuditModelDenylist() {
    const configured = String(this.config.get<string>('AUDIT_MODEL_DENYLIST') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const merged = new Set<string>(DEFAULT_AUDIT_TECHNICAL_MODEL_DENYLIST);
    for (const item of configured) {
      merged.add(item);
    }
    return merged;
  }

  private readWhereFromArgs(args: AuditQueryParams['args']) {
    if (!args || !this.isPlainObject(args)) {
      return null;
    }
    const where = args.where;
    if (!where || !this.isPlainObject(where)) {
      return null;
    }
    return where as Record<string, unknown>;
  }

  private readDataFromArgs(args: AuditQueryParams['args']) {
    if (!args || !this.isPlainObject(args)) {
      return null;
    }
    if (this.isPlainObject(args.data)) {
      return args.data as Record<string, unknown>;
    }
    return null;
  }

  private withTenantWhere(where: Record<string, unknown>, tenantId: string) {
    if (!tenantId) {
      return where;
    }
    if (where.tenant_Id) {
      return where;
    }
    return {
      AND: [where, { tenant_Id: tenantId }]
    };
  }

  private toDelegateName(model: string) {
    return model.charAt(0).toLowerCase() + model.slice(1);
  }

  private toNullableJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return Prisma.JsonNull;
    }

    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }

  private async runAuditBypass<T>(callback: () => Promise<T>) {
    return this.auditBypassContext.run(true, callback);
  }

  private shouldSkipConnect(): boolean {
    const rawFlag = this.config.get<string>('PRISMA_SKIP_CONNECT');
    if (!rawFlag) {
      return false;
    }

    const normalizedFlag = rawFlag.trim().toLowerCase();
    return normalizedFlag === '1' || normalizedFlag === 'true' || normalizedFlag === 'yes';
  }
}
