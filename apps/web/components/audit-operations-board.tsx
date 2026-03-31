'use client';

import { CalendarClock, Filter, RefreshCw, Search } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { canAccessModule } from '../lib/rbac';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { useUserRole } from './user-role-context';
import { StandardDataTable, type ColumnDefinition } from './ui/standard-data-table';
import { SidePanel } from './ui/side-panel';

type AuditOperationType = 'READ' | 'WRITE';
type AuditQueryTier = 'hot' | 'cold' | 'mixed';
type AuditRowTier = 'hot' | 'cold';

type AuditLogRow = {
  id: string;
  module: string;
  entityType: string;
  entityId?: string | null;
  action: string;
  operationType: AuditOperationType;
  actorId?: string | null;
  actorRole?: string | null;
  requestId?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  changedFields?: string[];
  metadata?: unknown;
  prevHash?: string | null;
  hash: string;
  createdAt: string;
  dataTier?: AuditRowTier;
};

type AuditActionItem = {
  action: string;
  count: number;
};

type AuditPageInfo = {
  limit: number;
  hasMore: boolean;
  nextCursor?: string | null;
  tier?: AuditQueryTier;
  coldScanStats?: {
    scannedFiles: number;
    scannedRows: number;
    durationMs: number;
  };
};

type AuditLogsPayload = {
  items?: AuditLogRow[];
  pageInfo?: AuditPageInfo;
};

type AuditActionsPayload = {
  items?: AuditActionItem[];
};

type FilterState = {
  entityType: string;
  entityId: string;
  action: string;
  operationType: '' | AuditOperationType;
  module: string;
  actorId: string;
  requestId: string;
  from: string;
  to: string;
  q: string;
};

const AUDIT_COLUMN_SETTINGS_KEY = 'erp-retail.audit.logs-table-settings.v1';
const HOT_WINDOW_MONTHS = 12;

function createInitialFilters(): FilterState {
  return {
    entityType: '',
    entityId: '',
    action: '',
    operationType: '',
    module: '',
    actorId: '',
    requestId: '',
    from: '',
    to: '',
    q: ''
  };
}

function normalizeDateTime(value: string) {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '--';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatRuntimeDateTime(parsed.toISOString());
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

function mergeRowsById(prev: AuditLogRow[], incoming: AuditLogRow[]) {
  const byId = new Map<string, AuditLogRow>();
  for (const row of prev) {
    byId.set(row.id, row);
  }
  for (const row of incoming) {
    byId.set(row.id, row);
  }
  return Array.from(byId.values());
}

function deriveHotThreshold(now = new Date()) {
  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - HOT_WINDOW_MONTHS);
  return threshold;
}

function likelyTouchesArchive(filters: FilterState) {
  const threshold = deriveHotThreshold();
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(filters.to) : null;

  if (from && Number.isFinite(from.getTime()) && from.getTime() < threshold.getTime()) {
    return true;
  }
  if (to && Number.isFinite(to.getTime()) && to.getTime() < threshold.getTime()) {
    return true;
  }
  return false;
}

function isArchiveRangeValid(filters: FilterState) {
  if (!likelyTouchesArchive(filters)) {
    return true;
  }
  return Boolean(filters.from && filters.to);
}

function tierLabel(value: AuditRowTier | undefined) {
  return value === 'cold' ? 'Archive' : 'Hot';
}

