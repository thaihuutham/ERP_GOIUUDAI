'use client';

import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { moduleCards } from '../lib/modules';
import { formatRuntimeCurrency } from '../lib/runtime-format';
import { SYSTEM_PROFILE } from '../lib/system-profile';
import { useAccessPolicy } from './access-policy-context';
import { useUserRole } from './user-role-context';
import { StatCard, SimpleAreaChart, SimplePieChart, Badge, Skeleton } from './ui';
import { useSmartPolling } from '../lib/use-smart-polling';

type Overview = {
  totalRevenue?: number;
  totalEmployees?: number;
  pendingInvoices?: number;
  activePurchaseOrders?: number;
};

type SalesRow = {
  id?: string;
  createdAt?: string;
  status?: string;
  totalAmount?: number | string;
};

type SalesWidgetData = {
  revenueSeries: Array<{ name: string; value: number }>;
  orderStatusSeries: Array<{ name: string; value: number }>;
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

const POLL_INTERVALS = {
  overview: 120_000,
  sales: 120_000,
  tasks: 60_000,
  activity: 45_000
} as const;

const DEFAULT_REVENUE_DATA = [
  { name: 'T1', value: 12000000 },
  { name: 'T2', value: 15500000 },
  { name: 'T3', value: 14200000 },
  { name: 'T4', value: 18000000 },
  { name: 'T5', value: 19500000 },
  { name: 'T6', value: 24000000 },
  { name: 'T7', value: 28000000 },
];

const DEFAULT_ORDER_STATUS_DATA = [
  { name: 'Hoàn thành', value: 65 },
  { name: 'Đang xử lý', value: 20 },
  { name: 'Đang giao', value: 10 },
  { name: 'Hủy', value: 5 },
];

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

function normalizeOrderStatusLabel(status: string) {
  const upper = status.toUpperCase();
  if (upper === 'APPROVED') return 'Hoàn thành';
  if (upper === 'PENDING') return 'Đang xử lý';
  if (upper === 'DRAFT') return 'Nháp';
  if (upper === 'REJECTED') return 'Từ chối';
  return upper;
}

function buildSalesWidgetData(rows: SalesRow[]): SalesWidgetData {
  if (rows.length === 0) {
    return {
      revenueSeries: DEFAULT_REVENUE_DATA,
      orderStatusSeries: DEFAULT_ORDER_STATUS_DATA
    };
  }

  const monthBuckets = new Map<string, { name: string; value: number }>();
  const now = new Date();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthBuckets.set(key, { name: `T${date.getMonth() + 1}`, value: 0 });
  }

  const statusCounters = new Map<string, number>();
  rows.forEach((row) => {
    const createdAt = row.createdAt ? new Date(row.createdAt) : null;
    if (createdAt && Number.isFinite(createdAt.getTime())) {
      const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}`;
      const bucket = monthBuckets.get(key);
      if (bucket) {
        bucket.value += Math.round(toFiniteNumber(row.totalAmount));
      }
    }

    const statusKey = normalizeOrderStatusLabel(String(row.status ?? 'Khác'));
    statusCounters.set(statusKey, (statusCounters.get(statusKey) ?? 0) + 1);
  });

  const revenueSeries = Array.from(monthBuckets.values());
  const orderStatusSeries = Array.from(statusCounters.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);

  return {
    revenueSeries: revenueSeries.some((item) => item.value > 0) ? revenueSeries : DEFAULT_REVENUE_DATA,
    orderStatusSeries: orderStatusSeries.length > 0 ? orderStatusSeries : DEFAULT_ORDER_STATUS_DATA
  };
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

export function HomeDashboard() {
  const { role } = useUserRole();
  const { canModule, canRoute } = useAccessPolicy();
  const [overviewState, setOverviewState] = useState<WidgetState<Overview | null>>(() =>
    createWidgetState<Overview | null>(null)
  );
  const [salesState, setSalesState] = useState<WidgetState<SalesWidgetData | null>>(() =>
    createWidgetState<SalesWidgetData | null>(null)
  );
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
    setOverviewState((prev) =>
      prev.status === 'idle'
        ? {
            ...prev,
            status: 'loading',
            error: null
          }
        : prev
    );

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
      const payload = await apiRequest<Overview>('/reports/overview');
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
  }, [canViewReports, fetchReportsEnabled]);

  const loadSalesWidget = useCallback(async () => {
    setSalesState((prev) =>
      prev.status === 'idle'
        ? {
            ...prev,
            status: 'loading',
            error: null
          }
        : prev
    );

    if (!canViewReports) {
      setSalesState((prev) => ({
        ...prev,
        status: 'disabled',
        data: null,
        error: null
      }));
      return;
    }

    if (overviewState.status === 'disabled') {
      setSalesState((prev) => ({
        ...prev,
        status: 'disabled',
        data: null,
        error: REPORTS_DISABLED_NOTICE
      }));
      return;
    }

    const reportsEnabled = await fetchReportsEnabled();
    if (!reportsEnabled) {
      setSalesState((prev) => ({
        ...prev,
        status: 'disabled',
        data: null,
        error: REPORTS_DISABLED_NOTICE
      }));
      return;
    }

    try {
      const payload = await apiRequest('/reports/module', {
        query: { name: 'sales', limit: 120 }
      });
      const rows = normalizeListPayload(payload) as SalesRow[];
      setSalesState({
        status: 'ready',
        data: buildSalesWidgetData(rows),
        error: null,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (error) {
      const message = normalizeWidgetError(error);
      setSalesState((prev) => {
        const stale = hasWidgetData(prev.data);
        return {
          ...prev,
          status: stale ? 'stale' : 'error',
          error: message
        };
      });
    }
  }, [canViewReports, fetchReportsEnabled, overviewState.status]);

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
  useSmartPolling(loadSalesWidget, POLL_INTERVALS.sales);
  useSmartPolling(loadTasksWidget, POLL_INTERVALS.tasks);
  useSmartPolling(loadActivitiesWidget, POLL_INTERVALS.activity);

  const overviewData = overviewState.data;
  const salesData = salesState.data;

  const salesStatusLabel = getWidgetStatusLabel(salesState.status);
  const tasksStatusLabel = getWidgetStatusLabel(tasksState.status);
  const activitiesStatusLabel = getWidgetStatusLabel(activitiesState.status);

  return (
    <div className="dashboard-root">
      <section className="hero-panel">
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)', fontWeight: 700, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.45rem' }}>
            <Activity size={14} /> Vận hành ổn định
          </div>
          <h1 style={{ fontSize: '1.65rem', marginBottom: '0.3rem' }}>
            {SYSTEM_PROFILE.systemName}
          </h1>
          <p>
            {`${SYSTEM_PROFILE.companyName} • ${SYSTEM_PROFILE.businessDomain} • ${SYSTEM_PROFILE.scale}. ${SYSTEM_PROFILE.operatingModel}.`}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
          <div className="hero-badge">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <ShieldCheck size={14} />
              <span>{SYSTEM_PROFILE.governanceVision}</span>
            </div>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Vai trò hiện tại: <strong>{role}</strong>
          </div>
        </div>
      </section>

      {/* KPIs Grid */}
      <section className="metrics-grid">
        <StatCard 
          label="Phát sinh doanh thu" 
          value={formatMetricValue(overviewData?.totalRevenue, (value) => formatRuntimeCurrency(value))} 
          icon={<TrendingUp size={18} />} 
          color="var(--primary)" 
          trend={12.5} 
        />
        <StatCard 
          label="Nhân sự vận hành" 
          value={formatMetricValue(overviewData?.totalEmployees)} 
          icon={<Users size={18} />} 
          color="var(--success)" 
          trend={3.2} 
        />
        <StatCard 
          label="Hóa đơn chờ xử lý" 
          value={formatMetricValue(overviewData?.pendingInvoices)} 
          icon={<FileText size={18} />} 
          color="var(--warning)" 
        />
        <StatCard 
          label="Đơn mua hàng (PO)" 
          value={formatMetricValue(overviewData?.activePurchaseOrders)} 
          icon={<ShoppingCart size={18} />} 
          color="var(--danger)" 
          trend={-2.1} 
        />
      </section>

      {/* Visualizations & Data Row */}
      <section className="dashboard-charts-row">
        {/* Main Chart */}
        <div className="dashboard-chart-card">
          <div className="dashboard-widget-header">
            <h3><TrendingUp size={16} color="var(--primary)" /> Tăng trưởng doanh thu 7 tháng gần nhất</h3>
            {salesStatusLabel && <span className={`dashboard-widget-status ${getWidgetStatusClass(salesState.status)}`}>{salesStatusLabel}</span>}
          </div>
          {salesState.status === 'loading' && !salesData ? (
            <div className="dashboard-widget-placeholder">
              <Skeleton height="230px" />
            </div>
          ) : salesData ? (
            <div style={{ padding: '0.5rem 0 0 0' }}>
              <SimpleAreaChart 
                data={salesData.revenueSeries} 
                xKey="name" 
                yKey="value" 
                height={260}
                formatY={(val) => `${(val / 1000000).toFixed(0)}Tr`}
              />
            </div>
          ) : (
            <p className="dashboard-widget-note is-error">Không thể tải dữ liệu doanh thu.</p>
          )}
          {salesState.status === 'stale' && salesState.error && (
            <p className="dashboard-widget-note is-stale">{salesState.error}</p>
          )}
        </div>

        {/* Secondary Info (Pie Chart + Tasks) */}
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div className="dashboard-chart-card" style={{ paddingBottom: '0.5rem' }}>
            <h3><ShoppingCart size={16} /> Trạng thái đơn hàng</h3>
            {salesState.status === 'loading' && !salesData ? (
              <Skeleton height="150px" />
            ) : (
              <div style={{ padding: '0.5rem 0' }}>
                <SimplePieChart 
                  data={salesData?.orderStatusSeries ?? DEFAULT_ORDER_STATUS_DATA} 
                  height={160} 
                  innerRadius={30}
                />
              </div>
            )}
          </div>
          
          {canViewWorkflows ? (
            <div className="quick-tasks-panel">
              <div className="dashboard-widget-header">
                <h3><ListTodo size={16} /> Việc cần làm nhanh</h3>
                {tasksStatusLabel && <span className={`dashboard-widget-status ${getWidgetStatusClass(tasksState.status)}`}>{tasksStatusLabel}</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.2rem' }}>
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
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {task.status === 'completed' ? (
                        <CheckCircle2 size={14} color="var(--success)" />
                      ) : task.status === 'urgent' ? (
                        <AlertCircle size={14} color="var(--danger)" />
                      ) : (
                        <Clock size={14} color="var(--text-muted)" />
                      )}
                      <span style={{ fontWeight: 500 }}>{task.title}</span>
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

      <section className="dashboard-charts-row" style={{ marginTop: '0.15rem' }}>
        {/* Module Navigation */}
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          <h3 style={{ fontSize: '1.02rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <LayoutDashboard size={20} /> Phân hệ vận hành
          </h3>
          <div className="module-card-grid">
            {visibleModules.map((module) => (
              <Link 
                key={module.key} 
                href={`/modules/${module.key}`}
                className="module-card"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3>{module.title}</h3>
                  <ArrowRight size={14} color="var(--muted)" />
                </div>
                <p>{module.description}</p>
                <span className="module-card-link">Mở phân hệ</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="activity-feed">
          <div className="dashboard-widget-header">
            <h3 style={{ marginBottom: '0.35rem' }}><Activity size={16} color="var(--primary)" /> Hoạt động mới nhất</h3>
            {activitiesStatusLabel && <span className={`dashboard-widget-status ${getWidgetStatusClass(activitiesState.status)}`}>{activitiesStatusLabel}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {!canViewAudit && (
              <p className="dashboard-widget-note">Feed audit chỉ hiển thị cho MANAGER/ADMIN theo policy bảo mật.</p>
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

      {reportsNotice && <div className="banner banner-warning">{reportsNotice}</div>}
      {overviewState.status === 'stale' && overviewState.lastUpdatedAt && (
        <div className="dashboard-refresh-meta">
          Overview cập nhật gần nhất lúc {formatUpdatedAt(overviewState.lastUpdatedAt)}.
        </div>
      )}
    </div>
  );
}
