/* ═══════════════════════════════════════════════
   CRM Customers Board — Shared Types & Constants
   Extracted from crm-customers-board.tsx for modularity.
   ═══════════════════════════════════════════════ */

import type { BadgeVariant } from '../ui/badge';

// ── Enums ────────────────────────────────────────

export type CustomerCareStatus =
  | 'MOI_CHUA_TU_VAN'
  | 'DANG_SUY_NGHI'
  | 'DONG_Y_CHUYEN_THANH_KH'
  | 'KH_TU_CHOI'
  | 'KH_DA_MUA_BEN_KHAC'
  | 'NGUOI_NHA_LAM_THUE_BAO'
  | 'KHONG_NGHE_MAY_LAN_1'
  | 'KHONG_NGHE_MAY_LAN_2'
  | 'SAI_SO_KHONG_TON_TAI_BO_QUA_XOA';

export type CustomerStatusFilter = 'ALL' | CustomerCareStatus;

export type CustomerZaloNickType =
  | 'CHUA_KIEM_TRA'
  | 'CHUA_CO_NICK_ZALO'
  | 'CHAN_NGUOI_LA'
  | 'GUI_DUOC_TIN_NHAN';

// ── Data Models ──────────────────────────────────

export type Customer = {
  id: string;
  code?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  customerStage?: string | null;
  segment?: string | null;
  source?: string | null;
  ownerStaffId?: string | null;
  totalOrders?: number | null;
  totalSpent?: number | string | null;
  lastContactAt?: string | null;
  status?: CustomerCareStatus | string | null;
  zaloNickType?: CustomerZaloNickType | string | null;
  contractCount?: number | null;
  activeContractCount?: number | null;
  nextContractExpiryAt?: string | null;
  contractPackageNames?: string | null;
  contractServicePhones?: string | null;
  contractProductTypes?: string | null;
  contractExpiryDates?: string | null;
  telecomExpiryDates?: string | null;
  digitalServiceNames?: string | null;
  insuranceExpiryDates?: string | null;
  autoInsuranceExpiryDates?: string | null;
  motoInsuranceExpiryDates?: string | null;
  insurancePolicyNumbers?: string | null;
  vehicleCount?: number | null;
  vehicleTypes?: string | null;
  vehicleKinds?: string | null;
  vehiclePlateNumbers?: string | null;
  updatedAt?: string | null;
};

export type ContractProductType = 'TELECOM_PACKAGE' | 'AUTO_INSURANCE' | 'MOTO_INSURANCE' | 'DIGITAL_SERVICE';

export type ContractSummary = {
  totalContracts?: number;
  activeContracts?: number;
  expiredContracts?: number;
  nextExpiringAt?: string | null;
  byProduct?: Partial<Record<ContractProductType, number>>;
};

export type CrmCustomerVehicle = {
  id: string;
  ownerCustomerId?: string | null;
  plateNumber?: string | null;
  chassisNumber?: string | null;
  engineNumber?: string | null;
  vehicleKind?: string | null;
  vehicleType?: string | null;
  ownerFullName?: string | null;
  ownerAddress?: string | null;
  seatCount?: number | null;
  loadKg?: number | null;
  status?: string | null;
  updatedAt?: string | null;
};

export type CrmCustomerContract = {
  id: string;
  productType?: ContractProductType | string | null;
  status?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  sourceRef?: string | null;
  telecomLine?: {
    packageName?: string | null;
    servicePhone?: string | null;
    currentExpiryAt?: string | null;
  } | null;
  autoInsuranceDetail?: {
    soGCN?: string | null;
    vehicleId?: string | null;
  } | null;
  motoInsuranceDetail?: {
    soGCN?: string | null;
    vehicleId?: string | null;
  } | null;
  digitalServiceDetail?: {
    serviceName?: string | null;
    planName?: string | null;
    provider?: string | null;
    serviceAccountRef?: string | null;
  } | null;
};

export type CustomerDetailPayload = {
  customer?: Customer;
  contractSummary?: ContractSummary | null;
  recentContracts?: CrmCustomerContract[];
  vehicles?: CrmCustomerVehicle[];
};

