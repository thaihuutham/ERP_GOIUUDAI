'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload, normalizeObjectPayload } from '../lib/api-client';
import { getRecommendedPresets } from '../lib/action-presets';
import { canRunAction, type UserRole } from '../lib/rbac';
import type {
  FeatureAction,
  FeatureFilter,
  FieldValue,
  FormField,
  ModuleDefinition,
  ModuleFeature
} from '../lib/module-ui';
import { useUserRole } from './user-role-context';

type FormValue = FieldValue;
type FormValues = Record<string, FormValue>;
type FilterValues = Record<string, FormValue>;

type QuickRange = '7D' | '30D' | 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'ALL';

type AdvancedOperator =
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_empty'
  | 'not_empty';

type AdvancedCondition = {
  id: string;
  field: string;
  operator: AdvancedOperator;
  value: string;
};

type ChartDatum = {
  label: string;
  value: number;
};

const QUICK_RANGE_OPTIONS: Array<{ key: QuickRange; label: string }> = [
  { key: '7D', label: '7 ngày' },
  { key: '30D', label: '30 ngày' },
  { key: 'THIS_MONTH', label: 'Tháng này' },
  { key: 'LAST_MONTH', label: 'Tháng trước' },
  { key: 'THIS_YEAR', label: 'Năm nay' },
  { key: 'ALL', label: 'Toàn bộ' }
];

const ADVANCED_OPERATOR_OPTIONS: Array<{ value: AdvancedOperator; label: string }> = [
  { value: 'contains', label: 'Chứa' },
  { value: 'equals', label: 'Bằng' },
  { value: 'not_equals', label: 'Khác' },
  { value: 'starts_with', label: 'Bắt đầu bằng' },
  { value: 'ends_with', label: 'Kết thúc bằng' },
  { value: 'gt', label: 'Lớn hơn' },
  { value: 'gte', label: 'Lớn hơn hoặc bằng' },
  { value: 'lt', label: 'Nhỏ hơn' },
  { value: 'lte', label: 'Nhỏ hơn hoặc bằng' },
  { value: 'is_empty', label: 'Để trống' },
  { value: 'not_empty', label: 'Không trống' }
];

function getInitialValue(field: FormField): FormValue {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }
  if (field.type === 'checkbox') {
    return false;
  }
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
    if (filter.defaultValue !== undefined) {
      acc[filter.key] = filter.defaultValue;
      return acc;
    }

    if (filter.type === 'checkbox') {
      acc[filter.key] = false;
      return acc;
    }

    acc[filter.key] = '';
    return acc;
  }, {});
}

function parseFormPayload(action: FeatureAction, formValues: FormValues) {
  const body: Record<string, unknown> = {};

  for (const field of action.fields) {
    const raw = formValues[field.name];

    if (field.type === 'checkbox') {
      body[field.name] = Boolean(raw);
      continue;
    }

    const stringValue = String(raw ?? '').trim();
    if (!stringValue) {
      continue;
    }

    if (field.type === 'number') {
      const num = Number(stringValue);
      if (!Number.isNaN(num)) {
        body[field.name] = num;
      }
      continue;
    }

    if (field.type === 'json') {
      body[field.name] = JSON.parse(stringValue);
      continue;
    }

    body[field.name] = stringValue;
  }

  return body;
}

function applyPathParams(endpoint: string, body: Record<string, unknown>) {
  const usedKeys = new Set<string>();
  const resolved = endpoint.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    const raw = body[key];
    if (raw === undefined || raw === null || raw === '') {
      throw new Error(`Thiếu giá trị cho tham số đường dẫn: ${key}`);
    }
    usedKeys.add(key);
    return encodeURIComponent(String(raw));
  });

  if (usedKeys.size === 0) {
    return { endpoint: resolved, body };
  }

  const nextBody: Record<string, unknown> = {};
  Object.entries(body).forEach(([key, value]) => {
    if (!usedKeys.has(key)) {
      nextBody[key] = value;
    }
  });

  return {
    endpoint: resolved,
    body: nextBody
  };
}

