import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import path from 'path';
import { Workbook } from 'exceljs';
import { ReportOutputFormat } from './dto/reports.dto';

type ReportExportInput = {
  tenantId: string;
  reportId: string;
  runId: string;
  reportName: string;
  outputFormat: ReportOutputFormat;
  rows: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
  generatedAt: Date;
};

type ReportExportOutput = {
  outputPath: string;
  outputMimeType: string;
  outputSizeBytes: number;
  downloadFileName: string;
};

const SUPPORTED_FORMATS: ReportOutputFormat[] = ['JSON', 'CSV', 'XLSX'];

const MIME_BY_FORMAT: Record<ReportOutputFormat, string> = {
  JSON: 'application/json; charset=utf-8',
  CSV: 'text/csv; charset=utf-8',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PDF: 'application/pdf'
};

const EXT_BY_FORMAT: Record<ReportOutputFormat, string> = {
  JSON: 'json',
  CSV: 'csv',
  XLSX: 'xlsx',
  PDF: 'pdf'
};

@Injectable()
export class ReportExportService {
  constructor(private readonly config: ConfigService) {}

  isFormatSupported(format: ReportOutputFormat) {
    return SUPPORTED_FORMATS.includes(format);
  }

  getUnsupportedReason(format: ReportOutputFormat) {
    if (format === 'PDF') {
      return 'Định dạng PDF chưa được hỗ trợ ở phiên bản hiện tại. Vui lòng dùng CSV hoặc XLSX.';
    }
    return `Định dạng ${format} chưa được hỗ trợ.`;
  }

  async writeReportFile(input: ReportExportInput): Promise<ReportExportOutput> {
    const exportRoot = await this.ensureExportRoot();
    const outputDir = path.join(
      exportRoot,
      this.safeSegment(input.tenantId),
      this.safeSegment(input.reportId)
    );

    await fs.mkdir(outputDir, { recursive: true });

    const ext = EXT_BY_FORMAT[input.outputFormat];
    const timestamp = this.fileTimestamp(input.generatedAt);
    const fileName = `${this.safeSegment(input.runId)}-${timestamp}.${ext}`;
    const absolutePath = path.join(outputDir, fileName);

    if (input.outputFormat === 'JSON') {
      const payload = {
        report: {
          reportId: input.reportId,
          reportName: input.reportName,
          generatedAt: input.generatedAt.toISOString()
        },
        summary: input.summary,
        rows: input.rows
      };
      await fs.writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    } else if (input.outputFormat === 'CSV') {
      const csvContent = this.toCsvContent(input.rows);
      await fs.writeFile(absolutePath, csvContent, 'utf8');
    } else if (input.outputFormat === 'XLSX') {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet('Report');
      const normalizedRows = input.rows.map((row) => this.flattenRow(row));
      const headers = this.collectHeaders(normalizedRows);

      worksheet.columns = headers.map((header) => ({
        header,
        key: header,
        width: Math.min(Math.max(header.length + 4, 14), 42)
      }));

      normalizedRows.forEach((row) => {
        const payload: Record<string, string | number | boolean | null> = {};
        headers.forEach((header) => {
          payload[header] = this.normalizeCellValue(row[header]);
        });
        worksheet.addRow(payload);
      });

      worksheet.getRow(1).font = { bold: true };
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      await workbook.xlsx.writeFile(absolutePath);
    }

    const stat = await fs.stat(absolutePath);
    const relativePath = path.relative(exportRoot, absolutePath);
    const safeReportName = this.safeSegment(input.reportName) || 'report';

    return {
      outputPath: relativePath,
      outputMimeType: MIME_BY_FORMAT[input.outputFormat],
      outputSizeBytes: stat.size,
      downloadFileName: `${safeReportName}-${timestamp}.${ext}`
    };
  }

  async resolveOutputFile(outputPath: string) {
    const exportRoot = await this.ensureExportRoot();
    const absolutePath = path.resolve(exportRoot, outputPath);
    const rootWithSep = exportRoot.endsWith(path.sep) ? exportRoot : `${exportRoot}${path.sep}`;

    if (absolutePath !== exportRoot && !absolutePath.startsWith(rootWithSep)) {
      throw new Error('Đường dẫn file export không hợp lệ.');
    }

    const stat = await fs.stat(absolutePath);
    return {
      absolutePath,
      size: stat.size,
      stream: createReadStream(absolutePath)
    };
  }

  private async ensureExportRoot() {
    const configured = String(this.config.get<string>('REPORT_EXPORT_DIR') ?? '').trim();
    const root = configured
      ? path.resolve(configured)
      : path.resolve(process.cwd(), 'var', 'reports');

    await fs.mkdir(root, { recursive: true });
    return root;
  }

  private safeSegment(value: string) {
    return String(value ?? '')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 96) || 'unknown';
  }

  private fileTimestamp(value: Date) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    const hh = String(value.getHours()).padStart(2, '0');
    const mi = String(value.getMinutes()).padStart(2, '0');
    const ss = String(value.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
  }

  private toCsvContent(rows: Array<Record<string, unknown>>) {
    const normalizedRows = rows.map((row) => this.flattenRow(row));
    const headers = this.collectHeaders(normalizedRows);

    const csvLines = [
      headers.map((header) => this.escapeCsv(header)).join(','),
      ...normalizedRows.map((row) =>
        headers
          .map((header) => this.escapeCsv(this.toCsvCell(row[header])))
          .join(',')
      )
    ];

    return `\uFEFF${csvLines.join('\n')}\n`;
  }

  private collectHeaders(rows: Array<Record<string, unknown>>) {
    const headers: string[] = [];
    const seen = new Set<string>();
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!seen.has(key)) {
          seen.add(key);
          headers.push(key);
        }
      });
    });
    return headers.length > 0 ? headers : ['id'];
  }

  private escapeCsv(value: string) {
    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private toCsvCell(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.toCsvCell(item)).join(' | ');
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private normalizeCellValue(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.toCsvCell(item)).join(', ');
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private flattenRow(row: Record<string, unknown>) {
    const output: Record<string, unknown> = {};

    const walk = (value: unknown, prefix: string, depth: number) => {
      if (depth > 2) {
        output[prefix] = this.toCsvCell(value);
        return;
      }

      if (Array.isArray(value)) {
        output[prefix] = value.map((item) => this.toCsvCell(item)).join(' | ');
        return;
      }

      if (value && typeof value === 'object' && !(value instanceof Date)) {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) {
          output[prefix] = '';
          return;
        }
        entries.forEach(([key, nested]) => {
          const nextKey = prefix ? `${prefix}.${key}` : key;
          walk(nested, nextKey, depth + 1);
        });
        return;
      }

      output[prefix] = value;
    };

    Object.entries(row).forEach(([key, value]) => {
      walk(value, key, 0);
    });

    return output;
  }
}
