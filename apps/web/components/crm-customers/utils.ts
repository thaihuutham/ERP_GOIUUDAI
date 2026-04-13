/* ═══════════════════════════════════════════════
   CRM Customers Board — Utility Functions
   Extracted from crm-customers-board.tsx for modularity.
   ═══════════════════════════════════════════════ */

import type { ChangeEvent } from 'react';
import { readStoredAuthSession } from '../../lib/auth-session';
import { formatRuntimeCurrency, formatRuntimeDateTime } from '../../lib/runtime-format';
import { statusToBadge, type BadgeVariant } from '../ui/badge';
import type {
  Customer,
  CustomerCareStatus,
  CustomerZaloNickType,
  CrmCustomerContract,
  CrmCustomerVehicle,
  DetailCustomerFormState,
  VehicleFormState,
  CustomerFilterFieldKey,
  CustomerFilterOperator,
  CustomerFilterCondition,
  CustomerFilterDraft,
  CustomerFilterFieldConfig,
  CustomerSavedFilter,
} from './types';
import {
  AUTH_ENABLED,
  CUSTOMER_STATUS_OPTIONS,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_BADGE,
  CUSTOMER_ZALO_NICK_TYPE_OPTIONS,
  CUSTOMER_ZALO_NICK_TYPE_LABELS,
  CUSTOMER_ZALO_NICK_BADGE,
  FALLBACK_FILTER_FIELD_CONFIG,
  CONTRACT_PRODUCT_TYPE_OPTIONS,
  VEHICLE_KIND_OPTIONS,
} from './types';

// ── Number / Format ──────────────────────────────

export function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

export function toCurrency(value: number | string | null | undefined) {
  return formatRuntimeCurrency(toNumber(value));
}

export function toDateTime(value: string | null | undefined) {
  if (!value) return '--';
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? value : formatRuntimeDateTime(parsed.toISOString());
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function formatTaxonomyLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// ── Status / Badge Helpers ───────────────────────

export function customerStatusLabel(
  value: string | null | undefined,
  labels: Partial<Record<CustomerCareStatus, string>> = CUSTOMER_STATUS_LABELS
) {
  const normalized = String(value ?? '').trim().toUpperCase() as CustomerCareStatus;
  const normalizedLabel = String(labels[normalized] ?? '').trim();
  return normalizedLabel || CUSTOMER_STATUS_LABELS[normalized] || (value || '--');
}

export function customerStatusBadge(value: string | null | undefined): BadgeVariant {
  const normalized = String(value ?? '').trim().toUpperCase() as CustomerCareStatus;
  return CUSTOMER_STATUS_BADGE[normalized] ?? statusToBadge(value);
}

export function customerZaloNickTypeLabel(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toUpperCase() as CustomerZaloNickType;
  return CUSTOMER_ZALO_NICK_TYPE_LABELS[normalized] ?? (value || '--');
}

export function customerZaloNickTypeBadge(value: string | null | undefined): BadgeVariant {
  const normalized = String(value ?? '').trim().toUpperCase() as CustomerZaloNickType;
  return CUSTOMER_ZALO_NICK_BADGE[normalized] ?? statusToBadge(value);
}

// ── Contract Helpers ─────────────────────────────

export function formatContractProductLabel(productType: string | null | undefined) {
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

export function formatContractProductList(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '--';
  }
  return normalized
    .split(',')
    .map((item) => formatContractProductLabel(item))
    .join(', ');
}

export function formatContractReference(contract: CrmCustomerContract, vehicleMap: Map<string, CrmCustomerVehicle>) {
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

// ── Navigation ───────────────────────────────────

export function buildAuditObjectHref(entityType: string, entityId: string) {
  const params = new URLSearchParams({
    entityType,
    entityId
  });
  return `/modules/audit?${params.toString()}`;
}

// ── Form Builders ────────────────────────────────

export function buildDetailForm(
  customer: Customer | null,
  statusOptions: CustomerCareStatus[] = CUSTOMER_STATUS_OPTIONS
): DetailCustomerFormState {
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
    status: statusOptions.includes(normalizedStatus)
      ? normalizedStatus
      : 'MOI_CHUA_TU_VAN',
    zaloNickType: CUSTOMER_ZALO_NICK_TYPE_OPTIONS.includes(normalizedZaloNickType)
      ? normalizedZaloNickType
      : 'CHUA_KIEM_TRA',
    tags
  };
}

export function normalizeVehicleKind(input: unknown): 'AUTO' | 'MOTO' {
  const normalized = String(input ?? '').trim().toUpperCase();
  return normalized === 'MOTO' ? 'MOTO' : 'AUTO';
}

export function buildVehicleFormState(
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

export function resolveCurrentActorIdentity(role: string) {
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

// ── Tag Helpers ──────────────────────────────────

export function readSelectedTags(event: ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.target.selectedOptions)
    .map((option) => option.value.trim().toLowerCase())
    .filter(Boolean);
}

export function readBulkTags(input: string) {
  return Array.from(
    new Set(
      String(input ?? '')
        .split(/[;,]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
      )
  );
}

// ── Filter Helpers ───────────────────────────────

export function createCustomerFilterConditionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cond_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildCustomerFilterFieldConfigs(
  stageOptions: string[],
  sourceOptions: string[],
  customerTagOptions: string[],
  customerStatusOptions: CustomerCareStatus[] = CUSTOMER_STATUS_OPTIONS
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
      options: customerStatusOptions,
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

export function createDefaultFilterCondition(
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

export function toCustomerFilterDraft(filter: CustomerSavedFilter, fieldConfigs: CustomerFilterFieldConfig[]): CustomerFilterDraft {
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

export function toCustomerFilterQueryPayload(draft: CustomerFilterDraft | null) {
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