function detectDateField(feature: ModuleFeature, rows: Record<string, unknown>[]) {
  const preferred = ['createdAt', 'workDate', 'entryDate', 'purchaseAt', 'dueAt', 'startDate', 'startAt', 'updatedAt'];
  const rowKeys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const columnKeys = feature.columns ?? [];
  const candidates = new Set<string>([...columnKeys, ...rowKeys]);

  for (const key of preferred) {
    if (candidates.has(key)) {
      return key;
    }
  }

  for (const key of candidates) {
    if (/(date|at)$/i.test(key)) {
      return key;
    }
  }

  return null;
}

function hasStatusField(feature: ModuleFeature, rows: Record<string, unknown>[]) {
  if (feature.columns?.includes('status')) {
    return true;
  }
  return rows.length > 0 && 'status' in rows[0];
}

function buildAutoFilters(feature: ModuleFeature, rows: Record<string, unknown>[]): FeatureFilter[] {
  if (feature.view === 'object' || !feature.listEndpoint) {
    return [];
  }

  const filters: FeatureFilter[] = [
    {
      key: 'q',
      label: 'Tìm kiếm',
      type: 'text',
      behavior: 'search',
      placeholder: 'Tìm theo từ khóa'
    }
  ];

  if (hasStatusField(feature, rows)) {
    filters.push({
      key: 'status',
      label: 'Trạng thái',
      type: 'select',
      behavior: 'exact',
      targetField: 'status',
      options: [
        { label: 'ALL', value: 'ALL' },
        { label: 'ACTIVE', value: 'ACTIVE' },
        { label: 'INACTIVE', value: 'INACTIVE' },
        { label: 'DRAFT', value: 'DRAFT' },
        { label: 'PENDING', value: 'PENDING' },
        { label: 'APPROVED', value: 'APPROVED' },
        { label: 'REJECTED', value: 'REJECTED' },
        { label: 'ARCHIVED', value: 'ARCHIVED' }
      ],
      defaultValue: 'ALL'
    });
  }

  const dateField = detectDateField(feature, rows);
  if (dateField) {
    filters.push(
      {
        key: 'dateFrom',
        label: 'Từ ngày',
        type: 'date',
        behavior: 'date_from',
        targetField: dateField,
        includeInQuery: false
      },
      {
        key: 'dateTo',
        label: 'Đến ngày',
        type: 'date',
        behavior: 'date_to',
        targetField: dateField,
        includeInQuery: false
      }
    );
  }

  return filters;
}

function buildQueryFromFilters(filters: FeatureFilter[], values: FilterValues) {
  const query: Record<string, string | number | boolean> = {};

  for (const filter of filters) {
    if (filter.includeInQuery === false) {
      continue;
    }

    const value = values[filter.key];
    if (value === undefined || value === null || value === '' || value === 'ALL') {
      continue;
    }

    if (typeof value === 'boolean' && value === false) {
      continue;
    }

    query[filter.queryParam ?? filter.key] = value;
  }

  return query;
}

function applyClientFilters(rows: Record<string, unknown>[], filters: FeatureFilter[], values: FilterValues) {
  if (rows.length === 0 || filters.length === 0) {
    return rows;
  }

  return rows.filter((row) => {
    return filters.every((filter) => {
      const value = values[filter.key];
      if (value === undefined || value === null || value === '' || value === 'ALL') {
        return true;
      }

      if (typeof value === 'boolean' && value === false) {
        return true;
      }

      const behavior = filter.behavior ?? (filter.type === 'select' ? 'exact' : 'contains');

      if (behavior === 'search') {
        const haystack = JSON.stringify(row).toLowerCase();
        return haystack.includes(String(value).toLowerCase());
      }

      const field = filter.targetField ?? filter.key;
      const rowValue = row[field];

      if (behavior === 'date_from' || behavior === 'date_to') {
        if (!rowValue) {
          return false;
        }
        const rowDate = new Date(String(rowValue));
        const filterDate = new Date(String(value));
        if (Number.isNaN(rowDate.getTime()) || Number.isNaN(filterDate.getTime())) {
          return true;
        }

        if (behavior === 'date_from') {
          return rowDate >= filterDate;
        }
        filterDate.setHours(23, 59, 59, 999);
        return rowDate <= filterDate;
      }

      if (behavior === 'boolean') {
        return Boolean(rowValue) === Boolean(value);
      }

      if (rowValue === null || rowValue === undefined) {
        return false;
      }

      const rowText = String(rowValue).toLowerCase();
      const queryText = String(value).toLowerCase();

      if (behavior === 'exact') {
        return rowText === queryText;
      }

      return rowText.includes(queryText);
    });
  });
}

