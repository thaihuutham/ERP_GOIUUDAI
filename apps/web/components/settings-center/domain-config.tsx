// @ts-nocheck
import React from 'react';
import { ERP_MODULES } from '@erp/shared';
import type { UserPositionAssignment } from '@erp/api/src/modules/users/users.types';
import type { PermissionMatrix } from '@erp/api/src/modules/settings/settings-policy.types';
import { DomainTabConfig, resolveDefaultAdvancedMode } from './view-model';
import type { ManagedListType } from './settings-list-manager-field';
import { SYSTEM_PROFILE } from '../../lib/system-profile';
import { formatRuntimeDateTime } from '../../lib/runtime-format';
import { normalizeListPayload } from '../../lib/api-client';

export const DOMAIN_ORDER = [
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
  'data_governance_backup',
  'elearning_policies'
] as const;

export type DomainKey = (typeof DOMAIN_ORDER)[number];

export const DOMAIN_GROUPS = [
  {
    id: 'general',
    label: 'General',
    domains: ['org_profile', 'locale_calendar'] as const
  },
  {
    id: 'security-access',
    label: 'Security & Access',
    domains: ['access_security', 'approval_matrix'] as const
  },
  {
    id: 'sales-crm',
    label: 'Sales & CRM',
    domains: ['sales_crm_policies'] as const
  },
  {
    id: 'finance',
    label: 'Finance & Accounting',
    domains: ['finance_controls'] as const
  },
  {
    id: 'scm',
    label: 'SCM / Inventory / Purchasing',
    domains: ['catalog_scm_policies'] as const
  },
  {
    id: 'hr',
    label: 'HR',
    domains: ['hr_policies', 'elearning_policies'] as const
  },
  {
    id: 'integrations',
    label: 'Integrations',
    domains: ['integrations'] as const
  },
  {
    id: 'notifications',
    label: 'Notifications',
    domains: ['notifications_templates'] as const
  },
  {
    id: 'system-ops',
    label: 'System Operations',
    domains: ['search_performance', 'data_governance_backup'] as const
  }
];

export type DomainState = {
  domain: DomainKey;
  ok: boolean;
  errorCount: number;
  warningCount: number;
  updatedAt: string | null;
  runtimeApplied?: boolean;
  runtimeLoadedAt?: string | null;
};

export type CenterPayload = {
  summary: {
    totalDomains: number;
    validDomains: number;
    invalidDomains: number;
  };
  checklist: {
    org: boolean;
    security: boolean;
    financeControls: boolean;
    integrations: boolean;
    modulePolicies: boolean;
  };
  domainStates: DomainState[];
  recentAudit: Array<Record<string, unknown>>;
  recentSnapshots: Array<Record<string, unknown>>;
};

export type DomainPayload = {
  domain: DomainKey;
  data: Record<string, unknown>;
  validation?: {
    ok: boolean;
    errors: string[];
    warnings: string[];
  };
};

export type PermissionActionKey = 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE';
export type PermissionEffectValue = '' | 'ALLOW' | 'DENY';
export type IamScopeMode = 'SELF' | 'SUBTREE' | 'UNIT_FULL';

export type PermissionRuleRow = {
  moduleKey: string;
  action: PermissionActionKey;
  effect: 'ALLOW' | 'DENY';
};

export type PermissionMatrix = Record<string, Record<PermissionActionKey, PermissionEffectValue>>;

export type FieldOption = {
  value: string;
  label: string;
  previewImage?: string;
};

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'switch'
  | 'tags'
  | 'managedList'
  | 'multiSelect'
  | 'userDomainMap'
  | 'secret'
  | 'keyPool'
  | 'color'
  | 'taxonomyManager';

export type SalesTaxonomyType = 'stages' | 'sources';
export type CrmTagRegistryType = 'customerTags' | 'interactionTags' | 'interactionResultTags';
export type TaxonomyManagerType = SalesTaxonomyType | CrmTagRegistryType;

export type SalesTaxonomyPayload = {
  stages: SalesTaxonomyItem[];
  sources: SalesTaxonomyItem[];
};

export type CrmTagRegistryPayload = {
  customerTags: SalesTaxonomyItem[];
  interactionTags: SalesTaxonomyItem[];
  interactionResultTags: SalesTaxonomyItem[];
};

export const EMPTY_SALES_TAXONOMY: SalesTaxonomyPayload = {
  stages: [],
  sources: []
};

export const EMPTY_CRM_TAG_REGISTRY: CrmTagRegistryPayload = {
  customerTags: [],
  interactionTags: [],
  interactionResultTags: []
};

export type FieldConfig = {
  id: string;
  path: string;
  label: string;
  helper?: string;
  type: FieldType;
  placeholder?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  allowEmpty?: boolean;
  options?: FieldOption[];
  isAdvanced?: boolean;
  taxonomyType?: TaxonomyManagerType;
  managedListType?: ManagedListType;
};

export type SectionConfig = {
  id: string;
  title: string;
  description?: string;
  fields: FieldConfig[];
  isAdvanced?: boolean;
};

export type DomainConfig = {
  title: string;
  description: string;
  sections: SectionConfig[];
};

export type FieldChange = {
  id: string;
  label: string;
  before: string;
  after: string;
};

export type PositionSummaryItem = {
  id: string;
  code: string;
  title: string;
  level: string;
  status: string;
  departmentName: string;
  employeeCount: number;
  permissionRuleCount: number;
};

export type IamMismatchReportItem = {
  moduleKey: string;
  action: PermissionActionKey;
  mismatchCount: number;
  legacyAllowCount: number;
  iamAllowCount: number;
  lastSeenAt: string;
  sample: Record<string, unknown> | null;
};

export const DOMAIN_LABEL: Record<DomainKey, string> = {
  org_profile: 'Tổ chức',
  locale_calendar: 'Ngôn ngữ & lịch',
  access_security: 'Bảo mật truy cập',
  approval_matrix: 'Ma trận phê duyệt',
  finance_controls: 'Kiểm soát tài chính',
  sales_crm_policies: 'Chính sách CRM/Bán hàng',
  catalog_scm_policies: 'Chính sách Danh mục/SCM',
  hr_policies: 'Chính sách Nhân sự',
  integrations: 'Tích hợp hệ thống',
  notifications_templates: 'Thông báo & mẫu',
  search_performance: 'Tìm kiếm & hiệu năng',
  data_governance_backup: 'Dữ liệu & backup',
  elearning_policies: 'Học trực tuyến'
};

export const DOMAIN_OPTIONS: FieldOption[] = DOMAIN_ORDER.map((domain) => ({
  value: domain,
  label: DOMAIN_LABEL[domain]
}));

export const MODULE_LABEL_MAP: Record<string, string> = {
  crm: 'CRM',
  sales: 'Bán hàng',
  catalog: 'Danh mục',
  hr: 'Nhân sự',
  finance: 'Tài chính',
  scm: 'Chuỗi cung ứng',
  assets: 'Tài sản',
  projects: 'Dự án',
  workflows: 'Quy trình',
  reports: 'Báo cáo',
  assistant: 'Trợ lý AI',
  audit: 'Nhật ký hệ thống',
  notifications: 'Thông báo',
  elearning: 'Học trực tuyến'
};

export const MODULE_OPTIONS: FieldOption[] = ERP_MODULES
  .filter((moduleKey) => moduleKey !== 'settings')
  .map((moduleKey) => ({
    value: moduleKey,
    label: MODULE_LABEL_MAP[moduleKey] ?? moduleKey.toUpperCase()
  }));

export const IAM_V2_PHASE2_MODULE_ORDER = ['sales', 'finance', 'crm', 'hr', 'scm', 'assets', 'projects', 'reports'] as const;
export const IAM_V2_ROLLOUT_PRIORITY = new Map<string, number>(
  IAM_V2_PHASE2_MODULE_ORDER.map((moduleKey, index) => [moduleKey, index])
);
export const IAM_V2_ENFORCEMENT_MODULE_OPTIONS: FieldOption[] = [...MODULE_OPTIONS].sort((left, right) => {
  const leftPriority = IAM_V2_ROLLOUT_PRIORITY.get(left.value);
  const rightPriority = IAM_V2_ROLLOUT_PRIORITY.get(right.value);

  if (leftPriority !== undefined && rightPriority !== undefined) {
    return leftPriority - rightPriority;
  }
  if (leftPriority !== undefined) {
    return -1;
  }
  if (rightPriority !== undefined) {
    return 1;
  }

  return left.label.localeCompare(right.label, 'vi');
});
export const IAM_V2_MODE_OPTIONS: FieldOption[] = [
  { value: 'OFF', label: 'OFF (Tắt IAM v2)' },
  { value: 'SHADOW', label: 'SHADOW (Quan sát mismatch)' },
  { value: 'ENFORCE', label: 'ENFORCE (Chặn theo IAM v2)' }
];

export const ASSISTANT_SCOPE_OPTIONS: FieldOption[] = [
  { value: 'company', label: 'Toàn công ty' },
  { value: 'branch', label: 'Theo chi nhánh' },
  { value: 'department', label: 'Theo phòng ban' },
  { value: 'self', label: 'Chỉ dữ liệu cá nhân' }
];

export const ASSISTANT_ALLOWED_MODULE_OPTIONS: FieldOption[] = MODULE_OPTIONS.filter(
  (item) => item.value !== 'assistant' && item.value !== 'settings'
);

export const ROLE_OPTIONS: FieldOption[] = [
  { value: 'ADMIN', label: 'ADMIN' },
  { value: 'USER', label: 'USER' }
];

export const CURRENCY_OPTIONS: FieldOption[] = [
  { value: 'VND', label: 'VND (Việt Nam Đồng)' },
  { value: 'USD', label: 'USD (US Dollar)' }
];

export const DATE_FORMAT_OPTIONS: FieldOption[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }
];

export const NUMBER_FORMAT_OPTIONS: FieldOption[] = [
  { value: 'vi-VN', label: 'Việt Nam (1.234,56)' },
  { value: 'en-US', label: 'Mỹ (1,234.56)' }
];

export const TIMEZONE_OPTIONS: FieldOption[] = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Việt Nam (UTC+7)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (UTC+7)' },
  { value: 'UTC', label: 'UTC (quốc tế)' }
];

export const WEEKDAY_OPTIONS: FieldOption[] = [
  { value: 'monday', label: 'Thứ 2' },
  { value: 'sunday', label: 'Chủ nhật' }
];

export const INVOICE_TEMPLATE_OPTIONS: FieldOption[] = [
  { value: 'standard', label: 'Mẫu chuẩn' },
  { value: 'minimal', label: 'Mẫu tối giản' },
  { value: 'retail', label: 'Mẫu bán lẻ' }
];

export const DENSITY_OPTIONS: FieldOption[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' }
];

export const SECRET_REF_OPTIONS: FieldOption[] = [
  { value: '', label: 'Chưa cấu hình' },
  { value: 'BHTOT_API_KEY', label: 'BHTOT_API_KEY' },
  { value: 'AI_OPENAI_COMPAT_API_KEY', label: 'AI_OPENAI_COMPAT_API_KEY' },
  { value: 'AI_GEMINI_API_KEY', label: 'AI_GEMINI_API_KEY' },
  { value: 'ZALO_OA_ACCESS_TOKEN', label: 'ZALO_OA_ACCESS_TOKEN' },
  { value: 'ZALO_OA_WEBHOOK_SECRET', label: 'ZALO_OA_WEBHOOK_SECRET' },
  { value: 'PAYMENTS_BANK_WEBHOOK_SECRET', label: 'PAYMENTS_BANK_WEBHOOK_SECRET' },
  { value: 'MEILI_MASTER_KEY', label: 'MEILI_MASTER_KEY' }
];

export const CHECKOUT_INVOICE_TRIGGER_OPTIONS: FieldOption[] = [
  { value: 'ON_PAID', label: 'Khi thanh toán đủ' },
  { value: 'ON_ACTIVATED', label: 'Khi kích hoạt dịch vụ' },
  { value: 'MANUAL', label: 'Thủ công' }
];

export const CHECKOUT_ACTIVATION_MODE_OPTIONS: FieldOption[] = [
  { value: 'AUTO', label: 'AUTO' },
  { value: 'MANUAL', label: 'MANUAL' },
  { value: 'HYBRID', label: 'HYBRID' }
];

export const CHECKOUT_OVERRIDE_ROLE_OPTIONS: FieldOption[] = [
  { value: 'ADMIN', label: 'ADMIN' }
];

export const CHECKOUT_ORDER_RESET_RULE_OPTIONS: FieldOption[] = [
  { value: 'DAILY', label: 'Reset theo ngày' },
  { value: 'MONTHLY', label: 'Reset theo tháng' },
  { value: 'YEARLY', label: 'Reset theo năm' }
];

export const SEARCH_ENGINE_OPTIONS: FieldOption[] = [
  { value: 'sql', label: 'SQL nội bộ (ổn định)' },
  { value: 'meili_hybrid', label: 'Hybrid Search (Meilisearch + SQL)' }
];

export const BACKUP_CADENCE_OPTIONS: FieldOption[] = [
  { value: 'daily', label: 'Hàng ngày' },
  { value: 'weekly', label: 'Hàng tuần' },
  { value: 'monthly', label: 'Hàng tháng' }
];

export const PAYROLL_CYCLE_OPTIONS: FieldOption[] = [
  { value: 'monthly', label: 'Theo tháng' },
  { value: 'biweekly', label: '2 tuần/lần' },
  { value: 'weekly', label: 'Theo tuần' }
];

export const RECORD_ID_DISPLAY_MODE_OPTIONS: FieldOption[] = [
  { value: 'technical', label: 'Giữ ID kỹ thuật' },
  { value: 'compact', label: 'Mã rút gọn có cấu trúc' },
  { value: 'sequence', label: 'Số thứ tự tăng dần' }
];

export const FOREIGN_KEY_DISPLAY_MODE_OPTIONS: FieldOption[] = [
  { value: 'technical', label: 'Giữ nguyên ID liên kết' },
  { value: 'compact', label: 'Hiển thị mã rút gọn' }
];

export const POSITION_STATUS_OPTIONS: FieldOption[] = [
  { value: 'ACTIVE', label: 'ACTIVE' },
  { value: 'INACTIVE', label: 'INACTIVE' },
  { value: 'DRAFT', label: 'DRAFT' }
];

export const WIDGET_OPTIONS: FieldOption[] = [
  { value: 'line', label: 'Đường (Line)', previewImage: '/assets/images/charts/line.svg' },
  { value: 'bar', label: 'Cột (Bar)', previewImage: '/assets/images/charts/bar.svg' },
  { value: 'pie', label: 'Tròn (Pie)', previewImage: '/assets/images/charts/pie.svg' },
  { value: 'area', label: 'Vùng (Area)', previewImage: '/assets/images/charts/area.svg' },
  { value: 'composed', label: 'Đa chiều (Composed)', previewImage: '/assets/images/charts/composed.svg' },
  { value: 'radar', label: 'Radar (Radar)', previewImage: '/assets/images/charts/radar.svg' },
  { value: 'scatter', label: 'Phân tán (Scatter)', previewImage: '/assets/images/charts/scatter.svg' },
  { value: 'funnel', label: 'Phễu (Funnel)', previewImage: '/assets/images/charts/funnel.svg' }
];

