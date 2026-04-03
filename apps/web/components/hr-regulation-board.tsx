'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Gauge, LifeBuoy, RefreshCw, Send, Wand2, XCircle } from 'lucide-react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';

type RegulationTab = 'appendix' | 'scores' | 'pip';
type RegulationViewerScope = 'self' | 'team' | 'department' | 'company';
type GenericRow = Record<string, unknown> & { id?: string };
type AppendixFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';
type AppendixFieldAggregator = 'none' | 'count' | 'sum' | 'avg' | 'min' | 'max';
type AppendixFieldStatus = 'ACTIVE' | 'DRAFT' | 'INACTIVE' | 'ARCHIVED';

type AppendixFieldDefinition = {
  id: string;
  key: string;
  label: string;
  description: string;
  type: AppendixFieldType;
  options: string[];
  validation: Record<string, unknown>;
  analyticsEnabled: boolean;
  aggregator: AppendixFieldAggregator;
  status: AppendixFieldStatus;
  version: number;
  required: boolean;
  placeholder: string;
  defaultValue: unknown;
  helpText: string;
  visibility: 'visible' | 'hidden';
  kpiAlias: string;
  source: 'global' | 'appendix-local';
};

type AppendixCatalogItem = {
  code: string;
  name: string;
  description: string;
  fields: AppendixFieldDefinition[];
};

type RegulationMetadataPayload = {
  viewerScope?: RegulationViewerScope;
  canOverrideEmployeeId?: boolean;
  requesterEmployeeId?: string | null;
  fieldCatalog?: Array<Record<string, unknown>>;
  appendices?: Array<{
    code?: string;
    name?: string;
    description?: string;
    fields?: Array<Record<string, unknown> | string>;
  }>;
};

type ScopedListPayload = {
  viewerScope?: RegulationViewerScope;
  items?: GenericRow[];
};

type AppendixCreateForm = {
  appendixCode: string;
  employeeId: string;
  workDate: string;
  period: string;
  fieldValues: Record<string, string>;
  evidenceType: 'LINK' | 'FILE';
  evidenceValue: string;
  evidenceNote: string;
};

type RevisionForm = {
  adjustmentType: string;
  beforeValue: string;
  afterValue: string;
  reasonNote: string;
};

type PipCreateForm = {
  employeeId: string;
  triggerReason: string;
  targetMonthlyScore: string;
  recoveryWindowDays: string;
  mandatoryAppendixCodes: string[];
  coachingCheckinWeekly: boolean;
  roleGroup: string;
  missingLogCount30d: string;
  baselineNote: string;
};

const DEFAULT_APPENDIX_CODES = ['PL01', 'PL02', 'PL03', 'PL04', 'PL05', 'PL06', 'PL10'] as const;
const APPENDIX_FIELD_META_FALLBACK: Record<string, Partial<AppendixFieldDefinition>> = {
  summary: {
    key: 'summary',
    label: 'Tom tat cong viec',
    type: 'text',
    required: true,
    placeholder: 'Vi du: cham soc khach hang khu vuc mien Nam'
  },
  result: {
    key: 'result',
    label: 'Ket qua',
    type: 'text',
    required: true,
    placeholder: 'Dat / Chua dat / Dang xu ly'
  },
  taskCount: {
    key: 'taskCount',
    label: 'So dau viec hoan thanh',
    type: 'number'
  },
  complianceNote: {
    key: 'complianceNote',
    label: 'Ghi chu tuan thu',
    type: 'text',
    placeholder: 'Vi du: nop dung han, du minh chung'
  },
  qualityNote: {
    key: 'qualityNote',
    label: 'Ghi chu chat luong',
    type: 'text',
    placeholder: 'Vi du: can cai thien do chinh xac du lieu'
  },
  note: {
    key: 'note',
    label: 'Ghi chu bo sung',
    type: 'text'
  }
};

function statusPillClass(status: unknown) {
  const normalized = String(status ?? '').trim().toUpperCase();
  if (['ACTIVE', 'APPROVED', 'OPEN', 'FINAL', 'SENT'].includes(normalized)) {
    return 'finance-status-pill finance-status-pill-success';
  }
  if (['PENDING', 'DRAFT', 'SUBMITTED', 'PROVISIONAL', 'RETRY'].includes(normalized)) {
    return 'finance-status-pill finance-status-pill-warning';
  }
  if (['REJECTED', 'FAILED', 'INACTIVE', 'CLOSED', 'ARCHIVED'].includes(normalized)) {
    return 'finance-status-pill finance-status-pill-danger';
  }
  return 'finance-status-pill finance-status-pill-neutral';
}

function formatDateTime(value: unknown) {
  if (!value) return '--';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function toSafeString(value: unknown) {
  return String(value ?? '').trim();
}

function toNullableNumber(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function toFlexibleValue(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return numeric;
  }
  return trimmed;
}

function createDefaultRevisionForm(): RevisionForm {
  return {
    adjustmentType: 'T_PLUS_ONE_CORRECTION',
    beforeValue: '',
    afterValue: '',
    reasonNote: ''
  };
}

function createDefaultFieldDefinition(fieldKey: string): AppendixFieldDefinition {
  const fallback = APPENDIX_FIELD_META_FALLBACK[fieldKey] ?? {};
  return {
    id: String(fallback.id ?? fieldKey),
    key: String(fallback.key ?? fieldKey),
    label: String(fallback.label ?? fieldKey),
    description: '',
    type: (fallback.type as AppendixFieldType | undefined) ?? 'text',
    options: [],
    validation: {},
    analyticsEnabled: false,
    aggregator: 'none',
    status: 'ACTIVE',
    version: 1,
    required: Boolean(fallback.required === true),
    placeholder: String(fallback.placeholder ?? ''),
    defaultValue: null,
    helpText: '',
    visibility: 'visible',
    kpiAlias: '',
    source: 'global'
  };
}

function createDefaultFieldValues(fields: AppendixFieldDefinition[]) {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const key = String(field.key ?? '').trim();
    if (!key) {
      continue;
    }
    const defaultRaw = field.defaultValue;
    if (typeof defaultRaw === 'string') {
      values[key] = defaultRaw;
      continue;
    }
    if (typeof defaultRaw === 'number' || typeof defaultRaw === 'boolean') {
      values[key] = String(defaultRaw);
      continue;
    }
    values[key] = '';
  }
  return values;
}

function createDefaultAppendixForm(defaultCode: string, fields: AppendixFieldDefinition[] = []): AppendixCreateForm {
  return {
    appendixCode: defaultCode,
    employeeId: '',
    workDate: '',
    period: '',
    fieldValues: createDefaultFieldValues(fields),
    evidenceType: 'LINK',
    evidenceValue: '',
    evidenceNote: ''
  };
}

