'use client';

import {
  Download,
  FileSpreadsheet,
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
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { readStoredAuthSession } from '../lib/auth-session';
import { apiRequest, normalizeListPayload, normalizeObjectPayload } from '../lib/api-client';
import { downloadExcelTemplate } from '../lib/excel-template';
import { formatRuntimeCurrency, formatRuntimeDateTime } from '../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../lib/bulk-actions';
import { useAccessPolicy } from './access-policy-context';
import { useUserRole } from './user-role-context';
import { ExcelImportBlock } from './ui/excel-import-block';
import { StandardDataTable, ColumnDefinition, type StandardTableBulkAction } from './ui/standard-data-table';
import { SidePanel } from './ui/side-panel';
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

type CustomerImportError = {
  rowIndex: number;
  identifier?: string;
  message: string;
};

type CustomerImportSummary = {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errors: CustomerImportError[];
};

type CustomerImportRow = {
  code?: string;
  fullName?: string;
  phone?: string;
  phoneNormalized?: string;
  email?: string;
  emailNormalized?: string;
  customerStage?: string;
  source?: string;
  segment?: string;
  tags?: string[];
  ownerStaffId?: string;
  consentStatus?: string;
  needsSummary?: string;
  totalSpent?: number;
  totalOrders?: number;
  lastOrderAt?: string;
  lastContactAt?: string;
  status?: CustomerCareStatus;
  zaloNickType?: CustomerZaloNickType;
};

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
const CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY = 'erp-retail.crm.customer-table-settings.v4';
const FETCH_LIMIT = 200;
const DEFAULT_STAGE_OPTIONS = ['MOI', 'TIEP_CAN', 'DANG_CHAM_SOC', 'CHOT_DON'];
const DEFAULT_SOURCE_OPTIONS = ['ONLINE', 'OFFLINE', 'CTV', 'REFERRAL'];
const DEFAULT_CUSTOMER_TAG_OPTIONS = ['vip', 'khach_moi', 'da_mua'];
const AUTH_ENABLED = String(process.env.NEXT_PUBLIC_AUTH_ENABLED ?? 'false').trim().toLowerCase() === 'true';

const CUSTOMER_IMPORT_TEMPLATE_ROWS: Array<Record<string, string | number>> = [
  {
    code: 'CUS-2026-001',
    fullName: 'Nguyen Van A',
    phone: '0901234567',
    email: 'a@example.com',
    customerStage: 'MOI',
    source: 'ONLINE',
    segment: 'Retail',
    tags: 'vip;khach_moi',
    ownerStaffId: '',
    consentStatus: '',
    needsSummary: 'Quan tâm gia hạn gói data',
    totalSpent: 2500000,
    totalOrders: 3,
    lastOrderAt: '2026-03-01T09:00:00.000Z',
    lastContactAt: '2026-04-01T08:30:00.000Z',
    status: 'MOI_CHUA_TU_VAN',
    zaloNickType: 'CHUA_KIEM_TRA',
  },
  {
    code: 'CUS-2026-002',
    fullName: 'Tran Thi B',
    phone: '0911222333',
    email: 'b@example.com',
    customerStage: 'DANG_CHAM_SOC',
    source: 'REFERRAL',
    segment: 'SMB',
    tags: 'da_mua',
    ownerStaffId: '',
    consentStatus: '',
    needsSummary: 'Đã nhắn qua Zalo',
    totalSpent: 4800000,
    totalOrders: 6,
    lastOrderAt: '2026-02-10T14:00:00.000Z',
    lastContactAt: '2026-04-03T15:45:00.000Z',
    status: 'DONG_Y_CHUYEN_THANH_KH',
    zaloNickType: 'GUI_DUOC_TIN_NHAN',
  },
];

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

function normalizeHeaderKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function extractExcelHeaderValue(row: Record<string, unknown>, aliases: string[]) {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(normalizeHeaderKey(key), value);
  }

  for (const alias of aliases) {
    const value = normalized.get(alias);
    if (value === undefined || value === null || value === '') {
      continue;
    }
    return value;
  }
  return undefined;
}