export const REASON_TEMPLATES = [
  'Cập nhật chính sách vận hành',
  'Điều chỉnh phân quyền và bảo mật',
  'Chuẩn hóa hồ sơ doanh nghiệp',
  'Cập nhật tích hợp hệ thống',
  'Tối ưu tìm kiếm và hiệu năng',
  'Điều chỉnh vòng đời dữ liệu',
  'Tăng mức tự động hóa giám sát AI'
] as const;

export const ROLE_LABEL_MAP: Record<string, string> = {
  ADMIN: 'Admin',
  USER: 'Người dùng'
};

export const ACCESS_SECURITY_ROLE_PLAYBOOK = [
  {
    role: 'ADMIN',
    title: 'Thiết lập toàn cục',
    steps: [
      'Cấu hình chính sách đăng nhập/mật khẩu theo tiêu chuẩn công ty.',
      'Quản trị phân quyền hệ thống và ma trận quyền theo vị trí.',
      'Rà soát nhật ký + chính sách AI trước khi lưu.'
    ]
  },
  {
    role: 'USER',
    title: 'Theo dõi theo phạm vi được cấp',
    steps: [
      'Kiểm tra chính sách đăng nhập áp dụng cho tài khoản của bạn.',
      'Theo dõi tab nhật ký & Trợ lý AI theo phạm vi đã cấp.',
      'Đề xuất thay đổi cho Admin khi cần mở rộng quyền.'
    ]
  }
] as const;

export type SettingsLayoutPayload = {
  groupedSidebar?: Array<{
    id?: string;
    label?: string;
    domains?: unknown;
  }>;
  domainTabs?: Record<string, unknown>;
  advancedMode?: {
    defaultByRole?: Record<string, unknown>;
  };
};

export function isDomainKey(value: unknown): value is DomainKey {
  return typeof value === 'string' && DOMAIN_ORDER.includes(value as DomainKey);
}

export function normalizeLayoutGroups(layout: SettingsLayoutPayload | null) {
  const grouped = Array.isArray(layout?.groupedSidebar) ? layout.groupedSidebar : [];
  const normalized = grouped
    .map((group) => {
      const domainsRaw = Array.isArray(group.domains) ? group.domains : [];
      const domains = domainsRaw.filter((item): item is DomainKey => isDomainKey(item));
      if (!group.id || !group.label || domains.length === 0) {
        return null;
      }
      return {
        id: String(group.id),
        label: String(group.label),
        domains
      };
    })
    .filter((item): item is { id: string; label: string; domains: DomainKey[] } => Boolean(item));

  if (normalized.length === 0) {
    return DOMAIN_GROUPS;
  }
  return normalized;
}

export function normalizeLayoutDomainTabs(layout: SettingsLayoutPayload | null, domain: DomainKey): DomainTabConfig[] | null {
  const domainTabsMap = toRecord(layout?.domainTabs);
  const rawTabs = domainTabsMap[domain];
  if (!Array.isArray(rawTabs)) {
    return null;
  }

  const normalized: DomainTabConfig[] = [];
  for (const rawTab of rawTabs) {
    const tab = toRecord(rawTab);
    const key = String(tab.key ?? '').trim();
    const label = String(tab.label ?? '').trim();
    if (!key || !label) {
      continue;
    }

    const next: DomainTabConfig = { key, label };
    if (Array.isArray(tab.sectionIds)) {
      next.sectionIds = tab.sectionIds.map((item) => String(item)).filter(Boolean);
    }
    if (tab.showOrgStructure === true) {
      next.showOrgStructure = true;
    }
    if (tab.showHrAccounts === true) {
      next.showHrAccounts = true;
    }
    if (tab.showAccessMatrix === true) {
      next.showAccessMatrix = true;
    }
    normalized.push(next);
  }

  return normalized.length > 0 ? normalized : null;
}

export function resolveAdvancedModeDefaultByLayout(role: string | null | undefined, layout: SettingsLayoutPayload | null) {
  const normalizedRole = String(role ?? '').trim().toUpperCase();
  const defaultByRole = toRecord(layout?.advancedMode?.defaultByRole);
  const candidate = defaultByRole[normalizedRole];
  if (typeof candidate === 'boolean') {
    return candidate;
  }
  return resolveDefaultAdvancedMode(role);
}

export const CONFLICT_POLICY_OPTIONS: FieldOption[] = [
  { value: 'DENY_OVERRIDES', label: 'DENY ưu tiên cao nhất' },
  { value: 'ALLOW_OVERRIDES', label: 'ALLOW ưu tiên cao nhất (không khuyến nghị)' }
];

export const PERMISSION_ACTIONS: PermissionActionKey[] = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE'];
export const IAM_SCOPE_MODE_OPTIONS: Array<{ value: IamScopeMode; label: string }> = [
  { value: 'SELF', label: 'SELF (chỉ bản thân)' },
  { value: 'SUBTREE', label: 'SUBTREE (cây đơn vị)' },
  { value: 'UNIT_FULL', label: 'UNIT_FULL (đơn vị đầy đủ)' }
];

export const PERMISSION_MODULE_KEYS = [
  'crm',
  'sales',
  'catalog',
  'hr',
  'finance',
  'scm',
  'assets',
  'projects',
  'workflows',
  'reports',
  'audit',
  'settings',
  'notifications',
  'search',
  'integrations'
] as const;

// ── Checkout required fields (từ fieldConfig mặc định) ──
// Bảo hiểm: gồm trường nhập của Sale + trường trích xuất tự động từ giấy chứng nhận
export const INSURANCE_REQUIRED_FIELD_OPTIONS: FieldOption[] = [
  // ── Trường Sale nhập khi tạo đơn ──
  { value: 'certificateLink', label: 'Link giấy chứng nhận BH' },
  { value: 'certificateFileId', label: 'Upload giấy chứng nhận (PDF/ảnh)' },

  // ── Trường VEHICLE (trích xuất tự động, dùng chung ô tô & xe máy) ──
  { value: 'ownerFullName', label: '🚗 Tên chủ xe' },
  { value: 'ownerAddress', label: '🚗 Địa chỉ chủ xe' },
  { value: 'plateNumber', label: '🚗 Biển số' },
  { value: 'chassisNumber', label: '🚗 Số khung' },
  { value: 'engineNumber', label: '🚗 Số máy' },
  { value: 'vehicleType', label: '🚗 Kiểu xe' },
  { value: 'seatCount', label: '🚗 Số chỗ' },
  { value: 'loadKg', label: '🚗 Tải trọng (kg)' },

  // ── Trường AUTO INSURANCE POLICY DETAIL (BH ô tô) ──
  { value: 'auto.soGCN', label: '🛡️ Ô tô – Số giấy chứng nhận' },
  { value: 'auto.policyFromAt', label: '🛡️ Ô tô – Bắt đầu bảo hiểm' },
  { value: 'auto.policyToAt', label: '🛡️ Ô tô – Kết thúc bảo hiểm' },
  { value: 'auto.premiumWithVat', label: '🛡️ Ô tô – Phí BH TNDS gồm VAT' },
  { value: 'auto.issuedAt', label: '🛡️ Ô tô – Ngày cấp' },
  { value: 'auto.voluntary', label: '🛡️ Ô tô – Có tự nguyện?' },
  { value: 'auto.tnDriverSeatCount', label: '🛡️ Ô tô – Số chỗ ngồi mua TN' },
  { value: 'auto.tnPassengerSeatCount', label: '🛡️ Ô tô – Số hành khách mua TN' },
  { value: 'auto.tnInsuredAmountPerEvent', label: '🛡️ Ô tô – Số tiền BH/người/vụ (TN)' },
  { value: 'auto.tnPremium', label: '🛡️ Ô tô – Phí BH tự nguyện' },

  // ── Trường MOTO INSURANCE POLICY DETAIL (BH xe máy) ──
  { value: 'moto.soGCN', label: '🏍️ Xe máy – Số giấy chứng nhận' },
  { value: 'moto.policyFromAt', label: '🏍️ Xe máy – Bắt đầu bảo hiểm' },
  { value: 'moto.policyToAt', label: '🏍️ Xe máy – Kết thúc bảo hiểm' },
  { value: 'moto.premiumWithVat', label: '🏍️ Xe máy – Phí BH TNDS gồm VAT' },
  { value: 'moto.issuedAt', label: '🏍️ Xe máy – Ngày cấp' },
  { value: 'moto.voluntary', label: '🏍️ Xe máy – Có tự nguyện?' },
  { value: 'moto.tnInsuredPersons', label: '🏍️ Xe máy – Số người mua TN' },
  { value: 'moto.tnInsuredAmountPerEvent', label: '🏍️ Xe máy – Số tiền BH/người/vụ (TN)' },
  { value: 'moto.tnPremium', label: '🏍️ Xe máy – Phí BH tự nguyện' },

  // ── Hiệu lực đơn (ánh xạ tự động từ policy) ──
  { value: 'effectiveFrom', label: '📅 Hiệu lực từ (= policyFromAt)' },
  { value: 'effectiveTo', label: '📅 Hiệu lực đến (= policyToAt)' }
];

// Viễn thông: trường cơ bản + chu kỳ + SĐT dùng dịch vụ
export const TELECOM_REQUIRED_FIELD_OPTIONS: FieldOption[] = [
  { value: 'packageCode', label: 'Mã gói cước / SIM' },
  { value: 'billingCycle', label: 'Chu kỳ thanh toán (ngày)' },

  // ── Hiệu lực theo chu kỳ ──
  { value: 'effectiveFrom', label: '📅 Hiệu lực từ' },
  { value: 'effectiveTo', label: '📅 Hiệu lực đến (= effectiveFrom + chu kỳ)' },

  // ── SĐT dùng dịch vụ (mở khi tick "khác SĐT liên lạc") ──
  { value: 'differentServicePhone', label: 'SĐT dịch vụ khác SĐT liên lạc' },
  { value: 'servicePhone', label: '📱 SĐT dùng dịch vụ (lưu vào hồ sơ KH)' }
];
export const DIGITAL_REQUIRED_FIELD_OPTIONS: FieldOption[] = [
  { value: 'planCode', label: 'Mã gói dịch vụ' },
  { value: 'termDays', label: 'Thời hạn (ngày)' },
  { value: 'startDate', label: 'Ngày bắt đầu' }
];

// ── Effective date mapping presets (dropdown thay cho nhập JSON path) ──
export const EFFECTIVE_FROM_INS_OPTIONS: FieldOption[] = [
  { value: 'autoPolicy.policyFromAt', label: 'Ngày BH ô tô bắt đầu (autoPolicy.policyFromAt)' },
  { value: 'motoPolicy.policyFromAt', label: 'Ngày BH xe máy bắt đầu (motoPolicy.policyFromAt)' },
  { value: 'autoPolicy.policyFromAt|motoPolicy.policyFromAt', label: 'Tự động theo loại BH (ô tô hoặc xe máy)' }
];
export const EFFECTIVE_TO_INS_OPTIONS: FieldOption[] = [
  { value: 'autoPolicy.policyToAt', label: 'Ngày BH ô tô kết thúc (autoPolicy.policyToAt)' },
  { value: 'motoPolicy.policyToAt', label: 'Ngày BH xe máy kết thúc (motoPolicy.policyToAt)' },
  { value: 'autoPolicy.policyToAt|motoPolicy.policyToAt', label: 'Tự động theo loại BH (ô tô hoặc xe máy)' }
];
export const EFFECTIVE_FROM_TEL_OPTIONS: FieldOption[] = [
  { value: 'activationAt', label: 'Ngày kích hoạt gói cước (activationAt)' }
];
export const EFFECTIVE_TO_TEL_OPTIONS: FieldOption[] = [
  { value: 'telecom.currentExpiryAt', label: 'Ngày hết hạn gói hiện tại (telecom.currentExpiryAt)' }
];
export const EFFECTIVE_FROM_DIG_OPTIONS: FieldOption[] = [
  { value: 'service.startsAt', label: 'Ngày bắt đầu dịch vụ (service.startsAt)' }
];
export const EFFECTIVE_TO_DIG_OPTIONS: FieldOption[] = [
  { value: 'service.endsAt', label: 'Ngày kết thúc dịch vụ (service.endsAt)' }
];

// ── VietQR ngân hàng phổ biến ──
export const VIETQR_BANK_OPTIONS: FieldOption[] = [
  { value: '', label: '-- Chưa chọn ngân hàng --' },
  { value: 'MB', label: 'MB Bank (Ngân hàng Quân đội)' },
  { value: 'VCB', label: 'Vietcombank (Ngoại thương)' },
  { value: 'TCB', label: 'Techcombank (Kỹ thương)' },
  { value: 'ACB', label: 'ACB (Á Châu)' },
  { value: 'VPB', label: 'VPBank (Việt Nam Thịnh Vượng)' },
  { value: 'TPB', label: 'TPBank (Tiên Phong)' },
  { value: 'BIDV', label: 'BIDV (Đầu tư & Phát triển)' },
  { value: 'CTG', label: 'VietinBank (Công thương)' },
  { value: 'STB', label: 'Sacombank' },
  { value: 'HDB', label: 'HDBank (Phát triển TP.HCM)' },
  { value: 'SHB', label: 'SHB (Sài Gòn - Hà Nội)' },
  { value: 'MSB', label: 'MSB (Hàng Hải)' },
  { value: 'OCB', label: 'OCB (Phương Đông)' },
  { value: 'LPB', label: 'LienVietPostBank' },
  { value: 'EIB', label: 'Eximbank (Xuất nhập khẩu)' },
  { value: 'NAB', label: 'Nam A Bank' },
  { value: 'SCB', label: 'SCB (Sài Gòn)' },
  { value: 'VAB', label: 'VietABank (Việt Á)' },
  { value: 'VIETBANK', label: 'VietBank (Việt Nam Thương Tín)' },
  { value: 'ABB', label: 'ABBank (An Bình)' },
  { value: 'BAB', label: 'Bắc Á Bank' },
  { value: 'CAKE', label: 'CAKE (VPBank số)' },
  { value: 'UBANK', label: 'Ubank (VPBank số)' }
];

// ── Lịch đối soát (Reconcile schedule) presets ──
export const RECONCILE_SCHEDULE_OPTIONS: FieldOption[] = [
  { value: '0 */1 * * *', label: 'Mỗi 1 giờ' },
  { value: '0 */2 * * *', label: 'Mỗi 2 giờ (mặc định)' },
  { value: '0 */4 * * *', label: 'Mỗi 4 giờ' },
  { value: '0 */6 * * *', label: 'Mỗi 6 giờ' },
  { value: '0 */12 * * *', label: 'Mỗi 12 giờ' },
  { value: '0 0 * * *', label: 'Mỗi ngày lúc 00:00' },
  { value: '0 8 * * *', label: 'Mỗi ngày lúc 08:00 sáng' }
];

// ── Chế độ kích hoạt (với mô tả rõ) ──
export const CHECKOUT_ACTIVATION_MODE_OPTIONS_V2: FieldOption[] = [
  { value: 'AUTO', label: 'Tự động kích hoạt khi thanh toán đủ' },
  { value: 'MANUAL', label: 'Chờ nhân viên kích hoạt thủ công' },
  { value: 'HYBRID', label: 'Tự động + cho phép ghi đè thủ công' }
];

