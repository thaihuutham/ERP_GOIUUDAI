'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '../lib/api-client';
import {
  buildCatalogProductImportTemplateRows,
  parseCatalogProductImportXlsx,
  type CatalogProductImportError,
  type CatalogProductImportSummary
} from '../lib/catalog-product-import';
import { downloadExcelTemplate } from '../lib/excel-template';
import { useAccessPolicy } from './access-policy-context';
import { ExcelImportBlock } from './ui/excel-import-block';
import { useUserRole } from './user-role-context';

function formatImportError(error: CatalogProductImportError) {
  return `Dòng ${error.rowIndex}${error.identifier ? ` (${error.identifier})` : ''}: ${error.message}`;
}

export function CatalogProductsImportBoard() {
  const { canModule } = useAccessPolicy();
  const { role } = useUserRole();

  const canView = canModule('catalog');
  const canImport = role === 'ADMIN';
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<CatalogProductImportSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  if (!canView) {
    return null;
  }

  const handleDownloadTemplate = () => {
    downloadExcelTemplate(
      'catalog-product-import-template.xlsx',
      'Products',
      buildCatalogProductImportTemplateRows()
    );
  };

  const handleImportFile = async (file: File) => {
    setIsImporting(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    setSummary(null);

    try {
      const rows = await parseCatalogProductImportXlsx(file);
      if (rows.length === 0) {
        throw new Error('File Excel không có dữ liệu hợp lệ để import sản phẩm.');
      }

      const payload = await apiRequest<CatalogProductImportSummary>('/catalog/products/import', {
        method: 'POST',
        body: {
          fileName: file.name,
          rows
        }
      });

      setSummary(payload);
      if (payload.skippedCount > 0) {
        setNoticeMessage(
          `Đã import ${payload.importedCount}/${payload.totalRows} dòng, lỗi ${payload.skippedCount} dòng.`
        );
      } else {
        setNoticeMessage(`Đã import thành công ${payload.importedCount}/${payload.totalRows} dòng.`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể import danh mục sản phẩm.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <article className="crm-board">
      {errorMessage ? (
        <div className="finance-alert finance-alert-danger" style={{ marginBottom: '1rem' }}>
          <strong>Lỗi:</strong> {errorMessage}
        </div>
      ) : null}

      {noticeMessage ? (
        <div className="finance-alert finance-alert-success" style={{ marginBottom: '1rem' }}>
          <strong>Thành công:</strong> {noticeMessage}
        </div>
      ) : null}

      <section className="module-card" style={{ display: 'grid', gap: '0.75rem' }}>
        <div className="main-toolbar" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
          <div className="toolbar-left">
            <h3 style={{ margin: 0 }}>Import danh mục sản phẩm</h3>
          </div>
          <div className="toolbar-right">
            <Link className="btn btn-ghost" href="/modules/catalog">
              <ArrowLeft size={16} /> Về Danh mục
            </Link>
          </div>
        </div>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          File import hỗ trợ chế độ upsert theo SKU: SKU trùng sẽ cập nhật, SKU mới sẽ tạo mới.
        </p>
      </section>

      <ExcelImportBlock<CatalogProductImportError>
        title="Import sản phẩm (.xlsx)"
        description="Frontend đọc file Excel và gửi JSON rows lên API catalog để xử lý upsert theo SKU."
        fileLabel="File danh mục sản phẩm"
        onDownloadTemplate={handleDownloadTemplate}
        onFileSelected={handleImportFile}
        canImport={canImport}
        deniedMessage="Chỉ admin được import danh mục sản phẩm."
        isLoading={isImporting}
        loadingText="Đang parse và import file..."
        summary={summary}
        formatError={formatImportError}
      />
    </article>
  );
}
