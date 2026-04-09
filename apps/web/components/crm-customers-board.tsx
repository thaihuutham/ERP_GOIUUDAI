'use client';

import {
  Download,
  Upload,
  Plus,
  User,
  Mail,
  Phone,
  Tag,
  Calendar,
  CreditCard,
  Target,
  Globe,
  History,
  Trash2,
  Car,
  Filter,
  Save,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { readStoredAuthSession } from '../lib/auth-session';
import {
  apiRequest,
  normalizeListPayload,
  normalizeObjectPayload,
  normalizePagedListPayload,
  type ApiListSortMeta
} from '../lib/api-client';
import { formatRuntimeCurrency, formatRuntimeDateTime } from '../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../lib/bulk-actions';
import { useCursorTableState } from '../lib/use-cursor-table-state';
import { useAccessPolicy } from './access-policy-context';
import { useUserRole } from './user-role-context';
import { StandardDataTable, ColumnDefinition, type StandardTableBulkModalRenderContext } from './ui/standard-data-table';
import { SidePanel } from './ui/side-panel';
import { Modal } from './ui/modal';
import { Badge, statusToBadge, type BadgeVariant } from './ui/badge';

type CustomerCareStatus =
  | 'MOI_CHUA_TU_VAN'
  | 'DANG_SUY_NGHI'
  | 'DONG_Y_CHUYEN_THANH_KH'
  | 'KH_TU_CHOI'
  | 'KH_DA_MUA_BEN_KHAC'
  | 'NGUOI_NHA_LAM_THUE_BAO'
  | 'KHONG_NGHE_MAY_LAN_1'
  | 'KHONG_NGHE_MAY_LAN_2'
  | 'SAI_SO_KHONG_TON_TAI_BO_QUA_XOA';

type CustomerStatusFilter = 'ALL' | CustomerCareStatus;

type CustomerZaloNickType =
  | 'CHUA_KIEM_TRA'
  | 'CHUA_CO_NICK_ZALO'
  | 'CHAN_NGUOI_LA'
  | 'GUI_DUOC_TIN_NHAN';

type Customer = {
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

type ContractProductType = 'TELECOM_PACKAGE' | 'AUTO_INSURANCE' | 'MOTO_INSURANCE' | 'DIGITAL_SERVICE';

type ContractSummary = {
  totalContracts?: number;
  activeContracts?: number;
  expiredContracts?: number;
  nextExpiringAt?: string | null;
  byProduct?: Partial<Record<ContractProductType, number>>;
};

type CrmCustomerVehicle = {
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

type CrmCustomerContract = {
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

type CustomerDetailPayload = {
  customer?: Customer;
  contractSummary?: ContractSummary | null;
  recentContracts?: CrmCustomerContract[];
  vehicles?: CrmCustomerVehicle[];
};

type CustomerTaxonomyPayload = {
  customerTaxonomy?: {
    stages?: string[];
    sources?: string[];
  };
  tagRegistry?: {
    customerTags?: string[];
    interactionTags?: string[];
    interactionResultTags?: string[];
  };
};

type CreateCustomerFormState = {
  fullName: string;
  phone: string;
  email: string;
  customerStage: string;
  source: string;
  segment: string;
  tags: string[];
};

type DetailCustomerFormState = {
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

type VehicleFormState = {
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

type CustomerBulkTagMode = 'APPEND' | 'REPLACE';

type CustomerBulkFormState = {
  softSkip: boolean;
  status: '' | CustomerCareStatus;
  source: string;
  lastContactDate: string;
  tagsInput: string;
  tagMode: CustomerBulkTagMode;
};

type CustomerFilterLogic = 'AND' | 'OR';
type CustomerFilterFieldKey =
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
type CustomerFilterOperator =
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
type CustomerFilterInputType = 'text' | 'enum' | 'date' | 'tag';

type CustomerFilterCondition = {
  id: string;
  field: CustomerFilterFieldKey;
  operator: CustomerFilterOperator;
  value: string;
  valueTo: string;
};

type CustomerFilterDraft = {
  id?: string;
  name: string;
  logic: CustomerFilterLogic;
  conditions: CustomerFilterCondition[];
  isDefault: boolean;
};

type CustomerSavedFilter = {
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

type CustomerSavedFiltersPayload = {
  items?: CustomerSavedFilter[];
  defaultFilterId?: string | null;
};

type CustomerFilterFieldConfig = {
  value: CustomerFilterFieldKey;
  label: string;
  group: 'Thông tin khách hàng' | 'Quan hệ khách hàng';
  inputType: CustomerFilterInputType;
  operators: CustomerFilterOperator[];
  options?: string[];
};

const CUSTOMER_STATUS_OPTIONS: CustomerCareStatus[] = [
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
const CUSTOMER_ZALO_NICK_TYPE_OPTIONS: CustomerZaloNickType[] = [
  'CHUA_KIEM_TRA',
  'CHUA_CO_NICK_ZALO',
  'CHAN_NGUOI_LA',
  'GUI_DUOC_TIN_NHAN',
];
const CUSTOMER_STATUS_LABELS: Record<CustomerCareStatus, string> = {
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
const CUSTOMER_ZALO_NICK_TYPE_LABELS: Record<CustomerZaloNickType, string> = {
  CHUA_KIEM_TRA: 'Chưa kiểm tra',
  CHUA_CO_NICK_ZALO: 'Chưa có nick Zalo',
  CHAN_NGUOI_LA: 'Chặn người lạ',
  GUI_DUOC_TIN_NHAN: 'Gửi được tin nhắn',
};
const CUSTOMER_STATUS_BADGE: Record<CustomerCareStatus, BadgeVariant> = {
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
const CUSTOMER_ZALO_NICK_BADGE: Record<CustomerZaloNickType, BadgeVariant> = {
  CHUA_KIEM_TRA: 'warning',
  CHUA_CO_NICK_ZALO: 'danger',
  CHAN_NGUOI_LA: 'info',
  GUI_DUOC_TIN_NHAN: 'success',
};
const CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY = 'erp-retail.crm.customer-table-settings.v5';
const CUSTOMER_DEFAULT_VISIBLE_COLUMN_KEYS = [
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
const CUSTOMER_TABLE_PAGE_SIZE = 25;
const AUTH_ENABLED = String(process.env.NEXT_PUBLIC_AUTH_ENABLED ?? 'false').trim().toLowerCase() === 'true';
const CUSTOMER_FILTER_OPERATOR_LABELS: Record<CustomerFilterOperator, string> = {
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
const CONTRACT_PRODUCT_TYPE_OPTIONS = ['TELECOM_PACKAGE', 'AUTO_INSURANCE', 'MOTO_INSURANCE', 'DIGITAL_SERVICE'];
const VEHICLE_KIND_OPTIONS = ['AUTO', 'MOTO'];

function createCustomerFilterConditionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cond_${Math.random().toString(36).slice(2, 10)}`;
}

const FALLBACK_FILTER_FIELD_CONFIG: CustomerFilterFieldConfig = {
  value: 'fullName',
  label: 'Tên khách hàng',
  group: 'Thông tin khách hàng',
  inputType: 'text',
  operators: ['contains'],
};

function buildCustomerFilterFieldConfigs(
  stageOptions: string[],
  sourceOptions: string[],
  customerTagOptions: string[]
): CustomerFilterFieldConfig[] {
  return [
    {
      value: 'fullName',
      label: 'Tên khách hàng',
      group: 'Thông tin khách hàng',
      inputType: 'text',
      operators: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
    },
    {
      value: 'phone',
      label: 'Số điện thoại',
      group: 'Thông tin khách hàng',
      inputType: 'text',
      operators: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
    },
    {
      value: 'email',
      label: 'Email',
      group: 'Thông tin khách hàng',
      inputType: 'text',
      operators: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
    },
    {
      value: 'customerStage',
      label: 'Giai đoạn',
      group: 'Thông tin khách hàng',
      inputType: 'enum',
      operators: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
      options: stageOptions,
    },
    {
      value: 'source',
      label: 'Nguồn',
      group: 'Thông tin khách hàng',
      inputType: 'enum',
      operators: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
      options: sourceOptions,
    },
    {
      value: 'status',
      label: 'Trạng thái CSKH',
      group: 'Thông tin khách hàng',
      inputType: 'enum',
      operators: ['equals', 'not_equals'],
      options: CUSTOMER_STATUS_OPTIONS,
    },
    {
      value: 'zaloNickType',
      label: 'Loại nick Zalo',
      group: 'Thông tin khách hàng',
      inputType: 'enum',
      operators: ['equals', 'not_equals'],
      options: CUSTOMER_ZALO_NICK_TYPE_OPTIONS,
    },
    {
      value: 'segment',
      label: 'Phân khúc',
      group: 'Thông tin khách hàng',
      inputType: 'text',
      operators: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
    },
    {
      value: 'tags',
      label: 'Tags khách hàng',
      group: 'Thông tin khách hàng',
      inputType: 'tag',
      operators: ['has', 'not_has'],
      options: customerTagOptions,
    },
    {
      value: 'lastContactAt',
      label: 'Lần liên hệ cuối',
      group: 'Thông tin khách hàng',
      inputType: 'date',
      operators: ['before', 'after', 'on', 'between', 'is_empty', 'is_not_empty'],
    },
    {
      value: 'updatedAt',
      label: 'Ngày cập nhật',
      group: 'Thông tin khách hàng',
      inputType: 'date',
      operators: ['before', 'after', 'on', 'between'],
    },
    {
      value: 'contractPackageNames',
      label: 'Gói cước',
      group: 'Quan hệ khách hàng',
      inputType: 'text',
      operators: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
    },
    {
      value: 'contractProductTypes',
      label: 'Loại hợp đồng',
      group: 'Quan hệ khách hàng',
      inputType: 'enum',
      operators: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
      options: CONTRACT_PRODUCT_TYPE_OPTIONS,
    },
    {
      value: 'nextContractExpiryAt',
      label: 'HĐ hết hạn gần nhất',
      group: 'Quan hệ khách hàng',
      inputType: 'date',
      operators: ['before', 'after', 'on', 'between', 'is_empty', 'is_not_empty'],
    },
    {
      value: 'contractServicePhones',
      label: 'SĐT dịch vụ',
      group: 'Quan hệ khách hàng',
      inputType: 'text',
      operators: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
    },
    {
      value: 'vehicleKinds',
      label: 'Nhóm xe',
      group: 'Quan hệ khách hàng',
      inputType: 'enum',
      operators: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
      options: VEHICLE_KIND_OPTIONS,
    },
    {
      value: 'vehicleTypes',
      label: 'Loại xe',
      group: 'Quan hệ khách hàng',
      inputType: 'text',
      operators: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
    },
    {
      value: 'vehiclePlateNumbers',
      label: 'Biển số xe',
      group: 'Quan hệ khách hàng',
      inputType: 'text',
      operators: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
    },
    {
      value: 'insuranceExpiryDates',
      label: 'Ngày hết hạn bảo hiểm',
      group: 'Quan hệ khách hàng',
      inputType: 'date',
      operators: ['before', 'after', 'on', 'between', 'is_empty', 'is_not_empty'],
    },
    {
      value: 'insurancePolicyNumbers',
      label: 'Số GCN bảo hiểm',
      group: 'Quan hệ khách hàng',
      inputType: 'text',
      operators: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
    },
    {
      value: 'digitalServiceNames',
      label: 'Dịch vụ số',
      group: 'Quan hệ khách hàng',
      inputType: 'text',
      operators: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
    },
  ];
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function toCurrency(value: number | string | null | undefined) {
  return formatRuntimeCurrency(toNumber(value));
}

function toDateTime(value: string | null | undefined) {
  if (!value) return '--';
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? value : formatRuntimeDateTime(parsed.toISOString());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatTaxonomyLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function customerStatusLabel(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toUpperCase() as CustomerCareStatus;
  return CUSTOMER_STATUS_LABELS[normalized] ?? (value || '--');
}

function customerStatusBadge(value: string | null | undefined): BadgeVariant {
  const normalized = String(value ?? '').trim().toUpperCase() as CustomerCareStatus;
  return CUSTOMER_STATUS_BADGE[normalized] ?? statusToBadge(value);
}

function customerZaloNickTypeLabel(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toUpperCase() as CustomerZaloNickType;
  return CUSTOMER_ZALO_NICK_TYPE_LABELS[normalized] ?? (value || '--');
}

function customerZaloNickTypeBadge(value: string | null | undefined): BadgeVariant {
  const normalized = String(value ?? '').trim().toUpperCase() as CustomerZaloNickType;
  return CUSTOMER_ZALO_NICK_BADGE[normalized] ?? statusToBadge(value);
}

function formatContractProductLabel(productType: string | null | undefined) {
  const normalized = String(productType ?? '').trim().toUpperCase();
  switch (normalized) {
    case 'TELECOM_PACKAGE':
      return 'Gói cước viễn thông';
    case 'AUTO_INSURANCE':
      return 'Bảo hiểm ô tô';
    case 'MOTO_INSURANCE':
      return 'Bảo hiểm xe máy';
    case 'DIGITAL_SERVICE':
      return 'Dịch vụ số';
    default:
      return normalized || 'Khác';
  }
}

function formatContractProductList(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '--';
  }
  return normalized
    .split(',')
    .map((item) => formatContractProductLabel(item))
    .join(', ');
}

function formatContractReference(contract: CrmCustomerContract, vehicleMap: Map<string, CrmCustomerVehicle>) {
  const productType = String(contract.productType ?? '').toUpperCase();

  if (productType === 'TELECOM_PACKAGE') {
    const packageName = contract.telecomLine?.packageName || 'N/A';
    const servicePhone = contract.telecomLine?.servicePhone || 'N/A';
    return `${packageName} · SĐT dịch vụ: ${servicePhone}`;
  }

  if (productType === 'AUTO_INSURANCE') {
    const soGCN = contract.autoInsuranceDetail?.soGCN || 'N/A';
    const vehicle = vehicleMap.get(String(contract.autoInsuranceDetail?.vehicleId ?? ''));
    return `Số GCN: ${soGCN} · Biển số: ${vehicle?.plateNumber || 'N/A'}`;
  }

  if (productType === 'MOTO_INSURANCE') {
    const soGCN = contract.motoInsuranceDetail?.soGCN || 'N/A';
    const vehicle = vehicleMap.get(String(contract.motoInsuranceDetail?.vehicleId ?? ''));
    return `Số GCN: ${soGCN} · Biển số: ${vehicle?.plateNumber || 'N/A'}`;
  }

  if (productType === 'DIGITAL_SERVICE') {
    const serviceName = contract.digitalServiceDetail?.serviceName || 'N/A';
    const planName = contract.digitalServiceDetail?.planName || 'N/A';
    return `${serviceName} · Gói: ${planName}`;
  }

  return contract.sourceRef || 'N/A';
}

function buildAuditObjectHref(entityType: string, entityId: string) {
  const params = new URLSearchParams({
    entityType,
    entityId
  });
  return `/modules/audit?${params.toString()}`;
}

function buildDetailForm(customer: Customer | null): DetailCustomerFormState {
  const tags = Array.isArray(customer?.tags)
    ? Array.from(new Set(customer!.tags!.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean)))
    : [];
  const normalizedStatus = String(customer?.status ?? '').trim().toUpperCase() as CustomerCareStatus;
  const normalizedZaloNickType = String(customer?.zaloNickType ?? '').trim().toUpperCase() as CustomerZaloNickType;
  return {
    fullName: customer?.fullName ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    customerStage: customer?.customerStage ?? '',
    source: customer?.source ?? '',
    segment: customer?.segment ?? '',
    status: CUSTOMER_STATUS_OPTIONS.includes(normalizedStatus)
      ? normalizedStatus
      : 'MOI_CHUA_TU_VAN',
    zaloNickType: CUSTOMER_ZALO_NICK_TYPE_OPTIONS.includes(normalizedZaloNickType)
      ? normalizedZaloNickType
      : 'CHUA_KIEM_TRA',
    tags
  };
}

function normalizeVehicleKind(input: unknown): 'AUTO' | 'MOTO' {
  const normalized = String(input ?? '').trim().toUpperCase();
  return normalized === 'MOTO' ? 'MOTO' : 'AUTO';
}

function buildVehicleFormState(
  vehicle: CrmCustomerVehicle | null,
  fallbackOwnerFullName?: string | null
): VehicleFormState {
  return {
    ownerFullName: vehicle?.ownerFullName ?? fallbackOwnerFullName ?? '',
    ownerAddress: vehicle?.ownerAddress ?? '',
    plateNumber: vehicle?.plateNumber ?? '',
    chassisNumber: vehicle?.chassisNumber ?? '',
    engineNumber: vehicle?.engineNumber ?? '',
    vehicleKind: normalizeVehicleKind(vehicle?.vehicleKind),
    vehicleType: vehicle?.vehicleType ?? '',
    seatCount: vehicle?.seatCount !== null && vehicle?.seatCount !== undefined ? String(vehicle.seatCount) : '',
    loadKg: vehicle?.loadKg !== null && vehicle?.loadKg !== undefined ? String(vehicle.loadKg) : '',
    status: (() => {
      const normalized = String(vehicle?.status ?? '').trim().toUpperCase();
      if (normalized === 'INACTIVE') return 'INACTIVE';
      if (normalized === 'DRAFT') return 'DRAFT';
      return 'ACTIVE';
    })()
  };
}

function resolveCurrentActorIdentity(role: string) {
  const roleUpper = String(role ?? '').trim().toUpperCase();
  const normalizedRole = roleUpper === 'ADMIN' ? 'ADMIN' : 'USER';
  if (!AUTH_ENABLED) {
    return {
      role: normalizedRole,
      userId: `dev_${normalizedRole.toLowerCase()}`,
      isAdmin: normalizedRole === 'ADMIN'
    };
  }

  const session = readStoredAuthSession();
  const userId = String(session?.user?.id ?? '').trim();
  return {
    role: normalizedRole,
    userId,
    isAdmin: normalizedRole === 'ADMIN'
  };
}

function readSelectedTags(event: ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.target.selectedOptions)
    .map((option) => option.value.trim().toLowerCase())
    .filter(Boolean);
}

function readBulkTags(input: string) {
  return Array.from(
    new Set(
      String(input ?? '')
        .split(/[;,]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
      )
  );
}

function createDefaultFilterCondition(
  fieldConfigs: CustomerFilterFieldConfig[],
  field: CustomerFilterFieldKey = 'fullName'
): CustomerFilterCondition {
  const fieldConfig = fieldConfigs.find((item) => item.value === field) ?? fieldConfigs[0] ?? FALLBACK_FILTER_FIELD_CONFIG;
  return {
    id: createCustomerFilterConditionId(),
    field: fieldConfig.value,
    operator: fieldConfig.operators[0] ?? 'contains',
    value: '',
    valueTo: '',
  };
}

function toCustomerFilterDraft(filter: CustomerSavedFilter, fieldConfigs: CustomerFilterFieldConfig[]): CustomerFilterDraft {
  return {
    id: filter.id,
    name: filter.name,
    logic: filter.logic === 'OR' ? 'OR' : 'AND',
    isDefault: Boolean(filter.isDefault),
    conditions: (filter.conditions ?? []).map((condition) => {
      const fallback = createDefaultFilterCondition(fieldConfigs);
      const field = condition.field ?? fallback.field;
      const fieldConfig = fieldConfigs.find((item) => item.value === field) ?? fieldConfigs[0] ?? FALLBACK_FILTER_FIELD_CONFIG;
      const operator = fieldConfig.operators.includes(condition.operator ?? fallback.operator)
        ? (condition.operator as CustomerFilterOperator)
        : fieldConfig.operators[0];
      return {
        id: createCustomerFilterConditionId(),
        field: fieldConfig.value,
        operator,
        value: String(condition.value ?? ''),
        valueTo: String(condition.valueTo ?? ''),
      };
    }),
  };
}

function toCustomerFilterQueryPayload(draft: CustomerFilterDraft | null) {
  if (!draft || !Array.isArray(draft.conditions) || draft.conditions.length === 0) {
    return null;
  }

  const conditions = draft.conditions
    .map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value: condition.value.trim() || undefined,
      valueTo: condition.valueTo.trim() || undefined,
    }))
    .filter((condition) => condition.field && condition.operator);

  if (conditions.length === 0) {
    return null;
  }

  return {
    logic: draft.logic === 'OR' ? 'OR' : 'AND',
    conditions,
  };
}

export function CrmCustomersBoard() {
  const { canModule, canAction } = useAccessPolicy();
  const { role } = useUserRole();
  const canView = canModule('crm');
  const canCreate = canAction('crm', 'CREATE');
  const canUpdate = canAction('crm', 'UPDATE');
  const canDelete = canAction('crm', 'DELETE');
  const actorIdentity = useMemo(() => resolveCurrentActorIdentity(role), [role]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stageOptions, setStageOptions] = useState<string[]>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [customerTagOptions, setCustomerTagOptions] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatusFilter>('ALL');
  const [tableSortBy, setTableSortBy] = useState('updatedAt');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');
  const [tableSortMeta, setTableSortMeta] = useState<ApiListSortMeta | null>(null);
  const [initialCustomerId, setInitialCustomerId] = useState('');
  const [hasAppliedInitialCustomerId, setHasAppliedInitialCustomerId] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetailPayload | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<BulkRowId[]>([]);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [isSavingDetail, setIsSavingDetail] = useState(false);
  const [isSoftSkippingCustomer, setIsSoftSkippingCustomer] = useState(false);
  const [detailForm, setDetailForm] = useState<DetailCustomerFormState>(buildDetailForm(null));
  const [isVehicleEditorOpen, setIsVehicleEditorOpen] = useState(false);
  const [vehicleEditorMode, setVehicleEditorMode] = useState<'create' | 'edit'>('create');
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState<VehicleFormState>(buildVehicleFormState(null));
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);
  const [archivingVehicleId, setArchivingVehicleId] = useState<string | null>(null);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isApplyingCustomerBulk, setIsApplyingCustomerBulk] = useState(false);
  const [customerBulkForm, setCustomerBulkForm] = useState<CustomerBulkFormState>({
    softSkip: false,
    status: '',
    source: '',
    lastContactDate: '',
    tagsInput: '',
    tagMode: 'APPEND',
  });
  const [customerBulkError, setCustomerBulkError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateCustomerFormState>({
    fullName: '',
    phone: '',
    email: '',
    customerStage: '',
    source: '',
    segment: '',
    tags: []
  });
  const customerFilterFieldConfigs = useMemo(
    () => buildCustomerFilterFieldConfigs(stageOptions, sourceOptions, customerTagOptions),
    [customerTagOptions, sourceOptions, stageOptions]
  );
  const [savedCustomerFilters, setSavedCustomerFilters] = useState<CustomerSavedFilter[]>([]);
  const [defaultCustomerFilterId, setDefaultCustomerFilterId] = useState<string | null>(null);
  const [selectedSavedFilterId, setSelectedSavedFilterId] = useState('');
  const [appliedSavedFilterId, setAppliedSavedFilterId] = useState('');
  const [appliedCustomFilter, setAppliedCustomFilter] = useState<CustomerFilterDraft | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isLoadingCustomerFilters, setIsLoadingCustomerFilters] = useState(false);
  const [isSavingCustomerFilter, setIsSavingCustomerFilter] = useState(false);
  const [filterMessage, setFilterMessage] = useState<string | null>(null);
  const [filterErrorMessage, setFilterErrorMessage] = useState<string | null>(null);
  const [customerFilterDraft, setCustomerFilterDraft] = useState<CustomerFilterDraft>({
    name: '',
    logic: 'AND',
    isDefault: false,
    conditions: [createDefaultFilterCondition(customerFilterFieldConfigs)],
  });
  const [hasInitializedDefaultFilter, setHasInitializedDefaultFilter] = useState(false);
  const appliedSavedFilter = useMemo(
    () => savedCustomerFilters.find((item) => item.id === appliedSavedFilterId) ?? null,
    [appliedSavedFilterId, savedCustomerFilters]
  );
  const normalizedAppliedFilterDraft = useMemo(() => {
    if (appliedSavedFilter) {
      return toCustomerFilterDraft(appliedSavedFilter, customerFilterFieldConfigs);
    }
    if (appliedCustomFilter) {
      return {
        ...appliedCustomFilter,
        conditions: appliedCustomFilter.conditions.map((condition) => ({ ...condition })),
      };
    }
    return null;
  }, [appliedCustomFilter, appliedSavedFilter, customerFilterFieldConfigs]);
  const activeCustomerFilterPayload = useMemo(
    () => toCustomerFilterQueryPayload(normalizedAppliedFilterDraft),
    [normalizedAppliedFilterDraft]
  );
  const activeCustomerFilterFingerprint = useMemo(
    () => (activeCustomerFilterPayload ? JSON.stringify(activeCustomerFilterPayload) : ''),
    [activeCustomerFilterPayload]
  );
  const customerTableFingerprint = useMemo(
    () =>
      JSON.stringify({
        q: search.trim(),
        status,
        sortBy: tableSortBy,
        sortDir: tableSortDir,
        limit: CUSTOMER_TABLE_PAGE_SIZE,
        filter: activeCustomerFilterFingerprint
      }),
    [activeCustomerFilterFingerprint, search, status, tableSortBy, tableSortDir]
  );
  const customerTablePager = useCursorTableState(customerTableFingerprint);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    setSearch(searchParams.get('q') ?? '');
    setInitialCustomerId(String(searchParams.get('customerId') ?? '').trim());
  }, []);

  useEffect(() => {
    loadTaxonomy();
  }, [canView]);

  useEffect(() => {
    void loadCustomerSavedFilters();
  }, [canView]);

  useEffect(() => {
    setCustomerFilterDraft((prev) => {
      const nextConditions = prev.conditions
        .map((condition) => {
          const fieldConfig = customerFilterFieldConfigs.find((item) => item.value === condition.field);
          if (!fieldConfig) {
            return createDefaultFilterCondition(customerFilterFieldConfigs);
          }
          const nextOperator = fieldConfig.operators.includes(condition.operator)
            ? condition.operator
            : fieldConfig.operators[0];
          return {
            ...condition,
            operator: nextOperator,
          };
        });
      return {
        ...prev,
        conditions: nextConditions.length > 0
          ? nextConditions
          : [createDefaultFilterCondition(customerFilterFieldConfigs)],
      };
    });
  }, [customerFilterFieldConfigs]);

  useEffect(() => {
    setIsDetailEditing(false);
    setDetailForm(buildDetailForm(selectedCustomer));
    setIsVehicleEditorOpen(false);
    setVehicleEditorMode('create');
    setEditingVehicleId(null);
    setVehicleForm(buildVehicleFormState(null, selectedCustomer?.fullName ?? null));
  }, [selectedCustomer]);

  useEffect(() => {
    if (isDetailEditing) {
      return;
    }
    if (customerDetail?.customer) {
      setDetailForm(buildDetailForm(customerDetail.customer));
    }
  }, [customerDetail, isDetailEditing]);

  const loadCustomers = async () => {
    if (!canView) return;
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>('/crm/customers', {
        query: {
          q: search,
          status: status !== 'ALL' ? status : undefined,
          limit: CUSTOMER_TABLE_PAGE_SIZE,
          cursor: customerTablePager.cursor ?? undefined,
          sortBy: tableSortBy,
          sortDir: tableSortDir,
          customFilter: activeCustomerFilterPayload ? JSON.stringify(activeCustomerFilterPayload) : undefined,
        }
      });
      const normalizedCustomers = normalizePagedListPayload<Customer>(payload);
      setCustomers(normalizedCustomers.items);
      customerTablePager.syncFromPageInfo(normalizedCustomers.pageInfo);
      setTableSortMeta(normalizedCustomers.sortMeta);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTaxonomy = async () => {
    if (!canView) return;
    try {
      const payload = await apiRequest<CustomerTaxonomyPayload>('/crm/taxonomy');
      const stages = payload.customerTaxonomy?.stages?.filter(Boolean) ?? [];
      const sources = payload.customerTaxonomy?.sources?.filter(Boolean) ?? [];
      const customerTags = payload.tagRegistry?.customerTags?.filter(Boolean) ?? [];
      const nextStages = stages;
      const nextSources = sources;
      const nextCustomerTags = customerTags;
      setStageOptions(nextStages);
      setSourceOptions(nextSources);
      setCustomerTagOptions(nextCustomerTags);
      setCreateForm((prev) => ({
        ...prev,
        customerStage: nextStages.includes(prev.customerStage) ? prev.customerStage : (nextStages[0] || ''),
        source: nextSources.includes(prev.source) ? prev.source : (nextSources[0] || ''),
        tags: prev.tags.filter((tag) => nextCustomerTags.includes(tag))
      }));
      setDetailForm((prev) => ({
        ...prev,
        tags: prev.tags.filter((tag) => nextCustomerTags.includes(tag))
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi tải taxonomy CRM');
      setStageOptions([]);
      setSourceOptions([]);
      setCustomerTagOptions([]);
    }
  };

  const normalizeSavedFiltersPayload = (
    payload: CustomerSavedFiltersPayload
  ): { items: CustomerSavedFilter[]; defaultFilterId: string | null } => {
    const list = Array.isArray(payload.items) ? payload.items : [];
    const normalized: CustomerSavedFilter[] = list
      .map((item): CustomerSavedFilter => {
        const logic: CustomerFilterLogic = item.logic === 'OR' ? 'OR' : 'AND';
        return {
          id: String(item.id ?? '').trim(),
          name: String(item.name ?? '').trim(),
          logic,
          conditions: Array.isArray(item.conditions) ? item.conditions : [],
          isDefault: Boolean(item.isDefault),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
      })
      .filter((item) => item.id.length > 0 && item.name.length > 0);
    const defaultId = String(payload.defaultFilterId ?? '').trim() || null;
    return {
      items: normalized,
      defaultFilterId: normalized.some((item) => item.id === defaultId) ? defaultId : null,
    };
  };

  const loadCustomerSavedFilters = async () => {
    if (!canView) return;
    setIsLoadingCustomerFilters(true);
    try {
      const payload = await apiRequest<CustomerSavedFiltersPayload>('/crm/customers/filters');
      const normalized = normalizeSavedFiltersPayload(payload);
      setSavedCustomerFilters(normalized.items);
      setDefaultCustomerFilterId(normalized.defaultFilterId);
      if (!hasInitializedDefaultFilter) {
        if (normalized.defaultFilterId) {
          setSelectedSavedFilterId(normalized.defaultFilterId);
          setAppliedSavedFilterId(normalized.defaultFilterId);
          setAppliedCustomFilter(null);
          const defaultFilter = normalized.items.find((item) => item.id === normalized.defaultFilterId);
          if (defaultFilter) {
            setCustomerFilterDraft(toCustomerFilterDraft(defaultFilter, customerFilterFieldConfigs));
          }
        }
        setHasInitializedDefaultFilter(true);
      }
      setFilterErrorMessage(null);
    } catch (error) {
      setFilterErrorMessage(error instanceof Error ? error.message : 'Lỗi tải bộ lọc khách hàng');
    } finally {
      setIsLoadingCustomerFilters(false);
    }
  };

  const validateFilterDraft = (draft: CustomerFilterDraft) => {
    if (!Array.isArray(draft.conditions) || draft.conditions.length === 0) {
      return 'Vui lòng thêm ít nhất 1 điều kiện.';
    }
    for (const [index, condition] of draft.conditions.entries()) {
      const fieldConfig = customerFilterFieldConfigs.find((item) => item.value === condition.field);
      if (!fieldConfig) {
        return `Điều kiện #${index + 1} có field không hợp lệ.`;
      }
      if (!fieldConfig.operators.includes(condition.operator)) {
        return `Điều kiện #${index + 1} có toán tử không hợp lệ.`;
      }
      if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
        continue;
      }
      if (!condition.value.trim()) {
        return `Điều kiện #${index + 1} đang thiếu giá trị.`;
      }
      if (condition.operator === 'between' && !condition.valueTo.trim()) {
        return `Điều kiện #${index + 1} cần thêm giá trị cuối khoảng ngày.`;
      }
    }
    return null;
  };

  const resetFilterDraft = () => {
    setCustomerFilterDraft({
      name: '',
      logic: 'AND',
      isDefault: false,
      conditions: [createDefaultFilterCondition(customerFilterFieldConfigs)],
    });
  };

  const openFilterModal = () => {
    if (!isFilterModalOpen) {
      const pickedSavedFilter = savedCustomerFilters.find((item) => item.id === selectedSavedFilterId)
        ?? savedCustomerFilters.find((item) => item.id === appliedSavedFilterId)
        ?? null;
      if (pickedSavedFilter) {
        setCustomerFilterDraft(toCustomerFilterDraft(pickedSavedFilter, customerFilterFieldConfigs));
      } else if (appliedCustomFilter) {
        setCustomerFilterDraft({
          ...appliedCustomFilter,
          conditions: appliedCustomFilter.conditions.map((condition) => ({ ...condition })),
        });
      } else {
        resetFilterDraft();
      }
    }
    setFilterMessage(null);
    setFilterErrorMessage(null);
    setIsFilterModalOpen(true);
  };

  const applyCurrentFilterDraft = () => {
    const validationError = validateFilterDraft(customerFilterDraft);
    if (validationError) {
      setFilterErrorMessage(validationError);
      return;
    }
    setAppliedSavedFilterId('');
    setAppliedCustomFilter({
      ...customerFilterDraft,
      id: undefined,
      isDefault: false,
      conditions: customerFilterDraft.conditions.map((condition) => ({ ...condition })),
    });
    setFilterMessage('Đã áp dụng bộ lọc tạm thời.');
    setErrorMessage(null);
    setIsFilterModalOpen(false);
  };

  const applySelectedSavedFilter = () => {
    if (!selectedSavedFilterId) {
      setFilterErrorMessage('Vui lòng chọn bộ lọc đã lưu để áp dụng.');
      return;
    }
    setAppliedSavedFilterId(selectedSavedFilterId);
    setAppliedCustomFilter(null);
    setFilterMessage('Đã áp dụng bộ lọc đã lưu.');
    setErrorMessage(null);
    setIsFilterModalOpen(false);
  };

  const clearAppliedCustomerFilter = () => {
    setAppliedSavedFilterId('');
    setAppliedCustomFilter(null);
    setSelectedSavedFilterId('');
    setFilterMessage('Đã xóa bộ lọc đang áp dụng.');
    setErrorMessage(null);
  };

  const saveCustomerFilterDraft = async () => {
    const validationError = validateFilterDraft(customerFilterDraft);
    if (validationError) {
      setFilterErrorMessage(validationError);
      return;
    }
    if (!customerFilterDraft.name.trim()) {
      setFilterErrorMessage('Vui lòng nhập tên bộ lọc trước khi lưu.');
      return;
    }
    setIsSavingCustomerFilter(true);
    try {
      const payload = await apiRequest<CustomerSavedFiltersPayload & { item?: CustomerSavedFilter }>('/crm/customers/filters', {
        method: 'POST',
        body: {
          id: customerFilterDraft.id,
          name: customerFilterDraft.name.trim(),
          logic: customerFilterDraft.logic,
          isDefault: customerFilterDraft.isDefault,
          conditions: customerFilterDraft.conditions.map((condition) => ({
            field: condition.field,
            operator: condition.operator,
            value: condition.value.trim() || undefined,
            valueTo: condition.valueTo.trim() || undefined,
          })),
        },
      });
      const normalized = normalizeSavedFiltersPayload(payload);
      setSavedCustomerFilters(normalized.items);
      setDefaultCustomerFilterId(normalized.defaultFilterId);
      const savedItem = payload.item && payload.item.id
        ? normalized.items.find((item) => item.id === payload.item?.id) ?? null
        : null;
      const nextSelectedId = savedItem?.id
        ?? normalized.defaultFilterId
        ?? customerFilterDraft.id
        ?? '';
      setSelectedSavedFilterId(nextSelectedId);
      if (nextSelectedId) {
        setAppliedSavedFilterId(nextSelectedId);
        setAppliedCustomFilter(null);
      }
      if (savedItem) {
        setCustomerFilterDraft(toCustomerFilterDraft(savedItem, customerFilterFieldConfigs));
      }
      setFilterErrorMessage(null);
      setFilterMessage('Đã lưu bộ lọc CRM.');
      setIsFilterModalOpen(false);
    } catch (error) {
      setFilterErrorMessage(error instanceof Error ? error.message : 'Không thể lưu bộ lọc CRM.');
    } finally {
      setIsSavingCustomerFilter(false);
    }
  };

  const deleteSelectedSavedFilter = async () => {
    if (!selectedSavedFilterId) {
      setFilterErrorMessage('Vui lòng chọn bộ lọc đã lưu để xóa.');
      return;
    }
    const selected = savedCustomerFilters.find((item) => item.id === selectedSavedFilterId);
    if (!selected) {
      setFilterErrorMessage('Không tìm thấy bộ lọc đã chọn.');
      return;
    }
    if (!window.confirm(`Xóa bộ lọc "${selected.name}"?`)) {
      return;
    }

    setIsSavingCustomerFilter(true);
    try {
      const payload = await apiRequest<CustomerSavedFiltersPayload>(`/crm/customers/filters/${selectedSavedFilterId}`, {
        method: 'DELETE',
      });
      const normalized = normalizeSavedFiltersPayload(payload);
      setSavedCustomerFilters(normalized.items);
      setDefaultCustomerFilterId(normalized.defaultFilterId);
      if (appliedSavedFilterId === selectedSavedFilterId) {
        setAppliedSavedFilterId('');
      }
      setSelectedSavedFilterId('');
      setFilterMessage('Đã xóa bộ lọc CRM.');
      setFilterErrorMessage(null);
      resetFilterDraft();
    } catch (error) {
      setFilterErrorMessage(error instanceof Error ? error.message : 'Không thể xóa bộ lọc CRM.');
    } finally {
      setIsSavingCustomerFilter(false);
    }
  };

  const loadCustomerDetail = async (customerId: string) => {
    const id = String(customerId || '').trim();
    if (!id) {
      setCustomerDetail(null);
      return;
    }

    setIsDetailLoading(true);
    try {
      const payload = await apiRequest<CustomerDetailPayload>(`/crm/customers/${id}`);
      const normalizedCustomer = normalizeObjectPayload(payload.customer);

      setCustomerDetail({
        customer: normalizedCustomer ? (normalizedCustomer as Customer) : undefined,
        contractSummary: isRecord(payload.contractSummary) ? (payload.contractSummary as ContractSummary) : null,
        recentContracts: Array.isArray(payload.recentContracts) ? (payload.recentContracts as CrmCustomerContract[]) : [],
        vehicles: Array.isArray(payload.vehicles) ? (payload.vehicles as CrmCustomerVehicle[]) : []
      });
      setErrorMessage(null);
    } catch (error) {
      setCustomerDetail(null);
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi tải chi tiết khách hàng');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const resetCreateForm = () => {
    setCreateForm({
      fullName: '',
      phone: '',
      email: '',
      customerStage: stageOptions[0] ?? '',
      source: sourceOptions[0] ?? '',
      segment: '',
      tags: []
    });
  };

  const handleCreateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate) return;
    setIsCreating(true);
    try {
      await apiRequest('/crm/customers', {
        method: 'POST',
        body: {
          fullName: createForm.fullName,
          phone: createForm.phone || undefined,
          email: createForm.email || undefined,
          customerStage: createForm.customerStage || undefined,
          source: createForm.source || undefined,
          segment: createForm.segment || undefined,
          tags: createForm.tags
        }
      });
      setResultMessage('Đã tạo khách hàng thành công.');
      setErrorMessage(null);
      setIsCreatePanelOpen(false);
      resetCreateForm();
      await loadCustomers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi tạo khách hàng');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveCustomer = async (id: string | number, values: Partial<Customer>) => {
    if (!canUpdate) return;
    try {
      await apiRequest(`/crm/customers/${id}`, {
        method: 'PATCH',
        body: values
      });
      setResultMessage(`Cập nhật khách hàng #${id} thành công.`);
      loadCustomers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi lưu dữ liệu');
      throw error;
    }
  };

  const handleSaveDetailProfile = async () => {
    if (!selectedCustomer || !canUpdate) return;
    setIsSavingDetail(true);
    try {
      await apiRequest(`/crm/customers/${selectedCustomer.id}`, {
        method: 'PATCH',
        body: {
          fullName: detailForm.fullName || undefined,
          phone: detailForm.phone || undefined,
          email: detailForm.email || undefined,
          customerStage: detailForm.customerStage || undefined,
          source: detailForm.source || undefined,
          segment: detailForm.segment || undefined,
          status: detailForm.status || undefined,
          zaloNickType: detailForm.zaloNickType || undefined,
          tags: detailForm.tags
        }
      });
      setResultMessage(`Cập nhật hồ sơ ${detailForm.fullName || selectedCustomer.id} thành công.`);
      setErrorMessage(null);
      setIsDetailEditing(false);
      setSelectedCustomer((prev) => (
        prev
          ? {
              ...prev,
              fullName: detailForm.fullName || prev.fullName,
              phone: detailForm.phone || null,
              email: detailForm.email || null,
              customerStage: detailForm.customerStage || null,
              source: detailForm.source || null,
              segment: detailForm.segment || null,
              status: detailForm.status || null,
              zaloNickType: detailForm.zaloNickType || null,
              tags: detailForm.tags
            }
          : prev
      ));
      await Promise.all([loadCustomers(), loadCustomerDetail(selectedCustomer.id)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi cập nhật hồ sơ khách hàng');
    } finally {
      setIsSavingDetail(false);
    }
  };

  const handleSoftSkipCustomer = async () => {
    if (!selectedCustomer || !canDelete || isSoftSkippingCustomer) return;
    if (!window.confirm(`Đánh dấu "BỎ QUA/Xóa" cho khách hàng ${selectedCustomer.fullName || selectedCustomer.id}?`)) {
      return;
    }

    setIsSoftSkippingCustomer(true);
    try {
      await apiRequest(`/crm/customers/${selectedCustomer.id}`, {
        method: 'DELETE'
      });
      setResultMessage(`Đã chuyển khách hàng ${selectedCustomer.fullName || selectedCustomer.id} sang trạng thái BỎ QUA/Xóa.`);
      setErrorMessage(null);
      setSelectedCustomer(null);
      setCustomerDetail(null);
      setIsDetailEditing(false);
      setDetailForm(buildDetailForm(null));
      await loadCustomers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi cập nhật trạng thái BỎ QUA/Xóa');
    } finally {
      setIsSoftSkippingCustomer(false);
    }
  };

  const openCreateVehicleEditor = () => {
    if (!selectedCustomer || !canManageSelectedCustomerVehicles) {
      return;
    }
    setVehicleEditorMode('create');
    setEditingVehicleId(null);
    setVehicleForm(buildVehicleFormState(null, detailCustomer?.fullName ?? selectedCustomer.fullName ?? null));
    setIsVehicleEditorOpen(true);
  };

  const openEditVehicleEditor = (vehicle: CrmCustomerVehicle) => {
    if (!canManageSelectedCustomerVehicles) {
      return;
    }
    setVehicleEditorMode('edit');
    setEditingVehicleId(vehicle.id);
    setVehicleForm(buildVehicleFormState(vehicle, detailCustomer?.fullName ?? selectedCustomer?.fullName ?? null));
    setIsVehicleEditorOpen(true);
  };

  const handleSaveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCustomer || !canManageSelectedCustomerVehicles) {
      return;
    }
    setIsSavingVehicle(true);
    try {
      const payload = {
        ownerCustomerId: selectedCustomer.id,
        ownerFullName: vehicleForm.ownerFullName,
        ownerAddress: vehicleForm.ownerAddress || undefined,
        plateNumber: vehicleForm.plateNumber,
        chassisNumber: vehicleForm.chassisNumber,
        engineNumber: vehicleForm.engineNumber,
        vehicleKind: vehicleForm.vehicleKind,
        vehicleType: vehicleForm.vehicleType,
        seatCount: vehicleForm.seatCount === '' ? undefined : Number(vehicleForm.seatCount),
        loadKg: vehicleForm.loadKg === '' ? undefined : Number(vehicleForm.loadKg),
        status: vehicleForm.status
      };

      if (vehicleEditorMode === 'edit' && editingVehicleId) {
        await apiRequest(`/crm/vehicles/${editingVehicleId}`, {
          method: 'PATCH',
          body: payload
        });
        setResultMessage(`Đã cập nhật xe ${vehicleForm.plateNumber}.`);
      } else {
        await apiRequest('/crm/vehicles', {
          method: 'POST',
          body: payload
        });
        setResultMessage(`Đã thêm xe ${vehicleForm.plateNumber}.`);
      }

      setErrorMessage(null);
      setIsVehicleEditorOpen(false);
      setEditingVehicleId(null);
      setVehicleEditorMode('create');
      setVehicleForm(buildVehicleFormState(null, detailCustomer?.fullName ?? selectedCustomer.fullName ?? null));
      await loadCustomerDetail(selectedCustomer.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi lưu thông tin xe');
    } finally {
      setIsSavingVehicle(false);
    }
  };

  const handleArchiveVehicle = async (vehicle: CrmCustomerVehicle) => {
    if (!canArchiveSelectedCustomerVehicles) {
      return;
    }
    if (!window.confirm(`Lưu trữ xe ${vehicle.plateNumber || vehicle.id}?`)) {
      return;
    }

    setArchivingVehicleId(vehicle.id);
    try {
      await apiRequest(`/crm/vehicles/${vehicle.id}`, {
        method: 'DELETE'
      });
      setResultMessage(`Đã lưu trữ xe ${vehicle.plateNumber || vehicle.id}.`);
      setErrorMessage(null);
      if (editingVehicleId === vehicle.id) {
        setIsVehicleEditorOpen(false);
        setEditingVehicleId(null);
        setVehicleEditorMode('create');
      }
      if (selectedCustomer) {
        await loadCustomerDetail(selectedCustomer.id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi lưu trữ xe');
    } finally {
      setArchivingVehicleId(null);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadCustomers, 300);
    return () => clearTimeout(timer);
  }, [
    activeCustomerFilterFingerprint,
    canView,
    customerTablePager.currentPage,
    search,
    status,
    tableSortBy,
    tableSortDir
  ]);

  useEffect(() => {
    if (!initialCustomerId || hasAppliedInitialCustomerId) {
      return;
    }

    const matchedRow = customers.find((item) => item.id === initialCustomerId);
    if (matchedRow) {
      setSelectedCustomer(matchedRow);
      setHasAppliedInitialCustomerId(true);
      return;
    }

    let cancelled = false;
    const loadCustomerDirectly = async () => {
      try {
        const payload = await apiRequest<CustomerDetailPayload>(`/crm/customers/${initialCustomerId}`);
        if (cancelled) {
          return;
        }
        const normalizedCustomer = normalizeObjectPayload(payload.customer) as Customer | null;
        if (normalizedCustomer) {
          setSelectedCustomer(normalizedCustomer);
        }
      } catch {
        // ignore invalid customerId in URL to avoid breaking normal page flow
      } finally {
        if (!cancelled) {
          setHasAppliedInitialCustomerId(true);
        }
      }
    };

    void loadCustomerDirectly();
    return () => {
      cancelled = true;
    };
  }, [customers, hasAppliedInitialCustomerId, initialCustomerId]);

  useEffect(() => {
    if (!selectedCustomer?.id) {
      setCustomerDetail(null);
      setIsDetailLoading(false);
      return;
    }
    void loadCustomerDetail(selectedCustomer.id);
  }, [selectedCustomer?.id]);

  const customerStageColumnOptions = useMemo(
    () =>
      stageOptions.map((stage) => ({
        label: formatTaxonomyLabel(stage),
        value: stage
      })),
    [stageOptions]
  );

  const detailCustomer = customerDetail?.customer ?? selectedCustomer;
  const detailStageOptions = useMemo(() => {
    const current = String(detailForm.customerStage ?? '').trim();
    if (current && !stageOptions.includes(current)) {
      return [current, ...stageOptions];
    }
    return stageOptions;
  }, [detailForm.customerStage, stageOptions]);
  const detailSourceOptions = useMemo(() => {
    const current = String(detailForm.source ?? '').trim();
    if (current && !sourceOptions.includes(current)) {
      return [current, ...sourceOptions];
    }
    return sourceOptions;
  }, [detailForm.source, sourceOptions]);
  const contractSummary = customerDetail?.contractSummary ?? null;
  const recentContracts = customerDetail?.recentContracts ?? [];
  const customerVehicles = customerDetail?.vehicles ?? [];
  const selectedOwnerStaffId = String(detailCustomer?.ownerStaffId ?? '').trim();
  const canManageSelectedCustomerVehicles = canUpdate && (
    actorIdentity.isAdmin
      || (Boolean(actorIdentity.userId) && Boolean(selectedOwnerStaffId) && actorIdentity.userId === selectedOwnerStaffId)
  );
  const canArchiveSelectedCustomerVehicles = canDelete && (
    actorIdentity.isAdmin
      || (Boolean(actorIdentity.userId) && Boolean(selectedOwnerStaffId) && actorIdentity.userId === selectedOwnerStaffId)
  );
  const vehicleMap = useMemo(
    () => new Map(customerVehicles.map((item) => [item.id, item] as const)),
    [customerVehicles]
  );

  const customerTagSelectOptions = useMemo(() => {
    const selectedTags =
      detailCustomer?.tags?.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean) ?? [];
    return Array.from(new Set([...customerTagOptions, ...selectedTags]));
  }, [customerTagOptions, detailCustomer]);
  const appliedFilterLabel = appliedSavedFilter
    ? appliedSavedFilter.name
    : normalizedAppliedFilterDraft
      ? 'Bộ lọc tạm'
      : null;
  const appliedFilterConditionCount = normalizedAppliedFilterDraft?.conditions.length ?? 0;

  const columns: ColumnDefinition<Customer>[] = [
    { key: 'code', label: 'Mã KH', group: 'Thông tin khách hàng' },
    { 
      key: 'fullName', 
      label: 'Khách hàng', 
      group: 'Thông tin khách hàng',
      isLink: true,
      type: 'text'
    },
    { key: 'phone', label: 'Điện thoại', group: 'Thông tin khách hàng', type: 'text' },
    { key: 'email', label: 'Email', group: 'Thông tin khách hàng', type: 'text' },
    { 
      key: 'customerStage', 
      label: 'Giai đoạn',
      group: 'Thông tin khách hàng',
      type: 'select',
      options: customerStageColumnOptions
    },
    { 
      key: 'totalSpent', 
      label: 'Chi tiêu',
      group: 'Thông tin khách hàng',
      render: (c) => toCurrency(c.totalSpent)
    },
    { 
      key: 'status', 
      label: 'Trạng thái',
      group: 'Thông tin khách hàng',
      type: 'select',
      options: CUSTOMER_STATUS_OPTIONS.map((value) => ({
        label: CUSTOMER_STATUS_LABELS[value],
        value,
      })),
      render: (c) => <Badge variant={customerStatusBadge(c.status)}>{customerStatusLabel(c.status)}</Badge>
    },
    {
      key: 'zaloNickType',
      label: 'Loại nick Zalo',
      group: 'Thông tin khách hàng',
      type: 'select',
      options: CUSTOMER_ZALO_NICK_TYPE_OPTIONS.map((value) => ({
        label: CUSTOMER_ZALO_NICK_TYPE_LABELS[value],
        value,
      })),
      render: (c) => (
        <Badge variant={customerZaloNickTypeBadge(c.zaloNickType)}>
          {customerZaloNickTypeLabel(c.zaloNickType)}
        </Badge>
      )
    },
    {
      key: 'contractCount',
      label: 'Số hợp đồng',
      group: 'Hợp đồng',
      description: 'Tổng số hợp đồng của khách hàng',
      render: (c) => toNumber(c.contractCount)
    },
    {
      key: 'activeContractCount',
      label: 'Hợp đồng active',
      group: 'Hợp đồng',
      description: 'Số hợp đồng còn hiệu lực',
      render: (c) => toNumber(c.activeContractCount)
    },
    {
      key: 'nextContractExpiryAt',
      label: 'HĐ hết hạn gần nhất',
      group: 'Hợp đồng',
      description: 'Ngày hết hạn hợp đồng active gần nhất',
      render: (c) => toDateTime(c.nextContractExpiryAt)
    },
    {
      key: 'contractPackageNames',
      label: 'Gói cước',
      group: 'Hợp đồng',
      description: 'Gộp tất cả gói cước liên quan khách hàng'
    },
    {
      key: 'contractServicePhones',
      label: 'SĐT dịch vụ',
      group: 'Hợp đồng',
      description: 'Gộp các số điện thoại dịch vụ'
    },
    {
      key: 'contractProductTypes',
      label: 'Loại hợp đồng',
      group: 'Hợp đồng',
      description: 'Gộp các loại sản phẩm hợp đồng',
      render: (c) => formatContractProductList(c.contractProductTypes)
    },
    {
      key: 'contractExpiryDates',
      label: 'Ngày hết hạn HĐ',
      group: 'Hợp đồng',
      description: 'Gộp ngày hết hạn từ các hợp đồng'
    },
    {
      key: 'telecomExpiryDates',
      label: 'Ngày hết hạn gói cước',
      group: 'Hợp đồng',
      description: 'Gộp ngày hết hạn thuê bao viễn thông'
    },
    {
      key: 'digitalServiceNames',
      label: 'Dịch vụ số',
      group: 'Hợp đồng',
      description: 'Gộp service/plan/provider của dịch vụ số'
    },
    {
      key: 'vehicleCount',
      label: 'Số xe',
      group: 'Xe',
      description: 'Số phương tiện đang active',
      render: (c) => toNumber(c.vehicleCount)
    },
    {
      key: 'vehicleTypes',
      label: 'Loại xe',
      group: 'Xe',
      description: 'Gộp tất cả loại xe theo hồ sơ khách'
    },
    {
      key: 'vehicleKinds',
      label: 'Nhóm xe',
      group: 'Xe',
      description: 'Ô tô / xe máy...'
    },
    {
      key: 'vehiclePlateNumbers',
      label: 'Biển số xe',
      group: 'Xe',
      description: 'Gộp biển số các xe của khách'
    },
    {
      key: 'insuranceExpiryDates',
      label: 'Ngày hết hạn bảo hiểm',
      group: 'Bảo hiểm',
      description: 'Gộp ngày hết hạn bảo hiểm ô tô + xe máy'
    },
    {
      key: 'autoInsuranceExpiryDates',
      label: 'Hết hạn BH ô tô',
      group: 'Bảo hiểm',
      description: 'Gộp ngày hết hạn riêng bảo hiểm ô tô'
    },
    {
      key: 'motoInsuranceExpiryDates',
      label: 'Hết hạn BH xe máy',
      group: 'Bảo hiểm',
      description: 'Gộp ngày hết hạn riêng bảo hiểm xe máy'
    },
    {
      key: 'insurancePolicyNumbers',
      label: 'Số GCN bảo hiểm',
      group: 'Bảo hiểm',
      description: 'Gộp số giấy chứng nhận bảo hiểm'
    },
    { 
      key: 'updatedAt', 
      label: 'Cập nhật',
      group: 'Thông tin khách hàng',
      render: (c) => toDateTime(c.updatedAt)
    }
  ];

  const runCustomerBulkAction = async (
    actionLabel: string,
    selectedRows: Customer[],
    execute: (customer: Customer) => Promise<void>
  ): Promise<BulkExecutionResult> => {
    if (selectedRows.length === 0) {
      return {
        total: 0,
        successCount: 0,
        failedCount: 0,
        failedIds: [],
        failures: [],
        actionLabel,
        message: `${actionLabel}: không có bản ghi được chọn.`
      };
    }

    const rowsById = new Map<string, Customer>();
    selectedRows.forEach((row) => rowsById.set(String(row.id), row));
    const selectedIds = selectedRows.map((row) => String(row.id));

    const result = await runBulkOperation({
      ids: selectedIds,
      continueOnError: true,
      chunkSize: 10,
      execute: async (customerId) => {
        const row = rowsById.get(String(customerId));
        if (!row) {
          throw new Error(`Không tìm thấy khách hàng ${customerId}.`);
        }
        await execute(row);
      }
    });

    const normalized: BulkExecutionResult = {
      ...result,
      actionLabel,
      message: formatBulkSummary(
        {
          ...result,
          actionLabel
        },
        actionLabel
      )
    };

    if (normalized.successCount > 0) {
      await loadCustomers();
    }
    setResultMessage(normalized.message ?? null);
    if (normalized.failedCount > 0) {
      setErrorMessage(`Một số khách hàng lỗi khi chạy "${actionLabel}".`);
    } else {
      setErrorMessage(null);
    }
    return normalized;
  };

  const runCustomerBulkModalAction = async (context: StandardTableBulkModalRenderContext<Customer>) => {
    const selectedRows = context.selectedRows;
    if (selectedRows.length === 0) {
      setCustomerBulkError('Vui lòng chọn ít nhất 1 khách hàng.');
      return;
    }

    const source = customerBulkForm.source.trim();
    const statusValue = customerBulkForm.status;
    const tags = readBulkTags(customerBulkForm.tagsInput);
    const shouldPatch = Boolean(statusValue || source || customerBulkForm.lastContactDate || tags.length > 0);
    const shouldSoftSkip = customerBulkForm.softSkip;

    if (!shouldPatch && !shouldSoftSkip) {
      setCustomerBulkError('Vui lòng chọn ít nhất một thay đổi để áp dụng.');
      return;
    }
    if (shouldPatch && !canUpdate) {
      setCustomerBulkError('Bạn không có quyền cập nhật hàng loạt khách hàng.');
      return;
    }
    if (shouldSoftSkip && !canDelete) {
      setCustomerBulkError('Bạn không có quyền BỎ QUA/Xóa hàng loạt khách hàng.');
      return;
    }

    setIsApplyingCustomerBulk(true);
    setCustomerBulkError(null);
    const actionLabel = shouldPatch && shouldSoftSkip
      ? 'Cập nhật + BỎ QUA/Xóa khách hàng'
      : shouldSoftSkip
        ? 'BỎ QUA/Xóa khách hàng'
        : 'Cập nhật khách hàng hàng loạt';

    try {
      const result = await runCustomerBulkAction(actionLabel, selectedRows, async (customer) => {
        if (shouldPatch) {
          const patchBody: Record<string, unknown> = {};
          if (statusValue) {
            patchBody.status = statusValue;
          }
          if (source) {
            patchBody.source = source;
          }
          if (customerBulkForm.lastContactDate) {
            const parsedDate = new Date(`${customerBulkForm.lastContactDate}T00:00:00`);
            if (Number.isNaN(parsedDate.getTime())) {
              throw new Error('Ngày lần liên hệ cuối không hợp lệ.');
            }
            patchBody.lastContactAt = parsedDate.toISOString();
          }
          if (tags.length > 0) {
            if (customerBulkForm.tagMode === 'REPLACE') {
              patchBody.tags = tags;
            } else {
              const existingTags = Array.isArray(customer.tags)
                ? customer.tags.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean)
                : [];
              patchBody.tags = Array.from(new Set([...existingTags, ...tags]));
            }
          }

          if (Object.keys(patchBody).length > 0) {
            await apiRequest(`/crm/customers/${customer.id}`, {
              method: 'PATCH',
              body: patchBody,
            });
          }
        }

        if (shouldSoftSkip) {
          await apiRequest(`/crm/customers/${customer.id}`, {
            method: 'DELETE',
          });
        }
      });

      if (result.failedCount === 0) {
        setCustomerBulkForm({
          softSkip: false,
          status: '',
          source: '',
          lastContactDate: '',
          tagsInput: '',
          tagMode: 'APPEND',
        });
        context.clearSelection();
        context.closeBulkModal();
      } else {
        setCustomerBulkError('Một số khách hàng xử lý lỗi. Vui lòng kiểm tra kết quả rồi thử lại.');
      }
    } finally {
      setIsApplyingCustomerBulk(false);
    }
  };

  const renderCustomerBulkModalContent = (context: StandardTableBulkModalRenderContext<Customer>) => (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.86rem' }}>
        Đã chọn <strong>{context.selectedRows.length}</strong> / {context.totalLoadedRows} dòng đang tải.
      </p>
      {customerBulkError ? (
        <div className="finance-alert finance-alert-danger" style={{ margin: 0 }}>
          {customerBulkError}
        </div>
      ) : null}
      {canDelete ? (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={customerBulkForm.softSkip}
            onChange={(event) =>
              setCustomerBulkForm((prev) => ({ ...prev, softSkip: event.target.checked }))
            }
          />
          <span>BỎ QUA/Xóa</span>
        </label>
      ) : null}
      {canUpdate ? (
        <div className="field">
          <label>Thay đổi trạng thái</label>
          <select
            value={customerBulkForm.status}
            onChange={(event) =>
              setCustomerBulkForm((prev) => ({ ...prev, status: event.target.value as CustomerCareStatus | '' }))
            }
          >
            <option value="">Không cập nhật</option>
            {CUSTOMER_STATUS_OPTIONS.map((value) => (
              <option key={`bulk-status-${value}`} value={value}>
                {CUSTOMER_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {canUpdate ? (
        <div className="field">
          <label>Nguồn</label>
          <input
            list="crm-customer-source-options"
            value={customerBulkForm.source}
            onChange={(event) =>
              setCustomerBulkForm((prev) => ({ ...prev, source: event.target.value }))
            }
            placeholder="Nhập theo source taxonomy trong Settings Center"
          />
          <datalist id="crm-customer-source-options">
            {sourceOptions.map((value) => (
              <option key={`bulk-source-${value}`} value={value} />
            ))}
          </datalist>
        </div>
      ) : null}
      {canUpdate ? (
        <div className="field">
          <label>Lần liên hệ cuối</label>
          <input
            type="date"
            value={customerBulkForm.lastContactDate}
            onChange={(event) =>
              setCustomerBulkForm((prev) => ({ ...prev, lastContactDate: event.target.value }))
            }
          />
        </div>
      ) : null}
      {canUpdate ? (
        <div className="field">
          <label>Tags (phân tách bằng dấu phẩy hoặc chấm phẩy)</label>
          <input
            value={customerBulkForm.tagsInput}
            onChange={(event) =>
              setCustomerBulkForm((prev) => ({ ...prev, tagsInput: event.target.value }))
            }
            placeholder="Nhập theo customer tags trong Settings Center"
          />
        </div>
      ) : null}
      {canUpdate ? (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <input
              type="radio"
              name="crm-customer-bulk-tag-mode"
              checked={customerBulkForm.tagMode === 'APPEND'}
              onChange={() => setCustomerBulkForm((prev) => ({ ...prev, tagMode: 'APPEND' }))}
            />
            <span>Append tags</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <input
              type="radio"
              name="crm-customer-bulk-tag-mode"
              checked={customerBulkForm.tagMode === 'REPLACE'}
              onChange={() => setCustomerBulkForm((prev) => ({ ...prev, tagMode: 'REPLACE' }))}
            />
            <span>Replace tags</span>
          </label>
        </div>
      ) : null}
    </div>
  );

  const renderCustomerBulkModalFooter = (context: StandardTableBulkModalRenderContext<Customer>) => (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={context.closeBulkModal}
        disabled={isApplyingCustomerBulk}
      >
        Đóng
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void runCustomerBulkModalAction(context)}
        disabled={isApplyingCustomerBulk || context.selectedRows.length === 0}
      >
        {isApplyingCustomerBulk ? 'Đang xử lý...' : 'Xác nhận'}
      </button>
    </>
  );

  const upsertFilterDraftCondition = (
    conditionId: string,
    updater: (current: CustomerFilterCondition) => CustomerFilterCondition
  ) => {
    setCustomerFilterDraft((prev) => ({
      ...prev,
      conditions: prev.conditions.map((condition) => (
        condition.id === conditionId ? updater(condition) : condition
      )),
    }));
  };

  const changeFilterConditionField = (conditionId: string, field: CustomerFilterFieldKey) => {
    const fieldConfig = customerFilterFieldConfigs.find((item) => item.value === field)
      ?? customerFilterFieldConfigs[0]
      ?? FALLBACK_FILTER_FIELD_CONFIG;
    upsertFilterDraftCondition(conditionId, (current) => ({
      ...current,
      field: fieldConfig.value,
      operator: fieldConfig.operators[0] ?? current.operator,
      value: '',
      valueTo: '',
    }));
  };

  const changeFilterConditionOperator = (conditionId: string, operator: CustomerFilterOperator) => {
    upsertFilterDraftCondition(conditionId, (current) => ({
      ...current,
      operator,
      ...(operator !== 'between' ? { valueTo: '' } : {}),
    }));
  };

  const addFilterDraftCondition = () => {
    setCustomerFilterDraft((prev) => ({
      ...prev,
      conditions: [...prev.conditions, createDefaultFilterCondition(customerFilterFieldConfigs)],
    }));
  };

  const removeFilterDraftCondition = (conditionId: string) => {
    setCustomerFilterDraft((prev) => {
      const next = prev.conditions.filter((condition) => condition.id !== conditionId);
      return {
        ...prev,
        conditions: next.length > 0 ? next : [createDefaultFilterCondition(customerFilterFieldConfigs)],
      };
    });
  };

  const loadSelectedSavedFilterIntoDraft = () => {
    if (!selectedSavedFilterId) {
      setFilterErrorMessage('Vui lòng chọn bộ lọc đã lưu.');
      return;
    }
    const selected = savedCustomerFilters.find((item) => item.id === selectedSavedFilterId);
    if (!selected) {
      setFilterErrorMessage('Không tìm thấy bộ lọc đã lưu.');
      return;
    }
    setCustomerFilterDraft(toCustomerFilterDraft(selected, customerFilterFieldConfigs));
    setFilterErrorMessage(null);
  };

  if (!canView) {
    return null;
  }

  return (
    <div className="crm-board">
      {/* Messages */}
      {errorMessage && (
        <div className="finance-alert finance-alert-danger" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span><strong>Lỗi:</strong> {errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
        </div>
      )}
      {resultMessage && (
        <div className="finance-alert finance-alert-success" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span><strong>Thành công:</strong> {resultMessage}</span>
          <button onClick={() => setResultMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
        </div>
      )}

      {/* Table Data */}
      <StandardDataTable
        data={customers}
        columns={columns}
        storageKey={CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY}
        defaultVisibleColumnKeys={CUSTOMER_DEFAULT_VISIBLE_COLUMN_KEYS}
        toolbarLeftContent={(
          <>
            <div className="field" style={{ width: '180px' }}>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as CustomerStatusFilter)}
              >
                <option value="ALL">Tất cả trạng thái CSKH</option>
                {CUSTOMER_STATUS_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {CUSTOMER_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={`btn ${appliedFilterLabel ? 'btn-primary' : 'btn-ghost'}`}
              onClick={openFilterModal}
            >
              <Filter size={14} />
              Bộ lọc
              {appliedFilterConditionCount > 0 ? ` (${appliedFilterConditionCount})` : ''}
            </button>
            {appliedFilterLabel ? (
              <>
                <span
                  className="finance-status-pill finance-status-pill-info"
                  style={{ margin: 0 }}
                >
                  {appliedFilterLabel}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={clearAppliedCustomerFilter}
                >
                  Xóa lọc
                </button>
              </>
            ) : null}
          </>
        )}
        toolbarRightContent={(
          <>
            <button className="btn btn-ghost">
              <Download size={16} /> Export
            </button>
            <a className="btn btn-ghost" href="/modules/crm/customers/import">
              <Upload size={16} /> Import
            </a>
            <a className="btn btn-ghost" href="/modules/crm/vehicles">
              <Car size={16} /> Quản lý xe
            </a>
            {canCreate && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setIsCreatePanelOpen(true);
                }}
              >
                <Plus size={16} /> Khách hàng
              </button>
            )}
          </>
        )}
        isLoading={isLoading}
        pageInfo={{
          currentPage: customerTablePager.currentPage,
          hasPrevPage: customerTablePager.hasPrevPage,
          hasNextPage: customerTablePager.hasNextPage,
          visitedPages: customerTablePager.visitedPages
        }}
        sortMeta={
          tableSortMeta ?? {
            sortBy: tableSortBy,
            sortDir: tableSortDir,
            sortableFields: []
          }
        }
        onPageNext={customerTablePager.goNextPage}
        onPagePrev={customerTablePager.goPrevPage}
        onJumpVisitedPage={customerTablePager.jumpVisitedPage}
        onSortChange={(sortBy, sortDir) => {
          setTableSortBy(sortBy);
          setTableSortDir(sortDir);
        }}
        onRowClick={(c) => setSelectedCustomer(c)}
        editableKeys={canUpdate ? ['fullName', 'phone', 'email', 'customerStage', 'status', 'zaloNickType'] : []}
        onSaveRow={handleSaveCustomer}
        enableRowSelection
        selectedRowIds={selectedRowIds}
        onSelectedRowIdsChange={setSelectedRowIds}
        bulkActions={[]}
        bulkModalTitle="Bulk Actions"
        renderBulkModalContent={renderCustomerBulkModalContent}
        renderBulkModalFooter={renderCustomerBulkModalFooter}
      />

      <Modal
        open={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title="Bộ lọc khách hàng"
        maxWidth="880px"
        footer={(
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsFilterModalOpen(false)}
              disabled={isSavingCustomerFilter}
            >
              Đóng
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={applyCurrentFilterDraft}
              disabled={isSavingCustomerFilter}
            >
              Áp dụng tạm
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveCustomerFilterDraft}
              disabled={isSavingCustomerFilter}
            >
              <Save size={14} />
              {isSavingCustomerFilter ? 'Đang lưu...' : 'Lưu bộ lọc'}
            </button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: '0.95rem' }}>
          {filterErrorMessage ? (
            <div className="finance-alert finance-alert-danger" style={{ margin: 0 }}>
              {filterErrorMessage}
            </div>
          ) : null}
          {filterMessage ? (
            <div className="finance-alert finance-alert-success" style={{ margin: 0 }}>
              {filterMessage}
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: '0.55rem', padding: '0.7rem', border: '1px solid var(--line)', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <strong>Bộ lọc đã lưu</strong>
              {isLoadingCustomerFilters ? <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Đang tải...</span> : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: '0.45rem' }}>
              <select
                value={selectedSavedFilterId}
                onChange={(event) => setSelectedSavedFilterId(event.target.value)}
              >
                <option value="">-- Chọn bộ lọc đã lưu --</option>
                {savedCustomerFilters.map((filter) => (
                  <option key={filter.id} value={filter.id}>
                    {filter.name}{filter.isDefault ? ' (Mặc định)' : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost" onClick={applySelectedSavedFilter} disabled={!selectedSavedFilterId}>
                Áp dụng
              </button>
              <button type="button" className="btn btn-ghost" onClick={loadSelectedSavedFilterIntoDraft} disabled={!selectedSavedFilterId}>
                Chỉnh sửa
              </button>
              <button type="button" className="btn btn-danger" onClick={deleteSelectedSavedFilter} disabled={!selectedSavedFilterId || isSavingCustomerFilter}>
                <Trash2 size={14} />
                Xóa
              </button>
            </div>
            {defaultCustomerFilterId ? (
              <small style={{ color: 'var(--muted)' }}>
                Mặc định hiện tại: {savedCustomerFilters.find((item) => item.id === defaultCustomerFilterId)?.name ?? 'Không xác định'}
              </small>
            ) : (
              <small style={{ color: 'var(--muted)' }}>Chưa có bộ lọc mặc định.</small>
            )}
            <div>
              <button type="button" className="btn btn-ghost" onClick={clearAppliedCustomerFilter}>
                Xóa bộ lọc đang áp dụng
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.6rem', padding: '0.7rem', border: '1px solid var(--line)', borderRadius: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '0.55rem' }}>
              <div className="field">
                <label>Tên bộ lọc</label>
                <input
                  value={customerFilterDraft.name}
                  onChange={(event) =>
                    setCustomerFilterDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Ví dụ: Khách có xe sắp hết bảo hiểm"
                />
              </div>
              <div className="field">
                <label>Logic điều kiện</label>
                <select
                  value={customerFilterDraft.logic}
                  onChange={(event) =>
                    setCustomerFilterDraft((prev) => ({
                      ...prev,
                      logic: event.target.value === 'OR' ? 'OR' : 'AND',
                    }))
                  }
                >
                  <option value="AND">AND (thỏa tất cả)</option>
                  <option value="OR">OR (thỏa một trong các điều kiện)</option>
                </select>
              </div>
            </div>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <input
                type="checkbox"
                checked={customerFilterDraft.isDefault}
                onChange={(event) =>
                  setCustomerFilterDraft((prev) => ({ ...prev, isDefault: event.target.checked }))
                }
              />
              <span>Đặt làm bộ lọc mặc định (tự áp dụng lần sau)</span>
            </label>

            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {customerFilterDraft.conditions.map((condition, index) => {
                const fieldConfig = customerFilterFieldConfigs.find((item) => item.value === condition.field)
                  ?? customerFilterFieldConfigs[0]
                  ?? FALLBACK_FILTER_FIELD_CONFIG;
                const operatorOptions = fieldConfig.operators;
                const showValueInput = !['is_empty', 'is_not_empty'].includes(condition.operator);
                const showValueTo = condition.operator === 'between';
                const enumOptions = fieldConfig.options ?? [];

                return (
                  <div
                    key={condition.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: showValueTo ? '1.2fr 1fr 1fr 1fr auto' : '1.25fr 1fr 1.25fr auto',
                      gap: '0.45rem',
                      alignItems: 'end',
                    }}
                  >
                    <div className="field">
                      <label>Field #{index + 1}</label>
                      <select
                        value={condition.field}
                        onChange={(event) => changeFilterConditionField(condition.id, event.target.value as CustomerFilterFieldKey)}
                      >
                        {Array.from(new Set(customerFilterFieldConfigs.map((item) => item.group))).map((groupName) => (
                          <optgroup key={groupName} label={groupName}>
                            {customerFilterFieldConfigs
                              .filter((item) => item.group === groupName)
                              .map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Toán tử</label>
                      <select
                        value={condition.operator}
                        onChange={(event) => changeFilterConditionOperator(condition.id, event.target.value as CustomerFilterOperator)}
                      >
                        {operatorOptions.map((operator) => (
                          <option key={`${condition.id}-${operator}`} value={operator}>
                            {CUSTOMER_FILTER_OPERATOR_LABELS[operator]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {showValueInput ? (
                      <div className="field">
                        <label>Giá trị</label>
                        {fieldConfig.inputType === 'enum' ? (
                          <select
                            value={condition.value}
                            onChange={(event) =>
                              upsertFilterDraftCondition(condition.id, (current) => ({ ...current, value: event.target.value }))
                            }
                          >
                            <option value="">-- Chọn --</option>
                            {enumOptions.map((option) => (
                              <option key={`${condition.id}-enum-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : fieldConfig.inputType === 'date' ? (
                          <input
                            type="date"
                            value={condition.value}
                            onChange={(event) =>
                              upsertFilterDraftCondition(condition.id, (current) => ({ ...current, value: event.target.value }))
                            }
                          />
                        ) : (
                          <input
                            list={fieldConfig.inputType === 'tag' ? 'crm-filter-tag-options' : undefined}
                            value={condition.value}
                            onChange={(event) =>
                              upsertFilterDraftCondition(condition.id, (current) => ({ ...current, value: event.target.value }))
                            }
                            placeholder="Nhập giá trị..."
                          />
                        )}
                      </div>
                    ) : null}

                    {showValueTo ? (
                      <div className="field">
                        <label>Đến ngày</label>
                        <input
                          type="date"
                          value={condition.valueTo}
                          onChange={(event) =>
                            upsertFilterDraftCondition(condition.id, (current) => ({ ...current, valueTo: event.target.value }))
                          }
                        />
                      </div>
                    ) : null}

                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => removeFilterDraftCondition(condition.id)}
                      title="Xóa điều kiện"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
              <datalist id="crm-filter-tag-options">
                {customerTagOptions.map((tag) => (
                  <option key={`crm-filter-tag-${tag}`} value={tag} />
                ))}
              </datalist>
              <div>
                <button type="button" className="btn btn-ghost" onClick={addFilterDraftCondition}>
                  <Plus size={14} />
                  Thêm điều kiện
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Detail Side Panel */}
      <SidePanel
        isOpen={!!selectedCustomer}
        onClose={() => {
          setSelectedCustomer(null);
          setCustomerDetail(null);
          setIsDetailEditing(false);
          setDetailForm(buildDetailForm(null));
        }}
        title="Chi tiết khách hàng"
      >
        {selectedCustomer && (
          <div style={{ display: 'grid', gap: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--line)' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '12px', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <User size={32} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                  {isDetailEditing ? (detailForm.fullName || '(Chưa nhập tên)') : detailCustomer?.fullName}
                </h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>{detailCustomer?.code || 'Mã: (Chưa có)'}</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Mail size={14} /> Email</label>
                {isDetailEditing ? (
                  <input
                    value={detailForm.email}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="customer@example.com"
                  />
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.email || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Phone size={14} /> Điện thoại</label>
                {isDetailEditing ? (
                  <input
                    value={detailForm.phone}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="09xxxxxxxx"
                  />
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.phone || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Target size={14} /> Giai đoạn</label>
                {isDetailEditing ? (
                  <select
                    value={detailForm.customerStage}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, customerStage: event.target.value }))}
                  >
                    {detailStageOptions.map((stage) => (
                      <option key={stage} value={stage}>
                        {formatTaxonomyLabel(stage)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.customerStage || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><CreditCard size={14} /> Tổng chi tiêu</label>
                <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--primary)' }}>{toCurrency(detailCustomer?.totalSpent)}</p>
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Globe size={14} /> Nguồn</label>
                {isDetailEditing ? (
                  <select
                    value={detailForm.source}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, source: event.target.value }))}
                  >
                    {detailSourceOptions.map((source) => (
                      <option key={source} value={source}>
                        {formatTaxonomyLabel(source)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.source || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ marginBottom: '4px' }}>Trạng thái</label>
                {isDetailEditing ? (
                  <select
                    value={detailForm.status}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, status: event.target.value as CustomerCareStatus }))}
                  >
                    {CUSTOMER_STATUS_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {CUSTOMER_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>
                    <Badge variant={customerStatusBadge(detailCustomer?.status)}>{customerStatusLabel(detailCustomer?.status)}</Badge>
                  </p>
                )}
              </div>
              <div className="field">
                <label style={{ marginBottom: '4px' }}>Loại nick Zalo</label>
                {isDetailEditing ? (
                  <select
                    value={detailForm.zaloNickType}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, zaloNickType: event.target.value as CustomerZaloNickType }))}
                  >
                    {CUSTOMER_ZALO_NICK_TYPE_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {CUSTOMER_ZALO_NICK_TYPE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>
                    <Badge variant={customerZaloNickTypeBadge(detailCustomer?.zaloNickType)}>
                      {customerZaloNickTypeLabel(detailCustomer?.zaloNickType)}
                    </Badge>
                  </p>
                )}
              </div>
              <div className="field">
                <label>Phân khúc</label>
                {isDetailEditing ? (
                  <input
                    value={detailForm.segment}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, segment: event.target.value }))}
                    placeholder="VIP / Retail / B2B..."
                  />
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.segment || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Calendar size={14} /> Cập nhật cuối</label>
                <p style={{ fontSize: '0.9375rem' }}>{toDateTime(detailCustomer?.updatedAt)}</p>
              </div>
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}><Tag size={14} /> Thẻ (Tags)</label>
              {isDetailEditing ? (
                <select
                  multiple
                  value={detailForm.tags}
                  onChange={(event) => setDetailForm((prev) => ({ ...prev, tags: readSelectedTags(event) }))}
                  size={Math.min(Math.max(customerTagSelectOptions.length, 3), 8)}
                >
                  {customerTagSelectOptions.map((tag) => (
                    <option key={`detail-tag-${tag}`} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {detailCustomer?.tags?.length ? detailCustomer.tags.map((t) => (
                    <span key={t} className="finance-status-pill finance-status-pill-neutral">{t}</span>
                  )) : <span style={{ color: 'var(--muted)', fontSize: '0.875rem italic' }}>--</span>}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Gia hạn CRM & gói cước</h4>
              {isDetailLoading ? (
                <p style={{ margin: 0, color: 'var(--muted)' }}>Đang tải thông tin hợp đồng...</p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.6rem' }}>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Tổng hợp đồng</p>
                      <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{contractSummary?.totalContracts ?? 0}</p>
                    </div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Đang active</p>
                      <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{contractSummary?.activeContracts ?? 0}</p>
                    </div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Đã hết hạn</p>
                      <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{contractSummary?.expiredContracts ?? 0}</p>
                    </div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Hết hạn gần nhất</p>
                      <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: 600 }}>{toDateTime(contractSummary?.nextExpiringAt)}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {(['TELECOM_PACKAGE', 'AUTO_INSURANCE', 'MOTO_INSURANCE', 'DIGITAL_SERVICE'] as ContractProductType[]).map((productType) => (
                      <span key={`product-summary-${productType}`} className="finance-status-pill finance-status-pill-neutral">
                        {formatContractProductLabel(productType)}: {contractSummary?.byProduct?.[productType] ?? 0}
                      </span>
                    ))}
                  </div>

                  {recentContracts.length > 0 ? (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {recentContracts.slice(0, 5).map((contract) => (
                        <div key={contract.id} style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.65rem 0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                            <strong style={{ fontSize: '0.88rem' }}>{formatContractProductLabel(contract.productType)}</strong>
                            <Badge variant={statusToBadge(contract.status)}>{contract.status || '--'}</Badge>
                          </div>
                          <p style={{ margin: '0.35rem 0 0', fontSize: '0.84rem', color: 'var(--muted)' }}>
                            {formatContractReference(contract, vehicleMap)}
                          </p>
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                            Hiệu lực: {toDateTime(contract.startsAt)} → {toDateTime(contract.endsAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)' }}>Khách hàng chưa có hợp đồng CRM.</p>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'grid', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Car size={16} /> Thông tin xe
                </h4>
                {canManageSelectedCustomerVehicles && (
                  <button className="btn btn-ghost" onClick={openCreateVehicleEditor}>
                    <Plus size={14} /> Thêm xe
                  </button>
                )}
              </div>

              {isDetailLoading ? (
                <p style={{ margin: 0, color: 'var(--muted)' }}>Đang tải danh sách xe...</p>
              ) : customerVehicles.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  {customerVehicles.slice(0, 8).map((vehicle) => (
                    <div key={vehicle.id} style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.9rem' }}>{vehicle.plateNumber || 'Biển số N/A'}</strong>
                        <Badge variant={statusToBadge(vehicle.status)}>{vehicle.status || '--'}</Badge>
                      </div>
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.83rem', color: 'var(--muted)' }}>
                        Loại xe: {vehicle.vehicleKind || '--'} · Dòng xe: {vehicle.vehicleType || '--'}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Chủ xe: {vehicle.ownerFullName || '--'} · Cập nhật: {toDateTime(vehicle.updatedAt)}
                      </p>
                      {(canManageSelectedCustomerVehicles || canArchiveSelectedCustomerVehicles) && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                          {canManageSelectedCustomerVehicles && (
                            <button className="btn btn-ghost" onClick={() => openEditVehicleEditor(vehicle)}>
                              Sửa
                            </button>
                          )}
                          {canArchiveSelectedCustomerVehicles && String(vehicle.status ?? '').toUpperCase() !== 'ARCHIVED' && (
                            <button
                              className="btn btn-danger"
                              onClick={() => handleArchiveVehicle(vehicle)}
                              disabled={archivingVehicleId === vehicle.id}
                            >
                              {archivingVehicleId === vehicle.id ? 'Đang lưu trữ...' : 'Lưu trữ'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)' }}>Chưa có thông tin xe cho khách hàng này.</p>
              )}

              {canManageSelectedCustomerVehicles && isVehicleEditorOpen && (
                <form onSubmit={handleSaveVehicle} style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', display: 'grid', gap: '0.75rem' }}>
                  <h5 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 600 }}>
                    {vehicleEditorMode === 'create' ? 'Thêm xe mới cho khách hàng' : `Cập nhật xe ${vehicleForm.plateNumber || ''}`}
                  </h5>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
                    <div className="field">
                      <label>Chủ xe *</label>
                      <input
                        required
                        value={vehicleForm.ownerFullName}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, ownerFullName: event.target.value }))}
                        placeholder="Nguyễn Văn A"
                      />
                    </div>
                    <div className="field">
                      <label>Biển số *</label>
                      <input
                        required
                        value={vehicleForm.plateNumber}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, plateNumber: event.target.value.toUpperCase() }))}
                        placeholder="30A-12345"
                      />
                    </div>
                    <div className="field">
                      <label>Số khung *</label>
                      <input
                        required
                        value={vehicleForm.chassisNumber}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, chassisNumber: event.target.value.toUpperCase() }))}
                      />
                    </div>
                    <div className="field">
                      <label>Số máy *</label>
                      <input
                        required
                        value={vehicleForm.engineNumber}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, engineNumber: event.target.value.toUpperCase() }))}
                      />
                    </div>
                    <div className="field">
                      <label>Nhóm xe *</label>
                      <select
                        value={vehicleForm.vehicleKind}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, vehicleKind: normalizeVehicleKind(event.target.value) }))}
                      >
                        <option value="AUTO">Ô tô</option>
                        <option value="MOTO">Xe máy</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Dòng xe *</label>
                      <input
                        required
                        value={vehicleForm.vehicleType}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, vehicleType: event.target.value }))}
                        placeholder="Sedan / SUV / Tay ga..."
                      />
                    </div>
                    <div className="field">
                      <label>Số chỗ</label>
                      <input
                        type="number"
                        min={0}
                        value={vehicleForm.seatCount}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, seatCount: event.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <label>Tải trọng (kg)</label>
                      <input
                        type="number"
                        min={0}
                        value={vehicleForm.loadKg}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, loadKg: event.target.value }))}
                      />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / span 2' }}>
                      <label>Địa chỉ chủ xe</label>
                      <input
                        value={vehicleForm.ownerAddress}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, ownerAddress: event.target.value }))}
                        placeholder="Địa chỉ chủ xe"
                      />
                    </div>
                    <div className="field">
                      <label>Trạng thái</label>
                      <select
                        value={vehicleForm.status}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, status: event.target.value as VehicleFormState['status'] }))}
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                        <option value="DRAFT">DRAFT</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" type="submit" disabled={isSavingVehicle}>
                      {isSavingVehicle ? 'Đang lưu...' : vehicleEditorMode === 'create' ? 'Thêm xe' : 'Lưu cập nhật'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setIsVehicleEditorOpen(false);
                        setEditingVehicleId(null);
                        setVehicleEditorMode('create');
                        setVehicleForm(buildVehicleFormState(null, detailCustomer?.fullName ?? selectedCustomer?.fullName ?? null));
                      }}
                      disabled={isSavingVehicle}
                    >
                      Hủy
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--line)' }}>
              {isDetailEditing ? (
                <>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={handleSaveDetailProfile}
                    disabled={isSavingDetail}
                  >
                    {isSavingDetail ? 'Đang lưu...' : 'Lưu hồ sơ'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setIsDetailEditing(false);
                      setDetailForm(buildDetailForm(detailCustomer ?? selectedCustomer));
                    }}
                    disabled={isSavingDetail}
                  >
                    Hủy chỉnh sửa
                  </button>
                </>
              ) : (
                <>
                  {canUpdate && (
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setDetailForm(buildDetailForm(detailCustomer ?? selectedCustomer));
                        setIsDetailEditing(true);
                      }}
                    >
                      Chỉnh sửa hồ sơ
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ flex: 1 }} disabled>
                    Gửi thông báo
                  </button>
                  {canDelete && String(detailCustomer?.status || '').toUpperCase() !== 'SAI_SO_KHONG_TON_TAI_BO_QUA_XOA' && (
                    <button
                      className="btn btn-danger"
                      style={{ flex: 1 }}
                      onClick={handleSoftSkipCustomer}
                      disabled={isSoftSkippingCustomer}
                    >
                      <Trash2 size={16} /> {isSoftSkippingCustomer ? 'Đang cập nhật...' : 'BỎ QUA/Xóa'}
                    </button>
                  )}
                </>
              )}
              <a
                className="btn btn-ghost"
                style={{ flex: 1, justifyContent: 'center' }}
                href={buildAuditObjectHref('Customer', selectedCustomer.id)}
              >
                <History size={16} /> Lịch sử audit
              </a>
            </div>
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isCreatePanelOpen}
        onClose={() => {
          setIsCreatePanelOpen(false);
          if (!isCreating) {
            resetCreateForm();
          }
        }}
        title="Tạo khách hàng mới"
      >
        <form onSubmit={handleCreateCustomer} style={{ display: 'grid', gap: '1rem' }}>
          <div className="field">
            <label>Họ tên khách hàng *</label>
            <input
              required
              value={createForm.fullName}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, fullName: event.target.value }))}
              placeholder="Nguyễn Văn A"
            />
          </div>
          <div className="field">
            <label>Số điện thoại</label>
            <input
              value={createForm.phone}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="09xxxxxxxx"
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={createForm.email}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="customer@example.com"
            />
          </div>
          <div className="field">
            <label>Giai đoạn</label>
            <select
              value={createForm.customerStage}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, customerStage: event.target.value }))}
            >
              {stageOptions.length === 0 ? (
                <option value="">Chưa cấu hình giai đoạn trong Settings Center</option>
              ) : null}
              {stageOptions.map((stage) => (
                <option key={stage} value={stage}>
                  {formatTaxonomyLabel(stage)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Nguồn</label>
            <select
              value={createForm.source}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, source: event.target.value }))}
            >
              {sourceOptions.length === 0 ? (
                <option value="">Chưa cấu hình nguồn trong Settings Center</option>
              ) : null}
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {formatTaxonomyLabel(source)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Phân khúc</label>
            <input
              value={createForm.segment}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, segment: event.target.value }))}
              placeholder="VIP / Retail / B2B..."
            />
          </div>
          <div className="field">
            <label>Tags</label>
            <select
              multiple
              value={createForm.tags}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, tags: readSelectedTags(event) }))}
              size={Math.min(Math.max(customerTagSelectOptions.length, 3), 8)}
            >
              {customerTagSelectOptions.map((tag) => (
                <option key={`create-tag-${tag}`} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={isCreating} style={{ flex: 1 }}>
              {isCreating ? 'Đang tạo...' : 'Tạo khách hàng'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => {
                if (isCreating) return;
                setIsCreatePanelOpen(false);
                resetCreateForm();
              }}
            >
              Hủy
            </button>
          </div>
        </form>
      </SidePanel>
    </div>
  );
}
