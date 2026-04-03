import { describe, expect, it, vi } from 'vitest';
import { SettingsPolicyService } from '../src/modules/settings/settings-policy.service';

const SETTINGS_MASTER_KEY = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=';

type SettingRow = {
  id: string;
  tenant_Id: string;
  settingKey: string;
  settingValue: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function makePrismaMock() {
  const rows: SettingRow[] = [];
  let idCounter = 0;

  const matchWhere = (row: SettingRow, where: Record<string, unknown>) => {
    if (where.id && row.id !== String(where.id)) {
      return false;
    }

    const settingKeyWhere = where.settingKey as Record<string, unknown> | undefined;
    if (typeof where.settingKey === 'string') {
      return row.settingKey === where.settingKey;
    }
    if (settingKeyWhere?.startsWith && !row.settingKey.startsWith(String(settingKeyWhere.startsWith))) {
      return false;
    }

    return true;
  };

  const findByWhere = (where?: Record<string, unknown>) => {
    if (!where) {
      return [...rows];
    }
    return rows.filter((row) => matchWhere(row, where));
  };

  return {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      setting: {
        findFirst: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
          const list = findByWhere(args?.where);
          return list[0] ?? null;
        }),
        findMany: vi.fn(async (args?: {
          where?: Record<string, unknown>;
          orderBy?: { createdAt?: 'asc' | 'desc' };
          take?: number;
        }) => {
          let list = findByWhere(args?.where);
          const order = args?.orderBy?.createdAt ?? 'asc';
          list = list.sort((left, right) => order === 'desc'
            ? right.createdAt.getTime() - left.createdAt.getTime()
            : left.createdAt.getTime() - right.createdAt.getTime());
          if (args?.take) {
            list = list.slice(0, args.take);
          }
          return list;
        }),
        create: vi.fn(async (args: { data: { tenant_Id: string; settingKey: string; settingValue: unknown } }) => {
          const now = new Date();
          const row: SettingRow = {
            id: `setting_${++idCounter}`,
            tenant_Id: args.data.tenant_Id,
            settingKey: args.data.settingKey,
            settingValue: args.data.settingValue,
            createdAt: now,
            updatedAt: now
          };
          rows.push(row);
          return row;
        }),
        updateMany: vi.fn(async (args: { where: { id: string }; data: { settingValue: unknown } }) => {
          const target = rows.find((row) => row.id === args.where.id);
          if (!target) {
            return { count: 0 };
          }
          target.settingValue = args.data.settingValue;
          target.updatedAt = new Date();
          return { count: 1 };
        })
      }
    },
    __rows: rows
  };
}

function makeClsMock() {
  return {
    get: vi.fn().mockReturnValue(undefined)
  };
}

function makeMutableClsMock() {
  let authUser: Record<string, unknown> | undefined;
  return {
    setAuth(next: Record<string, unknown> | undefined) {
      authUser = next;
    },
    get: vi.fn((key?: string) => (key === 'authUser' ? authUser : undefined))
  };
}

function makeSearchMock() {
  return {
    getStatus: vi.fn().mockResolvedValue({
      engine: 'sql',
      hybridEnabled: false,
      writeSyncEnabled: false,
      meiliConfigured: false,
      meiliHost: null,
      indexPrefix: 'erp_retail',
      timeoutMs: 45000,
      healthy: true,
      checkedAt: new Date().toISOString(),
      indexes: {}
    })
  };
}

function makeRuntimeSettingsMock() {
  return {
    invalidate: vi.fn()
  };
}

