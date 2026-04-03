import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditAccessScopeService } from '../src/modules/audit/audit-access-scope.service';

function makePolicy(overrides?: Record<string, unknown>) {
  return {
    enabled: true,
    denyIfUngroupedManager: true,
    groups: {
      DIRECTOR: { enabled: true },
      BRANCH_MANAGER: { enabled: true },
      DEPARTMENT_MANAGER: { enabled: true }
    },
    ...(overrides ?? {})
  };
}

function makeMocks() {
  const cls = {
    get: vi.fn()
  };

  const prisma = {
    client: {
      user: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      },
      orgUnit: {
        findMany: vi.fn()
      },
      employee: {
        findMany: vi.fn()
      }
    }
  };

  const runtimeSettings = {
    getAccessSecurityRuntime: vi.fn().mockResolvedValue({
      auditViewPolicy: makePolicy()
    })
  };

  return { cls, prisma, runtimeSettings };
}

describe('AuditAccessScopeService', () => {
  let cls: ReturnType<typeof makeMocks>['cls'];
  let prisma: ReturnType<typeof makeMocks>['prisma'];
  let runtimeSettings: ReturnType<typeof makeMocks>['runtimeSettings'];
  let service: AuditAccessScopeService;

  beforeEach(() => {
    ({ cls, prisma, runtimeSettings } = makeMocks());
    service = new AuditAccessScopeService(cls as any, prisma as any, runtimeSettings as any);
  });

  it('returns company scope for ADMIN regardless of manager mapping', async () => {
    cls.get.mockReturnValue({
      userId: 'admin_1',
      role: 'ADMIN'
    });

    const result = await service.resolveCurrentUserScope();
    expect(result).toEqual({
      accessScope: 'company',
      allowedActorIds: null,
      managedOrgUnitIds: []
    });
  });

  it('returns company scope for director when managing COMPANY org unit', async () => {
    cls.get.mockReturnValue({
      userId: 'user_director',
      role: 'MANAGER',
      employeeId: 'emp_director'
    });

    prisma.client.orgUnit.findMany.mockResolvedValueOnce([
      { id: 'ou_company', type: 'COMPANY' }
    ]);

    const result = await service.resolveCurrentUserScope();
    expect(result.accessScope).toBe('company');
    expect(result.allowedActorIds).toBeNull();
    expect(result.managedOrgUnitIds).toEqual(['ou_company']);
  });

  it('returns branch scope with descendants for branch manager', async () => {
    cls.get.mockReturnValue({
      userId: 'user_branch_manager',
      role: 'MANAGER',
      employeeId: 'emp_branch_manager'
    });

    prisma.client.orgUnit.findMany
      .mockResolvedValueOnce([{ id: 'ou_branch_1', type: 'BRANCH' }])
      .mockResolvedValueOnce([
        { id: 'ou_company', parentId: null },
        { id: 'ou_branch_1', parentId: 'ou_company' },
        { id: 'ou_dept_1', parentId: 'ou_branch_1' },
        { id: 'ou_team_1', parentId: 'ou_dept_1' },
        { id: 'ou_branch_2', parentId: 'ou_company' }
      ]);

    prisma.client.employee.findMany.mockResolvedValue([
      { id: 'emp_a' },
      { id: 'emp_b' }
    ]);
    prisma.client.user.findMany.mockResolvedValue([
      { id: 'user_a' },
      { id: 'user_b' }
    ]);

    const result = await service.resolveCurrentUserScope();

    expect(result.accessScope).toBe('branch');
    expect(result.managedOrgUnitIds).toEqual(['ou_branch_1', 'ou_dept_1', 'ou_team_1']);
    expect(result.allowedActorIds).toEqual(['user_a', 'user_b']);
  });

  it('denies manager when ungrouped and denyIfUngroupedManager is enabled', async () => {
    cls.get.mockReturnValue({
      userId: 'user_manager',
      role: 'MANAGER',
      employeeId: 'emp_manager'
    });

    prisma.client.orgUnit.findMany.mockResolvedValue([]);

    await expect(service.resolveCurrentUserScope()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies branch manager when BRANCH_MANAGER group is disabled', async () => {
    cls.get.mockReturnValue({
      userId: 'user_branch_manager',
      role: 'MANAGER',
      employeeId: 'emp_branch_manager'
    });
    runtimeSettings.getAccessSecurityRuntime.mockResolvedValue({
      auditViewPolicy: makePolicy({
        groups: {
          DIRECTOR: { enabled: true },
          BRANCH_MANAGER: { enabled: false },
          DEPARTMENT_MANAGER: { enabled: true }
        }
      })
    });
    prisma.client.orgUnit.findMany.mockResolvedValueOnce([{ id: 'ou_branch_1', type: 'BRANCH' }]);

    await expect(service.resolveCurrentUserScope()).rejects.toBeInstanceOf(ForbiddenException);
  });
});
