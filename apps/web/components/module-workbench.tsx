'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, RefreshCw, Filter, FileText, LayoutDashboard, ChevronRight, Database, Edit2, Trash2, CheckCircle2, ShieldAlert } from 'lucide-react';
import {
  apiRequest,
  normalizeListPayload,
  normalizePagedListPayload,
  type ApiListPageInfo,
  type ApiListSortMeta
} from '../lib/api-client';
import { inferPermissionActionFromRequest } from '../lib/access-policy';
import { formatRuntimeDateTime, formatRuntimeNumber } from '../lib/runtime-format';
import {
  formatBulkSummary,
  runBulkOperation,
  type BulkExecutionResult,
  type BulkRowId
} from '../lib/bulk-actions';
import { useCursorTableState } from '../lib/use-cursor-table-state';
import type {
  FeatureAction,
  FeatureFilter,
  FieldValue,
  FormField,
  ModuleDefinition,
  ModuleFeature,
  SelectOption
} from '../lib/module-ui';
import { useAccessPolicy } from './access-policy-context';
import { CreateEntityDialog } from './ui';
import {
  StandardDataTable,
  ColumnDefinition,
  type StandardTableBulkAction
} from './ui/standard-data-table';
import { SidePanel } from './ui/side-panel';

type FormValue = FieldValue;
type FormValues = Record<string, FormValue>;
type FilterValues = Record<string, FormValue>;
type TableRow = Record<string, unknown> & { id: BulkRowId; __displaySequence?: number };

type RecordIdentityDisplayConfig = {
  mode: 'technical' | 'compact' | 'sequence';
  foreignKeyMode: 'technical' | 'compact';
  prefix: string;
  sequencePadding: number;
  compactLength: number;
};

const DEFAULT_RECORD_ID_DISPLAY_CONFIG: RecordIdentityDisplayConfig = {
  mode: 'compact',
  foreignKeyMode: 'compact',
  prefix: 'ID',
  sequencePadding: 5,
  compactLength: 8
};

const FOREIGN_KEY_PREFIX_OVERRIDES: Record<string, string> = {
  employeeId: 'EMP',
  customerId: 'CUS',
  vendorId: 'VEN',
  orderId: 'ORD',
  payrollId: 'PAY',
  productId: 'PRD',
  assetId: 'AST',
  projectId: 'PRJ',
  departmentId: 'DEP',
  positionId: 'POS',
  approverId: 'APR',
  requesterId: 'REQ',
  managerId: 'MGR',
  targetId: 'TGT',
  ownerId: 'OWN',
  createdBy: 'USR',
  updatedBy: 'USR'
};

function toDisplayInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.trunc(parsed);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function normalizeRecordIdDisplayConfig(raw: unknown): RecordIdentityDisplayConfig {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_RECORD_ID_DISPLAY_CONFIG;
  }

  const source = raw as Record<string, unknown>;
  const modeRaw = String(source.mode ?? DEFAULT_RECORD_ID_DISPLAY_CONFIG.mode).toLowerCase();
  const foreignKeyModeRaw = String(source.foreignKeyMode ?? DEFAULT_RECORD_ID_DISPLAY_CONFIG.foreignKeyMode).toLowerCase();
  const mode = modeRaw === 'technical' || modeRaw === 'compact' || modeRaw === 'sequence'
    ? modeRaw
    : DEFAULT_RECORD_ID_DISPLAY_CONFIG.mode;
  const foreignKeyMode = foreignKeyModeRaw === 'technical' || foreignKeyModeRaw === 'compact'
    ? foreignKeyModeRaw
    : DEFAULT_RECORD_ID_DISPLAY_CONFIG.foreignKeyMode;

  const normalizedPrefix = String(source.prefix ?? DEFAULT_RECORD_ID_DISPLAY_CONFIG.prefix)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');

  return {
    mode,
    foreignKeyMode,
    prefix: normalizedPrefix || DEFAULT_RECORD_ID_DISPLAY_CONFIG.prefix,
    sequencePadding: toDisplayInteger(
      source.sequencePadding,
      DEFAULT_RECORD_ID_DISPLAY_CONFIG.sequencePadding,
      2,
      10
    ),
    compactLength: toDisplayInteger(
      source.compactLength,
      DEFAULT_RECORD_ID_DISPLAY_CONFIG.compactLength,
      4,
      20
    )
  };
}

