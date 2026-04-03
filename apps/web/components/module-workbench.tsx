'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, RefreshCw, Filter, FileText, LayoutDashboard, ChevronRight, Database, Edit2, Trash2, CheckCircle2 } from 'lucide-react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { canRunAction, type UserRole } from '../lib/rbac';
import { formatRuntimeDateTime, formatRuntimeNumber } from '../lib/runtime-format';
import {
  formatBulkSummary,
  runBulkOperation,
  type BulkExecutionResult,
  type BulkRowId
} from '../lib/bulk-actions';
import type {
  FeatureAction,
  FeatureFilter,
  FieldValue,
  FormField,
  ModuleDefinition,
  ModuleFeature
} from '../lib/module-ui';
import { useUserRole } from './user-role-context';
import {
  StandardDataTable,
  ColumnDefinition,
  type StandardTableBulkAction
} from './ui/standard-data-table';
import { SidePanel } from './ui/side-panel';

type FormValue = FieldValue;
type FormValues = Record<string, FormValue>;
type FilterValues = Record<string, FormValue>;
type TableRow = Record<string, unknown> & { id: BulkRowId };

type PendingBulkActionContext = {
  action: FeatureAction;
  rows: TableRow[];
  resolve: (result: BulkExecutionResult | void) => void;
};

function getInitialValue(field: FormField): FormValue {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === 'checkbox') return false;
  return '';
}

function createDefaultFormValues(action: FeatureAction): FormValues {
  return action.fields.reduce<FormValues>((acc, field) => {
    acc[field.name] = getInitialValue(field);
    return acc;
  }, {});
}

function createDefaultFilterValues(filters: FeatureFilter[]): FilterValues {
  return filters.reduce<FilterValues>((acc, filter) => {
    acc[filter.key] = filter.defaultValue !== undefined ? filter.defaultValue : (filter.type === 'checkbox' ? false : '');
    return acc;
  }, {});
}

function parseFormPayload(action: FeatureAction, formValues: FormValues) {
  const body: Record<string, unknown> = {};
  for (const field of action.fields) {
    const raw = formValues[field.name];
    if (field.type === 'checkbox') { body[field.name] = Boolean(raw); continue; }
    const stringValue = String(raw ?? '').trim();
    if (!stringValue) continue;
    if (field.type === 'number') {
      const num = Number(stringValue);
      if (!Number.isNaN(num)) body[field.name] = num;
      continue;
    }
    body[field.name] = stringValue;
  }
  return body;
}

function extractPathParamKeys(endpoint: string) {
  return Array.from(endpoint.matchAll(/:([A-Za-z0-9_]+)/g)).map((match) => match[1]);
}

function getRowValueForPathParam(row: Record<string, unknown>, key: string) {
  const direct = row[key];
  if (direct !== undefined && direct !== null && direct !== '') {
    return direct;
  }
  if (key === 'id') {
    const fallbackId = row.id;
    if (fallbackId !== undefined && fallbackId !== null && fallbackId !== '') {
      return fallbackId;
    }
  }
  return undefined;
}

function isDestructiveAction(action: FeatureAction) {
  const fingerprint = `${action.key} ${action.label} ${action.endpoint}`.toLowerCase();
  return (
    action.method === 'DELETE' ||
    fingerprint.includes('archive') ||
    fingerprint.includes('delete') ||
    fingerprint.includes('reject') ||
    fingerprint.includes('xoa') ||
    fingerprint.includes('luu tru') ||
    fingerprint.includes('tu choi')
  );
}

function buildBulkConfirmMessage(action: FeatureAction, count: number) {
  return `Xác nhận ${action.label.toLowerCase()} cho ${count} bản ghi đã chọn?`;
}