export const AI_OCR_PROVIDER_KIND_OPTIONS: FieldOption[] = [
  { value: 'gemini', label: 'Gemini (khuyến nghị)' },
  { value: 'openai_compat', label: 'OpenAI-compatible' }
];

export const AI_KEY_ROTATION_MODE_OPTIONS: FieldOption[] = [
  { value: 'fallback', label: 'Fallback khi lỗi' },
  { value: 'round_robin', label: 'Round-robin mỗi request' },
  { value: 'manual', label: 'Chọn thủ công' }
];

export const DOMAIN_CONFIG: Record<DomainKey, DomainConfig> = {
  org_profile: {
    title: 'Hồ sơ doanh nghiệp',
    description: 'Thiết lập thông tin doanh nghiệp, nhận diện thương hiệu và chứng từ.',
    sections: [
      {
        id: 'org-base',
        title: 'Thông tin doanh nghiệp',
        fields: [
          { id: 'org-company', path: 'companyName', label: 'Tên công ty', type: 'text', placeholder: SYSTEM_PROFILE.companyName },
          { id: 'org-branch', path: 'branchName', label: 'Đơn vị vận hành', type: 'text', placeholder: 'Vận hành trung tâm' },
          { id: 'org-tax', path: 'taxCode', label: 'Mã số thuế', type: 'text' },
          { id: 'org-address', path: 'address', label: 'Địa chỉ', type: 'textarea' },
          { id: 'org-email', path: 'contactEmail', label: 'Email liên hệ', type: 'text' },
          { id: 'org-phone', path: 'contactPhone', label: 'Số điện thoại', type: 'text' },
          { id: 'org-modules', path: 'enabledModules', label: 'Phân hệ đang bật', type: 'multiSelect', options: MODULE_OPTIONS }
        ]
      },
      {
        id: 'org-branding',
        title: 'Nhận diện & chứng từ',
        fields: [
          { id: 'org-logo', path: 'branding.logoUrl', label: 'Link logo', type: 'text', placeholder: 'https://...' },
          { id: 'org-primary-color', path: 'branding.primaryColor', label: 'Màu thương hiệu chính', type: 'color', placeholder: '#0a5f38' },
          { id: 'org-invoice-template', path: 'documentLayout.invoiceTemplate', label: 'Mẫu hóa đơn', type: 'select', options: INVOICE_TEMPLATE_OPTIONS },
          { id: 'org-seal', path: 'documentLayout.showCompanySeal', label: 'Hiển thị dấu công ty trên chứng từ', type: 'switch' }
        ]
      },
      {
        id: 'org-dashboard-widgets',
        title: 'Cấu hình hiển thị Widget báo cáo',
        description: 'Tùy chỉnh loại biểu đồ hiển thị trên Dashboard Executive của từng phân hệ.',
        fields: [
          { id: 'widget-sales', path: 'dashboardWidgets.sales', label: 'Báo cáo bán hàng (Sales)', type: 'multiSelect', options: WIDGET_OPTIONS },
          { id: 'widget-finance', path: 'dashboardWidgets.finance', label: 'Báo cáo tài chính (Finance)', type: 'multiSelect', options: WIDGET_OPTIONS },
          { id: 'widget-hr', path: 'dashboardWidgets.hr', label: 'Báo cáo nhân lực (HR)', type: 'multiSelect', options: WIDGET_OPTIONS },
          { id: 'widget-crm', path: 'dashboardWidgets.crm', label: 'Báo cáo khách hàng (CRM)', type: 'multiSelect', options: WIDGET_OPTIONS },
          { id: 'widget-scm', path: 'dashboardWidgets.scm', label: 'Báo cáo chuỗi cung ứng (SCM)', type: 'multiSelect', options: WIDGET_OPTIONS },
          { id: 'widget-reports', path: 'dashboardWidgets.reports', label: 'Phân hệ tổng hợp Reports', type: 'multiSelect', options: WIDGET_OPTIONS }
        ]
      },
      {
        id: 'org-appearance',
        title: 'Appearance runtime',
        description: 'Tùy biến giao diện theo token. Mặc định hệ thống giữ tone xanh thương hiệu.',
        fields: [
          { id: 'appearance-primary', path: 'branding.appearance.primary', label: 'primary', type: 'color', placeholder: '#167746' },
          { id: 'appearance-primary-hover', path: 'branding.appearance.primaryHover', label: 'primaryHover', type: 'color', placeholder: '#115f38' },
          { id: 'appearance-primary-soft', path: 'branding.appearance.primarySoft', label: 'primarySoft', type: 'color', placeholder: '#e8f4ed' },
          { id: 'appearance-topbar-bg', path: 'branding.appearance.topbarBg', label: 'topbarBg', type: 'color', placeholder: '#f8faf8' },
          { id: 'appearance-sidebar-bg', path: 'branding.appearance.sidebarBg', label: 'sidebarBg', type: 'color', placeholder: '#f8faf8' },
          { id: 'appearance-sidebar-text', path: 'branding.appearance.sidebarText', label: 'sidebarText', type: 'color', placeholder: '#3c4a41' },
          { id: 'appearance-surface', path: 'branding.appearance.surface', label: 'surface', type: 'color', placeholder: '#ffffff' },
          { id: 'appearance-surface-muted', path: 'branding.appearance.surfaceMuted', label: 'surfaceMuted', type: 'color', placeholder: '#f2f7f3' },
          { id: 'appearance-border', path: 'branding.appearance.border', label: 'border', type: 'color', placeholder: '#dfe5e0' },
          { id: 'appearance-success', path: 'branding.appearance.success', label: 'success', type: 'color', placeholder: '#059669' },
          { id: 'appearance-warning', path: 'branding.appearance.warning', label: 'warning', type: 'color', placeholder: '#d97706' },
          { id: 'appearance-danger', path: 'branding.appearance.danger', label: 'danger', type: 'color', placeholder: '#dc2626' },
          { id: 'appearance-info', path: 'branding.appearance.info', label: 'info', type: 'color', placeholder: '#2563eb' },
          { id: 'appearance-chart-1', path: 'branding.appearance.chart1', label: 'chart1', type: 'color', placeholder: '#10b981' },
          { id: 'appearance-chart-2', path: 'branding.appearance.chart2', label: 'chart2', type: 'color', placeholder: '#3b82f6' },
          { id: 'appearance-chart-3', path: 'branding.appearance.chart3', label: 'chart3', type: 'color', placeholder: '#f59e0b' },
          { id: 'appearance-chart-4', path: 'branding.appearance.chart4', label: 'chart4', type: 'color', placeholder: '#ef4444' },
          { id: 'appearance-chart-5', path: 'branding.appearance.chart5', label: 'chart5', type: 'color', placeholder: '#8b5cf6' },
          { id: 'appearance-chart-6', path: 'branding.appearance.chart6', label: 'chart6', type: 'color', placeholder: '#14b8a6' },
          { id: 'appearance-radius-sm', path: 'branding.appearance.radiusSm', label: 'radiusSm', type: 'number', min: 0, max: 24 },
          { id: 'appearance-radius-md', path: 'branding.appearance.radiusMd', label: 'radiusMd', type: 'number', min: 0, max: 24 },
          { id: 'appearance-radius-lg', path: 'branding.appearance.radiusLg', label: 'radiusLg', type: 'number', min: 0, max: 32 },
          { id: 'appearance-shadow-sm', path: 'branding.appearance.shadowSm', label: 'shadowSm', type: 'text', placeholder: '0 1px 2px rgb(0 0 0 / 0.05)' },
          { id: 'appearance-shadow-md', path: 'branding.appearance.shadowMd', label: 'shadowMd', type: 'text', placeholder: '0 10px 30px rgb(15 30 20 / 0.08)' },
          { id: 'appearance-density', path: 'branding.appearance.density', label: 'density', type: 'select', options: DENSITY_OPTIONS },
          { id: 'appearance-font-scale', path: 'branding.appearance.fontScale', label: 'fontScale', type: 'number', min: 0.85, max: 1.3, step: 0.05 }
        ]
      }
    ]
  },
  locale_calendar: {
    title: 'Ngôn ngữ và lịch',
    description: 'Chuẩn hóa múi giờ, định dạng hiển thị và năm tài chính.',
    sections: [
      {
        id: 'locale-general',
        title: 'Thiết lập hiển thị',
        fields: [
          { id: 'locale-timezone', path: 'timezone', label: 'Múi giờ', type: 'select', options: TIMEZONE_OPTIONS },
          { id: 'locale-date-format', path: 'dateFormat', label: 'Định dạng ngày', type: 'select', options: DATE_FORMAT_OPTIONS },
          { id: 'locale-number-format', path: 'numberFormat', label: 'Định dạng số', type: 'select', options: NUMBER_FORMAT_OPTIONS },
          { id: 'locale-currency', path: 'currency', label: 'Đơn vị tiền tệ', type: 'select', options: CURRENCY_OPTIONS },
          { id: 'locale-first-day', path: 'firstDayOfWeek', label: 'Ngày bắt đầu tuần', type: 'select', options: WEEKDAY_OPTIONS },
          { id: 'locale-fiscal-month', path: 'fiscalYearStartMonth', label: 'Tháng bắt đầu năm tài chính', type: 'number', min: 1, max: 12 }
        ]
      }
    ]
  },
  access_security: {
    title: 'Bảo mật truy cập',
    description: 'Thiết lập bảo mật tài khoản và phân quyền chỉnh cấu hình theo miền.',
    sections: [
      {
        id: 'security-session',
        title: 'Phiên đăng nhập',
        fields: [
          { id: 'security-timeout', path: 'sessionTimeoutMinutes', label: 'Tự đăng xuất sau', type: 'number', unit: 'phút', min: 5, max: 1440 },
          { id: 'security-mfa', path: 'loginPolicy.mfaRequired', label: 'Bắt buộc xác thực 2 bước (MFA)', type: 'switch' },
          { id: 'security-attempts', path: 'loginPolicy.maxFailedAttempts', label: 'Số lần nhập sai tối đa', type: 'number', min: 1, max: 20 },
          { id: 'security-lockout', path: 'loginPolicy.lockoutMinutes', label: 'Khóa đăng nhập tạm thời', type: 'number', unit: 'phút', min: 1, max: 240 }
        ]
      },
      {
        id: 'security-password',
        title: 'Chính sách mật khẩu',
        fields: [
          { id: 'security-pass-length', path: 'passwordPolicy.minLength', label: 'Độ dài mật khẩu tối thiểu', type: 'number', min: 6, max: 64 },
          { id: 'security-pass-upper', path: 'passwordPolicy.requireUppercase', label: 'Yêu cầu chữ in hoa', type: 'switch' },
          { id: 'security-pass-number', path: 'passwordPolicy.requireNumber', label: 'Yêu cầu chữ số', type: 'switch' },
          { id: 'security-pass-special', path: 'passwordPolicy.requireSpecial', label: 'Yêu cầu ký tự đặc biệt', type: 'switch' },
          { id: 'security-pass-rotate', path: 'passwordPolicy.rotateDays', label: 'Chu kỳ đổi mật khẩu', type: 'number', unit: 'ngày', min: 0, max: 3650 }
        ]
      },
      {
        id: 'security-permission-engine',
        title: 'Động cơ phân quyền theo hành động',
        fields: [
          {
            id: 'security-super-admin-legacy',
            path: 'superAdminIds',
            label: 'Super admin khẩn cấp (legacy)',
            helper: 'Danh sách user ID được phép override khẩn cấp.',
            type: 'managedList',
            managedListType: 'userId'
          },
          { id: 'security-perm-enabled', path: 'permissionPolicy.enabled', label: 'Bật phân quyền chi tiết', type: 'switch' },
          { id: 'security-perm-conflict', path: 'permissionPolicy.conflictPolicy', label: 'Chính sách xung đột quyền', type: 'select', options: CONFLICT_POLICY_OPTIONS },
          {
            id: 'security-perm-super-admin-ids',
            path: 'permissionPolicy.superAdminIds',
            label: 'Danh sách Super admin (ID)',
            helper: 'ID được dùng cho chính sách phân quyền chi tiết.',
            type: 'managedList',
            managedListType: 'userId'
          },
          {
            id: 'security-perm-super-admin-emails',
            path: 'permissionPolicy.superAdminEmails',
            label: 'Danh sách Super admin (Email)',
            helper: 'Email được chuẩn hóa chữ thường khi lưu.',
            type: 'managedList',
            managedListType: 'email'
          }
        ]
      },
      {
        id: 'security-iam-v2-rollout',
        title: 'IAM v2 rollout (Phase 2)',
        description: 'Áp dụng SHADOW trước, ENFORCE sau theo module. Thứ tự khuyến nghị: sales -> finance -> crm -> hr -> scm -> assets -> projects -> reports.',
        fields: [
          { id: 'security-iamv2-enabled', path: 'iamV2.enabled', label: 'Bật IAM v2', type: 'switch' },
          { id: 'security-iamv2-mode', path: 'iamV2.mode', label: 'Chế độ IAM v2', type: 'select', options: IAM_V2_MODE_OPTIONS },
          {
            id: 'security-iamv2-enforcement-modules',
            path: 'iamV2.enforcementModules',
            label: 'Module áp dụng IAM v2',
            helper: 'Để trống = áp dụng toàn bộ module hợp lệ. Khuyến nghị rollout theo thứ tự ưu tiên ở trên.',
            type: 'multiSelect',
            options: IAM_V2_ENFORCEMENT_MODULE_OPTIONS
          },
          {
            id: 'security-iamv2-protect-admin-core',
            path: 'iamV2.protectAdminCore',
            label: 'Bảo vệ quyền lõi ADMIN',
            type: 'switch',
            isAdvanced: true
          },
          {
            id: 'security-iamv2-deny-self-elevation',
            path: 'iamV2.denySelfElevation',
            label: 'Chặn tự nâng quyền',
            type: 'switch',
            isAdvanced: true
          }
        ]
      },
      {
        id: 'security-audit-matrix',
        title: 'Phân quyền nhật ký hệ thống theo cấp quản lý',
        description: 'Phạm vi nhật ký tính theo người thực hiện. ADMIN xem toàn công ty.',
        fields: [
          { id: 'security-audit-policy-enabled', path: 'auditViewPolicy.enabled', label: 'Bật phân quyền nhật ký theo nhóm quản lý', type: 'switch' },
          { id: 'security-audit-director', path: 'auditViewPolicy.groups.DIRECTOR.enabled', label: 'Giám đốc: xem toàn công ty', type: 'switch' },
          { id: 'security-audit-branch', path: 'auditViewPolicy.groups.BRANCH_MANAGER.enabled', label: 'Trưởng chi nhánh: xem trong phạm vi chi nhánh', type: 'switch' },
          { id: 'security-audit-department', path: 'auditViewPolicy.groups.DEPARTMENT_MANAGER.enabled', label: 'Trưởng phòng: xem trong phạm vi phòng ban', type: 'switch' },
          { id: 'security-audit-deny-ungrouped', path: 'auditViewPolicy.denyIfUngroupedManager', label: 'Chặn USER chưa được gán vào đơn vị tổ chức', type: 'switch' }
        ]
      },
      {
        id: 'security-assistant-access',
        title: 'Chính sách truy cập Trợ lý AI',
        description: 'Giới hạn dữ liệu AI theo vai trò và chặn vượt quyền.',
        fields: [
          { id: 'assistant-policy-enabled', path: 'assistantAccessPolicy.enabled', label: 'Bật chính sách Trợ lý AI', type: 'switch' },
          { id: 'assistant-policy-admin-scope', path: 'assistantAccessPolicy.roleScopeDefaults.ADMIN', label: 'Phạm vi mặc định cho ADMIN', type: 'select', options: ASSISTANT_SCOPE_OPTIONS },
          { id: 'assistant-policy-user-scope', path: 'assistantAccessPolicy.roleScopeDefaults.USER', label: 'Phạm vi mặc định cho USER', type: 'select', options: ASSISTANT_SCOPE_OPTIONS },
          { id: 'assistant-policy-permission-engine', path: 'assistantAccessPolicy.enforcePermissionEngine', label: 'Bắt buộc qua động cơ phân quyền', type: 'switch' },
          { id: 'assistant-policy-deny-no-scope', path: 'assistantAccessPolicy.denyIfNoScope', label: 'Từ chối khi không xác định được phạm vi', type: 'switch' },
          { id: 'assistant-policy-allowed-modules', path: 'assistantAccessPolicy.allowedModules', label: 'Phân hệ AI được phép truy vấn', type: 'multiSelect', options: ASSISTANT_ALLOWED_MODULE_OPTIONS },
          { id: 'assistant-policy-channel-scope', path: 'assistantAccessPolicy.chatChannelScopeEnforced', label: 'Bắt buộc khớp phạm vi khi gửi chat', type: 'switch' }
        ]
      },
      {
        id: 'security-settings-editors',
        title: 'Phân quyền chỉnh cấu hình',
        description: 'ADMIN luôn có quyền. Người dùng khác chỉ sửa được miền đã cấp.',
        fields: [
          {
            id: 'security-policy-user',
            path: 'settingsEditorPolicy.domainRoleMap.USER',
            label: 'Miền cấu hình cho USER',
            type: 'multiSelect',
            options: DOMAIN_OPTIONS
          },
          {
            id: 'security-policy-users',
            path: 'settingsEditorPolicy.userDomainMap',
            label: 'Phân quyền theo từng người',
            helper: 'Nhập theo dòng: email_hoặc_userId: domain1, domain2',
            type: 'userDomainMap',
            placeholder: 'manager@erp.vn: org_profile, finance_controls'
          }
        ]
      }
    ]
  },
  approval_matrix: {
    title: 'Ma trận phê duyệt',
    description: 'Định nghĩa tuyến duyệt theo phân hệ, giá trị giao dịch và cấp thẩm quyền.',
    sections: [
      {
        id: 'approval-rule-default',
        title: 'Quy tắc mặc định',
        fields: [
          { id: 'approval-module', path: 'rules.0.module', label: 'Phân hệ áp dụng', type: 'select', options: MODULE_OPTIONS },
          { id: 'approval-min-amount', path: 'rules.0.minAmount', label: 'Giá trị bắt đầu duyệt', type: 'number', unit: 'VND', min: 0 },
          { id: 'approval-role', path: 'rules.0.approverRole', label: 'Vai trò duyệt', type: 'select', options: ROLE_OPTIONS },
          { id: 'approval-dept', path: 'rules.0.approverDepartment', label: 'Phòng ban duyệt', type: 'text', placeholder: 'Kế toán / Kinh doanh' }
        ]
      },
      {
        id: 'approval-escalation',
        title: 'Leo thang & ủy quyền',
        fields: [
          { id: 'approval-escalation-enabled', path: 'escalation.enabled', label: 'Bật leo thang tự động', type: 'switch' },
          { id: 'approval-escalation-sla', path: 'escalation.slaHours', label: 'SLA leo thang', type: 'number', unit: 'giờ', min: 1, max: 240 },
          { id: 'approval-escalation-role', path: 'escalation.escalateToRole', label: 'Vai trò nhận leo thang', type: 'select', options: ROLE_OPTIONS },
          { id: 'approval-delegation-enabled', path: 'delegation.enabled', label: 'Cho phép ủy quyền duyệt', type: 'switch' },
          { id: 'approval-delegation-days', path: 'delegation.maxDays', label: 'Thời gian ủy quyền tối đa', type: 'number', unit: 'ngày', min: 1, max: 90 }
        ]
      }
    ]
  },
  finance_controls: {
    title: 'Kiểm soát tài chính',
    description: 'Quản lý kỳ kế toán, đánh số chứng từ, thanh toán, VietQR và hóa đơn tự động.',
    sections: [
      {
        id: 'finance-period',
        title: 'Kỳ kế toán',
        fields: [
          {
            id: 'finance-locked-periods',
            path: 'postingPeriods.lockedPeriods',
            label: 'Danh sách kỳ đã khóa',
            helper: 'Quản lý theo từng kỳ, định dạng YYYY-MM.',
            type: 'managedList',
            managedListType: 'period'
          },
          { id: 'finance-backdate', path: 'postingPeriods.allowBackdateDays', label: 'Cho phép hạch toán lùi tối đa', type: 'number', unit: 'ngày', min: 0, max: 31 },
          { id: 'finance-cutoff', path: 'transactionCutoffHour', label: 'Giờ cut-off giao dịch', type: 'number', unit: 'giờ', min: 0, max: 23 }
        ]
      },
      {
        id: 'finance-numbering',
        title: 'Đánh số chứng từ',
        fields: [
          { id: 'finance-invoice-prefix', path: 'documentNumbering.invoicePrefix', label: 'Tiền tố hóa đơn', type: 'text', placeholder: 'INV' },
          { id: 'finance-order-prefix', path: 'documentNumbering.orderPrefix', label: 'Tiền tố đơn hàng', type: 'text', placeholder: 'SO' },
          { id: 'finance-auto-number', path: 'documentNumbering.autoNumber', label: 'Tự động tăng số chứng từ', type: 'switch' },
          {
            id: 'finance-record-id-mode',
            path: 'recordIdentity.mode',
            label: 'Hiển thị cột ID chính',
            helper: 'Áp dụng cho cột Id ở các bảng dữ liệu chuẩn.',
            type: 'select',
            options: RECORD_ID_DISPLAY_MODE_OPTIONS
          },
          {
            id: 'finance-record-id-foreign-mode',
            path: 'recordIdentity.foreignKeyMode',
            label: 'Hiển thị cột ID liên kết (employeeId, customerId...)',
            type: 'select',
            options: FOREIGN_KEY_DISPLAY_MODE_OPTIONS
          },
          {
            id: 'finance-record-id-prefix',
            path: 'recordIdentity.prefix',
            label: 'Tiền tố mã hiển thị',
            helper: 'Dùng cho mode rút gọn/số thứ tự (ví dụ: ID, REC, DOC).',
            type: 'text',
            placeholder: 'ID'
          },
          {
            id: 'finance-record-id-seq-padding',
            path: 'recordIdentity.sequencePadding',
            label: 'Độ dài số thứ tự',
            type: 'number',
            min: 2,
            max: 10
          },
          {
            id: 'finance-record-id-compact-length',
            path: 'recordIdentity.compactLength',
            label: 'Số ký tự hậu tố khi rút gọn',
            type: 'number',
            min: 4,
            max: 20
          }
        ]
      },
      {
        id: 'finance-order-numbering',
        title: 'Mã đơn hàng theo nhóm',
        description: 'Quy tắc sinh mã đơn hàng tự động theo nhóm sản phẩm (Insurance/Telecom/Digital).',
        fields: [
          { id: 'finance-order-number-reset-rule', path: 'orderNumberingPolicy.resetRule', label: 'Reset rule', type: 'select', options: CHECKOUT_ORDER_RESET_RULE_OPTIONS },
          { id: 'finance-order-number-seq-padding', path: 'orderNumberingPolicy.sequencePadding', label: 'Độ dài số thứ tự', type: 'number', min: 3, max: 12 },
          { id: 'finance-order-number-prefix-ins', path: 'orderNumberingPolicy.groupPrefixes.INSURANCE', label: 'INSURANCE - Prefix', type: 'text', placeholder: 'INS' },
          { id: 'finance-order-number-prefix-tel', path: 'orderNumberingPolicy.groupPrefixes.TELECOM', label: 'TELECOM - Prefix', type: 'text', placeholder: 'TEL' },
          { id: 'finance-order-number-prefix-dig', path: 'orderNumberingPolicy.groupPrefixes.DIGITAL', label: 'DIGITAL - Prefix', type: 'text', placeholder: 'DIG' }
        ]
      },
      {
        id: 'finance-payment-policy',
        title: 'Thanh toán & VietQR',
        description: 'Chính sách thanh toán, chuyển khoản ngân hàng và lịch đối soát tự động.',
        fields: [
          { id: 'finance-partial-payment', path: 'paymentPolicy.partialPaymentEnabled', label: 'Cho phép thanh toán một phần', type: 'switch', helper: 'Khi bật, khách hàng có thể thanh toán trước một phần và trả nốt sau.' },
          { id: 'finance-override-roles', path: 'paymentPolicy.overrideRoles', label: 'Vai trò được ghi đè trạng thái thanh toán', type: 'multiSelect', options: CHECKOUT_OVERRIDE_ROLE_OPTIONS, helper: 'Vai trò có quyền đánh dấu đơn hàng là "đã thanh toán" thủ công (bỏ qua luồng tự động).' },
          { id: 'finance-callback-tolerance', path: 'paymentPolicy.callbackTolerance', label: 'Thời gian chờ xác nhận thanh toán', type: 'number', unit: 'giây', min: 10, max: 86400, helper: 'Thời gian tối đa hệ thống chờ ngân hàng xác nhận giao dịch trước khi đánh dấu thất bại.', isAdvanced: true },
          { id: 'finance-reconcile-schedule', path: 'paymentPolicy.reconcileSchedule', label: 'Lịch đối soát tự động', type: 'select', options: RECONCILE_SCHEDULE_OPTIONS, helper: 'Hệ thống tự động kiểm tra và đối chiếu các giao dịch thanh toán theo lịch này.' },
          { id: 'finance-qr-at-draft', path: 'paymentPolicy.allowQrAtDraft', label: 'Cho phép tạo mã QR ở đơn nháp', type: 'switch', helper: 'Khi bật, khách hàng có thể quét QR thanh toán ngay từ lúc đơn chưa được duyệt.' },
          { id: 'finance-vietqr-bank', path: 'paymentPolicy.vietQR.bankCode', label: 'Ngân hàng nhận thanh toán (VietQR)', type: 'select', options: VIETQR_BANK_OPTIONS, helper: 'Chọn ngân hàng mà công ty sử dụng để nhận thanh toán qua mã QR.' },
          { id: 'finance-vietqr-account', path: 'paymentPolicy.vietQR.accountNumber', label: 'Số tài khoản ngân hàng', type: 'text', helper: 'Số tài khoản ngân hàng của công ty, sẽ hiển thị trên mã QR thanh toán.', placeholder: 'Ví dụ: 0123456789' },
          { id: 'finance-vietqr-name', path: 'paymentPolicy.vietQR.accountName', label: 'Tên tài khoản ngân hàng', type: 'text', helper: 'Tên chủ tài khoản (viết in hoa, không dấu). Ví dụ: CONG TY TNHH ABC', placeholder: 'CONG TY TNHH ABC' },
          { id: 'finance-vietqr-template', path: 'paymentPolicy.vietQR.transferContentTemplate', label: 'Mẫu nội dung chuyển khoản', type: 'text', helper: 'Nội dung tự động điền khi khách chuyển khoản. Hỗ trợ {orderNo}, {orderId}. Bấm icon i để xem hướng dẫn mẫu duy nhất.', placeholder: 'DH {orderNo}' }
        ]
      },
      {
        id: 'finance-invoice-automation',
        title: 'Hóa đơn tự động',
        description: 'Quy tắc tự động tạo hóa đơn sau khi đơn hàng thanh toán hoặc kích hoạt, phân theo nhóm sản phẩm.',
        fields: [
          { id: 'finance-invoice-ins-trigger', path: 'invoiceAutomation.INSURANCE.trigger', label: '🛡️ Bảo hiểm - Thời điểm tạo hóa đơn', type: 'select', options: CHECKOUT_INVOICE_TRIGGER_OPTIONS, helper: 'Chọn thời điểm hệ thống tự động tạo hóa đơn cho đơn bảo hiểm.' },
          { id: 'finance-invoice-ins-full', path: 'invoiceAutomation.INSURANCE.requireFullPayment', label: '🛡️ Bảo hiểm - Yêu cầu thanh toán đủ mới xuất hóa đơn', type: 'switch', helper: 'Khi bật, hóa đơn chỉ được tạo khi khách thanh toán 100% giá trị đơn.' },
          { id: 'finance-invoice-tel-trigger', path: 'invoiceAutomation.TELECOM.trigger', label: '📱 Viễn thông - Thời điểm tạo hóa đơn', type: 'select', options: CHECKOUT_INVOICE_TRIGGER_OPTIONS, helper: 'Chọn thời điểm hệ thống tự động tạo hóa đơn cho đơn viễn thông.' },
          { id: 'finance-invoice-tel-full', path: 'invoiceAutomation.TELECOM.requireFullPayment', label: '📱 Viễn thông - Yêu cầu thanh toán đủ mới xuất hóa đơn', type: 'switch' },
          { id: 'finance-invoice-dig-trigger', path: 'invoiceAutomation.DIGITAL.trigger', label: '💻 Dịch vụ số - Thời điểm tạo hóa đơn', type: 'select', options: CHECKOUT_INVOICE_TRIGGER_OPTIONS, helper: 'Chọn thời điểm hệ thống tự động tạo hóa đơn cho đơn dịch vụ số.' },
          { id: 'finance-invoice-dig-full', path: 'invoiceAutomation.DIGITAL.requireFullPayment', label: '💻 Dịch vụ số - Yêu cầu thanh toán đủ mới xuất hóa đơn', type: 'switch' }
        ]
      }
    ]
  },
  sales_crm_policies: {
    title: 'Chính sách CRM/Bán hàng',
    description: 'Quy định sửa đơn, mẫu đơn hàng, chiết khấu, tín dụng và phân loại khách hàng.',
    sections: [
      {
        id: 'sales-order-policy',
        title: 'Quy tắc đơn hàng',
        description: 'Thiết lập chính sách duyệt khi thay đổi giá trị đơn hàng.',
        fields: [
          { id: 'sales-allow-increase', path: 'orderSettings.allowIncreaseWithoutApproval', label: 'Cho phép tăng giá trị đơn không cần duyệt', type: 'switch', helper: 'Khi bật, nhân viên có thể tăng giá trị đơn hàng mà không cần chờ duyệt.' },
          { id: 'sales-require-decrease', path: 'orderSettings.requireApprovalForDecrease', label: 'Giảm giá trị đơn phải duyệt', type: 'switch', helper: 'Khi bật, mọi thao tác giảm giá trị đơn đều cần người có quyền duyệt xác nhận.' },
          { id: 'sales-approver-id', path: 'orderSettings.approverId', label: 'Người duyệt mặc định', type: 'text', helper: 'Nhập email của người chịu trách nhiệm duyệt đơn hàng. Ví dụ: manager@company.com', placeholder: 'manager@company.com' }
        ]
      },
      {
        id: 'sales-checkout-templates',
        title: 'Mẫu đơn hàng (Checkout Templates)',
        description: 'Cấu hình thông tin bắt buộc khi tạo đơn hàng theo từng nhóm sản phẩm. Trường "bắt buộc" là thông tin khách hàng PHẢI điền khi tạo đơn.',
        fields: [
          { id: 'sales-checkout-template-ins-code', path: 'checkoutTemplates.INSURANCE.0.code', label: '🛡️ BH ô tô - Mã template', type: 'text', helper: 'Mã nội bộ của template. Không nên thay đổi trừ khi được IT hướng dẫn.', isAdvanced: true, placeholder: 'AUTO_INSURANCE_STD' },
          { id: 'sales-checkout-template-ins-label', path: 'checkoutTemplates.INSURANCE.0.label', label: '🛡️ BH ô tô - Tên hiển thị', type: 'text', helper: 'Tên này sẽ xuất hiện trong dropdown khi nhân viên tạo đơn bảo hiểm ô tô.', placeholder: 'Bảo hiểm ô tô' },
          { id: 'sales-checkout-template-ins-required', path: 'checkoutTemplates.INSURANCE.0.requiredFields', label: '🛡️ BH ô tô - Trường bắt buộc', type: 'multiSelect', options: INSURANCE_REQUIRED_FIELD_OPTIONS, helper: 'Chọn các thông tin mà khách hàng BẮT BUỘC phải điền khi tạo đơn BH ô tô. Các trường không chọn sẽ là tùy chọn.' },
          { id: 'sales-checkout-template-moto-code', path: 'checkoutTemplates.INSURANCE.1.code', label: '🏍️ BH xe máy - Mã template', type: 'text', helper: 'Mã nội bộ của template bảo hiểm xe máy. Không nên thay đổi trừ khi được IT hướng dẫn.', isAdvanced: true, placeholder: 'MOTO_INSURANCE_STD' },
          { id: 'sales-checkout-template-moto-label', path: 'checkoutTemplates.INSURANCE.1.label', label: '🏍️ BH xe máy - Tên hiển thị', type: 'text', helper: 'Tên này sẽ xuất hiện trong dropdown khi nhân viên tạo đơn bảo hiểm xe máy.', placeholder: 'Bảo hiểm xe máy' },
          { id: 'sales-checkout-template-moto-required', path: 'checkoutTemplates.INSURANCE.1.requiredFields', label: '🏍️ BH xe máy - Trường bắt buộc', type: 'multiSelect', options: INSURANCE_REQUIRED_FIELD_OPTIONS, helper: 'Chọn các thông tin mà khách hàng BẮT BUỘC phải điền khi tạo đơn BH xe máy.' },
          { id: 'sales-checkout-template-tel-code', path: 'checkoutTemplates.TELECOM.0.code', label: '📱 Viễn thông - Mã template', type: 'text', helper: 'Mã nội bộ của template. Không nên thay đổi trừ khi được IT hướng dẫn.', isAdvanced: true, placeholder: 'TELECOM_STD' },
          { id: 'sales-checkout-template-tel-label', path: 'checkoutTemplates.TELECOM.0.label', label: '📱 Viễn thông - Tên hiển thị', type: 'text', helper: 'Tên này sẽ xuất hiện khi nhân viên chọn loại đơn viễn thông.', placeholder: 'Mẫu viễn thông tiêu chuẩn' },
          { id: 'sales-checkout-template-tel-required', path: 'checkoutTemplates.TELECOM.0.requiredFields', label: '📱 Viễn thông - Trường bắt buộc', type: 'multiSelect', options: TELECOM_REQUIRED_FIELD_OPTIONS, helper: 'Chọn các thông tin mà khách hàng BẮT BUỘC phải điền khi tạo đơn viễn thông.' },
          { id: 'sales-checkout-template-dig-code', path: 'checkoutTemplates.DIGITAL.0.code', label: '💻 Dịch vụ số - Mã template', type: 'text', helper: 'Mã nội bộ của template. Không nên thay đổi trừ khi được IT hướng dẫn.', isAdvanced: true, placeholder: 'DIGITAL_STD' },
          { id: 'sales-checkout-template-dig-label', path: 'checkoutTemplates.DIGITAL.0.label', label: '💻 Dịch vụ số - Tên hiển thị', type: 'text', helper: 'Tên này sẽ xuất hiện khi nhân viên chọn loại đơn dịch vụ số.', placeholder: 'Mẫu dịch vụ số tiêu chuẩn' },
          { id: 'sales-checkout-template-dig-required', path: 'checkoutTemplates.DIGITAL.0.requiredFields', label: '💻 Dịch vụ số - Trường bắt buộc', type: 'multiSelect', options: DIGITAL_REQUIRED_FIELD_OPTIONS, helper: 'Chọn các thông tin mà khách hàng BẮT BUỘC phải điền khi tạo đơn dịch vụ số.' }
        ]
      },
      {
        id: 'sales-checkout-activation',
        title: 'Chế độ kích hoạt dịch vụ',
        description: 'Quy định dịch vụ được kích hoạt tự động hay cần nhân viên xác nhận thủ công sau khi thanh toán.',
        fields: [
          { id: 'sales-checkout-activation-ins', path: 'activationPolicy.INSURANCE', label: '🛡️ Bảo hiểm - Chế độ kích hoạt', type: 'select', options: CHECKOUT_ACTIVATION_MODE_OPTIONS_V2, helper: 'Chọn cách kích hoạt hợp đồng bảo hiểm sau khi khách thanh toán.' },
          { id: 'sales-checkout-activation-tel', path: 'activationPolicy.TELECOM', label: '📱 Viễn thông - Chế độ kích hoạt', type: 'select', options: CHECKOUT_ACTIVATION_MODE_OPTIONS_V2, helper: 'Chọn cách kích hoạt gói cước viễn thông sau khi khách thanh toán.' },
          { id: 'sales-checkout-activation-dig', path: 'activationPolicy.DIGITAL', label: '💻 Dịch vụ số - Chế độ kích hoạt', type: 'select', options: CHECKOUT_ACTIVATION_MODE_OPTIONS_V2, helper: 'Chọn cách kích hoạt dịch vụ số sau khi khách thanh toán.' }
        ]
      },
      {
        id: 'sales-checkout-effective',
        title: 'Ánh xạ ngày hiệu lực tự động',
        description: 'Hệ thống tự lấy ngày hiệu lực từ dữ liệu đơn hàng. Chọn trường nguồn phù hợp cho từng nhóm sản phẩm.',
        isAdvanced: true,
        fields: [
          { id: 'sales-checkout-effective-ins-from', path: 'effectiveDateMapping.INSURANCE.from', label: '🛡️ Bảo hiểm - Ngày bắt đầu hiệu lực', type: 'select', options: EFFECTIVE_FROM_INS_OPTIONS, helper: 'Chọn trường dữ liệu dùng làm ngày bắt đầu hợp đồng bảo hiểm.' },
          { id: 'sales-checkout-effective-ins-to', path: 'effectiveDateMapping.INSURANCE.to', label: '🛡️ Bảo hiểm - Ngày kết thúc hiệu lực', type: 'select', options: EFFECTIVE_TO_INS_OPTIONS, helper: 'Chọn trường dữ liệu dùng làm ngày hết hạn hợp đồng bảo hiểm.' },
          { id: 'sales-checkout-effective-tel-from', path: 'effectiveDateMapping.TELECOM.from', label: '📱 Viễn thông - Ngày bắt đầu hiệu lực', type: 'select', options: EFFECTIVE_FROM_TEL_OPTIONS, helper: 'Chọn trường dữ liệu dùng làm ngày kích hoạt gói cước.' },
          { id: 'sales-checkout-effective-tel-to', path: 'effectiveDateMapping.TELECOM.to', label: '📱 Viễn thông - Ngày kết thúc hiệu lực', type: 'select', options: EFFECTIVE_TO_TEL_OPTIONS, helper: 'Chọn trường dữ liệu dùng làm ngày hết hạn gói cước.' },
          { id: 'sales-checkout-effective-dig-from', path: 'effectiveDateMapping.DIGITAL.from', label: '💻 Dịch vụ số - Ngày bắt đầu hiệu lực', type: 'select', options: EFFECTIVE_FROM_DIG_OPTIONS, helper: 'Chọn trường dữ liệu dùng làm ngày bắt đầu dịch vụ số.' },
          { id: 'sales-checkout-effective-dig-to', path: 'effectiveDateMapping.DIGITAL.to', label: '💻 Dịch vụ số - Ngày kết thúc hiệu lực', type: 'select', options: EFFECTIVE_TO_DIG_OPTIONS, helper: 'Chọn trường dữ liệu dùng làm ngày kết thúc dịch vụ số.' }
        ]
      },
      {
        id: 'sales-discount-credit',
        title: 'Chiết khấu và tín dụng',
        description: 'Thiết lập giới hạn chiết khấu, ngưỡng cần duyệt, và chính sách công nợ khách hàng.',
        fields: [
          { id: 'sales-max-discount', path: 'discountPolicy.maxDiscountPercent', label: 'Chiết khấu tối đa cho phép', type: 'number', unit: '%', min: 0, max: 100, helper: 'Mức chiết khấu cao nhất mà nhân viên được phép áp dụng. Ví dụ: 30 = tối đa 30%.' },
          { id: 'sales-discount-approval', path: 'discountPolicy.requireApprovalAbovePercent', label: 'Chiết khấu vượt mức này cần duyệt', type: 'number', unit: '%', min: 0, max: 100, helper: 'Khi chiết khấu vượt mức này, đơn sẽ chuyển sang trạng thái chờ duyệt. Ví dụ: 15 = vượt 15% phải duyệt.' },
          { id: 'sales-negative-balance', path: 'creditPolicy.allowNegativeBalance', label: 'Cho phép công nợ âm (nợ vượt hạn mức)', type: 'switch', helper: 'Khi bật, khách hàng có thể mua hàng ngay cả khi công nợ vượt hạn mức tín dụng.' },
          { id: 'sales-credit-limit', path: 'creditPolicy.maxCreditLimit', label: 'Hạn mức tín dụng tối đa mỗi khách', type: 'number', unit: 'VND', min: 0, helper: 'Số tiền tối đa mà một khách hàng được nợ. Đặt 0 = không cho phép công nợ.' }
        ]
      },
      {
        id: 'sales-draft-expiry',
        title: 'Đơn nháp tự động hủy',
        description: 'Đơn hàng ở trạng thái nháp quá lâu sẽ được hệ thống tự động cảnh báo hoặc hủy để tránh tồn đọng.',
        fields: [
          { id: 'sales-draft-expiry-days', path: 'draftExpiryDays', label: 'Tự hủy đơn nháp sau', type: 'number', unit: 'ngày', min: 1, max: 90, helper: 'Sau bao nhiêu ngày không xử lý, đơn nháp sẽ bị hệ thống tự động hủy.' },
          { id: 'sales-draft-warning-days', path: 'draftWarningDays', label: 'Cảnh báo trước khi hủy', type: 'number', unit: 'ngày', min: 1, max: 30, helper: 'Số ngày trước khi hủy, hệ thống sẽ gửi cảnh báo cho nhân viên phụ trách.' },
          { id: 'sales-draft-debt-days', path: 'draftDebtConversionDays', label: 'Chuyển thành công nợ sau', type: 'number', unit: 'ngày', min: 0, max: 365, helper: 'Sau bao nhiêu ngày, đơn chưa thanh toán sẽ tự chuyển thành công nợ. Đặt 0 = không tự chuyển.' }
        ]
      },
      {
        id: 'sales-taxonomy',
        title: 'Phân loại khách hàng',
        description: 'Quản lý danh sách giai đoạn và nguồn khách hàng. Dữ liệu này dùng để phân nhóm và lọc khách trong CRM.',
        fields: [
          {
            id: 'sales-stages',
            path: 'customerTaxonomy.stages',
            label: 'Giai đoạn khách hàng',
            helper: 'Quản lý giai đoạn bằng bảng chi tiết và thống kê dữ liệu áp dụng.',
            type: 'taxonomyManager',
            taxonomyType: 'stages'
          },
          {
            id: 'sales-sources',
            path: 'customerTaxonomy.sources',
            label: 'Nguồn khách hàng',
            helper: 'Quản lý nguồn bằng bảng chi tiết và thống kê dữ liệu áp dụng.',
            type: 'taxonomyManager',
            taxonomyType: 'sources'
          }
        ]
      },
      {
        id: 'sales-tag-registry',
        title: 'Quản lý nhãn (Tags)',
        description: 'Danh sách nhãn (tags) dùng để phân loại nhanh khách hàng và tương tác. Thêm/sửa tag tại đây.',
        fields: [
          {
            id: 'sales-customer-tags-registry',
            path: 'tagRegistry.customerTags',
            label: 'Nhãn khách hàng',
            helper: 'Danh sách tag dùng cho hồ sơ khách hàng.',
            type: 'taxonomyManager',
            taxonomyType: 'customerTags'
          },
          {
            id: 'sales-interaction-tags-registry',
            path: 'tagRegistry.interactionTags',
            label: 'Nhãn tương tác',
            helper: 'Danh sách tag gắn vào khi ghi nhận tương tác với khách (gọi điện, chat, gặp mặt...).',
            type: 'taxonomyManager',
            taxonomyType: 'interactionTags'
          },
          {
            id: 'sales-interaction-result-tags-registry',
            path: 'tagRegistry.interactionResultTags',
            label: 'Nhãn kết quả tương tác',
            helper: 'Kết quả sau mỗi lần tương tác (quan tâm, đã mua, không phản hồi...).',
            type: 'taxonomyManager',
            taxonomyType: 'interactionResultTags'
          }
        ]
      },
      {
        id: 'sales-renewal-reminder',
        title: 'Nhắc gia hạn CRM',
        description: 'Thiết lập số ngày nhắc trước khi hợp đồng/gói cước hết hạn, giúp nhân viên chủ động liên hệ khách.',
        fields: [
          {
            id: 'sales-renewal-global-days',
            path: 'renewalReminder.globalLeadDays',
            label: 'Số ngày nhắc mặc định',
            helper: 'Nếu không cấu hình riêng theo sản phẩm, hệ thống dùng số ngày mặc định này.',
            type: 'number',
            unit: 'ngày',
            min: 1,
            max: 365
          },
          {
            id: 'sales-renewal-telecom-days',
            path: 'renewalReminder.productLeadDays.TELECOM_PACKAGE',
            label: 'Nhắc gia hạn gói cước viễn thông',
            helper: 'Để trống nếu muốn dùng số ngày mặc định.',
            type: 'number',
            unit: 'ngày',
            min: 1,
            max: 365,
            allowEmpty: true
          },
          {
            id: 'sales-renewal-auto-days',
            path: 'renewalReminder.productLeadDays.AUTO_INSURANCE',
            label: 'Nhắc gia hạn bảo hiểm ô tô',
            helper: 'Để trống nếu muốn dùng số ngày mặc định.',
            type: 'number',
            unit: 'ngày',
            min: 1,
            max: 365,
            allowEmpty: true
          },
          {
            id: 'sales-renewal-moto-days',
            path: 'renewalReminder.productLeadDays.MOTO_INSURANCE',
            label: 'Nhắc gia hạn bảo hiểm xe máy',
            helper: 'Để trống nếu muốn dùng số ngày mặc định.',
            type: 'number',
            unit: 'ngày',
            min: 1,
            max: 365,
            allowEmpty: true
          },
          {
            id: 'sales-renewal-digital-days',
            path: 'renewalReminder.productLeadDays.DIGITAL_SERVICE',
            label: 'Nhắc gia hạn dịch vụ số',
            helper: 'Để trống nếu muốn dùng số ngày mặc định.',
            type: 'number',
            unit: 'ngày',
            min: 1,
            max: 365,
            allowEmpty: true
          }
        ]
      }
    ]
  },
  catalog_scm_policies: {
    title: 'Chính sách Danh mục/SCM',
    description: 'Chuẩn mặc định về đơn vị tính, bảng giá, kho và nhận hàng.',
    sections: [
      {
        id: 'catalog-defaults',
        title: 'Mặc định hệ thống',
        fields: [
          { id: 'catalog-uom', path: 'uomDefault', label: 'Đơn vị tính mặc định', type: 'text', placeholder: 'PCS' },
          { id: 'catalog-pricelist', path: 'priceListDefault', label: 'Bảng giá mặc định', type: 'text', placeholder: 'STANDARD' },
          { id: 'catalog-warehouse', path: 'warehouseDefault', label: 'Kho mặc định', type: 'text', placeholder: 'MAIN' }
        ]
      },
      {
        id: 'catalog-constraints',
        title: 'Ràng buộc nhập/xuất',
        fields: [
          { id: 'catalog-replenishment-enabled', path: 'replenishment.enabled', label: 'Bật bổ sung tồn kho tự động', type: 'switch' },
          { id: 'catalog-replenishment-threshold', path: 'replenishment.minStockThreshold', label: 'Ngưỡng cảnh báo tồn kho', type: 'number', min: 0 },
          { id: 'catalog-over-receive', path: 'receiving.allowOverReceivePercent', label: 'Cho phép nhận vượt', type: 'number', unit: '%', min: 0, max: 100 }
        ]
      }
    ]
  },
  hr_policies: {
    title: 'Chính sách nhân sự',
    description: 'Thiết lập ca làm, nghỉ phép, kỳ lương và chuỗi duyệt nội bộ.',
    sections: [
      {
        id: 'hr-defaults',
        title: 'Thiết lập chung',
        fields: [
          { id: 'hr-shift', path: 'shiftDefault', label: 'Ca mặc định', type: 'select', options: [{ value: 'HC', label: 'Hành chính' }, { value: 'CA1', label: 'Ca 1' }, { value: 'CA2', label: 'Ca 2' }] },
          { id: 'hr-leave-annual', path: 'leave.annualDefaultDays', label: 'Số ngày phép năm mặc định', type: 'number', min: 0, max: 60 },
          { id: 'hr-leave-carry', path: 'leave.maxCarryOverDays', label: 'Ngày phép được chuyển kỳ', type: 'number', min: 0, max: 30 },
          { id: 'hr-payroll-cycle', path: 'payroll.cycle', label: 'Chu kỳ lương', type: 'select', options: PAYROLL_CYCLE_OPTIONS },
          { id: 'hr-payroll-cutoff', path: 'payroll.cutoffDay', label: 'Ngày chốt kỳ lương', type: 'number', min: 1, max: 31 }
        ]
      },
      {
        id: 'hr-approval-chain',
        title: 'Chuỗi phê duyệt HR',
        fields: [
          { id: 'hr-leave-role', path: 'approverChain.leaveApproverRole', label: 'Vai trò duyệt nghỉ phép', type: 'select', options: ROLE_OPTIONS },
          { id: 'hr-payroll-role', path: 'approverChain.payrollApproverRole', label: 'Vai trò duyệt lương', type: 'select', options: ROLE_OPTIONS }
        ]
      },
      {
        id: 'hr-appendix-field-library',
        title: 'Field library toan he thong',
        description: 'Admin quan ly field dung chung. Muc custom_1..3 cho phep bo sung field tuy chinh nhanh.',
        fields: [
          { id: 'hr-field-summary-label', path: 'appendixFieldCatalog.summary.label', label: 'summary - Ten hien thi', type: 'text' },
          { id: 'hr-field-summary-type', path: 'appendixFieldCatalog.summary.type', label: 'summary - Kieu du lieu', type: 'select', options: [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'select', label: 'Select' }, { value: 'boolean', label: 'Boolean' }] },
          { id: 'hr-field-summary-analytics', path: 'appendixFieldCatalog.summary.analyticsEnabled', label: 'summary - Dua vao KPI', type: 'switch' },
          { id: 'hr-field-summary-aggregator', path: 'appendixFieldCatalog.summary.aggregator', label: 'summary - Kieu tong hop', type: 'select', options: [{ value: 'none', label: 'Khong tong hop' }, { value: 'count', label: 'Dem' }, { value: 'sum', label: 'Tong' }, { value: 'avg', label: 'Trung binh' }, { value: 'min', label: 'Min' }, { value: 'max', label: 'Max' }] },

          { id: 'hr-field-result-label', path: 'appendixFieldCatalog.result.label', label: 'result - Ten hien thi', type: 'text' },
          { id: 'hr-field-result-type', path: 'appendixFieldCatalog.result.type', label: 'result - Kieu du lieu', type: 'select', options: [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'select', label: 'Select' }, { value: 'boolean', label: 'Boolean' }] },
          { id: 'hr-field-result-analytics', path: 'appendixFieldCatalog.result.analyticsEnabled', label: 'result - Dua vao KPI', type: 'switch' },
          { id: 'hr-field-result-aggregator', path: 'appendixFieldCatalog.result.aggregator', label: 'result - Kieu tong hop', type: 'select', options: [{ value: 'none', label: 'Khong tong hop' }, { value: 'count', label: 'Dem' }, { value: 'sum', label: 'Tong' }, { value: 'avg', label: 'Trung binh' }, { value: 'min', label: 'Min' }, { value: 'max', label: 'Max' }] },

          { id: 'hr-field-task-label', path: 'appendixFieldCatalog.taskCount.label', label: 'taskCount - Ten hien thi', type: 'text' },
          { id: 'hr-field-task-type', path: 'appendixFieldCatalog.taskCount.type', label: 'taskCount - Kieu du lieu', type: 'select', options: [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'select', label: 'Select' }, { value: 'boolean', label: 'Boolean' }] },
          { id: 'hr-field-task-analytics', path: 'appendixFieldCatalog.taskCount.analyticsEnabled', label: 'taskCount - Dua vao KPI', type: 'switch' },
          { id: 'hr-field-task-aggregator', path: 'appendixFieldCatalog.taskCount.aggregator', label: 'taskCount - Kieu tong hop', type: 'select', options: [{ value: 'none', label: 'Khong tong hop' }, { value: 'count', label: 'Dem' }, { value: 'sum', label: 'Tong' }, { value: 'avg', label: 'Trung binh' }, { value: 'min', label: 'Min' }, { value: 'max', label: 'Max' }] },

          { id: 'hr-field-custom1-key', path: 'appendixFieldCatalog.custom_1.key', label: 'custom_1 - Ma field', type: 'text', placeholder: 'PL05_customerFeedback' },
          { id: 'hr-field-custom1-label', path: 'appendixFieldCatalog.custom_1.label', label: 'custom_1 - Ten hien thi', type: 'text' },
          { id: 'hr-field-custom1-type', path: 'appendixFieldCatalog.custom_1.type', label: 'custom_1 - Kieu du lieu', type: 'select', options: [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'select', label: 'Select' }, { value: 'boolean', label: 'Boolean' }] },
          {
            id: 'hr-field-custom1-options',
            path: 'appendixFieldCatalog.custom_1.options',
            label: 'custom_1 - Lua chon (neu la select)',
            helper: 'Quan ly option bang bang du lieu thay cho comma-input.',
            type: 'managedList',
            managedListType: 'freeText'
          },
          { id: 'hr-field-custom1-analytics', path: 'appendixFieldCatalog.custom_1.analyticsEnabled', label: 'custom_1 - Dua vao KPI', type: 'switch' },
          { id: 'hr-field-custom1-aggregator', path: 'appendixFieldCatalog.custom_1.aggregator', label: 'custom_1 - Kieu tong hop', type: 'select', options: [{ value: 'none', label: 'Khong tong hop' }, { value: 'count', label: 'Dem' }, { value: 'sum', label: 'Tong' }, { value: 'avg', label: 'Trung binh' }, { value: 'min', label: 'Min' }, { value: 'max', label: 'Max' }] },

          { id: 'hr-field-custom2-key', path: 'appendixFieldCatalog.custom_2.key', label: 'custom_2 - Ma field', type: 'text', placeholder: 'PL06_qualityTag' },
          { id: 'hr-field-custom2-label', path: 'appendixFieldCatalog.custom_2.label', label: 'custom_2 - Ten hien thi', type: 'text' },
          { id: 'hr-field-custom2-type', path: 'appendixFieldCatalog.custom_2.type', label: 'custom_2 - Kieu du lieu', type: 'select', options: [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'select', label: 'Select' }, { value: 'boolean', label: 'Boolean' }] },
          {
            id: 'hr-field-custom2-options',
            path: 'appendixFieldCatalog.custom_2.options',
            label: 'custom_2 - Lua chon (neu la select)',
            helper: 'Quan ly option bang bang du lieu thay cho comma-input.',
            type: 'managedList',
            managedListType: 'freeText'
          },
          { id: 'hr-field-custom2-analytics', path: 'appendixFieldCatalog.custom_2.analyticsEnabled', label: 'custom_2 - Dua vao KPI', type: 'switch' },
          { id: 'hr-field-custom2-aggregator', path: 'appendixFieldCatalog.custom_2.aggregator', label: 'custom_2 - Kieu tong hop', type: 'select', options: [{ value: 'none', label: 'Khong tong hop' }, { value: 'count', label: 'Dem' }, { value: 'sum', label: 'Tong' }, { value: 'avg', label: 'Trung binh' }, { value: 'min', label: 'Min' }, { value: 'max', label: 'Max' }] },

          { id: 'hr-field-custom3-key', path: 'appendixFieldCatalog.custom_3.key', label: 'custom_3 - Ma field', type: 'text', placeholder: 'PL10_recoveryRisk' },
          { id: 'hr-field-custom3-label', path: 'appendixFieldCatalog.custom_3.label', label: 'custom_3 - Ten hien thi', type: 'text' },
          { id: 'hr-field-custom3-type', path: 'appendixFieldCatalog.custom_3.type', label: 'custom_3 - Kieu du lieu', type: 'select', options: [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'select', label: 'Select' }, { value: 'boolean', label: 'Boolean' }] },
          {
            id: 'hr-field-custom3-options',
            path: 'appendixFieldCatalog.custom_3.options',
            label: 'custom_3 - Lua chon (neu la select)',
            helper: 'Quan ly option bang bang du lieu thay cho comma-input.',
            type: 'managedList',
            managedListType: 'freeText'
          },
          { id: 'hr-field-custom3-analytics', path: 'appendixFieldCatalog.custom_3.analyticsEnabled', label: 'custom_3 - Dua vao KPI', type: 'switch' },
          { id: 'hr-field-custom3-aggregator', path: 'appendixFieldCatalog.custom_3.aggregator', label: 'custom_3 - Kieu tong hop', type: 'select', options: [{ value: 'none', label: 'Khong tong hop' }, { value: 'count', label: 'Dem' }, { value: 'sum', label: 'Tong' }, { value: 'avg', label: 'Trung binh' }, { value: 'min', label: 'Min' }, { value: 'max', label: 'Max' }] }
        ]
      },
      {
        id: 'hr-appendix-template-design',
        title: 'Thiet ke form theo phu luc',
        description: 'Chon field theo danh muc appendixFieldCatalog de dam bao payload luon hop le.',
        fields: [
          { id: 'hr-pl01-name', path: 'appendixTemplates.PL01.name', label: 'PL01 - Ten phu luc', type: 'text' },
          { id: 'hr-pl01-description', path: 'appendixTemplates.PL01.description', label: 'PL01 - Mo ta', type: 'textarea' },
          {
            id: 'hr-pl01-fields',
            path: 'appendixTemplates.PL01.fields',
            label: 'PL01 - Danh sach field',
            helper: 'Picker theo Field library. Khong cho nhap tay key tu do.',
            type: 'managedList',
            managedListType: 'fieldKey'
          },

          { id: 'hr-pl02-name', path: 'appendixTemplates.PL02.name', label: 'PL02 - Ten phu luc', type: 'text' },
          { id: 'hr-pl02-description', path: 'appendixTemplates.PL02.description', label: 'PL02 - Mo ta', type: 'textarea' },
          { id: 'hr-pl02-fields', path: 'appendixTemplates.PL02.fields', label: 'PL02 - Danh sach field', type: 'managedList', managedListType: 'fieldKey' },

          { id: 'hr-pl03-name', path: 'appendixTemplates.PL03.name', label: 'PL03 - Ten phu luc', type: 'text' },
          { id: 'hr-pl03-description', path: 'appendixTemplates.PL03.description', label: 'PL03 - Mo ta', type: 'textarea' },
          { id: 'hr-pl03-fields', path: 'appendixTemplates.PL03.fields', label: 'PL03 - Danh sach field', type: 'managedList', managedListType: 'fieldKey' },

          { id: 'hr-pl04-name', path: 'appendixTemplates.PL04.name', label: 'PL04 - Ten phu luc', type: 'text' },
          { id: 'hr-pl04-description', path: 'appendixTemplates.PL04.description', label: 'PL04 - Mo ta', type: 'textarea' },
          { id: 'hr-pl04-fields', path: 'appendixTemplates.PL04.fields', label: 'PL04 - Danh sach field', type: 'managedList', managedListType: 'fieldKey' },

          { id: 'hr-pl05-name', path: 'appendixTemplates.PL05.name', label: 'PL05 - Ten phu luc', type: 'text' },
          { id: 'hr-pl05-description', path: 'appendixTemplates.PL05.description', label: 'PL05 - Mo ta', type: 'textarea' },
          { id: 'hr-pl05-fields', path: 'appendixTemplates.PL05.fields', label: 'PL05 - Danh sach field', type: 'managedList', managedListType: 'fieldKey' },

          { id: 'hr-pl06-name', path: 'appendixTemplates.PL06.name', label: 'PL06 - Ten phu luc', type: 'text' },
          { id: 'hr-pl06-description', path: 'appendixTemplates.PL06.description', label: 'PL06 - Mo ta', type: 'textarea' },
          { id: 'hr-pl06-fields', path: 'appendixTemplates.PL06.fields', label: 'PL06 - Danh sach field', type: 'managedList', managedListType: 'fieldKey' },

          { id: 'hr-pl10-name', path: 'appendixTemplates.PL10.name', label: 'PL10 - Ten phu luc', type: 'text' },
          { id: 'hr-pl10-description', path: 'appendixTemplates.PL10.description', label: 'PL10 - Mo ta', type: 'textarea' },
          { id: 'hr-pl10-fields', path: 'appendixTemplates.PL10.fields', label: 'PL10 - Danh sach field', type: 'managedList', managedListType: 'fieldKey' }
        ]
      }
    ]
  },
  integrations: {
    title: 'Kết nối & Tích hợp',
    description: 'Quản lý kết nối tích hợp, khóa API/token, AI OCR và AI Routing.',
    sections: [
      {
        id: 'integration-bhtot',
        title: 'BHTOT',
        fields: [
          { id: 'int-bhtot-enabled', path: 'bhtot.enabled', label: 'Bật tích hợp BHTOT', type: 'switch' },
          { id: 'int-bhtot-base-url', path: 'bhtot.baseUrl', label: 'BHTOT Base URL', type: 'text', placeholder: 'https://api.example.com', isAdvanced: true },
          { id: 'int-bhtot-api-key', path: 'bhtot.apiKey', label: 'API key (nhập trực tiếp)', type: 'secret', helper: 'Đổi key tại đây sẽ áp dụng ngay sau khi lưu.', placeholder: 'sk-...' },
          { id: 'int-bhtot-secret-ref', path: 'bhtot.apiKeyRef', label: 'SecretRef API key (dự phòng)', type: 'select', options: SECRET_REF_OPTIONS, isAdvanced: true },
          { id: 'int-bhtot-timeout', path: 'bhtot.timeoutMs', label: 'Timeout', type: 'number', unit: 'ms', min: 1000, max: 120000, isAdvanced: true },
          { id: 'int-bhtot-orders-key', path: 'bhtot.ordersStateKey', label: 'State key đơn hàng', type: 'text', isAdvanced: true },
          { id: 'int-bhtot-users-key', path: 'bhtot.usersStateKey', label: 'State key người dùng', type: 'text', isAdvanced: true },
          { id: 'int-bhtot-sync-users', path: 'bhtot.syncAllUsersAsEmployees', label: 'Đồng bộ user thành employee', type: 'switch', isAdvanced: true }
        ]
      },
      {
        id: 'integration-zalo',
        title: 'Zalo OA',
        fields: [
          { id: 'int-zalo-enabled', path: 'zalo.enabled', label: 'Bật tích hợp Zalo OA', type: 'switch' },
          { id: 'int-zalo-outbound-url', path: 'zalo.outboundUrl', label: 'Webhook outbound URL', type: 'text', isAdvanced: true },
          { id: 'int-zalo-api-base', path: 'zalo.apiBaseUrl', label: 'API base URL', type: 'text', isAdvanced: true },
          { id: 'int-zalo-timeout', path: 'zalo.outboundTimeoutMs', label: 'Timeout outbound', type: 'number', unit: 'ms', min: 2000, max: 180000, isAdvanced: true },
          { id: 'int-zalo-access-token', path: 'zalo.accessToken', label: 'Access token (nhập trực tiếp)', type: 'secret', placeholder: 'oa_access_...' },
          { id: 'int-zalo-secret-ref', path: 'zalo.accessTokenRef', label: 'SecretRef access token (dự phòng)', type: 'select', options: SECRET_REF_OPTIONS, isAdvanced: true },
          { id: 'int-zalo-webhook-secret', path: 'zalo.webhookSecret', label: 'Webhook secret (nhập trực tiếp)', type: 'secret' },
          { id: 'int-zalo-webhook-secret-ref', path: 'zalo.webhookSecretRef', label: 'SecretRef webhook secret (dự phòng)', type: 'select', options: SECRET_REF_OPTIONS, isAdvanced: true }
        ]
      },
      {
        id: 'integration-ai',
        title: 'AI Connector',
        fields: [
          { id: 'int-ai-enabled', path: 'ai.enabled', label: 'Bật AI connector', type: 'switch' },
          { id: 'int-ai-base-url', path: 'ai.baseUrl', label: 'AI base URL', type: 'text', isAdvanced: true },
          { id: 'int-ai-model', path: 'ai.model', label: 'Model mặc định', type: 'text', placeholder: 'gpt-4o-mini', isAdvanced: true },
          { id: 'int-ai-api-key', path: 'ai.apiKey', label: '🔑 AI API key (nhập trực tiếp)', type: 'secret', helper: 'Key dùng cho tất cả tính năng AI: OCR giấy chứng nhận, AI Routing, phân tích hội thoại. Hỗ trợ OpenAI-compatible key; có hiệu lực ngay sau khi lưu.', placeholder: 'sk-...' },
          { id: 'int-ai-key-pool', path: 'ai.apiKeyPool', label: 'Bể API key (Key Pool)', type: 'keyPool', helper: 'Nhập nhiều key (Gemini/OpenAI). Hệ thống OCR sẽ xoay vòng key khi key hiện tại lỗi quota hoặc unauthorized.' },
          { id: 'int-ai-key-rotation-mode', path: 'ai.keyRotationMode', label: 'Chế độ xoay key', type: 'select', options: AI_KEY_ROTATION_MODE_OPTIONS },
          { id: 'int-ai-secret-ref', path: 'ai.apiKeyRef', label: 'SecretRef API key (dự phòng)', type: 'select', options: SECRET_REF_OPTIONS, isAdvanced: true },
          { id: 'int-ai-timeout', path: 'ai.timeoutMs', label: 'Timeout', type: 'number', unit: 'ms', min: 1000, max: 120000, isAdvanced: true }
        ]
      },
      {
        id: 'integration-ai-ocr',
        title: 'AI OCR (Giấy chứng nhận)',
        description: 'OCR giấy chứng nhận BH. Hỗ trợ đọc từ file upload hoặc certificateLink URL. Ưu tiên Gemini + key pool.',
        fields: [
          { id: 'int-ai-ocr-enabled', path: 'aiOcr.enabled', label: 'Bật tích hợp AI OCR', type: 'switch' },
          { id: 'int-ai-ocr-provider-kind', path: 'aiOcr.providerKind', label: 'Loại nhà cung cấp OCR', type: 'select', options: AI_OCR_PROVIDER_KIND_OPTIONS },
          { id: 'int-ai-ocr-direct-key', path: 'ai.apiKey', label: '🔑 API key OCR (nhập trực tiếp)', type: 'secret', helper: 'Nhập trực tiếp API key dùng cho OCR. Có hiệu lực ngay sau khi Lưu cấu hình.' },
          { id: 'int-ai-ocr-key-pool', path: 'ai.apiKeyPool', label: 'Bể API key OCR (nhiều key)', type: 'keyPool', helper: 'Bạn có thể thêm nhiều key Gemini/OpenAI-compatible. OCR sẽ tự xoay key theo chế độ bên dưới.' },
          { id: 'int-ai-ocr-key-rotation-mode', path: 'ai.keyRotationMode', label: 'Chế độ xoay key OCR', type: 'select', options: AI_KEY_ROTATION_MODE_OPTIONS },
          { id: 'int-ai-ocr-provider', path: 'aiOcr.provider', label: 'Base URL OCR (tuỳ chọn)', type: 'text', placeholder: 'Gemini: https://generativelanguage.googleapis.com/v1beta', isAdvanced: true },
          { id: 'int-ai-ocr-key', path: 'aiOcr.apiKeyRef', label: 'SecretRef API key (fallback)', type: 'select', options: SECRET_REF_OPTIONS, isAdvanced: true },
          { id: 'int-ai-ocr-switch', path: 'aiOcr.ocrEnabled', label: 'Bật OCR giấy chứng nhận', type: 'switch' },
          { id: 'int-ai-ocr-model', path: 'aiOcr.ocrModel', label: 'Model OCR', type: 'text', placeholder: 'gemini-3-flash-preview' }
        ]
      },
      {
        id: 'integration-ai-routing',
        title: 'AI Routing',
        description: 'Quản trị webhook n8n, bảng chia nick/kênh theo ngành. Panel điều khiển riêng biệt.',
        fields: []
      },
      {
        id: 'integration-payments',
        title: 'Payments callback',
        fields: [
          { id: 'int-payments-enabled', path: 'payments.enabled', label: 'Bật callback thanh toán', type: 'switch' },
          { id: 'int-payments-secret-ref', path: 'payments.bankWebhookSecretRef', label: 'SecretRef webhook secret', type: 'select', options: SECRET_REF_OPTIONS },
          { id: 'int-payments-skew-seconds', path: 'payments.callbackSkewSeconds', label: 'Clock skew callback', type: 'number', unit: 'giây', min: 10, max: 86400, isAdvanced: true },
          { id: 'int-payments-reconcile-enabled', path: 'payments.reconcileEnabled', label: 'Bật reconcile định kỳ', type: 'switch' }
        ]
      }
    ]
  },
  notifications_templates: {
    title: 'Thông báo & template',
    description: 'Thiết lập policy gửi thông báo theo kênh và cơ chế retry.',
    sections: [
      {
        id: 'notify-template',
        title: 'Template',
        fields: [
          { id: 'notify-version', path: 'templatesVersion', label: 'Phiên bản template', type: 'text', placeholder: 'v1' }
        ]
      },
      {
        id: 'notify-channel-policy',
        title: 'Chính sách kênh gửi',
        fields: [
          { id: 'notify-email', path: 'channelPolicy.email', label: 'Bật Email', type: 'switch' },
          { id: 'notify-sms', path: 'channelPolicy.sms', label: 'Bật SMS', type: 'switch' },
          { id: 'notify-zalo', path: 'channelPolicy.zalo', label: 'Bật Zalo', type: 'switch' },
          { id: 'notify-inapp', path: 'channelPolicy.inApp', label: 'Bật In-app', type: 'switch' }
        ]
      },
      {
        id: 'notify-retry',
        title: 'Retry/Backoff',
        isAdvanced: true,
        fields: [
          { id: 'notify-retry-max', path: 'retry.maxAttempts', label: 'Số lần retry tối đa', type: 'number', min: 1, max: 10 },
          { id: 'notify-retry-backoff', path: 'retry.backoffSeconds', label: 'Khoảng chờ giữa các lần retry', type: 'number', unit: 'giây', min: 1, max: 3600 }
        ]
      }
    ]
  },
  search_performance: {
    title: 'Tìm kiếm & hiệu năng',
    description: 'Thiết lập chế độ tìm kiếm, timeout và quy tắc reindex.',
    sections: [
      {
        id: 'search-runtime',
        title: 'Vận hành runtime',
        fields: [
          { id: 'search-engine', path: 'engine', label: 'Chế độ search engine', type: 'select', options: SEARCH_ENGINE_OPTIONS, isAdvanced: true },
          { id: 'search-timeout', path: 'timeoutMs', label: 'Timeout', type: 'number', unit: 'ms', min: 1000, max: 300000, isAdvanced: true }
        ]
      },
      {
        id: 'search-reindex',
        title: 'Quy tắc reindex',
        isAdvanced: true,
        fields: [
          { id: 'search-auto-deploy', path: 'reindexPolicy.autoAfterDeploy', label: 'Tự reindex sau deploy', type: 'switch' },
          {
            id: 'search-allow-entity',
            path: 'reindexPolicy.allowEntity',
            label: 'Đối tượng được phép reindex',
            type: 'multiSelect',
            options: [
              { value: 'customers', label: 'Khách hàng' },
              { value: 'orders', label: 'Đơn hàng' },
              { value: 'products', label: 'Sản phẩm' },
              { value: 'all', label: 'Toàn bộ' }
            ]
          }
        ]
      }
    ]
  },
  data_governance_backup: {
    title: 'Quản trị dữ liệu & backup',
    description: 'Chính sách retention, archive, cadence backup và quyền export dữ liệu.',
    sections: [
      {
        id: 'data-retention',
        title: 'Vòng đời dữ liệu',
        fields: [
          { id: 'data-retention-days', path: 'retentionDays', label: 'Giữ dữ liệu tối đa', type: 'number', unit: 'ngày', min: 1, max: 3650 },
          { id: 'data-audit-retention-years', path: 'auditRetentionYears', label: 'Giữ audit log', type: 'number', unit: 'năm', min: 1, max: 20 },
          { id: 'data-audit-hot-retention-months', path: 'auditHotRetentionMonths', label: 'Giữ audit hot tier', type: 'number', unit: 'tháng', min: 1, max: 120, isAdvanced: true },
          { id: 'data-archive-days', path: 'archiveAfterDays', label: 'Chuyển archive sau', type: 'number', unit: 'ngày', min: 1, max: 3650, isAdvanced: true },
          { id: 'data-backup-cadence', path: 'backupCadence', label: 'Chu kỳ backup', type: 'select', options: BACKUP_CADENCE_OPTIONS }
        ]
      },
      {
        id: 'data-export-policy',
        title: 'Chính sách export',
        fields: [
          { id: 'data-export-pii', path: 'exportPolicy.allowPiiExport', label: 'Cho phép export dữ liệu nhạy cảm (PII)', type: 'switch' },
          { id: 'data-export-approval', path: 'exportPolicy.requireAdminApproval', label: 'Bắt buộc Admin duyệt khi export', type: 'switch' }
        ]
      }
    ]
  },

  elearning_policies: {
    title: 'Cấu hình Học trực tuyến',
    description: 'Quản lý trắc nghiệm hàng ngày, chứng nhận, và chính sách ghi danh khóa học.',
    sections: [
      {
        id: 'elearning-daily-quiz',
        title: 'Trắc nghiệm hàng ngày',
        description: 'Bài trắc nghiệm bắt buộc khi đăng nhập lần đầu trong ngày.',
        fields: [
          { id: 'el-dq-enabled', path: 'dailyQuiz.enabled', label: 'Bật trắc nghiệm hàng ngày', type: 'switch' },
          { id: 'el-dq-count', path: 'dailyQuiz.questionCount', label: 'Số câu hỏi mỗi phiên', type: 'number', min: 1, max: 10 },
          { id: 'el-dq-position', path: 'dailyQuiz.positionMapping', label: 'Lọc câu hỏi theo vị trí công việc', type: 'switch' },
          { id: 'el-dq-bypass', path: 'dailyQuiz.bypassRoles', label: 'Bỏ qua cho vai trò', type: 'multiSelect', options: [
            { value: 'ADMIN', label: 'Admin' }
          ]}
        ]
      },
      {
        id: 'elearning-certificate',
        title: 'Chứng nhận',
        fields: [
          { id: 'el-cert-auto', path: 'certificate.autoIssue', label: 'Tự động cấp chứng nhận khi đạt', type: 'switch' },
          { id: 'el-cert-threshold', path: 'certificate.passThreshold', label: 'Điểm đạt tối thiểu', type: 'number', unit: '%', min: 0, max: 100 },
          { id: 'el-cert-expiry', path: 'certificate.validDays', label: 'Hiệu lực chứng nhận', type: 'number', unit: 'ngày', min: 0, max: 3650 }
        ]
      },
      {
        id: 'elearning-enrollment',
        title: 'Ghi danh',
        fields: [
          { id: 'el-enroll-limit', path: 'enrollment.maxCoursesPerEmployee', label: 'Giới hạn khóa học/nhân viên', type: 'number', min: 0, max: 100 },
          { id: 'el-enroll-self', path: 'enrollment.allowSelfEnroll', label: 'Cho phép nhân viên tự ghi danh', type: 'switch' }
        ]
      }
    ]
  }
};

