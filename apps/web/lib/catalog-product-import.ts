import * as XLSX from 'xlsx';

export type CatalogProductImportError = {
  rowIndex: number;
  identifier?: string;
  message: string;
};

export type CatalogProductImportSummary = {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errors: CatalogProductImportError[];
};

export type CatalogProductImportRow = {
  sku?: string;
  name?: string;
  productType?: 'PRODUCT' | 'SERVICE';
  categoryPath?: string;
  pricePolicyCode?: string;
  unitPrice?: number;
  status?: string;
};

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

function toOptionalString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function parseOptionalUnitPrice(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined;
  }
  return numeric;
}

function parseOptionalProductType(value: unknown): CatalogProductImportRow['productType'] {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'PRODUCT' || normalized === 'SERVICE') {
    return normalized;
  }
  if (normalized === 'HANG_HOA' || normalized === 'HANGHOA') {
    return 'PRODUCT';
  }
  if (normalized === 'DICH_VU' || normalized === 'DICHVU') {
    return 'SERVICE';
  }
  return undefined;
}

function parseOptionalStatus(value: unknown) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized || undefined;
}

export function buildCatalogProductImportTemplateRows(): Array<Record<string, string | number>> {
  return [
    {
      sku: 'SKU-001',
      name: 'Laptop Pro 14',
      productType: 'PRODUCT',
      categoryPath: 'laptop/business',
      pricePolicyCode: 'RET-STD',
      unitPrice: 24990000,
      status: 'ACTIVE'
    },
    {
      sku: 'SKU-SVC-001',
      name: 'Gói bảo trì 12 tháng',
      productType: 'SERVICE',
      categoryPath: 'service/warranty',
      pricePolicyCode: 'PROMO',
      unitPrice: 1990000,
      status: 'ACTIVE'
    }
  ];
}

export async function parseCatalogProductImportXlsx(file: File): Promise<CatalogProductImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return [];
  }
  const sheet = workbook.Sheets[firstSheet];
  const parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: true,
    defval: null
  });

  const rows = parsedRows.map((row) => {
    const parsed: CatalogProductImportRow = {
      sku: toOptionalString(extractExcelHeaderValue(row, ['sku', 'masanpham', 'productsku', 'mahang'])),
      name: toOptionalString(extractExcelHeaderValue(row, ['name', 'tensanpham', 'productname'])),
      productType: parseOptionalProductType(
        extractExcelHeaderValue(row, ['producttype', 'loaisanpham', 'type'])
      ),
      categoryPath: toOptionalString(
        extractExcelHeaderValue(row, ['categorypath', 'danhmuc', 'nhomsanpham', 'category'])
      ),
      pricePolicyCode: toOptionalString(
        extractExcelHeaderValue(row, ['pricepolicycode', 'chinhsachgia', 'policycode'])
      ),
      unitPrice: parseOptionalUnitPrice(extractExcelHeaderValue(row, ['unitprice', 'dongia', 'gia'])),
      status: parseOptionalStatus(extractExcelHeaderValue(row, ['status', 'trangthai']))
    };
    return parsed;
  });

  return rows.filter((row) => Object.values(row).some((value) => value !== undefined && String(value).trim() !== ''));
}
