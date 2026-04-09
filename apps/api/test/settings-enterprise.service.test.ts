import { BadRequestException } from '@nestjs/common';
import { PermissionAction, PermissionEffect, UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_USER_CONTEXT_KEY } from '../src/common/request/request.constants';
import { SettingsEnterpriseService } from '../src/modules/settings/settings-enterprise.service';

describe('SettingsEnterpriseService org hierarchy rules', () => {
  const service = new SettingsEnterpriseService({} as any, {} as any);

  it('allows valid parent-child hierarchy', () => {
    expect(() => (service as any).assertOrgHierarchy('COMPANY', null)).not.toThrow();
    expect(() => (service as any).assertOrgHierarchy('BRANCH', 'COMPANY')).not.toThrow();
    expect(() => (service as any).assertOrgHierarchy('DEPARTMENT', 'BRANCH')).not.toThrow();
    expect(() => (service as any).assertOrgHierarchy('TEAM', 'DEPARTMENT')).not.toThrow();
  });

  it('rejects invalid parent-child hierarchy', () => {
    expect(() => (service as any).assertOrgHierarchy('TEAM', 'BRANCH')).toThrow(BadRequestException);
    expect(() => (service as any).assertOrgHierarchy('DEPARTMENT', 'COMPANY')).toThrow(BadRequestException);
    expect(() => (service as any).assertOrgHierarchy('COMPANY', 'BRANCH')).toThrow(BadRequestException);
  });
});

function makePrismaForOverrides() {
  const userFindFirst = vi.fn();
  const overrideFindMany = vi.fn().mockResolvedValue([]);
  const overrideDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const overrideCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const transaction = vi.fn(async (handler: (tx: any) => Promise<void>) => {
    await handler({
      userPermissionOverride: {
        deleteMany: overrideDeleteMany,
        createMany: overrideCreateMany
      }
    });
  });

  return {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      user: {
        findFirst: userFindFirst
      },
      userPermissionOverride: {
        findMany: overrideFindMany,
        deleteMany: overrideDeleteMany,
        createMany: overrideCreateMany
      },
      $transaction: transaction
    }
  };
}

function makeCls(authUser: Record<string, unknown>) {
  return {
    get: vi.fn((key: string) => {
      if (key === AUTH_USER_CONTEXT_KEY) {
        return authUser;
      }
      return undefined;
    })
  };
}

function makePrismaForScopeApis() {
  const userFindFirst = vi.fn();
  const orgUnitFindFirst = vi.fn();
  const scopeOverrideFindFirst = vi.fn();
  const scopeOverrideCreate = vi.fn().mockResolvedValue(undefined);
  const scopeOverrideUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const settingFindFirst = vi.fn();
  const settingUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const settingCreate = vi.fn().mockResolvedValue(undefined);

  return {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      user: {
        findFirst: userFindFirst
      },
      orgUnit: {
        findFirst: orgUnitFindFirst
      },
      iamUserScopeOverride: {
        findFirst: scopeOverrideFindFirst,
        create: scopeOverrideCreate,
        updateMany: scopeOverrideUpdateMany
      },
      setting: {
        findFirst: settingFindFirst,
        updateMany: settingUpdateMany,
        create: settingCreate
      }
    }
  };
}

describe('SettingsEnterpriseService permission override guardrails', () => {
  it('prevents non-admin from modifying ADMIN core rights', async () => {
    const prisma = makePrismaForOverrides();
    prisma.client.user.findFirst.mockResolvedValue({
      id: 'admin_user_1',
      role: UserRole.ADMIN
    });

    const cls = makeCls({
      userId: 'manager_1',
      role: UserRole.USER,
      email: 'manager@example.com'
    });
    const service = new SettingsEnterpriseService(prisma as any, cls as any);

    await expect(
      service.putUserPermissionOverrides('admin_user_1', {
        reason: 'update overrides',
        rules: [
          {
            moduleKey: 'crm',
            action: 'VIEW',
            effect: 'DENY'
          }
        ]
      })
    ).rejects.toThrow('Không thể thay đổi quyền lõi của ADMIN.');
  });

  it('prevents actor self-elevation via allow override rules', async () => {
    const prisma = makePrismaForOverrides();
    prisma.client.user.findFirst.mockResolvedValue({
      id: 'manager_1',
      role: UserRole.USER
    });

    const cls = makeCls({
      userId: 'manager_1',
      role: UserRole.USER,
      email: 'manager@example.com'
    });
    const service = new SettingsEnterpriseService(prisma as any, cls as any);

    await expect(
      service.putUserPermissionOverrides('manager_1', {
        reason: 'self grant',
        rules: [
          {
            moduleKey: 'settings',
            action: PermissionAction.UPDATE,
            effect: PermissionEffect.ALLOW
          }
        ]
      })
    ).rejects.toThrow('Không thể tự nâng quyền cho chính mình.');
  });
});

