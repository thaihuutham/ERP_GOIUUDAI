import * as XLSX from 'xlsx';

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

export type CustomerZaloNickType =
  | 'CHUA_KIEM_TRA'
  | 'CHUA_CO_NICK_ZALO'
  | 'CHAN_NGUOI_LA'
  | 'GUI_DUOC_TIN_NHAN';

export type CustomerImportError = {
  rowIndex: number;
  identifier?: string;
  message: string;
};

export type CustomerImportSummary = {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errors: CustomerImportError[];
};

export type CustomerImportPreviewSummary = {
  totalRows: number;
  validRows: number;
  wouldCreateCount: number;
  wouldUpdateCount: number;
  skippedCount: number;
  errors: CustomerImportError[];
};

export type CustomerImportRow = {
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

export const CUSTOMER_IMPORT_TEMPLATE_ROWS: Array<Record<string, string | number>> = [
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
  if ([
    'MOI_CHUA_TU_VAN',
    'DANG_SUY_NGHI',
    'DONG_Y_CHUYEN_THANH_KH',
    'KH_TU_CHOI',
    'KH_DA_MUA_BEN_KHAC',
    'NGUOI_NHA_LAM_THUE_BAO',
    'KHONG_NGHE_MAY_LAN_1',
    'KHONG_NGHE_MAY_LAN_2',
    'SAI_SO_KHONG_TON_TAI_BO_QUA_XOA',
  ].includes(upper)) {
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
  if (['CHUA_KIEM_TRA', 'CHUA_CO_NICK_ZALO', 'CHAN_NGUOI_LA', 'GUI_DUOC_TIN_NHAN'].includes(upper)) {
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

export async function parseCustomerImportXlsx(file: File): Promise<CustomerImportRow[]> {
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