function parseCustomerStatusFromExcel(value: unknown): CustomerCareStatus | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return undefined;
  }
  const upper = raw.toUpperCase() as CustomerCareStatus;
  if (CUSTOMER_STATUS_OPTIONS.includes(upper)) {
    return upper;
  }
  const normalized = normalizeHeaderKey(raw);
  if (normalized.includes('chuatuvan') || normalized.includes('moichuatuvan')) {
    return 'MOI_CHUA_TU_VAN';
  }
  if (normalized.includes('dangsuynghi')) {
    return 'DANG_SUY_NGHI';
  }
  if (normalized.includes('dongy') || normalized.includes('chuyenthanhkh')) {
    return 'DONG_Y_CHUYEN_THANH_KH';
  }
  if (normalized.includes('khongnghemaylan2')) {
    return 'KHONG_NGHE_MAY_LAN_2';
  }
  if (normalized.includes('khongnghemaylan1')) {
    return 'KHONG_NGHE_MAY_LAN_1';
  }
  if (normalized.includes('tuchoi')) {
    return 'KH_TU_CHOI';
  }
  if (normalized.includes('damuabenkhac')) {
    return 'KH_DA_MUA_BEN_KHAC';
  }
  if (normalized.includes('nguoinhalam') || normalized.includes('thuebao')) {
    return 'NGUOI_NHA_LAM_THUE_BAO';
  }
  if (normalized.includes('saiso') || normalized.includes('khongtontai') || normalized.includes('boquaxoa')) {
    return 'SAI_SO_KHONG_TON_TAI_BO_QUA_XOA';
  }
  return undefined;
}

function parseCustomerZaloNickTypeFromExcel(value: unknown): CustomerZaloNickType | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return undefined;
  }
  const upper = raw.toUpperCase() as CustomerZaloNickType;
  if (CUSTOMER_ZALO_NICK_TYPE_OPTIONS.includes(upper)) {
    return upper;
  }
  const normalized = normalizeHeaderKey(raw);
  if (normalized.includes('chuakiemtra')) {
    return 'CHUA_KIEM_TRA';
  }
  if (normalized.includes('chuaconickzalo') || normalized.includes('chuacozalo')) {
    return 'CHUA_CO_NICK_ZALO';
  }
  if (normalized.includes('channguoila') || normalized.includes('stranger')) {
    return 'CHAN_NGUOI_LA';
  }
  if (normalized.includes('guiduoctinnhan') || normalized.includes('guiduoc')) {
    return 'GUI_DUOC_TIN_NHAN';
  }
  return undefined;
}

function parseOptionalNonNegativeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function parseOptionalNonNegativeInteger(value: unknown) {
  const parsed = parseOptionalNonNegativeNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.trunc(parsed);
}

