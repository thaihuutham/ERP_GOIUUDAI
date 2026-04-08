'use client';

import { ArrowLeft, Download, Play, Upload } from 'lucide-react';
import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import {
  buildCustomerImportTemplateRows,
  parseCustomerImportXlsx,
  type CustomerImportError,
  type CustomerImportPreviewSummary,
  type CustomerImportRow,
  type CustomerImportSummary,
} from '../lib/crm-customer-import';
import { downloadExcelTemplate } from '../lib/excel-template';
import { useAccessPolicy } from './access-policy-context';

type ImportApiSummary = CustomerImportSummary;
type PreviewApiSummary = CustomerImportPreviewSummary;
type CustomerTaxonomyPayload = {
  customerTaxonomy?: {
    stages?: string[];
    sources?: string[];
  };
  tagRegistry?: {
    customerTags?: string[];
  };
};

function formatImportError(error: CustomerImportError) {
  return `Dòng ${error.rowIndex}${error.identifier ? ` (${error.identifier})` : ''}: ${error.message}`;
}

export function CrmCustomersImportBoard() {
  const { canModule } = useAccessPolicy();

  const canView = canModule('crm');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<CustomerImportRow[] | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewSummary, setPreviewSummary] = useState<PreviewApiSummary | null>(null);
  const [importSummary, setImportSummary] = useState<ImportApiSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedRowCount = parsedRows?.length ?? 0;
  const hasRows = selectedRowCount > 0;
  const isBusy = isReadingFile || isPreviewing || isImporting;

  const summaryTag = useMemo(() => {
    if (!selectedFile || !hasRows) {
      return null;
    }
    return `Đã nạp file ${selectedFile.name} (${selectedRowCount} dòng).`;
  }, [hasRows, selectedFile, selectedRowCount]);

  const handleDownloadTemplate = async () => {
    let stages: string[] = [];
    let sources: string[] = [];
    let customerTags: string[] = [];
    try {
      const payload = await apiRequest<CustomerTaxonomyPayload>('/crm/taxonomy');
      const stageList = payload.customerTaxonomy?.stages;
      const sourceList = payload.customerTaxonomy?.sources;
      const customerTagList = payload.tagRegistry?.customerTags;
      stages = Array.isArray(stageList)
        ? stageList.map((item) => String(item ?? '').trim()).filter(Boolean)
        : [];
      sources = Array.isArray(sourceList)
        ? sourceList.map((item) => String(item ?? '').trim()).filter(Boolean)
        : [];
      customerTags = Array.isArray(customerTagList)
        ? customerTagList.map((item) => String(item ?? '').trim()).filter(Boolean)
        : [];
    } catch {
      // tải mẫu vẫn cho phép fallback rỗng nếu taxonomy API đang gián đoạn
    }
    downloadExcelTemplate('customer-import-template.xlsx', 'Customers', buildCustomerImportTemplateRows(stages, sources, customerTags));
  };

  const parseAndCacheFile = async (file: File) => {
    const rows = await parseCustomerImportXlsx(file);
    if (rows.length === 0) {
      throw new Error('File Excel không có dữ liệu hợp lệ để import.');
    }

    setSelectedFile(file);
    setParsedRows(rows);
    return rows;
  };

  const ensureImportRows = async () => {
    if (parsedRows && parsedRows.length > 0) {
      return parsedRows;
    }

    const fileFromInput = fileInputRef.current?.files?.[0] ?? null;
    const file = selectedFile ?? fileFromInput;
    if (!file) {
      setErrorMessage('Vui lòng chọn file Excel hợp lệ trước khi thao tác.');
      return null;
    }

    setIsReadingFile(true);
    try {
      const rows = await parseAndCacheFile(file);
      setResultMessage('Đã đọc file thành công. Có thể chạy mô phỏng trước khi import.');
      return rows;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể đọc file Excel khách hàng.');
      return null;
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!file) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
      setErrorMessage('Chỉ hỗ trợ file Excel định dạng .xlsx hoặc .xls.');
      return;
    }

    setIsReadingFile(true);
    setErrorMessage(null);
    setResultMessage(null);
    setPreviewSummary(null);
    setImportSummary(null);

    try {
      await parseAndCacheFile(file);
      setResultMessage(`Đã đọc file thành công. Có thể chạy mô phỏng trước khi import.`);
    } catch (error) {
      setSelectedFile(null);
      setParsedRows(null);
      setErrorMessage(error instanceof Error ? error.message : 'Không thể đọc file Excel khách hàng.');
    } finally {
      setIsReadingFile(false);
    }
  };

  const runPreview = async () => {
    const rows = await ensureImportRows();
    if (!rows || rows.length === 0) {
      return;
    }

    setIsPreviewing(true);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      const summary = await apiRequest<PreviewApiSummary>('/crm/customers/import/preview', {
        method: 'POST',
        body: {
          fileName: selectedFile?.name,
          rows,
        },
      });
      setPreviewSummary(summary);
      setResultMessage(
        `Mô phỏng xong: hợp lệ ${summary.validRows}/${summary.totalRows}, tạo mới ${summary.wouldCreateCount}, cập nhật ${summary.wouldUpdateCount}, lỗi ${summary.skippedCount}.`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể chạy mô phỏng import khách hàng.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const runImport = async () => {
    const rows = await ensureImportRows();
    if (!rows || rows.length === 0) {
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      const summary = await apiRequest<ImportApiSummary>('/crm/customers/import', {
        method: 'POST',
        body: {
          fileName: selectedFile?.name,
          rows,
        },
      });
      setImportSummary(summary);
      setResultMessage(
        summary.skippedCount === 0
          ? `Đã import thành công ${summary.importedCount}/${summary.totalRows} dòng.`
          : `Đã import ${summary.importedCount}/${summary.totalRows} dòng, lỗi ${summary.skippedCount} dòng.`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể import dữ liệu khách hàng.');
    } finally {
      setIsImporting(false);
    }
  };

  if (!canView) {
    return null;
  }

  return (
    <div className="crm-board">
      {errorMessage ? (
        <div className="finance-alert finance-alert-danger" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>
            <strong>Lỗi:</strong> {errorMessage}
          </span>
          <button onClick={() => setErrorMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            &times;
          </button>
        </div>
      ) : null}

      {resultMessage ? (
        <div className="finance-alert finance-alert-success" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>
            <strong>Thành công:</strong> {resultMessage}
          </span>
          <button onClick={() => setResultMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            &times;
          </button>
        </div>
      ) : null}

      <section className="module-card" style={{ display: 'grid', gap: '1rem' }}>
        <div className="main-toolbar" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
          <div className="toolbar-left">
            <h3 style={{ margin: 0 }}>Import khách hàng CRM bằng Excel</h3>
          </div>
          <div className="toolbar-right">
            <a className="btn btn-ghost" href="/modules/crm">
              <ArrowLeft size={16} /> Về CRM
            </a>
          </div>
        </div>

        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Quy trình: tải file mẫu, upload file, chạy mô phỏng (không ghi DB), sau đó import thật.
        </p>

        <div className="field" style={{ maxWidth: '560px' }}>
          <label>File import khách hàng</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => void handleFileChange(event)}
            disabled={isBusy}
          />
          {summaryTag ? (
            <p style={{ marginTop: '0.5rem', marginBottom: 0, color: 'var(--muted)' }}>{summaryTag}</p>
          ) : null}
          <p style={{ marginTop: '0.5rem', marginBottom: 0, color: 'var(--muted)' }}>
            Cột hỗ trợ: code, fullName, phone, email, customerStage, source, segment, tags, ownerStaffId, consentStatus, needsSummary, totalSpent, totalOrders, lastOrderAt, lastContactAt, status, zaloNickType.
          </p>
        </div>

        <div className="action-buttons">
          <button type="button" className="btn btn-ghost" onClick={() => void handleDownloadTemplate()} disabled={isBusy}>
            <Download size={16} /> Tải file mẫu
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void runPreview()} disabled={isBusy}>
            <Play size={16} /> {isPreviewing ? 'Đang mô phỏng...' : 'Chạy mô phỏng'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void runImport()} disabled={isBusy}>
            <Upload size={16} /> {isImporting ? 'Đang import...' : 'Import thật'}
          </button>
        </div>
      </section>

      {previewSummary ? (
        <section className="module-card" style={{ marginTop: '1rem' }}>
          <h3>Kết quả mô phỏng</h3>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <div><strong>Tổng dòng:</strong> {previewSummary.totalRows}</div>
            <div><strong>Hợp lệ:</strong> {previewSummary.validRows}</div>
            <div><strong>Sẽ tạo mới:</strong> {previewSummary.wouldCreateCount}</div>
            <div><strong>Sẽ cập nhật:</strong> {previewSummary.wouldUpdateCount}</div>
            <div><strong>Lỗi/Bỏ qua:</strong> {previewSummary.skippedCount}</div>
          </div>
          {previewSummary.errors.length > 0 ? (
            <div style={{ marginTop: '0.85rem' }}>
              <strong>Chi tiết lỗi:</strong>
              <ul style={{ marginTop: '0.35rem', paddingLeft: '1.15rem' }}>
                {previewSummary.errors.slice(0, 30).map((error) => (
                  <li key={`preview-error-${error.rowIndex}-${error.identifier ?? ''}-${error.message}`}>
                    {formatImportError(error)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {importSummary ? (
        <section className="module-card" style={{ marginTop: '1rem' }}>
          <h3>Kết quả import</h3>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <div><strong>Tổng dòng:</strong> {importSummary.totalRows}</div>
            <div><strong>Import thành công:</strong> {importSummary.importedCount}</div>
            <div><strong>Lỗi/Bỏ qua:</strong> {importSummary.skippedCount}</div>
          </div>
          {importSummary.errors.length > 0 ? (
            <div style={{ marginTop: '0.85rem' }}>
              <strong>Chi tiết lỗi:</strong>
              <ul style={{ marginTop: '0.35rem', paddingLeft: '1.15rem' }}>
                {importSummary.errors.slice(0, 30).map((error) => (
                  <li key={`import-error-${error.rowIndex}-${error.identifier ?? ''}-${error.message}`}>
                    {formatImportError(error)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
