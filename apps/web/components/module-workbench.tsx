'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, RefreshCw, Filter, FileText, LayoutDashboard, ChevronRight, Database, Edit2, Trash2, CheckCircle2 } from 'lucide-react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { canRunAction, type UserRole } from '../lib/rbac';
import { formatRuntimeDateTime, formatRuntimeNumber } from '../lib/runtime-format';
import type {
  FeatureAction,
  FeatureFilter,
  FieldValue,
  FormField,
  ModuleDefinition,
  ModuleFeature
} from '../lib/module-ui';
import { useUserRole } from './user-role-context';
import { StandardDataTable, ColumnDefinition } from './ui/standard-data-table';
import { SidePanel } from './ui/side-panel';

type FormValue = FieldValue;
type FormValues = Record<string, FormValue>;
type FilterValues = Record<string, FormValue>;

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
    if (field.type === 'json') { body[field.name] = JSON.parse(stringValue); continue; }
    body[field.name] = stringValue;
  }
  return body;
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
function ActionForm({ action, onSubmit, onCancel, initialValues }: { 
  action: FeatureAction, 
  onSubmit: (values: FormValues) => void,
  onCancel: () => void,
  initialValues?: FormValues 
}) {
  const [values, setValues] = useState<FormValues>(initialValues ?? createDefaultFormValues(action));

  const updateValue = (name: string, val: FormValue) => setValues(prev => ({ ...prev, [name]: val }));

  return (
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onSubmit(values); }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--primary)' }}>{action.label}</h3>
      {action.fields.map(field => (
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
      <div className="action-buttons" style={{ marginTop: '2rem' }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Xác nhận</button>
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Hủy</button>
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
  }, [feature.key]);

  useEffect(() => {
    if (feature.autoLoad !== false) loadData();
  }, [feature.key, search, filterValues]);

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

  const updateAction = feature.actions.find(a => 
    (a.method === 'PATCH' || a.method === 'PUT') && 
    (a.endpoint.includes(':id') || a.endpoint.includes(':code')) &&
    canRunAction({ role, moduleKey, action: a })
  );

  const columns: ColumnDefinition<any>[] = useMemo(() => {
    const keys = feature.columns ?? (rows.length > 0 ? Object.keys(rows[0]).filter(k => k !== 'tenant_Id').slice(0, 8) : []);
    
    return keys.map(k => {
      const fieldDef = updateAction?.fields.find(f => f.name === k);
      return {
        key: k,
        label: k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1'),
        render: (r: any) => formatCellValue(r[k]),
        type: fieldDef?.type as any,
        options: fieldDef?.options
      };
    });
  }, [feature.columns, rows, updateAction]);

  const createAction = feature.actions.find(a => a.method === 'POST' && !a.endpoint.includes(':id'));
  const rowActions = feature.actions.filter(a => a !== createAction && canRunAction({ role, moduleKey, action: a }));

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
        data={rows}
        columns={columns}
        isLoading={isLoading}
        onRowClick={(r) => setSelectedRow(r)}
        storageKey={`erp.workbench.${moduleKey}.${feature.key}`}
        editableKeys={updateAction ? updateAction.fields.map(f => f.name) : []}
        onSaveRow={updateAction ? (id, values) => handleAction(updateAction, { ...values, id } as FormValues) : undefined}
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
