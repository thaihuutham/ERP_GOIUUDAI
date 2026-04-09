import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { IamActorContext, IamEffectiveScope, IamScopeAccess, IamScopeMode } from './iam.types';

@Injectable()
export class IamScopeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolveScopeAccess(actor: IamActorContext): Promise<IamScopeAccess> {
    const tenantId = this.cleanString(actor.tenantId);
    const userId = this.cleanString(actor.userId);
    if (!tenantId || !userId) {
      return {
        mode: 'SELF',
        source: 'default',
        companyWide: false,
        actorIds: userId ? [userId] : [],
        employeeIds: [],
        orgUnitIds: []
      };
    }

    const role = this.cleanString(actor.role).toUpperCase();
    if (role === 'ADMIN') {
      return {
        mode: 'UNIT_FULL',
        source: 'default',
        companyWide: true,
        actorIds: [userId],
        employeeIds: [],
        orgUnitIds: []
      };
    }

    const scope = await this.resolveEffectiveScope(actor);
    const employee = await this.resolveActorEmployee(tenantId, actor);
    const actorEmployeeId = this.cleanString(employee?.id);
    const actorOrgUnitId = this.cleanString(employee?.orgUnitId);

    if (scope.mode === 'SELF') {
      return {
        mode: scope.mode,
        source: scope.source,
        companyWide: false,
        actorIds: [userId],
        employeeIds: actorEmployeeId ? [actorEmployeeId] : [],
        orgUnitIds: actorOrgUnitId ? [actorOrgUnitId] : []
      };
    }

    if (scope.mode === 'UNIT_FULL') {
      const rootOrgUnitId = this.cleanString(scope.rootOrgUnitId) || actorOrgUnitId;
      if (!rootOrgUnitId) {
        return {
          mode: 'SELF',
          source: 'default',
          companyWide: false,
          actorIds: [userId],
          employeeIds: actorEmployeeId ? [actorEmployeeId] : [],
          orgUnitIds: actorOrgUnitId ? [actorOrgUnitId] : []
        };
      }

      const orgUnitIds = await this.collectDescendantOrgUnitIds(tenantId, [rootOrgUnitId]);
      const employees = await this.prisma.client.employee.findMany({
        where: {
          tenant_Id: tenantId,
          orgUnitId: { in: orgUnitIds }
        },
        select: { id: true }
      });

      return {
        mode: scope.mode,
        source: scope.source,
        companyWide: false,
        actorIds: [userId],
        employeeIds: this.uniqueStrings(employees.map((item) => this.cleanString(item.id))),
        orgUnitIds
      };
    }

    const managedEmployeeIds = actorEmployeeId
      ? await this.collectManagedEmployeeIds(tenantId, actorEmployeeId)
      : [];
    const employeeIds = this.uniqueStrings([actorEmployeeId, ...managedEmployeeIds]);
    const scopedEmployees = employeeIds.length > 0
      ? await this.prisma.client.employee.findMany({
          where: {
            tenant_Id: tenantId,
            id: {
              in: employeeIds
            }
          },
          select: {
            orgUnitId: true
          }
        })
      : [];
    const orgUnitIds = this.uniqueStrings(scopedEmployees.map((item) => this.cleanString(item.orgUnitId)));