function getQuickRangeBounds(range: QuickRange) {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  if (range === 'ALL') {
    return null;
  }

  if (range === '7D') {
    const from = new Date(startOfToday);
    from.setDate(from.getDate() - 6);
    return { from, to: endOfToday };
  }

  if (range === '30D') {
    const from = new Date(startOfToday);
    from.setDate(from.getDate() - 29);
    return { from, to: endOfToday };
  }

  if (range === 'THIS_MONTH') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }

  if (range === 'LAST_MONTH') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from, to };
  }

  const from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  return { from, to };
}

function applyQuickRange(rows: Record<string, unknown>[], dateField: string | null, range: QuickRange) {
  if (rows.length === 0 || range === 'ALL' || !dateField) {
    return rows;
  }

  const bounds = getQuickRangeBounds(range);
  if (!bounds) {
    return rows;
  }

  return rows.filter((row) => {
    const value = row[dateField];
    if (!value) {
      return false;
    }
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    return date >= bounds.from && date <= bounds.to;
  });
}

function applyAdvancedConditions(rows: Record<string, unknown>[], conditions: AdvancedCondition[]) {
  if (conditions.length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    conditions.every((condition) => {
      const rowValue = row[condition.field];
      const rowText = rowValue === null || rowValue === undefined ? '' : String(rowValue);
      const source = rowText.toLowerCase();
      const target = condition.value.toLowerCase();

      if (condition.operator === 'is_empty') {
        return source.trim() === '';
      }
      if (condition.operator === 'not_empty') {
        return source.trim() !== '';
      }
      if (condition.operator === 'contains') {
        return source.includes(target);
      }
      if (condition.operator === 'equals') {
        return source === target;
      }
      if (condition.operator === 'not_equals') {
        return source !== target;
      }
      if (condition.operator === 'starts_with') {
        return source.startsWith(target);
      }
      if (condition.operator === 'ends_with') {
        return source.endsWith(target);
      }

      const left = Number(rowValue);
      const right = Number(condition.value);
      if (Number.isNaN(left) || Number.isNaN(right)) {
        return false;
      }

      if (condition.operator === 'gt') {
        return left > right;
      }
      if (condition.operator === 'gte') {
        return left >= right;
      }
      if (condition.operator === 'lt') {
        return left < right;
      }
      if (condition.operator === 'lte') {
        return left <= right;
      }

      return true;
    })
  );
}

function looksLikeIsoDate(value: string) {
  return /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || /\d{4}-\d{2}-\d{2}/.test(value);
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  if (typeof value === 'string') {
    if (looksLikeIsoDate(value)) {
      const dt = new Date(value);
      if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleString('vi-VN');
      }
    }
    return value;
  }
  return JSON.stringify(value);
}

function selectColumns(rows: Record<string, unknown>[], predefined?: string[]) {
  if (predefined && predefined.length > 0) {
    return predefined;
  }

  if (rows.length === 0) {
    return [];
  }

  const hidden = new Set(['tenant_Id']);
  return Object.keys(rows[0]).filter((key) => !hidden.has(key)).slice(0, 10);
}

function getFilterableFields(feature: ModuleFeature, rows: Record<string, unknown>[]) {
  const fromFeature = feature.columns ?? [];
  const fromRows = rows.length > 0 ? Object.keys(rows[0]) : [];
  const merged = Array.from(new Set([...fromFeature, ...fromRows]));
  return merged.filter((item) => item !== 'tenant_Id');
}

