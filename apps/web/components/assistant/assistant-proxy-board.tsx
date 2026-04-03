'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { assistantApi, type AssistantProxyResponse, type AssistantProxySource } from '../../lib/assistant-api';
import type { BulkRowId } from '../../lib/bulk-actions';
import { StandardDataTable, type ColumnDefinition } from '../ui/standard-data-table';

type ProxyRow = {
  id: string;
  [key: string]: unknown;
};

const SOURCE_OPTIONS: Array<{ value: AssistantProxySource; label: string }> = [
  { value: 'sales', label: 'Bán hàng' },
  { value: 'cskh', label: 'CSKH' },
  { value: 'hr', label: 'Nhân sự' },
  { value: 'workflow', label: 'Quy trình' },
  { value: 'finance', label: 'Tài chính' }
];

function stringifyCell(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function collectionEntries(snapshot: Record<string, unknown>) {
  return Object.entries(snapshot)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => ({
      key,
      rows: value as Record<string, unknown>[]
    }));
}

export function AssistantProxyBoard() {
  const [source, setSource] = useState<AssistantProxySource>('sales');
  const [keyword, setKeyword] = useState('');
  const [limit, setLimit] = useState(50);

  const [response, setResponse] = useState<AssistantProxyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCollection, setSelectedCollection] = useState('');
  const [selectedRowIds, setSelectedRowIds] = useState<BulkRowId[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await assistantApi.getProxy(source, {
        q: keyword.trim() || undefined,
        limit
      });
      setResponse(payload);
      const collections = collectionEntries(payload.snapshot ?? {});
      setSelectedCollection((prev) => {
        if (prev && collections.some((item) => item.key === prev)) {
          return prev;
        }
        return collections[0]?.key ?? '';
      });
    } catch (loadError) {
      setResponse(null);
      setError(loadError instanceof Error ? loadError.message : 'Không thể tải proxy snapshot.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [source]);

  const collections = useMemo(() => collectionEntries(response?.snapshot ?? {}), [response?.snapshot]);
  const selectedRowsRaw = useMemo(
    () => collections.find((item) => item.key === selectedCollection)?.rows ?? [],
    [collections, selectedCollection]
  );

  const selectedRows = useMemo<ProxyRow[]>(
    () =>
      selectedRowsRaw.map((row, index) => ({
        id: String(row.id ?? `${selectedCollection}_${index + 1}`),
        ...row
      })),
    [selectedCollection, selectedRowsRaw]
  );

  const selectedColumns = useMemo<ColumnDefinition<ProxyRow>[]>(() => {
    const sample = selectedRows[0];
    if (!sample) {
      return [
        { key: 'id', label: 'ID', render: (row) => row.id, isLink: true },
        { key: 'placeholder', label: 'Dữ liệu', render: () => '--' }
      ];
    }

    const keys = Object.keys(sample).filter((key) => key !== 'id');
    const pickedKeys = keys.slice(0, 8);

    return [
      { key: 'id', label: 'ID', render: (row) => row.id, isLink: true },
      ...pickedKeys.map((key) => ({
        key,
        label: key,
        render: (row: ProxyRow) => stringifyCell(row[key])
      }))
    ];
  }, [selectedRows]);

  const metrics = useMemo(() => {
    const raw = response?.snapshot?.metrics;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return [];
    }
    return Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: stringifyCell(value)
    }));
  }, [response?.snapshot]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void load();
  };

  return (
    <section className="feature-panel" style={{ display: 'grid', gap: '0.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.06rem', marginBottom: '0.2rem' }}>Tổng hợp dữ liệu đa nguồn</h2>
          <p className="muted">Khai thác nhanh dữ liệu từ các phân hệ được cấp quyền.</p>
        </div>
        <div>
          <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
            Làm mới
          </button>
        </div>
      </div>

      <form onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '0.55rem' }}>
        <label>
          Nguồn
          <select value={source} onChange={(event) => setSource(event.target.value as AssistantProxySource)}>
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Từ khóa
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="orderNo / customer / invoice..."
          />
        </label>

        <label>
          Giới hạn
          <select value={String(limit)} onChange={(event) => setLimit(Number(event.target.value))}>
            {[20, 50, 100, 200].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Đang tải...' : 'Áp dụng lọc'}
          </button>
        </div>
      </form>

      {error && <p className="banner banner-error">{error}</p>}

      {metrics.length > 0 && (
        <div className="overview-cards">
          {metrics.map((item) => (
            <article key={item.key} className="overview-card">
              <p>{item.key}</p>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ minWidth: '280px' }}>
          Tập dữ liệu
          <select value={selectedCollection} onChange={(event) => setSelectedCollection(event.target.value)}>
            {collections.length === 0 && <option value="">Không có collection dạng mảng</option>}
            {collections.map((item) => (
              <option key={item.key} value={item.key}>
                {item.key} ({item.rows.length})
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          Phạm vi hiện tại: <strong>{response?.scope?.type ?? '--'}</strong>
        </span>
      </div>

      <StandardDataTable
        data={selectedRows}
        columns={selectedColumns}
        storageKey={`assistant-proxy-${source}-table-v1`}
        isLoading={loading}
        enableRowSelection
        selectedRowIds={selectedRowIds}
        onSelectedRowIdsChange={setSelectedRowIds}
        showDefaultBulkUtilities
      />

      {!loading && !error && selectedRows.length === 0 && (
        <p className="banner banner-warning" style={{ margin: 0 }}>
          Tập dữ liệu hiện tại chưa có bản ghi. Hãy đổi nguồn hoặc nới bộ lọc để tiếp tục.
        </p>
      )}
    </section>
  );
}