function normalizeAppendixCatalog(payload: RegulationMetadataPayload | null): AppendixCatalogItem[] {
  const raw = Array.isArray(payload?.appendices) ? payload?.appendices : [];
  const normalized: AppendixCatalogItem[] = raw
    .map((item) => {
      const normalizedFields = Array.isArray(item.fields)
        ? item.fields
            .map((fieldRaw) => {
              if (typeof fieldRaw === 'string') {
                return createDefaultFieldDefinition(String(fieldRaw).trim());
              }
              const field = fieldRaw && typeof fieldRaw === 'object' ? (fieldRaw as Record<string, unknown>) : {};
              const key = String(field.key ?? field.fieldKey ?? field.id ?? '').trim();
              if (!key) {
                return null;
              }
              const fallback = createDefaultFieldDefinition(key);
              const typeRaw = String(field.type ?? fallback.type).trim().toLowerCase();
              const type: AppendixFieldType =
                typeRaw === 'number' || typeRaw === 'date' || typeRaw === 'select' || typeRaw === 'boolean'
                  ? typeRaw
                  : 'text';
              const statusRaw = String(field.status ?? fallback.status).trim().toUpperCase();
              const status: AppendixFieldStatus =
                statusRaw === 'DRAFT' || statusRaw === 'INACTIVE' || statusRaw === 'ARCHIVED'
                  ? statusRaw
                  : 'ACTIVE';
              const aggregatorRaw = String(field.aggregator ?? fallback.aggregator).trim().toLowerCase();
              const aggregator: AppendixFieldAggregator =
                aggregatorRaw === 'count' || aggregatorRaw === 'sum' || aggregatorRaw === 'avg' || aggregatorRaw === 'min' || aggregatorRaw === 'max'
                  ? aggregatorRaw
                  : 'none';
              return {
                ...fallback,
                id: String(field.id ?? key),
                key,
                label: String(field.label ?? fallback.label),
                description: String(field.description ?? ''),
                type,
                options: Array.isArray(field.options)
                  ? field.options.map((entry) => String(entry ?? '').trim()).filter(Boolean)
                  : fallback.options,
                validation: field.validation && typeof field.validation === 'object' && !Array.isArray(field.validation)
                  ? (field.validation as Record<string, unknown>)
                  : fallback.validation,
                analyticsEnabled: field.analyticsEnabled === true,
                aggregator: field.analyticsEnabled === true ? aggregator : 'none',
                status,
                version: Number.isFinite(Number(field.version)) ? Math.max(1, Math.trunc(Number(field.version))) : fallback.version,
                required: Boolean(
                  field.required === true
                  || (
                    field.validation
                    && typeof field.validation === 'object'
                    && !Array.isArray(field.validation)
                    && (field.validation as Record<string, unknown>).required === true
                  )
                ),
                placeholder: String(field.placeholder ?? fallback.placeholder),
                defaultValue: field.defaultValue ?? fallback.defaultValue,
                helpText: String(field.helpText ?? ''),
                visibility: String(field.visibility ?? '').trim().toLowerCase() === 'hidden' ? 'hidden' : 'visible',
                kpiAlias: String(field.kpiAlias ?? ''),
                source: String(field.source ?? '').trim().toLowerCase() === 'appendix-local' ? 'appendix-local' : 'global'
              } satisfies AppendixFieldDefinition;
            })
            .filter((field): field is AppendixFieldDefinition => Boolean(field))
        : [];

      return {
        code: String(item.code ?? '').trim().toUpperCase(),
        name: String(item.name ?? '').trim(),
        description: String(item.description ?? '').trim(),
        fields: normalizedFields
      };
    })
    .filter((item) => item.code.length > 0);

  if (normalized.length > 0) {
    return normalized.sort((left, right) => left.code.localeCompare(right.code));
  }

  return DEFAULT_APPENDIX_CODES.map((code) => ({
    code,
    name: code,
    description: '',
    fields: ['summary', 'result', 'taskCount', 'complianceNote', 'qualityNote', 'note'].map((key) => createDefaultFieldDefinition(key))
  }));
}

function normalizeViewerScope(raw: unknown, fallback: RegulationViewerScope = 'company'): RegulationViewerScope {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'self' || value === 'team' || value === 'department' || value === 'company') {
    return value;
  }
  return fallback;
}

function viewerScopeLabel(scope: RegulationViewerScope) {
  if (scope === 'self') return 'Cá nhân';
  if (scope === 'team') return 'Team';
  if (scope === 'department') return 'Phòng ban';
  return 'Toàn công ty';
}

function appendixAggregatorLabel(aggregator: AppendixFieldAggregator) {
  if (aggregator === 'count') return 'Đếm';
  if (aggregator === 'sum') return 'Tổng';
  if (aggregator === 'avg') return 'Trung bình';
  if (aggregator === 'min') return 'Nhỏ nhất';
  if (aggregator === 'max') return 'Lớn nhất';
  return 'Không tổng hợp';
}

function buildScoreChartPoints(rows: GenericRow[]) {
  return rows
    .map((row) => {
      const workDate = String(row.workDate ?? '').trim();
      const date = new Date(workDate);
      if (!workDate || Number.isNaN(date.getTime())) {
        return null;
      }
      const total = Number(row.totalScore ?? 0);
      return {
        key: String(row.id ?? workDate),
        ts: date.getTime(),
        label: new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date),
        total: Number.isFinite(total) ? Math.max(0, Math.min(100, total)) : 0
      };
    })
    .filter((item): item is { key: string; ts: number; label: string; total: number } => Boolean(item))
    .sort((left, right) => left.ts - right.ts)
    .slice(-10);
}

type AppendixFieldAnalyticsMetric = {
  key: string;
  label: string;
  aggregator: AppendixFieldAggregator;
  value: number;
  sampleCount: number;
};

function toNumericAnalyticsValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  const text = String(value ?? '').trim();
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildAppendixFieldAnalytics(
  rows: GenericRow[],
  catalog: AppendixCatalogItem[]
): AppendixFieldAnalyticsMetric[] {
  const analyticsFieldMap = new Map<string, AppendixFieldDefinition>();
  for (const appendix of catalog) {
    for (const field of appendix.fields) {
      if (!field.analyticsEnabled) {
        continue;
      }
      if (field.aggregator === 'none') {
        continue;
      }
      if (!analyticsFieldMap.has(field.key)) {
        analyticsFieldMap.set(field.key, field);
      }
    }
  }

  const metrics: AppendixFieldAnalyticsMetric[] = [];
  for (const field of analyticsFieldMap.values()) {
    let sampleCount = 0;
    let total = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
      const payload = row.payloadJson && typeof row.payloadJson === 'object' && !Array.isArray(row.payloadJson)
        ? (row.payloadJson as Record<string, unknown>)
        : row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {};
      const rawValue = payload[field.key];
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        continue;
      }
      if (field.aggregator === 'count') {
        sampleCount += 1;
        continue;
      }
      const numeric = toNumericAnalyticsValue(rawValue);
      if (numeric === null) {
        continue;
      }
      sampleCount += 1;
      total += numeric;
      if (numeric < min) {
        min = numeric;
      }
      if (numeric > max) {
        max = numeric;
      }
    }

    let value = 0;
    if (field.aggregator === 'count') {
      value = sampleCount;
    } else if (sampleCount > 0) {
      if (field.aggregator === 'sum') {
        value = total;
      } else if (field.aggregator === 'avg') {
        value = total / sampleCount;
      } else if (field.aggregator === 'min') {
        value = min;
      } else if (field.aggregator === 'max') {
        value = max;
      }
    }

    metrics.push({
      key: field.key,
      label: field.kpiAlias || field.label || field.key,
      aggregator: field.aggregator,
      value: Number(value.toFixed(2)),
      sampleCount
    });
  }

  return metrics.sort((left, right) => left.label.localeCompare(right.label));
}

