import { SETTINGS_DOMAINS, type SettingsDomain } from './settings-policy.types';

type SettingsLayoutTabHint = {
  key: string;
  label: string;
  sectionIds?: string[];
  showOrgStructure?: boolean;
  showHrAccounts?: boolean;
  showAccessMatrix?: boolean;
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
      MANAGER: boolean;
      STAFF: boolean;
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
    { key: 'finance-numbering', label: 'Đánh số chứng từ', sectionIds: ['finance-numbering'] }
  ],
  sales_crm_policies: [
    { key: 'sales-orders', label: 'Quy tắc đơn hàng', sectionIds: ['sales-order-policy'] },
    { key: 'sales-credit', label: 'Chiết khấu & tín dụng', sectionIds: ['sales-discount-credit'] },
    { key: 'sales-taxonomy', label: 'Phân loại khách hàng', sectionIds: ['sales-taxonomy'] }
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
    { key: 'integration-ai', label: 'AI Connector', sectionIds: ['integration-ai'] }
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
    { key: 'data-export-policy', label: 'Chính sách export', sectionIds: ['data-export-policy'] }
  ]
};

const SIDEBAR_GROUPS: SettingsLayoutGroup[] = [
  {
    id: 'general',
    label: 'Hệ thống chung',
    domains: ['org_profile', 'locale_calendar'] as SettingsDomain[]
  },
  {
    id: 'modules',
    label: 'Quy định Phân hệ',
    domains: ['sales_crm_policies', 'catalog_scm_policies', 'hr_policies'] as SettingsDomain[]
  },
  {
    id: 'management',
    label: 'Quản trị & Kiểm soát',
    domains: ['access_security', 'approval_matrix', 'finance_controls', 'data_governance_backup'] as SettingsDomain[]
  },
  {
    id: 'integration',
    label: 'Tích hợp & Cấu hình IT',
    domains: ['integrations', 'notifications_templates', 'search_performance'] as SettingsDomain[]
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
        MANAGER: false,
        STAFF: false
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