function parseOptionalIsoDate(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

async function parseCustomerImportXlsx(file: File): Promise<CustomerImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return [];
  }
  const sheet = workbook.Sheets[firstSheet];
  const parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: true,
    defval: null,
  });

  const rows = parsedRows.map((row) => {
    const tagsRaw = extractExcelHeaderValue(row, ['tags', 'nhan', 'the', 'customertags']);
    const tags = String(tagsRaw ?? '')
      .split(/[;,]/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    const parsed: CustomerImportRow = {
      code: extractExcelHeaderValue(row, ['code', 'makh', 'customercode']) ? String(extractExcelHeaderValue(row, ['code', 'makh', 'customercode'])).trim() : undefined,
      fullName: extractExcelHeaderValue(row, ['fullname', 'hoten', 'tenkhachhang', 'customername']) ? String(extractExcelHeaderValue(row, ['fullname', 'hoten', 'tenkhachhang', 'customername'])).trim() : undefined,
      phone: extractExcelHeaderValue(row, ['phone', 'sdt', 'sodienthoai', 'dienthoai']) ? String(extractExcelHeaderValue(row, ['phone', 'sdt', 'sodienthoai', 'dienthoai'])).trim() : undefined,
      phoneNormalized: extractExcelHeaderValue(row, ['phonenormalized', 'phonechuhoa', 'phoneclean']) ? String(extractExcelHeaderValue(row, ['phonenormalized', 'phonechuhoa', 'phoneclean'])).trim() : undefined,
      email: extractExcelHeaderValue(row, ['email']) ? String(extractExcelHeaderValue(row, ['email'])).trim() : undefined,
      emailNormalized: extractExcelHeaderValue(row, ['emailnormalized', 'emailclean']) ? String(extractExcelHeaderValue(row, ['emailnormalized', 'emailclean'])).trim() : undefined,
      customerStage: extractExcelHeaderValue(row, ['customerstage', 'giaidoan']) ? String(extractExcelHeaderValue(row, ['customerstage', 'giaidoan'])).trim() : undefined,
      source: extractExcelHeaderValue(row, ['source', 'nguon']) ? String(extractExcelHeaderValue(row, ['source', 'nguon'])).trim() : undefined,
      segment: extractExcelHeaderValue(row, ['segment', 'phankhuc', 'phanloai']) ? String(extractExcelHeaderValue(row, ['segment', 'phankhuc', 'phanloai'])).trim() : undefined,
      tags: tags.length > 0 ? tags : undefined,
      ownerStaffId: extractExcelHeaderValue(row, ['ownerstaffid', 'phutrach']) ? String(extractExcelHeaderValue(row, ['ownerstaffid', 'phutrach'])).trim() : undefined,
      consentStatus: extractExcelHeaderValue(row, ['consentstatus', 'dongythongtin']) ? String(extractExcelHeaderValue(row, ['consentstatus', 'dongythongtin'])).trim() : undefined,
      needsSummary: extractExcelHeaderValue(row, ['needssummary', 'ghichu', 'nhucau']) ? String(extractExcelHeaderValue(row, ['needssummary', 'ghichu', 'nhucau'])).trim() : undefined,
      totalSpent: parseOptionalNonNegativeNumber(extractExcelHeaderValue(row, ['totalspent', 'tongchitieu'])),
      totalOrders: parseOptionalNonNegativeInteger(extractExcelHeaderValue(row, ['totalorders', 'tongdonhang'])),
      lastOrderAt: parseOptionalIsoDate(extractExcelHeaderValue(row, ['lastorderat', 'ngaymuacuoi'])),
      lastContactAt: parseOptionalIsoDate(extractExcelHeaderValue(row, ['lastcontactat', 'ngaylhcuoi'])),
      status: parseCustomerStatusFromExcel(extractExcelHeaderValue(row, ['status', 'trangthai', 'trangthaicskh'])),
      zaloNickType: parseCustomerZaloNickTypeFromExcel(extractExcelHeaderValue(row, ['zalonicktype', 'loainickzalo', 'zalonick'])),
    };
    return parsed;
  });

  return rows.filter((row) => Object.values(row).some((value) => value !== undefined && String(value).trim() !== ''));
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
  const normalizedRole = roleUpper === 'ADMIN' ? 'ADMIN' : roleUpper === 'STAFF' ? 'STAFF' : 'MANAGER';
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
  const [stageOptions, setStageOptions] = useState<string[]>(DEFAULT_STAGE_OPTIONS);
  const [sourceOptions, setSourceOptions] = useState<string[]>(DEFAULT_SOURCE_OPTIONS);
  const [customerTagOptions, setCustomerTagOptions] = useState<string[]>(DEFAULT_CUSTOMER_TAG_OPTIONS);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatusFilter>('ALL');
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
  const [isImportingCustomers, setIsImportingCustomers] = useState(false);
  const [customerImportSummary, setCustomerImportSummary] = useState<CustomerImportSummary | null>(null);
  const [createForm, setCreateForm] = useState<CreateCustomerFormState>({
    fullName: '',
    phone: '',
    email: '',
    customerStage: DEFAULT_STAGE_OPTIONS[0],
    source: DEFAULT_SOURCE_OPTIONS[0],
    segment: '',
    tags: []
  });

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
        query: { q: search, status: status !== 'ALL' ? status : undefined, limit: FETCH_LIMIT }
      });
      setCustomers(normalizeListPayload(payload) as Customer[]);
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
      const nextStages = stages.length > 0 ? stages : DEFAULT_STAGE_OPTIONS;
      const nextSources = sources.length > 0 ? sources : DEFAULT_SOURCE_OPTIONS;
      const nextCustomerTags = customerTags.length > 0 ? customerTags : DEFAULT_CUSTOMER_TAG_OPTIONS;
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
      setCustomerTagOptions(DEFAULT_CUSTOMER_TAG_OPTIONS);
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
      customerStage: stageOptions[0] ?? DEFAULT_STAGE_OPTIONS[0] ?? '',
      source: sourceOptions[0] ?? DEFAULT_SOURCE_OPTIONS[0] ?? '',
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

  const handleImportCustomerFile = async (file: File) => {
    if (!file) {
      return;
    }
    if (!actorIdentity.isAdmin) {
      setErrorMessage('Chỉ admin được import dữ liệu khách hàng bằng Excel.');
      return;
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      setErrorMessage('Chỉ hỗ trợ file Excel định dạng .xlsx hoặc .xls.');
      return;
    }

    setIsImportingCustomers(true);
    setCustomerImportSummary(null);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      const rows = await parseCustomerImportXlsx(file);
      if (rows.length === 0) {
        throw new Error('File Excel không có dữ liệu hợp lệ để import.');
      }

      const summary = await apiRequest<CustomerImportSummary>('/crm/customers/import', {
        method: 'POST',
        body: {
          fileName: file.name,
          rows,
        },
      });
      setCustomerImportSummary(summary);
      if (summary.skippedCount === 0) {
        setResultMessage(`Đã import thành công ${summary.importedCount}/${summary.totalRows} khách hàng.`);
      } else {
        setResultMessage(`Đã import ${summary.importedCount}/${summary.totalRows} khách hàng, bỏ qua ${summary.skippedCount} dòng lỗi.`);
      }
      await loadCustomers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể import dữ liệu khách hàng từ Excel.');
    } finally {
      setIsImportingCustomers(false);
    }
  };

  const handleDownloadCustomerTemplate = () => {
    downloadExcelTemplate(
      'customer-import-template.xlsx',
      'Customers',
      CUSTOMER_IMPORT_TEMPLATE_ROWS,
    );
  };

  useEffect(() => {
    const timer = setTimeout(loadCustomers, 300);
    return () => clearTimeout(timer);
  }, [search, status]);

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

  const columns: ColumnDefinition<Customer>[] = [
    { key: 'code', label: 'Mã KH' },
    { 
      key: 'fullName', 
      label: 'Khách hàng', 
      isLink: true,
      type: 'text'
    },
    { key: 'phone', label: 'Điện thoại', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { 
      key: 'customerStage', 
      label: 'Giai đoạn',
      type: 'select',
      options: customerStageColumnOptions
    },
    { 
      key: 'totalSpent', 
      label: 'Chi tiêu',
      render: (c) => toCurrency(c.totalSpent)
    },
    { 
      key: 'status', 
      label: 'Trạng thái',
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
      key: 'updatedAt', 
      label: 'Cập nhật',
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

  const bulkActions = useMemo<StandardTableBulkAction<Customer>[]>(() => {
    const actions: StandardTableBulkAction<Customer>[] = [];

    if (canUpdate) {
      CUSTOMER_STATUS_OPTIONS.forEach((statusValue, index) => {
        actions.push({
          key: `bulk-status-${statusValue.toLowerCase()}`,
          label: index === 0 ? `Set ${CUSTOMER_STATUS_LABELS[statusValue]}` : `Đổi: ${CUSTOMER_STATUS_LABELS[statusValue]}`,
          tone: index === 0 ? 'primary' : 'ghost',
          execute: async (selectedRows) =>
            runCustomerBulkAction(`Set trạng thái ${CUSTOMER_STATUS_LABELS[statusValue]}`, selectedRows, async (customer) => {
              await apiRequest(`/crm/customers/${customer.id}`, {
                method: 'PATCH',
                body: { status: statusValue },
              });
            }),
        });
      });
    }

    if (canDelete) {
      actions.push({
        key: 'bulk-soft-skip-customers',
        label: 'BỎ QUA/Xóa',
        tone: 'danger',
        confirmMessage: (rows) => `Đánh dấu BỎ QUA/Xóa cho ${rows.length} khách hàng đã chọn?`,
        execute: async (selectedRows) =>
          runCustomerBulkAction('Đánh dấu BỎ QUA/Xóa', selectedRows, async (customer) => {
            await apiRequest(`/crm/customers/${customer.id}`, {
              method: 'DELETE'
            });
          })
      });
    }

    return actions;
  }, [canUpdate, canDelete]);

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

      {actorIdentity.isAdmin && canCreate ? (
        <ExcelImportBlock<CustomerImportError>
          cardStyle={{ marginBottom: '1rem' }}
          title="Import khách hàng bằng Excel (.xlsx)"
          description="Import theo cơ chế upsert (ưu tiên phoneNormalized, fallback emailNormalized)."
          fileLabel="File import khách hàng"
          onDownloadTemplate={handleDownloadCustomerTemplate}
          onFileSelected={handleImportCustomerFile}
          isLoading={isImportingCustomers}
          loadingText="Đang parse và import khách hàng..."
          helperText="Các cột hỗ trợ: code, fullName, phone, email, customerStage, source, segment, tags, ownerStaffId, consentStatus, needsSummary, totalSpent, totalOrders, lastOrderAt, lastContactAt, status, zaloNickType."
          summary={customerImportSummary}
          formatError={(error) => `Dòng ${error.rowIndex}${error.identifier ? ` (${error.identifier})` : ''}: ${error.message}`}
        />
      ) : null}

      {/* Header Actions */}
      <div className="main-toolbar" style={{ borderBottom: 'none', marginBottom: '1rem', paddingBottom: '0' }}>
        <div className="toolbar-left">
          <div className="field" style={{ width: '160px' }}>
            <select 
              value={status}
              onChange={(e) => setStatus(e.target.value as CustomerStatusFilter)}
            >
              <option value="ALL">Tất cả trạng thái CSKH</option>
              {CUSTOMER_STATUS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {CUSTOMER_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-ghost">
            <Download size={16} /> Export
          </button>
          <button className="btn btn-ghost" onClick={handleDownloadCustomerTemplate}>
            <FileSpreadsheet size={16} /> Mẫu import
          </button>
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
        </div>
      </div>

      {/* Table Data */}
      <StandardDataTable
        data={customers}
        columns={columns}
        storageKey={CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY}
        isLoading={isLoading}
        onRowClick={(c) => setSelectedCustomer(c)}
        editableKeys={canUpdate ? ['fullName', 'phone', 'email', 'customerStage', 'status', 'zaloNickType'] : []}
        onSaveRow={handleSaveCustomer}
        enableRowSelection
        selectedRowIds={selectedRowIds}
        onSelectedRowIdsChange={setSelectedRowIds}
        bulkActions={bulkActions}
        showDefaultBulkUtilities
      />

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
                    {stageOptions.map((stage) => (
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
                    {sourceOptions.map((source) => (
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