export function HrRegulationBoard() {
  const [activeTab, setActiveTab] = useState<RegulationTab>('appendix');
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewerScope, setViewerScope] = useState<RegulationViewerScope>('company');
  const [canOverrideEmployeeId, setCanOverrideEmployeeId] = useState(true);
  const [requesterEmployeeId, setRequesterEmployeeId] = useState('');
  const [appendixCatalog, setAppendixCatalog] = useState<AppendixCatalogItem[]>(normalizeAppendixCatalog(null));

  const [actionActorId, setActionActorId] = useState('manager_1');
  const [appendixFilter, setAppendixFilter] = useState({
    appendixCode: '',
    employeeId: '',
    status: ''
  });
  const [scoreFilter, setScoreFilter] = useState({
    employeeId: '',
    status: ''
  });
  const [pipFilter, setPipFilter] = useState({
    employeeId: '',
    status: ''
  });

  const [appendixForm, setAppendixForm] = useState<AppendixCreateForm>(() => createDefaultAppendixForm('PL01'));
  const [revisionFormBySubmission, setRevisionFormBySubmission] = useState<Record<string, RevisionForm>>({});

  const [pipForm, setPipForm] = useState<PipCreateForm>({
    employeeId: '',
    triggerReason: 'manual',
    targetMonthlyScore: '75',
    recoveryWindowDays: '60',
    mandatoryAppendixCodes: ['PL01', 'PL02'],
    coachingCheckinWeekly: true,
    roleGroup: '',
    missingLogCount30d: '',
    baselineNote: ''
  });

  const [templates, setTemplates] = useState<GenericRow[]>([]);
  const [submissions, setSubmissions] = useState<GenericRow[]>([]);
  const [dailyScores, setDailyScores] = useState<GenericRow[]>([]);
  const [scoreAnalyticsRows, setScoreAnalyticsRows] = useState<GenericRow[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<GenericRow[]>([]);
  const [pipCases, setPipCases] = useState<GenericRow[]>([]);

  const activeTabTitle = useMemo(() => {
    if (activeTab === 'appendix') return 'Biểu mẫu PL';
    if (activeTab === 'scores') return 'Điểm ngày';
    return 'PIP';
  }, [activeTab]);

  const appendixCatalogByCode = useMemo(() => {
    return new Map(appendixCatalog.map((item) => [item.code, item]));
  }, [appendixCatalog]);

  const formatAppendixLabel = (codeRaw: unknown) => {
    const code = String(codeRaw ?? '').trim().toUpperCase();
    if (!code) return '--';
    const name = appendixCatalogByCode.get(code)?.name;
    return name ? `${code} - ${name}` : code;
  };

  const selectedAppendix = useMemo(() => {
    return appendixCatalogByCode.get(appendixForm.appendixCode) ?? appendixCatalog[0] ?? null;
  }, [appendixCatalog, appendixCatalogByCode, appendixForm.appendixCode]);

  const selectedAppendixFields = useMemo<AppendixFieldDefinition[]>(() => {
    if (!selectedAppendix || selectedAppendix.fields.length === 0) {
      return ['summary', 'result', 'taskCount', 'complianceNote', 'qualityNote', 'note'].map((key) => createDefaultFieldDefinition(key));
    }
    return selectedAppendix.fields;
  }, [selectedAppendix]);

  const appendixOptions = useMemo(() => {
    return appendixCatalog.length > 0
      ? appendixCatalog
      : normalizeAppendixCatalog(null);
  }, [appendixCatalog]);

  const scoreChartPoints = useMemo(() => buildScoreChartPoints(dailyScores), [dailyScores]);
  const averageScore = useMemo(() => {
    if (scoreChartPoints.length === 0) return 0;
    const sum = scoreChartPoints.reduce((acc, item) => acc + item.total, 0);
    return Number((sum / scoreChartPoints.length).toFixed(2));
  }, [scoreChartPoints]);
  const appendixFieldMetrics = useMemo(
    () => buildAppendixFieldAnalytics(scoreAnalyticsRows, appendixCatalog),
    [scoreAnalyticsRows, appendixCatalog]
  );
  const maxAppendixMetricValue = useMemo(() => {
    if (appendixFieldMetrics.length === 0) {
      return 0;
    }
    return Math.max(...appendixFieldMetrics.map((item) => item.value), 0);
  }, [appendixFieldMetrics]);

  const isSelfScope = viewerScope === 'self';

  const handleAppendixCodeChange = (nextCode: string) => {
    const nextFields = appendixCatalogByCode.get(nextCode)?.fields ?? [];
    setAppendixForm((prev) => ({
      ...createDefaultAppendixForm(nextCode, nextFields),
      employeeId: canOverrideEmployeeId ? prev.employeeId : requesterEmployeeId
    }));
    setNotice(null);
    setError(null);
  };

  const loadMetadata = async () => {
    const payload = await apiRequest<RegulationMetadataPayload>('/hr/regulation/metadata');
    const catalog = normalizeAppendixCatalog(payload ?? null);
    const canOverride = payload?.canOverrideEmployeeId === true;
    const requesterId = String(payload?.requesterEmployeeId ?? '').trim();
    const nextScope = normalizeViewerScope(payload?.viewerScope, viewerScope);

    setViewerScope(nextScope);
    setCanOverrideEmployeeId(canOverride);
    setRequesterEmployeeId(requesterId);
    setAppendixCatalog(catalog);

    const availableCodes = new Set(catalog.map((item) => item.code));
    setAppendixForm((prev) => {
      const nextCode = availableCodes.has(prev.appendixCode) ? prev.appendixCode : (catalog[0]?.code ?? 'PL01');
      const nextFields = catalog.find((item) => item.code === nextCode)?.fields ?? [];
      return {
        ...createDefaultAppendixForm(nextCode, nextFields),
        employeeId: canOverride ? prev.employeeId : requesterId
      };
    });
    setPipForm((prev) => {
      const selectedCodes = prev.mandatoryAppendixCodes.filter((code) => availableCodes.has(code));
      return {
        ...prev,
        employeeId: canOverride ? prev.employeeId : requesterId,
        mandatoryAppendixCodes:
          selectedCodes.length > 0
            ? selectedCodes
            : catalog.slice(0, 2).map((item) => item.code)
      };
    });
    if (!canOverride) {
      setAppendixFilter((prev) => ({ ...prev, employeeId: requesterId }));
      setScoreFilter((prev) => ({ ...prev, employeeId: requesterId }));
      setPipFilter((prev) => ({ ...prev, employeeId: requesterId }));
    }
  };

  const loadAppendixTab = async () => {
    const [templatePayload, submissionPayload] = await Promise.all([
      apiRequest('/hr/appendix/templates', {
        query: { limit: 50, appendixCode: appendixFilter.appendixCode || undefined }
      }),
      apiRequest('/hr/appendix/submissions', {
        query: {
          limit: 200,
          appendixCode: appendixFilter.appendixCode || undefined,
          employeeId: appendixFilter.employeeId || undefined,
          status: appendixFilter.status || undefined
        }
      })
    ]);
    setTemplates(normalizeListPayload(templatePayload));
    setSubmissions(normalizeListPayload(submissionPayload));
    if (submissionPayload && typeof submissionPayload === 'object' && !Array.isArray(submissionPayload)) {
      const scoped = submissionPayload as ScopedListPayload;
      setViewerScope((prev) => normalizeViewerScope(scoped.viewerScope, prev));
    }
  };

  const loadScoresTab = async () => {
    const [scorePayload, roleTemplatePayload, appendixPayload] = await Promise.all([
      apiRequest('/hr/performance/daily-scores', {
        query: {
          limit: 200,
          employeeId: scoreFilter.employeeId || undefined,
          status: scoreFilter.status || undefined
        }
      }),
      apiRequest('/hr/performance/role-templates', { query: { limit: 50 } })
      ,
      apiRequest('/hr/appendix/submissions', {
        query: {
          limit: 400,
          employeeId: scoreFilter.employeeId || undefined
        }
      })
    ]);
    setDailyScores(normalizeListPayload(scorePayload));
    setRoleTemplates(normalizeListPayload(roleTemplatePayload));
    setScoreAnalyticsRows(normalizeListPayload(appendixPayload));
    if (scorePayload && typeof scorePayload === 'object' && !Array.isArray(scorePayload)) {
      const scoped = scorePayload as ScopedListPayload;
      setViewerScope((prev) => normalizeViewerScope(scoped.viewerScope, prev));
    }
  };

  const loadPipTab = async () => {
    const payload = await apiRequest('/hr/pip/cases', {
      query: {
        limit: 200,
        employeeId: pipFilter.employeeId || undefined,
        status: pipFilter.status || undefined
      }
    });
    setPipCases(normalizeListPayload(payload));
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const scoped = payload as ScopedListPayload;
      setViewerScope((prev) => normalizeViewerScope(scoped.viewerScope, prev));
    }
  };

  const loadActiveTab = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === 'appendix') {
        await loadAppendixTab();
      } else if (activeTab === 'scores') {
        await loadScoresTab();
      } else {
        await loadPipTab();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu Quy chế 2026.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMetadata();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadActiveTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleCreateSubmission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      const employeeIdValue = appendixForm.employeeId.trim();
      if (canOverrideEmployeeId && !employeeIdValue) {
        throw new Error('Vui lòng nhập Employee ID.');
      }

      const dynamicPayload: Record<string, unknown> = {};
      for (const field of selectedAppendixFields) {
        const rawValue = appendixForm.fieldValues[field.key] ?? '';
        if (field.type === 'number') {
          dynamicPayload[field.key] = toNullableNumber(rawValue);
          continue;
        }
        if (field.type === 'boolean') {
          const normalized = rawValue.trim().toLowerCase();
          dynamicPayload[field.key] = ['1', 'true', 'yes', 'on'].includes(normalized)
            ? true
            : ['0', 'false', 'no', 'off'].includes(normalized)
              ? false
              : null;
          continue;
        }
        dynamicPayload[field.key] = rawValue.trim() || null;
      }

      const evidences = appendixForm.evidenceValue.trim()
        ? [{
            evidenceType: appendixForm.evidenceType,
            url: appendixForm.evidenceType === 'LINK' ? appendixForm.evidenceValue.trim() : undefined,
            objectKey: appendixForm.evidenceType === 'FILE' ? appendixForm.evidenceValue.trim() : undefined,
            note: appendixForm.evidenceNote.trim() || undefined
          }]
        : [];

      await apiRequest('/hr/appendix/submissions', {
        method: 'POST',
        body: {
          appendixCode: appendixForm.appendixCode,
          employeeId: canOverrideEmployeeId ? employeeIdValue : undefined,
          workDate: appendixForm.workDate || undefined,
          period: appendixForm.period.trim() || undefined,
          payload: dynamicPayload,
          evidences,
          actorId: actionActorId.trim() || undefined
        }
      });

      setNotice('Đã tạo submission phụ lục.');
      await loadAppendixTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo submission thất bại.');
    } finally {
      setIsMutating(false);
    }
  };

  const runSubmissionAction = async (submissionId: string, action: 'submit' | 'approve' | 'reject') => {
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      const endpoint =
        action === 'submit'
          ? `/hr/appendix/submissions/${submissionId}/submit`
          : action === 'approve'
            ? `/hr/appendix/submissions/${submissionId}/approve`
            : `/hr/appendix/submissions/${submissionId}/reject`;
      const body =
        action === 'submit'
          ? { actorId: actionActorId.trim() || undefined }
          : {
              approverId: actionActorId.trim() || undefined,
              note: action === 'reject' ? 'Rejected by manager' : 'Approved by manager'
            };

      await apiRequest(endpoint, { method: 'POST', body });
      setNotice(`Đã ${action === 'submit' ? 'submit' : action === 'approve' ? 'duyệt' : 'từ chối'} submission.`);
      await loadAppendixTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác submission thất bại.');
    } finally {
      setIsMutating(false);
    }
  };

  const createRevision = async (submissionId: string) => {
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      const form = revisionFormBySubmission[submissionId] ?? createDefaultRevisionForm();
      const reasonNote = toSafeString(form.reasonNote) || 'T+1 correction';
      await apiRequest(`/hr/appendix/submissions/${submissionId}/revisions`, {
        method: 'POST',
        body: {
          actorId: actionActorId.trim() || undefined,
          requestedBy: actionActorId.trim() || undefined,
          reason: reasonNote,
          payload: {
            adjustmentType: toSafeString(form.adjustmentType) || 'T_PLUS_ONE_CORRECTION',
            beforeValue: toFlexibleValue(form.beforeValue),
            afterValue: toFlexibleValue(form.afterValue),
            reasonNote
          }
        }
      });
      setNotice('Đã tạo revision T+1 chờ duyệt.');
      await loadAppendixTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo revision thất bại.');
    } finally {
      setIsMutating(false);
    }
  };

  const actRevision = async (revisionId: string, action: 'approve' | 'reject') => {
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/hr/appendix/revisions/${revisionId}/${action}`, {
        method: 'POST',
        body: {
          approverId: actionActorId.trim() || undefined,
          note: action === 'approve' ? 'Approved revision' : 'Rejected revision'
        }
      });
      setNotice(`Đã ${action === 'approve' ? 'duyệt' : 'từ chối'} revision.`);
      await loadAppendixTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác revision thất bại.');
    } finally {
      setIsMutating(false);
    }
  };

  const runScoreAction = async (action: 'recompute' | 'reconcile') => {
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      const endpoint =
        action === 'recompute'
          ? '/hr/performance/daily-scores/recompute'
          : '/hr/performance/daily-scores/reconcile/run';
      await apiRequest(endpoint, {
        method: 'POST',
        body: {
          actorId: actionActorId.trim() || undefined,
          triggeredBy: actionActorId.trim() || 'manual-ops',
          employeeId: scoreFilter.employeeId || undefined,
          status: scoreFilter.status || undefined,
          limit: 200
        }
      });
      setNotice(action === 'recompute' ? 'Đã chạy recompute điểm ngày.' : 'Đã chạy reconcile điểm ngày.');
      await loadScoresTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không chạy được tác vụ điểm ngày.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleCreatePipCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      const employeeIdValue = pipForm.employeeId.trim();
      if (canOverrideEmployeeId && !employeeIdValue) {
        throw new Error('Vui lòng nhập Employee ID.');
      }

      await apiRequest('/hr/pip/cases', {
        method: 'POST',
        body: {
          employeeId: canOverrideEmployeeId ? employeeIdValue : undefined,
          triggerReason: pipForm.triggerReason.trim() || 'manual',
          goals: {
            targetMonthlyScore: toNullableNumber(pipForm.targetMonthlyScore),
            recoveryWindowDays: toNullableNumber(pipForm.recoveryWindowDays),
            mandatoryAppendixCodes: pipForm.mandatoryAppendixCodes,
            coachingCheckinWeekly: pipForm.coachingCheckinWeekly
          },
          baseline: {
            roleGroup: pipForm.roleGroup.trim() || null,
            missingLogCount30d: toNullableNumber(pipForm.missingLogCount30d),
            note: pipForm.baselineNote.trim() || null
          },
          actorId: actionActorId.trim() || undefined
        }
      });
      setNotice('Đã tạo PIP case thủ công.');
      await loadPipTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo PIP case thất bại.');
    } finally {
      setIsMutating(false);
    }
  };

  const runAutoDraftPip = async () => {
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest('/hr/pip/cases/auto-draft/run', {
        method: 'POST',
        body: {
          triggeredBy: actionActorId.trim() || 'manual-ops',
          limit: 200
        }
      });
      setNotice('Đã chạy auto-draft PIP.');
      await loadPipTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chạy auto-draft PIP thất bại.');
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <article className="module-workbench">
      <header className="module-header">
        <div>
          <h1>HR Quy chế 2026</h1>
          <p>
            Số hóa PL01/02/03/04/05/06/10, chấm điểm ngày tự động và vận hành PIP theo quy chế.
          </p>
        </div>
        <ul>
          <li>Múi giờ chốt điểm: Asia/Ho_Chi_Minh (freeze D+1 23:59)</li>
          <li>Approver mặc định: manager, fallback HCNS manager</li>
          <li>Soft enforcement: trừ điểm + cảnh báo, không chặn nghiệp vụ</li>
        </ul>
      </header>

      {error && (
        <div className="finance-alert finance-alert-danger" style={{ marginBottom: '1rem' }}>
          <strong>Lỗi:</strong> {error}
        </div>
      )}
      {notice && (
        <div className="finance-alert finance-alert-success" style={{ marginBottom: '1rem' }}>
          <strong>Thành công:</strong> {notice}
        </div>
      )}

      <div className="main-toolbar" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '1rem' }}>
        <div className="toolbar-left" style={{ gap: '0.75rem', alignItems: 'center' }}>
          <button
            className={`btn ${activeTab === 'appendix' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('appendix')}
            type="button"
          >
            <ClipboardList size={16} />
            Biểu mẫu
          </button>
          <button
            className={`btn ${activeTab === 'scores' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('scores')}
            type="button"
          >
            <Gauge size={16} />
            Điểm ngày
          </button>
          <button
            className={`btn ${activeTab === 'pip' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('pip')}
            type="button"
          >
            <LifeBuoy size={16} />
            PIP
          </button>
        </div>
        <div className="toolbar-right" style={{ gap: '0.75rem' }}>
          <input
            value={actionActorId}
            onChange={(event) => setActionActorId(event.target.value)}
            placeholder="actorId / approverId"
            style={{ minWidth: '220px' }}
          />
          <button className="btn btn-ghost" onClick={() => void loadActiveTab()} type="button" disabled={isLoading || isMutating}>
            <RefreshCw size={16} />
            Làm mới {activeTabTitle}
          </button>
        </div>
      </div>

      {activeTab === 'appendix' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Tạo submission phụ lục</h3>
            <form className="form-grid" onSubmit={handleCreateSubmission}>
              <div className="field">
                <label>Mã phụ lục</label>
                <select
                  value={appendixForm.appendixCode}
                  onChange={(event) => handleAppendixCodeChange(event.target.value)}
                >
                  {appendixOptions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code} - {item.name}
                    </option>
                  ))}
                </select>
                {selectedAppendix?.description && (
                  <small style={{ color: 'var(--muted)' }}>{selectedAppendix.description}</small>
                )}
              </div>
              {canOverrideEmployeeId && (
                <div className="field">
                  <label>Employee ID</label>
                  <input
                    required
                    value={appendixForm.employeeId}
                    onChange={(event) => setAppendixForm((prev) => ({ ...prev, employeeId: event.target.value }))}
                  />
                </div>
              )}
              <div className="field">
                <label>Work date</label>
                <input
                  type="date"
                  value={appendixForm.workDate}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, workDate: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Period</label>
                <input
                  placeholder="2026-04"
                  value={appendixForm.period}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, period: event.target.value }))}
                />
              </div>
              {selectedAppendixFields.map((field) => {
                const currentValue = appendixForm.fieldValues[field.key] ?? '';
                const isTextarea = field.type === 'text' && (field.key.toLowerCase().includes('note') || field.key.toLowerCase().includes('summary'));
                return (
                  <div
                    key={field.key}
                    className="field"
                    style={isTextarea ? { gridColumn: '1 / -1' } : undefined}
                  >
                    <label>
                      {field.label}
                      {field.required ? ' *' : ''}
                    </label>
                    {field.helpText && <small>{field.helpText}</small>}
                    {isTextarea ? (
                      <textarea
                        rows={2}
                        value={currentValue}
                        onChange={(event) =>
                          setAppendixForm((prev) => ({
                            ...prev,
                            fieldValues: {
                              ...prev.fieldValues,
                              [field.key]: event.target.value
                            }
                          }))
                        }
                      />
                    ) : field.type === 'select' && field.options.length > 0 ? (
                      <select
                        value={currentValue}
                        onChange={(event) =>
                          setAppendixForm((prev) => ({
                            ...prev,
                            fieldValues: {
                              ...prev.fieldValues,
                              [field.key]: event.target.value
                            }
                          }))
                        }
                      >
                        <option value="">-- Chon --</option>
                        {field.options.map((option) => (
                          <option key={`${field.key}-${option}`} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                        min={field.type === 'number' ? 0 : undefined}
                        value={currentValue}
                        placeholder={field.placeholder}
                        onChange={(event) =>
                          setAppendixForm((prev) => ({
                            ...prev,
                            fieldValues: {
                              ...prev.fieldValues,
                              [field.key]: event.target.value
                            }
                          }))
                        }
                      />
                    )}
                  </div>
                );
              })}
              <div className="field">
                <label>Evidence type</label>
                <select
                  value={appendixForm.evidenceType}
                  onChange={(event) =>
                    setAppendixForm((prev) => ({ ...prev, evidenceType: event.target.value as 'LINK' | 'FILE' }))
                  }
                >
                  <option value="LINK">LINK</option>
                  <option value="FILE">FILE</option>
                </select>
              </div>
              <div className="field">
                <label>Evidence URL/Object key</label>
                <input
                  value={appendixForm.evidenceValue}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, evidenceValue: event.target.value }))}
                  placeholder="https://... hoặc s3/object-key"
                />
              </div>
              <div className="field">
                <label>Evidence note</label>
                <input
                  value={appendixForm.evidenceNote}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, evidenceNote: event.target.value }))}
                />
              </div>
              <div className="action-buttons">
                <button className="btn btn-primary" type="submit" disabled={isMutating}>
                  <Send size={16} />
                  Tạo submission
                </button>
              </div>
            </form>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Filter submissions</h3>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))' }}>
              <div className="field">
                <label>Mã PL</label>
                <select
                  value={appendixFilter.appendixCode}
                  onChange={(event) => setAppendixFilter((prev) => ({ ...prev, appendixCode: event.target.value }))}
                >
                  <option value="">Tất cả</option>
                  {appendixOptions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code} - {item.name}
                    </option>
                  ))}
                </select>
              </div>
              {canOverrideEmployeeId && (
                <div className="field">
                  <label>Employee ID</label>
                  <input
                    value={appendixFilter.employeeId}
                    onChange={(event) => setAppendixFilter((prev) => ({ ...prev, employeeId: event.target.value }))}
                  />
                </div>
              )}
              <div className="field">
                <label>Status</label>
                <input
                  value={appendixFilter.status}
                  placeholder="DRAFT/SUBMITTED/APPROVED/REJECTED"
                  onChange={(event) => setAppendixFilter((prev) => ({ ...prev, status: event.target.value }))}
                />
              </div>
              <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-ghost" type="button" onClick={() => void loadAppendixTab()} disabled={isLoading || isMutating}>
                  <RefreshCw size={16} />
                  Áp dụng filter
                </button>
              </div>
            </div>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Templates ({templates.length})</h3>
            <div className="table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Appendix</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Chưa có template.</td>
                    </tr>
                  ) : (
                    templates.map((row) => (
                      <tr key={toSafeString(row.id) || `${row.appendixCode}-${row.version}`}>
                        <td>{formatAppendixLabel(row.appendixCode)}</td>
                        <td>{toSafeString(row.version) || '--'}</td>
                        <td>
                          <span className={statusPillClass(row.status)}>{toSafeString(row.status) || '--'}</span>
                        </td>
                        <td>{formatDateTime(row.updatedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Submissions ({submissions.length})</h3>
            <div className="table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Nhân sự</th>
                    <th>Work date</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th>Revisions</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.length === 0 ? (
                    <tr>
                      <td colSpan={7}>Chưa có submission.</td>
                    </tr>
                  ) : (
                    submissions.map((row) => {
                      const submissionId = toSafeString(row.id);
                      const revisions = Array.isArray(row.revisions) ? (row.revisions as GenericRow[]) : [];
                      const pendingRevision = revisions.find(
                        (item) => toSafeString(item.status).toUpperCase() === 'PENDING_APPROVAL'
                      );

                      return (
                        <tr key={submissionId || `${row.appendixCode}-${row.employeeId}-${row.workDate}`}>
                          <td>{formatAppendixLabel(row.appendixCode)}</td>
                          <td>{toSafeString(row.employeeId) || '--'}</td>
                          <td>{formatDateTime(row.workDate)}</td>
                          <td>
                            <span className={statusPillClass(row.status)}>{toSafeString(row.status) || '--'}</span>
                          </td>
                          <td>{formatDateTime(row.dueAt)}</td>
                          <td>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                              <div>{revisions.length} revision(s)</div>
                              {submissionId && (
                                <>
                                  <select
                                    value={revisionFormBySubmission[submissionId]?.adjustmentType ?? 'T_PLUS_ONE_CORRECTION'}
                                    onChange={(event) =>
                                      setRevisionFormBySubmission((prev) => ({
                                        ...prev,
                                        [submissionId]: {
                                          ...(prev[submissionId] ?? createDefaultRevisionForm()),
                                          adjustmentType: event.target.value
                                        }
                                      }))
                                    }
                                  >
                                    <option value="T_PLUS_ONE_CORRECTION">Chỉnh sửa T+1</option>
                                    <option value="COMPLIANCE_UPDATE">Cập nhật tuân thủ</option>
                                    <option value="QUALITY_UPDATE">Cập nhật chất lượng</option>
                                    <option value="OTHER">Khác</option>
                                  </select>
                                  <input
                                    placeholder="Giá trị trước chỉnh sửa"
                                    value={revisionFormBySubmission[submissionId]?.beforeValue ?? ''}
                                    onChange={(event) =>
                                      setRevisionFormBySubmission((prev) => ({
                                        ...prev,
                                        [submissionId]: {
                                          ...(prev[submissionId] ?? createDefaultRevisionForm()),
                                          beforeValue: event.target.value
                                        }
                                      }))
                                    }
                                  />
                                  <input
                                    placeholder="Giá trị sau chỉnh sửa"
                                    value={revisionFormBySubmission[submissionId]?.afterValue ?? ''}
                                    onChange={(event) =>
                                      setRevisionFormBySubmission((prev) => ({
                                        ...prev,
                                        [submissionId]: {
                                          ...(prev[submissionId] ?? createDefaultRevisionForm()),
                                          afterValue: event.target.value
                                        }
                                      }))
                                    }
                                  />
                                  <input
                                    placeholder="Lý do chỉnh sửa"
                                    value={revisionFormBySubmission[submissionId]?.reasonNote ?? ''}
                                    onChange={(event) =>
                                      setRevisionFormBySubmission((prev) => ({
                                        ...prev,
                                        [submissionId]: {
                                          ...(prev[submissionId] ?? createDefaultRevisionForm()),
                                          reasonNote: event.target.value
                                        }
                                      }))
                                    }
                                  />
                                  <button
                                    className="btn btn-ghost"
                                    type="button"
                                    disabled={isMutating}
                                    onClick={() => void createRevision(submissionId)}
                                  >
                                    Tạo revision T+1
                                  </button>
                                  {pendingRevision && (
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                      <button
                                        className="btn btn-ghost"
                                        type="button"
                                        disabled={isMutating}
                                        onClick={() => void actRevision(toSafeString(pendingRevision.id), 'approve')}
                                      >
                                        Duyệt revision
                                      </button>
                                      <button
                                        className="btn btn-ghost"
                                        type="button"
                                        disabled={isMutating}
                                        onClick={() => void actRevision(toSafeString(pendingRevision.id), 'reject')}
                                      >
                                        Từ chối revision
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                disabled={!submissionId || isMutating}
                                onClick={() => void runSubmissionAction(submissionId, 'submit')}
                              >
                                <Send size={14} />
                                Submit
                              </button>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                disabled={!submissionId || isMutating}
                                onClick={() => void runSubmissionAction(submissionId, 'approve')}
                              >
                                <CheckCircle2 size={14} />
                                Duyệt
                              </button>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                disabled={!submissionId || isMutating}
                                onClick={() => void runSubmissionAction(submissionId, 'reject')}
                              >
                                <XCircle size={14} />
                                Từ chối
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'scores' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Filter điểm ngày</h3>
            <div className="form-grid" style={{ gridTemplateColumns: canOverrideEmployeeId ? 'repeat(3, minmax(180px, 1fr))' : 'repeat(2, minmax(180px, 1fr))' }}>
              {canOverrideEmployeeId && (
                <div className="field">
                  <label>Employee ID</label>
                  <input
                    value={scoreFilter.employeeId}
                    onChange={(event) => setScoreFilter((prev) => ({ ...prev, employeeId: event.target.value }))}
                  />
                </div>
              )}
              <div className="field">
                <label>Status</label>
                <input
                  value={scoreFilter.status}
                  placeholder="PROVISIONAL/FINAL"
                  onChange={(event) => setScoreFilter((prev) => ({ ...prev, status: event.target.value }))}
                />
              </div>
              <div className="field" style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                <button className="btn btn-ghost" type="button" onClick={() => void loadScoresTab()} disabled={isLoading || isMutating}>
                  <RefreshCw size={16} />
                  Áp dụng filter
                </button>
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
              Phạm vi dữ liệu: <strong>{viewerScopeLabel(viewerScope)}</strong>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" type="button" disabled={isMutating} onClick={() => void runScoreAction('recompute')}>
                <Wand2 size={16} />
                Recompute
              </button>
              <button className="btn btn-ghost" type="button" disabled={isMutating} onClick={() => void runScoreAction('reconcile')}>
                <RefreshCw size={16} />
                Reconcile
              </button>
            </div>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Tổng hợp điểm ngày (chart)</h3>
            {scoreChartPoints.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Chưa có dữ liệu để hiển thị biểu đồ.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span className="finance-status-pill finance-status-pill-neutral">Điểm TB: {averageScore}</span>
                  <span className="finance-status-pill finance-status-pill-success">
                    Bản ghi: {scoreChartPoints.length}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '0.5rem',
                    minHeight: '200px',
                    padding: '0.75rem',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    background: 'var(--surface)'
                  }}
                >
                  {scoreChartPoints.map((point) => (
                    <div key={point.key} style={{ flex: 1, minWidth: '30px', textAlign: 'center' }}>
                      <div
                        title={`${point.label}: ${point.total}`}
                        style={{
                          height: `${Math.max(6, point.total * 1.8)}px`,
                          borderRadius: '8px 8px 0 0',
                          background: 'linear-gradient(180deg, var(--primary), var(--primary-soft))'
                        }}
                      />
                      <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
                        {point.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {isSelfScope && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
                Phạm vi cá nhân: bảng analytics field đã được ẩn.
              </p>
            )}
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Analytics field phụ lục (chart)</h3>
            {appendixFieldMetrics.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>
                Chưa có field analytics được bật hoặc chưa có dữ liệu phụ lục hợp lệ.
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '0.5rem',
                  minHeight: '220px',
                  padding: '0.75rem',
                  border: '1px solid var(--line)',
                  borderRadius: '10px',
                  background: 'var(--surface)'
                }}
              >
                {appendixFieldMetrics.map((metric) => {
                  const safeMax = maxAppendixMetricValue > 0 ? maxAppendixMetricValue : 1;
                  const height = Math.max(8, (metric.value / safeMax) * 160);
                  return (
                    <div key={metric.key} style={{ flex: 1, minWidth: '38px', textAlign: 'center' }}>
                      <div
                        title={`${metric.label}: ${metric.value} (${appendixAggregatorLabel(metric.aggregator)})`}
                        style={{
                          height: `${height}px`,
                          borderRadius: '8px 8px 0 0',
                          background: 'linear-gradient(180deg, #3f8f50, #7bbf7b)'
                        }}
                      />
                      <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
                        {metric.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {isSelfScope && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
                Phạm vi cá nhân: chỉ hiển thị biểu đồ tổng hợp, ẩn bảng chi tiết.
              </p>
            )}
          </section>

          {!isSelfScope && (
            <>
              <section className="settings-card">
                <h3 style={{ marginBottom: '0.75rem' }}>Analytics field phụ lục (table)</h3>
                <div className="table-wrap">
                  <table className="finance-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Aggregator</th>
                        <th>Giá trị</th>
                        <th>Số mẫu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appendixFieldMetrics.length === 0 ? (
                        <tr>
                          <td colSpan={4}>Chưa có metric analytics.</td>
                        </tr>
                      ) : (
                        appendixFieldMetrics.map((metric) => (
                          <tr key={metric.key}>
                            <td>{metric.label}</td>
                            <td>{appendixAggregatorLabel(metric.aggregator)}</td>
                            <td>{metric.value}</td>
                            <td>{metric.sampleCount}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="settings-card">
                <h3 style={{ marginBottom: '0.75rem' }}>Role templates ({roleTemplates.length})</h3>
                <div className="table-wrap">
                  <table className="finance-table">
                    <thead>
                      <tr>
                        <th>Role group</th>
                        <th>Weights</th>
                        <th>Thresholds</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roleTemplates.length === 0 ? (
                        <tr>
                          <td colSpan={4}>Chưa có role template.</td>
                        </tr>
                      ) : (
                        roleTemplates.map((row) => (
                          <tr key={toSafeString(row.id) || toSafeString(row.roleGroup)}>
                            <td>{toSafeString(row.roleGroup) || '--'}</td>
                            <td>
                              <code>{JSON.stringify(row.pillarWeights ?? {})}</code>
                            </td>
                            <td>
                              <code>{JSON.stringify(row.thresholds ?? {})}</code>
                            </td>
                            <td>
                              <span className={statusPillClass(row.status)}>{toSafeString(row.status) || '--'}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="settings-card">
                <h3 style={{ marginBottom: '0.75rem' }}>Daily scores ({dailyScores.length})</h3>
                <div className="table-wrap">
                  <table className="finance-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Work date</th>
                        <th>Output</th>
                        <th>Activity</th>
                        <th>Compliance</th>
                        <th>Quality</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Freeze at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyScores.length === 0 ? (
                        <tr>
                          <td colSpan={9}>Chưa có dữ liệu điểm ngày.</td>
                        </tr>
                      ) : (
                        dailyScores.map((row) => (
                          <tr key={toSafeString(row.id) || `${row.employeeId}-${row.workDate}`}>
                            <td>{toSafeString(row.employeeId) || '--'}</td>
                            <td>{formatDateTime(row.workDate)}</td>
                            <td>{toSafeString(row.outputScore) || '0'}</td>
                            <td>{toSafeString(row.activityScore) || '0'}</td>
                            <td>{toSafeString(row.complianceScore) || '0'}</td>
                            <td>{toSafeString(row.qualityScore) || '0'}</td>
                            <td>{toSafeString(row.totalScore) || '0'}</td>
                            <td>
                              <span className={statusPillClass(row.status)}>{toSafeString(row.status) || '--'}</span>
                            </td>
                            <td>{formatDateTime(row.freezeAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {activeTab === 'pip' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Tạo PIP case thủ công</h3>
            <form className="form-grid" onSubmit={handleCreatePipCase}>
              {canOverrideEmployeeId && (
                <div className="field">
                  <label>Employee ID</label>
                  <input
                    required
                    value={pipForm.employeeId}
                    onChange={(event) => setPipForm((prev) => ({ ...prev, employeeId: event.target.value }))}
                  />
                </div>
              )}
              <div className="field">
                <label>Trigger reason</label>
                <input
                  value={pipForm.triggerReason}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, triggerReason: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Mục tiêu điểm tháng</label>
                <input
                  type="number"
                  min={0}
                  value={pipForm.targetMonthlyScore}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, targetMonthlyScore: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Thời gian phục hồi (ngày)</label>
                <input
                  type="number"
                  min={1}
                  value={pipForm.recoveryWindowDays}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, recoveryWindowDays: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Nhóm vai trò</label>
                <input
                  value={pipForm.roleGroup}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, roleGroup: event.target.value }))}
                  placeholder="Ví dụ: SALES / MARKETING / HCNS"
                />
              </div>
              <div className="field">
                <label>Số ngày thiếu log (30 ngày)</label>
                <input
                  type="number"
                  min={0}
                  value={pipForm.missingLogCount30d}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, missingLogCount30d: event.target.value }))}
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Phụ lục bắt buộc</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  {appendixOptions.map((item) => (
                    <label key={item.code} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={pipForm.mandatoryAppendixCodes.includes(item.code)}
                        onChange={(event) =>
                          setPipForm((prev) => ({
                            ...prev,
                            mandatoryAppendixCodes: event.target.checked
                              ? Array.from(new Set([...prev.mandatoryAppendixCodes, item.code]))
                              : prev.mandatoryAppendixCodes.filter((code) => code !== item.code)
                          }))
                        }
                      />
                      <span>{item.code} - {item.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                  <input
                    type="checkbox"
                    checked={pipForm.coachingCheckinWeekly}
                    onChange={(event) => setPipForm((prev) => ({ ...prev, coachingCheckinWeekly: event.target.checked }))}
                  />
                  <span>Yêu cầu coaching check-in hằng tuần</span>
                </label>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Ghi chú baseline</label>
                <textarea
                  rows={2}
                  value={pipForm.baselineNote}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, baselineNote: event.target.value }))}
                />
              </div>
              <div className="action-buttons" style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-primary" type="submit" disabled={isMutating}>
                  <LifeBuoy size={16} />
                  Tạo PIP case
                </button>
                <button className="btn btn-ghost" type="button" disabled={isMutating} onClick={() => void runAutoDraftPip()}>
                  <Wand2 size={16} />
                  Chạy auto-draft PIP
                </button>
              </div>
            </form>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Filter PIP</h3>
            <div className="form-grid" style={{ gridTemplateColumns: canOverrideEmployeeId ? 'repeat(3, minmax(180px, 1fr))' : 'repeat(2, minmax(180px, 1fr))' }}>
              {canOverrideEmployeeId && (
                <div className="field">
                  <label>Employee ID</label>
                  <input
                    value={pipFilter.employeeId}
                    onChange={(event) => setPipFilter((prev) => ({ ...prev, employeeId: event.target.value }))}
                  />
                </div>
              )}
              <div className="field">
                <label>Status</label>
                <input
                  value={pipFilter.status}
                  placeholder="DRAFT/OPEN/CLOSED"
                  onChange={(event) => setPipFilter((prev) => ({ ...prev, status: event.target.value }))}
                />
              </div>
              <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-ghost" type="button" onClick={() => void loadPipTab()} disabled={isLoading || isMutating}>
                  <RefreshCw size={16} />
                  Áp dụng filter
                </button>
              </div>
            </div>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>PIP cases ({pipCases.length})</h3>
            <div className="table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Opened</th>
                    <th>Closed</th>
                    <th>Source PL10</th>
                  </tr>
                </thead>
                <tbody>
                  {pipCases.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Chưa có PIP case.</td>
                    </tr>
                  ) : (
                    pipCases.map((row) => (
                      <tr key={toSafeString(row.id) || `${row.employeeId}-${row.triggerReason}`}>
                        <td>{toSafeString(row.employeeId) || '--'}</td>
                        <td>{toSafeString(row.triggerReason) || '--'}</td>
                        <td>
                          <span className={statusPillClass(row.status)}>{toSafeString(row.status) || '--'}</span>
                        </td>
                        <td>{formatDateTime(row.openedAt)}</td>
                        <td>{formatDateTime(row.closedAt)}</td>
                        <td>{toSafeString(row.sourceSubmissionId) || '--'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