function sanitizeIdentifierToken(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '');
}

function splitKeyTokens(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function resolveForeignKeyPrefix(key: string, fallbackPrefix: string) {
  const keyLower = key.trim();
  const overridden = FOREIGN_KEY_PREFIX_OVERRIDES[keyLower];
  if (overridden) {
    return overridden;
  }

  const trimmed = keyLower.replace(/Id$/i, '');
  const tokens = splitKeyTokens(trimmed);
  if (tokens.length >= 2) {
    const acronym = tokens.map((token) => token[0]).join('').slice(0, 4).toUpperCase();
    if (acronym.length >= 2) {
      return acronym;
    }
  }

  const cleaned = sanitizeIdentifierToken(trimmed).toUpperCase();
  if (!cleaned) {
    return fallbackPrefix;
  }
  return cleaned.length <= 4 ? cleaned : cleaned.slice(0, 4);
}

function formatCompactIdentifier(value: string, prefix: string, compactLength: number) {
  const sanitized = sanitizeIdentifierToken(value);
  if (!sanitized) {
    return value;
  }
  const suffix = sanitized.slice(-Math.max(1, compactLength)).toUpperCase();
  return prefix ? `${prefix}-${suffix}` : suffix;
}

function formatIdentifierValue(
  key: string,
  value: unknown,
  row: TableRow,
  config: RecordIdentityDisplayConfig
) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  const raw = String(value).trim();
  if (!raw) {
    return '-';
  }

  const isPrimaryId = key === 'id';
  const isForeignId = !isPrimaryId && /Id$/i.test(key);
  if (!isPrimaryId && !isForeignId) {
    return formatCellValue(value);
  }

  if (isPrimaryId) {
    if (config.mode === 'technical') {
      return raw;
    }
    if (config.mode === 'sequence') {
      const sequence = toDisplayInteger(row.__displaySequence, 0, 0, Number.MAX_SAFE_INTEGER);
      if (sequence <= 0) {
        return raw;
      }
      const seqLabel = String(sequence).padStart(config.sequencePadding, '0');
      return config.prefix ? `${config.prefix}-${seqLabel}` : seqLabel;
    }
    return formatCompactIdentifier(raw, config.prefix, config.compactLength);
  }

  if (config.foreignKeyMode === 'technical') {
    return raw;
  }

  const foreignPrefix = resolveForeignKeyPrefix(key, config.prefix);
  return formatCompactIdentifier(raw, foreignPrefix, config.compactLength);
}

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

function countActiveFilters(filters: FeatureFilter[], values: FilterValues, search: string) {
  let count = search.trim() ? 1 : 0;
  for (const filter of filters) {
    const value = values[filter.key];
    const isEmpty = value === undefined || value === null || value === '';
    if (isEmpty) continue;
    if (typeof value === 'boolean' && value === false) continue;
    count += 1;
  }
  return count;
}

function describeDeniedActions(actionLabels: string[]) {
  if (actionLabels.length === 0) {
    return null;
  }
  if (actionLabels.length <= 3) {
    return actionLabels.join(', ');
  }
  const preview = actionLabels.slice(0, 3).join(', ');
  return `${preview} (+${actionLabels.length - 3} thao tác khác)`;
}