export type CustomerTaxonomyPayload = {
  customerTaxonomy?: {
    stages?: string[];
    sources?: string[];
  };
  tagRegistry?: {
    customerTags?: string[];
    interactionTags?: string[];
    interactionResultTags?: string[];
  };
  customerStatusRegistry?: {
    options?: string[];
    labels?: Partial<Record<CustomerCareStatus, string>>;
  };
};

// ── Form State Types ─────────────────────────────

export type CreateCustomerFormState = {
  fullName: string;
  phone: string;
  email: string;
  customerStage: string;
  source: string;
  segment: string;
  tags: string[];
};

export type DetailCustomerFormState = {
  fullName: string;
  phone: string;
  email: string;
  customerStage: string;
  source: string;
  segment: string;
  status: CustomerCareStatus;
  zaloNickType: CustomerZaloNickType;
  tags: string[];
};

export type VehicleFormState = {
  ownerFullName: string;
  ownerAddress: string;
  plateNumber: string;
  chassisNumber: string;
  engineNumber: string;
  vehicleKind: 'AUTO' | 'MOTO';
  vehicleType: string;
  seatCount: string;
  loadKg: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
};

export type CustomerBulkTagMode = 'APPEND' | 'REPLACE';

export type CustomerBulkFormState = {
  softSkip: boolean;
  status: '' | CustomerCareStatus;
  source: string;
  lastContactDate: string;
  tagsInput: string;
  tagMode: CustomerBulkTagMode;
};

// ── Filter Types ─────────────────────────────────

export type CustomerFilterLogic = 'AND' | 'OR';
export type CustomerFilterFieldKey =
  | 'fullName'
  | 'phone'
  | 'email'
  | 'customerStage'
  | 'source'
  | 'status'
  | 'zaloNickType'
  | 'segment'
  | 'tags'
  | 'lastContactAt'
  | 'updatedAt'
  | 'contractPackageNames'
  | 'contractProductTypes'
  | 'nextContractExpiryAt'
  | 'contractServicePhones'
  | 'vehicleKinds'
  | 'vehicleTypes'
  | 'vehiclePlateNumbers'
  | 'insuranceExpiryDates'
  | 'insurancePolicyNumbers'
  | 'digitalServiceNames';
export type CustomerFilterOperator =
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'is_empty'
  | 'is_not_empty'
  | 'before'
  | 'after'
  | 'on'
  | 'between'
  | 'has'
  | 'not_has';
export type CustomerFilterInputType = 'text' | 'enum' | 'date' | 'tag';

export type CustomerFilterCondition = {
  id: string;
  field: CustomerFilterFieldKey;
  operator: CustomerFilterOperator;
  value: string;
  valueTo: string;
};

export type CustomerFilterDraft = {
  id?: string;
  name: string;
  logic: CustomerFilterLogic;
  conditions: CustomerFilterCondition[];
  isDefault: boolean;
};

