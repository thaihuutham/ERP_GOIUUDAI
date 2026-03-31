import { ERP_MODULES } from '@erp/shared';

export const SETTINGS_DOMAINS = [
  'org_profile',
  'locale_calendar',
  'access_security',
  'approval_matrix',
  'finance_controls',
  'sales_crm_policies',
  'catalog_scm_policies',
  'hr_policies',
  'integrations',
  'notifications_templates',
  'search_performance',
  'data_governance_backup'
] as const;

export type SettingsDomain = (typeof SETTINGS_DOMAINS)[number];

export const SETTINGS_DOMAIN_SET = new Set<SettingsDomain>(SETTINGS_DOMAINS);

export const SETTINGS_SECRET_ALLOWLIST = [
  'BHTOT_API_KEY',
  'AI_OPENAI_COMPAT_API_KEY',
  'ZALO_OA_ACCESS_TOKEN',
  'ZALO_OA_WEBHOOK_SECRET',
  'MEILI_MASTER_KEY'
] as const;

export type SecretRef = (typeof SETTINGS_SECRET_ALLOWLIST)[number];

export type DomainValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type SettingsAuditEntry = {
  id: string;
  tenantId: string;
  domain: SettingsDomain | 'system';
  action: 'UPDATE' | 'VALIDATE' | 'SNAPSHOT_CREATE' | 'SNAPSHOT_RESTORE' | 'TEST_CONNECTION';
  actor: string;
  reason: string;
  requestId: string | null;
  changedPaths: string[];
  beforeHash: string;
  afterHash: string;
  createdAt: string;
  meta: Record<string, unknown>;
};

export type SettingsSnapshot = {
  id: string;
  tenantId: string;
  createdAt: string;
  createdBy: string;
  reason: string;
  domains: Record<string, unknown>;
};

export const RUNTIME_TOGGLABLE_ERP_MODULES = ERP_MODULES.filter((moduleKey) => moduleKey !== 'settings');

export const DEFAULT_SETTINGS_DOMAINS: Record<SettingsDomain, Record<string, unknown>> = {
  org_profile: {
    companyName: 'Digital Retail ERP Co.',
    taxCode: '',
    address: '',
    branchName: '',
    contactEmail: '',
    contactPhone: '',
    enabledModules: [...RUNTIME_TOGGLABLE_ERP_MODULES],
    branding: {
      logoUrl: '',
      primaryColor: '#3f8f50'
    },
    documentLayout: {
      invoiceTemplate: 'standard',
      showCompanySeal: false
    }
  },
  locale_calendar: {
    timezone: 'Asia/Ho_Chi_Minh',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: 'vi-VN',
    currency: 'VND',
    firstDayOfWeek: 'monday',
    fiscalYearStartMonth: 1
  },
  access_security: {
    sessionTimeoutMinutes: 480,
    rbacPolicyVersion: 'v1',
    superAdminIds: [],
    permissionPolicy: {
      enabled: false,
      conflictPolicy: 'DENY_OVERRIDES',
      superAdminIds: [],
      superAdminEmails: []
    },
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireNumber: true,
      requireSpecial: false,
      rotateDays: 90
    },
    loginPolicy: {
      maxFailedAttempts: 5,
      lockoutMinutes: 15,
      mfaRequired: false
    },
    settingsEditorPolicy: {
      domainRoleMap: {
        MANAGER: [],
        STAFF: []
      },
      userDomainMap: {}
    }
  },
  approval_matrix: {
    rules: [
      {
        module: 'sales',
        minAmount: 0,
        approverRole: 'MANAGER',
        approverDepartment: ''
      }
    ],
    escalation: {
      enabled: true,
      slaHours: 24,
      escalateToRole: 'ADMIN'
    },
    delegation: {
      enabled: true,
      maxDays: 14
    }
  },
  finance_controls: {
    postingPeriods: {
      lockedPeriods: [],
      allowBackdateDays: 0
    },
    documentNumbering: {
      invoicePrefix: 'INV',
      orderPrefix: 'SO',
      autoNumber: true
    },
    transactionCutoffHour: 23
  },
  sales_crm_policies: {
    orderSettings: {
      allowIncreaseWithoutApproval: true,
      requireApprovalForDecrease: true,
      approverId: ''
    },
    discountPolicy: {
      maxDiscountPercent: 15,
      requireApprovalAbovePercent: 10
    },
    creditPolicy: {
      allowNegativeBalance: false,
      maxCreditLimit: 0
    },
    customerTaxonomy: {
      stages: ['MOI', 'TIEP_CAN', 'DANG_CHAM_SOC', 'CHOT_DON'],
      sources: ['ONLINE', 'OFFLINE', 'CTV', 'REFERRAL']
    }
  },
  catalog_scm_policies: {
    uomDefault: 'PCS',
    priceListDefault: 'STANDARD',
    warehouseDefault: 'MAIN',
    replenishment: {
      enabled: true,
      minStockThreshold: 10
    },
    receiving: {
      allowOverReceivePercent: 5
    }
  },
  hr_policies: {
    shiftDefault: 'HC',
    leave: {
      annualDefaultDays: 12,
      maxCarryOverDays: 5
    },
    payroll: {
      cycle: 'monthly',
      cutoffDay: 25
    },
    approverChain: {
      leaveApproverRole: 'MANAGER',
      payrollApproverRole: 'ADMIN'
    }
  },
  integrations: {
    bhtot: {
      enabled: false,
      baseUrl: '',
      apiKeyRef: '',
      timeoutMs: 12000,
      ordersStateKey: 'bhtot_orders',
      usersStateKey: 'bhtot_users',
      syncAllUsersAsEmployees: false,
      lastSyncAt: null,
      lastSyncStatus: 'IDLE',
      lastSyncSummary: null,
      lastHealthStatus: 'UNKNOWN',
      lastValidatedAt: null
    },
    zalo: {
      enabled: false,
      outboundUrl: '',
      outboundTimeoutMs: 20000,
      accessTokenRef: 'ZALO_OA_ACCESS_TOKEN',
      webhookSecretRef: 'ZALO_OA_WEBHOOK_SECRET',
      apiBaseUrl: 'https://openapi.zalo.me/v3.0/oa',
      lastHealthStatus: 'UNKNOWN',
      lastValidatedAt: null
    },
    ai: {
      enabled: false,
      baseUrl: '',
      apiKeyRef: 'AI_OPENAI_COMPAT_API_KEY',
      model: 'gpt-4o-mini',
      timeoutMs: 45000,
      lastHealthStatus: 'UNKNOWN',
      lastValidatedAt: null
    }
  },
  notifications_templates: {
    templatesVersion: 'v1',
    channelPolicy: {
      email: true,
      sms: false,
      zalo: true,
      inApp: true
    },
    retry: {
      maxAttempts: 3,
      backoffSeconds: 30
    }
  },
  search_performance: {
    engine: 'sql',
    timeoutMs: 45000,
    indexPrefix: 'erp',
    writeSyncEnabled: false,
    reindexPolicy: {
      autoAfterDeploy: false,
      allowEntity: ['customers', 'orders', 'products', 'all']
    },
    lastHealthStatus: 'UNKNOWN',
    lastValidatedAt: null
  },
  data_governance_backup: {
    retentionDays: 365 * 7,
    auditRetentionYears: 7,
    auditHotRetentionMonths: 12,
    archiveAfterDays: 180,
    backupCadence: 'daily',
    lastBackupAt: null,
    exportPolicy: {
      allowPiiExport: false,
      requireAdminApproval: true
    }
  }
};
