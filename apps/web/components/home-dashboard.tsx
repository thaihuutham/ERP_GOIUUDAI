'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  TrendingUp, 
  Users, 
  FileText, 
  ShoppingCart, 
  LayoutDashboard,
  ShieldCheck,
  Activity,
  ArrowRight,
  ListTodo,
  Clock,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  CreditCard,
  Package,
  PieChart,
  UserPlus,
  Palmtree,
  Briefcase,
  Handshake
} from 'lucide-react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { moduleCards } from '../lib/modules';
import { formatRuntimeCurrency } from '../lib/runtime-format';
import { SYSTEM_PROFILE } from '../lib/system-profile';
import { useAccessPolicy } from './access-policy-context';
import { useUserRole } from './user-role-context';
import { StatCard, SimpleAreaChart, SimplePieChart, DualBarChart, Badge, Skeleton } from './ui';
import { useSmartPolling } from '../lib/use-smart-polling';

/* ─── Types ──────────────────────────────────────── */

type CashflowEntry = {
  month?: string;
  label?: string;
  income?: number;
  expense?: number;
};

type Overview = {
  range?: {
    key?: string;
    label?: string;
    from?: string;
    to?: string;
  };
  totalRevenue?: number;
  totalEmployees?: number;
  pendingInvoices?: number;
  activePurchaseOrders?: number;
  totalOrders?: number;
  revenueDeltaPercent?: number | null;
  // New KPI fields
  totalCollections?: number;
  totalExpenses?: number;
  budgetUsedPercent?: number;
  activeEmployees?: number;
  onLeaveToday?: number;
  activeRecruitment?: number;
  newCustomersInRange?: number;
  charts?: {
    revenueSeries?: Array<{ bucket?: string; label?: string; value?: number; orders?: number }>;
    orderStatusSeries?: Array<{ status?: string; label?: string; value?: number }>;
    cashflowSeries?: CashflowEntry[];
  };
};

type WorkflowInboxTask = {
  id: string;
  title: string;
  status: 'pending' | 'urgent' | 'completed';
  module: string;
};

type DashboardActivity = {
  id: string;
  text: string;
  time: string;
  color: string;
};

type WidgetStatus = 'idle' | 'loading' | 'ready' | 'error' | 'stale' | 'disabled';

type WidgetState<T> = {
  status: WidgetStatus;
  data: T;
  error: string | null;
  lastUpdatedAt: string | null;
};

/* ─── Constants ──────────────────────────────────── */

const POLL_INTERVALS = {
  overview: 120_000,
  tasks: 60_000,
  activity: 45_000
} as const;

const DASHBOARD_RANGES = [
  { key: 'YESTERDAY', label: 'Hôm qua' },
  { key: 'THIS_WEEK', label: 'Tuần này' },
  { key: 'LAST_WEEK', label: 'Tuần trước' },
  { key: 'LAST_MONTH', label: 'Tháng trước' }
] as const;
type DashboardRangeKey = (typeof DASHBOARD_RANGES)[number]['key'];

const REPORTS_DISABLED_NOTICE =
  "Phân hệ 'reports' đang tắt. Vui lòng bật lại tại Cấu hình hệ thống > Hồ sơ tổ chức > Phân hệ đang bật.";

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Tạo mới',
  UPDATE: 'Cập nhật',
  DELETE: 'Xóa dữ liệu',
  APPROVE: 'Đã duyệt',
  REJECT: 'Từ chối',
  SUBMIT: 'Gửi duyệt',
  ESCALATE: 'Chuyển mức duyệt',
  DELEGATE: 'Ủy quyền',
  CANCEL: 'Hủy thao tác'
};

/* ─── Helpers ────────────────────────────────────── */

function isReportsDisabledErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("phân hệ 'reports' đang bị tắt") ||
    (normalized.includes('reports') && normalized.includes('đang bị tắt')) ||
    normalized.includes("module 'reports' is disabled")
  );
}

