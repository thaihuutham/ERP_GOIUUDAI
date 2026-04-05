'use client';

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import Link from 'next/link';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../lib/bulk-actions';
import { SYSTEM_PROFILE } from '../lib/system-profile';
import { useAccessPolicy } from './access-policy-context';
import { useUserRole } from './user-role-context';
import { ERP_MODULES } from '@erp/shared';
import { GroupedSidebar } from './settings-center/grouped-sidebar';
import { DomainTabs } from './settings-center/domain-tabs';
import { AdvancedToggle } from './settings-center/advanced-toggle';
import { TaxonomyManagerField, type SalesTaxonomyItem } from './settings-center/taxonomy-manager-field';
import {
  SettingsListManagerField,
  type ManagedListPickerOption,
  type ManagedListType
} from './settings-center/settings-list-manager-field';
import {
  filterDomainTabsByRole,
  filterSectionsForTabAndMode,
  resolveActiveTab,
  resolveDefaultAdvancedMode,
  resolveDomainTabs,
  type DomainTabConfig
} from './settings-center/view-model';

const DOMAIN_ORDER = [
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

type DomainKey = (typeof DOMAIN_ORDER)[number];

const DOMAIN_GROUPS = [
  {
    id: 'general',
    label: 'Hệ thống chung',
    domains: ['org_profile', 'locale_calendar'] as const
  },
  {
    id: 'modules',
    label: 'Quy định Phân hệ',
    domains: ['sales_crm_policies', 'catalog_scm_policies', 'hr_policies'] as const
  },
  {
    id: 'management',
    label: 'Quản trị & Kiểm soát',
    domains: ['access_security', 'approval_matrix', 'finance_controls', 'data_governance_backup'] as const
  },
  {
    id: 'integration',
    label: 'Tích hợp & Cấu hình IT',
    domains: ['integrations', 'notifications_templates', 'search_performance'] as const
  }
];

type DomainState = {
  domain: DomainKey;
  ok: boolean;
  errorCount: number;
  warningCount: number;
  updatedAt: string | null;
  runtimeApplied?: boolean;
  runtimeLoadedAt?: string | null;
};

type CenterPayload = {
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

type DomainPayload = {
  domain: DomainKey;
  data: Record<string, unknown>;
  validation?: {
    ok: boolean;
    errors: string[];
    warnings: string[];
  };
};

type PermissionActionKey = 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE';
type PermissionEffectValue = '' | 'ALLOW' | 'DENY';

type PermissionRuleRow = {
  moduleKey: string;
  action: PermissionActionKey;
  effect: 'ALLOW' | 'DENY';
};

type PermissionMatrix = Record<string, Record<PermissionActionKey, PermissionEffectValue>>;

type FieldOption = {
  value: string;
  label: string;
};

type FieldType =
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
  | 'color'
  | 'taxonomyManager';

type SalesTaxonomyType = 'stages' | 'sources';
type CrmTagRegistryType = 'customerTags' | 'interactionTags' | 'interactionResultTags';
type TaxonomyManagerType = SalesTaxonomyType | CrmTagRegistryType;

type SalesTaxonomyPayload = {
  stages: SalesTaxonomyItem[];
  sources: SalesTaxonomyItem[];
};

type CrmTagRegistryPayload = {
  customerTags: SalesTaxonomyItem[];
  interactionTags: SalesTaxonomyItem[];
  interactionResultTags: SalesTaxonomyItem[];
};

const EMPTY_SALES_TAXONOMY: SalesTaxonomyPayload = {
  stages: [],
  sources: []
};

const EMPTY_CRM_TAG_REGISTRY: CrmTagRegistryPayload = {
  customerTags: [],
  interactionTags: [],
  interactionResultTags: []
};

type FieldConfig = {
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
  options?: FieldOption[];
  isAdvanced?: boolean;
  taxonomyType?: TaxonomyManagerType;
  managedListType?: ManagedListType;
};

type SectionConfig = {
  id: string;
  title: string;
  description?: string;
  fields: FieldConfig[];
  isAdvanced?: boolean;
};

type DomainConfig = {
  title: string;
  description: string;
  sections: SectionConfig[];
};

type FieldChange = {
  id: string;
  label: string;
  before: string;
  after: string;
};

type PositionSummaryItem = {
  id: string;
  code: string;
  title: string;
  level: string;
  status: string;
  departmentName: string;
  employeeCount: number;
  permissionRuleCount: number;
};

const DOMAIN_LABEL: Record<DomainKey, string> = {
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
  data_governance_backup: 'Dữ liệu & backup'
};

const DOMAIN_OPTIONS: FieldOption[] = DOMAIN_ORDER.map((domain) => ({
  value: domain,
  label: DOMAIN_LABEL[domain]
}));

const MODULE_LABEL_MAP: Record<string, string> = {
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
  notifications: 'Thông báo'
};

const MODULE_OPTIONS: FieldOption[] = ERP_MODULES
  .filter((moduleKey) => moduleKey !== 'settings')
  .map((moduleKey) => ({
    value: moduleKey,
    label: MODULE_LABEL_MAP[moduleKey] ?? moduleKey.toUpperCase()
  }));

const ASSISTANT_SCOPE_OPTIONS: FieldOption[] = [
  { value: 'company', label: 'Toàn công ty' },
  { value: 'branch', label: 'Theo chi nhánh' },
  { value: 'department', label: 'Theo phòng ban' },
  { value: 'self', label: 'Chỉ dữ liệu cá nhân' }
];

const ASSISTANT_ALLOWED_MODULE_OPTIONS: FieldOption[] = MODULE_OPTIONS.filter(
  (item) => item.value !== 'assistant' && item.value !== 'settings'
);

const ROLE_OPTIONS: FieldOption[] = [
  { value: 'ADMIN', label: 'ADMIN' },
  { value: 'MANAGER', label: 'MANAGER' },
  { value: 'STAFF', label: 'STAFF' }
];

const CURRENCY_OPTIONS: FieldOption[] = [
  { value: 'VND', label: 'VND (Việt Nam Đồng)' },
  { value: 'USD', label: 'USD (US Dollar)' }
];

const DATE_FORMAT_OPTIONS: FieldOption[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }
];

const NUMBER_FORMAT_OPTIONS: FieldOption[] = [
  { value: 'vi-VN', label: 'Việt Nam (1.234,56)' },
  { value: 'en-US', label: 'Mỹ (1,234.56)' }
];

const TIMEZONE_OPTIONS: FieldOption[] = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Việt Nam (UTC+7)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (UTC+7)' },
  { value: 'UTC', label: 'UTC (quốc tế)' }
];

const WEEKDAY_OPTIONS: FieldOption[] = [
  { value: 'monday', label: 'Thứ 2' },
  { value: 'sunday', label: 'Chủ nhật' }
];

const INVOICE_TEMPLATE_OPTIONS: FieldOption[] = [
  { value: 'standard', label: 'Mẫu chuẩn' },
  { value: 'minimal', label: 'Mẫu tối giản' },
  { value: 'retail', label: 'Mẫu bán lẻ' }
];

const SECRET_REF_OPTIONS: FieldOption[] = [
  { value: '', label: 'Chưa cấu hình' },
  { value: 'BHTOT_API_KEY', label: 'BHTOT_API_KEY' },
  { value: 'AI_OPENAI_COMPAT_API_KEY', label: 'AI_OPENAI_COMPAT_API_KEY' },
  { value: 'ZALO_OA_ACCESS_TOKEN', label: 'ZALO_OA_ACCESS_TOKEN' },
  { value: 'ZALO_OA_WEBHOOK_SECRET', label: 'ZALO_OA_WEBHOOK_SECRET' },
  { value: 'MEILI_MASTER_KEY', label: 'MEILI_MASTER_KEY' }
];

const SEARCH_ENGINE_OPTIONS: FieldOption[] = [
  { value: 'sql', label: 'SQL nội bộ (ổn định)' },
  { value: 'meili_hybrid', label: 'Hybrid Search (Meilisearch + SQL)' }
];

const BACKUP_CADENCE_OPTIONS: FieldOption[] = [
  { value: 'daily', label: 'Hàng ngày' },
  { value: 'weekly', label: 'Hàng tuần' },
  { value: 'monthly', label: 'Hàng tháng' }
];

const PAYROLL_CYCLE_OPTIONS: FieldOption[] = [
  { value: 'monthly', label: 'Theo tháng' },
  { value: 'biweekly', label: '2 tuần/lần' },
  { value: 'weekly', label: 'Theo tuần' }
];

const POSITION_STATUS_OPTIONS: FieldOption[] = [
  { value: 'ACTIVE', label: 'ACTIVE' },
  { value: 'INACTIVE', label: 'INACTIVE' },
  { value: 'DRAFT', label: 'DRAFT' }
];

const REASON_TEMPLATES = [
  'Cập nhật chính sách vận hành',
  'Điều chỉnh phân quyền và bảo mật',
  'Chuẩn hóa hồ sơ doanh nghiệp',
  'Cập nhật tích hợp hệ thống',
  'Tối ưu tìm kiếm và hiệu năng',
  'Điều chỉnh vòng đời dữ liệu',
  'Tăng mức tự động hóa giám sát AI'
] as const;

const ROLE_LABEL_MAP: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  STAFF: 'Nhân viên'
};

const ACCESS_SECURITY_ROLE_PLAYBOOK = [
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
    role: 'MANAGER',
    title: 'Theo dõi phạm vi quản lý',
    steps: [
      'Kiểm tra chính sách đăng nhập áp dụng cho đội nhóm.',
      'Theo dõi tab nhật ký & Trợ lý AI theo phạm vi phòng/chi nhánh.',
      'Đề xuất thay đổi cho Admin khi cần mở rộng quyền.'
    ]
  },
  {
    role: 'STAFF',
    title: 'Sử dụng tối giản',
    steps: [
      'Chỉ theo dõi hướng dẫn đăng nhập/mật khẩu liên quan trực tiếp.',
      'Không cần thao tác ở ma trận phân quyền.',
      'Báo lỗi truy cập qua quản lý trực tiếp hoặc Admin.'
    ]
  }
] as const;