function readRecordValueByPath(row: Record<string, unknown>, path: string) {
  if (!path.includes('.')) {
    return row[path];
  }

  const segments = path.split('.');
  let current: unknown = row;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function dedupeSelectOptions(options: SelectOption[]) {
  const seen = new Set<string>();
  const result: SelectOption[] = [];
  for (const option of options) {
    const value = String(option.value ?? '').trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push({
      value,
      label: String(option.label ?? value).trim() || value
    });
  }
  return result;
}

function toSelectOptions(rows: Record<string, unknown>[], valueField = 'id', labelField = 'name') {
  return rows
    .map<SelectOption | null>((row) => {
      const valueRaw = readRecordValueByPath(row, valueField);
      if (valueRaw === undefined || valueRaw === null || valueRaw === '') {
        return null;
      }
      const labelRaw = readRecordValueByPath(row, labelField);
      const value = String(valueRaw);
      const label = labelRaw !== undefined && labelRaw !== null && labelRaw !== ''
        ? String(labelRaw)
        : value;
      return {
        value,
        label
      };
    })
    .filter((item): item is SelectOption => item !== null);
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

function isMissingRequiredValue(value: FormValue | undefined, fieldType: FormField['type']) {
  if (fieldType === 'checkbox') {
    return value !== true;
  }
  if (value === undefined || value === null) {
    return true;
  }
  return String(value).trim() === '';
}

// Sub-component for individual Feature Action Forms in SidePanel
function ActionForm({
  action,
  onSubmit,
  onSubmitAndAddAnother,
  onCancel,
  initialValues,
  hiddenFieldNames = [],
  isSubmitting = false,
  fieldOptionsByName = {},
  submitLabel,
  showSaveAndAddAnother = false
}: {
  action: FeatureAction;
  onSubmit: (values: FormValues) => Promise<boolean | void> | boolean | void;
  onSubmitAndAddAnother?: (values: FormValues) => Promise<boolean | void> | boolean | void;
  onCancel: () => void;
  initialValues?: FormValues;
  hiddenFieldNames?: string[];
  isSubmitting?: boolean;
  fieldOptionsByName?: Record<string, SelectOption[]>;
  submitLabel?: string;
  showSaveAndAddAnother?: boolean;
}) {
  const [values, setValues] = useState<FormValues>(initialValues ?? createDefaultFormValues(action));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [isRunningSubmit, setIsRunningSubmit] = useState(false);
  const hiddenSet = useMemo(() => new Set(hiddenFieldNames), [hiddenFieldNames]);
  const visibleFields = useMemo(
    () => action.fields.filter((field) => !hiddenSet.has(field.name)),
    [action.fields, hiddenSet]
  );
  const isBusy = isSubmitting || isRunningSubmit;

  useEffect(() => {
    setValues(initialValues ?? createDefaultFormValues(action));
    setFieldErrors({});
    setLocalMessage(null);
  }, [action, initialValues]);

  const updateValue = (name: string, val: FormValue) => setValues(prev => ({ ...prev, [name]: val }));

  const validateValues = useCallback((currentValues: FormValues) => {
    const nextErrors: Record<string, string> = {};
    for (const field of visibleFields) {
      if (!field.required) {
        continue;
      }
      if (isMissingRequiredValue(currentValues[field.name], field.type)) {
        nextErrors[field.name] = 'Trường này là bắt buộc.';
      }
    }
    return nextErrors;
  }, [visibleFields]);

  const submitInternal = useCallback(
    async (mode: 'submit' | 'submit-add-another') => {
      const nextErrors = validateValues(values);
      setFieldErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        setLocalMessage('Vui lòng hoàn thành các trường bắt buộc trước khi lưu.');
        return;
      }

      setLocalMessage(null);
      setIsRunningSubmit(true);
      try {
        const handler = mode === 'submit-add-another' && onSubmitAndAddAnother ? onSubmitAndAddAnother : onSubmit;
        const outcome = await handler(values);
        if (mode === 'submit-add-another' && outcome !== false) {
          setValues(createDefaultFormValues(action));
          setFieldErrors({});
          setLocalMessage('Đã lưu thành công. Bạn có thể thêm bản ghi tiếp theo.');
        }
      } catch (error) {
        setLocalMessage(error instanceof Error ? error.message : 'Không thể lưu dữ liệu.');
      } finally {
        setIsRunningSubmit(false);
      }
    },
    [action, onSubmit, onSubmitAndAddAnother, validateValues, values]
  );

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        void submitInternal('submit');
      }}
    >
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--primary)' }}>{action.label}</h3>
      {localMessage ? (
        <div
          className={Object.keys(fieldErrors).length > 0 ? 'banner banner-warning' : 'banner banner-success'}
          style={{ marginBottom: '0.25rem' }}
        >
          {localMessage}
        </div>
      ) : null}
      {visibleFields.map((field) => {
        const resolvedOptions = dedupeSelectOptions([
          ...(field.options ?? []),
          ...(fieldOptionsByName[field.name] ?? [])
        ]);
        const fieldError = fieldErrors[field.name];

        return (
          <div className="field" key={field.name}>
            <label>{field.label}</label>
            {field.type === 'textarea' ? (
              <textarea
                value={String(values[field.name] ?? '')}
                required={field.required}
                onChange={(event) => {
                  updateValue(field.name, event.target.value);
                  if (fieldError) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next[field.name];
                      return next;
                    });
                  }
                }}
              />
            ) : field.type === 'select' ? (
              <select
                value={String(values[field.name] ?? '')}
                required={field.required}
                onChange={(event) => {
                  updateValue(field.name, event.target.value);
                  if (fieldError) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next[field.name];
                      return next;
                    });
                  }
                }}
              >
                {!field.required && <option value="">-- chọn --</option>}
                {resolvedOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'autocomplete' ? (
              <>
                <input
                  list={`autocomplete-${action.key}-${field.name}`}
                  value={String(values[field.name] ?? '')}
                  required={field.required}
                  onChange={(event) => {
                    updateValue(field.name, event.target.value);
                    if (fieldError) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next[field.name];
                        return next;
                      });
                    }
                  }}
                />
                <datalist id={`autocomplete-${action.key}-${field.name}`}>
                  {resolvedOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </datalist>
              </>
            ) : field.type === 'checkbox' ? (
              <div className="checkbox-wrap">
                <input
                  type="checkbox"
                  checked={Boolean(values[field.name])}
                  onChange={(event) => {
                    updateValue(field.name, event.target.checked);
                    if (fieldError) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next[field.name];
                        return next;
                      });
                    }
                  }}
                />
                <span>Bật</span>
              </div>
            ) : (
              <input
                type={field.type ?? 'text'}
                value={String(values[field.name] ?? '')}
                required={field.required}
                onChange={(event) => {
                  updateValue(field.name, event.target.value);
                  if (fieldError) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next[field.name];
                      return next;
                    });
                  }
                }}
              />
            )}
            {fieldError ? (
              <p style={{ margin: '0.24rem 0 0', fontSize: '0.74rem', color: 'var(--danger)' }}>{fieldError}</p>
            ) : null}
          </div>
        );
      })}
      {visibleFields.length === 0 && (
        <p className="banner banner-info" style={{ margin: 0 }}>
          Không cần nhập thêm dữ liệu. Nhấn xác nhận để áp dụng cho toàn bộ bản ghi đã chọn.
        </p>
      )}
      <div className="action-buttons" style={{ marginTop: '2rem' }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isBusy}>
          {isBusy ? 'Đang xử lý...' : submitLabel ?? action.submitLabel ?? 'Xác nhận'}
        </button>
        {showSaveAndAddAnother ? (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={() => void submitInternal('submit-add-another')}
            disabled={isBusy}
          >
            Lưu & thêm mới
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel} disabled={isBusy}>
          Hủy
        </button>
      </div>
    </form>
  );
}