describe('SettingsPolicyService', () => {
  it('resolves secret only for allowlist refs', () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    process.env.BHTOT_API_KEY = 'secret_value';

    expect(service.resolveSecretByRef('BHTOT_API_KEY')).toBe('secret_value');
    expect(service.resolveSecretByRef('UNSAFE_KEY')).toBe('');
  });

  it('accepts plaintext secret fields and persists them for runtime usage', async () => {
    process.env.SETTINGS_ENCRYPTION_MASTER_KEY = SETTINGS_MASTER_KEY;
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const result = await service.updateDomain('integrations', {
      bhtot: {
        enabled: true,
        baseUrl: 'https://bhtot.example.com',
        apiKey: 'raw-secret-value',
        apiKeyRef: 'BHTOT_API_KEY'
      }
    }, {
      reason: 'sanitize test'
    });

    expect(result.validation.ok).toBe(true);
    expect(result.data.bhtot).toMatchObject({
      apiKey: 'raw-secret-value',
      apiKeyRef: 'BHTOT_API_KEY',
      hasSecret: true
    });

    const persisted = prisma.__rows.find((row) => row.settingKey === 'settings.integrations.v1');
    expect(persisted).toBeDefined();
    expect(JSON.stringify(persisted?.settingValue)).not.toContain('raw-secret-value');
    expect(JSON.stringify(persisted?.settingValue)).toContain('enc:v1:gcm:');

    const reloaded = await service.getDomain('integrations');
    expect((reloaded.data as Record<string, unknown>).bhtot).toMatchObject({
      apiKey: 'raw-secret-value',
      hasSecret: true
    });
  });

  it('supports dry-run without persisting settings rows', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const result = await service.updateDomain('finance_controls', {
      transactionCutoffHour: 18
    }, {
      dryRun: true,
      reason: 'dry-run test'
    });

    expect(result.dryRun).toBe(true);
    const createdRow = prisma.__rows.find((row) => row.settingKey === 'settings.finance_controls.v1');
    expect(createdRow).toBeUndefined();
  });

  it('normalizes org_profile.enabledModules to valid runtime modules only', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const result = await service.updateDomain('org_profile', {
      enabledModules: ['CRM', 'reports', 'REPORTS', 'settings', 'invalid_module', 'Notifications']
    }, {
      reason: 'normalize enabled modules'
    });

    expect(result.data.enabledModules).toEqual(['crm', 'reports', 'notifications', 'audit', 'assistant']);

    const persisted = prisma.__rows.find((row) => row.settingKey === 'settings.org_profile.v1');
    const persistedValue = persisted?.settingValue as Record<string, unknown> | undefined;
    expect(Array.isArray(persistedValue?.enabledModules)).toBe(true);
    expect(persistedValue?.enabledModules).toEqual(['crm', 'reports', 'notifications', 'audit', 'assistant']);
  });

  it('normalizes access_security.auditViewPolicy with safe defaults', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const result = await service.updateDomain('access_security', {
      auditViewPolicy: {
        groups: {
          BRANCH_MANAGER: {
            enabled: false
          }
        }
      }
    }, {
      reason: 'normalize audit view policy'
    });

    const accessSecurity = result.data as Record<string, unknown>;
    const policy = accessSecurity.auditViewPolicy as Record<string, unknown>;
    const groups = (policy.groups ?? {}) as Record<string, unknown>;
    const branch = (groups.BRANCH_MANAGER ?? {}) as Record<string, unknown>;
    const director = (groups.DIRECTOR ?? {}) as Record<string, unknown>;
    const department = (groups.DEPARTMENT_MANAGER ?? {}) as Record<string, unknown>;

    expect(policy.enabled).toBe(true);
    expect(policy.denyIfUngroupedManager).toBe(true);
    expect(director.enabled).toBe(true);
    expect(branch.enabled).toBe(false);
    expect(department.enabled).toBe(true);
  });

  it('normalizes access_security.assistantAccessPolicy with role scope defaults', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const result = await service.updateDomain('access_security', {
      assistantAccessPolicy: {
        enabled: true,
        roleScopeDefaults: {
          ADMIN: 'BRANCH',
          MANAGER: 'TEAM',
          STAFF: 'SELF'
        },
        enforcePermissionEngine: true,
        denyIfNoScope: true,
        allowedModules: ['sales', 'finance', 'invalid_module'],
        chatChannelScopeEnforced: true
      }
    }, {
      reason: 'normalize assistant access policy'
    });

    const accessSecurity = result.data as Record<string, unknown>;
    const assistantPolicy = (accessSecurity.assistantAccessPolicy ?? {}) as Record<string, unknown>;
    const roleScopeDefaults = (assistantPolicy.roleScopeDefaults ?? {}) as Record<string, unknown>;

    expect(assistantPolicy.enabled).toBe(true);
    expect(roleScopeDefaults.ADMIN).toBe('branch');
    expect(roleScopeDefaults.MANAGER).toBe('department');
    expect(roleScopeDefaults.STAFF).toBe('self');
    expect(assistantPolicy.allowedModules).toEqual(['sales', 'finance']);
  });

  it('creates audit entries and can restore snapshot by domain', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    await service.updateDomain('org_profile', {
      companyName: 'ERP Alpha'
    }, {
      reason: 'init company'
    });

    const snapshot = await service.createSnapshot({
      domains: ['org_profile'],
      reason: 'snapshot org_profile'
    });

    await service.updateDomain('org_profile', {
      companyName: 'ERP Beta'
    }, {
      reason: 'change company'
    });

    await service.restoreSnapshot(String(snapshot.id), {
      domains: ['org_profile'],
      reason: 'rollback org profile'
    });

    const restored = await service.getDomain('org_profile');
    expect(restored.data.companyName).toBe('ERP Alpha');

    const audit = await service.listAudit({ domain: 'org_profile', limit: 10 });
    expect(audit.items.length).toBeGreaterThan(0);
    expect((audit.items[0] as Record<string, unknown>).changedPaths).toBeTruthy();
  });

  it('denies non-admin write when settingsEditorPolicy is empty', async () => {
    const prisma = makePrismaMock();
    const cls = makeMutableClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    cls.setAuth({
      role: 'MANAGER',
      email: 'manager@erp.local',
      userId: 'manager-1'
    });

    await expect(
      service.updateDomain('org_profile', {
        companyName: 'Denied update'
      }, {
        reason: 'manager write without policy'
      })
    ).rejects.toThrow('Bạn không có quyền chỉnh domain org_profile.');
  });

  it('allows write when domain is granted in settingsEditorPolicy', async () => {
    const prisma = makePrismaMock();
    const cls = makeMutableClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    cls.setAuth({
      role: 'ADMIN',
      email: 'admin@erp.local',
      userId: 'admin-1'
    });

    await service.updateDomain('access_security', {
      settingsEditorPolicy: {
        domainRoleMap: {
          MANAGER: ['org_profile'],
          STAFF: []
        },
        userDomainMap: {}
      }
    }, {
      reason: 'grant manager org profile edit'
    });

    cls.setAuth({
      role: 'MANAGER',
      email: 'manager@erp.local',
      userId: 'manager-1'
    });

    const result = await service.updateDomain('org_profile', {
      companyName: 'Allowed update'
    }, {
      reason: 'manager write with policy'
    });

    expect(result.changed).toBe(true);
    expect(result.data.companyName).toBe('Allowed update');

    await expect(
      service.updateDomain('integrations', {
        bhtot: {
          enabled: true,
          baseUrl: 'https://bhtot.example.com'
        }
      }, {
        reason: 'manager tries sensitive domain without explicit grant'
      })
    ).rejects.toThrow('Domain nhạy cảm integrations yêu cầu quyền explicit.');
  });
});