function createWidgetState<T>(data: T): WidgetState<T> {
  return {
    status: 'idle',
    data,
    error: null,
    lastUpdatedAt: null
  };
}

function hasWidgetData(data: unknown) {
  if (data === null || data === undefined) {
    return false;
  }
  if (Array.isArray(data)) {
    return data.length > 0;
  }
  return true;
}

function normalizeWidgetError(error: unknown) {
  return error instanceof Error ? error.message : 'Lỗi hệ thống';
}

function getWidgetStatusLabel(status: WidgetStatus) {
  switch (status) {
    case 'loading':
      return 'Đang tải';
    case 'stale':
      return 'Dữ liệu trễ';
    case 'error':
      return 'Lỗi tải';
    case 'disabled':
      return 'Đã tắt';
    default:
      return null;
  }
}

function getWidgetStatusClass(status: WidgetStatus) {
  if (status === 'loading') return 'is-loading';
  if (status === 'stale') return 'is-stale';
  if (status === 'error') return 'is-error';
  if (status === 'disabled') return 'is-disabled';
  return 'is-ready';
}

function toFiniteNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasPositiveSeriesValue(series: Array<{ value?: number }> | undefined) {
  return Array.isArray(series) && series.some((item) => toFiniteNumber(item.value) > 0);
}

function toShortModuleLabel(value: string | undefined) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 'WF';
  return normalized.replace(/_/g, ' ').toUpperCase();
}

function mapInboxTasks(rows: Record<string, unknown>[]): WorkflowInboxTask[] {
  return rows.slice(0, 5).map((row, idx) => {
    const instance = row.instance && typeof row.instance === 'object' ? (row.instance as Record<string, unknown>) : null;
    const definition = instance?.definition && typeof instance.definition === 'object'
      ? (instance.definition as Record<string, unknown>)
      : null;

    const dueAtRaw = String(row.dueAt ?? '');
    const dueAt = dueAtRaw ? new Date(dueAtRaw) : null;
    const rawStatus = String(row.status ?? '').toUpperCase();

    let status: WorkflowInboxTask['status'] = 'pending';
    if (rawStatus === 'APPROVED' || rawStatus === 'COMPLETED') {
      status = 'completed';
    } else if (dueAt && Number.isFinite(dueAt.getTime()) && dueAt.getTime() < Date.now()) {
      status = 'urgent';
    }

    const baseTitle = String(definition?.name ?? row.targetType ?? 'Yêu cầu phê duyệt');
    const targetId = String(row.targetId ?? '').trim();
    return {
      id: String(row.id ?? `task-${idx}`),
      title: targetId ? `${baseTitle} • ${targetId}` : baseTitle,
      status,
      module: toShortModuleLabel(String(definition?.module ?? row.targetType ?? 'WF'))
    };
  });
}

