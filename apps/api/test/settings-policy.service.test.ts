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
      customer: {
        groupBy: vi.fn(async () => [])
      },
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
  it('provides phase-2 settings layout metadata for compatibility layer', () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const metadata = service.getLayoutMetadata();

    expect(metadata.version).toBe(1);
    expect(metadata.rolloutPhase).toBe('phase_2');
    expect(metadata.groupedSidebar).toHaveLength(10);
    expect(metadata.groupedSidebar.map((group) => group.id)).toEqual([
      'general',
      'security-access',
      'sales-crm',
      'finance',
      'scm',
      'hr',
      'integrations',
      'notifications',
      'system-ops',
      'elearning'
    ]);
    expect(metadata.advancedMode.defaultByRole).toEqual({
      ADMIN: true,
      USER: false
    });
    expect(metadata.domainTabs.org_profile.map((tab) => tab.key)).toEqual([
      'org-general',
      'org-dashboard',
      'org-appearance',
      'org-structure'
    ]);
    expect(metadata.domainTabs.sales_crm_policies.map((tab) => tab.key)).toEqual([
      'sales-policy-order',
      'sales-policy-checkout',
      'sales-policy-discount-credit',
      'sales-policy-draft',
      'crm-settings-status',
      'crm-settings-renewal',
      'crm-settings-distribution'
    ]);
    expect(metadata.domainTabs.integrations.map((tab) => tab.key)).toEqual([
      'integration-bhtot',
      'integration-zalo',
      'integration-ai',
      'integration-ai-ocr',
      'integration-ai-routing',
      'integration-payments'
    ]);
    expect(metadata.domainTabs.data_governance_backup.map((tab) => tab.key)).toEqual([
      'data-retention',
      'data-export-policy',
      'data-ops-panel'
    ]);
    expect(metadata.compatibility.preserveDomainLevelSubmitFlow).toBe(true);
    expect(metadata.compatibility.preserveValidateSaveSnapshotContracts).toBe(true);
  });

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

  it('normalizes sales taxonomy values with trim + dedupe without forcing uppercase', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const result = await service.updateDomain('sales_crm_policies', {
      customerTaxonomy: {
        stages: ['moi', 'moi', 'dang_cham_soc'],
        sources: ['online', 'online', 'referral']
      }
    }, {
      reason: 'normalize sales taxonomy'
    });

    const sales = result.data as Record<string, unknown>;
    const taxonomy = (sales.customerTaxonomy ?? {}) as Record<string, unknown>;

    expect(taxonomy.stages).toEqual(['moi', 'dang_cham_soc']);
    expect(taxonomy.sources).toEqual(['online', 'referral']);
  });

  it('normalizes CRM renewal reminder settings with bounded lead days', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const result = await service.updateDomain('sales_crm_policies', {
      renewalReminder: {
        globalLeadDays: 45,
        productLeadDays: {
          TELECOM_PACKAGE: '15',
          AUTO_INSURANCE: '',
          MOTO_INSURANCE: null,
          DIGITAL_SERVICE: 120
        }
      }
    }, {
      reason: 'normalize renewal reminder'
    });

    const sales = result.data as Record<string, unknown>;
    const renewal = (sales.renewalReminder ?? {}) as Record<string, unknown>;
    const productLeadDays = (renewal.productLeadDays ?? {}) as Record<string, unknown>;

    expect(renewal.globalLeadDays).toBe(45);
    expect(productLeadDays.TELECOM_PACKAGE).toBe(15);
    expect(productLeadDays.AUTO_INSURANCE).toBeNull();
    expect(productLeadDays.MOTO_INSURANCE).toBeNull();
    expect(productLeadDays.DIGITAL_SERVICE).toBe(120);
  });

  it('normalizes checkout override roles to ADMIN baseline only', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const result = await service.updateDomain('sales_crm_policies', {
      paymentPolicy: {
        overrideRoles: ['user', 'ACCOUNTANT', 'ADMIN']
      }
    }, {
      reason: 'normalize checkout override roles'
    });

    const sales = result.data as Record<string, unknown>;
    const paymentPolicy = (sales.paymentPolicy ?? {}) as Record<string, unknown>;
    expect(paymentPolicy.overrideRoles).toEqual(['ADMIN']);
  });

  it('blocks removing in-use sales taxonomy values via direct domain update', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    await service.updateDomain('sales_crm_policies', {
      customerTaxonomy: {
        stages: ['MOI', 'DANG_CHAM_SOC'],
        sources: ['ONLINE', 'REFERRAL']
      }
    }, {
      reason: 'seed taxonomy values'
    });

    prisma.client.customer.groupBy.mockImplementation(async (args: { by?: string[] }) => {
      if (Array.isArray(args.by) && args.by.includes('customerStage')) {
        return [
          { customerStage: 'MOI', _count: { _all: 4 } }
        ];
      }
      return [];
    });

    await expect(
      service.updateDomain('sales_crm_policies', {
        customerTaxonomy: {
          stages: ['DANG_CHAM_SOC'],
          sources: ['ONLINE', 'REFERRAL']
        }
      }, {
        reason: 'remove in-use stage'
      })
    ).rejects.toThrow('Không thể xóa taxonomy/tag đang được sử dụng');
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
          USER: 'TEAM'
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
    expect(roleScopeDefaults.USER).toBe('department');
    expect(assistantPolicy.allowedModules).toEqual(['sales', 'finance']);
  });

  it('normalizes access_security.iamV2 with safe defaults', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const result = await service.updateDomain('access_security', {
      iamV2: {
        mode: '',
        enforcementModules: ['CRM', 'sales', 'crm']
      }
    }, {
      reason: 'normalize iam v2 defaults'
    });

    const accessSecurity = result.data as Record<string, unknown>;
    const iamV2 = (accessSecurity.iamV2 ?? {}) as Record<string, unknown>;

    expect(iamV2.enabled).toBe(false);
    expect(iamV2.mode).toBe('SHADOW');
    expect(iamV2.enforcementModules).toEqual(['crm', 'sales']);
    expect(iamV2.protectAdminCore).toBe(true);
    expect(iamV2.denySelfElevation).toBe(true);
  });

  it('treats access_security.iamV2.enforcementModules token ALL as entire-system scope', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const result = await service.updateDomain('access_security', {
      iamV2: {
        enabled: true,
        mode: 'ENFORCE',
        enforcementModules: ['ALL', 'crm', 'sales']
      }
    }, {
      reason: 'enable iam v2 for all modules'
    });

    const accessSecurity = result.data as Record<string, unknown>;
    const iamV2 = (accessSecurity.iamV2 ?? {}) as Record<string, unknown>;

    expect(iamV2.enabled).toBe(true);
    expect(iamV2.mode).toBe('ENFORCE');
    expect(iamV2.enforcementModules).toEqual([]);
    expect(result.validation.warnings).toEqual([]);
  });

  it('normalizes managed lists for access_security and finance_controls', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const accessResult = await service.updateDomain('access_security', {
      superAdminIds: ['admin_01', 'admin_01', 'OPS.ADMIN'],
      permissionPolicy: {
        superAdminIds: ['ops_admin', 'ops_admin'],
        superAdminEmails: ['ADMIN@ERP.VN', 'admin@erp.vn', 'ops@erp.vn']
      }
    }, {
      reason: 'normalize managed security lists'
    });

    const access = accessResult.data as Record<string, unknown>;
    const permissionPolicy = (access.permissionPolicy ?? {}) as Record<string, unknown>;
    expect(access.superAdminIds).toEqual(['admin_01', 'OPS.ADMIN']);
    expect(permissionPolicy.superAdminIds).toEqual(['ops_admin']);
    expect(permissionPolicy.superAdminEmails).toEqual(['admin@erp.vn', 'ops@erp.vn']);

    const financeResult = await service.updateDomain('finance_controls', {
      postingPeriods: {
        lockedPeriods: ['2026-02', '2026/01', '2026-02', '2026-03']
      }
    }, {
      reason: 'normalize managed locked periods'
    });

    const finance = financeResult.data as Record<string, unknown>;
    const postingPeriods = (finance.postingPeriods ?? {}) as Record<string, unknown>;
    expect(postingPeriods.lockedPeriods).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('rejects invalid super admin emails in access_security permissionPolicy', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    await expect(
      service.updateDomain('access_security', {
        permissionPolicy: {
          superAdminEmails: ['invalid-email']
        }
      }, {
        reason: 'invalid super admin email'
      })
    ).rejects.toThrow('permissionPolicy.superAdminEmails chứa email không hợp lệ');
  });

  it('normalizes hr appendix options and template field list from managed-list payload', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    const result = await service.updateDomain('hr_policies', {
      appendixFieldCatalog: {
        custom_1: {
          key: 'PL05_customerFeedback',
          label: 'Phan hoi khach hang',
          type: 'select',
          options: [' Rat tot ', 'RAT TOT', 'Can cai thien']
        }
      },
      appendixTemplates: {
        PL05: {
          name: 'PL05 test',
          fields: ['summary', 'Ket qua', 'pl05_customerfeedback', 'summary']
        }
      }
    }, {
      reason: 'normalize hr appendix managed list payload'
    });

    const hr = result.data as Record<string, unknown>;
    const fieldCatalog = (hr.appendixFieldCatalog ?? {}) as Record<string, unknown>;
    const customField = (fieldCatalog.pl05_customerfeedback ?? {}) as Record<string, unknown>;
    expect(customField.options).toEqual(['Rat tot', 'Can cai thien']);

    const templates = (hr.appendixTemplates ?? {}) as Record<string, unknown>;
    const pl05 = (templates.PL05 ?? {}) as Record<string, unknown>;
    const fieldRows = Array.isArray(pl05.fields) ? pl05.fields : [];
    const fieldKeys = fieldRows.map((row) => String((row as Record<string, unknown>).fieldKey ?? ''));
    expect(fieldKeys).toEqual(['summary', 'result', 'pl05_customerfeedback']);

    const legacyCatalog = (hr.appendixCatalog ?? {}) as Record<string, unknown>;
    const legacyPl05 = (legacyCatalog.PL05 ?? {}) as Record<string, unknown>;
    expect(legacyPl05.fields).toEqual(['summary', 'result', 'pl05_customerfeedback']);
  });

  it('rejects invalid hr appendix template fieldKey outside catalog and namespace', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new SettingsPolicyService(prisma as any, cls as any, search as any, runtimeSettings as any);

    await expect(
      service.updateDomain('hr_policies', {
        appendixTemplates: {
          PL01: {
            fields: ['invalid_field']
          }
        }
      }, {
        reason: 'invalid hr template field'
      })
    ).rejects.toThrow('appendixTemplates.PL01.fields.0.fieldKey');
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
      role: 'USER',
      email: 'user@erp.local',
      userId: 'user-1'
    });

    await expect(
      service.updateDomain('org_profile', {
        companyName: 'Denied update'
      }, {
        reason: 'user write without policy'
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
          USER: ['org_profile']
        },
        userDomainMap: {}
      }
    }, {
      reason: 'grant user org profile edit'
    });

    cls.setAuth({
      role: 'USER',
      email: 'user@erp.local',
      userId: 'user-1'
    });

    const result = await service.updateDomain('org_profile', {
      companyName: 'Allowed update'
    }, {
      reason: 'user write with policy'
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
        reason: 'user tries sensitive domain without explicit grant'
      })
    ).rejects.toThrow('Domain nhạy cảm integrations yêu cầu quyền explicit.');
  });
});