export type CustomerSavedFilter = {
  id: string;
  name: string;
  logic: CustomerFilterLogic;
  conditions: Array<{
    field: CustomerFilterFieldKey;
    operator: CustomerFilterOperator;
    value?: string;
    valueTo?: string;
  }>;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CustomerSavedFiltersPayload = {
  items?: CustomerSavedFilter[];
  defaultFilterId?: string | null;
};

export type CustomerFilterFieldConfig = {
  value: CustomerFilterFieldKey;
  label: string;
  group: 'Thông tin khách hàng' | 'Quan hệ khách hàng';
  inputType: CustomerFilterInputType;
  operators: CustomerFilterOperator[];
  options?: string[];
};

// ── Constants ────────────────────────────────────

export const CUSTOMER_STATUS_OPTIONS: CustomerCareStatus[] = [
  'MOI_CHUA_TU_VAN',
  'DANG_SUY_NGHI',
  'DONG_Y_CHUYEN_THANH_KH',
  'KH_TU_CHOI',
  'KH_DA_MUA_BEN_KHAC',
  'NGUOI_NHA_LAM_THUE_BAO',
  'KHONG_NGHE_MAY_LAN_1',
  'KHONG_NGHE_MAY_LAN_2',
  'SAI_SO_KHONG_TON_TAI_BO_QUA_XOA',
];

export const CUSTOMER_ZALO_NICK_TYPE_OPTIONS: CustomerZaloNickType[] = [
  'CHUA_KIEM_TRA',
  'CHUA_CO_NICK_ZALO',
  'CHAN_NGUOI_LA',
  'GUI_DUOC_TIN_NHAN',
];

export const CUSTOMER_STATUS_LABELS: Record<CustomerCareStatus, string> = {
  MOI_CHUA_TU_VAN: '[Mới] Chưa tư vấn',
  DANG_SUY_NGHI: 'Đang suy nghĩ',
  DONG_Y_CHUYEN_THANH_KH: 'Đồng ý - Chuyển thành KH',
  KH_TU_CHOI: 'KH Từ chối',
  KH_DA_MUA_BEN_KHAC: 'KH đã mua bên khác',
  NGUOI_NHA_LAM_THUE_BAO: 'Người Nhà Làm/Thuê bao',
  KHONG_NGHE_MAY_LAN_1: 'Không nghe máy lần 1',
  KHONG_NGHE_MAY_LAN_2: 'Không nghe máy lần 2',
  SAI_SO_KHONG_TON_TAI_BO_QUA_XOA: 'Sai số, Không tồn tại -> BỎ QUA/Xóa',
};

export const CUSTOMER_ZALO_NICK_TYPE_LABELS: Record<CustomerZaloNickType, string> = {
  CHUA_KIEM_TRA: 'Chưa kiểm tra',
  CHUA_CO_NICK_ZALO: 'Chưa có nick Zalo',
  CHAN_NGUOI_LA: 'Chặn người lạ',
  GUI_DUOC_TIN_NHAN: 'Gửi được tin nhắn',
};

export const CUSTOMER_STATUS_BADGE: Record<CustomerCareStatus, BadgeVariant> = {
  MOI_CHUA_TU_VAN: 'warning',
  DANG_SUY_NGHI: 'info',
  DONG_Y_CHUYEN_THANH_KH: 'success',
  KH_TU_CHOI: 'danger',
  KH_DA_MUA_BEN_KHAC: 'danger',
  NGUOI_NHA_LAM_THUE_BAO: 'neutral',
  KHONG_NGHE_MAY_LAN_1: 'neutral',
  KHONG_NGHE_MAY_LAN_2: 'neutral',
  SAI_SO_KHONG_TON_TAI_BO_QUA_XOA: 'danger',
};

export const CUSTOMER_ZALO_NICK_BADGE: Record<CustomerZaloNickType, BadgeVariant> = {
  CHUA_KIEM_TRA: 'warning',
  CHUA_CO_NICK_ZALO: 'danger',
  CHAN_NGUOI_LA: 'info',
  GUI_DUOC_TIN_NHAN: 'success',
};

export const CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY = 'erp-retail.crm.customer-table-settings.v5';

export const CUSTOMER_DEFAULT_VISIBLE_COLUMN_KEYS = [
  'code',
  'fullName',
  'phone',
  'email',
  'customerStage',
  'totalSpent',
  'status',
  'zaloNickType',
  'updatedAt',
];

export const CUSTOMER_TABLE_PAGE_SIZE = 25;

export const AUTH_ENABLED = String(process.env.NEXT_PUBLIC_AUTH_ENABLED ?? 'true').trim().toLowerCase() === 'true';

export const CUSTOMER_FILTER_OPERATOR_LABELS: Record<CustomerFilterOperator, string> = {
  contains: 'Chứa',
  equals: 'Bằng',
  not_equals: 'Khác',
  is_empty: 'Để trống',
  is_not_empty: 'Không trống',
  before: 'Trước ngày',
  after: 'Sau ngày',
  on: 'Đúng ngày',
  between: 'Trong khoảng',
  has: 'Có chứa',
  not_has: 'Không chứa',
};

export const CONTRACT_PRODUCT_TYPE_OPTIONS = ['TELECOM_PACKAGE', 'AUTO_INSURANCE', 'MOTO_INSURANCE', 'DIGITAL_SERVICE'];
export const VEHICLE_KIND_OPTIONS = ['AUTO', 'MOTO'];

export const FALLBACK_FILTER_FIELD_CONFIG: CustomerFilterFieldConfig = {
  value: 'fullName',
  label: 'Tên khách hàng',
  group: 'Thông tin khách hàng',
  inputType: 'text',
  operators: ['contains'],
};