    return {
      mode: scope.mode,
      source: scope.source,
      companyWide: false,
      actorIds: [userId],
      employeeIds,
      orgUnitIds
    };
  }

  async resolveEffectiveScope(actor: IamActorContext): Promise<IamEffectiveScope> {
    const tenantId = this.cleanString(actor.tenantId);
    const userId = this.cleanString(actor.userId);
    if (!tenantId || !userId) {
      return {
        mode: 'SELF',
        rootOrgUnitId: null,
        source: 'default'
      };
    }

    const activeOverride = await this.findActiveOverride(tenantId, userId);
    if (activeOverride) {
      return {
        mode: activeOverride.scopeMode,
        rootOrgUnitId: this.cleanString(activeOverride.rootOrgUnitId) || null,
        source: 'override'
      };
    }

    const title = await this.resolvePositionTitle(tenantId, actor);
    const mapped = this.resolveModeFromTitle(title);
    if (mapped) {
      return {
        mode: mapped,
        rootOrgUnitId: null,
        source: 'title'
      };
    }

    return {
      mode: 'SELF',
      rootOrgUnitId: null,
      source: 'default'
    };
  }

  private async findActiveOverride(tenantId: string, userId: string) {
    const now = new Date();
    const overrides = await this.prisma.client.iamUserScopeOverride.findMany({
      where: {
        tenant_Id: tenantId,
        userId
      },
      orderBy: [
        {
          effectiveFrom: 'desc'
        },
        {
          updatedAt: 'desc'
        }
      ],
      take: 10
    });

    return overrides.find((item) => {
      if (item.effectiveFrom && item.effectiveFrom > now) {
        return false;
      }
      if (item.effectiveTo && item.effectiveTo < now) {
        return false;
      }
      return true;
    });
  }

  private async resolvePositionTitle(tenantId: string, actor: IamActorContext) {
    const actorPositionIds = this.uniqueStrings([
      this.cleanString(actor.positionId),
      ...this.toStringArray(actor.positionIds)
    ]);
    let positionId = actorPositionIds[0] ?? '';

    if (!positionId) {
      const employeeId = this.cleanString(actor.employeeId);
      if (employeeId) {
        const employee = await this.prisma.client.employee.findFirst({
          where: {
            tenant_Id: tenantId,
            id: employeeId
          },
          select: {
            positionId: true
          }
        });
        positionId = this.cleanString(employee?.positionId);
      }
    }

    if (!positionId) {
      return '';
    }

    const position = await this.prisma.client.position.findFirst({
      where: {
        tenant_Id: tenantId,
        id: positionId
      },
      select: {
        title: true
      }
    });

    return this.cleanString(position?.title);
  }

  private async resolveActorEmployee(tenantId: string, actor: IamActorContext) {
    const employeeId = this.cleanString(actor.employeeId);
    if (employeeId) {
      return this.prisma.client.employee.findFirst({
        where: {
          tenant_Id: tenantId,
          id: employeeId
        },
        select: {
          id: true,
          orgUnitId: true
        }
      });
    }

    const userId = this.cleanString(actor.userId);
    if (!userId) {
      return null;
    }

    const user = await this.prisma.client.user.findFirst({
      where: {
        tenant_Id: tenantId,
        id: userId
      },
      select: {
        employeeId: true
      }
    });

    const linkedEmployeeId = this.cleanString(user?.employeeId);
    if (!linkedEmployeeId) {
      return null;
    }

    return this.prisma.client.employee.findFirst({
      where: {
        tenant_Id: tenantId,
        id: linkedEmployeeId
      },
      select: {
        id: true,
        orgUnitId: true
      }
    });
  }

  private async collectDescendantOrgUnitIds(tenantId: string, roots: string[]) {
    const rootIds = this.uniqueStrings(roots);
    if (rootIds.length === 0) {
      return [];
    }

    const allUnits = await this.prisma.client.orgUnit.findMany({
      where: {
        tenant_Id: tenantId
      },
      select: {
        id: true,
        parentId: true
      }
    });

    const byParent = new Map<string, string[]>();
    for (const unit of allUnits) {
      const parentId = this.cleanString(unit.parentId);
      if (!parentId) {
        continue;
      }
      if (!byParent.has(parentId)) {
        byParent.set(parentId, []);
      }
      byParent.get(parentId)?.push(this.cleanString(unit.id));
    }

    const visited = new Set<string>(rootIds);
    const queue = [...rootIds];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      const children = byParent.get(current) ?? [];
      for (const child of children) {
        if (visited.has(child)) {
          continue;
        }
        visited.add(child);
        queue.push(child);
      }
    }

    return Array.from(visited);
  }

  private async collectManagedEmployeeIds(tenantId: string, managerId: string) {
    const allEmployees = await this.prisma.client.employee.findMany({
      where: {
        tenant_Id: tenantId
      },
      select: {
        id: true,
        managerId: true
      }
    });

    const byManager = new Map<string, string[]>();
    for (const employee of allEmployees) {
      const employeeManagerId = this.cleanString(employee.managerId);
      if (!employeeManagerId) {
        continue;
      }
      if (!byManager.has(employeeManagerId)) {
        byManager.set(employeeManagerId, []);
      }
      byManager.get(employeeManagerId)?.push(this.cleanString(employee.id));
    }

    const visited = new Set<string>();
    const queue = [...(byManager.get(managerId) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      const children = byManager.get(current) ?? [];
      for (const child of children) {
        if (!visited.has(child)) {
          queue.push(child);
        }
      }
    }

    return Array.from(visited);
  }

  private uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map((item) => this.cleanString(item)).filter(Boolean)));
  }

  private resolveModeFromTitle(titleRaw: string): IamScopeMode | null {
    const title = this.normalizeTitle(titleRaw);
    if (!title) {
      return null;
    }

    if (
      title.includes('truong phong') ||
      title.includes('giam doc') ||
      title.includes('head of')
    ) {
      return 'UNIT_FULL';
    }

    if (
      title.includes('pho phong') ||
      title.includes('pho giam doc') ||
      title.includes('vice') ||
      title.includes('deputy')
    ) {
      return 'SUBTREE';
    }

    return null;
  }

  private normalizeTitle(value: string) {
    return this.cleanString(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => this.cleanString(item)).filter(Boolean);
  }
}