describe('SettingsEnterpriseService IAM scope admin APIs', () => {
  it('updates user scope override and returns effective scope', async () => {
    const prisma = makePrismaForScopeApis();
    prisma.client.user.findFirst.mockResolvedValue({
      id: 'user_scope_1',
      role: UserRole.USER
    });
    prisma.client.orgUnit.findFirst.mockResolvedValue({
      id: 'org_1',
      type: 'DEPARTMENT'
    });
    prisma.client.iamUserScopeOverride.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'scope_1',
        userId: 'user_scope_1',
        scopeMode: 'UNIT_FULL',
        rootOrgUnitId: 'org_1',
        effectiveFrom: null,
        effectiveTo: null,
        reason: 'manual override'
      });

    const cls = makeCls({
      userId: 'admin_1',
      role: UserRole.ADMIN,
      email: 'admin@example.com'
    });
    const service = new SettingsEnterpriseService(prisma as any, cls as any);

    const result = await service.updateUserScopeOverride('user_scope_1', {
      scopeMode: 'UNIT_FULL',
      rootOrgUnitId: 'org_1',
      reason: 'manual override'
    });

    expect(result.override.scopeMode).toBe('UNIT_FULL');
    expect(result.effectiveScope).toEqual({
      mode: 'UNIT_FULL',
      rootOrgUnitId: 'org_1',
      source: 'override'
    });
    expect(prisma.client.iamUserScopeOverride.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_scope_1',
          scopeMode: 'UNIT_FULL',
          rootOrgUnitId: 'org_1'
        })
      })
    );
  });

  it('updates title scope mapping defaults for scope mode', async () => {
    const prisma = makePrismaForScopeApis();
    prisma.client.setting.findFirst.mockResolvedValue({
      id: 'setting_access_security',
      settingKey: 'settings.access_security.v1',
      settingValue: {
        iamTitleScopeMappings: [
          {
            titlePattern: 'TRUONG PHONG',
            scopeMode: 'UNIT_FULL',
            isActive: true,
            priority: 100
          }
        ]
      }
    });

    const cls = makeCls({
      userId: 'admin_1',
      role: UserRole.ADMIN,
      email: 'admin@example.com'
    });
    const service = new SettingsEnterpriseService(prisma as any, cls as any);

    const result = await service.updateTitleScopeMapping({
      titlePattern: 'PHO PHONG',
      scopeMode: 'SUBTREE',
      priority: 120
    });

    expect(result.mapping?.scopeMode).toBe('SUBTREE');
    expect(result.mappings.some((item: any) => item.titlePattern === 'PHO PHONG')).toBe(true);
    expect(prisma.client.setting.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'setting_access_security' }
      })
    );
  });
});

describe('SettingsEnterpriseService IAM mismatch report API', () => {
  it('returns grouped mismatch report with module/action dimensions', async () => {
    const prisma = {
      getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
      client: {}
    };
    const cls = makeCls({
      userId: 'admin_1',
      role: UserRole.ADMIN,
      email: 'admin@example.com'
    });
    const iamShadowReport = {
      getMismatchReport: vi.fn().mockReturnValue({
        generatedAt: '2026-04-05T00:00:00.000Z',
        tenantId: 'GOIUUDAI',
        totalMismatches: 3,
        totalGroups: 1,
        items: [
          {
            moduleKey: 'crm',
            action: PermissionAction.VIEW,
            mismatchCount: 3,
            legacyAllowCount: 3,
            iamAllowCount: 0,
            lastSeenAt: '2026-04-05T00:00:00.000Z',
            sample: {
              userId: 'user_1',
              path: '/api/v1/crm/customers',
              mode: 'SHADOW',
              legacyAllowed: true,
              iamAllowed: false,
              reasonLegacy: 'ALLOW_MATCH',
              reasonIam: 'DENY_OVERRIDE'
            }
          }
        ]
      })
    };
    const service = new SettingsEnterpriseService(prisma as any, cls as any, undefined, iamShadowReport as any);

    const result = await service.getIamMismatchReport({
      moduleKey: 'crm',
      action: 'VIEW',
      limit: '20'
    });

    expect(iamShadowReport.getMismatchReport).toHaveBeenCalledWith({
      tenantId: 'GOIUUDAI',
      moduleKey: 'crm',
      action: PermissionAction.VIEW,
      limit: 20
    });
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        moduleKey: 'crm',
        action: PermissionAction.VIEW
      })
    );
  });
});