export function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function cloneJson<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

export function isNumericSegment(segment: string) {
  return /^\d+$/.test(segment);
}

export function getByPath(source: unknown, path: string): unknown {
  if (!path) {
    return source;
  }

  const segments = path.split('.');
  let cursor: unknown = source;

  for (const segment of segments) {
    if (cursor === null || cursor === undefined) {
      return undefined;
    }

    if (isNumericSegment(segment)) {
      const index = Number(segment);
      if (!Array.isArray(cursor)) {
        return undefined;
      }
      cursor = cursor[index];
      continue;
    }

    if (typeof cursor !== 'object' || Array.isArray(cursor)) {
      return undefined;
    }

    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return cursor;
}

export function setByPath(source: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const root = cloneJson(source);
  const segments = path.split('.');
  let cursor: unknown = root;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const isLast = index === segments.length - 1;
    const nextSegment = segments[index + 1] ?? '';
    const nextShouldBeArray = isNumericSegment(nextSegment);

    if (isNumericSegment(segment)) {
      const numericIndex = Number(segment);
      if (!Array.isArray(cursor)) {
        break;
      }

      if (isLast) {
        cursor[numericIndex] = value;
        break;
      }

      const existing = cursor[numericIndex];
      if (!existing || typeof existing !== 'object') {
        cursor[numericIndex] = nextShouldBeArray ? [] : {};
      }
      cursor = cursor[numericIndex];
      continue;
    }

    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
      break;
    }

    const objectCursor = cursor as Record<string, unknown>;
    if (isLast) {
      objectCursor[segment] = value;
      break;
    }

    const existing = objectCursor[segment];
    if (!existing || typeof existing !== 'object') {
      objectCursor[segment] = nextShouldBeArray ? [] : {};
    }

    cursor = objectCursor[segment];
  }

  return root;
}

