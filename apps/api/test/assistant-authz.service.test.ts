import { describe, expect, it, vi } from 'vitest';
import { PermissionAction, PermissionEffect, UserRole } from '@prisma/client';
import { AssistantAuthzService } from '../src/modules/assistant/assistant-authz.service';
import { AUTH_USER_CONTEXT_KEY, REQUEST_ID_CONTEXT_KEY } from '../src/common/request/request.constants';
import { TENANT_CONTEXT_KEY } from '../src/common/tenant/tenant.constants';

function makeRuntimeSettingsMock(overrides?: Partial<Record<string, unknown>>) {
  return {
    getAccessSecurityRuntime: vi.fn().mockResolvedValue({
      permissionPolicy: {
        enabled: true,
        superAdminIds: [],
        superAdminEmails: []
      },
      assistantAccessPolicy: {
        enabled: true,
        roleScopeDefaults: {
          ADMIN: 'company',
          USER: 'self'
        },
        enforcePermissionEngine: true,
        denyIfNoScope: true,
        allowedModules: ['sales', 'finance', 'hr', 'workflows', 'crm', 'reports'],
        chatChannelScopeEnforced: true
      },
      ...(overrides ?? {})
    })
  };
}

function makeClsMock(authUser: Record<string, unknown>) {
  return {
    get: vi.fn((key: string) => {
      if (key === AUTH_USER_CONTEXT_KEY) {
        return authUser;
      }
      if (key === TENANT_CONTEXT_KEY) {
        return 'GOIUUDAI';
      }
      if (key === REQUEST_ID_CONTEXT_KEY) {
        return 'req_assistant_authz_test';
      }
      return undefined;
    })
  };
}

function makePrismaMock(options?: {
  managedUnits?: Array<{ id: string; type: string }>;
  orgUnits?: Array<{ id: string; parentId: string | null }>;
  employeesByScope?: Array<{ id: string }>;
  usersByEmployees?: Array<{ id: string }>;
  positionRules?: Array<{ moduleKey: string; action: PermissionAction; effect: PermissionEffect }>;
  userOverrides?: Array<{ moduleKey: string; action: PermissionAction; effect: PermissionEffect }>;
  userEmployeeId?: string | null;
  employeePositionId?: string | null;
}) {
  const managedUnits = options?.managedUnits ?? [];
  const orgUnits = options?.orgUnits ?? [];
  const employeesByScope = options?.employeesByScope ?? [];
  const usersByEmployees = options?.usersByEmployees ?? [];
  const positionRules = options?.positionRules ?? [];
  const userOverrides = options?.userOverrides ?? [];

  return {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      positionPermissionRule: {
        findMany: vi.fn().mockResolvedValue(positionRules)
      },
      userPermissionOverride: {
        findMany: vi.fn().mockResolvedValue(userOverrides)
      },
      orgUnit: {
        findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
          if (args?.where && 'managerEmployeeId' in args.where) {
            return managedUnits;
          }
          return orgUnits;
        })
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue({
          positionId: options?.employeePositionId ?? null
        }),
        findMany: vi.fn().mockResolvedValue(employeesByScope)
      },
      user: {
        findFirst: vi.fn().mockResolvedValue({
          employeeId: options?.userEmployeeId ?? null
        }),
        findMany: vi.fn().mockResolvedValue(usersByEmployees)
      },
      userPositionAssignment: {
        findMany: vi.fn().mockResolvedValue([])
      },
      assistantAccessDecisionLog: {
        create: vi.fn().mockResolvedValue({ id: 'log_1' })
      }
    }
  };
}