type SettingsLayoutPayload = {
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

function isDomainKey(value: unknown): value is DomainKey {
  return typeof value === 'string' && DOMAIN_ORDER.includes(value as DomainKey);
}

function normalizeLayoutGroups(layout: SettingsLayoutPayload | null) {
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

function normalizeLayoutDomainTabs(layout: SettingsLayoutPayload | null, domain: DomainKey): DomainTabConfig[] | null {
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

function resolveAdvancedModeDefaultByLayout(role: string | null | undefined, layout: SettingsLayoutPayload | null) {
  const normalizedRole = String(role ?? '').trim().toUpperCase();
  const defaultByRole = toRecord(layout?.advancedMode?.defaultByRole);
  const candidate = defaultByRole[normalizedRole];
  if (typeof candidate === 'boolean') {
    return candidate;
  }
  return resolveDefaultAdvancedMode(role);
}

const CONFLICT_POLICY_OPTIONS: FieldOption[] = [
  { value: 'DENY_OVERRIDES', label: 'DENY ưu tiên cao nhất' },
  { value: 'ALLOW_OVERRIDES', label: 'ALLOW ưu tiên cao nhất (không khuyến nghị)' }
];

const PERMISSION_ACTIONS: PermissionActionKey[] = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE'];

const PERMISSION_MODULE_KEYS = [
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

const DOMAIN_CONFIG: Record<DomainKey, DomainConfig> = {
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
        id: 'security-audit-matrix',
        title: 'Phân quyền nhật ký hệ thống theo cấp quản lý',
        description: 'Phạm vi nhật ký tính theo người thực hiện. ADMIN xem toàn công ty.',
        fields: [
          { id: 'security-audit-policy-enabled', path: 'auditViewPolicy.enabled', label: 'Bật phân quyền nhật ký theo nhóm quản lý', type: 'switch' },
          { id: 'security-audit-director', path: 'auditViewPolicy.groups.DIRECTOR.enabled', label: 'Giám đốc: xem toàn công ty', type: 'switch' },
          { id: 'security-audit-branch', path: 'auditViewPolicy.groups.BRANCH_MANAGER.enabled', label: 'Trưởng chi nhánh: xem trong phạm vi chi nhánh', type: 'switch' },
          { id: 'security-audit-department', path: 'auditViewPolicy.groups.DEPARTMENT_MANAGER.enabled', label: 'Trưởng phòng: xem trong phạm vi phòng ban', type: 'switch' },
          { id: 'security-audit-deny-ungrouped', path: 'auditViewPolicy.denyIfUngroupedManager', label: 'Chặn MANAGER chưa được gán vào đơn vị tổ chức', type: 'switch' }
        ]
      },
      {
        id: 'security-assistant-access',
        title: 'Chính sách truy cập Trợ lý AI',
        description: 'Giới hạn dữ liệu AI theo vai trò và chặn vượt quyền.',
        fields: [
          { id: 'assistant-policy-enabled', path: 'assistantAccessPolicy.enabled', label: 'Bật chính sách Trợ lý AI', type: 'switch' },
          { id: 'assistant-policy-admin-scope', path: 'assistantAccessPolicy.roleScopeDefaults.ADMIN', label: 'Phạm vi mặc định cho ADMIN', type: 'select', options: ASSISTANT_SCOPE_OPTIONS },
          { id: 'assistant-policy-manager-scope', path: 'assistantAccessPolicy.roleScopeDefaults.MANAGER', label: 'Phạm vi mặc định cho MANAGER', type: 'select', options: ASSISTANT_SCOPE_OPTIONS },
          { id: 'assistant-policy-staff-scope', path: 'assistantAccessPolicy.roleScopeDefaults.STAFF', label: 'Phạm vi mặc định cho STAFF', type: 'select', options: ASSISTANT_SCOPE_OPTIONS },
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
            id: 'security-policy-manager',
            path: 'settingsEditorPolicy.domainRoleMap.MANAGER',
            label: 'Miền cấu hình cho MANAGER',
            type: 'multiSelect',
            options: DOMAIN_OPTIONS
          },
          {
            id: 'security-policy-staff',
            path: 'settingsEditorPolicy.domainRoleMap.STAFF',
            label: 'Miền cấu hình cho STAFF',
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
    description: 'Quản lý khóa kỳ, cut-off và quy tắc đánh số chứng từ.',
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
          { id: 'finance-auto-number', path: 'documentNumbering.autoNumber', label: 'Tự động tăng số chứng từ', type: 'switch' }
        ]
      }
    ]
  },
  sales_crm_policies: {
    title: 'Chính sách CRM/Bán hàng',
    description: 'Quy định sửa đơn, chiết khấu, tín dụng và taxonomy khách hàng.',
    sections: [
      {
        id: 'sales-order-policy',
        title: 'Quy tắc đơn hàng',
        fields: [
          { id: 'sales-allow-increase', path: 'orderSettings.allowIncreaseWithoutApproval', label: 'Cho phép tăng giá trị đơn không cần duyệt', type: 'switch' },
          { id: 'sales-require-decrease', path: 'orderSettings.requireApprovalForDecrease', label: 'Giảm giá trị đơn phải duyệt', type: 'switch' },
          { id: 'sales-approver-id', path: 'orderSettings.approverId', label: 'Người duyệt mặc định (ID/email)', type: 'text' }
        ]
      },
      {
        id: 'sales-discount-credit',
        title: 'Chiết khấu và tín dụng',
        fields: [
          { id: 'sales-max-discount', path: 'discountPolicy.maxDiscountPercent', label: 'Chiết khấu tối đa', type: 'number', unit: '%', min: 0, max: 100 },
          { id: 'sales-discount-approval', path: 'discountPolicy.requireApprovalAbovePercent', label: 'Vượt mức này phải duyệt', type: 'number', unit: '%', min: 0, max: 100 },
          { id: 'sales-negative-balance', path: 'creditPolicy.allowNegativeBalance', label: 'Cho phép công nợ âm', type: 'switch' },
          { id: 'sales-credit-limit', path: 'creditPolicy.maxCreditLimit', label: 'Hạn mức tín dụng tối đa', type: 'number', unit: 'VND', min: 0 }
        ]
      },
      {
        id: 'sales-taxonomy',
        title: 'Phân loại khách hàng',
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
        title: 'CRM Tag Registry',
        fields: [
          {
            id: 'sales-customer-tags-registry',
            path: 'tagRegistry.customerTags',
            label: 'Customer tags',
            helper: 'Danh sách tag dùng cho hồ sơ khách hàng.',
            type: 'taxonomyManager',
            taxonomyType: 'customerTags'
          },
          {
            id: 'sales-interaction-tags-registry',
            path: 'tagRegistry.interactionTags',
            label: 'Interaction tags',
            helper: 'Danh sách tag bổ sung khi ghi nhận interaction.',
            type: 'taxonomyManager',
            taxonomyType: 'interactionTags'
          },
          {
            id: 'sales-interaction-result-tags-registry',
            path: 'tagRegistry.interactionResultTags',
            label: 'Interaction result tags',
            helper: 'Danh sách resultTag hợp lệ cho interaction.',
            type: 'taxonomyManager',
            taxonomyType: 'interactionResultTags'
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
    title: 'Tích hợp hệ thống',
    description: 'Quản lý kết nối tích hợp, khóa API/token và trạng thái kết nối.',
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
          { id: 'int-ai-api-key', path: 'ai.apiKey', label: 'AI API key (nhập trực tiếp)', type: 'secret', helper: 'Hỗ trợ OpenAI-compatible key; có hiệu lực ngay sau khi lưu.', placeholder: 'sk-...' },
          { id: 'int-ai-secret-ref', path: 'ai.apiKeyRef', label: 'SecretRef API key (dự phòng)', type: 'select', options: SECRET_REF_OPTIONS, isAdvanced: true },
          { id: 'int-ai-timeout', path: 'ai.timeoutMs', label: 'Timeout', type: 'number', unit: 'ms', min: 1000, max: 120000, isAdvanced: true }
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
  }
};

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function stableStringify(value: unknown): string {
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

function cloneJson<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function isNumericSegment(segment: string) {
  return /^\d+$/.test(segment);
}

function getByPath(source: unknown, path: string): unknown {
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

function setByPath(source: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
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

function deepMerge(base: unknown, patch: unknown): unknown {
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

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function parseTagsInput(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

function parseTemplateFieldKeyList(value: unknown) {
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

function toManagedListItems(field: FieldConfig, value: unknown) {
  if (field.managedListType === 'fieldKey') {
    return parseTemplateFieldKeyList(value);
  }
  return toStringArray(value);
}

function buildHrAppendixFieldPickerOptions(data: Record<string, unknown>) {
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

function formatUserDomainMap(value: unknown) {
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

function parseUserDomainMap(text: string) {
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

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function normalizePositionRows(payload: Record<string, unknown>) {
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

function createEmptyPermissionMatrix(): PermissionMatrix {
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

function mapRulesToMatrix(rules: PermissionRuleRow[]): PermissionMatrix {
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

function mapMatrixToRules(matrix: PermissionMatrix): PermissionRuleRow[] {
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

function getDomainFields(domain: DomainKey): FieldConfig[] {
  return DOMAIN_CONFIG[domain].sections.flatMap((section) => section.fields);
}

function getFieldValue(field: FieldConfig, data: Record<string, unknown>) {
  const raw = getByPath(data, field.path);

  if (field.type === 'switch') {
    return raw === true;
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
    return 0;
  }

  if (field.type === 'userDomainMap') {
    return formatUserDomainMap(raw);
  }

  return String(raw ?? '');
}

function setFieldValue(field: FieldConfig, data: Record<string, unknown>, input: unknown) {
  if (field.type === 'switch') {
    return setByPath(data, field.path, input === true);
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

function normalizeForComparison(field: FieldConfig, value: unknown) {
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
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return String(value ?? '');
}

function formatFieldValue(field: FieldConfig, value: unknown) {
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

function buildPatchFromDraft(domain: DomainKey, draft: Record<string, unknown>) {
  const fields = getDomainFields(domain);
  let patch: Record<string, unknown> = {};

  for (const field of fields) {
    const value = getByPath(draft, field.path);
    patch = setByPath(patch, field.path, normalizeForComparison(field, value));
  }

  return patch;
}

function buildSubmissionData(domain: DomainKey, base: Record<string, unknown>, draft: Record<string, unknown>) {
  const patch = buildPatchFromDraft(domain, draft);
  return toRecord(deepMerge(base, patch));
}

function collectFieldChanges(domain: DomainKey, before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] {
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

function mapFieldErrors(fields: FieldConfig[], errors: string[]) {
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

function formatDateTime(value: unknown) {
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

function statusText(ok: boolean) {
  return ok ? 'Kết nối tốt' : 'Cần kiểm tra';
}

function toSettingsFriendlyError(error: unknown, fallbackMessage: string) {
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

export function SettingsCenter() {
  const { role } = useUserRole();
  const { canAction } = useAccessPolicy();
  const [center, setCenter] = useState<CenterPayload | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<DomainKey>('org_profile');
  const [advancedMode, setAdvancedMode] = useState<boolean>(resolveDefaultAdvancedMode(role));
  const [advancedTouchedByUser, setAdvancedTouchedByUser] = useState(false);
  const [settingsLayout, setSettingsLayout] = useState<SettingsLayoutPayload | null>(null);
  const [activeDomainTab, setActiveDomainTab] = useState('');
  const [domainResponse, setDomainResponse] = useState<DomainPayload | null>(null);
  const [draftData, setDraftData] = useState<Record<string, unknown>>({});
  const [reasonTemplate, setReasonTemplate] = useState<string>(REASON_TEMPLATES[0]);
  const [reasonNote, setReasonNote] = useState('');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [salesTaxonomy, setSalesTaxonomy] = useState<SalesTaxonomyPayload>(EMPTY_SALES_TAXONOMY);
  const [salesTaxonomyBusy, setSalesTaxonomyBusy] = useState(false);
  const [crmTagRegistry, setCrmTagRegistry] = useState<CrmTagRegistryPayload>(EMPTY_CRM_TAG_REGISTRY);
  const [crmTagRegistryBusy, setCrmTagRegistryBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sectionCollapseState, setSectionCollapseState] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<Record<string, unknown> | null>(null);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [iamUsers, setIamUsers] = useState<Record<string, unknown>[]>([]);
  const [selectedIamUserIds, setSelectedIamUserIds] = useState<BulkRowId[]>([]);
  const [orgItems, setOrgItems] = useState<Record<string, unknown>[]>([]);
  const [orgTree, setOrgTree] = useState<Record<string, unknown>[]>([]);
  const [positions, setPositions] = useState<PositionSummaryItem[]>([]);
  const [positionSearch, setPositionSearch] = useState('');
  const [showPositionForm, setShowPositionForm] = useState(false);
  const [positionFormMode, setPositionFormMode] = useState<'create' | 'edit'>('create');
  const [positionForm, setPositionForm] = useState({
    id: '',
    title: '',
    code: '',
      level: '',
      status: 'ACTIVE'
    });
  const [selectedOverrideUserId, setSelectedOverrideUserId] = useState('');
  const [overrideMatrix, setOverrideMatrix] = useState<PermissionMatrix>(() => createEmptyPermissionMatrix());
  const [accountForm, setAccountForm] = useState({
    fullName: '',
    email: '',
    role: 'STAFF',
    positionId: '',
    orgUnitId: ''
  });
  const [orgUnitForm, setOrgUnitForm] = useState({
    name: '',
    type: 'TEAM',
    parentId: '',
    managerEmployeeId: ''
  });
  const [orgMoveForm, setOrgMoveForm] = useState({
    unitId: '',
    parentId: ''
  });
  const [orgManagerForm, setOrgManagerForm] = useState({
    unitId: '',
    managerEmployeeId: ''
  });

  const domainConfig = DOMAIN_CONFIG[selectedDomain];
  const normalizedRole = String(role ?? '').trim().toUpperCase();
  const sidebarGroups = useMemo(() => normalizeLayoutGroups(settingsLayout), [settingsLayout]);
  const domainTabs = useMemo(() => {
    const fromLayout = normalizeLayoutDomainTabs(settingsLayout, selectedDomain);
    const baseTabs = fromLayout ?? resolveDomainTabs(selectedDomain);
    return filterDomainTabsByRole(selectedDomain, baseTabs, role);
  }, [selectedDomain, settingsLayout, role]);
  const resolvedActiveDomainTab = useMemo(
    () => resolveActiveTab(domainTabs, activeDomainTab),
    [domainTabs, activeDomainTab]
  );
  const activeTabConfig = useMemo(
    () => domainTabs.find((tab) => tab.key === resolvedActiveDomainTab) ?? domainTabs[0] ?? null,
    [domainTabs, resolvedActiveDomainTab]
  );
  const visibleSections = useMemo(
    () => filterSectionsForTabAndMode(domainConfig.sections, domainTabs, resolvedActiveDomainTab, advancedMode),
    [domainConfig.sections, domainTabs, resolvedActiveDomainTab, advancedMode]
  );
  const sectionViewModels = useMemo(
    () =>
      visibleSections.map((section, index) => ({
        section,
        sectionKey: `${selectedDomain}:${resolvedActiveDomainTab}:${section.id}`,
        defaultCollapsed: selectedDomain === 'access_security' ? index > 0 : false
      })),
    [visibleSections, selectedDomain, resolvedActiveDomainTab]
  );
  const originalData = useMemo(() => toRecord(domainResponse?.data), [domainResponse]);
  const hrAppendixFieldPickerOptions = useMemo(
    () => buildHrAppendixFieldPickerOptions(draftData),
    [draftData]
  );

  const submissionData = useMemo(
    () => buildSubmissionData(selectedDomain, originalData, draftData),
    [selectedDomain, originalData, draftData]
  );

  const fieldChanges = useMemo(
    () => collectFieldChanges(selectedDomain, originalData, submissionData),
    [selectedDomain, originalData, submissionData]
  );

  const validationErrors = useMemo(() => {
    const source = toRecord(validationResult ?? domainResponse?.validation ?? {});
    return Array.isArray(source.errors) ? source.errors.map((item) => String(item)) : [];
  }, [validationResult, domainResponse]);

  const validationWarnings = useMemo(() => {
    const source = toRecord(validationResult ?? domainResponse?.validation ?? {});
    return Array.isArray(source.warnings) ? source.warnings.map((item) => String(item)) : [];
  }, [validationResult, domainResponse]);

  const fieldErrorMap = useMemo(
    () => mapFieldErrors(getDomainFields(selectedDomain), validationErrors),
    [selectedDomain, validationErrors]
  );
  const canManagePositionCatalog = canAction('settings', 'UPDATE');
  const filteredPositions = useMemo(() => {
    const keyword = positionSearch.trim().toLowerCase();
    if (!keyword) {
      return positions;
    }
    return positions.filter((item) => {
      return (
        item.title.toLowerCase().includes(keyword) ||
        item.code.toLowerCase().includes(keyword) ||
        item.level.toLowerCase().includes(keyword) ||
        item.departmentName.toLowerCase().includes(keyword)
      );
    });
  }, [positionSearch, positions]);

  useEffect(() => {
    if (sectionViewModels.length === 0) {
      return;
    }

    setSectionCollapseState((current) => {
      let changed = false;
      const next = { ...current };

      for (const item of sectionViewModels) {
        if (item.sectionKey in next) {
          continue;
        }
        next[item.sectionKey] = item.defaultCollapsed;
        changed = true;
      }

      return changed ? next : current;
    });
  }, [sectionViewModels]);
  const positionOptions = useMemo(() => {
    return positions
      .map((item) => ({
        id: item.id,
        name: item.title
      }))
      .filter((item) => item.id && item.name);
  }, [positions]);

  const orgUnitOptions = useMemo(() => {
    return orgItems
      .map((item) => ({
        id: String(item.id ?? '').trim(),
        name: String(item.name ?? '').trim(),
        type: String(item.type ?? '').trim()
      }))
      .filter((item) => item.id && item.name);
  }, [orgItems]);

  const managerEmployeeOptions = useMemo(() => {
    return iamUsers
      .map((item) => {
        const employee = toRecord(item.employee);
        const employeeId = String(employee.id ?? '').trim();
        const fullName = String(employee.fullName ?? '').trim();
        const email = String(item.email ?? '').trim();
        const roleName = String(item.role ?? '').trim();
        if (!employeeId) {
          return null;
        }
        return {
          employeeId,
          label: `${fullName || employeeId}${email ? ` • ${email}` : ''}${roleName ? ` (${roleName})` : ''}`
        };
      })
      .filter((item): item is { employeeId: string; label: string } => Boolean(item?.employeeId));
  }, [iamUsers]);

  const globalValidationErrors = fieldErrorMap.__global ?? [];

  const loadCenter = async () => {
    const payload = await apiRequest<CenterPayload>('/settings/center');
    setCenter(payload);
  };

  const loadLayout = async () => {
    try {
      const payload = await apiRequest<Record<string, unknown>>('/settings/layout');
      setSettingsLayout(payload as SettingsLayoutPayload);
    } catch {
      // Keep local fallback layout when endpoint is unavailable.
    }
  };

  const loadDomain = async (domain: DomainKey) => {
    const payload = await apiRequest<DomainPayload>(`/settings/domains/${domain}`);
    setDomainResponse(payload);
    setDraftData(cloneJson(toRecord(payload.data)));
    setValidationResult(payload.validation ? { ...payload.validation } : null);
    setTestResult(null);
  };

  const loadSalesTaxonomy = async () => {
    const payload = await apiRequest<Partial<SalesTaxonomyPayload>>('/settings/sales-taxonomy');
    setSalesTaxonomy({
      stages: Array.isArray(payload.stages) ? payload.stages : [],
      sources: Array.isArray(payload.sources) ? payload.sources : []
    });
  };

  const loadCrmTagRegistry = async () => {
    const payload = await apiRequest<Partial<CrmTagRegistryPayload>>('/settings/crm-tags');
    setCrmTagRegistry({
      customerTags: Array.isArray(payload.customerTags) ? payload.customerTags : [],
      interactionTags: Array.isArray(payload.interactionTags) ? payload.interactionTags : [],
      interactionResultTags: Array.isArray(payload.interactionResultTags) ? payload.interactionResultTags : []
    });
  };

  const loadEnterpriseData = async () => {
    const [iamPayload, orgPayload, positionPayload] = await Promise.all([
      apiRequest<Record<string, unknown>>('/settings/iam/users', {
        query: { limit: 120 }
      }),
      apiRequest<Record<string, unknown>>('/settings/organization/tree'),
      apiRequest<Record<string, unknown>>('/settings/positions', {
        query: { limit: 300 }
      })
    ]);

    const iamItems = normalizeListPayload(iamPayload);
    const orgRows = normalizeListPayload(orgPayload);
    const orgRoots = Array.isArray(orgPayload.tree) ? (orgPayload.tree as Record<string, unknown>[]) : [];
    const positionItems = normalizePositionRows(positionPayload);

    setIamUsers(iamItems);
    setOrgItems(orgRows);
    setOrgTree(orgRoots);
    setPositions(positionItems);
    setSelectedOverrideUserId((current) => {
      if (current && iamItems.some((item) => String(item.id ?? '').trim() === current)) {
        return current;
      }
      return String(iamItems[0]?.id ?? '').trim();
    });
  };

  const reloadAll = async (domain = selectedDomain) => {
    setBusy(true);
    setError(null);
    const failures: string[] = [];

    const [centerResult, domainResult, enterpriseResult, layoutResult, salesTaxonomyResult, crmTagRegistryResult] = await Promise.allSettled([
      loadCenter(),
      loadDomain(domain),
      loadEnterpriseData(),
      loadLayout(),
      loadSalesTaxonomy(),
      loadCrmTagRegistry()
    ]);

    if (centerResult.status === 'rejected') {
      failures.push(toSettingsFriendlyError(centerResult.reason, 'Không tải được tổng quan miền cấu hình.'));
    }
    if (domainResult.status === 'rejected') {
      failures.push(toSettingsFriendlyError(domainResult.reason, 'Không tải được cấu hình của miền đã chọn.'));
    }
    if (enterpriseResult.status === 'rejected') {
      failures.push(toSettingsFriendlyError(enterpriseResult.reason, 'Không tải được dữ liệu tổ chức/IAM.'));
    }
    if (layoutResult.status === 'rejected') {
      failures.push(toSettingsFriendlyError(layoutResult.reason, 'Không tải được metadata layout settings.'));
    }
    if (salesTaxonomyResult.status === 'rejected') {
      failures.push(toSettingsFriendlyError(salesTaxonomyResult.reason, 'Không tải được taxonomy CRM.'));
    }
    if (crmTagRegistryResult.status === 'rejected') {
      failures.push(toSettingsFriendlyError(crmTagRegistryResult.reason, 'Không tải được CRM tag registry.'));
    }

    if (failures.length > 0) {
      setError(failures.join(' | '));
    }

    setBusy(false);
  };

  useEffect(() => {
    setAdvancedTouchedByUser(false);
  }, [role]);

  useEffect(() => {
    if (!advancedTouchedByUser) {
      setAdvancedMode(resolveAdvancedModeDefaultByLayout(role, settingsLayout));
    }
  }, [role, settingsLayout, advancedTouchedByUser]);

  useEffect(() => {
    setActiveDomainTab((current) => resolveActiveTab(domainTabs, current));
  }, [domainTabs]);

  useEffect(() => {
    void reloadAll(selectedDomain);
  }, [selectedDomain]);

  useEffect(() => {
    const visibleIdSet = new Set(iamUsers.slice(0, 40).map((item) => String(item.id ?? '')));
    setSelectedIamUserIds((prev) => prev.filter((id) => visibleIdSet.has(String(id))));
  }, [iamUsers]);

  useEffect(() => {
    if (!selectedOverrideUserId) {
      setOverrideMatrix(createEmptyPermissionMatrix());
      return;
    }

    let mounted = true;
    const load = async () => {
      try {
        const payload = await apiRequest<Record<string, unknown>>('/settings/permissions/effective', {
          query: {
            userId: selectedOverrideUserId
          }
        });
        const rules = Array.isArray(payload.overrides) ? (payload.overrides as PermissionRuleRow[]) : [];
        if (mounted) {
          setOverrideMatrix(mapRulesToMatrix(rules));
        }
      } catch {
        if (mounted) {
          setOverrideMatrix(createEmptyPermissionMatrix());
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [selectedOverrideUserId]);

  const updateField = (field: FieldConfig, input: unknown) => {
    setDraftData((current) => setFieldValue(field, current, input));
    setValidationResult(null);
  };

  const handleValidate = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiRequest<Record<string, unknown>>(`/settings/domains/${selectedDomain}/validate`, {
        method: 'POST',
        body: submissionData
      });
      setValidationResult(result);
      setMessage('Kiểm tra thành công. Nếu có lỗi, hệ thống hiển thị ngay cạnh từng trường.');
      await loadCenter();
    } catch (validateError) {
      setError(toSettingsFriendlyError(validateError, 'Kiểm tra thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!reasonTemplate.trim()) {
      setError('Vui lòng chọn lý do thay đổi.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/settings/domains/${selectedDomain}`, {
        method: 'PUT',
        body: {
          ...submissionData,
          reasonTemplate,
          reasonNote
        }
      });
      setMessage('Lưu cấu hình thành công.');
      setReasonNote('');
      await reloadAll(selectedDomain);
    } catch (saveError) {
      setError(toSettingsFriendlyError(saveError, 'Lưu cấu hình thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const handleTestConnection = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiRequest<Record<string, unknown>>(`/settings/domains/${selectedDomain}/test-connection`, {
        method: 'POST',
        body: submissionData
      });
      setTestResult(result);
      setMessage('Đã chạy kiểm tra kết nối.');
      await reloadAll(selectedDomain);
    } catch (probeError) {
      setError(toSettingsFriendlyError(probeError, 'Test connection thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSnapshot = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const snapshot = await apiRequest<Record<string, unknown>>('/settings/snapshots', {
        method: 'POST',
        body: {
          reasonTemplate,
          reasonNote,
          domains: [selectedDomain]
        }
      });
      const id = String(snapshot.id ?? '');
      if (id) {
        setSelectedSnapshotId(id);
      }
      setMessage('Đã tạo snapshot cho domain hiện tại.');
      await loadCenter();
    } catch (snapshotError) {
      setError(toSettingsFriendlyError(snapshotError, 'Tạo snapshot thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const isSalesTaxonomyType = (type: TaxonomyManagerType): type is SalesTaxonomyType => (
    type === 'stages' || type === 'sources'
  );

  const isCrmTagRegistryType = (type: TaxonomyManagerType): type is CrmTagRegistryType => (
    type === 'customerTags' || type === 'interactionTags' || type === 'interactionResultTags'
  );

  const handleCreateSalesTaxonomy = async (type: SalesTaxonomyType, value: string) => {
    setSalesTaxonomyBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/settings/sales-taxonomy/${type}`, {
        method: 'POST',
        body: {
          value,
          reasonTemplate,
          reasonNote
        }
      });
      await Promise.all([loadSalesTaxonomy(), loadCenter(), selectedDomain === 'sales_crm_policies' ? loadDomain(selectedDomain) : Promise.resolve()]);
      setMessage('Đã thêm taxonomy CRM thành công.');
    } catch (taxonomyError) {
      setError(toSettingsFriendlyError(taxonomyError, 'Không thể thêm taxonomy CRM.'));
    } finally {
      setSalesTaxonomyBusy(false);
    }
  };

  const handleRenameSalesTaxonomy = async (type: SalesTaxonomyType, currentValue: string, nextValue: string) => {
    setSalesTaxonomyBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/settings/sales-taxonomy/${type}/${encodeURIComponent(currentValue)}`, {
        method: 'PATCH',
        body: {
          nextValue,
          reasonTemplate,
          reasonNote
        }
      });
      await Promise.all([loadSalesTaxonomy(), loadCenter(), selectedDomain === 'sales_crm_policies' ? loadDomain(selectedDomain) : Promise.resolve()]);
      setMessage('Đã cập nhật taxonomy CRM thành công.');
    } catch (taxonomyError) {
      setError(toSettingsFriendlyError(taxonomyError, 'Không thể cập nhật taxonomy CRM.'));
    } finally {
      setSalesTaxonomyBusy(false);
    }
  };

  const handleDeleteSalesTaxonomy = async (type: SalesTaxonomyType, value: string) => {
    setSalesTaxonomyBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/settings/sales-taxonomy/${type}/${encodeURIComponent(value)}`, {
        method: 'DELETE',
        body: {
          reasonTemplate,
          reasonNote
        }
      });
      await Promise.all([loadSalesTaxonomy(), loadCenter(), selectedDomain === 'sales_crm_policies' ? loadDomain(selectedDomain) : Promise.resolve()]);
      setMessage('Đã xóa taxonomy CRM thành công.');
    } catch (taxonomyError) {
      setError(toSettingsFriendlyError(taxonomyError, 'Không thể xóa taxonomy CRM.'));
    } finally {
      setSalesTaxonomyBusy(false);
    }
  };

  const handleCreateCrmTagRegistry = async (type: CrmTagRegistryType, value: string) => {
    setCrmTagRegistryBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/settings/crm-tags/${type}`, {
        method: 'POST',
        body: {
          value,
          reasonTemplate,
          reasonNote
        }
      });
      await Promise.all([loadCrmTagRegistry(), loadCenter(), selectedDomain === 'sales_crm_policies' ? loadDomain(selectedDomain) : Promise.resolve()]);
      setMessage('Đã thêm CRM tag thành công.');
    } catch (registryError) {
      setError(toSettingsFriendlyError(registryError, 'Không thể thêm CRM tag.'));
    } finally {
      setCrmTagRegistryBusy(false);
    }
  };

  const handleRenameCrmTagRegistry = async (type: CrmTagRegistryType, currentValue: string, nextValue: string) => {
    setCrmTagRegistryBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/settings/crm-tags/${type}/${encodeURIComponent(currentValue)}`, {
        method: 'PATCH',
        body: {
          nextValue,
          reasonTemplate,
          reasonNote
        }
      });
      await Promise.all([loadCrmTagRegistry(), loadCenter(), selectedDomain === 'sales_crm_policies' ? loadDomain(selectedDomain) : Promise.resolve()]);
      setMessage('Đã cập nhật CRM tag thành công.');
    } catch (registryError) {
      setError(toSettingsFriendlyError(registryError, 'Không thể cập nhật CRM tag.'));
    } finally {
      setCrmTagRegistryBusy(false);
    }
  };

  const handleDeleteCrmTagRegistry = async (type: CrmTagRegistryType, value: string) => {
    setCrmTagRegistryBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/settings/crm-tags/${type}/${encodeURIComponent(value)}`, {
        method: 'DELETE',
        body: {
          reasonTemplate,
          reasonNote
        }
      });
      await Promise.all([loadCrmTagRegistry(), loadCenter(), selectedDomain === 'sales_crm_policies' ? loadDomain(selectedDomain) : Promise.resolve()]);
      setMessage('Đã xóa CRM tag thành công.');
    } catch (registryError) {
      setError(toSettingsFriendlyError(registryError, 'Không thể xóa CRM tag.'));
    } finally {
      setCrmTagRegistryBusy(false);
    }
  };

  const handleRestoreSnapshot = async () => {
    if (!selectedSnapshotId) {
      setError('Vui lòng chọn snapshot để khôi phục.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/settings/snapshots/${selectedSnapshotId}/restore`, {
        method: 'POST',
        body: {
          reasonTemplate,
          reasonNote,
          domains: [selectedDomain]
        }
      });
      setMessage('Khôi phục snapshot thành công.');
      await reloadAll(selectedDomain);
    } catch (restoreError) {
      setError(toSettingsFriendlyError(restoreError, 'Khôi phục snapshot thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const updateMatrixCell = (
    setter: Dispatch<SetStateAction<PermissionMatrix>>,
    moduleKey: string,
    action: PermissionActionKey,
    effect: PermissionEffectValue
  ) => {
    setter((current) => ({
      ...current,
      [moduleKey]: {
        ...(current[moduleKey] ?? { VIEW: '', CREATE: '', UPDATE: '', DELETE: '', APPROVE: '' }),
        [action]: effect
      }
    }));
  };

  const handleCreateIamUser = async () => {
    if (!accountForm.fullName.trim() || !accountForm.email.trim()) {
      setError('Vui lòng nhập đầy đủ họ tên và email khi tạo tài khoản.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = await apiRequest<Record<string, unknown>>('/settings/iam/users', {
        method: 'POST',
        body: {
          fullName: accountForm.fullName,
          email: accountForm.email,
          role: accountForm.role,
          positionId: accountForm.positionId || undefined,
          orgUnitId: accountForm.orgUnitId || undefined
        }
      });

      const temporaryPassword = String(payload.temporaryPassword ?? '');
      setMessage(temporaryPassword
        ? `Đã tạo tài khoản. Mật khẩu tạm one-time: ${temporaryPassword}`
        : 'Đã tạo tài khoản nhân viên thành công.');
      setAccountForm({
        fullName: '',
        email: '',
        role: 'STAFF',
        positionId: '',
        orgUnitId: ''
      });
      await loadEnterpriseData();
    } catch (saveError) {
      setError(toSettingsFriendlyError(saveError, 'Tạo tài khoản nhân viên thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const handleResetIamPassword = async (userId: string) => {
    if (!userId) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = await apiRequest<Record<string, unknown>>(`/settings/iam/users/${userId}/reset-password`, {
        method: 'POST'
      });
      const temporaryPassword = String(payload.temporaryPassword ?? '');
      setMessage(temporaryPassword
        ? `Đã reset mật khẩu tạm: ${temporaryPassword}`
        : 'Đã reset mật khẩu tạm.');
      await loadEnterpriseData();
    } catch (resetError) {
      setError(toSettingsFriendlyError(resetError, 'Reset mật khẩu thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const handleBulkResetIamPassword = async () => {
    const ids = selectedIamUserIds.map((id) => String(id)).filter(Boolean);
    if (ids.length === 0) {
      setError('Vui lòng chọn ít nhất 1 tài khoản IAM.');
      return;
    }

    if (!window.confirm(`Reset mật khẩu tạm cho ${ids.length} tài khoản đã chọn?`)) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await runBulkOperation({
        ids,
        continueOnError: true,
        chunkSize: 10,
        execute: async (userId) => {
          await apiRequest(`/settings/iam/users/${userId}/reset-password`, {
            method: 'POST'
          });
        }
      });

      const normalized: BulkExecutionResult = {
        ...result,
        actionLabel: 'Reset mật khẩu IAM',
        message: formatBulkSummary(
          {
            ...result,
            actionLabel: 'Reset mật khẩu IAM'
          },
          'Reset mật khẩu IAM'
        )
      };

      if (normalized.successCount > 0) {
        await loadEnterpriseData();
      }
      setMessage(normalized.message ?? null);
      if (normalized.failedCount > 0) {
        setError('Một số tài khoản IAM reset mật khẩu thất bại.');
      }
    } catch (bulkError) {
      setError(toSettingsFriendlyError(bulkError, 'Bulk reset mật khẩu thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateOrgUnit = async () => {
    if (!orgUnitForm.name.trim()) {
      setError('Vui lòng nhập tên node tổ chức.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiRequest('/settings/organization/units', {
        method: 'POST',
        body: {
          name: orgUnitForm.name,
          type: orgUnitForm.type,
          parentId: orgUnitForm.parentId || undefined,
          managerEmployeeId: orgUnitForm.managerEmployeeId || undefined
        }
      });
      setMessage('Đã tạo node tổ chức.');
      setOrgUnitForm({
        name: '',
        type: 'TEAM',
        parentId: '',
        managerEmployeeId: ''
      });
      await loadEnterpriseData();
    } catch (createError) {
      setError(toSettingsFriendlyError(createError, 'Tạo node tổ chức thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const handleAssignOrgManager = async () => {
    if (!orgManagerForm.unitId) {
      setError('Vui lòng chọn org unit để gán quản lý.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/settings/organization/units/${orgManagerForm.unitId}`, {
        method: 'PATCH',
        body: {
          managerEmployeeId: orgManagerForm.managerEmployeeId || ''
        }
      });
      setMessage('Đã cập nhật quản lý cho org unit.');
      await loadEnterpriseData();
    } catch (assignError) {
      setError(toSettingsFriendlyError(assignError, 'Cập nhật manager org unit thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const handleMoveOrgUnit = async () => {
    if (!orgMoveForm.unitId || !orgMoveForm.parentId) {
      setError('Vui lòng chọn đầy đủ node cần chuyển và parent mới.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/settings/organization/units/${orgMoveForm.unitId}/move`, {
        method: 'POST',
        body: {
          parentId: orgMoveForm.parentId
        }
      });
      setMessage('Đã di chuyển node tổ chức.');
      await loadEnterpriseData();
    } catch (moveError) {
      setError(toSettingsFriendlyError(moveError, 'Di chuyển node thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const resetPositionForm = () => {
    setPositionForm({
      id: '',
      title: '',
      code: '',
      level: '',
      status: 'ACTIVE'
    });
  };

  const handleOpenCreatePosition = () => {
    setPositionFormMode('create');
    resetPositionForm();
    setShowPositionForm(true);
  };

  const handleOpenEditPosition = (item: PositionSummaryItem) => {
    setPositionFormMode('edit');
    setPositionForm({
      id: item.id,
      title: item.title,
      code: item.code,
      level: item.level,
      status: item.status || 'ACTIVE'
    });
    setShowPositionForm(true);
  };

  const handleCancelPositionForm = () => {
    setShowPositionForm(false);
    resetPositionForm();
  };

  const handleSubmitPositionForm = async () => {
    const title = positionForm.title.trim();
    if (!title) {
      setError('Tên vị trí không được để trống.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const path = positionFormMode === 'create'
        ? '/settings/positions'
        : `/settings/positions/${positionForm.id}`;
      const method = positionFormMode === 'create' ? 'POST' : 'PATCH';
      const payload = await apiRequest<Record<string, unknown>>(path, {
        method,
        body: {
          title,
          code: positionForm.code.trim() || undefined,
          level: positionForm.level.trim() || undefined,
          status: positionForm.status
        }
      });

      setMessage(positionFormMode === 'create' ? 'Đã thêm vị trí công việc.' : 'Đã cập nhật vị trí công việc.');
      setShowPositionForm(false);
      resetPositionForm();
      await loadEnterpriseData();
    } catch (positionError) {
      setError(
        toSettingsFriendlyError(
          positionError,
          positionFormMode === 'create' ? 'Thêm vị trí thất bại.' : 'Cập nhật vị trí thất bại.'
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePosition = async (item: PositionSummaryItem) => {
    const accepted = window.confirm(`Xóa vị trí '${item.title}'?`);
    if (!accepted) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/settings/positions/${item.id}`, {
        method: 'DELETE'
      });
      setMessage('Đã xóa vị trí công việc.');
      await loadEnterpriseData();
    } catch (deleteError) {
      setError(toSettingsFriendlyError(deleteError, 'Xóa vị trí thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveUserOverrides = async () => {
    if (!selectedOverrideUserId) {
      setError('Vui lòng chọn user để cấu hình override.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/settings/permissions/users/${selectedOverrideUserId}/overrides`, {
        method: 'PUT',
        body: {
          reason: reasonTemplate,
          rules: mapMatrixToRules(overrideMatrix)
        }
      });
      setMessage('Đã lưu override quyền theo user.');
      await loadEnterpriseData();
    } catch (overrideError) {
      setError(toSettingsFriendlyError(overrideError, 'Lưu override quyền thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const renderOrgTreeNodes = (nodes: Record<string, unknown>[], depth = 0): ReactNode[] => {
    return nodes.flatMap((node) => {
      const id = String(node.id ?? '');
      const name = String(node.name ?? '');
      const type = String(node.type ?? '');
      const children = Array.isArray(node.children) ? (node.children as Record<string, unknown>[]) : [];

      return [
        (
          <div
            key={`${id}-${depth}`}
            style={{
              paddingLeft: `${depth * 1.2}rem`,
              borderLeft: depth > 0 ? '1px dashed #d6e6dc' : 'none',
              marginLeft: depth > 0 ? '0.35rem' : '0',
              marginTop: '0.25rem'
            }}
          >
            <strong style={{ fontSize: '0.82rem' }}>{name || id}</strong>
            <span style={{ marginLeft: '0.4rem', color: 'var(--muted)', fontSize: '0.75rem' }}>{type}</span>
          </div>
        ),
        ...renderOrgTreeNodes(children, depth + 1)
      ];
    });
  };

  const selectedDomainState = center?.domainStates.find((item) => item.domain === selectedDomain);

  return (
    <article className="module-workbench" style={{ background: 'transparent' }}>
      <header className="module-header" style={{ background: 'transparent', borderBottom: 'none', padding: '0 0 1.5rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800 }}>Trung tâm cấu hình hệ thống</h1>
            <p style={{ color: 'var(--muted)', marginTop: '0.4rem' }}>
              Cấu hình tập trung cho {SYSTEM_PROFILE.companyName}: tối giản thao tác, chuẩn hóa dữ liệu, tăng tự động hóa và AI giám sát.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
              <Link href="/modules/settings/custom-fields" className="btn btn-ghost">
                Mở trang Trường tùy chỉnh
              </Link>
            </div>
          </div>
          <AdvancedToggle
            value={advancedMode}
            onChange={(next) => {
              setAdvancedTouchedByUser(true);
              setAdvancedMode(next);
            }}
          />
        </div>
      </header>

      <section className="settings-center-layout">
        <GroupedSidebar
          groups={sidebarGroups}
          labels={DOMAIN_LABEL}
          selectedDomain={selectedDomain}
          onSelectDomain={setSelectedDomain}
          domainStates={center?.domainStates}
        />

        <main className="settings-center-main">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.8rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>{domainConfig.title}</h3>
              <p style={{ margin: '0.35rem 0 0 0', color: 'var(--muted)', fontSize: '0.875rem' }}>{domainConfig.description}</p>
              <p style={{ margin: '0.35rem 0 0 0', color: selectedDomainState?.ok ? '#1b8748' : '#d97706', fontSize: '0.8rem', fontWeight: 600 }}>
                Trạng thái miền cấu hình: {selectedDomainState?.ok ? 'Ổn định' : 'Cần rà soát'}
              </p>
              <p style={{ margin: '0.2rem 0 0 0', color: 'var(--muted)', fontSize: '0.78rem' }}>
                Runtime: {selectedDomainState?.runtimeApplied ? 'Đã áp dụng' : 'Chưa áp dụng'} · Cập nhật lúc: {formatDateTime(selectedDomainState?.runtimeLoadedAt)}
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => void reloadAll(selectedDomain)} disabled={busy}>
              Làm mới
            </button>
          </div>

          <DomainTabs
            tabs={domainTabs}
            activeTab={resolvedActiveDomainTab}
            onChange={setActiveDomainTab}
          />

          {selectedDomain === 'access_security' && (
            <section className="settings-role-playbook">
              <h4 style={{ margin: 0, fontSize: '0.92rem' }}>Luồng thao tác theo vai trò</h4>
              <div className="settings-role-playbook-grid">
                {ACCESS_SECURITY_ROLE_PLAYBOOK.map((playbook) => {
                  const isCurrentRole = normalizedRole === playbook.role;
                  return (
                    <article
                      key={`playbook-${playbook.role}`}
                      className={`settings-role-playbook-item${isCurrentRole ? ' is-current' : ''}`}
                    >
                      <strong>{ROLE_LABEL_MAP[playbook.role] ?? playbook.role}</strong>
                      <p>{playbook.title}</p>
                      <ul>
                        {playbook.steps.map((step) => (
                          <li key={`${playbook.role}-${step}`}>{step}</li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {sectionViewModels.map(({ section, sectionKey }) => {
              const isCollapsed = sectionCollapseState[sectionKey] ?? false;
              return (
              <section key={section.id} className={`settings-section-card${isCollapsed ? ' is-collapsed' : ''}`}>
                <div className="settings-section-head">
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{section.title}</h4>
                    <p style={{ margin: '0.22rem 0 0 0', color: 'var(--muted)', fontSize: '0.74rem' }}>
                      {section.fields.length} trường cấu hình
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setSectionCollapseState((current) => ({
                        ...current,
                        [sectionKey]: !isCollapsed
                      }))
                    }
                  >
                    {isCollapsed ? 'Mở rộng' : 'Thu gọn'}
                  </button>
                </div>
                {section.description && (
                  <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--muted)' }}>{section.description}</p>
                )}

                {!isCollapsed && (
                  <div className="form-grid" style={{ marginTop: '0.6rem' }}>
                  {section.fields.map((field) => {
                    const value = getFieldValue(field, draftData);
                    const errors = fieldErrorMap[field.id] ?? [];

                    if (field.type === 'switch') {
                      return (
                        <div className="field" key={field.id}>
                          <label className="checkbox-wrap">
                            <input
                              type="checkbox"
                              checked={value === true}
                              onChange={(event) => updateField(field, event.target.checked)}
                            />
                            <span>{field.label}</span>
                          </label>
                          {field.helper && <small>{field.helper}</small>}
                          {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
                        </div>
                      );
                    }

                    if (field.type === 'select') {
                      return (
                        <div className="field" key={field.id}>
                          <label htmlFor={field.id}>{field.label}</label>
                          <select
                            id={field.id}
                            value={String(value)}
                            onChange={(event) => updateField(field, event.target.value)}
                          >
                            {(field.options ?? []).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {field.helper && <small>{field.helper}</small>}
                          {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
                        </div>
                      );
                    }

                    if (field.type === 'multiSelect') {
                      const selected = toStringArray(value);
                      return (
                        <div className="field" key={field.id}>
                          <label>{field.label}</label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.35rem' }}>
                            {(field.options ?? []).map((option) => (
                              <label key={`${field.id}-${option.value}`} className="checkbox-wrap" style={{ border: '1px solid #dbeadf', borderRadius: '8px', padding: '0.35rem 0.45rem' }}>
                                <input
                                  type="checkbox"
                                  checked={selected.includes(option.value)}
                                  onChange={(event) => {
                                    const next = event.target.checked
                                      ? [...selected, option.value]
                                      : selected.filter((item) => item !== option.value);
                                    updateField(field, next);
                                  }}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                          {field.helper && <small>{field.helper}</small>}
                          {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
                        </div>
                      );
                    }

                    if (field.type === 'textarea' || field.type === 'userDomainMap') {
                      return (
                        <div className="field" key={field.id}>
                          <label htmlFor={field.id}>{field.label}</label>
                          <textarea
                            id={field.id}
                            value={String(value)}
                            placeholder={field.placeholder}
                            onChange={(event) => updateField(field, event.target.value)}
                          />
                          {field.helper && <small>{field.helper}</small>}
                          {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
                        </div>
                      );
                    }

                    if (field.type === 'number') {
                      return (
                        <div className="field" key={field.id}>
                          <label htmlFor={field.id}>{field.label}</label>
                          <div style={{ display: 'grid', gridTemplateColumns: field.unit ? '1fr auto' : '1fr', gap: '0.4rem', alignItems: 'center' }}>
                            <input
                              id={field.id}
                              type="number"
                              value={String(value)}
                              min={field.min}
                              max={field.max}
                              step={field.step ?? 1}
                              onChange={(event) => updateField(field, event.target.value)}
                            />
                            {field.unit && <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{field.unit}</span>}
                          </div>
                          {field.helper && <small>{field.helper}</small>}
                          {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
                        </div>
                      );
                    }

                    if (field.type === 'secret') {
                      return (
                        <div className="field" key={field.id}>
                          <label htmlFor={field.id}>{field.label}</label>
                          <input
                            id={field.id}
                            type="password"
                            value={String(value)}
                            placeholder={field.placeholder}
                            autoComplete="off"
                            onChange={(event) => updateField(field, event.target.value)}
                          />
                          {field.helper && <small>{field.helper}</small>}
                          {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
                        </div>
                      );
                    }

                    if (field.type === 'managedList') {
                      const managedListType = field.managedListType;
                      if (!managedListType) {
                        return (
                          <div className="field" key={field.id}>
                            <label>{field.label}</label>
                            <small style={{ color: '#b91c1c' }}>Thiếu cấu hình managedListType cho field này.</small>
                          </div>
                        );
                      }

                      const pickerOptions = managedListType === 'fieldKey'
                        ? hrAppendixFieldPickerOptions
                        : undefined;

                      return (
                        <div className="field" key={field.id} style={{ gridColumn: '1 / -1' }}>
                          <SettingsListManagerField
                            title={field.label}
                            description={field.helper}
                            listType={managedListType}
                            items={toManagedListItems(field, value)}
                            pickerOptions={pickerOptions}
                            busy={busy}
                            testId={field.id}
                            onChange={(nextValues) => updateField(field, nextValues)}
                          />
                          {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
                        </div>
                      );
                    }

                    if (field.type === 'tags') {
                      const text = toStringArray(value).join(', ');
                      return (
                        <div className="field" key={field.id}>
                          <label htmlFor={field.id}>{field.label}</label>
                          <input
                            id={field.id}
                            type="text"
                            value={text}
                            placeholder={field.placeholder ?? 'A, B, C'}
                            onChange={(event) => updateField(field, event.target.value)}
                          />
                          {field.helper && <small>{field.helper}</small>}
                          {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
                        </div>
                      );
                    }

                    if (field.type === 'taxonomyManager') {
                      const managerType = field.taxonomyType;
                      if (!managerType) {
                        return (
                          <div className="field" key={field.id}>
                            <label>{field.label}</label>
                            <small style={{ color: '#b91c1c' }}>Thiếu cấu hình taxonomyType cho field này.</small>
                          </div>
                        );
                      }

                      if (isSalesTaxonomyType(managerType)) {
                        return (
                          <div className="field" key={field.id} style={{ gridColumn: '1 / -1' }}>
                            <TaxonomyManagerField
                              type={managerType}
                              title={field.label}
                              description={field.helper}
                              items={salesTaxonomy[managerType]}
                              busy={busy || salesTaxonomyBusy}
                              normalization="none"
                              valueLabel="Gia tri taxonomy"
                              searchPlaceholder="Tim kiem taxonomy..."
                              inputPlaceholder="Vi du: DANG_TU_VAN"
                              inputHelper="Gia tri taxonomy duoc giu nguyen theo cach nhap."
                              onCreate={handleCreateSalesTaxonomy}
                              onRename={handleRenameSalesTaxonomy}
                              onDelete={handleDeleteSalesTaxonomy}
                            />
                            {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
                          </div>
                        );
                      }

                      if (!isCrmTagRegistryType(managerType)) {
                        return (
                          <div className="field" key={field.id}>
                            <label>{field.label}</label>
                            <small style={{ color: '#b91c1c' }}>taxonomyType không hợp lệ cho field này.</small>
                          </div>
                        );
                      }

                      return (
                        <div className="field" key={field.id} style={{ gridColumn: '1 / -1' }}>
                          <TaxonomyManagerField
                            type={managerType}
                            title={field.label}
                            description={field.helper}
                            items={crmTagRegistry[managerType]}
                            busy={busy || crmTagRegistryBusy}
                            normalization="lower"
                            valueLabel="Gia tri tag"
                            searchPlaceholder="Tim kiem CRM tag..."
                            inputPlaceholder="Vi du: vip"
                            inputHelper="Gia tri se duoc chuan hoa lowercase de dong nhat CRM tag registry."
                            onCreate={handleCreateCrmTagRegistry}
                            onRename={handleRenameCrmTagRegistry}
                            onDelete={handleDeleteCrmTagRegistry}
                          />
                          {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
                        </div>
                      );
                    }

                    if (field.type === 'color') {
                      return (
                        <div className="field" key={field.id}>
                          <label htmlFor={field.id}>{field.label}</label>
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <input
                              id={`${field.id}-picker`}
                              type="color"
                              value={String(value) || field.placeholder || '#0a5f38'}
                              onChange={(event) => {
                                updateField(field, event.target.value);
                                if (field.path === 'branding.primaryColor' && typeof document !== 'undefined') {
                                  document.documentElement.style.setProperty('--primary', event.target.value);
                                }
                              }}
                              style={{ width: '38px', height: '38px', padding: '0', border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 'var(--radius)' }}
                            />
                            <input
                              id={field.id}
                              type="text"
                              value={String(value)}
                              placeholder={field.placeholder}
                              onChange={(event) => {
                                updateField(field, event.target.value);
                                if (field.path === 'branding.primaryColor' && typeof document !== 'undefined') {
                                  // Only apply valid hex colors
                                  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
                                  if (hexRegex.test(event.target.value)) {
                                    document.documentElement.style.setProperty('--primary', event.target.value);
                                  }
                                }
                              }}
                              style={{ flex: 1, textTransform: 'uppercase', fontFamily: 'monospace' }}
                            />
                          </div>
                          {field.helper && <small>{field.helper}</small>}
                          {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
                        </div>
                      );
                    }

                    return (
                      <div className="field" key={field.id}>
                        <label htmlFor={field.id}>{field.label}</label>
                        <input
                          id={field.id}
                          type="text"
                          value={String(value)}
                          placeholder={field.placeholder}
                          onChange={(event) => updateField(field, event.target.value)}
                        />
                        {field.helper && <small>{field.helper}</small>}
                        {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
                      </div>
                    );
                  })}
                  </div>
                )}
              </section>
              );
            })}
          </div>

          {selectedDomain === 'org_profile' && activeTabConfig?.showOrgStructure === true && (
            <section style={{ border: '1px solid #e5f0e8', borderRadius: '10px', padding: '0.75rem', marginTop: '0.9rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Sơ đồ tổ chức doanh nghiệp</h4>
              <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Quản lý cây tổ chức chuẩn COMPANY &gt; BRANCH &gt; DEPARTMENT &gt; TEAM.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.65rem' }}>
                <div style={{ border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
                  <strong style={{ fontSize: '0.82rem' }}>Tạo node mới</strong>
                  <div className="form-grid" style={{ marginTop: '0.45rem' }}>
                    <div className="field">
                      <label>Tên đơn vị</label>
                      <input
                        value={orgUnitForm.name}
                        onChange={(event) => setOrgUnitForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Ví dụ: Chi nhánh Hà Nội"
                      />
                    </div>
                    <div className="field">
                      <label>Loại node</label>
                      <select
                        value={orgUnitForm.type}
                        onChange={(event) => setOrgUnitForm((current) => ({ ...current, type: event.target.value }))}
                      >
                        <option value="COMPANY">COMPANY</option>
                        <option value="BRANCH">BRANCH</option>
                        <option value="DEPARTMENT">DEPARTMENT</option>
                        <option value="TEAM">TEAM</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Parent node</label>
                      <select
                        value={orgUnitForm.parentId}
                        onChange={(event) => setOrgUnitForm((current) => ({ ...current, parentId: event.target.value }))}
                      >
                        <option value="">-- Root --</option>
                        {orgUnitOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Manager (managerEmployeeId)</label>
                      <select
                        value={orgUnitForm.managerEmployeeId}
                        onChange={(event) => setOrgUnitForm((current) => ({ ...current, managerEmployeeId: event.target.value }))}
                      >
                        <option value="">-- Chưa gán --</option>
                        {managerEmployeeOptions.map((item) => (
                          <option key={`create-manager-${item.employeeId}`} value={item.employeeId}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={handleCreateOrgUnit} disabled={busy}>
                      Tạo node
                    </button>
                  </div>
                </div>

                <div style={{ border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
                  <strong style={{ fontSize: '0.82rem' }}>Di chuyển node</strong>
                  <div className="form-grid" style={{ marginTop: '0.45rem' }}>
                    <div className="field">
                      <label>Node cần chuyển</label>
                      <select
                        value={orgMoveForm.unitId}
                        onChange={(event) => setOrgMoveForm((current) => ({ ...current, unitId: event.target.value }))}
                      >
                        <option value="">-- Chọn node --</option>
                        {orgUnitOptions.map((item) => (
                          <option key={`move-${item.id}`} value={item.id}>
                            {item.name} ({item.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Parent mới</label>
                      <select
                        value={orgMoveForm.parentId}
                        onChange={(event) => setOrgMoveForm((current) => ({ ...current, parentId: event.target.value }))}
                      >
                        <option value="">-- Chọn parent mới --</option>
                        {orgUnitOptions.map((item) => (
                          <option key={`parent-${item.id}`} value={item.id}>
                            {item.name} ({item.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={handleMoveOrgUnit} disabled={busy}>
                      Di chuyển node
                    </button>
                  </div>

                  <div style={{ marginTop: '0.65rem', borderTop: '1px dashed #dbe9df', paddingTop: '0.55rem' }}>
                    <strong style={{ fontSize: '0.82rem' }}>Gán quản lý cho org unit</strong>
                    <div className="form-grid" style={{ marginTop: '0.45rem' }}>
                      <div className="field">
                        <label>Org unit</label>
                        <select
                          value={orgManagerForm.unitId}
                          onChange={(event) => setOrgManagerForm((current) => ({ ...current, unitId: event.target.value }))}
                        >
                          <option value="">-- Chọn node --</option>
                          {orgUnitOptions.map((item) => (
                            <option key={`manager-unit-${item.id}`} value={item.id}>
                              {item.name} ({item.type})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Manager (managerEmployeeId)</label>
                        <select
                          value={orgManagerForm.managerEmployeeId}
                          onChange={(event) => setOrgManagerForm((current) => ({ ...current, managerEmployeeId: event.target.value }))}
                        >
                          <option value="">-- Bỏ gán manager --</option>
                          {managerEmployeeOptions.map((item) => (
                            <option key={`manager-option-${item.employeeId}`} value={item.employeeId}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button type="button" className="btn btn-primary" onClick={handleAssignOrgManager} disabled={busy}>
                        Cập nhật manager
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '0.75rem', border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
                <strong style={{ fontSize: '0.82rem' }}>Cây tổ chức hiện tại</strong>
                <div style={{ marginTop: '0.3rem' }}>
                  {orgTree.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Chưa có dữ liệu org tree.</p>
                  ) : (
                    renderOrgTreeNodes(orgTree)
                  )}
                </div>
              </div>
            </section>
          )}

          {selectedDomain === 'hr_policies' && activeTabConfig?.showHrAccounts === true && (
            <section style={{ border: '1px solid #e5f0e8', borderRadius: '10px', padding: '0.75rem', marginTop: '0.9rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Tạo nhân viên + tài khoản đăng nhập</h4>
              <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Luồng cấp tài khoản chuẩn. Hệ thống trả mật khẩu tạm và bắt buộc đổi ở lần đăng nhập đầu tiên.
              </p>

              <div className="form-grid" style={{ marginTop: '0.65rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <div className="field">
                  <label>Họ tên nhân viên</label>
                  <input
                    value={accountForm.fullName}
                    onChange={(event) => setAccountForm((current) => ({ ...current, fullName: event.target.value }))}
                    placeholder="Nguyễn Văn A"
                  />
                </div>
                <div className="field">
                  <label>Email tài khoản</label>
                  <input
                    value={accountForm.email}
                    onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="nguyenvana@company.vn"
                  />
                </div>
                <div className="field">
                  <label>Vai trò hệ thống</label>
                  <select
                    value={accountForm.role}
                    onChange={(event) => setAccountForm((current) => ({ ...current, role: event.target.value }))}
                  >
                    {ROLE_OPTIONS.map((item) => (
                      <option key={`account-role-${item.value}`} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Vị trí công việc</label>
                  <select
                    value={accountForm.positionId}
                    onChange={(event) => setAccountForm((current) => ({ ...current, positionId: event.target.value }))}
                  >
                    <option value="">-- Chọn vị trí --</option>
                    {positionOptions.map((item) => (
                      <option key={`position-${item.id}`} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Org unit</label>
                  <select
                    value={accountForm.orgUnitId}
                    onChange={(event) => setAccountForm((current) => ({ ...current, orgUnitId: event.target.value }))}
                  >
                    <option value="">-- Chọn đơn vị --</option>
                    {orgUnitOptions.map((item) => (
                      <option key={`account-org-${item.id}`} value={item.id}>
                        {item.name} ({item.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '0.55rem', display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-primary" onClick={handleCreateIamUser} disabled={busy}>
                  Tạo tài khoản nhân viên
                </button>
              </div>

              <div style={{ marginTop: '0.75rem', border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.82rem' }}>Danh sách tài khoản IAM</strong>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                      Đã chọn {selectedIamUserIds.length}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setSelectedIamUserIds([])}
                      disabled={selectedIamUserIds.length === 0 || busy}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void handleBulkResetIamPassword()}
                      disabled={selectedIamUserIds.length === 0 || busy}
                    >
                      Bulk reset mật khẩu
                    </button>
                  </div>
                </div>
                {iamUsers.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.35rem' }}>Chưa có tài khoản.</p>
                ) : (
                  <div className="table-wrap" style={{ marginTop: '0.45rem' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              checked={
                                iamUsers.slice(0, 40).length > 0 &&
                                iamUsers.slice(0, 40).every((item) => selectedIamUserIds.includes(String(item.id ?? '')))
                              }
                              onChange={(event) => {
                                const visibleIds = iamUsers.slice(0, 40).map((item) => String(item.id ?? '')).filter(Boolean);
                                setSelectedIamUserIds(event.target.checked ? visibleIds : []);
                              }}
                            />
                          </th>
                          <th>Email</th>
                          <th>Vai trò</th>
                          <th>Nhân viên</th>
                          <th>Trạng thái</th>
                          <th>Hành động</th>
                        </tr>
                      </thead>
                      <tbody>
                        {iamUsers.slice(0, 40).map((item) => {
                          const userId = String(item.id ?? '');
                          const employee = toRecord(item.employee);
                          return (
                            <tr key={`iam-${userId}`}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selectedIamUserIds.includes(userId)}
                                  onChange={(event) =>
                                    setSelectedIamUserIds((prev) => {
                                      if (event.target.checked) {
                                        return prev.includes(userId) ? prev : [...prev, userId];
                                      }
                                      return prev.filter((id) => String(id) !== userId);
                                    })
                                  }
                                />
                              </td>
                              <td>{String(item.email ?? '--')}</td>
                              <td>{String(item.role ?? '--')}</td>
                              <td>{String(employee.fullName ?? '--')}</td>
                              <td>{item.mustChangePassword === true ? 'Đổi mật khẩu lần đầu' : 'Đang hoạt động'}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  onClick={() => void handleResetIamPassword(userId)}
                                  disabled={busy}
                                >
                                  Reset mật khẩu
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {selectedDomain === 'access_security' && activeTabConfig?.showAccessMatrix === true && (
            <section style={{ border: '1px solid #e5f0e8', borderRadius: '10px', padding: '0.75rem', marginTop: '0.9rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Trung tâm cấu hình vị trí và phân quyền</h4>
              <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Quản trị tập trung danh sách vị trí, số nhân sự theo vị trí và ma trận quyền chi tiết theo từng hành động.
              </p>

              <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.65rem' }}>
                <div style={{ border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.82rem' }}>Danh sách vị trí công việc</strong>
                    <div style={{ display: 'inline-flex', gap: '0.45rem' }}>
                      {canManagePositionCatalog ? (
                        <button type="button" className="btn btn-primary" onClick={handleOpenCreatePosition} disabled={busy}>
                          Thêm vị trí
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Chỉ ADMIN được thêm/sửa/xóa vị trí.</span>
                      )}
                    </div>
                  </div>

                  {showPositionForm && (
                    <div style={{ marginTop: '0.55rem', border: '1px dashed #dbe9df', borderRadius: '8px', padding: '0.55rem' }}>
                      <strong style={{ fontSize: '0.82rem' }}>
                        {positionFormMode === 'create' ? 'Thêm vị trí mới' : 'Cập nhật vị trí'}
                      </strong>
                      <div className="form-grid" style={{ marginTop: '0.45rem' }}>
                        <div className="field">
                          <label>Tên vị trí</label>
                          <input
                            value={positionForm.title}
                            onChange={(event) => setPositionForm((current) => ({ ...current, title: event.target.value }))}
                            placeholder="Ví dụ: Trưởng phòng kinh doanh"
                          />
                        </div>
                        <div className="field">
                          <label>Mã vị trí</label>
                          <input
                            value={positionForm.code}
                            onChange={(event) => setPositionForm((current) => ({ ...current, code: event.target.value }))}
                            placeholder="SALES_MANAGER"
                          />
                        </div>
                        <div className="field">
                          <label>Cấp vị trí</label>
                          <input
                            value={positionForm.level}
                            onChange={(event) => setPositionForm((current) => ({ ...current, level: event.target.value }))}
                            placeholder="MANAGER / LEAD / STAFF"
                          />
                        </div>
                        <div className="field">
                          <label>Trạng thái</label>
                          <select
                            value={positionForm.status}
                            onChange={(event) => setPositionForm((current) => ({ ...current, status: event.target.value }))}
                          >
                            {POSITION_STATUS_OPTIONS.map((item) => (
                              <option key={`position-status-${item.value}`} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div style={{ marginTop: '0.45rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button type="button" className="btn btn-ghost" onClick={handleCancelPositionForm} disabled={busy}>
                          Hủy
                        </button>
                        <button type="button" className="btn btn-primary" onClick={handleSubmitPositionForm} disabled={busy}>
                          {positionFormMode === 'create' ? 'Thêm vị trí' : 'Lưu thay đổi'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: '0.55rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <input
                      style={{ maxWidth: '320px' }}
                      value={positionSearch}
                      onChange={(event) => setPositionSearch(event.target.value)}
                      placeholder="Tìm vị trí theo tên/mã/cấp..."
                    />
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                      {filteredPositions.length}/{positions.length} vị trí
                    </span>
                  </div>

                  <div className="table-wrap" style={{ marginTop: '0.45rem' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Vị trí</th>
                          <th>Mã</th>
                          <th>Cấp</th>
                          <th>Bộ phận</th>
                          <th>Nhân sự</th>
                          <th>Rule quyền</th>
                          <th>Trạng thái</th>
                          <th>Hành động</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPositions.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ color: 'var(--muted)' }}>
                              Chưa có vị trí nào.
                            </td>
                          </tr>
                        ) : (
                          filteredPositions.map((item) => (
                            <tr key={`position-row-${item.id}`}>
                              <td>
                                <Link
                                  href={`/modules/settings/positions/${item.id}`}
                                  className="btn btn-ghost"
                                  style={{ padding: 0, minHeight: 'unset' }}
                                >
                                  {item.title}
                                </Link>
                              </td>
                              <td>{item.code || '--'}</td>
                              <td>{item.level || '--'}</td>
                              <td>{item.departmentName || '--'}</td>
                              <td>{item.employeeCount.toLocaleString('vi-VN')}</td>
                              <td>{item.permissionRuleCount.toLocaleString('vi-VN')}</td>
                              <td>{item.status}</td>
                              <td>
                                <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => handleOpenEditPosition(item)}
                                    disabled={!canManagePositionCatalog || busy}
                                  >
                                    Sửa
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => void handleDeletePosition(item)}
                                    disabled={!canManagePositionCatalog || busy || item.employeeCount > 0}
                                    title={item.employeeCount > 0 ? 'Không thể xóa vì đang có nhân sự.' : 'Xóa vị trí'}
                                  >
                                    Xóa
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
                  <strong style={{ fontSize: '0.82rem' }}>Chi tiết vị trí mở trên trang riêng</strong>
                  <p style={{ marginTop: '0.45rem', color: 'var(--muted)', fontSize: '0.82rem' }}>
                    Bấm vào tên vị trí để mở trang chi tiết riêng với 2 tab:
                    {' '}
                    <strong>Chi tiết quyền</strong>
                    {' '}
                    và
                    {' '}
                    <strong>Danh sách nhân viên</strong>
                    . Cách này giúp không cần kéo xuống trong màn hình dài.
                  </p>
                </div>

                <div style={{ border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <strong style={{ fontSize: '0.82rem' }}>Override theo user</strong>
                    <select
                      value={selectedOverrideUserId}
                      onChange={(event) => setSelectedOverrideUserId(event.target.value)}
                      style={{ minWidth: '220px' }}
                    >
                      <option value="">-- Chọn user --</option>
                      {iamUsers.map((item) => {
                        const id = String(item.id ?? '');
                        const email = String(item.email ?? '');
                        return (
                          <option key={`override-user-${id}`} value={id}>
                            {email || id}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="table-wrap" style={{ marginTop: '0.45rem' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Module</th>
                          {PERMISSION_ACTIONS.map((action) => (
                            <th key={`override-action-${action}`}>{action}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {PERMISSION_MODULE_KEYS.map((moduleKey) => (
                          <tr key={`override-module-${moduleKey}`}>
                            <td>{moduleKey}</td>
                            {PERMISSION_ACTIONS.map((action) => (
                              <td key={`override-${moduleKey}-${action}`}>
                                <select
                                  value={overrideMatrix[moduleKey]?.[action] ?? ''}
                                  onChange={(event) => updateMatrixCell(setOverrideMatrix, moduleKey, action, event.target.value as PermissionEffectValue)}
                                >
                                  <option value="">--</option>
                                  <option value="ALLOW">ALLOW</option>
                                  <option value="DENY">DENY</option>
                                </select>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginTop: '0.55rem' }}
                    onClick={handleSaveUserOverrides}
                    disabled={busy || !selectedOverrideUserId}
                  >
                    Lưu override theo user
                  </button>
                </div>
              </div>
            </section>
          )}

          {(selectedDomain === 'integrations' || selectedDomain === 'search_performance') && (
            <section style={{ border: '1px dashed var(--line)', borderRadius: '10px', padding: '0.65rem', marginTop: '0.9rem' }}>
              <strong style={{ fontSize: '0.86rem' }}>Trạng thái kết nối</strong>
              {selectedDomain === 'integrations' ? (
                <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.35rem' }}>
                  {['bhtot', 'zalo', 'ai'].map((connector) => {
                    const current = toRecord(getByPath(submissionData, connector === 'ai' ? 'ai' : `${connector}`));
                    const health = String(current.lastHealthStatus ?? 'UNKNOWN');
                    const validatedAt = String(current.lastValidatedAt ?? '');
                    return (
                      <div key={connector} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #e8efea', borderRadius: '8px', padding: '0.35rem 0.5rem' }}>
                        <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{connector}</span>
                        <span style={{ color: health === 'HEALTHY' ? '#1b8748' : '#d97706' }}>
                          {health === 'HEALTHY' ? 'Kết nối tốt' : 'Cần kiểm tra'}{validatedAt ? ` • ${formatDateTime(validatedAt)}` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ margin: '0.45rem 0 0 0', color: 'var(--muted)' }}>
                  Trạng thái tìm kiếm: {String(getByPath(submissionData, 'lastHealthStatus') ?? 'UNKNOWN')} • Lần kiểm tra gần nhất: {formatDateTime(getByPath(submissionData, 'lastValidatedAt'))}
                </p>
              )}
              {testResult && (
                <p style={{ margin: '0.55rem 0 0 0', color: '#1b8748', fontSize: '0.84rem' }}>
                  {selectedDomain === 'search_performance'
                    ? statusText(Boolean(testResult.ok))
                    : 'Đã cập nhật trạng thái kết nối từng connector.'}
                </p>
              )}
            </section>
          )}

          <section style={{ marginTop: '0.9rem', border: '1px dashed var(--line)', borderRadius: '10px', padding: '0.65rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>Diff preview (ngôn ngữ nghiệp vụ)</strong>
            {fieldChanges.length === 0 ? (
              <p style={{ margin: '0.45rem 0 0 0', color: 'var(--muted)' }}>Không có thay đổi.</p>
            ) : (
              <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.4rem' }}>
                {fieldChanges.slice(0, 24).map((change) => (
                  <article key={change.id} style={{ border: '1px solid #edf2ef', borderRadius: '8px', padding: '0.45rem' }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.83rem' }}>{change.label}</p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                      Từ: {change.before}
                    </p>
                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: '#1f6b3a' }}>
                      Thành: {change.after}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section style={{ marginTop: '0.9rem' }}>
            <div className="field">
              <label htmlFor="reason-template">Lý do thay đổi (bắt buộc)</label>
              <select
                id="reason-template"
                value={reasonTemplate}
                onChange={(event) => setReasonTemplate(event.target.value)}
              >
                {REASON_TEMPLATES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginTop: '0.5rem' }}>
              <label htmlFor="reason-note">Ghi chú thêm</label>
              <input
                id="reason-note"
                value={reasonNote}
                placeholder="Ví dụ: Đóng kỳ 2026-03 theo quyết định phòng tài chính"
                onChange={(event) => setReasonNote(event.target.value)}
              />
            </div>
          </section>

          <div style={{ marginTop: '0.9rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" onClick={handleValidate} disabled={busy}>
              Kiểm tra
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={busy}>
              Lưu cấu hình
            </button>
            {(selectedDomain === 'integrations' || selectedDomain === 'search_performance') && (
              <button type="button" className="btn btn-ghost" onClick={handleTestConnection} disabled={busy}>
                Kiểm tra kết nối
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={handleCreateSnapshot} disabled={busy}>
              Tạo snapshot
            </button>
          </div>

          {globalValidationErrors.length > 0 && (
            <div className="banner banner-warning" style={{ marginTop: '0.85rem' }}>
              {globalValidationErrors[0]}
            </div>
          )}

          {error && <div className="banner banner-error" style={{ marginTop: '0.85rem' }}>{error}</div>}
          {message && <div className="banner banner-success" style={{ marginTop: '0.85rem' }}>{message}</div>}
        </main>

        <aside className="settings-center-right">
          <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', background: '#fff' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Checklist khởi tạo</h3>
            <ul style={{ margin: '0.65rem 0 0 1rem' }}>
              <li>Tổ chức: {center?.checklist.org ? 'Hoàn tất' : 'Chờ xử lý'}</li>
              <li>Bảo mật: {center?.checklist.security ? 'Hoàn tất' : 'Chờ xử lý'}</li>
              <li>Tài chính: {center?.checklist.financeControls ? 'Hoàn tất' : 'Chờ xử lý'}</li>
              <li>Tích hợp: {center?.checklist.integrations ? 'Hoàn tất' : 'Chờ xử lý'}</li>
              <li>Chính sách phân hệ: {center?.checklist.modulePolicies ? 'Hoàn tất' : 'Chờ xử lý'}</li>
            </ul>
            <p style={{ margin: '0.65rem 0 0 0', color: 'var(--muted)', fontSize: '0.82rem' }}>
              Tiến độ: {center?.summary.validDomains ?? 0}/{center?.summary.totalDomains ?? DOMAIN_ORDER.length} miền cấu hình đạt chuẩn.
            </p>
            <p style={{ margin: '0.45rem 0 0 0', color: 'var(--muted)', fontSize: '0.78rem' }}>
              Vai trò hiện tại trên web: {role}
            </p>
          </section>

          <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', background: '#fff' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Kết quả kiểm tra</h3>
            <p style={{ marginTop: '0.65rem', fontSize: '0.8rem', color: validationErrors.length === 0 ? '#1b8748' : '#b45309' }}>
              {validationErrors.length === 0 ? 'Không có lỗi validate.' : `${validationErrors.length} lỗi cần xử lý.`}
            </p>
            {validationErrors.length > 0 && (
              <ul style={{ margin: '0.45rem 0 0 1rem', fontSize: '0.78rem' }}>
                {validationErrors.slice(0, 6).map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            )}
            {validationWarnings.length > 0 && (
              <>
                <p style={{ marginTop: '0.55rem', fontSize: '0.8rem', color: '#b45309' }}>Cảnh báo:</p>
                <ul style={{ margin: '0.3rem 0 0 1rem', fontSize: '0.78rem' }}>
                  {validationWarnings.slice(0, 6).map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', background: '#fff' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Ảnh chụp cấu hình</h3>
            <select
              style={{ marginTop: '0.6rem', width: '100%' }}
              value={selectedSnapshotId}
              onChange={(event) => setSelectedSnapshotId(event.target.value)}
            >
              <option value="">-- Chọn snapshot --</option>
              {(center?.recentSnapshots ?? []).map((snapshot) => {
                const id = String(snapshot.id ?? '');
                return (
                  <option key={id} value={id}>
                    {id.slice(0, 8)} • {formatDateTime(snapshot.createdAt)}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: '0.6rem', width: '100%' }}
              onClick={handleRestoreSnapshot}
              disabled={busy || !selectedSnapshotId}
            >
              Khôi phục snapshot đã chọn
            </button>
          </section>

          <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', background: '#fff' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Audit gần nhất</h3>
            <div style={{ marginTop: '0.65rem', display: 'grid', gap: '0.55rem', maxHeight: '260px', overflow: 'auto' }}>
              {(center?.recentAudit ?? []).slice(0, 12).map((item) => {
                const id = String(item.id ?? '');
                return (
                  <article key={id} style={{ border: '1px solid var(--line)', borderRadius: '8px', padding: '0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '0.78rem' }}>{String(item.domain ?? 'system')}</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{String(item.action ?? '')}</span>
                    </div>
                    <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.75rem' }}>{String(item.reason ?? '')}</p>
                    <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.72rem', color: 'var(--muted)' }}>
                      {String(item.actor ?? 'system')} • {formatDateTime(item.createdAt)}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        </aside>
      </section>
    </article>
  );
}
