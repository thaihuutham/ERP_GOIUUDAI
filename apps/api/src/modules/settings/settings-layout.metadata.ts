import { SETTINGS_DOMAINS, type SettingsDomain } from './settings-policy.types';

type SettingsLayoutTabHint = {
  key: string;
  label: string;
  sectionIds?: string[];
  showOrgStructure?: boolean;
  showHrAccounts?: boolean;
  showAccessMatrix?: boolean;
  showSettingsOpsPanel?: boolean;
};

type SettingsLayoutGroup = {
  id: string;
  label: string;
  domains: SettingsDomain[];
};

export type SettingsLayoutMetadata = {
  version: number;
  rolloutPhase: 'phase_2';
  generatedAt: string;
  groupedSidebar: SettingsLayoutGroup[];
  advancedMode: {
    defaultByRole: {
      ADMIN: boolean;
      USER: boolean;
    };
    scope: 'section_and_field';
  };
  domainTabs: Record<SettingsDomain, SettingsLayoutTabHint[]>;
  compatibility: {
    preserveDomainLevelSubmitFlow: true;
    preserveValidateSaveSnapshotContracts: true;
  };
};

const DOMAIN_TAB_MAP: Record<SettingsDomain, SettingsLayoutTabHint[]> = {
  org_profile: [
    { key: 'org-general', label: 'Cấu hình chung', sectionIds: ['org-base', 'org-branding'] },
    { key: 'org-dashboard', label: 'Dashboard', sectionIds: ['org-dashboard-widgets'] },
    { key: 'org-appearance', label: 'Appearance', sectionIds: ['org-appearance'] },
    { key: 'org-structure', label: 'Sơ đồ tổ chức', sectionIds: [], showOrgStructure: true }
  ],
  locale_calendar: [
    { key: 'locale-display', label: 'Hiển thị & lịch', sectionIds: ['locale-general'] }
  ],
  access_security: [
    {
      key: 'security-auth',
      label: 'Đăng nhập & mật khẩu',
      sectionIds: ['security-session', 'security-password']
    },
    {
      key: 'security-governance',
      label: 'Phân quyền hệ thống',
      sectionIds: ['security-permission-engine', 'security-settings-editors']
    },
    {
      key: 'security-observability',
      label: 'Nhật ký & Trợ lý AI',
      sectionIds: ['security-audit-matrix', 'security-assistant-access']
    },
    { key: 'security-matrix', label: 'Ma trận quyền hạn', sectionIds: [], showAccessMatrix: true }
  ],
  approval_matrix: [
    { key: 'approval-rules', label: 'Quy tắc duyệt', sectionIds: ['approval-rule-default'] },
    { key: 'approval-escalation', label: 'Leo thang & ủy quyền', sectionIds: ['approval-escalation'] }
  ],
  finance_controls: [
    { key: 'finance-period', label: 'Kỳ kế toán', sectionIds: ['finance-period'] },
    { key: 'finance-numbering', label: 'Đánh số chứng từ', sectionIds: ['finance-numbering', 'finance-order-numbering'] },
    { key: 'finance-payment', label: 'Thanh toán & VietQR', sectionIds: ['finance-payment-policy'] },
    { key: 'finance-invoice', label: 'Hóa đơn tự động', sectionIds: ['finance-invoice-automation'] }
  ],
  sales_crm_policies: [
    { key: 'sales-orders', label: 'Quy tắc đơn hàng', sectionIds: ['sales-order-policy'] },
    {
      key: 'sales-checkout-core',
      label: 'Mẫu đơn hàng (Templates)',
      sectionIds: [
        'sales-checkout-templates',
        'sales-checkout-activation',
        'sales-checkout-effective'
      ]
    },
    { key: 'sales-credit', label: 'Chiết khấu & tín dụng', sectionIds: ['sales-discount-credit'] },
    { key: 'sales-draft', label: 'Đơn nháp', sectionIds: ['sales-draft-expiry'] },
    { key: 'sales-taxonomy', label: 'Phân loại khách hàng', sectionIds: ['sales-taxonomy'] },
    { key: 'sales-tags', label: 'Quản lý nhãn (Tags)', sectionIds: ['sales-tag-registry'] },
    { key: 'sales-renewal', label: 'Nhắc gia hạn CRM', sectionIds: ['sales-renewal-reminder'] }
  ],
  catalog_scm_policies: [
    { key: 'catalog-defaults', label: 'Mặc định hệ thống', sectionIds: ['catalog-defaults'] },
    { key: 'catalog-constraints', label: 'Ràng buộc nhập/xuất', sectionIds: ['catalog-constraints'] }
  ],
  hr_policies: [
    { key: 'hr-settings', label: 'Thiết lập nhân sự', sectionIds: ['hr-defaults', 'hr-approval-chain'] },
    {
      key: 'hr-appendix',
      label: 'Phụ lục hợp đồng',
      sectionIds: ['hr-appendix-field-library', 'hr-appendix-template-design']
    },
    { key: 'hr-accounts', label: 'Tài khoản nhân viên', sectionIds: [], showHrAccounts: true }
  ],
  integrations: [
    { key: 'integration-bhtot', label: 'BHTOT', sectionIds: ['integration-bhtot'] },
    { key: 'integration-zalo', label: 'Zalo OA', sectionIds: ['integration-zalo'] },
    { key: 'integration-ai', label: 'AI Connector', sectionIds: ['integration-ai'] },
    { key: 'integration-ai-ocr', label: 'AI OCR', sectionIds: ['integration-ai-ocr'] },
    { key: 'integration-ai-routing', label: 'AI Routing', sectionIds: ['integration-ai-routing'] },
    { key: 'integration-payments', label: 'Payments', sectionIds: ['integration-payments'] }
  ],
  notifications_templates: [
    { key: 'notify-template', label: 'Template', sectionIds: ['notify-template'] },
    { key: 'notify-channel-policy', label: 'Kênh gửi', sectionIds: ['notify-channel-policy'] },
    { key: 'notify-retry', label: 'Retry/Backoff', sectionIds: ['notify-retry'] }
  ],
  search_performance: [
    { key: 'search-runtime', label: 'Runtime', sectionIds: ['search-runtime'] },
    { key: 'search-reindex', label: 'Reindex', sectionIds: ['search-reindex'] }
  ],
  data_governance_backup: [
    { key: 'data-retention', label: 'Vòng đời dữ liệu', sectionIds: ['data-retention'] },
    { key: 'data-export-policy', label: 'Chính sách export', sectionIds: ['data-export-policy'] },
    { key: 'data-ops-panel', label: 'Checklist & audit', sectionIds: [], showSettingsOpsPanel: true }
  ],
  elearning_policies: [
    { key: 'elearning-daily-quiz', label: 'Trắc nghiệm hàng ngày', sectionIds: ['elearning-daily-quiz'] },
    { key: 'elearning-certificates', label: 'Chứng nhận', sectionIds: ['elearning-certificates'] },
    { key: 'elearning-enrollment', label: 'Ghi danh', sectionIds: ['elearning-enrollment'] }
  ]
};