export function deepMerge(base: unknown, patch: unknown): unknown {
  if (Array.isArray(base) && Array.isArray(patch)) {
    return [...patch];
  }

  if (!base || typeof base !== 'object' || Array.isArray(base)) {
    return cloneJson(patch);
  }

  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return cloneJson(patch);
  }

  const baseRecord = base as Record<string, unknown>;
  const patchRecord = patch as Record<string, unknown>;
  const result: Record<string, unknown> = { ...baseRecord };

  for (const key of Object.keys(patchRecord)) {
    const left = baseRecord[key];
    const right = patchRecord[key];
    if (left && typeof left === 'object' && !Array.isArray(left) && right && typeof right === 'object' && !Array.isArray(right)) {
      result[key] = deepMerge(left, right);
      continue;
    }
    result[key] = cloneJson(right);
  }

  return result;
}

export function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

export function parseTagsInput(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

export function parseTemplateFieldKeyList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const values: string[] = [];
  for (const item of value) {
    let fieldKey = '';
    if (typeof item === 'string') {
      fieldKey = item.trim();
    } else if (item && typeof item === 'object') {
      const row = item as Record<string, unknown>;
      fieldKey = String(row.fieldKey ?? row.key ?? row.fieldId ?? '').trim();
    }

    if (!fieldKey) {
      continue;
    }

    const normalized = fieldKey.toLowerCase();
    if (!values.some((entry) => entry.toLowerCase() === normalized)) {
      values.push(fieldKey);
    }
  }

  return values;
}