function applyPathParams(endpoint: string, body: Record<string, unknown>) {
  const usedKeys = new Set<string>();
  const resolved = endpoint.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    const raw = body[key];
    if (raw === undefined || raw === null || raw === '') throw new Error(`Thiếu tham số: ${key}`);
    usedKeys.add(key);
    return encodeURIComponent(String(raw));
  });
  const nextBody: Record<string, unknown> = {};
  Object.entries(body).forEach(([key, value]) => { if (!usedKeys.has(key)) nextBody[key] = value; });
  return { endpoint: resolved, body: nextBody };
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'number') return formatRuntimeNumber(value);
  if (typeof value === 'string' && /\d{4}-\d{2}-\d{2}/.test(value)) {
    const dt = new Date(value);
    return isNaN(dt.getTime()) ? value : formatRuntimeDateTime(dt.toISOString());
  }
  return String(value);
}

// Sub-component for individual Feature Action Forms in SidePanel
function ActionForm({
  action,
  onSubmit,
  onCancel,
  initialValues,
  hiddenFieldNames = [],
  isSubmitting = false
}: {
  action: FeatureAction, 
  onSubmit: (values: FormValues) => void,
  onCancel: () => void,
  initialValues?: FormValues,
  hiddenFieldNames?: string[],
  isSubmitting?: boolean
}) {
  const [values, setValues] = useState<FormValues>(initialValues ?? createDefaultFormValues(action));
  const hiddenSet = useMemo(() => new Set(hiddenFieldNames), [hiddenFieldNames]);
  const visibleFields = useMemo(
    () => action.fields.filter((field) => !hiddenSet.has(field.name)),
    [action.fields, hiddenSet]
  );

  useEffect(() => {
    setValues(initialValues ?? createDefaultFormValues(action));
  }, [action, initialValues]);

  const updateValue = (name: string, val: FormValue) => setValues(prev => ({ ...prev, [name]: val }));

  return (
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onSubmit(values); }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--primary)' }}>{action.label}</h3>
      {visibleFields.map(field => (
        <div className="field" key={field.name}>
          <label>{field.label}</label>
          {field.type === 'textarea' ? (
            <textarea value={String(values[field.name] ?? '')} required={field.required} onChange={(e) => updateValue(field.name, e.target.value)} />
          ) : field.type === 'select' ? (
            <select value={String(values[field.name] ?? '')} required={field.required} onChange={(e) => updateValue(field.name, e.target.value)}>
              {!field.required && <option value="">-- chọn --</option>}
              {(field.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : field.type === 'checkbox' ? (
            <div className="checkbox-wrap">
              <input type="checkbox" checked={Boolean(values[field.name])} onChange={(e) => updateValue(field.name, e.target.checked)} />
              <span>Bật</span>
            </div>
          ) : (
            <input type={field.type ?? 'text'} value={String(values[field.name] ?? '')} required={field.required} onChange={(e) => updateValue(field.name, e.target.value)} />
          )}
        </div>
      ))}
      {visibleFields.length === 0 && (
        <p className="banner banner-info" style={{ margin: 0 }}>
          Không cần nhập thêm dữ liệu. Nhấn xác nhận để áp dụng cho toàn bộ bản ghi đã chọn.
        </p>
      )}
      <div className="action-buttons" style={{ marginTop: '2rem' }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
          {isSubmitting ? 'Đang xử lý...' : 'Xác nhận'}
        </button>
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel} disabled={isSubmitting}>
          Hủy
        </button>
      </div>
    </form>
  );
}

function FeaturePanel({ feature, moduleKey, role }: { feature: ModuleFeature; moduleKey: string; role: UserRole }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<FilterValues>(createDefaultFilterValues(feature.filters ?? []));
  
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [activeAction, setActiveAction] = useState<FeatureAction | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<BulkRowId[]>([]);
  const [pendingBulkAction, setPendingBulkAction] = useState<PendingBulkActionContext | null>(null);
  const [isRunningBulkAction, setIsRunningBulkAction] = useState(false);
  const featureFilters = feature.filters ?? [];

  const loadData = async () => {
    if (!feature.listEndpoint) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const query: Record<string, string | number | boolean> = {};
      const keyword = search.trim();
      if (keyword) {
        query.q = keyword;
      }

      for (const filter of featureFilters) {
        const value = filterValues[filter.key];
        const isEmpty = value === undefined || value === null || value === '';
        if (isEmpty) continue;

        if (typeof value === 'boolean' && value === false && !filter.includeInQuery) {
          continue;
        }

        const queryKey = filter.queryParam ?? filter.key;
        query[queryKey] = value;
      }

      query.limit = 100;
      const payload = await apiRequest(feature.listEndpoint, { query });
      setRows(normalizeListPayload(payload));
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setFilterValues(createDefaultFilterValues(featureFilters));
    setSelectedRowIds([]);
    setPendingBulkAction((current) => {
      current?.resolve(undefined);
      return null;
    });
  }, [feature.key]);

  useEffect(() => {
    if (feature.autoLoad !== false) loadData();
  }, [feature.key, search, filterValues]);

  useEffect(() => {
    return () => {
      pendingBulkAction?.resolve(undefined);
    };
  }, [pendingBulkAction]);

  const handleAction = async (action: FeatureAction, formValues: FormValues) => {
    setErrorMessage(null);
    setResultMessage(null);
    try {
      const parsedBody = parseFormPayload(action, formValues);
      const resolved = applyPathParams(action.endpoint, parsedBody);
      await apiRequest(resolved.endpoint, {
        method: action.method,
        body: (action.method === 'GET' || action.method === 'DELETE') ? undefined : resolved.body
      });
      setResultMessage(`${action.label} thành công.`);
      setActiveAction(null);
      setSelectedRow(null);
      loadData();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Thao tác thất bại');
    }
  };

  const updateAction = feature.actions.find((action) =>
    (action.method === 'PATCH' || action.method === 'PUT') &&
    (action.endpoint.includes(':id') || action.endpoint.includes(':code')) &&
    canRunAction({ role, moduleKey, action })
  );

  const tableRows = rows as TableRow[];

  const columns: ColumnDefinition<TableRow>[] = useMemo(() => {
    const keys = feature.columns ?? (rows.length > 0 ? Object.keys(rows[0]).filter((key) => key !== 'tenant_Id').slice(0, 8) : []);

    return keys.map((key) => {
      const fieldDef = updateAction?.fields.find((field) => field.name === key);
      return {
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
        render: (row) => formatCellValue(row[key]),
        type: fieldDef?.type as any,
        options: fieldDef?.options
      };
    });
  }, [feature.columns, rows, updateAction]);

  const createAction = feature.actions.find((action) => action.method === 'POST' && !action.endpoint.includes(':id'));
  const rowActions = feature.actions.filter(
    (action) => action !== createAction && canRunAction({ role, moduleKey, action })
  );

  const bulkActionCandidates = useMemo(
    () =>
      rowActions.filter((action) => action.method !== 'GET' && extractPathParamKeys(action.endpoint).length > 0),
    [rowActions]
  );

  const executePendingBulkAction = async (
    action: FeatureAction,
    bulkRows: TableRow[],
    formValues: FormValues
  ): Promise<BulkExecutionResult | undefined> => {
    const pathParamKeys = extractPathParamKeys(action.endpoint);
    const parsedBody = parseFormPayload(action, formValues);
    const selectedIds = bulkRows.map((row) => row.id).filter((id): id is BulkRowId => Boolean(id));

    if (selectedIds.length === 0) {
      return {
        total: 0,
        successCount: 0,
        failedCount: 0,
        failedIds: [],
        failures: [],
        actionLabel: action.label,
        message: `${action.label}: không có dòng hợp lệ để xử lý.`
      };
    }

    if (isDestructiveAction(action) && !window.confirm(buildBulkConfirmMessage(action, selectedIds.length))) {
      return undefined;
    }

    setIsRunningBulkAction(true);
    try {
      const rowById = new Map<BulkRowId, TableRow>();
      for (const row of bulkRows) {
        rowById.set(row.id, row);
      }

      const result = await runBulkOperation({
        ids: selectedIds,
        continueOnError: true,
        chunkSize: 10,
        execute: async (rowId) => {
          const row = rowById.get(rowId);
          if (!row) {
            throw new Error(`Không tìm thấy dữ liệu cho bản ghi ${rowId}.`);
          }

          const rowPayload: Record<string, unknown> = { ...parsedBody };
          for (const pathParamKey of pathParamKeys) {
            const rowValue = getRowValueForPathParam(row, pathParamKey);
            if (rowValue === undefined || rowValue === null || rowValue === '') {
              throw new Error(`Thiếu tham số ${pathParamKey} cho bản ghi ${rowId}.`);
            }
            rowPayload[pathParamKey] = rowValue;
          }

          const resolved = applyPathParams(action.endpoint, rowPayload);
          await apiRequest(resolved.endpoint, {
            method: action.method,
            body: action.method === 'GET' || action.method === 'DELETE' ? undefined : resolved.body
          });
        }
      });

      const normalized: BulkExecutionResult = {
        ...result,
        actionLabel: action.label,
        message: formatBulkSummary(
          {
            ...result,
            actionLabel: action.label
          },
          action.label
        )
      };

      if (normalized.successCount > 0) {
        await loadData();
      }
      setResultMessage(normalized.message ?? null);
      if (normalized.failedCount > 0) {
        setErrorMessage(`Một số bản ghi thất bại khi chạy ${action.label.toLowerCase()}.`);
      }
      return normalized;
    } catch (error) {
      const fallback: BulkExecutionResult = {
        total: selectedIds.length,
        successCount: 0,
        failedCount: selectedIds.length,
        failedIds: selectedIds,
        failures: selectedIds.map((id) => ({
          id,
          message: error instanceof Error ? error.message : 'Lỗi xử lý bulk action'
        })),
        actionLabel: action.label,
        message: `${action.label}: thất bại ${selectedIds.length}/${selectedIds.length}.`
      };
      setErrorMessage(error instanceof Error ? error.message : 'Thao tác hàng loạt thất bại');
      return fallback;
    } finally {
      setIsRunningBulkAction(false);
    }
  };

  const bulkActions = useMemo<StandardTableBulkAction<TableRow>[]>(
    () =>
      bulkActionCandidates.map((action) => ({
        key: `bulk-${action.key}`,
        label: action.label,
        tone: isDestructiveAction(action) ? 'danger' : 'primary',
        execute: async (selectedRows) =>
          new Promise<BulkExecutionResult | void>((resolve) => {
            setPendingBulkAction({
              action,
              rows: (selectedRows as TableRow[]).slice(),
              resolve
            });
          })
      })),
    [bulkActionCandidates]
  );

  const pendingBulkHiddenFieldNames = useMemo(() => {
    if (!pendingBulkAction) {
      return [];
    }

    const pathParamKeys = extractPathParamKeys(pendingBulkAction.action.endpoint);
    return pathParamKeys.filter((key) =>
      pendingBulkAction.rows.every((row) => {
        const rowValue = getRowValueForPathParam(row, key);
        return rowValue !== undefined && rowValue !== null && rowValue !== '';
      })
    );
  }, [pendingBulkAction]);

  const closePendingBulkAction = () => {
    setPendingBulkAction((current) => {
      current?.resolve(undefined);
      return null;
    });
  };

  const submitPendingBulkAction = async (values: FormValues) => {
    if (!pendingBulkAction) {
      return;
    }

    const context = pendingBulkAction;
    const result = await executePendingBulkAction(context.action, context.rows, values);
    context.resolve(result);
    setPendingBulkAction(null);
  };

  return (
    <div className="feature-panel">
      {/* Header & Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{feature.title}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>{feature.description}</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ padding: '0.5rem 1rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={14} color="var(--primary)" /> <strong>{rows.length}</strong> Bản ghi
          </div>
          {feature.listEndpoint && (
            <button className="btn btn-ghost" onClick={() => loadData()}><RefreshCw size={14} /> Refresh</button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="main-toolbar" style={{ borderBottom: 'none', marginBottom: '1.5rem', padding: 0, alignItems: 'flex-start' }}>
        <div className="toolbar-left" style={{ display: 'grid', gap: '0.85rem', width: '100%' }}>
           <div style={{ position: 'relative', width: '100%' }}>
             <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
             <input 
              placeholder="Tìm kiếm nhanh..." 
              style={{ paddingLeft: '36px' }} 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
             />
           </div>

           {featureFilters.length > 0 && (
             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem', alignItems: 'center' }}>
               <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.76rem', color: 'var(--muted)' }}>
                 <Filter size={14} /> Bộ lọc
               </span>
               {featureFilters.map((filter) => {
                 const value = filterValues[filter.key];
                 if (filter.type === 'select') {
                   return (
                     <select
                       key={filter.key}
                       style={{ width: 'auto', minWidth: '126px' }}
                       value={String(value ?? '')}
                       onChange={(event) =>
                         setFilterValues((prev) => ({
                           ...prev,
                           [filter.key]: event.target.value
                         }))
                       }
                     >
                       <option value="">{filter.placeholder ?? filter.label}</option>
                       {(filter.options ?? []).map((option) => (
                         <option key={option.value} value={option.value}>
                           {option.label}
                         </option>
                       ))}
                     </select>
                   );
                 }

                 if (filter.type === 'checkbox') {
                   return (
                     <label key={filter.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                       <input
                         type="checkbox"
                         checked={Boolean(value)}
                         onChange={(event) =>
                           setFilterValues((prev) => ({
                             ...prev,
                             [filter.key]: event.target.checked
                           }))
                         }
                       />
                       {filter.label}
                     </label>
                   );
                 }

                 return (
                   <input
                     key={filter.key}
                     type={filter.type === 'number' ? 'number' : filter.type === 'date' ? 'date' : 'text'}
                     value={String(value ?? '')}
                     placeholder={filter.placeholder ?? filter.label}
                     style={{ width: 'auto', minWidth: '126px' }}
                     onChange={(event) =>
                       setFilterValues((prev) => ({
                         ...prev,
                         [filter.key]: event.target.value
                       }))
                     }
                   />
                 );
               })}
             </div>
           )}
        </div>
        <div className="toolbar-right">
          {createAction && canRunAction({ role, moduleKey, action: createAction }) && (
            <button className="btn btn-primary" onClick={() => setActiveAction(createAction)}>
              <Plus size={16} /> {createAction.label}
            </button>
          )}
        </div>
      </div>

      {errorMessage && <div className="banner banner-error" style={{ marginBottom: '1rem' }}>{errorMessage}</div>}
      {resultMessage && <div className="banner banner-success" style={{ marginBottom: '1rem' }}>{resultMessage}</div>}

      <StandardDataTable
        data={tableRows}
        columns={columns}
        isLoading={isLoading}
        onRowClick={(r) => setSelectedRow(r)}
        storageKey={`erp.workbench.${moduleKey}.${feature.key}`}
        editableKeys={updateAction ? updateAction.fields.map(f => f.name) : []}
        onSaveRow={updateAction ? (id, values) => handleAction(updateAction, { ...values, id } as FormValues) : undefined}
        enableRowSelection
        selectedRowIds={selectedRowIds}
        onSelectedRowIdsChange={setSelectedRowIds}
        bulkActions={bulkActions}
        showDefaultBulkUtilities
      />

      {/* Detail SidePanel */}
      <SidePanel
        isOpen={!!selectedRow && !activeAction}
        onClose={() => setSelectedRow(null)}
        title="Chi tiết bản ghi"
      >
        {selectedRow && (
          <div style={{ display: 'grid', gap: '2rem' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--line)' }}>
                <div style={{ width: '40px', height: '40px', background: 'var(--primary-soft)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                  <FileText size={20} />
                </div>
                <div>
                   <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{String(selectedRow.id || 'Bản ghi') }</h3>
                   <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Module: {moduleKey.toUpperCase()} • Feature: {feature.key}</p>
                </div>
             </div>

             <dl className="kv-grid" style={{ gridTemplateColumns: '1fr', gap: '0.75rem' }}>
               {Object.entries(selectedRow).filter(([k]) => k !== 'tenant_Id').map(([k, v]) => (
                 <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid var(--line-soft)' }}>
                   <dt style={{ color: 'var(--muted)', fontSize: '0.8125rem' }}>{k}</dt>
                   <dd style={{ fontWeight: 500, fontSize: '0.875rem' }}>{formatCellValue(v)}</dd>
                 </div>
               ))}
             </dl>

             {rowActions.length > 0 && (
               <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '1rem' }}>Thao tác khả dụng</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {rowActions.map(a => (
                      <button key={a.key} className="btn btn-ghost" style={{ border: '1px solid var(--line)' }} onClick={() => setActiveAction(a)}>
                        {a.method === 'PATCH' ? <Edit2 size={14} /> : a.method === 'DELETE' ? <Trash2 size={14} /> : <ChevronRight size={14} />}
                        {a.label}
                      </button>
                    ))}
                  </div>
               </div>
             )}
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={Boolean(pendingBulkAction)}
        onClose={closePendingBulkAction}
        title={pendingBulkAction ? `${pendingBulkAction.action.label} (${pendingBulkAction.rows.length} bản ghi)` : 'Bulk action'}
      >
        {pendingBulkAction && (
          <ActionForm
            action={pendingBulkAction.action}
            initialValues={createDefaultFormValues(pendingBulkAction.action)}
            hiddenFieldNames={pendingBulkHiddenFieldNames}
            isSubmitting={isRunningBulkAction}
            onCancel={closePendingBulkAction}
            onSubmit={(vals) => void submitPendingBulkAction(vals)}
          />
        )}
        {isRunningBulkAction && (
          <p className="banner banner-info" style={{ marginTop: '0.75rem' }}>
            Đang xử lý batch, vui lòng chờ...
          </p>
        )}
      </SidePanel>

      {/* Action Form SidePanel */}
      <SidePanel
        isOpen={!!activeAction}
        onClose={() => setActiveAction(null)}
        title={activeAction?.label ?? 'Thao tác'}
      >
        {activeAction && (
          <ActionForm 
            action={activeAction} 
            initialValues={selectedRow ? { ...createDefaultFormValues(activeAction), ...selectedRow } as FormValues : undefined}
            onCancel={() => setActiveAction(null)}
            onSubmit={(vals) => handleAction(activeAction, vals)}
          />
        )}
      </SidePanel>
    </div>
  );
}

export function ModuleWorkbench({ module }: { module: ModuleDefinition }) {
  const { role } = useUserRole();
  const [activeFeatureKey, setActiveFeatureKey] = useState(module.features[0]?.key ?? '');

  const activeFeature = module.features.find((f) => f.key === activeFeatureKey) ?? module.features[0];

  return (
    <article className="module-workbench" style={{ background: 'transparent' }}>
      <header className="module-header" style={{ background: 'transparent', borderBottom: 'none', padding: '0 0 2rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
           <div style={{ width: '48px', height: '48px', background: 'var(--primary)', color: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px var(--primary-soft)' }}>
              <LayoutDashboard size={24} />
           </div>
           <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{module.title}</h1>
              <p style={{ color: 'var(--muted)', fontSize: '0.9375rem' }}>{module.summary}</p>
           </div>
        </div>
      </header>

      {/* Top Tabs */}
      <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid var(--line)', marginBottom: '2rem' }}>
        {module.features.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFeatureKey(f.key)}
            style={{ 
              padding: '0.75rem 0', 
              fontWeight: 600, 
              fontSize: '0.875rem', 
              border: 'none',
              borderBottom: activeFeatureKey === f.key ? '2px solid var(--primary)' : '2px solid transparent', 
              color: activeFeatureKey === f.key ? 'var(--primary)' : 'var(--muted)', 
              background: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {f.title}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
          {module.highlights.map(h => (
            <span key={h} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={12} color="var(--primary)" /> {h}
            </span>
          ))}
        </div>
      </div>

      <div style={{ minHeight: '600px' }}>
        {activeFeature && <FeaturePanel key={activeFeature.key} feature={activeFeature} moduleKey={module.key} role={role} />}
      </div>
    </article>
  );
}