function FeaturePanel({ feature, moduleKey }: { feature: ModuleFeature; moduleKey: string }) {
  const searchParams = useSearchParams();
  const { canAction } = useAccessPolicy();
  const tablePageSize = 25;
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [recordIdDisplayConfig, setRecordIdDisplayConfig] = useState<RecordIdentityDisplayConfig>(
    DEFAULT_RECORD_ID_DISPLAY_CONFIG
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<FilterValues>(createDefaultFilterValues(feature.filters ?? []));
  const [tableSortBy, setTableSortBy] = useState('');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');
  const [tableSortMeta, setTableSortMeta] = useState<ApiListSortMeta | null>(null);
  const [tablePageInfo, setTablePageInfo] = useState<ApiListPageInfo | null>(null);
  
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [activeAction, setActiveAction] = useState<FeatureAction | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<BulkRowId[]>([]);
  const [pendingBulkAction, setPendingBulkAction] = useState<PendingBulkActionContext | null>(null);
  const [isRunningBulkAction, setIsRunningBulkAction] = useState(false);
  const [actionFieldOptionMap, setActionFieldOptionMap] = useState<Record<string, Record<string, SelectOption[]>>>({});
  const [filterOptionMap, setFilterOptionMap] = useState<Record<string, SelectOption[]>>({});
  const [isHydratingOptions, setIsHydratingOptions] = useState(false);
  const [optionLoadWarnings, setOptionLoadWarnings] = useState<string[]>([]);
  const featureFilters = feature.filters ?? [];
  const searchParamsKey = searchParams.toString();
  const activeFilterCount = useMemo(
    () => countActiveFilters(featureFilters, filterValues, search),
    [featureFilters, filterValues, search]
  );
  const tableFingerprint = useMemo(
    () =>
      JSON.stringify({
        featureKey: feature.key,
        search: search.trim(),
        filters: filterValues,
        sortBy: tableSortBy,
        sortDir: tableSortDir,
        limit: tablePageSize
      }),
    [feature.key, filterValues, search, tablePageSize, tableSortBy, tableSortDir]
  );
  const tablePager = useCursorTableState(tableFingerprint);

  const loadOptionsFromSource = useCallback(async (
    source: NonNullable<FormField['optionSource'] | FeatureFilter['optionSource']>
  ) => {
    const query: Record<string, string | number | boolean> = {
      ...(source.query ?? {})
    };
    if (source.limit && Number.isFinite(source.limit) && source.limit > 0 && query.limit === undefined) {
      query.limit = Math.trunc(source.limit);
    }
    if (query.limit === undefined) {
      query.limit = 100;
    }

    const payload = await apiRequest(source.endpoint, { query });
    const rows = normalizeListPayload(payload);
    const options = toSelectOptions(rows, source.valueField ?? 'id', source.labelField ?? 'name');
    return dedupeSelectOptions(options);
  }, []);

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

      query.limit = tablePageSize;
      if (tablePager.cursor) {
        query.cursor = tablePager.cursor;
      }
      if (tableSortBy) {
        query.sortBy = tableSortBy;
        query.sortDir = tableSortDir;
      }
      const payload = await apiRequest(feature.listEndpoint, { query });
      const normalized = normalizePagedListPayload(payload);
      setRows(normalized.items);
      setTablePageInfo(normalized.pageInfo);
      setTableSortMeta(normalized.sortMeta);
      tablePager.syncFromPageInfo(normalized.pageInfo);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  const resetSearchAndFilters = () => {
    setSearch('');
    setFilterValues(createDefaultFilterValues(featureFilters));
  };

  useEffect(() => {
    setFilterValues(createDefaultFilterValues(featureFilters));
    setSelectedRowIds([]);
    setTableSortBy('');
    setTableSortDir('desc');
    setTableSortMeta(null);
    setTablePageInfo(null);
    setPendingBulkAction((current) => {
      current?.resolve(undefined);
      return null;
    });
  }, [feature.key]);

  useEffect(() => {
    const nextSearch = searchParams.get('q') ?? '';
    const nextFilterValues = createDefaultFilterValues(featureFilters);
    for (const filter of featureFilters) {
      const queryKey = filter.queryParam ?? filter.key;
      const raw = searchParams.get(queryKey);
      if (raw === null || raw.trim() === '') {
        continue;
      }
      if (filter.type === 'checkbox') {
        const normalized = raw.trim().toLowerCase();
        nextFilterValues[filter.key] = normalized === 'true' || normalized === '1' || normalized === 'yes';
        continue;
      }
      nextFilterValues[filter.key] = raw;
    }
    setSearch(nextSearch);
    setFilterValues(nextFilterValues);
  }, [feature.key, featureFilters, searchParams, searchParamsKey]);

  useEffect(() => {
    let active = true;
    setIsHydratingOptions(true);
    setOptionLoadWarnings([]);
    setActionFieldOptionMap({});
    setFilterOptionMap({});

    const sourceCache = new Map<string, Promise<SelectOption[]>>();
    const sourceWarningSet = new Set<string>();
    const sourceKey = (source: NonNullable<FormField['optionSource'] | FeatureFilter['optionSource']>) =>
      JSON.stringify({
        endpoint: source.endpoint,
        valueField: source.valueField ?? 'id',
        labelField: source.labelField ?? 'name',
        query: source.query ?? {},
        limit: source.limit ?? 100
      });

    const getSourceOptions = (source: NonNullable<FormField['optionSource'] | FeatureFilter['optionSource']>) => {
      const key = sourceKey(source);
      const cached = sourceCache.get(key);
      if (cached) {
        return cached;
      }
      const request = loadOptionsFromSource(source).catch(() => {
        sourceWarningSet.add(source.endpoint);
        return [];
      });
      sourceCache.set(key, request);
      return request;
    };

    const hydrate = async () => {
      try {
        const actionEntries = await Promise.all(
          feature.actions.map(async (action) => {
            const fieldEntries = await Promise.all(
              action.fields.map(async (field) => {
                if (!field.optionSource) {
                  return [field.name, []] as const;
                }
                const options = await getSourceOptions(field.optionSource);
                return [field.name, options] as const;
              })
            );
            return [action.key, Object.fromEntries(fieldEntries)] as const;
          })
        );

        const filterEntries = await Promise.all(
          featureFilters.map(async (filter) => {
            if (!filter.optionSource) {
              return [filter.key, []] as const;
            }
            const options = await getSourceOptions(filter.optionSource);
            return [filter.key, options] as const;
          })
        );

        if (!active) {
          return;
        }

        setActionFieldOptionMap(Object.fromEntries(actionEntries));
        setFilterOptionMap(Object.fromEntries(filterEntries));
        setOptionLoadWarnings(Array.from(sourceWarningSet.values()));
      } finally {
        if (active) {
          setIsHydratingOptions(false);
        }
      }
    };

    void hydrate();
    return () => {
      active = false;
    };
  }, [feature.actions, feature.key, featureFilters, loadOptionsFromSource]);

  useEffect(() => {
    let active = true;
    const loadRecordIdDisplayConfig = async () => {
      try {
        const payload = await apiRequest<{ data?: Record<string, unknown> }>('/settings/domains/finance_controls');
        const financeData = payload?.data && typeof payload.data === 'object' ? payload.data : {};
        const financeRecord = financeData as Record<string, unknown>;
        if (!active) return;
        setRecordIdDisplayConfig(normalizeRecordIdDisplayConfig(financeRecord.recordIdentity));
      } catch {
        if (!active) return;
        setRecordIdDisplayConfig(DEFAULT_RECORD_ID_DISPLAY_CONFIG);
      }
    };
    void loadRecordIdDisplayConfig();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (feature.autoLoad !== false) loadData();
  }, [feature.key, search, filterValues, tablePager.currentPage, tableSortBy, tableSortDir]);

  useEffect(() => {
    return () => {
      pendingBulkAction?.resolve(undefined);
    };
  }, [pendingBulkAction]);

  const handleAction = async (
    action: FeatureAction,
    formValues: FormValues,
    options: { keepDialogOpen?: boolean } = {}
  ) => {
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
      if (!options.keepDialogOpen) {
        setActiveAction(null);
      }
      setSelectedRow(null);
      await loadData();
      return true;
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Thao tác thất bại');
      return false;
    }
  };

  const canExecuteFeatureAction = (action: FeatureAction) =>
    canAction(moduleKey, inferPermissionActionFromRequest(action.method, action.endpoint));

  const allowedActions = useMemo(
    () =>
      feature.actions.filter((action) =>
        canAction(moduleKey, inferPermissionActionFromRequest(action.method, action.endpoint))
      ),
    [feature.actions, canAction, moduleKey]
  );
  const deniedActions = useMemo(
    () =>
      feature.actions.filter(
        (action) => !canAction(moduleKey, inferPermissionActionFromRequest(action.method, action.endpoint))
      ),
    [feature.actions, canAction, moduleKey]
  );
  const deniedActionSummary = useMemo(
    () => describeDeniedActions(deniedActions.map((action) => action.label)),
    [deniedActions]
  );
  const createActionCandidate = feature.actions.find((action) => action.method === 'POST' && !action.endpoint.includes(':id'));
  const createAction = createActionCandidate && canExecuteFeatureAction(createActionCandidate)
    ? createActionCandidate
    : undefined;

  const updateAction = allowedActions.find((action) =>
    (action.method === 'PATCH' || action.method === 'PUT') &&
    (action.endpoint.includes(':id') || action.endpoint.includes(':code'))
  );

  const tableRows = useMemo(() => {
    const pageOffset = Math.max(0, (tablePager.currentPage - 1) * tablePageSize);
    return (rows as TableRow[]).map((row, index) => ({
      ...row,
      __displaySequence: pageOffset + index + 1
    }));
  }, [rows, tablePager.currentPage]);

  const columns: ColumnDefinition<TableRow>[] = useMemo(() => {
    const keys = feature.columns ?? (rows.length > 0 ? Object.keys(rows[0]).filter((key) => key !== 'tenant_Id').slice(0, 8) : []);

    return keys.map((key) => {
      const fieldDef = updateAction?.fields.find((field) => field.name === key);
      return {
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
        render: (row) => formatIdentifierValue(key, row[key], row, recordIdDisplayConfig),
        type: fieldDef?.type as any,
        options: fieldDef?.options
      };
    });
  }, [feature.columns, rows, updateAction, recordIdDisplayConfig]);

  const rowActions = allowedActions.filter((action) => action !== createAction);

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
          <div style={{ padding: '0.5rem 1rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={14} color="var(--primary)" /> <strong>{activeFilterCount}</strong> Bộ lọc đang bật
          </div>
          {feature.listEndpoint && (
            <button className="btn btn-ghost" onClick={() => loadData()}><RefreshCw size={14} /> Refresh</button>
          )}
        </div>
      </div>

      {errorMessage && <div className="banner banner-error" style={{ marginBottom: '1rem' }}>{errorMessage}</div>}
      {resultMessage && <div className="banner banner-success" style={{ marginBottom: '1rem' }}>{resultMessage}</div>}
      {isHydratingOptions && (
        <div className="banner banner-info" style={{ marginBottom: '1rem' }}>
          Đang đồng bộ danh mục lựa chọn cho biểu mẫu và bộ lọc...
        </div>
      )}
      {optionLoadWarnings.length > 0 && (
        <div className="banner banner-warning" style={{ marginBottom: '1rem' }}>
          Một số danh mục chưa tải được ({optionLoadWarnings.length} nguồn). Bạn vẫn có thể thao tác với dữ liệu đã có sẵn.
        </div>
      )}
      {deniedActions.length > 0 && deniedActionSummary && (
        <div className="banner banner-warning" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <ShieldAlert size={14} />
          Một số thao tác đang bị giới hạn theo quyền hiện tại: {deniedActionSummary}.
        </div>
      )}

      <StandardDataTable
        data={tableRows}
        columns={columns}
        isLoading={isLoading}
        loadingMessage={`Đang tải ${feature.title.toLowerCase()}...`}
        emptyMessage={feature.emptyMessage ?? `Chưa có dữ liệu cho ${feature.title.toLowerCase()}.`}
        toolbarLeftContent={(
          <>
            <div className="field" style={{ width: '320px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input
                  placeholder="Tìm kiếm nhanh..."
                  style={{ paddingLeft: '36px' }}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            {featureFilters.length > 0 ? (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.76rem', color: 'var(--muted)' }}>
                  <Filter size={14} /> Bộ lọc ({activeFilterCount})
                </span>
                {featureFilters.map((filter) => {
                  const value = filterValues[filter.key];
                  if (filter.type === 'select') {
                    const resolvedFilterOptions = dedupeSelectOptions([
                      ...(filter.options ?? []),
                      ...(filterOptionMap[filter.key] ?? [])
                    ]);
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
                        {resolvedFilterOptions.map((option) => (
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
                {activeFilterCount > 0 && (
                  <button type="button" className="btn btn-ghost" onClick={resetSearchAndFilters}>
                    Xóa bộ lọc
                  </button>
                )}
              </>
            ) : null}
          </>
        )}
        toolbarRightContent={(
          <>
            {createAction && (
              <button className="btn btn-primary" onClick={() => setActiveAction(createAction)}>
                <Plus size={16} /> Thêm dữ liệu
              </button>
            )}
            {!createAction && createActionCandidate && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                <ShieldAlert size={13} />
                Không có quyền tạo mới
              </span>
            )}
          </>
        )}
        onRowClick={(r) => setSelectedRow(r)}
        storageKey={`erp.workbench.${moduleKey}.${feature.key}`}
        pageInfo={
          tablePageInfo
            ? {
                currentPage: tablePager.currentPage,
                hasPrevPage: tablePager.hasPrevPage,
                hasNextPage: tablePager.hasNextPage,
                visitedPages: tablePager.visitedPages
              }
            : undefined
        }
        sortMeta={
          tableSortMeta ?? {
            sortBy: tableSortBy,
            sortDir: tableSortDir,
            sortableFields: []
          }
        }
        onPageNext={tablePageInfo ? tablePager.goNextPage : undefined}
        onPagePrev={tablePageInfo ? tablePager.goPrevPage : undefined}
        onJumpVisitedPage={tablePageInfo ? tablePager.jumpVisitedPage : undefined}
        onSortChange={(sortBy, sortDir) => {
          setTableSortBy(sortBy);
          setTableSortDir(sortDir);
        }}
        editableKeys={updateAction ? updateAction.fields.map(f => f.name) : []}
        onSaveRow={
          updateAction
            ? async (id, values) => {
                await handleAction(updateAction, { ...values, id } as FormValues);
              }
            : undefined
        }
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
                   <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
                     {formatIdentifierValue('id', selectedRow.id, selectedRow as TableRow, recordIdDisplayConfig)}
                   </h3>
                   <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Module: {moduleKey.toUpperCase()} • Feature: {feature.key}</p>
                </div>
             </div>

             <dl className="kv-grid" style={{ gridTemplateColumns: '1fr', gap: '0.75rem' }}>
               {Object.entries(selectedRow).filter(([k]) => k !== 'tenant_Id' && !k.startsWith('__')).map(([k, v]) => (
                 <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid var(--line-soft)' }}>
                   <dt style={{ color: 'var(--muted)', fontSize: '0.8125rem' }}>{k}</dt>
                   <dd style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                     {formatIdentifierValue(k, v, selectedRow as TableRow, recordIdDisplayConfig)}
                   </dd>
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
             {rowActions.length === 0 && (
               <p className="banner banner-info" style={{ marginTop: '1rem' }}>
                 Bạn đang ở chế độ chỉ xem cho bản ghi này.
               </p>
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
            fieldOptionsByName={actionFieldOptionMap[pendingBulkAction.action.key]}
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

      {/* Create Action Dialog (standardized Add Data flow) */}
      <CreateEntityDialog
        open={Boolean(activeAction && createAction && activeAction.key === createAction.key)}
        onClose={() => setActiveAction(null)}
        entityLabel={feature.title}
        helperText="Mọi thao tác thêm mới đều được chuẩn hóa qua dialog này. Với biểu mẫu dài, hệ thống tự chuyển sang chế độ wizard toàn màn hình."
        fieldCount={activeAction?.fields.length ?? 0}
      >
        {activeAction && createAction && activeAction.key === createAction.key ? (
          <ActionForm
            action={activeAction}
            initialValues={createDefaultFormValues(activeAction)}
            fieldOptionsByName={actionFieldOptionMap[activeAction.key]}
            onCancel={() => setActiveAction(null)}
            onSubmit={(values) => handleAction(activeAction, values)}
            onSubmitAndAddAnother={(values) =>
              handleAction(activeAction, values, {
                keepDialogOpen: true
              })
            }
            submitLabel="Lưu dữ liệu"
            showSaveAndAddAnother
          />
        ) : null}
      </CreateEntityDialog>

      {/* Non-create actions keep side panel for contextual editing */}
      <SidePanel
        isOpen={Boolean(activeAction && (!createAction || activeAction.key !== createAction.key))}
        onClose={() => setActiveAction(null)}
        title={activeAction?.label ?? 'Thao tác'}
      >
        {activeAction && (!createAction || activeAction.key !== createAction.key) ? (
          <ActionForm
            action={activeAction}
            initialValues={selectedRow ? ({ ...createDefaultFormValues(activeAction), ...selectedRow } as FormValues) : undefined}
            fieldOptionsByName={actionFieldOptionMap[activeAction.key]}
            onCancel={() => setActiveAction(null)}
            onSubmit={(values) => handleAction(activeAction, values)}
          />
        ) : null}
      </SidePanel>
    </div>
  );
}

export function ModuleWorkbench({ module }: { module: ModuleDefinition }) {
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
        {activeFeature && <FeaturePanel key={activeFeature.key} feature={activeFeature} moduleKey={module.key} />}
      </div>
    </article>
  );
}
