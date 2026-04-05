import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { IAM_SCOPE_CONTEXT_KEY } from '../../common/request/request.constants';

export type IamScopeFilterResult = {
  enabled: boolean;
  mode: 'COMPANY' | 'LIMITED';
  companyWide: boolean;
  actorIds: string[];
  employeeIds: string[];
  orgUnitIds: string[];
};

@Injectable()
export class IamScopeFilterService {
  constructor(@Inject(ClsService) private readonly cls: ClsService) {}

  async resolveForCurrentActor(_moduleKeyRaw: string): Promise<IamScopeFilterResult> {
    const scope = this.ensureRecord(this.cls.get(IAM_SCOPE_CONTEXT_KEY));
    const enabled = this.toBool(scope.enabled, false);
    const mode = this.cleanString(scope.mode).toUpperCase();
    const companyWide = this.toBool(scope.companyWide, false);

    if (!enabled || mode !== 'ENFORCE') {
      return this.companyWideScope(false);
    }

    if (companyWide) {
      return this.companyWideScope(true);
    }

    const actorIds = this.toStringArray(scope.actorIds);
    const employeeIds = this.toStringArray(scope.employeeIds);
    const orgUnitIds = this.toStringArray(scope.orgUnitIds);

    return {
      enabled: true,
      mode: 'LIMITED',
      companyWide: false,
      actorIds,
      employeeIds,
      orgUnitIds
    };
  }

  private companyWideScope(enabled: boolean): IamScopeFilterResult {
    return {
      enabled,
      mode: 'COMPANY',
      companyWide: true,
      actorIds: [],
      employeeIds: [],
      orgUnitIds: []
    };
  }

  private ensureRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private toBool(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = this.cleanString(value).toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
    return fallback;
  }

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    const unique = new Set<string>();
    for (const item of value) {
      const normalized = this.cleanString(item);
      if (normalized) {
        unique.add(normalized);
      }
    }
    return Array.from(unique.values());
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }
}