function formatRelativeTime(value: string | undefined) {
  if (!value) return 'Vừa xong';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'Vừa xong';

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} ngày trước`;
}

function getActivityColor(action: string, operationType: string) {
  const normalizedAction = action.toUpperCase();
  const normalizedType = operationType.toUpperCase();

  if (normalizedAction.includes('DELETE') || normalizedAction.includes('REJECT') || normalizedType.includes('DELETE')) {
    return 'var(--danger)';
  }
  if (normalizedAction.includes('APPROVE') || normalizedAction.includes('CREATE')) {
    return 'var(--success)';
  }
  if (normalizedAction.includes('UPDATE')) {
    return 'var(--primary)';
  }
  return 'var(--warning)';
}

function mapAuditActivities(rows: Record<string, unknown>[]): DashboardActivity[] {
  return rows.slice(0, 6).map((row, idx) => {
    const actionRaw = String(row.action ?? '').toUpperCase();
    const operationType = String(row.operationType ?? '');
    const module = toShortModuleLabel(String(row.module ?? 'ERP'));
    const actionLabel = ACTION_LABELS[actionRaw] ?? actionRaw.replace(/_/g, ' ');
    const entityType = String(row.entityType ?? '').trim();
    const text = entityType ? `[${module}] ${actionLabel} ${entityType}` : `[${module}] ${actionLabel}`;

    return {
      id: String(row.id ?? `activity-${idx}`),
      text,
      time: formatRelativeTime(String(row.createdAt ?? '')),
      color: getActivityColor(actionRaw, operationType)
    };
  });
}

function formatUpdatedAt(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatMetricValue(value: number | undefined, formatter?: (value: number) => string) {
  if (value === undefined || value === null) {
    return '--';
  }
  const numberValue = toFiniteNumber(value);
  if (!Number.isFinite(numberValue) || numberValue === 0) {
    return formatter ? formatter(0) : '0';
  }
  return formatter ? formatter(numberValue) : String(numberValue);
}

function formatShortCurrency(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} tỷ`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)} tr`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

/* ─── Component ──────────────────────────────────── */

export function HomeDashboard() {
  const { role } = useUserRole();
  const { canModule, canRoute } = useAccessPolicy();
  const [overviewState, setOverviewState] = useState<WidgetState<Overview | null>>(() =>
    createWidgetState<Overview | null>(null)
  );
  const [selectedRange, setSelectedRange] = useState<DashboardRangeKey>('THIS_WEEK');
  const [tasksState, setTasksState] = useState<WidgetState<WorkflowInboxTask[]>>(() =>
    createWidgetState<WorkflowInboxTask[]>([])
  );
  const [activitiesState, setActivitiesState] = useState<WidgetState<DashboardActivity[]>>(() =>
    createWidgetState<DashboardActivity[]>([])
  );
  const reportsRuntimeCacheRef = useRef<{ enabled: boolean; checkedAt: number } | null>(null);

  const canViewReports = canModule('reports');
  const canViewWorkflows = canModule('workflows');
  const canViewAudit = canModule('audit');
  const visibleModules = useMemo(
    () =>
      moduleCards.filter((module) => canModule(module.key) && canRoute(`/modules/${module.key}`)),
    [canModule, canRoute]
  );
  const reportsNotice = overviewState.status === 'disabled' ? REPORTS_DISABLED_NOTICE : null;

  const fetchReportsEnabled = useCallback(async (force = false) => {
    const now = Date.now();
    const cached = reportsRuntimeCacheRef.current;
    if (!force && cached && now - cached.checkedAt < 60_000) {
      return cached.enabled;
    }

    try {
      const runtime = await apiRequest<{ enabledModules?: unknown }>('/settings/runtime');
      const enabledModules = Array.isArray(runtime?.enabledModules)
        ? runtime.enabledModules.map((item) => String(item).toLowerCase()).filter((item) => item.length > 0)
        : [];
      const enabled = enabledModules.length > 0 ? enabledModules.includes('reports') : true;
      reportsRuntimeCacheRef.current = { enabled, checkedAt: now };
      return enabled;
    } catch {
      return true;
    }
  }, []);

  const loadOverviewWidget = useCallback(async () => {
    setOverviewState((prev) => ({
      ...prev,
      status: prev.data ? 'stale' : 'loading',
      error: null
    }));

    if (!canViewReports) {
      setOverviewState((prev) => ({
        ...prev,
        status: 'disabled',
        data: null,
        error: null
      }));
      return;
    }

    const reportsEnabled = await fetchReportsEnabled(true);
    if (!reportsEnabled) {
      setOverviewState((prev) => ({
        ...prev,
        status: 'disabled',
        data: null,
        error: REPORTS_DISABLED_NOTICE
      }));
      return;
    }

    try {
      const payload = await apiRequest<Overview>('/reports/overview', {
        query: {
          range: selectedRange
        }
      });
      setOverviewState({
        status: 'ready',
        data: payload,
        error: null,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (error) {
      const message = normalizeWidgetError(error);
      const normalizedMessage = isReportsDisabledErrorMessage(message) ? REPORTS_DISABLED_NOTICE : message;
      setOverviewState((prev) => {
        const stale = hasWidgetData(prev.data);
        return {
          ...prev,
          status: normalizedMessage === REPORTS_DISABLED_NOTICE ? 'disabled' : stale ? 'stale' : 'error',
          data: normalizedMessage === REPORTS_DISABLED_NOTICE ? null : prev.data,
          error: normalizedMessage
        };
      });
    }
  }, [canViewReports, fetchReportsEnabled, selectedRange]);

  const loadTasksWidget = useCallback(async () => {
    setTasksState((prev) =>
      prev.status === 'idle'
        ? {
            ...prev,
            status: 'loading',
            error: null
          }
        : prev
    );

    if (!canViewWorkflows) {
      setTasksState({
        status: 'disabled',
        data: [],
        error: null,
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    try {
      const payload = await apiRequest('/workflows/inbox', { query: { limit: 5 } });
      const rows = normalizeListPayload(payload);
      setTasksState({
        status: 'ready',
        data: mapInboxTasks(rows),
        error: null,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (error) {
      const message = normalizeWidgetError(error);
      setTasksState((prev) => {
        const stale = hasWidgetData(prev.data);
        return {
          ...prev,
          status: stale ? 'stale' : 'error',
          error: message
        };
      });
    }
  }, [canViewWorkflows]);

  const loadActivitiesWidget = useCallback(async () => {
    if (!canViewAudit) {
      setActivitiesState({
        status: 'disabled',
        data: [],
        error: null,
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    setActivitiesState((prev) =>
      prev.status === 'idle'
        ? {
            ...prev,
            status: 'loading',
            error: null
          }
        : prev
    );

    try {
      const payload = await apiRequest('/audit/logs', { query: { limit: 6 } });
      const rows = normalizeListPayload(payload);
      setActivitiesState({
        status: 'ready',
        data: mapAuditActivities(rows),
        error: null,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (error) {
      const message = normalizeWidgetError(error);
      setActivitiesState((prev) => {
        const stale = hasWidgetData(prev.data);
        return {
          ...prev,
          status: stale ? 'stale' : 'error',
          error: message
        };
      });
    }
  }, [canViewAudit]);

  useSmartPolling(loadOverviewWidget, POLL_INTERVALS.overview);
  useSmartPolling(loadTasksWidget, POLL_INTERVALS.tasks);
  useSmartPolling(loadActivitiesWidget, POLL_INTERVALS.activity);

  useEffect(() => {
    void loadOverviewWidget();
  }, [selectedRange, loadOverviewWidget]);

  /* ─── Derived data ─────────────────────────────── */

  const overviewData = overviewState.data;
  const revenueSeries = (overviewData?.charts?.revenueSeries ?? []).map((item) => ({
    name: String(item.label ?? item.bucket ?? ''),
    value: toFiniteNumber(item.value)
  }));
  const orderStatusSeries = (overviewData?.charts?.orderStatusSeries ?? []).map((item) => ({
    name: String(item.label ?? item.status ?? 'Khác'),
    value: toFiniteNumber(item.value)
  }));
  const cashflowSeries = (overviewData?.charts?.cashflowSeries ?? []).map((item) => ({
    name: String(item.label ?? item.month ?? ''),
    income: toFiniteNumber(item.income),
    expense: toFiniteNumber(item.expense)
  }));
  const hasRevenueData = hasPositiveSeriesValue(revenueSeries);
  const hasOrderStatusData = hasPositiveSeriesValue(orderStatusSeries);
  const hasCashflowData = cashflowSeries.some((item) => item.income > 0 || item.expense > 0);

  const overviewStatusLabel = getWidgetStatusLabel(overviewState.status);
  const tasksStatusLabel = getWidgetStatusLabel(tasksState.status);
  const activitiesStatusLabel = getWidgetStatusLabel(activitiesState.status);
  const selectedRangeLabel = DASHBOARD_RANGES.find((item) => item.key === selectedRange)?.label ?? selectedRange;

  const isLoading = overviewState.status === 'loading' && !overviewData;

  /* ─── Render ───────────────────────────────────── */

  return (
    <div className="dashboard-root">
      {/* ── Hero Panel ───────────────────────────── */}
      <section className="hero-panel">
        <div>
          <div className="hero-status-tag">
            <Activity size={14} /> Vận hành ổn định
          </div>
          <h1>
            {SYSTEM_PROFILE.systemName}
          </h1>
        </div>
        <div className="hero-right">
          <div className="hero-badge">
            <div className="hero-badge-row">
              <ShieldCheck size={14} />
              <span>{SYSTEM_PROFILE.governanceVision}</span>
            </div>
          </div>
          <div className="hero-role-label">
            Vai trò hiện tại: <strong>{role}</strong>
          </div>
          <div className="hero-range-selector">
            {DASHBOARD_RANGES.map((range) => (
              <button
                key={range.key}
                type="button"
                className={`btn btn-sm ${selectedRange === range.key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSelectedRange(range.key)}
                aria-pressed={selectedRange === range.key}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── KPI Row 1: BÁN HÀNG ─────────────────── */}
      <section className="kpi-section">
        <h2 className="kpi-section-title">
          <TrendingUp size={16} /> Bán hàng
        </h2>
        <div className="metrics-grid">
          <Link href={`/modules/sales?range=${selectedRange}`} className="link-unstyled">
            <StatCard
              label="Doanh thu"
              value={isLoading ? '--' : formatMetricValue(overviewData?.totalRevenue, (v) => formatRuntimeCurrency(v))}
              icon={<DollarSign size={18} />}
              color="var(--primary)"
              trend={typeof overviewData?.revenueDeltaPercent === 'number' ? overviewData.revenueDeltaPercent : undefined}
            />
          </Link>
          <Link href={`/modules/sales?range=${selectedRange}`} className="link-unstyled">
            <StatCard
              label="Đơn hàng"
              value={isLoading ? '--' : formatMetricValue(overviewData?.totalOrders)}
              icon={<Package size={18} />}
              color="var(--info)"
            />
          </Link>
          <Link href={`/modules/sales?q=APPROVED&range=${selectedRange}`} className="link-unstyled">
            <StatCard
              label="Đơn hoàn thành"
              value={isLoading ? '--' : formatMetricValue(
                orderStatusSeries.find((s) => s.name === 'Hoàn thành')?.value as number | undefined
              )}
              icon={<CheckCircle2 size={18} />}
              color="var(--success)"
            />
          </Link>
          <Link href={`/modules/sales?q=PENDING&range=${selectedRange}`} className="link-unstyled">
            <StatCard
              label="Chờ duyệt"
              value={isLoading ? '--' : formatMetricValue(
                orderStatusSeries.find((s) => s.name === 'Đang xử lý')?.value as number | undefined
              )}
              icon={<Clock size={18} />}
              color="var(--warning)"
            />
          </Link>
        </div>
      </section>

      {/* ── KPI Row 2: TÀI CHÍNH & VẬN HÀNH ─────── */}
      <section className="kpi-section">
        <h2 className="kpi-section-title">
          <CreditCard size={16} /> Tài chính & Vận hành
        </h2>
        <div className="metrics-grid">
          <Link href={`/modules/finance?q=PENDING&range=${selectedRange}`} className="link-unstyled">
            <StatCard
              label="Hóa đơn chờ xử lý"
              value={isLoading ? '--' : formatMetricValue(overviewData?.pendingInvoices)}
              icon={<FileText size={18} />}
              color="var(--warning)"
            />
          </Link>
          <Link href={`/modules/finance?q=APPROVED&range=${selectedRange}`} className="link-unstyled">
            <StatCard
              label="Thu tiền"
              value={isLoading ? '--' : formatMetricValue(overviewData?.totalCollections, (v) => formatShortCurrency(v))}
              icon={<DollarSign size={18} />}
              color="var(--success)"
            />
          </Link>
          <Link href={`/modules/scm?q=PENDING&range=${selectedRange}`} className="link-unstyled">
            <StatCard
              label="Đơn mua hàng (PO)"
              value={isLoading ? '--' : formatMetricValue(overviewData?.activePurchaseOrders)}
              icon={<ShoppingCart size={18} />}
              color="var(--danger)"
            />
          </Link>
          <Link href={`/modules/finance?range=${selectedRange}`} className="link-unstyled">
            <StatCard
              label="Ngân sách đã dùng"
              value={isLoading ? '--' : `${formatMetricValue(overviewData?.budgetUsedPercent)}%`}
              icon={<PieChart size={18} />}
              color="var(--info)"
            />
          </Link>
        </div>
      </section>

      {/* ── KPI Row 3: NHÂN SỰ & CRM ────────────── */}
      <section className="kpi-section">
        <h2 className="kpi-section-title">
          <Users size={16} /> Nhân sự & CRM
        </h2>
        <div className="metrics-grid">
          <Link href={`/modules/hr?range=${selectedRange}`} className="link-unstyled">
            <StatCard
              label="NV đang làm việc"
              value={isLoading ? '--' : `${formatMetricValue(overviewData?.activeEmployees)}/${formatMetricValue(overviewData?.totalEmployees)}`}
              icon={<Briefcase size={18} />}
              color="var(--success)"
            />
          </Link>
          <Link href="/modules/hr?q=LEAVE" className="link-unstyled">
            <StatCard
              label="Nghỉ phép hôm nay"
              value={isLoading ? '--' : formatMetricValue(overviewData?.onLeaveToday)}
              icon={<Palmtree size={18} />}
              color="var(--warning)"
            />
          </Link>
          <Link href="/modules/hr?q=PENDING" className="link-unstyled">
            <StatCard
              label="Tuyển đang xử lý"
              value={isLoading ? '--' : formatMetricValue(overviewData?.activeRecruitment)}
              icon={<UserPlus size={18} />}
              color="var(--info)"
            />
          </Link>
          <Link href={`/modules/crm?range=${selectedRange}`} className="link-unstyled">
            <StatCard
              label="KH mới"
              value={isLoading ? '--' : formatMetricValue(overviewData?.newCustomersInRange)}
              icon={<Handshake size={18} />}
              color="var(--primary)"
            />
          </Link>
        </div>
      </section>

      {/* ── Data range meta ──────────────────────── */}
      {overviewData?.range?.from && overviewData?.range?.to && (
        <div className="dashboard-refresh-meta">
          Phạm vi dữ liệu: {selectedRangeLabel} ({new Date(overviewData.range.from).toLocaleDateString('vi-VN')} - {new Date(overviewData.range.to).toLocaleDateString('vi-VN')}) • Tổng đơn: {formatMetricValue(overviewData.totalOrders)}
        </div>
      )}

      {/* ── Charts Row ───────────────────────────── */}
      <section className="dashboard-charts-row">
        {/* Revenue chart */}
        <Link
          href={`/modules/reports?name=sales&range=${selectedRange}`}
          className="dashboard-chart-card link-unstyled"
        >
          <div className="dashboard-widget-header">
            <h3><TrendingUp size={16} color="var(--primary)" /> Doanh thu theo ngày ({selectedRangeLabel})</h3>
            {overviewStatusLabel && <span className={`dashboard-widget-status ${getWidgetStatusClass(overviewState.status)}`}>{overviewStatusLabel}</span>}
          </div>
          {isLoading ? (
            <div className="dashboard-widget-placeholder">
              <Skeleton height="230px" />
            </div>
          ) : hasRevenueData ? (
            <div className="dashboard-chart-body">
              <SimpleAreaChart
                data={revenueSeries}
                xKey="name"
                yKey="value"
                height={260}
                formatY={(val) => `${(val / 1000000).toFixed(0)}Tr`}
              />
            </div>
          ) : overviewState.status === 'ready' ? (
            <p className="dashboard-widget-note">Chưa có giao dịch doanh thu trong khoảng thời gian đã chọn. Hãy tạo đơn bán hàng để bắt đầu theo dõi xu hướng.</p>
          ) : (
            <p className="dashboard-widget-note is-error">Không thể tải dữ liệu doanh thu.</p>
          )}
          {overviewState.status === 'stale' && overviewState.error && (
            <p className="dashboard-widget-note is-stale">{overviewState.error}</p>
          )}
        </Link>

        {/* Secondary column: Pie + Tasks */}
        <div className="dashboard-secondary-col">
          <Link
            href={`/modules/sales?range=${selectedRange}`}
            className="dashboard-chart-card dashboard-secondary-chart-card link-unstyled"
          >
            <h3><ShoppingCart size={16} /> Trạng thái đơn hàng</h3>
            {isLoading ? (
              <Skeleton height="150px" />
            ) : hasOrderStatusData ? (
              <div className="dashboard-pie-body">
                <SimplePieChart
                  data={orderStatusSeries}
                  height={160}
                  innerRadius={30}
                />
              </div>
            ) : overviewState.status === 'ready' ? (
              <p className="dashboard-widget-note">Chưa có trạng thái đơn hàng trong khoảng thời gian đã chọn.</p>
            ) : (
              <p className="dashboard-widget-note is-error">Không thể tải dữ liệu trạng thái đơn hàng.</p>
            )}
          </Link>
          
          {canViewWorkflows ? (
            <div className="quick-tasks-panel">
              <div className="dashboard-widget-header">
                <h3><ListTodo size={16} /> Việc cần làm nhanh</h3>
                {tasksStatusLabel && <span className={`dashboard-widget-status ${getWidgetStatusClass(tasksState.status)}`}>{tasksStatusLabel}</span>}
              </div>
              <div className="quick-tasks-list">
                {tasksState.status === 'loading' && tasksState.data.length === 0 && (
                  <>
                    <Skeleton height="42px" />
                    <Skeleton height="42px" />
                    <Skeleton height="42px" />
                  </>
                )}
                {(tasksState.status === 'error' || tasksState.status === 'disabled') && tasksState.data.length === 0 && (
                  <p className="dashboard-widget-note is-error">Không thể tải danh sách công việc.</p>
                )}
                {tasksState.status !== 'loading' && tasksState.data.length === 0 && tasksState.status !== 'error' && tasksState.status !== 'disabled' && (
                  <p className="dashboard-widget-note">Không có công việc chờ duyệt.</p>
                )}
                {tasksState.data.map((task) => (
                  <div key={task.id} className="quick-task-item">
                    <div className="quick-task-info">
                      {task.status === 'completed' ? (
                        <CheckCircle2 size={14} color="var(--success)" />
                      ) : task.status === 'urgent' ? (
                        <AlertCircle size={14} color="var(--danger)" />
                      ) : (
                        <Clock size={14} color="var(--text-muted)" />
                      )}
                      <span>{task.title}</span>
                    </div>
                    <Badge variant={task.status === 'urgent' ? 'danger' : task.status === 'completed' ? 'success' : 'neutral'}>
                      {task.module}
                    </Badge>
                  </div>
                ))}
              </div>
              {tasksState.status === 'stale' && tasksState.error && (
                <p className="dashboard-widget-note is-stale">{tasksState.error}</p>
              )}
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Cashflow + Activity Row ──────────────── */}
      <section className="dashboard-charts-row dashboard-bottom-row">
        {/* Cashflow bar chart */}
        <div className="dashboard-chart-card">
          <div className="dashboard-widget-header">
            <h3><CreditCard size={16} color="var(--primary)" /> Thu / Chi ({selectedRangeLabel})</h3>
            {overviewStatusLabel && <span className={`dashboard-widget-status ${getWidgetStatusClass(overviewState.status)}`}>{overviewStatusLabel}</span>}
          </div>
          {isLoading ? (
            <div className="dashboard-widget-placeholder">
              <Skeleton height="230px" />
            </div>
          ) : hasCashflowData ? (
            <div className="dashboard-chart-body">
              <DualBarChart
                data={cashflowSeries}
                xKey="name"
                bar1Key="income"
                bar2Key="expense"
                bar1Label="Thu"
                bar2Label="Chi"
                bar1Color="var(--success)"
                bar2Color="var(--warning)"
                height={240}
                formatY={(val) => formatShortCurrency(val)}
              />
            </div>
          ) : overviewState.status === 'ready' ? (
            <p className="dashboard-widget-note">Chưa có dữ liệu thu chi trong khoảng thời gian đã chọn.</p>
          ) : (
            <p className="dashboard-widget-note is-error">Không thể tải dữ liệu thu chi.</p>
          )}
        </div>

        {/* Activity Feed */}
        <div className="activity-feed">
          <div className="dashboard-widget-header">
            <h3><Activity size={16} color="var(--primary)" /> Hoạt động mới nhất</h3>
            {activitiesStatusLabel && <span className={`dashboard-widget-status ${getWidgetStatusClass(activitiesState.status)}`}>{activitiesStatusLabel}</span>}
          </div>
          <div className="activity-list">
            {!canViewAudit && (
              <p className="dashboard-widget-note">Feed audit chỉ hiển thị cho USER/ADMIN theo policy bảo mật.</p>
            )}
            {canViewAudit && activitiesState.status === 'loading' && activitiesState.data.length === 0 && (
              <>
                <Skeleton height="28px" />
                <Skeleton height="28px" />
                <Skeleton height="28px" />
              </>
            )}
            {canViewAudit && (activitiesState.status === 'error' || activitiesState.status === 'disabled') && activitiesState.data.length === 0 && (
              <p className="dashboard-widget-note is-error">Không thể tải activity feed.</p>
            )}
            {canViewAudit && activitiesState.status !== 'loading' && activitiesState.data.length === 0 && activitiesState.status !== 'error' && activitiesState.status !== 'disabled' && (
              <p className="dashboard-widget-note">Chưa có hoạt động mới.</p>
            )}
            {canViewAudit && activitiesState.data.map((activity) => (
              <div key={activity.id} className="activity-item">
                <div className="activity-dot" style={{ backgroundColor: activity.color }} />
                <span>{activity.text}</span>
                <span className="activity-time">{activity.time}</span>
              </div>
            ))}
          </div>
          {canViewAudit && activitiesState.status === 'stale' && activitiesState.error && (
            <p className="dashboard-widget-note is-stale">{activitiesState.error}</p>
          )}
        </div>
      </section>

      {/* ── Module Navigation ────────────────────── */}
      <section className="dashboard-bottom-row">
        <div className="dashboard-module-nav">
          <h3 className="dashboard-module-heading">
            <LayoutDashboard size={20} /> Phân hệ vận hành
          </h3>
          <div className="module-card-grid">
            {visibleModules.map((module) => (
              <Link 
                key={module.key} 
                href={`/modules/${module.key}`}
                className="module-card"
              >
                <div className="module-card-header">
                  <h3>{module.title}</h3>
                  <ArrowRight size={14} color="var(--muted)" />
                </div>
                <p>{module.description}</p>
                <span className="module-card-link">Mở phân hệ</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {reportsNotice && <div className="banner banner-warning">{reportsNotice}</div>}
      {overviewState.status === 'stale' && overviewState.lastUpdatedAt && (
        <div className="dashboard-refresh-meta">
          Overview cập nhật gần nhất lúc {formatUpdatedAt(overviewState.lastUpdatedAt)}.
        </div>
      )}
    </div>
  );
}
