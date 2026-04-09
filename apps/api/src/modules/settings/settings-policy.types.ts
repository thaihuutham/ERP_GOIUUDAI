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
  'PAYMENTS_BANK_WEBHOOK_SECRET',
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
    companyName: 'GOIUUDAI',
    taxCode: '',
    address: '',
    branchName: '',
    contactEmail: '',
    contactPhone: '',
    enabledModules: [...RUNTIME_TOGGLABLE_ERP_MODULES],
    branding: {
      logoUrl: '',
      primaryColor: '#167746',
      appearance: {
        primary: '#167746',
        primaryHover: '#115f38',
        primarySoft: '#e8f4ed',
        topbarBg: '#f8faf8',
        sidebarBg: '#f8faf8',
        sidebarText: '#3c4a41',
        surface: '#ffffff',
        surfaceMuted: '#f2f7f3',
        border: '#dfe5e0',
        success: '#059669',
        warning: '#d97706',
        danger: '#dc2626',
        info: '#2563eb',
        chart1: '#10b981',
        chart2: '#3b82f6',
        chart3: '#f59e0b',
        chart4: '#ef4444',
        chart5: '#8b5cf6',
        chart6: '#14b8a6',
        radiusSm: 6,
        radiusMd: 8,
        radiusLg: 10,
        shadowSm: '0 1px 2px rgb(0 0 0 / 0.05)',
        shadowMd: '0 10px 30px rgb(15 30 20 / 0.08)',
        density: 'comfortable',
        fontScale: 1
      }
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
    iamV2: {
      enabled: false,
      mode: 'SHADOW',
      enforcementModules: [],
      protectAdminCore: true,
      denySelfElevation: true
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
    auditViewPolicy: {
      enabled: true,
      groups: {
        DIRECTOR: { enabled: true },
        BRANCH_MANAGER: { enabled: true },
        DEPARTMENT_MANAGER: { enabled: true }
      },
      denyIfUngroupedManager: true
    },
    assistantAccessPolicy: {
      enabled: false,
      roleScopeDefaults: {
        ADMIN: 'company',
        USER: 'department'
      },
      enforcePermissionEngine: true,
      denyIfNoScope: true,
      allowedModules: ['crm', 'sales', 'hr', 'workflows', 'finance', 'reports'],
      chatChannelScopeEnforced: true
    },
    settingsEditorPolicy: {
      domainRoleMap: {
        USER: []
      },
      userDomainMap: {}
    }
  },
  approval_matrix: {
    rules: [
      {
        module: 'sales',
        minAmount: 0,
        approverRole: 'USER',
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
    recordIdentity: {
      mode: 'compact',
      foreignKeyMode: 'compact',
      prefix: 'ID',
      sequencePadding: 5,
      compactLength: 8
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
    },
    tagRegistry: {
      customerTags: ['vip', 'khach_moi', 'da_mua'],
      interactionTags: ['quan_tam', 'can_cham_soc', 'da_dat_lich'],
      interactionResultTags: ['quan_tam', 'da_mua', 'khong_phan_hoi']
    },
    renewalReminder: {
      globalLeadDays: 30,
      productLeadDays: {
        TELECOM_PACKAGE: 30,
        AUTO_INSURANCE: 30,
        MOTO_INSURANCE: 30,
        DIGITAL_SERVICE: 30
      }
    },
    checkoutTemplates: {
      INSURANCE: [
        {
          code: 'INSURANCE_STD',
          label: 'Mẫu bảo hiểm tiêu chuẩn',
          requiredFields: ['insuranceType', 'termDays', 'requestedEffectiveDate']
        }
      ],
      TELECOM: [
        {
          code: 'TELECOM_STD',
          label: 'Mẫu viễn thông tiêu chuẩn',
          requiredFields: ['packageCode', 'billingCycle', 'servicePhone']
        }
      ],
      DIGITAL: [
        {
          code: 'DIGITAL_STD',
          label: 'Mẫu dịch vụ số tiêu chuẩn',
          requiredFields: ['planCode', 'termDays', 'startDate']
        }
      ]
    },
    paymentPolicy: {
      partialPaymentEnabled: true,
      overrideRoles: ['ADMIN'],
      callbackTolerance: 300,
      reconcileSchedule: '0 */2 * * *'
    },
    invoiceAutomation: {
      INSURANCE: {
        trigger: 'ON_ACTIVATED',
        requireFullPayment: true
      },
      TELECOM: {
        trigger: 'ON_PAID',
        requireFullPayment: true
      },
      DIGITAL: {
        trigger: 'ON_PAID',
        requireFullPayment: true
      }
    },
    activationPolicy: {
      INSURANCE: 'HYBRID',
      TELECOM: 'HYBRID',
      DIGITAL: 'AUTO'
    },
    effectiveDateMapping: {
      INSURANCE: {
        from: 'autoPolicy.policyFromAt|motoPolicy.policyFromAt',
        to: 'autoPolicy.policyToAt|motoPolicy.policyToAt'
      },
      TELECOM: {
        from: 'activationAt',
        to: 'telecom.currentExpiryAt'
      },
      DIGITAL: {
        from: 'service.startsAt',
        to: 'service.endsAt'
      }
    },
    orderNumberingPolicy: {
      resetRule: 'DAILY',
      sequencePadding: 4,
      groupPrefixes: {
        INSURANCE: 'INS',
        TELECOM: 'TEL',
        DIGITAL: 'DIG'
      }
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
      leaveApproverRole: 'USER',
      payrollApproverRole: 'ADMIN'
    },
    appendixFieldCatalog: {
      summary: {
        id: 'summary',
        key: 'summary',
        label: 'Tom tat cong viec',
        description: 'Noi dung tong hop cong viec da thuc hien.',
        type: 'text',
        options: [],
        validation: { required: true, maxLength: 1000 },
        analyticsEnabled: false,
        aggregator: 'none',
        status: 'ACTIVE',
        version: 1
      },
      result: {
        id: 'result',
        key: 'result',
        label: 'Ket qua',
        description: 'Ket qua dau ra cua cong viec.',
        type: 'text',
        options: [],
        validation: { required: true, maxLength: 1000 },
        analyticsEnabled: false,
        aggregator: 'none',
        status: 'ACTIVE',
        version: 1
      },
      taskCount: {
        id: 'taskCount',
        key: 'taskCount',
        label: 'So dau viec hoan thanh',
        description: 'So luong dau viec da xu ly.',
        type: 'number',
        options: [],
        validation: { min: 0, max: 10000 },
        analyticsEnabled: true,
        aggregator: 'sum',
        status: 'ACTIVE',
        version: 1
      },
      complianceNote: {
        id: 'complianceNote',
        key: 'complianceNote',
        label: 'Ghi chu tuan thu',
        description: 'Ghi nhan tuan thu quy trinh/han muc.',
        type: 'text',
        options: [],
        validation: { maxLength: 1000 },
        analyticsEnabled: false,
        aggregator: 'none',
        status: 'ACTIVE',
        version: 1
      },
      qualityNote: {
        id: 'qualityNote',
        key: 'qualityNote',
        label: 'Ghi chu chat luong',
        description: 'Danh gia chat luong ket qua cong viec.',
        type: 'text',
        options: [],
        validation: { maxLength: 1000 },
        analyticsEnabled: false,
        aggregator: 'none',
        status: 'ACTIVE',
        version: 1
      },
      note: {
        id: 'note',
        key: 'note',
        label: 'Ghi chu bo sung',
        description: 'Thong tin mo rong khac.',
        type: 'text',
        options: [],
        validation: { maxLength: 2000 },
        analyticsEnabled: false,
        aggregator: 'none',
        status: 'ACTIVE',
        version: 1
      }
    },
    appendixTemplates: {
      PL01: {
        name: 'Phu luc nhat ky cong viec ngay',
        description: 'Ghi nhan hoat dong trong ngay theo quy che 2026.',
        fields: [
          { fieldKey: 'summary', required: true, helpText: 'Tom tat cong viec ngay.' },
          { fieldKey: 'result', required: true, helpText: 'Ket qua chinh cua cong viec.' },
          { fieldKey: 'taskCount', required: false, helpText: 'Nhap so dau viec hoan thanh.' },
          { fieldKey: 'complianceNote', required: false },
          { fieldKey: 'note', required: false }
        ]
      },
      PL02: {
        name: 'Phu luc ket qua cong viec ngay',
        description: 'Tong hop ket qua va chat luong thuc thi trong ngay.',
        fields: [
          { fieldKey: 'summary', required: true },
          { fieldKey: 'result', required: true },
          { fieldKey: 'taskCount', required: false },
          { fieldKey: 'qualityNote', required: false },
          { fieldKey: 'note', required: false }
        ]
      },
      PL03: {
        name: 'Phu luc bao cao theo yeu cau',
        description: 'Bao cao bo sung theo yeu cau quan ly truc tiep.',
        fields: [
          { fieldKey: 'summary', required: true },
          { fieldKey: 'result', required: true },
          { fieldKey: 'qualityNote', required: false },
          { fieldKey: 'note', required: false }
        ]
      },
      PL04: {
        name: 'Phu luc tuan thu quy trinh',
        description: 'Theo doi viec tuan thu va cac sai lech can khac phuc.',
        fields: [
          { fieldKey: 'summary', required: true },
          { fieldKey: 'result', required: true },
          { fieldKey: 'complianceNote', required: false },
          { fieldKey: 'qualityNote', required: false },
          { fieldKey: 'note', required: false }
        ]
      },
      PL05: {
        name: 'Phu luc phoi hop lien phong ban',
        description: 'Ghi nhan tien do phoi hop voi don vi lien quan.',
        fields: [
          { fieldKey: 'summary', required: true },
          { fieldKey: 'result', required: true },
          { fieldKey: 'taskCount', required: false },
          { fieldKey: 'complianceNote', required: false },
          { fieldKey: 'note', required: false }
        ]
      },
      PL06: {
        name: 'Phu luc cai tien chat luong',
        description: 'Theo doi de xuat cai tien va ket qua trien khai.',
        fields: [
          { fieldKey: 'summary', required: true },
          { fieldKey: 'result', required: true },
          { fieldKey: 'taskCount', required: false },
          { fieldKey: 'qualityNote', required: false },
          { fieldKey: 'note', required: false }
        ]
      },
      PL10: {
        name: 'Phu luc ke hoach cai thien hieu suat (PIP)',
        description: 'Dung cho truong hop can theo doi cai thien hieu suat.',
        fields: [
          { fieldKey: 'summary', required: true },
          { fieldKey: 'result', required: true },
          { fieldKey: 'complianceNote', required: false },
          { fieldKey: 'qualityNote', required: false },
          { fieldKey: 'note', required: false }
        ]
      }
    },
    appendixCatalog: {
      PL01: {
        name: 'Phụ lục nhật ký công việc ngày',
        description: 'Ghi nhận hoạt động trong ngày theo quy chế 2026.',
        fields: ['summary', 'result', 'taskCount', 'complianceNote', 'note']
      },
      PL02: {
        name: 'Phụ lục kết quả công việc ngày',
        description: 'Tổng hợp kết quả và chất lượng thực thi trong ngày.',
        fields: ['summary', 'result', 'taskCount', 'qualityNote', 'note']
      },
      PL03: {
        name: 'Phụ lục báo cáo theo yêu cầu',
        description: 'Báo cáo bổ sung theo yêu cầu quản lý trực tiếp.',
        fields: ['summary', 'result', 'qualityNote', 'note']
      },
      PL04: {
        name: 'Phụ lục tuân thủ quy trình',
        description: 'Theo dõi việc tuân thủ và các sai lệch cần khắc phục.',
        fields: ['summary', 'result', 'complianceNote', 'qualityNote', 'note']
      },
      PL05: {
        name: 'Phụ lục phối hợp liên phòng ban',
        description: 'Ghi nhận tiến độ phối hợp với đơn vị liên quan.',
        fields: ['summary', 'result', 'taskCount', 'complianceNote', 'note']
      },
      PL06: {
        name: 'Phụ lục cải tiến chất lượng',
        description: 'Theo dõi đề xuất cải tiến và kết quả triển khai.',
        fields: ['summary', 'result', 'taskCount', 'qualityNote', 'note']
      },
      PL10: {
        name: 'Phụ lục kế hoạch cải thiện hiệu suất (PIP)',
        description: 'Dùng cho trường hợp cần theo dõi cải thiện hiệu suất.',
        fields: ['summary', 'result', 'complianceNote', 'qualityNote', 'note']
      }
    }
  },
  integrations: {
    bhtot: {
      enabled: false,
      baseUrl: '',
      apiKey: '',
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
      accessToken: '',
      accessTokenRef: 'ZALO_OA_ACCESS_TOKEN',
      webhookSecret: '',
      webhookSecretRef: 'ZALO_OA_WEBHOOK_SECRET',
      apiBaseUrl: 'https://openapi.zalo.me/v3.0/oa',
      lastHealthStatus: 'UNKNOWN',
      lastValidatedAt: null
    },
    ai: {
      enabled: false,
      baseUrl: '',
      apiKey: '',
      apiKeyRef: 'AI_OPENAI_COMPAT_API_KEY',
      model: 'gpt-4o-mini',
      timeoutMs: 45000,
      lastHealthStatus: 'UNKNOWN',
      lastValidatedAt: null
    },
    payments: {
      enabled: true,
      bankWebhookSecretRef: 'PAYMENTS_BANK_WEBHOOK_SECRET',
      callbackSkewSeconds: 300,
      reconcileEnabled: true
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
