export type DomainTabConfig = {
  key: string;
  label: string;
  sectionIds?: string[];
  showOrgStructure?: boolean;
  showHrAccounts?: boolean;
  showAccessMatrix?: boolean;
};

type RoleKey = 'ADMIN' | 'USER';

type FieldLike = {
  isAdvanced?: boolean;
};

export type SectionLike<TField extends FieldLike = FieldLike> = {
  id: string;
  isAdvanced?: boolean;
  fields: TField[];
};

const DOMAIN_TAB_MAP: Record<string, DomainTabConfig[]> = {
  org_profile: [
    { key: 'org-general', label: 'Cấu hình chung', sectionIds: ['org-base', 'org-branding'] },
    { key: 'org-appearance', label: 'Appearance', sectionIds: ['org-appearance'] },
    { key: 'org-structure', label: 'Sơ đồ tổ chức', sectionIds: [], showOrgStructure: true }
  ],
  locale_calendar: [
    { key: 'locale-display', label: 'Hiển thị & lịch', sectionIds: ['locale-general'] }
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
      label: 'Sale Checkout Core',
      sectionIds: [
        'sales-checkout-templates',
        'sales-checkout-activation',
        'sales-checkout-effective'
      ]
    },
    { key: 'sales-credit', label: 'Chiết khấu & tín dụng', sectionIds: ['sales-discount-credit'] },
    { key: 'sales-draft', label: 'Đơn nháp', sectionIds: ['sales-draft-expiry'] },
    { key: 'sales-taxonomy', label: 'Phân loại khách hàng', sectionIds: ['sales-taxonomy'] },
    { key: 'sales-tags', label: 'Tag Registry', sectionIds: ['sales-tag-registry'] },
    { key: 'sales-renewal', label: 'Nhắc gia hạn CRM', sectionIds: ['sales-renewal-reminder'] }
  ],
  catalog_scm_policies: [
    { key: 'catalog-defaults', label: 'Mặc định hệ thống', sectionIds: ['catalog-defaults'] },
    { key: 'catalog-constraints', label: 'Ràng buộc nhập/xuất', sectionIds: ['catalog-constraints'] }
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
      sectionIds: ['security-permission-engine', 'security-iam-v2-rollout', 'security-settings-editors']
    },
    {
      key: 'security-observability',
      label: 'Nhật ký & Trợ lý AI',
      sectionIds: ['security-audit-matrix', 'security-assistant-access']
    },
    { key: 'security-matrix', label: 'Ma trận quyền hạn', sectionIds: [], showAccessMatrix: true }
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
    { key: 'data-export-policy', label: 'Chính sách export', sectionIds: ['data-export-policy'] }
  ]
};

export function resolveDomainTabs(domain: string): DomainTabConfig[] {
  return DOMAIN_TAB_MAP[domain] ?? [{ key: 'domain-overview', label: 'Cấu hình' }];
}

function normalizeRole(role: string | null | undefined): RoleKey {
  const normalized = String(role ?? '').trim().toUpperCase();
  if (normalized === 'ADMIN') {
    return 'ADMIN';
  }
  return 'USER';
}

export function filterDomainTabsByRole(
  domain: string,
  tabs: DomainTabConfig[],
  role: string | null | undefined
): DomainTabConfig[] {
  if (domain !== 'access_security') {
    return tabs;
  }

  const roleKey = normalizeRole(role);
  const allowListByRole: Record<RoleKey, string[]> = {
    ADMIN: ['security-auth', 'security-governance', 'security-observability', 'security-matrix'],
    USER: ['security-auth', 'security-observability']
  };

  const allowList = allowListByRole[roleKey];
  const filtered = tabs.filter((tab) => allowList.includes(tab.key));
  return filtered.length > 0 ? filtered : tabs;
}

export function resolveDefaultAdvancedMode(role: string | null | undefined) {
  return String(role ?? '').toUpperCase() === 'ADMIN';
}

export function resolveActiveTab(
  tabs: DomainTabConfig[],
  currentTab: string | null | undefined
): string {
  if (tabs.length === 0) {
    return '';
  }

  const normalizedCurrent = String(currentTab ?? '').trim();
  if (normalizedCurrent && tabs.some((tab) => tab.key === normalizedCurrent)) {
    return normalizedCurrent;
  }

  return tabs[0].key;
}

export function filterSectionsForTabAndMode<
  TField extends FieldLike,
  TSection extends SectionLike<TField>
>(
  sections: TSection[],
  tabs: DomainTabConfig[],
  activeTab: string,
  advancedMode: boolean
): TSection[] {
  const active = tabs.find((tab) => tab.key === activeTab);
  const allowedIds = active?.sectionIds;

  return sections
    .filter((section) => {
      if (allowedIds === undefined) {
        return true;
      }
      return allowedIds.includes(section.id);
    })
    .filter((section) => (advancedMode ? true : section.isAdvanced !== true))
    .map((section) => {
      const nextFields = advancedMode ? section.fields : section.fields.filter((field) => field.isAdvanced !== true);
      return {
        ...section,
        fields: nextFields
      } as TSection;
    })
    .filter((section) => section.fields.length > 0);
}

export function hasAdvancedFields<TField extends FieldLike, TSection extends SectionLike<TField>>(sections: TSection[]) {
  return sections.some((section) => {
    if (section.isAdvanced) {
      return true;
    }
    return section.fields.some((field) => field.isAdvanced);
  });
}