describe('AssistantAuthzService', () => {
  it('resolves ADMIN as company scope with all actions', async () => {
    const cls = makeClsMock({
      userId: 'u_admin',
      email: 'admin@erp.local',
      role: UserRole.ADMIN,
      employeeId: 'e_admin',
      positionId: 'p_admin'
    });
    const prisma = makePrismaMock();
    const runtime = makeRuntimeSettingsMock();

    const service = new AssistantAuthzService(cls as any, prisma as any, runtime as any);
    const access = await service.resolveCurrentAccess();

    expect(access.scope.type).toBe('company');
    expect(access.allowedModules.length).toBeGreaterThan(0);
    expect(access.moduleActions.sales).toContain(PermissionAction.VIEW);
    expect(prisma.client.assistantAccessDecisionLog.create).toHaveBeenCalledTimes(1);
  });

  it('denies USER when permission engine is enforced without explicit ALLOW rule', async () => {
    const cls = makeClsMock({
      userId: 'u_user',
      email: 'user@erp.local',
      role: UserRole.USER,
      employeeId: 'e_user',
      positionId: 'p_user'
    });
    const prisma = makePrismaMock({
      positionRules: [],
      userOverrides: []
    });
    const runtime = makeRuntimeSettingsMock();

    const service = new AssistantAuthzService(cls as any, prisma as any, runtime as any);

    await expect(service.resolveCurrentAccess()).rejects.toThrow('không có quyền VIEW');
    expect(prisma.client.assistantAccessDecisionLog.create).toHaveBeenCalled();
  });

  it('resolves USER allowed modules from explicit position rules', async () => {
    const cls = makeClsMock({
      userId: 'u_user',
      email: 'user@erp.local',
      role: UserRole.USER,
      employeeId: 'e_user',
      positionId: 'p_user'
    });
    const prisma = makePrismaMock({
      positionRules: [
        { moduleKey: 'sales', action: PermissionAction.VIEW, effect: PermissionEffect.ALLOW },
        { moduleKey: 'sales', action: PermissionAction.CREATE, effect: PermissionEffect.ALLOW },
        { moduleKey: 'finance', action: PermissionAction.VIEW, effect: PermissionEffect.DENY }
      ]
    });
    const runtime = makeRuntimeSettingsMock();

    const service = new AssistantAuthzService(cls as any, prisma as any, runtime as any);
    const access = await service.resolveCurrentAccess();

    expect(access.scope.type).toBe('self');
    expect(access.allowedModules).toEqual(['sales']);
    expect(access.moduleActions.sales).toContain(PermissionAction.CREATE);
    expect(access.moduleActions.finance).not.toContain(PermissionAction.VIEW);
  });

  it('denies USER when denyIfNoScope=true and user has no scope', async () => {
    const cls = makeClsMock({
      userId: 'u_user',
      email: 'user@erp.local',
      role: UserRole.USER,
      employeeId: '',
      positionId: 'p_user'
    });
    const prisma = makePrismaMock({
      userEmployeeId: null,
      managedUnits: []
    });
    const runtime = makeRuntimeSettingsMock();

    const service = new AssistantAuthzService(cls as any, prisma as any, runtime as any);
    await expect(service.resolveCurrentAccess()).rejects.toThrow('không có quyền VIEW');
  });

  it('resolves USER branch scope from org tree', async () => {
    const cls = makeClsMock({
      userId: 'u_user',
      email: 'user@erp.local',
      role: UserRole.USER,
      employeeId: 'e_user',
      positionId: 'p_user'
    });
    const prisma = makePrismaMock({
      managedUnits: [
        { id: 'branch_1', type: 'BRANCH' }
      ],
      orgUnits: [
        { id: 'branch_1', parentId: null },
        { id: 'department_1', parentId: 'branch_1' }
      ],
      employeesByScope: [
        { id: 'e_01' },
        { id: 'e_02' }
      ],
      usersByEmployees: [
        { id: 'u_01' },
        { id: 'u_02' }
      ]
    });
    const runtime = makeRuntimeSettingsMock({
      assistantAccessPolicy: {
        enabled: true,
        roleScopeDefaults: {
          ADMIN: 'company',
          USER: 'branch'
        },
        enforcePermissionEngine: false,
        denyIfNoScope: true,
        allowedModules: ['sales', 'crm'],
        chatChannelScopeEnforced: true
      }
    });

    const service = new AssistantAuthzService(cls as any, prisma as any, runtime as any);
    const access = await service.resolveCurrentAccess();

    expect(access.scope.type).toBe('branch');
    expect(access.scope.orgUnitIds).toEqual(expect.arrayContaining(['branch_1', 'department_1']));
    expect(access.scope.actorIds).toEqual(expect.arrayContaining(['u_01', 'u_02']));
  });

  it('falls back to company scope for synthetic dev USER without employee mapping', async () => {
    const cls = makeClsMock({
      userId: 'dev_user',
      email: 'user@local.erp',
      role: UserRole.USER,
      employeeId: '',
      positionId: ''
    });
    const prisma = makePrismaMock({
      userEmployeeId: null,
      managedUnits: []
    });
    const runtime = makeRuntimeSettingsMock({
      assistantAccessPolicy: {
        enabled: true,
        roleScopeDefaults: {
          ADMIN: 'company',
          USER: 'department'
        },
        enforcePermissionEngine: false,
        denyIfNoScope: true,
        allowedModules: ['sales', 'crm'],
        chatChannelScopeEnforced: true
      }
    });

    const service = new AssistantAuthzService(cls as any, prisma as any, runtime as any);
    const access = await service.resolveCurrentAccess();

    expect(access.scope.type).toBe('company');
    expect(access.allowedModules).toEqual(expect.arrayContaining(['sales', 'crm']));
  });
});