export function toManagedListItems(field: FieldConfig, value: unknown) {
  if (field.managedListType === 'fieldKey') {
    return parseTemplateFieldKeyList(value);
  }
  return toStringArray(value);
}

export function buildHrAppendixFieldPickerOptions(data: Record<string, unknown>) {
  const catalog = toRecord(getByPath(data, 'appendixFieldCatalog'));
  const seen = new Set<string>();
  const options: ManagedListPickerOption[] = [];

  for (const [rawKey, rawField] of Object.entries(catalog)) {
    const field = toRecord(rawField);
    const value = String(field.key ?? rawKey ?? '').trim();
    if (!value) {
      continue;
    }

    const dedupeKey = value.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const label = String(field.label ?? '').trim();
    const type = String(field.type ?? '').trim().toLowerCase();
    const baseLabel = label || value;

    options.push({
      value,
      label: baseLabel === value ? value : `${baseLabel} (${value})`,
      description: type ? `Kieu: ${type}` : undefined
    });
  }

  return options.sort((left, right) => left.label.localeCompare(right.label, 'vi'));
}

export function formatUserDomainMap(value: unknown) {
  const map = toRecord(value);
  return Object.keys(map)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => {
      const domains = toStringArray(map[key]);
      if (domains.length === 0) {
        return null;
      }
      return `${key}: ${domains.join(', ')}`;
    })
    .filter(Boolean)
    .join('\n');
}