const SIDEBAR_GROUPS: SettingsLayoutGroup[] = [
  {
    id: 'general',
    label: 'General',
    domains: ['org_profile', 'locale_calendar'] as SettingsDomain[]
  },
  {
    id: 'security-access',
    label: 'Security & Access',
    domains: ['access_security', 'approval_matrix'] as SettingsDomain[]
  },
  {
    id: 'sales-crm',
    label: 'Sales & CRM',
    domains: ['sales_crm_policies'] as SettingsDomain[]
  },
  {
    id: 'finance',
    label: 'Finance & Accounting',
    domains: ['finance_controls'] as SettingsDomain[]
  },
  {
    id: 'scm',
    label: 'SCM / Inventory / Purchasing',
    domains: ['catalog_scm_policies'] as SettingsDomain[]
  },
  {
    id: 'hr',
    label: 'HR',
    domains: ['hr_policies'] as SettingsDomain[]
  },
  {
    id: 'integrations',
    label: 'Integrations',
    domains: ['integrations'] as SettingsDomain[]
  },
  {
    id: 'notifications',
    label: 'Notifications',
    domains: ['notifications_templates'] as SettingsDomain[]
  },
  {
    id: 'system-ops',
    label: 'System Operations',
    domains: ['search_performance', 'data_governance_backup'] as SettingsDomain[]
  },
  {
    id: 'elearning',
    label: 'E-Learning',
    domains: ['elearning_policies'] as SettingsDomain[]
  }
];

function buildDomainTabs(): Record<SettingsDomain, SettingsLayoutTabHint[]> {
  const domainTabs = {} as Record<SettingsDomain, SettingsLayoutTabHint[]>;
  for (const domain of SETTINGS_DOMAINS) {
    domainTabs[domain] = DOMAIN_TAB_MAP[domain] ?? [{ key: 'domain-overview', label: 'Cấu hình' }];
  }
  return domainTabs;
}

export function buildSettingsLayoutMetadata(): SettingsLayoutMetadata {
  return {
    version: 1,
    rolloutPhase: 'phase_2',
    generatedAt: new Date().toISOString(),
    groupedSidebar: SIDEBAR_GROUPS,
    advancedMode: {
      defaultByRole: {
        ADMIN: true,
        USER: false
      },
      scope: 'section_and_field'
    },
    domainTabs: buildDomainTabs(),
    compatibility: {
      preserveDomainLevelSubmitFlow: true,
      preserveValidateSaveSnapshotContracts: true
    }
  };
}