export function AuditOperationsBoard() {
  const { role } = useUserRole();
  const canView = canAccessModule(role, 'audit');

  const [filters, setFilters] = useState<FilterState>(createInitialFilters());
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [actionItems, setActionItems] = useState<AuditActionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<AuditLogRow | null>(null);
  const [pageInfo, setPageInfo] = useState<AuditPageInfo | null>(null);

  const archiveLikely = useMemo(() => likelyTouchesArchive(filters), [filters]);
  const archiveRangeOk = useMemo(() => isArchiveRangeValid(filters), [filters]);

  const loadActions = async () => {
    if (!canView) {
      return;
    }

    try {
      const payload = await apiRequest<AuditActionsPayload>('/audit/actions');
      setActionItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tải danh mục hành động audit.');
    }
  };

  const loadLogs = async (
    nextFilters: FilterState,
    options: {
      append?: boolean;
      cursor?: string | null;
    } = {}
  ) => {
    if (!canView) {
      return;
    }

    const append = options.append === true;
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setErrorMessage(null);
    }

    try {
      const trimmedEntityType = nextFilters.entityType.trim();
      const trimmedEntityId = nextFilters.entityId.trim();
      const useObjectHistory = Boolean(trimmedEntityType && trimmedEntityId);
      const endpoint = useObjectHistory
        ? `/audit/objects/${encodeURIComponent(trimmedEntityType)}/${encodeURIComponent(trimmedEntityId)}/history`
        : '/audit/logs';

      const payload = await apiRequest<AuditLogsPayload>(endpoint, {
        query: {
          entityType: useObjectHistory ? undefined : trimmedEntityType || undefined,
          entityId: useObjectHistory ? undefined : trimmedEntityId || undefined,
          action: nextFilters.action || undefined,
          operationType: nextFilters.operationType || undefined,
          module: nextFilters.module || undefined,
          actorId: nextFilters.actorId || undefined,
          requestId: nextFilters.requestId || undefined,
          from: normalizeDateTime(nextFilters.from) || undefined,
          to: normalizeDateTime(nextFilters.to) || undefined,
          q: nextFilters.q || undefined,
          includeArchived: true,
          cursor: options.cursor || undefined,
          limit: 100
        }
      });

      const fetchedRows = Array.isArray(payload.items) ? payload.items : [];
      setRows((prev) => (append ? mergeRowsById(prev, fetchedRows) : fetchedRows));
      setPageInfo(payload.pageInfo ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tải audit log.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const nextFilters: FilterState = {
      entityType: params.get('entityType') ?? '',
      entityId: params.get('entityId') ?? '',
      action: params.get('action') ?? '',
      operationType: (params.get('operationType') as '' | AuditOperationType | null) ?? '',
      module: params.get('module') ?? '',
      actorId: params.get('actorId') ?? '',
      requestId: params.get('requestId') ?? '',
      from: params.get('from') ?? '',
      to: params.get('to') ?? '',
      q: params.get('q') ?? ''
    };

    setFilters(nextFilters);
    void Promise.all([loadActions(), loadLogs(nextFilters)]);
  }, [canView]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadLogs(filters, { append: false });
  };

  const handleLoadMore = async () => {
    if (!pageInfo?.hasMore || !pageInfo.nextCursor) {
      return;
    }
    await loadLogs(filters, { append: true, cursor: pageInfo.nextCursor });
  };

  const columns: ColumnDefinition<AuditLogRow>[] = useMemo(
    () => [
      {
        key: 'createdAt',
        label: 'Thời gian',
        isLink: true,
        render: (row) => formatDateTime(row.createdAt)
      },
      {
        key: 'dataTier',
        label: 'Nguồn',
        render: (row) => (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.1rem 0.45rem',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: row.dataTier === 'cold' ? '#fef6ec' : '#eaf7ef',
              color: row.dataTier === 'cold' ? '#a65d00' : '#116d3f'
            }}
          >
            {tierLabel(row.dataTier)}
          </span>
        )
      },
      {
        key: 'module',
        label: 'Module',
        render: (row) => row.module || '--'
      },
      {
        key: 'entityType',
        label: 'Đối tượng',
        render: (row) => row.entityType || '--'
      },
      {
        key: 'entityId',
        label: 'ID đối tượng',
        render: (row) => row.entityId || '--'
      },
      {
        key: 'action',
        label: 'Hành động',
        render: (row) => row.action
      },
      {
        key: 'operationType',
        label: 'Loại',
        render: (row) => row.operationType
      },
      {
        key: 'actorId',
        label: 'Actor',
        render: (row) => row.actorId || '--'
      },
      {
        key: 'statusCode',
        label: 'HTTP',
        render: (row) => (typeof row.statusCode === 'number' ? String(row.statusCode) : '--')
      },
      {
        key: 'requestId',
        label: 'Request ID',
        render: (row) => row.requestId || '--'
      }
    ],
    []
  );

  if (!canView) {
    return <div className="banner banner-error">Bạn không có quyền truy cập phân hệ Audit.</div>;
  }

  return (
    <div className="dashboard-root">
      <section className="hero-panel" style={{ marginBottom: '1.1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', marginBottom: '0.2rem' }}>Module Audit</h1>
          <p>Tra cứu nhật ký thao tác ERP theo đối tượng, hành động, actor, request và thời gian.</p>
        </div>
      </section>

      <form className="main-toolbar" style={{ marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' }} onSubmit={handleSubmit}>
        <div className="toolbar-left" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              style={{ paddingLeft: '34px', minWidth: '220px' }}
              placeholder="Tìm nhanh (object/action/requestId...)"
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
            />
          </div>

          <input
            placeholder="entityType"
            value={filters.entityType}
            onChange={(event) => setFilters((prev) => ({ ...prev, entityType: event.target.value }))}
          />
          <input
            placeholder="entityId"
            value={filters.entityId}
            onChange={(event) => setFilters((prev) => ({ ...prev, entityId: event.target.value }))}
          />

          <select
            value={filters.action}
            onChange={(event) => setFilters((prev) => ({ ...prev, action: event.target.value }))}
          >
            <option value="">Tất cả hành động</option>
            {actionItems.map((item) => (
              <option key={item.action} value={item.action}>
                {item.action} ({item.count})
              </option>
            ))}
          </select>

          <select
            value={filters.operationType}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                operationType: (event.target.value as '' | AuditOperationType) ?? ''
              }))
            }
          >
            <option value="">READ + WRITE</option>
            <option value="READ">READ</option>
            <option value="WRITE">WRITE</option>
          </select>

          <input
            placeholder="module"
            value={filters.module}
            onChange={(event) => setFilters((prev) => ({ ...prev, module: event.target.value }))}
          />
          <input
            placeholder="actorId"
            value={filters.actorId}
            onChange={(event) => setFilters((prev) => ({ ...prev, actorId: event.target.value }))}
          />
          <input
            placeholder="requestId"
            value={filters.requestId}
            onChange={(event) => setFilters((prev) => ({ ...prev, requestId: event.target.value }))}
          />

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted)', fontSize: '0.82rem' }}>
            <CalendarClock size={14} /> Từ
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
            />
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted)', fontSize: '0.82rem' }}>
            Đến
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
            />
          </label>
        </div>

        <div className="toolbar-right" style={{ gap: '0.6rem' }}>
          <button type="submit" className="btn btn-primary">
            <Filter size={14} /> Lọc
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => loadLogs(filters, { append: false })}>
            <RefreshCw size={14} /> Làm mới
          </button>
        </div>
      </form>

      {archiveLikely && !archiveRangeOk && (
        <div className="banner banner-warning" style={{ marginBottom: '0.75rem' }}>
          Dữ liệu có thể nằm ở archive. Vui lòng chọn đầy đủ cả mốc thời gian Từ/Đến để hệ thống tra cứu chính xác.
        </div>
      )}

      {(isLoading || isLoadingMore) && archiveLikely && (
        <div className="banner banner-info" style={{ marginBottom: '0.75rem' }}>
          Đang tra cứu archive (có thể chậm hơn dữ liệu 12 tháng gần nhất)...
        </div>
      )}

      {pageInfo?.tier && pageInfo.tier !== 'hot' && (
        <div className="banner banner-info" style={{ marginBottom: '0.75rem' }}>
          Kết quả đang bao gồm dữ liệu archive. Truy vấn loại này có thể chậm hơn truy vấn hot.
          {pageInfo.coldScanStats
            ? ` (files: ${pageInfo.coldScanStats.scannedFiles}, rows: ${pageInfo.coldScanStats.scannedRows}, ${pageInfo.coldScanStats.durationMs}ms)`
            : ''}
        </div>
      )}

      <StandardDataTable
        data={rows}
        columns={columns}
        storageKey={AUDIT_COLUMN_SETTINGS_KEY}
        isLoading={isLoading}
        onRowClick={(row) => setSelectedRow(row)}
      />

      {pageInfo?.hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.85rem' }}>
          <button type="button" className="btn btn-ghost" onClick={handleLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? 'Đang tải thêm...' : 'Tải thêm 100 dòng'}
          </button>
        </div>
      )}

      {errorMessage && <div className="banner banner-error" style={{ marginTop: '0.75rem' }}>{errorMessage}</div>}

      <SidePanel
        isOpen={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        title="Chi tiết audit log"
      >
        {selectedRow && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              <strong>{selectedRow.action}</strong>
              <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{formatDateTime(selectedRow.createdAt)}</span>
            </div>

            <div style={{ display: 'grid', gap: '0.45rem', fontSize: '0.9rem' }}>
              <div><strong>Module:</strong> {selectedRow.module || '--'}</div>
              <div><strong>Entity:</strong> {selectedRow.entityType} / {selectedRow.entityId || '--'}</div>
              <div><strong>Operation:</strong> {selectedRow.operationType}</div>
              <div><strong>Actor:</strong> {selectedRow.actorId || '--'} ({selectedRow.actorRole || '--'})</div>
              <div><strong>Request ID:</strong> {selectedRow.requestId || '--'}</div>
              <div><strong>Route:</strong> {selectedRow.method || '--'} {selectedRow.route || '--'}</div>
              <div><strong>Nguồn:</strong> {tierLabel(selectedRow.dataTier)}</div>
              <div><strong>Changed Fields:</strong> {selectedRow.changedFields?.join(', ') || '--'}</div>
              <div><strong>Hash:</strong> <code>{selectedRow.hash}</code></div>
              <div><strong>Prev Hash:</strong> <code>{selectedRow.prevHash || '--'}</code></div>
            </div>

            <div style={{ display: 'grid', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Before Data</h3>
              <pre className="code-block" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{stringifyJson(selectedRow.beforeData)}</pre>
            </div>

            <div style={{ display: 'grid', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem' }}>After Data</h3>
              <pre className="code-block" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{stringifyJson(selectedRow.afterData)}</pre>
            </div>

            <div style={{ display: 'grid', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Metadata</h3>
              <pre className="code-block" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{stringifyJson(selectedRow.metadata)}</pre>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
