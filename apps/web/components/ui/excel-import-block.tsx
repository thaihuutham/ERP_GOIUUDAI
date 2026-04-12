import { ChangeEvent, CSSProperties, useRef, useState } from 'react';

type ExcelImportErrorBase = {
  rowIndex: number;
  message: string;
};

export type ExcelImportSummary<TError extends ExcelImportErrorBase = ExcelImportErrorBase> = {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errors: TError[];
};

type ExcelImportBlockProps<TError extends ExcelImportErrorBase = ExcelImportErrorBase> = {
  title: string;
  description?: string;
  fileLabel: string;
  onDownloadTemplate: () => void;
  onFileSelected: (file: File) => void | Promise<void>;
  canImport?: boolean;
  deniedMessage?: string;
  helperText?: string;
  summary?: ExcelImportSummary<TError> | null;
  isLoading?: boolean;
  loadingText?: string;
  accept?: string;
  templateButtonLabel?: string;
  importButtonLabel?: string;
  autoImportOnSelect?: boolean;
  maxErrorsToShow?: number;
  formatError?: (error: TError) => string;
  cardStyle?: CSSProperties;
};

export function ExcelImportBlock<TError extends ExcelImportErrorBase = ExcelImportErrorBase>({
  title,
  description,
  fileLabel,
  onDownloadTemplate,
  onFileSelected,
  canImport = true,
  deniedMessage,
  helperText,
  summary,
  isLoading = false,
  loadingText = 'Đang parse và import file...',
  accept = '.xlsx,.xls',
  templateButtonLabel = 'Tải file mẫu',
  importButtonLabel = 'Import',
  autoImportOnSelect = true,
  maxErrorsToShow = 12,
  formatError,
  cardStyle
}: ExcelImportBlockProps<TError>) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (autoImportOnSelect) {
      event.target.value = '';
      setSelectedFile(null);
      await onFileSelected(file);
      return;
    }
    setSelectedFile(file);
  };

  const handleImportSelectedFile = async () => {
    if (!selectedFile) {
      return;
    }
    await onFileSelected(selectedFile);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <section className="module-card" style={cardStyle}>
      <h3>{title}</h3>
      {description ? (
        <p style={{ color: 'var(--muted)', marginBottom: '0.9rem' }}>
          {description}
        </p>
      ) : null}

      {canImport ? (
        <div className="field" style={{ maxWidth: '420px' }}>
          <label>{fileLabel}</label>
          <div className="action-buttons" style={{ marginBottom: '0.45rem' }}>
            <button type="button" className="btn btn-ghost" onClick={onDownloadTemplate}>
              {templateButtonLabel}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={(event) => void handleFileChange(event)}
            disabled={isLoading}
          />
          {!autoImportOnSelect ? (
            <div className="action-buttons" style={{ marginTop: '0.55rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleImportSelectedFile()}
                disabled={isLoading || !selectedFile}
              >
                {isLoading ? loadingText : importButtonLabel}
              </button>
            </div>
          ) : null}
        </div>
      ) : deniedMessage ? (
        <p style={{ color: 'var(--muted)' }}>{deniedMessage}</p>
      ) : null}

      {helperText ? (
        <p style={{ color: 'var(--muted)', marginTop: '0.75rem', marginBottom: 0 }}>
          {helperText}
        </p>
      ) : null}

      {isLoading ? <p style={{ marginTop: '0.75rem' }}>{loadingText}</p> : null}

      {summary ? (
        <div style={{ marginTop: '0.9rem', display: 'grid', gap: '0.35rem' }}>
          <div>
            <strong>Tổng dòng:</strong> {summary.totalRows}
          </div>
          <div>
            <strong>Import thành công:</strong> {summary.importedCount}
          </div>
          <div>
            <strong>Bỏ qua/Lỗi:</strong> {summary.skippedCount}
          </div>
          {summary.errors.length > 0 ? (
            <div style={{ marginTop: '0.35rem' }}>
              <strong>Chi tiết lỗi:</strong>
              <ul style={{ marginTop: '0.35rem', paddingLeft: '1.1rem' }}>
                {summary.errors.slice(0, maxErrorsToShow).map((error) => {
                  const displayMessage = formatError ? formatError(error) : `Dòng ${error.rowIndex}: ${error.message}`;
                  return (
                    <li key={`excel-import-error-${error.rowIndex}-${displayMessage}`}>{displayMessage}</li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
