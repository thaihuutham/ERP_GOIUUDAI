import { Injectable } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';

type IamShadowMismatchRecord = {
  tenantId: string;
  userId: string;
  moduleKey: string;
  action: PermissionAction;
  path: string;
  legacyAllowed: boolean;
  iamAllowed: boolean;
  mode: 'SHADOW' | 'ENFORCE';
  reasonLegacy: string;
  reasonIam: string;
  recordedAt: string;
};

type IamShadowMismatchSample = {
  userId: string;
  path: string;
  mode: 'SHADOW' | 'ENFORCE';
  legacyAllowed: boolean;
  iamAllowed: boolean;
  reasonLegacy: string;
  reasonIam: string;
};

export type IamShadowMismatchReportItem = {
  moduleKey: string;
  action: PermissionAction;
  mismatchCount: number;
  legacyAllowCount: number;
  iamAllowCount: number;
  lastSeenAt: string;
  sample: IamShadowMismatchSample | null;
};

export type IamShadowMismatchReport = {
  generatedAt: string;
  tenantId: string;
  totalMismatches: number;
  totalGroups: number;
  items: IamShadowMismatchReportItem[];
};

export type IamShadowMismatchReportQuery = {
  tenantId: string;
  limit?: number;
  moduleKey?: string;
  action?: PermissionAction;
};

@Injectable()
export class IamShadowReportService {
  private readonly recordsByTenant = new Map<string, IamShadowMismatchRecord[]>();
  private readonly maxRecordsPerTenant = 1000;

  recordMismatch(payload: {
    tenantId: string;
    userId: string;
    moduleKey: string;
    action: PermissionAction;
    path: string;
    legacyAllowed: boolean;
    iamAllowed: boolean;
    mode: 'SHADOW' | 'ENFORCE';
    reasonLegacy: string;
    reasonIam: string;
  }) {
    if (payload.legacyAllowed === payload.iamAllowed) {
      return;
    }

    const tenantId = payload.tenantId.trim();
    if (!tenantId) {
      return;
    }

    const current = this.recordsByTenant.get(tenantId) ?? [];
    current.push({
      ...payload,
      tenantId,
      userId: payload.userId.trim(),
      moduleKey: payload.moduleKey.trim().toLowerCase(),
      path: payload.path.trim(),
      reasonLegacy: payload.reasonLegacy.trim(),
      reasonIam: payload.reasonIam.trim(),
      recordedAt: new Date().toISOString()
    });
    this.recordsByTenant.set(tenantId, this.trimRecords(current));
  }

  getMismatchReport(query: IamShadowMismatchReportQuery): IamShadowMismatchReport {
    const tenantId = query.tenantId.trim();
    const allRecords = this.recordsByTenant.get(tenantId) ?? [];
    const moduleFilter = (query.moduleKey ?? '').trim().toLowerCase();
    const filtered = allRecords.filter((record) => {
      if (moduleFilter && record.moduleKey !== moduleFilter) {
        return false;
      }
      if (query.action && record.action !== query.action) {
        return false;
      }
      return true;
    });

    const grouped = new Map<string, IamShadowMismatchReportItem>();
    for (const record of filtered) {
      const groupKey = `${record.moduleKey}:${record.action}`;
      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, {
          moduleKey: record.moduleKey,
          action: record.action,
          mismatchCount: 1,
          legacyAllowCount: record.legacyAllowed ? 1 : 0,
          iamAllowCount: record.iamAllowed ? 1 : 0,
          lastSeenAt: record.recordedAt,
          sample: {
            userId: record.userId,
            path: record.path,
            mode: record.mode,
            legacyAllowed: record.legacyAllowed,
            iamAllowed: record.iamAllowed,
            reasonLegacy: record.reasonLegacy,
            reasonIam: record.reasonIam
          }
        });
        continue;
      }

      existing.mismatchCount += 1;
      if (record.legacyAllowed) {
        existing.legacyAllowCount += 1;
      }
      if (record.iamAllowed) {
        existing.iamAllowCount += 1;
      }
      if (record.recordedAt >= existing.lastSeenAt) {
        existing.lastSeenAt = record.recordedAt;
        existing.sample = {
          userId: record.userId,
          path: record.path,
          mode: record.mode,
          legacyAllowed: record.legacyAllowed,
          iamAllowed: record.iamAllowed,
          reasonLegacy: record.reasonLegacy,
          reasonIam: record.reasonIam
        };
      }
    }

    const limit = this.clampLimit(query.limit);
    const items = Array.from(grouped.values())
      .sort(
        (a, b) =>
          b.mismatchCount - a.mismatchCount ||
          b.lastSeenAt.localeCompare(a.lastSeenAt) ||
          a.moduleKey.localeCompare(b.moduleKey) ||
          a.action.localeCompare(b.action)
      )
      .slice(0, limit);

    return {
      generatedAt: new Date().toISOString(),
      tenantId,
      totalMismatches: filtered.length,
      totalGroups: grouped.size,
      items
    };
  }

  private trimRecords(records: IamShadowMismatchRecord[]) {
    if (records.length <= this.maxRecordsPerTenant) {
      return records;
    }
    return records.slice(records.length - this.maxRecordsPerTenant);
  }

  private clampLimit(value: number | undefined) {
    if (!value || !Number.isFinite(value)) {
      return 50;
    }
    return Math.min(200, Math.max(1, Math.floor(value)));
  }
}