export function parseUserDomainMap(text: string) {
  const result: Record<string, string[]> = {};
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    if (!key) {
      continue;
    }

    const domains = parseTagsInput(line.slice(separatorIndex + 1));
    if (domains.length === 0) {
      continue;
    }

    result[key] = domains;
  }

  return result;
}

export function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.trunc(parsed);
}

export function normalizePositionRows(payload: Record<string, unknown>) {
  return normalizeListPayload(payload)
    .map((item) => {
      const title = String(item.title ?? item.name ?? '').trim();
      return {
        id: String(item.id ?? '').trim(),
        code: String(item.code ?? '').trim(),
        title,
        level: String(item.level ?? '').trim(),
        status: String(item.status ?? '').trim().toUpperCase() || 'ACTIVE',
        departmentName: String(item.departmentName ?? '').trim(),
        employeeCount: toNumber(item.employeeCount),
        permissionRuleCount: toNumber(item.permissionRuleCount)
      } as PositionSummaryItem;
    })
    .filter((item) => item.id && item.title);
}

export function normalizeIamMismatchReport(payload: Record<string, unknown>) {
  const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
  const items: IamMismatchReportItem[] = [];
  for (const item of itemsRaw) {
    const record = toRecord(item);
    const actionValue = String(record.action ?? '').trim().toUpperCase();
    if (!PERMISSION_ACTIONS.includes(actionValue as PermissionActionKey)) {
      continue;
    }
    items.push({
      moduleKey: String(record.moduleKey ?? '').trim().toLowerCase(),
      action: actionValue as PermissionActionKey,
      mismatchCount: toNumber(record.mismatchCount),
      legacyAllowCount: toNumber(record.legacyAllowCount),
      iamAllowCount: toNumber(record.iamAllowCount),
      lastSeenAt: String(record.lastSeenAt ?? '').trim(),
      sample: record.sample == null ? null : toRecord(record.sample)
    });
  }

  return {
    generatedAt: String(payload.generatedAt ?? '').trim(),
    totalMismatches: toNumber(payload.totalMismatches),
    totalGroups: toNumber(payload.totalGroups),
    items
  };
}

