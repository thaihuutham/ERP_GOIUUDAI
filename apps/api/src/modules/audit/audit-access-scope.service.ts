import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

type AccessScope = 'company' | 'branch' | 'department';

type AuthSnapshot = {
  userId: string;
  role: string;
  employeeId: string;
};

type AuditViewPolicy = {
  enabled: boolean;
  denyIfUngroupedManager: boolean;
  groups: {
    DIRECTOR: { enabled: boolean };
    BRANCH_MANAGER: { enabled: boolean };
    DEPARTMENT_MANAGER: { enabled: boolean };
  };
};

export type AuditAccessScopeResult = {
  accessScope: AccessScope;
  allowedActorIds: string[] | null;
  managedOrgUnitIds: string[];
};

@Injectable()
export class AuditAccessScopeService {
  constructor(
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  async resolveCurrentUserScope(): Promise<AuditAccessScopeResult> {
    const auth = this.readAuthSnapshot();
    if (!auth.userId || !auth.role) {
      // Compatibility for AUTH disabled / no identity context.
      return {
        accessScope: 'company',
        allowedActorIds: null,
        managedOrgUnitIds: []
      };
    }

    if (auth.role === UserRole.ADMIN) {
      return {
        accessScope: 'company',
        allowedActorIds: null,
        managedOrgUnitIds: []
      };
    }

    if (auth.role !== UserRole.MANAGER) {
      throw new ForbiddenException('Bạn không có quyền xem audit log.');
    }

    const accessSecurity = await this.runtimeSettings.getAccessSecurityRuntime();
    const policy = this.normalizeAuditViewPolicy(accessSecurity.auditViewPolicy);
    if (!policy.enabled) {
      return {
        accessScope: 'company',
        allowedActorIds: null,
        managedOrgUnitIds: []
      };
    }

    const employeeId = await this.resolveEmployeeId(auth);
    if (!employeeId) {
      if (policy.denyIfUngroupedManager) {
        throw new ForbiddenException('Tài khoản MANAGER chưa được gán nhóm quản lý để xem audit log.');
      }
      return {
        accessScope: 'company',
        allowedActorIds: null,
        managedOrgUnitIds: []
      };
    }

    const managedUnits = await this.prisma.client.orgUnit.findMany({
      where: {
        managerEmployeeId: employeeId
      },
      select: {
        id: true,
        type: true
      }
    });

    const managesCompany = managedUnits.some(
      (unit) => unit.type === 'COMPANY' && policy.groups.DIRECTOR.enabled
    );
    if (managesCompany) {
      return {
        accessScope: 'company',
        allowedActorIds: null,
        managedOrgUnitIds: managedUnits.map((item) => item.id)
      };
    }

    const branchRoots = managedUnits
      .filter((unit) => unit.type === 'BRANCH' && policy.groups.BRANCH_MANAGER.enabled)
      .map((unit) => unit.id);
    const departmentRoots = managedUnits
      .filter((unit) => unit.type === 'DEPARTMENT' && policy.groups.DEPARTMENT_MANAGER.enabled)
      .map((unit) => unit.id);
    const hasBranchScope = branchRoots.length > 0;

    const rootIds = Array.from(new Set([...branchRoots, ...departmentRoots]));
    if (rootIds.length === 0) {
      if (policy.denyIfUngroupedManager) {
        throw new ForbiddenException('Nhóm quản lý hiện tại không được bật quyền xem audit log.');
      }
      return {
        accessScope: 'company',
        allowedActorIds: null,
        managedOrgUnitIds: []
      };
    }

    const allUnits = await this.prisma.client.orgUnit.findMany({
      select: {
        id: true,
        parentId: true
      }
    });
    const scopedOrgUnitIds = this.collectScopeOrgUnitIds(rootIds, allUnits);

    const employees = await this.prisma.client.employee.findMany({
      where: {
        orgUnitId: {
          in: scopedOrgUnitIds
        }
      },
      select: {
        id: true
      }
    });
    const employeeIds = employees.map((item) => item.id);

    const users = employeeIds.length > 0
      ? await this.prisma.client.user.findMany({
          where: {
            employeeId: {
              in: employeeIds
            }
          },
          select: {
            id: true
          }
        })
      : [];

    const allowedActorIds = Array.from(new Set(users.map((item) => this.cleanString(item.id)).filter(Boolean)));

    return {
      accessScope: hasBranchScope ? 'branch' : 'department',
      allowedActorIds,
      managedOrgUnitIds: scopedOrgUnitIds
    };
  }

  private readAuthSnapshot(): AuthSnapshot {
    const auth = this.ensureRecord(this.cls.get(AUTH_USER_CONTEXT_KEY));
    return {
      userId: this.cleanString(auth.userId ?? auth.sub),
      role: this.cleanString(auth.role).toUpperCase(),
      employeeId: this.cleanString(auth.employeeId)
    };
  }

  private async resolveEmployeeId(auth: AuthSnapshot) {
    if (auth.employeeId) {
      return auth.employeeId;
    }
    if (!auth.userId) {
      return '';
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: auth.userId },
      select: { employeeId: true }
    });
    return this.cleanString(user?.employeeId);
  }

  private normalizeAuditViewPolicy(value: unknown): AuditViewPolicy {
    const source = this.ensureRecord(value);
    const groups = this.ensureRecord(source.groups);
    const director = this.ensureRecord(groups.DIRECTOR);
    const branchManager = this.ensureRecord(groups.BRANCH_MANAGER);
    const departmentManager = this.ensureRecord(groups.DEPARTMENT_MANAGER);

    return {
      enabled: this.toBool(source.enabled, true),
      denyIfUngroupedManager: this.toBool(source.denyIfUngroupedManager, true),
      groups: {
        DIRECTOR: { enabled: this.toBool(director.enabled, true) },
        BRANCH_MANAGER: { enabled: this.toBool(branchManager.enabled, true) },
        DEPARTMENT_MANAGER: { enabled: this.toBool(departmentManager.enabled, true) }
      }
    };
  }

  private collectScopeOrgUnitIds(
    rootIds: string[],
    rows: Array<{ id: string; parentId: string | null }>
  ) {
    const byParent = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.parentId) {
        continue;
      }
      if (!byParent.has(row.parentId)) {
        byParent.set(row.parentId, []);
      }
      byParent.get(row.parentId)?.push(row.id);
    }

    const visited = new Set<string>(rootIds);
    const queue = [...rootIds];

    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const childId of byParent.get(current) ?? []) {
        if (visited.has(childId)) {
          continue;
        }
        visited.add(childId);
        queue.push(childId);
      }
    }

    return Array.from(visited);
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
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return fallback;
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }
}