function buildStatusChartData(rows: Record<string, unknown>[]): ChartDatum[] {
  const statusMap = new Map<string, number>();

  for (const row of rows) {
    const status = String(row.status ?? 'UNKNOWN');
    statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
  }

  return Array.from(statusMap.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function buildDateChartData(rows: Record<string, unknown>[], dateField: string | null): ChartDatum[] {
  if (!dateField) {
    return [];
  }

  const dateMap = new Map<string, number>();
  for (const row of rows) {
    const raw = row[dateField];
    if (!raw) {
      continue;
    }
    const date = new Date(String(raw));
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    const key = date.toISOString().slice(0, 10);
    dateMap.set(key, (dateMap.get(key) ?? 0) + 1);
  }

  return Array.from(dateMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-10)
    .map(([label, value]) => ({ label, value }));
}

function getPrimaryMetric(rows: Record<string, unknown>[], columns: string[]) {
  const numericColumn = columns.find((column) =>
    rows.some((row) => {
      const value = row[column];
      if (typeof value === 'number') {
        return true;
      }
      const num = Number(value);
      return !Number.isNaN(num);
    })
  );

  if (!numericColumn) {
    return null;
  }

  const total = rows.reduce((sum, row) => {
    const num = Number(row[numericColumn]);
    return Number.isNaN(num) ? sum : sum + num;
  }, 0);

  return {
    key: numericColumn,
    total
  };
}

function FeaturePanel({ feature, moduleKey, role }: { feature: ModuleFeature; moduleKey: string; role: UserRole }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [objectPayload, setObjectPayload] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [quickRange, setQuickRange] = useState<QuickRange>('ALL');
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const [advancedConditions, setAdvancedConditions] = useState<AdvancedCondition[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formValuesMap, setFormValuesMap] = useState<Record<string, FormValues>>(() =>
    feature.actions.reduce<Record<string, FormValues>>((acc, action) => {
      acc[action.key] = createDefaultFormValues(action);
      return acc;
    }, {})
  );

  const dateField = useMemo(() => detectDateField(feature, rows), [feature, rows]);
  const effectiveFilters = useMemo(
    () => (feature.filters && feature.filters.length > 0 ? feature.filters : buildAutoFilters(feature, rows)),
    [feature, rows]
  );
  const filterSignature = useMemo(
    () => effectiveFilters.map((f) => `${f.key}:${String(f.defaultValue ?? '')}`).join('|'),
    [effectiveFilters]
  );

  const quickRangeRows = useMemo(() => applyQuickRange(rows, dateField, quickRange), [rows, dateField, quickRange]);
  const rowsAfterBasicFilters = useMemo(
    () => applyClientFilters(quickRangeRows, effectiveFilters, filterValues),
    [quickRangeRows, effectiveFilters, filterValues]
  );
  const rowsAfterAdvancedFilters = useMemo(
    () => applyAdvancedConditions(rowsAfterBasicFilters, advancedConditions),
    [rowsAfterBasicFilters, advancedConditions]
  );

  const columns = useMemo(() => selectColumns(rowsAfterAdvancedFilters, feature.columns), [feature.columns, rowsAfterAdvancedFilters]);
  const filterableFields = useMemo(
    () => getFilterableFields(feature, rowsAfterAdvancedFilters.length > 0 ? rowsAfterAdvancedFilters : rows),
    [feature, rows, rowsAfterAdvancedFilters]
  );

  const totalPages = Math.max(1, Math.ceil(rowsAfterAdvancedFilters.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rowsAfterAdvancedFilters.slice(start, start + pageSize);
  }, [rowsAfterAdvancedFilters, page, pageSize]);

  const statusChart = useMemo(() => buildStatusChartData(rowsAfterAdvancedFilters), [rowsAfterAdvancedFilters]);
  const dateChart = useMemo(() => buildDateChartData(rowsAfterAdvancedFilters, dateField), [rowsAfterAdvancedFilters, dateField]);
  const primaryMetric = useMemo(() => getPrimaryMetric(rowsAfterAdvancedFilters, columns), [rowsAfterAdvancedFilters, columns]);
  const permittedActions = useMemo(
    () =>
      feature.actions.filter((action) =>
        canRunAction({
          role,
          moduleKey,
          action
        })
      ),
    [feature.actions, moduleKey, role]
  );

  useEffect(() => {
    setFilterValues((prev) => {
      const defaults = createDefaultFilterValues(effectiveFilters);
      const next: FilterValues = { ...defaults };
      Object.keys(prev).forEach((key) => {
        if (key in next) {
          next[key] = prev[key];
        }
      });
      return next;
    });
  }, [filterSignature, effectiveFilters]);

  useEffect(() => {
    setPage(1);
  }, [quickRange, filterValues, advancedConditions, pageSize, feature.key]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const loadData = async (pathOverride?: string, queryOverride?: Record<string, string | number | boolean>) => {
    if (!feature.listEndpoint && !pathOverride) {
      return;
    }

    const targetPath = pathOverride ?? feature.listEndpoint;
    if (!targetPath) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const payload = await apiRequest(targetPath, {
        query: queryOverride ?? buildQueryFromFilters(effectiveFilters, filterValues)
      });
      setRows(normalizeListPayload(payload));
      setObjectPayload(normalizeObjectPayload(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (feature.autoLoad === false || !feature.listEndpoint) {
      return;
    }
    void loadData(undefined, buildQueryFromFilters(effectiveFilters, filterValues));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature.listEndpoint, feature.autoLoad, filterSignature]);

  const updateFieldValue = (actionKey: string, fieldName: string, value: FormValue) => {
    setFormValuesMap((prev) => ({
      ...prev,
      [actionKey]: {
        ...prev[actionKey],
        [fieldName]: value
      }
    }));
  };

  const updateFilterValue = (key: string, value: FormValue) => {
    setFilterValues((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const addAdvancedCondition = () => {
    if (filterableFields.length === 0) {
      return;
    }
    const id = `cond-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setAdvancedConditions((prev) => [
      ...prev,
      {
        id,
        field: filterableFields[0],
        operator: 'contains',
        value: ''
      }
    ]);
  };

  const updateAdvancedCondition = (id: string, patch: Partial<AdvancedCondition>) => {
    setAdvancedConditions((prev) =>
      prev.map((condition) => (condition.id === id ? { ...condition, ...patch } : condition))
    );
  };

  const removeAdvancedCondition = (id: string) => {
    setAdvancedConditions((prev) => prev.filter((condition) => condition.id !== id));
  };

  const resetFilters = () => {
    setQuickRange('ALL');
    setFilterValues(createDefaultFilterValues(effectiveFilters));
    setAdvancedConditions([]);
    if (feature.listEndpoint) {
      void loadData(feature.listEndpoint, {});
    }
  };

  const submitAction = async (event: FormEvent<HTMLFormElement>, action: FeatureAction) => {
    event.preventDefault();
    setErrorMessage(null);
    setResultMessage(null);

    try {
      const sourceFormValues = formValuesMap[action.key] ?? createDefaultFormValues(action);
      const parsedBody = parseFormPayload(action, sourceFormValues);
      const resolved = applyPathParams(action.endpoint, parsedBody);
      const method = action.method;

      const payload = await apiRequest(resolved.endpoint, {
        method,
        body: method === 'GET' || method === 'DELETE' ? undefined : resolved.body
      });

      setResultMessage(`${action.label} thành công.`);

      if (method === 'GET') {
        setRows(normalizeListPayload(payload));
        setObjectPayload(normalizeObjectPayload(payload));
      } else if (feature.listEndpoint) {
        await loadData();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể thực thi thao tác.');
    }
  };

  const statusMax = Math.max(...statusChart.map((item) => item.value), 1);
  const dateMax = Math.max(...dateChart.map((item) => item.value), 1);

  return (
    <section className="feature-panel">
      <header className="feature-head">
        <div>
          <h2>{feature.title}</h2>
          <p>{feature.description}</p>
        </div>
        {feature.listEndpoint ? (
          <button type="button" className="btn btn-ghost" onClick={() => void loadData()}>
            Tải lại
          </button>
        ) : null}
      </header>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}

      {feature.listEndpoint ? (
        <div className="panel-surface">
          <div className="quick-range-row">
            {QUICK_RANGE_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`quick-range-btn ${quickRange === item.key ? 'active' : ''}`}
                onClick={() => setQuickRange(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {effectiveFilters.length > 0 ? (
            <form
              className="filter-bar"
              onSubmit={(event) => {
                event.preventDefault();
                void loadData();
              }}
            >
              <div className="filter-grid">
                {effectiveFilters.map((filter) => {
                  const type = filter.type ?? 'text';
                  const value = filterValues[filter.key] ?? '';
                  const inputId = `${feature.key}-${filter.key}-filter`;

                  return (
                    <div className="field" key={filter.key}>
                      <label htmlFor={inputId}>{filter.label}</label>

                      {type === 'select' ? (
                        <select
                          id={inputId}
                          value={String(value)}
                          onChange={(event) => updateFilterValue(filter.key, event.target.value)}
                        >
                          <option value="">-- tất cả --</option>
                          {(filter.options ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {type === 'checkbox' ? (
                        <div className="checkbox-wrap">
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={Boolean(value)}
                            onChange={(event) => updateFilterValue(filter.key, event.target.checked)}
                          />
                          <span>Bật</span>
                        </div>
                      ) : null}

                      {type !== 'select' && type !== 'checkbox' ? (
                        <input
                          id={inputId}
                          type={type}
                          value={String(value)}
                          placeholder={filter.placeholder}
                          onChange={(event) => updateFilterValue(filter.key, event.target.value)}
                        />
                      ) : null}

                      {filter.description ? <small>{filter.description}</small> : null}
                    </div>
                  );
                })}
              </div>

              <div className="filter-actions">
                <button type="submit" className="btn btn-ghost">
                  Lọc dữ liệu
                </button>
                <button type="button" className="btn btn-ghost" onClick={resetFilters}>
                  Đặt lại
                </button>
              </div>
            </form>
          ) : null}

          {filterableFields.length > 0 ? (
            <div className="advanced-filter-panel">
              <div className="advanced-filter-head">
                <h3>Lọc nâng cao</h3>
                <button type="button" className="btn btn-ghost" onClick={addAdvancedCondition}>
                  + Điều kiện
                </button>
              </div>

              {advancedConditions.length === 0 ? (
                <p className="muted">Chưa có điều kiện nâng cao.</p>
              ) : (
                <div className="advanced-condition-list">
                  {advancedConditions.map((condition) => (
                    <div key={condition.id} className="advanced-condition-row">
                      <select
                        value={condition.field}
                        onChange={(event) =>
                          updateAdvancedCondition(condition.id, { field: event.target.value })
                        }
                      >
                        {filterableFields.map((field) => (
                          <option key={field} value={field}>
                            {field}
                          </option>
                        ))}
                      </select>

                      <select
                        value={condition.operator}
                        onChange={(event) =>
                          updateAdvancedCondition(condition.id, {
                            operator: event.target.value as AdvancedOperator
                          })
                        }
                      >
                        {ADVANCED_OPERATOR_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>

                      {!['is_empty', 'not_empty'].includes(condition.operator) ? (
                        <input
                          type="text"
                          value={condition.value}
                          placeholder="Giá trị"
                          onChange={(event) =>
                            updateAdvancedCondition(condition.id, { value: event.target.value })
                          }
                        />
                      ) : (
                        <input type="text" value="(không cần nhập)" disabled />
                      )}

                      <button type="button" className="btn btn-ghost" onClick={() => removeAdvancedCondition(condition.id)}>
                        Xóa
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {isLoading ? <p className="muted">Đang tải dữ liệu...</p> : null}

          {!isLoading && feature.view === 'object' && objectPayload ? (
            <dl className="kv-grid">
              {Object.entries(objectPayload).map(([key, value]) => (
                <div key={key} className="kv-item">
                  <dt>{key}</dt>
                  <dd>{formatCellValue(value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {!isLoading && feature.view !== 'object' ? (
            rowsAfterAdvancedFilters.length > 0 ? (
              <>
                <section className="overview-cards">
                  <article className="overview-card">
                    <p>Tổng bản ghi</p>
                    <strong>{rowsAfterAdvancedFilters.length.toLocaleString('vi-VN')}</strong>
                  </article>
                  <article className="overview-card">
                    <p>Hiển thị trang</p>
                    <strong>{paginatedRows.length.toLocaleString('vi-VN')}</strong>
                  </article>
                  <article className="overview-card">
                    <p>{primaryMetric ? `Tổng ${primaryMetric.key}` : 'Chỉ số chính'}</p>
                    <strong>
                      {primaryMetric ? primaryMetric.total.toLocaleString('vi-VN') : '--'}
                    </strong>
                  </article>
                </section>

                <section className="module-chart-grid">
                  <article className="chart-card">
                    <h3>Phân bố trạng thái</h3>
                    <div className="status-chart">
                      {statusChart.length === 0 ? (
                        <p className="muted">Không có dữ liệu trạng thái.</p>
                      ) : (
                        statusChart.map((item) => (
                          <div key={item.label} className="status-chart-row">
                            <span>{item.label}</span>
                            <div className="status-chart-track">
                              <div
                                className="status-chart-bar"
                                style={{ width: `${(item.value / statusMax) * 100}%` }}
                              />
                            </div>
                            <strong>{item.value}</strong>
                          </div>
                        ))
                      )}
                    </div>
                  </article>

                  <article className="chart-card">
                    <h3>Xu hướng theo ngày</h3>
                    <div className="trend-chart">
                      {dateChart.length === 0 ? (
                        <p className="muted">Không có dữ liệu ngày để dựng biểu đồ.</p>
                      ) : (
                        dateChart.map((item) => (
                          <div key={item.label} className="trend-chart-col">
                            <div className="trend-chart-value">{item.value}</div>
                            <div
                              className="trend-chart-bar"
                              style={{ height: `${Math.max((item.value / dateMax) * 100, 6)}%` }}
                            />
                            <span>{item.label.slice(5)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                </section>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row, rowIndex) => (
                        <tr key={String(row.id ?? rowIndex)}>
                          {columns.map((column) => (
                            <td key={`${String(row.id ?? rowIndex)}-${column}`}>{formatCellValue(row[column])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pagination-row">
                  <div className="pagination-left">
                    <span>Số dòng / trang</span>
                    <select
                      value={String(pageSize)}
                      onChange={(event) => setPageSize(Number(event.target.value))}
                    >
                      <option value="10">10</option>
                      <option value="20">20</option>
                      <option value="50">50</option>
                    </select>
                  </div>
                  <div className="pagination-right">
                    <span>
                      Trang {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={page <= 1}
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    >
                      Trước
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={page >= totalPages}
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    >
                      Sau
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">{feature.emptyMessage ?? 'Chưa có dữ liệu cho feature này.'}</p>
            )
          ) : null}
        </div>
      ) : null}

      {feature.actions.length > 0 ? (
        <div className="actions-grid">
          {permittedActions.map((action) => {
            const formValues = formValuesMap[action.key] ?? createDefaultFormValues(action);
            const actionPresets = action.presets && action.presets.length > 0 ? action.presets : getRecommendedPresets(action.key);

            return (
              <form key={action.key} className="action-card" onSubmit={(event) => void submitAction(event, action)}>
                <h3>{action.label}</h3>
                {action.description ? <p className="muted">{action.description}</p> : null}
                {actionPresets.length > 0 ? (
                  <div className="preset-row">
                    {actionPresets.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        className="preset-chip"
                        onClick={() => {
                          setFormValuesMap((prev) => ({
                            ...prev,
                            [action.key]: {
                              ...(prev[action.key] ?? createDefaultFormValues(action)),
                              ...preset.values
                            }
                          }));
                        }}
                        title={preset.description}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="form-grid">
                  {action.fields.map((field) => {
                    const inputId = `${feature.key}-${action.key}-${field.name}`;
                    const value = formValues[field.name];
                    const type = field.type ?? 'text';

                    return (
                      <div className="field" key={field.name}>
                        <label htmlFor={inputId}>{field.label}</label>
                        {type === 'textarea' ? (
                          <textarea
                            id={inputId}
                            value={String(value ?? '')}
                            required={field.required}
                            placeholder={field.placeholder}
                            onChange={(event) => updateFieldValue(action.key, field.name, event.target.value)}
                          />
                        ) : null}

                        {type === 'select' ? (
                          <select
                            id={inputId}
                            value={String(value ?? '')}
                            required={field.required}
                            onChange={(event) => updateFieldValue(action.key, field.name, event.target.value)}
                          >
                            {!field.required ? <option value="">-- chọn --</option> : null}
                            {(field.options ?? []).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : null}

                        {type === 'checkbox' ? (
                          <div className="checkbox-wrap">
                            <input
                              id={inputId}
                              type="checkbox"
                              checked={Boolean(value)}
                              onChange={(event) => updateFieldValue(action.key, field.name, event.target.checked)}
                            />
                            <span>Bật</span>
                          </div>
                        ) : null}

                        {type !== 'textarea' && type !== 'select' && type !== 'checkbox' ? (
                          <input
                            id={inputId}
                            type={type}
                            value={String(value ?? '')}
                            required={field.required}
                            placeholder={field.placeholder}
                            onChange={(event) => updateFieldValue(action.key, field.name, event.target.value)}
                          />
                        ) : null}

                        {field.description ? <small>{field.description}</small> : null}
                      </div>
                    );
                  })}
                </div>

                <div className="action-buttons">
                  <button type="submit" className="btn btn-primary">
                    {action.submitLabel ?? action.label}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setFormValuesMap((prev) => ({
                        ...prev,
                        [action.key]: createDefaultFormValues(action)
                      }))
                    }
                  >
                    Làm mới form
                  </button>
                </div>
              </form>
            );
          })}
        </div>
      ) : null}

      {feature.actions.length > 0 && permittedActions.length === 0 ? (
        <p className="banner banner-warning">
          Vai trò `{role}` chỉ có quyền xem dữ liệu tại feature này. Hành động cập nhật đã được ẩn theo RBAC.
        </p>
      ) : null}
    </section>
  );
}

export function ModuleWorkbench({ module }: { module: ModuleDefinition }) {
  const { role } = useUserRole();
  const [activeFeatureKey, setActiveFeatureKey] = useState(module.features[0]?.key ?? '');

  useEffect(() => {
    if (!module.features.some((feature) => feature.key === activeFeatureKey)) {
      setActiveFeatureKey(module.features[0]?.key ?? '');
    }
  }, [activeFeatureKey, module.features]);

  const activeFeature = module.features.find((feature) => feature.key === activeFeatureKey) ?? module.features[0];

  return (
    <article className="module-workbench">
      <header className="module-header">
        <div>
          <h1>{module.title}</h1>
          <p>{module.summary}</p>
        </div>
        <ul>
          {module.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      </header>

      <div className="module-body-grid">
        <aside className="module-feature-menu">
          <h3>Menu phân hệ</h3>
          <div className="module-feature-links">
            {module.features.map((feature) => (
              <button
                key={feature.key}
                type="button"
                className={`module-feature-link ${feature.key === activeFeature?.key ? 'active' : ''}`}
                onClick={() => setActiveFeatureKey(feature.key)}
              >
                {feature.title}
              </button>
            ))}
          </div>
        </aside>

        <section className="module-feature-content">
          {activeFeature ? <FeaturePanel key={activeFeature.key} feature={activeFeature} moduleKey={module.key} role={role} /> : null}
        </section>
      </div>
    </article>
  );
}
