'use client';

import Link from 'next/link';
import {
  Activity,
  BarChart3,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Download,
  FileChartColumn,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  TrendingUp,
  Users
} from 'lucide-react';
import { type ComponentType, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { readStoredAuthSession } from '../lib/auth-session';
import { apiRequest, normalizePagedListPayload } from '../lib/api-client';
import { Badge, CreateEntityDialog } from './ui';

type ReportOutputFormat = 'JSON' | 'CSV' | 'XLSX' | 'PDF';
type ReportOverviewRange = 'YESTERDAY' | 'THIS_WEEK' | 'LAST_WEEK' | 'LAST_MONTH';
type ReportRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';
type ReportGroupId =
  | 'executive'
  | 'crm-sales'
  | 'finance'
  | 'inventory-scm'
  | 'hr'
  | 'projects'
  | 'workflow-audit';

type ReportDefinition = {
  id: string;
  name: string;
  reportType?: string | null;
  moduleName?: string | null;
  templateCode?: string | null;
  outputFormat?: ReportOutputFormat | null;
  status?: string | null;
  scheduleRule?: string | null;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  createdAt?: string | null;
};

type ReportRun = {
  id: string;
  reportId: string;
  outputFormat?: ReportOutputFormat | null;
  runStatus?: ReportRunStatus | string | null;
  status?: string | null;
  generatedAt?: string | null;
  createdAt?: string | null;
  finishedAt?: string | null;
  errorMessage?: string | null;
  outputSizeBytes?: number | null;
};

type ReportGroupConfig = {
  id: ReportGroupId;
  label: string;
  description: string;
  modules: string[];
};

const RANGE_OPTIONS: Array<{ value: ReportOverviewRange; label: string }> = [
  { value: 'YESTERDAY', label: 'Hôm qua' },
  { value: 'THIS_WEEK', label: 'Tuần này' },
  { value: 'LAST_WEEK', label: 'Tuần trước' },
  { value: 'LAST_MONTH', label: 'Tháng trước' }
];

const OUTPUT_FORMAT_OPTIONS: Array<{ value: ReportOutputFormat; label: string; supported: boolean }> = [
  { value: 'JSON', label: 'JSON', supported: true },
  { value: 'CSV', label: 'CSV', supported: true },
  { value: 'XLSX', label: 'XLSX', supported: true },
  { value: 'PDF', label: 'PDF (chưa hỗ trợ)', supported: false }
];

const REPORT_GROUPS: ReportGroupConfig[] = [
  {
    id: 'executive',
    label: 'Executive',
    description: 'Tổng quan điều hành cho ban giám đốc: KPI cốt lõi, dòng tiền và vận hành toàn doanh nghiệp.',
    modules: ['sales', 'finance', 'scm', 'hr', 'projects', 'crm', 'workflows', 'audit']
  },
  {
    id: 'crm-sales',
    label: 'CRM / Sales',
    description: 'Theo dõi khách hàng, pipeline bán hàng, chuyển đổi và hiệu quả đội sales.',
    modules: ['crm', 'sales']
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Báo cáo doanh thu, công nợ, hóa đơn và tình hình tài chính vận hành.',
    modules: ['finance']
  },
  {
    id: 'inventory-scm',
    label: 'Inventory / SCM',
    description: 'Chuỗi cung ứng, hàng tồn, mua hàng và hiệu suất tồn kho.',
    modules: ['scm', 'catalog', 'assets']
  },
  {
    id: 'hr',
    label: 'HR',
    description: 'Biến động nhân sự, năng suất, tuân thủ và vận hành phòng ban.',
    modules: ['hr']
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Tiến độ dự án, forecast, nguồn lực và mức hoàn thành theo mốc.',
    modules: ['projects']
  },
  {
    id: 'workflow-audit',
    label: 'Workflow / Audit',
    description: 'Luồng phê duyệt, SLA xử lý, nhật ký hệ thống và giám sát tuân thủ.',
    modules: ['workflows', 'audit']
  }
];

const MODULE_LABELS: Record<string, string> = {
  sales: 'Sales',
  crm: 'CRM',
  finance: 'Finance',
  scm: 'SCM',
  catalog: 'Catalog',
  assets: 'Assets',
  hr: 'HR',
  projects: 'Projects',
  workflows: 'Workflow',
  audit: 'Audit'
};

const MODULE_ROUTES: Record<string, string> = {
  sales: '/modules/sales',
  crm: '/modules/crm',
  finance: '/modules/finance',
  scm: '/modules/scm',
  catalog: '/modules/catalog',
  assets: '/modules/assets',
  hr: '/modules/hr',
  projects: '/modules/projects',
  workflows: '/modules/workflows',
  audit: '/modules/audit'
};

const GROUP_ICON_BY_ID: Record<ReportGroupId, ComponentType<{ size?: number }>> = {
  executive: TrendingUp,
  'crm-sales': Users,
  finance: FileChartColumn,
  'inventory-scm': Briefcase,
  hr: Users,
  projects: BarChart3,
  'workflow-audit': Activity
};

const REPORT_TYPE_OPTIONS = [
  { value: 'EXECUTIVE', label: 'Executive' },
  { value: 'CRM_SALES', label: 'CRM / Sales' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'INVENTORY_SCM', label: 'Inventory / SCM' },
  { value: 'HR', label: 'HR' },
  { value: 'PROJECTS', label: 'Projects' },
  { value: 'WORKFLOW_AUDIT', label: 'Workflow / Audit' }
];

type CreateDefinitionFormState = {
  name: string;
  reportType: string;
  moduleName: string;
  templateCode: string;
  outputFormat: ReportOutputFormat;
  scheduleRule: string;
  nextRunAt: string;
  status: 'ACTIVE' | 'INACTIVE';
};

const MODULE_OPTIONS = Array.from(new Set(REPORT_GROUPS.flatMap((group) => group.modules))).map((moduleName) => ({
  value: moduleName,
  label: MODULE_LABELS[moduleName] ?? moduleName.toUpperCase()
}));

const INITIAL_CREATE_FORM: CreateDefinitionFormState = {
  name: '',
  reportType: 'EXECUTIVE',
  moduleName: 'sales',
  templateCode: 'day',
  outputFormat: 'XLSX',
  scheduleRule: '',
  nextRunAt: '',
  status: 'ACTIVE'
};

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeGroupByModule(moduleName: string): ReportGroupId {
  const normalized = moduleName.trim().toLowerCase();
  if (normalized === 'crm' || normalized === 'sales') return 'crm-sales';
  if (normalized === 'finance') return 'finance';
  if (normalized === 'scm' || normalized === 'catalog' || normalized === 'assets') return 'inventory-scm';
  if (normalized === 'hr') return 'hr';
  if (normalized === 'projects') return 'projects';
  if (normalized === 'workflows' || normalized === 'audit') return 'workflow-audit';
  return 'executive';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '--';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '--';
  return parsed.toLocaleString('vi-VN');
}

function toStatusVariant(runStatus: string | null | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  const normalized = normalizeText(runStatus).toLowerCase();
  if (normalized === 'succeeded') return 'success';
  if (normalized === 'running' || normalized === 'queued') return 'warning';
  if (normalized === 'failed') return 'danger';
  return 'neutral';
}

function toDownloadFileName(definition: ReportDefinition, run: ReportRun) {
  const base = normalizeText(definition.name) || 'report';
  const format = normalizeText(run.outputFormat || definition.outputFormat || 'json').toLowerCase();
  return `${base.replace(/[^a-zA-Z0-9._-]+/g, '_')}-${run.id}.${format}`;
}

function parseApiErrorMessage(payload: unknown, fallback: string) {
  if (!payload) return fallback;
  if (typeof payload === 'string' && payload.trim().length > 0) return payload;
  if (typeof payload === 'object' && payload && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const message = record.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}

export function ReportsCenter() {
  const [definitions, setDefinitions] = useState<ReportDefinition[]>([]);
  const [loadingDefinitions, setLoadingDefinitions] = useState(false);
  const [definitionsError, setDefinitionsError] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<ReportGroupId>('executive');
  const [search, setSearch] = useState('');
  const [selectedRange, setSelectedRange] = useState<ReportOverviewRange>('THIS_WEEK');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateDefinitionFormState>(INITIAL_CREATE_FORM);
  const [createValidationErrors, setCreateValidationErrors] = useState<string[]>([]);
  const [isCreatingDefinition, setIsCreatingDefinition] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runLoadingByDefinitionId, setRunLoadingByDefinitionId] = useState<Record<string, boolean>>({});
  const [runsByDefinitionId, setRunsByDefinitionId] = useState<Record<string, ReportRun[]>>({});
  const [runsLoadingByDefinitionId, setRunsLoadingByDefinitionId] = useState<Record<string, boolean>>({});
  const [runsErrorByDefinitionId, setRunsErrorByDefinitionId] = useState<Record<string, string | null>>({});
  const [expandedRunDefinitionIds, setExpandedRunDefinitionIds] = useState<string[]>([]);
  const [formatByDefinitionId, setFormatByDefinitionId] = useState<Record<string, ReportOutputFormat>>({});
  const [runningDueSchedules, setRunningDueSchedules] = useState(false);

  const loadDefinitions = useCallback(async () => {
    setLoadingDefinitions(true);
    setDefinitionsError(null);
    try {
      const payload = await apiRequest('/reports', {
        query: {
          limit: 200,
          sortBy: 'name',
          sortDir: 'asc'
        }
      });
      const normalized = normalizePagedListPayload<ReportDefinition>(payload);
      setDefinitions(normalized.items);
      setFormatByDefinitionId((previous) => {
        const next = { ...previous };
        normalized.items.forEach((definition) => {
          const current = next[definition.id];
          if (!current) {
            const fallback = normalizeText(definition.outputFormat).toUpperCase();
            next[definition.id] = fallback === 'CSV' || fallback === 'JSON' || fallback === 'PDF' ? (fallback as ReportOutputFormat) : 'XLSX';
          }
        });
        return next;
      });
    } catch (error) {
      setDefinitionsError(error instanceof Error ? error.message : 'Không thể tải danh sách báo cáo.');
    } finally {
      setLoadingDefinitions(false);
    }
  }, []);

  useEffect(() => {
    void loadDefinitions();
  }, [loadDefinitions]);

  const groupStats = useMemo(() => {
    const counts: Record<ReportGroupId, number> = {
      executive: definitions.length,
      'crm-sales': 0,
      finance: 0,
      'inventory-scm': 0,
      hr: 0,
      projects: 0,
      'workflow-audit': 0
    };
    definitions.forEach((definition) => {
      const groupId = normalizeGroupByModule(normalizeText(definition.moduleName));
      counts[groupId] += 1;
    });
    return counts;
  }, [definitions]);

  const filteredDefinitions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return definitions.filter((definition) => {
      if (activeGroup !== 'executive') {
        const definitionGroup = normalizeGroupByModule(normalizeText(definition.moduleName));
        if (definitionGroup !== activeGroup) {
          return false;
        }
      }

      if (!keyword) return true;
      const haystack = [
        definition.name,
        definition.reportType,
        definition.moduleName,
        definition.templateCode
      ]
        .map((value) => normalizeText(value).toLowerCase())
        .join(' ');
      return haystack.includes(keyword);
    });
  }, [activeGroup, definitions, search]);

  const loadRuns = useCallback(async (definitionId: string) => {
    setRunsLoadingByDefinitionId((prev) => ({ ...prev, [definitionId]: true }));
    setRunsErrorByDefinitionId((prev) => ({ ...prev, [definitionId]: null }));
    try {
      const payload = await apiRequest(`/reports/${definitionId}/runs`, {
        query: {
          limit: 20,
          sortBy: 'createdAt',
          sortDir: 'desc'
        }
      });
      const normalized = normalizePagedListPayload<ReportRun>(payload);
      setRunsByDefinitionId((prev) => ({ ...prev, [definitionId]: normalized.items }));
    } catch (error) {
      setRunsErrorByDefinitionId((prev) => ({
        ...prev,
        [definitionId]: error instanceof Error ? error.message : 'Không thể tải lịch sử chạy.'
      }));
    } finally {
      setRunsLoadingByDefinitionId((prev) => ({ ...prev, [definitionId]: false }));
    }
  }, []);

  const toggleRuns = useCallback(
    async (definitionId: string) => {
      setExpandedRunDefinitionIds((prev) => {
        if (prev.includes(definitionId)) {
          return prev.filter((id) => id !== definitionId);
        }
        return [...prev, definitionId];
      });
      if (!runsByDefinitionId[definitionId] && !runsLoadingByDefinitionId[definitionId]) {
        await loadRuns(definitionId);
      }
    },
    [loadRuns, runsByDefinitionId, runsLoadingByDefinitionId]
  );

  const runNow = useCallback(
    async (definition: ReportDefinition) => {
      const format = formatByDefinitionId[definition.id] ?? 'XLSX';
      if (format === 'PDF') {
        setRunError('Định dạng PDF hiện chưa hỗ trợ. Vui lòng chọn CSV hoặc XLSX.');
        return;
      }

      setRunError(null);
      setRunMessage(null);
      setRunLoadingByDefinitionId((prev) => ({ ...prev, [definition.id]: true }));
      try {
        await apiRequest(`/reports/${definition.id}/generate`, {
          method: 'POST',
          body: {
            outputFormat: format,
            range: selectedRange,
            limit: 500
          }
        });
        setRunMessage(`Đã chạy báo cáo "${definition.name}" thành công.`);
        await Promise.all([loadDefinitions(), loadRuns(definition.id)]);
        setExpandedRunDefinitionIds((prev) => (prev.includes(definition.id) ? prev : [...prev, definition.id]));
      } catch (error) {
        setRunError(error instanceof Error ? error.message : `Không thể chạy báo cáo "${definition.name}".`);
      } finally {
        setRunLoadingByDefinitionId((prev) => ({ ...prev, [definition.id]: false }));
      }
    },
    [formatByDefinitionId, loadDefinitions, loadRuns, selectedRange]
  );

  const runDueSchedules = useCallback(async () => {
    setRunningDueSchedules(true);
    setRunError(null);
    setRunMessage(null);
    try {
      const payload = await apiRequest<{ processed?: number; failed?: number }>('/reports/schedules/run-due', {
        method: 'POST',
        body: { limit: 50 }
      });
      const processed = Number(payload?.processed ?? 0);
      const failed = Number(payload?.failed ?? 0);
      setRunMessage(`Đã xử lý lịch chạy tự động: ${processed} thành công, ${failed} lỗi.`);
      await loadDefinitions();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Không thể chạy lịch báo cáo đến hạn.');
    } finally {
      setRunningDueSchedules(false);
    }
  }, [loadDefinitions]);

  const downloadRun = useCallback(async (definition: ReportDefinition, run: ReportRun) => {
    try {
      const authSession = readStoredAuthSession();
      const token = normalizeText(authSession?.accessToken);
      const tenantId = normalizeText(process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID) || 'GOIUUDAI';
      const tenantHeaderKey = normalizeText(process.env.NEXT_PUBLIC_TENANT_HEADER_KEY) || 'x-tenant-id';
      const baseUrl = String(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
      const headers: Record<string, string> = {
        'x-tenant-id': tenantId
      };

      if (tenantHeaderKey.toLowerCase() !== 'x-tenant-id') {
        headers[tenantHeaderKey] = tenantId;
      }
      if (token) {
        headers.authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}/reports/runs/${run.id}/download`, {
        method: 'GET',
        headers,
        cache: 'no-store'
      });

      if (!response.ok) {
        const text = await response.text();
        const fallback = `Không thể tải file run ${run.id}.`;
        let parsedPayload: unknown = null;
        if (text) {
          try {
            parsedPayload = JSON.parse(text);
          } catch {
            parsedPayload = text;
          }
        }
        throw new Error(parseApiErrorMessage(parsedPayload, fallback));
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = toDownloadFileName(definition, run);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Không thể tải file báo cáo.');
    }
  }, []);

  const validateCreateForm = useCallback(() => {
    const errors: string[] = [];
    if (!createForm.name.trim()) {
      errors.push('Tên báo cáo là bắt buộc.');
    }
    if (!createForm.reportType.trim()) {
      errors.push('Loại báo cáo là bắt buộc.');
    }
    if (!createForm.moduleName.trim()) {
      errors.push('Phân hệ nguồn là bắt buộc.');
    }
    if (createForm.outputFormat === 'PDF') {
      errors.push('PDF chưa hỗ trợ. Vui lòng chọn CSV hoặc XLSX.');
    }
    return errors;
  }, [createForm]);

  const submitCreateDefinition = useCallback(
    async (options: { keepOpen?: boolean } = {}) => {
      const validationErrors = validateCreateForm();
      setCreateValidationErrors(validationErrors);
      if (validationErrors.length > 0) {
        return;
      }

      setIsCreatingDefinition(true);
      setRunError(null);
      try {
        await apiRequest('/reports', {
          method: 'POST',
          body: {
            name: createForm.name.trim(),
            reportType: createForm.reportType.trim(),
            moduleName: createForm.moduleName.trim(),
            templateCode: createForm.templateCode.trim() || undefined,
            outputFormat: createForm.outputFormat,
            scheduleRule: createForm.scheduleRule.trim() || undefined,
            nextRunAt: createForm.nextRunAt || undefined,
            status: createForm.status
          }
        });

        setRunMessage(`Đã tạo mẫu báo cáo "${createForm.name.trim()}".`);
        await loadDefinitions();

        if (options.keepOpen) {
          setCreateForm((prev) => ({ ...INITIAL_CREATE_FORM, moduleName: prev.moduleName, reportType: prev.reportType }));
          setCreateValidationErrors([]);
          return;
        }

        setIsCreateDialogOpen(false);
        setCreateForm(INITIAL_CREATE_FORM);
        setCreateValidationErrors([]);
      } catch (error) {
        setRunError(error instanceof Error ? error.message : 'Không thể tạo mẫu báo cáo mới.');
      } finally {
        setIsCreatingDefinition(false);
      }
    },
    [createForm, loadDefinitions, validateCreateForm]
  );

  return (
    <div className="reports-center">
      <header className="reports-center-header">
        <div>
          <h1>Reporting Center</h1>
          <p>
            Trung tâm báo cáo ERP: phân nhóm theo nghiệp vụ, chạy thủ công/lịch tự động, theo dõi run status và drill-through về dữ liệu nguồn.
          </p>
        </div>
        <div className="reports-center-toolbar">
          <button type="button" className="btn btn-ghost" onClick={() => void runDueSchedules()} disabled={runningDueSchedules}>
            {runningDueSchedules ? <Loader2 size={15} className="spin" /> : <CalendarClock size={15} />}
            Chạy lịch đến hạn
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus size={15} />
            Thêm dữ liệu
          </button>
        </div>
      </header>

      <section className="reports-center-filters">
        <div className="reports-center-search">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo tên báo cáo, module, template..."
          />
        </div>
        <div className="field-inline">
          <label htmlFor="reports-range-filter">Khoảng thời gian</label>
          <select
            id="reports-range-filter"
            value={selectedRange}
            onChange={(event) => setSelectedRange(event.target.value as ReportOverviewRange)}
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="reports-group-grid">
        {REPORT_GROUPS.map((group) => {
          const Icon = GROUP_ICON_BY_ID[group.id];
          return (
            <button
              key={group.id}
              type="button"
              className={`reports-group-card ${activeGroup === group.id ? 'is-active' : ''}`}
              onClick={() => setActiveGroup(group.id)}
            >
              <div className="reports-group-card-top">
                <span className="reports-group-icon"><Icon size={16} /></span>
                <Badge variant={activeGroup === group.id ? 'info' : 'neutral'}>
                  {groupStats[group.id]}
                </Badge>
              </div>
              <h3>{group.label}</h3>
              <p>{group.description}</p>
            </button>
          );
        })}
      </section>

      {definitionsError && <div className="banner banner-danger">{definitionsError}</div>}
      {runError && <div className="banner banner-danger">{runError}</div>}
      {runMessage && <div className="banner banner-success">{runMessage}</div>}

      <section className="reports-table-card">
        <div className="reports-table-header">
          <h2>
            <FileChartColumn size={17} /> Danh sách báo cáo ({filteredDefinitions.length})
          </h2>
          <button type="button" className="btn btn-ghost" onClick={() => void loadDefinitions()} disabled={loadingDefinitions}>
            {loadingDefinitions ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            Làm mới
          </button>
        </div>

        {loadingDefinitions && definitions.length === 0 ? (
          <div className="reports-empty-state">
            <Loader2 size={18} className="spin" />
            <span>Đang tải danh sách report definition...</span>
          </div>
        ) : filteredDefinitions.length === 0 ? (
          <div className="reports-empty-state">
            <CircleAlert size={16} />
            <span>Chưa có báo cáo phù hợp bộ lọc hiện tại. Hãy tạo report definition đầu tiên cho nhóm này.</span>
          </div>
        ) : (
          <div className="reports-definition-list">
            {filteredDefinitions.map((definition) => {
              const moduleName = normalizeText(definition.moduleName).toLowerCase();
              const moduleLabel = MODULE_LABELS[moduleName] ?? (moduleName || '--');
              const moduleRoute = MODULE_ROUTES[moduleName] ?? '/modules/reports';
              const selectedFormat = formatByDefinitionId[definition.id] ?? (definition.outputFormat ?? 'XLSX');
              const runs = runsByDefinitionId[definition.id] ?? [];
              const runPanelOpen = expandedRunDefinitionIds.includes(definition.id);
              const runPanelLoading = runsLoadingByDefinitionId[definition.id] === true;
              const runPanelError = runsErrorByDefinitionId[definition.id];

              return (
                <article key={definition.id} className="reports-definition-card">
                  <div className="reports-definition-main">
                    <div className="reports-definition-title">
                      <h3>{definition.name || definition.id}</h3>
                      <div className="reports-definition-meta">
                        <Badge variant="neutral">{moduleLabel}</Badge>
                        <Badge variant="info">{normalizeText(definition.reportType) || 'GENERAL'}</Badge>
                        <Badge variant={normalizeText(definition.status).toUpperCase() === 'ACTIVE' ? 'success' : 'warning'}>
                          {normalizeText(definition.status) || 'UNKNOWN'}
                        </Badge>
                      </div>
                    </div>
                    <p className="reports-definition-subline">
                      Mẫu: {normalizeText(definition.templateCode) || '--'} • Lịch chạy: {normalizeText(definition.scheduleRule) || 'Thủ công'} • Lần chạy gần nhất: {formatDateTime(definition.lastRunAt)}
                    </p>
                    <p className="reports-definition-subline">
                      Next run: {formatDateTime(definition.nextRunAt)} • Created: {formatDateTime(definition.createdAt)}
                    </p>
                  </div>

                  <div className="reports-definition-actions">
                    <Link href={`${moduleRoute}?range=${selectedRange}&reportId=${definition.id}`} className="btn btn-ghost">
                      <BarChart3 size={14} />
                      Preview & drill-through
                    </Link>
                    <label className="field-inline">
                      <span>Định dạng</span>
                      <select
                        value={selectedFormat}
                        onChange={(event) =>
                          setFormatByDefinitionId((prev) => ({
                            ...prev,
                            [definition.id]: event.target.value as ReportOutputFormat
                          }))
                        }
                      >
                        {OUTPUT_FORMAT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value} disabled={!option.supported}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void runNow(definition)}
                      disabled={runLoadingByDefinitionId[definition.id]}
                    >
                      {runLoadingByDefinitionId[definition.id] ? <Loader2 size={14} className="spin" /> : <Settings2 size={14} />}
                      Export
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => void toggleRuns(definition.id)}>
                      {runPanelOpen ? 'Ẩn runs' : 'Xem runs'}
                    </button>
                  </div>

                  {runPanelOpen && (
                    <div className="reports-runs-panel">
                      {runPanelLoading ? (
                        <div className="reports-empty-state">
                          <Loader2 size={16} className="spin" />
                          <span>Đang tải lịch sử chạy...</span>
                        </div>
                      ) : runPanelError ? (
                        <div className="banner banner-danger">{runPanelError}</div>
                      ) : runs.length === 0 ? (
                        <div className="reports-empty-state">
                          <Clock3 size={16} />
                          <span>Chưa có lần chạy nào cho report này.</span>
                        </div>
                      ) : (
                        <div className="reports-runs-table-wrap">
                          <table className="reports-runs-table">
                            <thead>
                              <tr>
                                <th>Run ID</th>
                                <th>Trạng thái</th>
                                <th>Format</th>
                                <th>Bắt đầu</th>
                                <th>Kết thúc</th>
                                <th>Dung lượng</th>
                                <th>Tác vụ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {runs.map((run) => (
                                <tr key={run.id}>
                                  <td className="mono">{run.id}</td>
                                  <td>
                                    <Badge variant={toStatusVariant(run.runStatus)}>
                                      {normalizeText(run.runStatus) || '--'}
                                    </Badge>
                                  </td>
                                  <td>{normalizeText(run.outputFormat) || '--'}</td>
                                  <td>{formatDateTime(run.createdAt || run.generatedAt)}</td>
                                  <td>{formatDateTime(run.finishedAt)}</td>
                                  <td>{run.outputSizeBytes ? `${Math.round(run.outputSizeBytes / 1024)} KB` : '--'}</td>
                                  <td>
                                    {normalizeText(run.runStatus).toLowerCase() === 'succeeded' ? (
                                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void downloadRun(definition, run)}>
                                        <Download size={14} />
                                        Tải xuống
                                      </button>
                                    ) : normalizeText(run.runStatus).toLowerCase() === 'failed' ? (
                                      <span className="run-error-inline">{normalizeText(run.errorMessage) || 'Run thất bại'}</span>
                                    ) : (
                                      <span className="run-pending-inline">Đang xử lý...</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <CreateEntityDialog
        open={isCreateDialogOpen}
        onClose={() => {
          if (isCreatingDefinition) return;
          setIsCreateDialogOpen(false);
          setCreateValidationErrors([]);
          setCreateForm(INITIAL_CREATE_FORM);
        }}
        entityLabel="Report definition"
        helperText="Khai báo report theo nhóm nghiệp vụ, chọn lịch chạy và định dạng xuất. Có thể lưu liên tục nhiều định nghĩa."
        fieldCount={8}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={isCreatingDefinition}
              onClick={() => {
                setIsCreateDialogOpen(false);
                setCreateValidationErrors([]);
                setCreateForm(INITIAL_CREATE_FORM);
              }}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isCreatingDefinition}
              onClick={() => void submitCreateDefinition({ keepOpen: true })}
            >
              {isCreatingDefinition ? 'Đang lưu...' : 'Lưu & thêm mới'}
            </button>
            <button
              type="submit"
              form="create-report-definition-form"
              className="btn btn-primary"
              disabled={isCreatingDefinition}
            >
              {isCreatingDefinition ? 'Đang lưu...' : 'Lưu mẫu báo cáo'}
            </button>
          </>
        }
      >
        <form
          id="create-report-definition-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void submitCreateDefinition();
          }}
          style={{ display: 'grid', gap: '0.9rem' }}
        >
          {createValidationErrors.length > 0 ? (
            <div className="validation-summary">
              <strong>Không thể lưu vì:</strong>
              <ul>
                {createValidationErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="report-definition-name">Tên báo cáo *</label>
            <input
              id="report-definition-name"
              value={createForm.name}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="VD: Executive Weekly Snapshot"
              required
            />
          </div>
          <div className="field field-grid-2">
            <div>
              <label htmlFor="report-definition-type">Nhóm báo cáo *</label>
              <select
                id="report-definition-type"
                value={createForm.reportType}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, reportType: event.target.value }))}
              >
                {REPORT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="report-definition-module">Phân hệ nguồn *</label>
              <select
                id="report-definition-module"
                value={createForm.moduleName}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, moduleName: event.target.value }))}
              >
                {MODULE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field field-grid-2">
            <div>
              <label htmlFor="report-definition-format">Định dạng mặc định</label>
              <select
                id="report-definition-format"
                value={createForm.outputFormat}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, outputFormat: event.target.value as ReportOutputFormat }))}
              >
                {OUTPUT_FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} disabled={!option.supported}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="report-definition-template">Template code</label>
              <input
                id="report-definition-template"
                value={createForm.templateCode}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, templateCode: event.target.value }))}
                placeholder="day / month / owner / product"
              />
            </div>
          </div>
          <div className="field field-grid-2">
            <div>
              <label htmlFor="report-definition-schedule">Lịch chạy</label>
              <input
                id="report-definition-schedule"
                value={createForm.scheduleRule}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, scheduleRule: event.target.value }))}
                placeholder="VD: DAILY:1 / WEEKLY:1 / HOURLY:4"
              />
            </div>
            <div>
              <label htmlFor="report-definition-next-run">Lần chạy kế tiếp</label>
              <input
                id="report-definition-next-run"
                type="datetime-local"
                value={createForm.nextRunAt}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, nextRunAt: event.target.value }))}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="report-definition-status">Trạng thái</label>
            <select
              id="report-definition-status"
              value={createForm.status}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, status: event.target.value as 'ACTIVE' | 'INACTIVE' }))}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </div>
        </form>
      </CreateEntityDialog>
    </div>
  );
}