export function createEmptyPermissionMatrix(): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  for (const moduleKey of PERMISSION_MODULE_KEYS) {
    matrix[moduleKey] = {
      VIEW: '',
      CREATE: '',
      UPDATE: '',
      DELETE: '',
      APPROVE: ''
    };
  }
  return matrix;
}

export function mapRulesToMatrix(rules: PermissionRuleRow[]): PermissionMatrix {
  const matrix = createEmptyPermissionMatrix();
  for (const rule of rules) {
    if (!matrix[rule.moduleKey]) {
      matrix[rule.moduleKey] = {
        VIEW: '',
        CREATE: '',
        UPDATE: '',
        DELETE: '',
        APPROVE: ''
      };
    }
    matrix[rule.moduleKey][rule.action] = rule.effect;
  }
  return matrix;
}

export function mapMatrixToRules(matrix: PermissionMatrix): PermissionRuleRow[] {
  const rules: PermissionRuleRow[] = [];
  for (const [moduleKey, actionMap] of Object.entries(matrix)) {
    for (const action of PERMISSION_ACTIONS) {
      const effect = actionMap[action];
      if (!effect) {
        continue;
      }
      rules.push({
        moduleKey,
        action,
        effect
      });
    }
  }
  return rules;
}

export function getDomainFields(domain: DomainKey): FieldConfig[] {
  return DOMAIN_CONFIG[domain].sections.flatMap((section) => section.fields);
}

export function getFieldValue(field: FieldConfig, data: Record<string, unknown>) {
  const raw = getByPath(data, field.path);

  if (field.type === 'switch') {
    return raw === true;
  }

  if (field.type === 'keyPool') {
    return toStringArray(raw);
  }

  if (field.type === 'managedList') {
    return toManagedListItems(field, raw);
  }

  if (field.type === 'tags' || field.type === 'multiSelect' || field.type === 'taxonomyManager') {
    return toStringArray(raw);
  }

  if (field.type === 'number') {
    if (typeof raw === 'number') {
      return raw;
    }
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (field.allowEmpty) {
      return '';
    }
    return 0;
  }

  if (field.type === 'userDomainMap') {
    return formatUserDomainMap(raw);
  }

  return String(raw ?? '');
}

export function setFieldValue(field: FieldConfig, data: Record<string, unknown>, input: unknown) {
  if (field.type === 'switch') {
    return setByPath(data, field.path, input === true);
  }

  if (field.type === 'keyPool') {
    return setByPath(data, field.path, toStringArray(input));
  }

  if (field.type === 'tags') {
    return setByPath(data, field.path, parseTagsInput(String(input ?? '')));
  }

  if (field.type === 'managedList') {
    return setByPath(data, field.path, toStringArray(input));
  }

  if (field.type === 'taxonomyManager') {
    return setByPath(data, field.path, toStringArray(input));
  }

  if (field.type === 'multiSelect') {
    return setByPath(data, field.path, toStringArray(input));
  }

  if (field.type === 'number') {
    const raw = String(input ?? '').trim();
    if (!raw) {
      if (field.allowEmpty) {
        return setByPath(data, field.path, null);
      }
      return setByPath(data, field.path, 0);
    }
    const parsed = Number(raw);
    return setByPath(data, field.path, Number.isFinite(parsed) ? parsed : 0);
  }

  if (field.type === 'userDomainMap') {
    return setByPath(data, field.path, parseUserDomainMap(String(input ?? '')));
  }

  return setByPath(data, field.path, String(input ?? ''));
}

export function normalizeForComparison(field: FieldConfig, value: unknown) {
  if (field.type === 'keyPool') {
    return toStringArray(value).sort();
  }

  if (field.type === 'managedList') {
    return toManagedListItems(field, value).sort();
  }

  if (field.type === 'tags' || field.type === 'multiSelect' || field.type === 'taxonomyManager') {
    return toStringArray(value).sort();
  }

  if (field.type === 'userDomainMap') {
    return parseUserDomainMap(formatUserDomainMap(value));
  }

  if (field.type === 'switch') {
    return value === true;
  }

  if (field.type === 'number') {
    if (field.allowEmpty && (value === null || value === undefined || String(value).trim() === '')) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return String(value ?? '');
}

export function formatFieldValue(field: FieldConfig, value: unknown) {
  if (field.type === 'keyPool') {
    const keys = toStringArray(value);
    return keys.length > 0 ? `${keys.length} key` : 'Chưa nhập';
  }

  if (field.type === 'secret') {
    const normalized = String(value ?? '').trim();
    return normalized ? '********' : 'Chưa nhập';
  }

  if (field.type === 'switch') {
    return value === true ? 'Bật' : 'Tắt';
  }

  if (field.type === 'managedList') {
    const list = toManagedListItems(field, value);
    return list.length > 0 ? list.join(', ') : 'Chưa chọn';
  }

  if (field.type === 'tags' || field.type === 'multiSelect' || field.type === 'taxonomyManager') {
    const list = toStringArray(value);
    return list.length > 0 ? list.join(', ') : 'Chưa chọn';
  }

  if (field.type === 'userDomainMap') {
    const text = formatUserDomainMap(value);
    return text || 'Chưa khai báo';
  }

  if (field.type === 'number') {
    if (field.allowEmpty && (value === null || value === undefined || String(value).trim() === '')) {
      return 'Chưa nhập';
    }
    const parsed = Number(value);
    const numberText = Number.isFinite(parsed) ? String(parsed) : '0';
    return field.unit ? `${numberText} ${field.unit}` : numberText;
  }

  if (field.options && field.options.length > 0) {
    const selected = field.options.find((option) => option.value === String(value ?? ''));
    if (selected) {
      return selected.label;
    }
  }

  const normalized = String(value ?? '').trim();
  return normalized || 'Chưa nhập';
}

export function buildPatchFromDraft(domain: DomainKey, draft: Record<string, unknown>) {
  const fields = getDomainFields(domain);
  let patch: Record<string, unknown> = {};

  for (const field of fields) {
    const value = getByPath(draft, field.path);
    patch = setByPath(patch, field.path, normalizeForComparison(field, value));
  }

  return patch;
}

export function buildSubmissionData(domain: DomainKey, base: Record<string, unknown>, draft: Record<string, unknown>) {
  const patch = buildPatchFromDraft(domain, draft);
  return toRecord(deepMerge(base, patch));
}

export function collectFieldChanges(domain: DomainKey, before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] {
  const fields = getDomainFields(domain);
  const changes: FieldChange[] = [];

  for (const field of fields) {
    const left = normalizeForComparison(field, getByPath(before, field.path));
    const right = normalizeForComparison(field, getByPath(after, field.path));
    if (stableStringify(left) === stableStringify(right)) {
      continue;
    }

    changes.push({
      id: field.id,
      label: field.label,
      before: formatFieldValue(field, left),
      after: formatFieldValue(field, right)
    });
  }

  return changes;
}

export function mapFieldErrors(fields: FieldConfig[], errors: string[]) {
  const result: Record<string, string[]> = {};

  for (const error of errors) {
    const normalizedError = error.toLowerCase();
    let attached = false;

    for (const field of fields) {
      const fullPath = field.path.toLowerCase();
      const tail = fullPath.split('.').at(-1) ?? '';
      if (normalizedError.includes(fullPath) || (tail && normalizedError.includes(tail))) {
        result[field.id] = [...(result[field.id] ?? []), error];
        attached = true;
      }
    }

    if (!attached) {
      result.__global = [...(result.__global ?? []), error];
    }
  }

  return result;
}

export function formatDateTime(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) {
    return 'N/A';
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return formatRuntimeDateTime(date.toISOString());
}

export function statusText(ok: boolean) {
  return ok ? 'Kết nối tốt' : 'Cần kiểm tra';
}

export function toSettingsFriendlyError(error: unknown, fallbackMessage: string) {
  const rawMessage = error instanceof Error ? error.message : '';
  const normalized = rawMessage.toLowerCase();

  const isSettingsEndpoint404 =
    normalized.includes('cannot get /api/v1/settings/center') ||
    normalized.includes('cannot get /api/v1/settings/domains/') ||
    normalized.includes('cannot put /api/v1/settings/domains/') ||
    (normalized.includes('request failed (404)') && normalized.includes('settings'));

  if (isSettingsEndpoint404) {
    return 'API backend chưa cập nhật Trung tâm cấu hình (endpoint 404). Vui lòng khởi động lại dịch vụ API và thử lại.';
  }

  return rawMessage || fallbackMessage;
}
