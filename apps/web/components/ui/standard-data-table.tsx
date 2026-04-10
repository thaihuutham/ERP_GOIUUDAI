'use client';

import {
  Settings2,
  ArrowUpRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  Pencil,
  Copy,
  Download,
  RotateCcw,
  Archive,
  ListChecks
} from 'lucide-react';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './modal';
import {
  formatBulkSummary,
  type BulkExecutionResult,
  type BulkRowId
} from '../../lib/bulk-actions';

export interface ColumnDefinition<T> {
  key: string;
  label: string;
  sortKey?: string;
  sortable?: boolean;
  sortDisabledTooltip?: string;
  group?: string;
  description?: string;
  render?: (item: T) => ReactNode;
  isLink?: boolean;
  type?: 'text' | 'number' | 'select' | 'date';
  options?: { label: string; value: string | number }[];
}

export type StandardTableBulkTone = 'primary' | 'danger' | 'ghost';

export interface StandardTableBulkAction<T> {
  key: string;
  label: string;
  tone?: StandardTableBulkTone;
  confirmMessage?: string | ((rows: T[]) => string);
  execute: (rows: T[]) => Promise<BulkExecutionResult | void>;
}

export interface StandardTableBulkModalRenderContext<T> {
  selectedRows: T[];
  selectedRowIds: BulkRowId[];
  totalLoadedRows: number;
  closeBulkModal: () => void;
  clearSelection: () => void;
}

export type StandardTablePageInfo = {
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  visitedPages: number[];
};

export type StandardTableSortMeta = {
  sortBy: string;
  sortDir: 'asc' | 'desc';
  sortableFields: string[];
};

interface StandardDataTableProps<T> {
  data: T[];
  columns: ColumnDefinition<T>[];
  storageKey: string;
  pageInfo?: StandardTablePageInfo | null;
  sortMeta?: StandardTableSortMeta | null;
  onPageNext?: () => void;
  onPagePrev?: () => void;
  onJumpVisitedPage?: (page: number) => void;
  onSortChange?: (sortBy: string, sortDir: 'asc' | 'desc') => void;
  defaultVisibleColumnKeys?: string[];
  toolbarLeftContent?: ReactNode;
  toolbarRightContent?: ReactNode;
  onRowClick?: (item: T) => void;
  isLoading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  editableKeys?: string[];
  onSaveRow?: (id: string | number, values: Partial<T>) => Promise<void>;
  enableRowSelection?: boolean;
  selectedRowIds?: BulkRowId[];
  onSelectedRowIdsChange?: (ids: BulkRowId[]) => void;
  bulkActions?: StandardTableBulkAction<T>[];
  showDefaultBulkUtilities?: boolean;
  hideArchivedRows?: boolean;
  bulkModalTitle?: string;
  renderBulkModalContent?: (context: StandardTableBulkModalRenderContext<T>) => ReactNode;
  renderBulkModalFooter?: (context: StandardTableBulkModalRenderContext<T>) => ReactNode;
}

type ArchiveViewMode = 'active' | 'archived';

function stringifyCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csvEscape(value: string) {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function triggerCsvDownload(filename: string, headers: string[], rows: string[][]) {
  const csvContent = [headers, ...rows]
    .map((line) => line.map((cell) => csvEscape(cell)).join(','))
    .join('\n');
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function copyText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function hasTruthyArchiveMarker(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return true;
}

function isArchivedStatusValue(value: unknown) {
  return typeof value === 'string' && value.trim().toUpperCase() === 'ARCHIVED';
}

function isArchivedRow<T extends { id: string | number }>(item: T) {
  const row = item as Record<string, unknown>;
  if (isArchivedStatusValue(row.status) || isArchivedStatusValue(row.lifecycleStatus)) {
    return true;
  }

  if (row.isArchived === true || row.is_archived === true) {
    return true;
  }

  if (hasTruthyArchiveMarker(row.archivedAt) || hasTruthyArchiveMarker(row.archived_at)) {
    return true;
  }

  return false;
}

export function StandardDataTable<T extends { id: string | number }>({
  data,
  columns,
  storageKey,
  pageInfo,
  sortMeta,
  onPageNext,
  onPagePrev,
  onJumpVisitedPage,
  onSortChange,
  defaultVisibleColumnKeys,
  toolbarLeftContent,
  toolbarRightContent,
  onRowClick,
  isLoading,
  loadingMessage = 'Đang tải dữ liệu...',
  emptyMessage,
  editableKeys = [],
  onSaveRow,
  enableRowSelection = false,
  selectedRowIds,
  onSelectedRowIdsChange,
  bulkActions = [],
  showDefaultBulkUtilities = false,
  hideArchivedRows = true,
  bulkModalTitle = 'Bulk Actions',
  renderBulkModalContent,
  renderBulkModalFooter
}: StandardDataTableProps<T>) {
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');
  
  // Inline Editing State
  const [editingRowId, setEditingRowId] = useState<string | number | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [internalSelectedIds, setInternalSelectedIds] = useState<BulkRowId[]>([]);
  const [bulkResult, setBulkResult] = useState<BulkExecutionResult | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [lastBulkActionKey, setLastBulkActionKey] = useState<string | null>(null);
  const [runningBulkActionKey, setRunningBulkActionKey] = useState<string | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [archiveViewMode, setArchiveViewMode] = useState<ArchiveViewMode>('active');
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const allColumnKeys = useMemo(
    () => columns.map((column) => column.key),
    [columns]
  );

  const resolvedDefaultVisibleKeys = useMemo(() => {
    const requested = Array.isArray(defaultVisibleColumnKeys) && defaultVisibleColumnKeys.length > 0
      ? defaultVisibleColumnKeys
      : allColumnKeys;
    const filtered = requested.filter((key, index) => allColumnKeys.includes(key) && requested.indexOf(key) === index);
    return filtered.length > 0 ? filtered : allColumnKeys;
  }, [allColumnKeys, defaultVisibleColumnKeys]);

  const normalizeOrderKeys = useCallback(
    (rawOrder: unknown): string[] => {
      const unique: string[] = Array.isArray(rawOrder)
        ? Array.from(
            new Set(
              rawOrder
                .map((item) => String(item ?? ''))
                .filter((key) => allColumnKeys.includes(key))
            )
          )
        : [];
      for (const key of allColumnKeys) {
        if (!unique.includes(key)) {
          unique.push(key);
        }
      }
      return unique;
    },
    [allColumnKeys]
  );

  // Save to localStorage (define early)
  const saveSettings = useCallback((visible: string[], order: string[]) => {
    localStorage.setItem(storageKey, JSON.stringify({ visible, order }));
  }, [storageKey]);

  // Initialize from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    const fallbackVisible = resolvedDefaultVisibleKeys;
    const fallbackOrder = normalizeOrderKeys(allColumnKeys);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const normalizedVisible: string[] = Array.isArray(parsed?.visible)
          ? Array.from(
              new Set(
                parsed.visible
                  .map((item: unknown) => String(item ?? ''))
                  .filter((key: string) => allColumnKeys.includes(key))
              )
            )
          : [];
        const nextVisible = normalizedVisible.length > 0 ? normalizedVisible : fallbackVisible;
        const nextOrder = normalizeOrderKeys(parsed?.order);
        
        setVisibleColumns(prev => JSON.stringify(prev) === JSON.stringify(nextVisible) ? prev : nextVisible);
        setColumnOrder(prev => JSON.stringify(prev) === JSON.stringify(nextOrder) ? prev : nextOrder);
        saveSettings(nextVisible, nextOrder);
      } catch (e) {
        setVisibleColumns(prev => JSON.stringify(prev) === JSON.stringify(fallbackVisible) ? prev : fallbackVisible);
        setColumnOrder(prev => JSON.stringify(prev) === JSON.stringify(fallbackOrder) ? prev : fallbackOrder);
        saveSettings(fallbackVisible, fallbackOrder);
      }
    } else {
      setVisibleColumns(prev => JSON.stringify(prev) === JSON.stringify(fallbackVisible) ? prev : fallbackVisible);
      setColumnOrder(prev => JSON.stringify(prev) === JSON.stringify(fallbackOrder) ? prev : fallbackOrder);
      saveSettings(fallbackVisible, fallbackOrder);
    }
  }, [allColumnKeys, normalizeOrderKeys, resolvedDefaultVisibleKeys, storageKey, saveSettings]);

  const toggleColumn = (key: string) => {
    const next = visibleColumns.includes(key)
      ? visibleColumns.filter((k) => k !== key)
      : [...visibleColumns, key];
    setVisibleColumns(next);
    saveSettings(next, columnOrder);
  };

  const orderedColumns = useMemo(() => {
    const colMap = new Map(columns.map((c) => [c.key, c]));
    return columnOrder
      .map((key) => colMap.get(key))
      .filter((c): c is ColumnDefinition<T> => !!c && visibleColumns.includes(c.key));
  }, [columns, columnOrder, visibleColumns]);

  const normalizedColumnSearch = columnSearch.trim().toLowerCase();
  const columnPickerGroups = useMemo(() => {
    const filteredColumns = columns.filter((column) => {
      if (!normalizedColumnSearch) return true;
      const haystack = `${column.label} ${column.group ?? ''} ${column.description ?? ''}`.toLowerCase();
      return haystack.includes(normalizedColumnSearch);
    });

    const grouped = new Map<string, ColumnDefinition<T>[]>();
    for (const column of filteredColumns) {
      const groupName = column.group?.trim() || 'Khác';
      const bucket = grouped.get(groupName);
      if (bucket) {
        bucket.push(column);
      } else {
        grouped.set(groupName, [column]);
      }
    }

    return Array.from(grouped.entries()).map(([group, groupColumns]) => ({
      group,
      columns: groupColumns
    }));
  }, [columns, normalizedColumnSearch]);

  const activeRows = useMemo(
    () => (hideArchivedRows ? data.filter((item) => !isArchivedRow(item)) : data),
    [data, hideArchivedRows]
  );
  const archivedRows = useMemo(
    () => (hideArchivedRows ? data.filter((item) => isArchivedRow(item)) : []),
    [data, hideArchivedRows]
  );
  const tableData = useMemo(() => {
    if (!hideArchivedRows) {
      return data;
    }
    return archiveViewMode === 'archived' ? archivedRows : activeRows;
  }, [activeRows, archiveViewMode, archivedRows, data, hideArchivedRows]);

  useEffect(() => {
    if (!hideArchivedRows && archiveViewMode !== 'active') {
      setArchiveViewMode('active');
    }
  }, [archiveViewMode, hideArchivedRows]);

  const rowSelectTriggerKey = useMemo(() => {
    if (!onRowClick || orderedColumns.length === 0) {
      return null;
    }

    const explicitLinkColumn = orderedColumns.find((column) => column.isLink);
    return explicitLinkColumn?.key ?? orderedColumns[0].key;
  }, [onRowClick, orderedColumns]);

  // Editing Handlers
  const startEditing = (item: T) => {
    setEditingRowId(item.id);
    setEditingValues({ ...item });
  };

  const cancelEditing = () => {
    setEditingRowId(null);
    setEditingValues({});
    setIsSaving(false);
  };

  const saveEditing = async () => {
    if (editingRowId === null || !onSaveRow) return;
    setIsSaving(true);
    try {
      await onSaveRow(editingRowId, editingValues as Partial<T>);
      setEditingRowId(null);
      setEditingValues({});
    } catch (error) {
      console.error('Failed to save row:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (key: string, value: any) => {
    setEditingValues(prev => ({ ...prev, [key]: value }));
  };

  const resolvedSelectedIds = enableRowSelection
    ? (selectedRowIds ?? internalSelectedIds)
    : [];

  const selectedIdSet = useMemo(() => new Set(resolvedSelectedIds), [resolvedSelectedIds]);
  const selectedRows = useMemo(
    () => tableData.filter((item) => selectedIdSet.has(item.id)),
    [tableData, selectedIdSet]
  );
  const allLoadedSelected = enableRowSelection && tableData.length > 0 && selectedRows.length === tableData.length;
  const partiallySelected = enableRowSelection && selectedRows.length > 0 && selectedRows.length < tableData.length;

  const updateSelectedIds = useCallback(
    (nextIds: BulkRowId[]) => {
      if (!enableRowSelection) return;
      if (selectedRowIds === undefined) {
        setInternalSelectedIds(nextIds);
      }
      onSelectedRowIdsChange?.(nextIds);
    },
    [enableRowSelection, onSelectedRowIdsChange, selectedRowIds]
  );

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = partiallySelected;
    }
  }, [partiallySelected]);

  useEffect(() => {
    if (!enableRowSelection) {
      if (internalSelectedIds.length > 0) {
        setInternalSelectedIds([]);
      }
      return;
    }

    const dataIdSet = new Set(tableData.map((item) => item.id));
    const next = resolvedSelectedIds.filter((id) => dataIdSet.has(id));
    if (next.length !== resolvedSelectedIds.length) {
      updateSelectedIds(next);
    }
  }, [tableData, enableRowSelection, internalSelectedIds.length, resolvedSelectedIds, updateSelectedIds]);

  const runBulkAction = useCallback(
    async (action: StandardTableBulkAction<T>, rows: T[]) => {
      if (rows.length === 0) return;

      const confirmMessage = typeof action.confirmMessage === 'function'
        ? action.confirmMessage(rows)
        : action.confirmMessage;
      if (confirmMessage && !window.confirm(confirmMessage)) {
        return;
      }

      setRunningBulkActionKey(action.key);
      setBulkNotice(null);
      try {
        const result = await action.execute(rows);
        if (result) {
          setLastBulkActionKey(action.key);
          const normalized: BulkExecutionResult = {
            ...result,
            actionLabel: result.actionLabel || action.label,
            message: result.message || formatBulkSummary(
              {
                ...result,
                actionLabel: result.actionLabel || action.label
              },
              action.label
            )
          };
          setBulkResult(normalized);

          if (normalized.failedIds.length > 0) {
            const failedIdSet = new Set(normalized.failedIds);
            updateSelectedIds(tableData.filter((item) => failedIdSet.has(item.id)).map((item) => item.id));
          } else {
            updateSelectedIds([]);
          }
        } else {
          setBulkResult(null);
        }
      } catch (error) {
        const fallback: BulkExecutionResult = {
          total: rows.length,
          successCount: 0,
          failedCount: rows.length,
          failedIds: rows.map((item) => item.id),
          failures: rows.map((item) => ({
            id: item.id,
            message: error instanceof Error ? error.message : 'Bulk action thất bại'
          })),
          actionLabel: action.label,
          message: `${action.label}: thất bại ${rows.length}/${rows.length}.`
        };
        setBulkResult(fallback);
        updateSelectedIds(fallback.failedIds);
      } finally {
        setRunningBulkActionKey(null);
      }
    },
    [tableData, updateSelectedIds]
  );

  const lastBulkAction = useMemo(
    () => bulkActions.find((item) => item.key === lastBulkActionKey) ?? null,
    [bulkActions, lastBulkActionKey]
  );

  const onToggleSelectAll = (checked: boolean) => {
    if (!enableRowSelection) return;
    if (checked) {
      updateSelectedIds(tableData.map((item) => item.id));
      return;
    }
    updateSelectedIds([]);
  };

  const onToggleSelectRow = (rowId: BulkRowId, checked: boolean) => {
    if (!enableRowSelection) return;
    if (checked) {
      if (selectedIdSet.has(rowId)) return;
      updateSelectedIds([...resolvedSelectedIds, rowId]);
      return;
    }
    updateSelectedIds(resolvedSelectedIds.filter((item) => item !== rowId));
  };

  const onCopySelectedIds = async () => {
    if (selectedRows.length === 0) return;
    await copyText(selectedRows.map((row) => String(row.id)).join(', '));
    setBulkNotice(`Đã copy ${selectedRows.length} ID.`);
  };

  const onExportSelectedRows = () => {
    if (selectedRows.length === 0) return;
    const exportColumns = orderedColumns.length > 0 ? orderedColumns : columns;
    const headers = exportColumns.map((column) => column.label);
    const rows = selectedRows.map((row) =>
      exportColumns.map((column) => stringifyCsvCell((row as Record<string, unknown>)[column.key]))
    );
    const stamp = new Date().toISOString().slice(0, 10);
    const normalizedKey = storageKey.replace(/[^a-zA-Z0-9_.-]+/g, '-');
    const archiveSuffix = hideArchivedRows && archiveViewMode === 'archived' ? '-archived' : '';
    triggerCsvDownload(`${normalizedKey}-${stamp}${archiveSuffix}.csv`, headers, rows);
    setBulkNotice(`Đã export ${selectedRows.length} dòng.`);
  };

  const onRetryFailed = async () => {
    if (!bulkResult || !lastBulkAction || bulkResult.failedIds.length === 0) return;
    const failedIdSet = new Set(bulkResult.failedIds);
    const retryRows = tableData.filter((row) => failedIdSet.has(row.id));
    if (retryRows.length === 0) {
      setBulkNotice('Không còn dòng lỗi trong dữ liệu hiện tại để retry.');
      return;
    }
    await runBulkAction(lastBulkAction, retryRows);
  };

  const onCopyFailedIds = async () => {
    if (!bulkResult || bulkResult.failedIds.length === 0) return;
    await copyText(bulkResult.failedIds.map((id) => String(id)).join(', '));
    setBulkNotice(`Đã copy ${bulkResult.failedIds.length} failed ID.`);
  };

  if (isLoading) {
    return (
      <div className="standard-table-empty-state">
        {loadingMessage}
      </div>
    );
  }

  const canEdit = editableKeys.length > 0 && !!onSaveRow;
  const activeSortBy = sortMeta?.sortBy ?? '';
  const activeSortDir = sortMeta?.sortDir ?? 'asc';
  const sourceVisitedPages = pageInfo?.visitedPages ?? [];
  const visitedPages = Array.from(
    new Set(
      sourceVisitedPages
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.round(value))
    )
  ).sort((left, right) => left - right);
  if (visitedPages.length === 0 && pageInfo?.currentPage) {
    visitedPages.push(Math.max(1, Math.round(pageInfo.currentPage)));
  }
  const currentPage = pageInfo?.currentPage ? Math.max(1, Math.round(pageInfo.currentPage)) : 1;
  const showPagingControls = Boolean(pageInfo && (onPageNext || onPagePrev || onJumpVisitedPage));
  const isArchivedMode = hideArchivedRows && archiveViewMode === 'archived';
  const defaultEmptyMessage = isArchivedMode ? 'Không có dữ liệu đã xóa' : 'Không có dữ liệu';
  const resolvedEmptyMessage = emptyMessage ?? defaultEmptyMessage;
  const hasBulkModalControls = enableRowSelection
    && (bulkActions.length > 0 || showDefaultBulkUtilities || Boolean(renderBulkModalContent));
  const bulkModalContext: StandardTableBulkModalRenderContext<T> = {
    selectedRows,
    selectedRowIds: resolvedSelectedIds,
    totalLoadedRows: tableData.length,
    closeBulkModal: () => setBulkModalOpen(false),
    clearSelection: () => updateSelectedIds([]),
  };

  return (
    <div className="standard-table">
      <div className="standard-table-toolbar">
        <div className="standard-table-toolbar-left">
          {toolbarLeftContent}
        </div>
        <div className="standard-table-toolbar-right">
          {toolbarRightContent ? (
            <div className="standard-table-toolbar-right-custom">
              {toolbarRightContent}
            </div>
          ) : null}
          <button
            className="btn btn-ghost standard-table-config-btn"
            onClick={() => setIsColumnPickerOpen(!isColumnPickerOpen)}
            title="Cấu hình cột"
          >
            <Settings2 size={16} />
            <span>Cấu hình cột</span>
          </button>
          {hideArchivedRows && (
            <button
              type="button"
              className={`btn ${isArchivedMode ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setArchiveViewMode((prev) => (prev === 'active' ? 'archived' : 'active'));
                setBulkNotice(null);
              }}
            >
              <Archive size={14} />
              {isArchivedMode ? 'Quay về dữ liệu hiện hành' : 'Xem dữ liệu đã xóa'}
            </button>
          )}
          {hasBulkModalControls && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={selectedRows.length === 0}
              onClick={() => setBulkModalOpen(true)}
              title={selectedRows.length === 0 ? 'Chọn ít nhất 1 dòng để thao tác hàng loạt' : undefined}
            >
              <ListChecks size={14} />
              Bulk Actions
            </button>
          )}
        </div>

        {isColumnPickerOpen && (
          <div className="column-picker-popover standard-column-popover">
            <div className="standard-column-popover-title">Hiển thị cột</div>
            <input
              type="text"
              className="standard-column-search-input"
              placeholder="Tìm cột..."
              value={columnSearch}
              onChange={(event) => setColumnSearch(event.target.value)}
            />
            <div className="standard-column-popover-list">
              {columnPickerGroups.length === 0 ? (
                <p className="standard-column-empty">Không tìm thấy cột phù hợp.</p>
              ) : (
                columnPickerGroups.map((group) => (
                  <div key={group.group} className="standard-column-group">
                    <div className="standard-column-group-title">{group.group}</div>
                    <div className="standard-column-group-list">
                      {group.columns.map((col) => (
                        <label key={col.key} className="column-picker-item standard-column-picker-item">
                          <input
                            type="checkbox"
                            checked={visibleColumns.includes(col.key)}
                            onChange={() => toggleColumn(col.key)}
                          />
                          <span className="standard-column-label-wrap">
                            <span>{col.label}</span>
                            {col.description ? (
                              <small>{col.description}</small>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {hasBulkModalControls && (
        <Modal
          open={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          title={bulkModalTitle}
          maxWidth="680px"
          footer={renderBulkModalFooter ? renderBulkModalFooter(bulkModalContext) : undefined}
        >
          {renderBulkModalContent ? (
            renderBulkModalContent(bulkModalContext)
          ) : (
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <div className="standard-table-bulk-meta">
                Đã chọn <strong>{selectedRows.length}</strong> / {tableData.length} dòng đang tải
                {!isArchivedMode && hideArchivedRows && archivedRows.length > 0 ? (
                  <span style={{ marginLeft: '0.45rem', color: 'var(--muted)' }}>
                    (ẩn {archivedRows.length} archived)
                  </span>
                ) : null}
                {isArchivedMode ? (
                  <span style={{ marginLeft: '0.45rem', color: 'var(--muted)' }}>
                    (chỉ hiển thị dữ liệu đã xóa)
                  </span>
                ) : null}
              </div>
              <div className="standard-table-bulk-actions">
                {bulkActions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    className={`btn ${
                      action.tone === 'primary' ? 'btn-primary' : action.tone === 'danger' ? 'btn-danger' : 'btn-ghost'
                    }`}
                    disabled={selectedRows.length === 0 || runningBulkActionKey === action.key}
                    onClick={() => void runBulkAction(action, selectedRows)}
                  >
                    {runningBulkActionKey === action.key ? 'Đang xử lý...' : action.label}
                  </button>
                ))}

                {showDefaultBulkUtilities && (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={selectedRows.length === 0}
                      onClick={() => void onCopySelectedIds()}
                    >
                      <Copy size={14} />
                      Copy IDs
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={selectedRows.length === 0}
                      onClick={onExportSelectedRows}
                    >
                      <Download size={14} />
                      Export CSV
                    </button>
                  </>
                )}

                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={selectedRows.length === 0}
                  onClick={() => updateSelectedIds([])}
                >
                  Clear selection
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {bulkResult && (
        <div className={`standard-table-bulk-result ${bulkResult.failedCount > 0 ? 'is-error' : 'is-success'}`}>
          <span>{bulkResult.message || formatBulkSummary(bulkResult)}</span>
          <div className="standard-table-bulk-result-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={bulkResult.failedCount === 0 || !lastBulkAction}
              onClick={() => void onRetryFailed()}
            >
              <RotateCcw size={14} />
              Retry failed
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={bulkResult.failedCount === 0}
              onClick={() => void onCopyFailedIds()}
            >
              <Copy size={14} />
              Copy failed IDs
            </button>
          </div>
        </div>
      )}

      {bulkNotice && (
        <div className="standard-table-bulk-notice">{bulkNotice}</div>
      )}

      <div className="table-responsive standard-table-wrap">
        <table className="standard-table-table">
          <thead>
            <tr>
              {enableRowSelection && (
                <th className="standard-table-select-head">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allLoadedSelected}
                    onChange={(event) => onToggleSelectAll(event.target.checked)}
                    aria-label="Chọn tất cả dữ liệu đang tải"
                  />
                </th>
              )}
              {orderedColumns.map((col) => (
                <th key={col.key}>
                  {(() => {
                    const sortKey = col.sortKey ?? col.key;
                    const supportsSortFromServer = sortMeta ? sortMeta.sortableFields.includes(sortKey) : false;
                    const isSortable = Boolean(onSortChange) && (col.sortable ?? supportsSortFromServer);
                    const isActiveSort = activeSortBy === sortKey;
                    const disabledSortTooltip = col.sortDisabledTooltip ?? 'Cột này chưa hỗ trợ sắp xếp server-side.';
                    const sortTitle = isSortable
                      ? `Sắp xếp theo ${col.label}`
                      : disabledSortTooltip;

                    if (!onSortChange) {
                      return col.label;
                    }

                    const icon = isActiveSort
                      ? activeSortDir === 'asc'
                        ? <ArrowUp size={13} />
                        : <ArrowDown size={13} />
                      : <ArrowUpDown size={13} />;

                    if (!isSortable) {
                      return (
                        <span className="standard-table-sort-label standard-table-sort-label-disabled" title={sortTitle}>
                          <span>{col.label}</span>
                          <span className="standard-table-sort-icon">{icon}</span>
                        </span>
                      );
                    }

                    return (
                      <button
                        type="button"
                        className={`standard-table-sort-btn ${isActiveSort ? 'is-active' : ''}`}
                        onClick={() => onSortChange(sortKey, isActiveSort && activeSortDir === 'asc' ? 'desc' : 'asc')}
                        title={sortTitle}
                      >
                        <span>{col.label}</span>
                        <span className="standard-table-sort-icon">{icon}</span>
                      </button>
                    );
                  })()}
                </th>
              ))}
              {canEdit && <th className="standard-table-actions-head">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {tableData.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + (canEdit ? 1 : 0) + (enableRowSelection ? 1 : 0)} className="standard-table-empty-row">
                  {resolvedEmptyMessage}
                </td>
              </tr>
            ) : (
              tableData.map((item) => {
                const isEditing = editingRowId === item.id;
                return (
                  <tr key={item.id} className="standard-table-row">
                    {enableRowSelection && (
                      <td className="standard-table-select-cell">
                        <input
                          type="checkbox"
                          checked={selectedIdSet.has(item.id)}
                          onChange={(event) => onToggleSelectRow(item.id, event.target.checked)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Chọn dòng ${item.id}`}
                        />
                      </td>
                    )}
                    {orderedColumns.map((col) => {
                      const isFieldEditable = editableKeys.includes(col.key);
                      const isRowSelectTrigger = !!onRowClick && rowSelectTriggerKey === col.key;
                      const renderedCellValue = col.render ? col.render(item) : ((item as any)[col.key] || '--');

                      return (
                        <td key={col.key}>
                          {isEditing && isFieldEditable ? (
                            <div onClick={(e: any) => e.stopPropagation()}>
                              {col.type === 'select' ? (
                                <select 
                                  value={editingValues[col.key] ?? ''} 
                                  onChange={(e) => handleInputChange(col.key, e.target.value)}
                                  className="standard-cell-input"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {col.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              ) : col.type === 'number' ? (
                                <input 
                                  type="number" 
                                  value={editingValues[col.key] ?? ''} 
                                  onChange={(e) => handleInputChange(col.key, e.target.value)}
                                  className="standard-cell-input"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <input 
                                  type="text" 
                                  value={editingValues[col.key] ?? ''} 
                                  onChange={(e) => handleInputChange(col.key, e.target.value)}
                                  className="standard-cell-input"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                            </div>
                          ) : isRowSelectTrigger ? (
                            <button
                              type="button"
                              className="record-link row-select-trigger"
                              onClick={() => onRowClick?.(item)}
                            >
                              {renderedCellValue}
                              <span><ArrowUpRight size={14} /></span>
                            </button>
                          ) : (
                            renderedCellValue
                          )}
                        </td>
                      );
                    })}
                    
                    {canEdit && (
                      <td className="standard-table-actions-cell">
                         {isEditing ? (
                           <div className="standard-edit-actions" onClick={(e) => e.stopPropagation()}>
                              <button 
                                onClick={(e) => { e.stopPropagation(); saveEditing(); }} 
                                disabled={isSaving || !onSaveRow}
                                className="btn btn-primary standard-icon-btn"
                                title="Lưu"
                              >
                                {isSaving ? '...' : <Check size={14} />}
                              </button>
                              <button 
                                onClick={cancelEditing} 
                                className="btn btn-ghost standard-icon-btn"
                                title="Hủy"
                              >
                                <X size={14} />
                              </button>
                           </div>
                         ) : (
                           <button 
                             onClick={(e) => { e.stopPropagation(); startEditing(item); }}
                             className="btn btn-ghost standard-icon-btn"
                             title="Sửa nhanh"
                           >
                             <Pencil size={14} style={{ opacity: 0.5 }} />
                           </button>
                         )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showPagingControls && (
        <div className="standard-table-pagination">
          <div className="standard-table-pagination-meta">
            Trang <strong>{currentPage}</strong>
          </div>
          <div className="standard-table-pagination-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onPagePrev?.()}
              disabled={!pageInfo?.hasPrevPage || !onPagePrev}
            >
              Trước
            </button>

            {visitedPages.map((page) => (
              <button
                key={page}
                type="button"
                className={`btn ${page === currentPage ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => onJumpVisitedPage?.(page)}
                disabled={page === currentPage || !onJumpVisitedPage}
              >
                {page}
              </button>
            ))}

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onPageNext?.()}
              disabled={!pageInfo?.hasNextPage || !onPageNext}
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
