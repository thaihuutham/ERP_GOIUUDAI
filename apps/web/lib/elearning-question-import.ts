import * as XLSX from 'xlsx';

export type QuestionImportError = {
  rowIndex: number;
  message: string;
};

export type QuestionImportSummary = {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errors: QuestionImportError[];
};

export type QuestionImportRow = {
  questionText?: string;
  tags?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  correctAnswers?: string;
  explanation?: string;
  points?: number;
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

function parseOptionalPoints(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined;
  }
  return numeric;
}

export function buildQuestionImportTemplateRows(): Array<Record<string, string | number>> {
  return [
    {
      'Câu hỏi': 'Tổng doanh thu bao gồm những gì?',
      'Phân loại': 'SALES',
      'Đáp án A': 'Doanh thu thuần + thuế',
      'Đáp án B': 'Doanh thu bán hàng + dịch vụ',
      'Đáp án C': 'Chỉ doanh thu bán hàng',
      'Đáp án D': 'Doanh thu sau chiết khấu',
      'Đáp án đúng': 'B',
      'Giải thích': 'Tổng doanh thu bao gồm cả bán hàng và dịch vụ.',
      'Điểm': 1
    },
    {
      'Câu hỏi': 'KPI nào đo lường hiệu suất nhân viên?',
      'Phân loại': 'HR, GENERAL',
      'Đáp án A': 'Revenue per employee',
      'Đáp án B': 'Customer satisfaction',
      'Đáp án C': 'Output per hour',
      'Đáp án D': 'Tất cả các đáp án trên',
      'Đáp án đúng': 'D',
      'Giải thích': 'KPI hiệu suất nhân viên gồm nhiều chỉ số.',
      'Điểm': 1
    }
  ];
}

export async function parseQuestionImportXlsx(file: File): Promise<QuestionImportRow[]> {
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
    const parsed: QuestionImportRow = {
      questionText: toOptionalString(
        extractExcelHeaderValue(row, ['cauhoi', 'questiontext', 'noidung', 'question', 'noidungcauhoi'])
      ),
      tags: toOptionalString(
        extractExcelHeaderValue(row, ['phanloai', 'tags', 'tag', 'nhom', 'category', 'loai'])
      ),
      optionA: toOptionalString(
        extractExcelHeaderValue(row, ['dapana', 'optiona', 'a', 'luachona'])
      ),
      optionB: toOptionalString(
        extractExcelHeaderValue(row, ['dapanb', 'optionb', 'b', 'luachonb'])
      ),
      optionC: toOptionalString(
        extractExcelHeaderValue(row, ['dapanc', 'optionc', 'c', 'luachonc'])
      ),
      optionD: toOptionalString(
        extractExcelHeaderValue(row, ['dapand', 'optiond', 'd', 'luachond'])
      ),
      correctAnswers: toOptionalString(
        extractExcelHeaderValue(row, ['dapandung', 'correctanswers', 'correct', 'dapan', 'dung'])
      ),
      explanation: toOptionalString(
        extractExcelHeaderValue(row, ['giaithich', 'explanation', 'note', 'ghichu'])
      ),
      points: parseOptionalPoints(
        extractExcelHeaderValue(row, ['diem', 'points', 'score', 'sodiêm'])
      )
    };
    return parsed;
  });

  return rows.filter((row) => Object.values(row).some((value) => value !== undefined && String(value).trim() !== ''));
}
