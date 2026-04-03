'use client';

import { useMemo, useState } from 'react';
import type { BulkRowId } from '../../lib/bulk-actions';
import { useAssistantShell } from './assistant-shell';
import { StandardDataTable, type ColumnDefinition } from '../ui/standard-data-table';

type AccessModuleRow = {
  id: string;
  moduleKey: string;
  actions: string;
};

export function AssistantAccessBoard() {
  const { access, accessLoading, accessError, reloadAccess } = useAssistantShell();
  const [selectedRowIds, setSelectedRowIds] = useState<BulkRowId[]>([]);

  const moduleRows = useMemo(() => {
    if (!access?.moduleActions) {
      return [];
    }
    return Object.entries(access.moduleActions)
      .map(([moduleKey, actions]) => ({
        id: moduleKey,
        moduleKey,
        actions: Array.isArray(actions) ? actions.join(', ') : '--'
      }))
      .sort((a, b) => a.moduleKey.localeCompare(b.moduleKey));
  }, [access?.moduleActions]);

  const moduleColumns = useMemo<ColumnDefinition<AccessModuleRow>[]>(
    () => [
      {
        key: 'moduleKey',
        label: 'Phân hệ'
      },
      {
        key: 'actions',
        label: 'Quyền thao tác'
      }
    ],
    []
  );

  if (accessLoading && !access) {
    return (
      <section className="feature-panel">
        <h2 style={{ fontSize: '1.06rem' }}>Ảnh chụp phạm vi truy cập</h2>
        <p className="muted">Đang tải dữ liệu từ `/assistant/access/me`...</p>
      </section>
    );
  }

  if (accessError && !access) {
    return (
      <section className="feature-panel">
        <h2 style={{ fontSize: '1.06rem' }}>Ảnh chụp phạm vi truy cập</h2>
        <p className="banner banner-error">{accessError}</p>
        <div>
          <button type="button" className="btn btn-ghost" onClick={() => void reloadAccess()}>
            Thử lại
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="feature-panel" style={{ display: 'grid', gap: '0.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.06rem', marginBottom: '0.2rem' }}>Ảnh chụp phạm vi truy cập</h2>
          <p className="muted">Nguồn dữ liệu: `GET /assistant/access/me`</p>
        </div>
        <div>
          <button type="button" className="btn btn-ghost" onClick={() => void reloadAccess()} disabled={accessLoading}>
            Làm mới
          </button>
        </div>
      </div>

      <dl className="kv-grid">
        <div className="kv-item">
          <dt>Người dùng</dt>
          <dd>{access?.actor.userId ?? '--'}</dd>
        </div>
        <div className="kv-item">
          <dt>Email</dt>
          <dd>{access?.actor.email ?? '--'}</dd>
        </div>
        <div className="kv-item">
          <dt>Vai trò</dt>
          <dd>{access?.actor.role ?? '--'}</dd>
        </div>
        <div className="kv-item">
          <dt>Phạm vi</dt>
          <dd>{access?.scope.type ?? '--'}</dd>
        </div>
        <div className="kv-item">
          <dt>Mã tham chiếu phạm vi</dt>
          <dd>{access?.scope.scopeRefIds?.join(', ') || '--'}</dd>
        </div>
        <div className="kv-item">
          <dt>Phân hệ được phép</dt>
          <dd>{access?.allowedModules?.join(', ') || '--'}</dd>
        </div>
      </dl>

      <StandardDataTable<AccessModuleRow>
        data={moduleRows}
        columns={moduleColumns}
        storageKey="erp-retail.assistant-access-module-actions.v1"
        enableRowSelection
        selectedRowIds={selectedRowIds}
        onSelectedRowIdsChange={setSelectedRowIds}
        showDefaultBulkUtilities
      />
    </section>
  );
}
