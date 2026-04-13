'use client';

import Link from 'next/link';
import { Upload } from 'lucide-react';
import { DomainModuleBoard } from './domain-module-board';

export function CatalogOperationsBoard() {
  return (
    <div className="crm-board">
      <section className="module-card" style={{ display: 'grid', gap: '0.75rem' }}>
        <div className="main-toolbar" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
          <div className="toolbar-left">
            <h3 style={{ margin: 0 }}>Tác vụ nhanh danh mục</h3>
          </div>
          <div className="toolbar-right">
            <Link className="btn btn-ghost" href="/modules/catalog/products/import">
              <Upload size={16} /> Import Excel sản phẩm
            </Link>
          </div>
        </div>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Import danh mục theo SKU: SKU trùng sẽ cập nhật, SKU mới sẽ tạo thêm.
        </p>
      </section>
      <DomainModuleBoard moduleKey="catalog" />
    </div>
  );
}
