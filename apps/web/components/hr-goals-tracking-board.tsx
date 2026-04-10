'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  CheckCircle2,
  Clock3,
  Filter,
  Gauge,
  Plus,
  RefreshCw,
  Search,
  Send,
  Target,
  Timer,
  User,
  Users,
  XCircle
} from 'lucide-react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { SidePanel } from './ui/side-panel';

type GoalStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
type TrackingMode = 'MANUAL' | 'AUTO' | 'HYBRID';
type GoalScope = 'self' | 'team' | 'department' | 'company';

type GoalMetricBinding = {
  id?: string;
  sourceSystem: string;
  metricKey: string;
  weight?: number;
  configJson?: Record<string, unknown> | null;
  status?: string;
  lastComputedValue?: number | string | null;
  lastComputedAt?: string | null;
};

type MetricBindingDraft = {
  sourceSystem: string;
  metricKey: string;
  weight: string;
  employeeId: string;
  recruiterId: string;
  departmentId: string;
};

type GoalItem = {
  id: string;
  goalCode: string | null;
  title: string;
  description: string | null;
  period: string;
  status: GoalStatus;
  trackingMode: TrackingMode;
  targetValue: number | string | null;
  currentValue: number | string | null;
  autoCurrentValue: number | string | null;
  manualAdjustmentValue: number | string | null;
  progressPercent: number | null;
  startDate: string | null;
  endDate: string | null;
  updatedAt: string;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string | null;
  employeeDepartment: string | null;
  metricBindings?: GoalMetricBinding[];
};

type TrackerPayload = {
  scope: GoalScope;
  items: GoalItem[];
  grouped: Record<GoalStatus, GoalItem[]>;
  totals: {
    all: number;
    draft: number;
    pending: number;
    active: number;
    approved: number;
    rejected: number;
    archived: number;
  };
};

type OverviewPayload = {
  scope: GoalScope;
  totals: {
    all: number;
    draft: number;
    pending: number;
    active: number;
    approved: number;
    rejected: number;
    archived: number;
  };
  progress: {
    avgProgressPercent: number;
    weightedProgressPercent: number;
    completionRatePercent: number;
  };
  trackingModes: {
    manual: number;
    auto: number;
    hybrid: number;
  };
  byDepartment: Array<{
    key: string;
    name: string;
    total: number;
    approved: number;
    avgProgressPercent: number;
  }>;
  byEmployee: Array<{
    id: string;
    name: string;
    total: number;
    approved: number;
    avgProgressPercent: number;
  }>;
};

type TimelineItem = {
  id: string;
  eventType: string;
  actorId: string | null;
  fromStatus: GoalStatus | null;
  toStatus: GoalStatus | null;
  progressPercent: number | null;
  note: string | null;
  createdAt: string;
};

const SCOPE_OPTIONS: Array<{ value: GoalScope; label: string }> = [
  { value: 'self', label: 'Cá nhân' },
  { value: 'team', label: 'Team' },
  { value: 'department', label: 'Phòng' },
  { value: 'company', label: 'Công ty' }
];

const STATUS_OPTIONS: Array<{ value: 'ALL' | GoalStatus; label: string }> = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ARCHIVED', label: 'Archived' }
];

const TRACKING_OPTIONS: Array<{ value: 'ALL' | TrackingMode; label: string }> = [
  { value: 'ALL', label: 'Tất cả mode' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'AUTO', label: 'Auto' },
  { value: 'HYBRID', label: 'Hybrid' }
];

const STATUS_COLUMNS: Array<{ key: GoalStatus; title: string }> = [
  { key: 'DRAFT', title: 'Draft' },
  { key: 'PENDING', title: 'Pending' },
  { key: 'ACTIVE', title: 'Active' },
  { key: 'APPROVED', title: 'Approved' },
  { key: 'REJECTED', title: 'Rejected' },
  { key: 'ARCHIVED', title: 'Archived' }
];

const SOURCE_SYSTEM_OPTIONS = ['HR', 'SALES', 'RECRUITMENT', 'ATTENDANCE', 'CUSTOM'];

function createMetricBindingDraft(): MetricBindingDraft {
  return {
    sourceSystem: '',
    metricKey: '',
    weight: '1',
    employeeId: '',
    recruiterId: '',
    departmentId: ''
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function formatNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '--';
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 2
  }).format(numeric);
}

function statusPillClass(status: string) {
  const normalized = status.toUpperCase();
  if (['ACTIVE', 'APPROVED'].includes(normalized)) return 'finance-status-pill finance-status-pill-success';
  if (['PENDING', 'DRAFT'].includes(normalized)) return 'finance-status-pill finance-status-pill-warning';
  if (['REJECTED', 'ARCHIVED'].includes(normalized)) return 'finance-status-pill finance-status-pill-danger';
  return 'finance-status-pill finance-status-pill-neutral';
}

function scopeLabel(scope: GoalScope) {
  if (scope === 'self') return 'Cá nhân';
  if (scope === 'team') return 'Team';
  if (scope === 'department') return 'Phòng ban';
  return 'Toàn công ty';
}

export function HrGoalsTrackingBoard() {
  const [scope, setScope] = useState<GoalScope>('self');
  const [keyword, setKeyword] = useState('');
  const [period, setPeriod] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | GoalStatus>('ALL');
  const [trackingFilter, setTrackingFilter] = useState<'ALL' | TrackingMode>('ALL');
  const [employeeIdFilter, setEmployeeIdFilter] = useState('');
  const [departmentIdFilter, setDepartmentIdFilter] = useState('');
  const [orgUnitIdFilter, setOrgUnitIdFilter] = useState('');

  const [tracker, setTracker] = useState<TrackerPayload | null>(null);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [pollingEnabled, setPollingEnabled] = useState(true);

  const [selectedGoal, setSelectedGoal] = useState<GoalItem | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    employeeId: '',
    goalCode: '',
    title: '',
    description: '',
    period: '',
    targetValue: '',
    currentValue: '',
    trackingMode: 'MANUAL' as TrackingMode,
    startDate: '',
    endDate: '',
    metricBindings: [createMetricBindingDraft()] as MetricBindingDraft[]
  });

  const [progressForm, setProgressForm] = useState({
    currentValue: '',
    manualAdjustmentValue: '',
    note: ''
  });

  const query = useMemo(() => {
    const q: Record<string, string> = {
      scope,
      limit: '300'
    };
    if (keyword.trim()) q.q = keyword.trim();
    if (period.trim()) q.period = period.trim();
    if (statusFilter !== 'ALL') q.status = statusFilter;
    if (trackingFilter !== 'ALL') q.trackingMode = trackingFilter;
    if (employeeIdFilter.trim()) q.employeeId = employeeIdFilter.trim();
    if (departmentIdFilter.trim()) q.departmentId = departmentIdFilter.trim();
    if (orgUnitIdFilter.trim()) q.orgUnitId = orgUnitIdFilter.trim();
    return q;
  }, [scope, keyword, period, statusFilter, trackingFilter, employeeIdFilter, departmentIdFilter, orgUnitIdFilter]);

  const loadData = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const [trackerPayload, overviewPayload] = await Promise.all([
        apiRequest<TrackerPayload>('/hr/goals/tracker', { query, signal }),
        apiRequest<OverviewPayload>('/hr/goals/overview', { query, signal })
      ]);
      setTracker(trackerPayload);
      setOverview(overviewPayload);

      if (selectedGoal) {
        const next = trackerPayload.items.find((item) => item.id === selectedGoal.id) ?? null;
        setSelectedGoal(next);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu mục tiêu.');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  };

  const loadTimeline = async (goalId: string) => {
    setIsTimelineLoading(true);
    try {
      const payload = await apiRequest<TimelineItem[]>(`/hr/goals/${goalId}/timeline`);
      setTimeline(normalizeListPayload(payload) as TimelineItem[]);
    } catch {
      setTimeline([]);
    } finally {
      setIsTimelineLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    if (!pollingEnabled) return;
    const timer = window.setInterval(() => {
      void loadData();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [pollingEnabled, query]);

  useEffect(() => {
    if (!selectedGoal) return;
    loadTimeline(selectedGoal.id);
  }, [selectedGoal?.id]);

  const handleCreateGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    try {
      const metricBindings = createForm.metricBindings
        .map((binding) => {
          const sourceSystem = binding.sourceSystem.trim();
          const metricKey = binding.metricKey.trim();
          if (!sourceSystem || !metricKey) {
            return null;
          }

          const configJson: Record<string, unknown> = {};
          if (binding.employeeId.trim()) configJson.employeeId = binding.employeeId.trim();
          if (binding.recruiterId.trim()) configJson.recruiterId = binding.recruiterId.trim();
          if (binding.departmentId.trim()) configJson.departmentId = binding.departmentId.trim();

          const numericWeight = Number(binding.weight);
          return {
            sourceSystem,
            metricKey,
            weight: Number.isFinite(numericWeight) ? numericWeight : 1,
            configJson: Object.keys(configJson).length > 0 ? configJson : undefined
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (createForm.trackingMode !== 'MANUAL' && metricBindings.length === 0) {
        throw new Error('Mode AUTO/HYBRID cần ít nhất 1 dòng metric binding hợp lệ.');
      }

      await apiRequest('/hr/goals', {
        method: 'POST',
        body: {
          employeeId: createForm.employeeId || undefined,
          goalCode: createForm.goalCode || undefined,
          title: createForm.title,
          description: createForm.description || undefined,
          period: createForm.period,
          targetValue: createForm.targetValue ? Number(createForm.targetValue) : undefined,
          currentValue: createForm.currentValue ? Number(createForm.currentValue) : undefined,
          trackingMode: createForm.trackingMode,
          startDate: createForm.startDate || undefined,
          endDate: createForm.endDate || undefined,
          metricBindings: metricBindings.length > 0 ? metricBindings : undefined
        }
      });

      setNotice('Đã tạo mục tiêu thành công.');
      setIsCreateOpen(false);
      setCreateForm({
        employeeId: '',
        goalCode: '',
        title: '',
        description: '',
        period: '',
        targetValue: '',
        currentValue: '',
        trackingMode: 'MANUAL',
        startDate: '',
        endDate: '',
        metricBindings: [createMetricBindingDraft()]
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo mục tiêu thất bại.');
    }
  };

  const handleUpdateProgress = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedGoal) return;
    setError(null);
    setNotice(null);

    try {
      await apiRequest(`/hr/goals/${selectedGoal.id}/progress`, {
        method: 'PATCH',
        body: {
          currentValue: progressForm.currentValue ? Number(progressForm.currentValue) : undefined,
          manualAdjustmentValue: progressForm.manualAdjustmentValue
            ? Number(progressForm.manualAdjustmentValue)
            : undefined,
          note: progressForm.note || undefined
        }
      });
      setNotice('Đã cập nhật tiến độ.');
      await loadData();
      await loadTimeline(selectedGoal.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cập nhật tiến độ thất bại.');
    }
  };

  const handleSubmitApproval = async (goalId: string) => {
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/hr/goals/${goalId}/submit-approval`, {
        method: 'POST',
        body: {}
      });
      setNotice('Đã submit duyệt mục tiêu.');
      await loadData();
      if (selectedGoal?.id === goalId) {
        await loadTimeline(goalId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit duyệt thất bại.');
    }
  };

  const handleRecomputeGoal = async (goalId: string) => {
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/hr/goals/${goalId}/recompute-auto`, {
        method: 'POST',
        body: { force: true }
      });
      setNotice('Đã recompute tự động cho mục tiêu.');
      await loadData();
      if (selectedGoal?.id === goalId) {
        await loadTimeline(goalId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recompute mục tiêu thất bại.');
    }
  };

  const handleRecomputeAll = async () => {
    setError(null);
    setNotice(null);
    try {
      const payload = await apiRequest<{ updated: number; total: number }>('/hr/goals/recompute-auto', {
        method: 'POST',
        body: {
          scope,
          period: period || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          trackingMode: trackingFilter !== 'ALL' ? trackingFilter : undefined,
          employeeId: employeeIdFilter || undefined,
          departmentId: departmentIdFilter || undefined,
          orgUnitId: orgUnitIdFilter || undefined,
          force: true
        }
      });
      setNotice(`Đã recompute ${payload.updated ?? 0}/${payload.total ?? 0} mục tiêu.`);
      await loadData();
      if (selectedGoal) {
        await loadTimeline(selectedGoal.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recompute hàng loạt thất bại.');
    }
  };

  const grouped = tracker?.grouped;
  const effectiveScope = overview?.scope ?? tracker?.scope ?? scope;
  const isSelfScope = effectiveScope === 'self';
  const analyticsChartRows = useMemo(() => {
    if (!overview) {
      return [] as Array<{ key: string; label: string; progress: number; total: number; approved: number }>;
    }

    if (effectiveScope === 'self') {
      return overview.byEmployee.slice(0, 8).map((item) => ({
        key: item.id,
        label: item.name,
        progress: Math.max(0, Math.min(100, item.avgProgressPercent ?? 0)),
        total: item.total,
        approved: item.approved
      }));
    }

    return overview.byDepartment.slice(0, 8).map((item) => ({
      key: item.key,
      label: item.name,
      progress: Math.max(0, Math.min(100, item.avgProgressPercent ?? 0)),
      total: item.total,
      approved: item.approved
    }));
  }, [overview, effectiveScope]);

  return (
    <article className="module-workbench" style={{ background: 'transparent' }}>
      <header className="module-header" style={{ background: 'transparent', borderBottom: 'none', padding: '0 0 1.5rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              background: 'var(--primary)',
              color: 'white',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px var(--primary-soft)'
            }}
          >
            <Target size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Mục tiêu nhân sự</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.9375rem' }}>
              Theo dõi KPI theo thời gian thực cho cá nhân, team, phòng và toàn công ty.
            </p>
          </div>
        </div>
      </header>

      <section style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            <Filter size={14} /> Phạm vi
          </span>
          {SCOPE_OPTIONS.map((item) => (
            <button
              key={item.value}
              className="btn"
              style={{
                border: scope === item.value ? '1px solid var(--primary)' : '1px solid var(--line)',
                color: scope === item.value ? 'var(--primary)' : 'var(--ink)',
                background: scope === item.value ? 'var(--primary-soft)' : 'var(--surface)'
              }}
              onClick={() => setScope(item.value)}
            >
              <ArrowUpDown size={14} /> {item.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <div className="form-grid" style={{ padding: '0.8rem', border: '1px solid var(--line)', borderRadius: '10px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Tìm kiếm</label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Tên mục tiêu / mã / mô tả"
                style={{ paddingLeft: '30px' }}
              />
            </div>
          </div>

          <div className="form-grid" style={{ padding: '0.8rem', border: '1px solid var(--line)', borderRadius: '10px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Kỳ</label>
            <input value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="Q2-2026" />
          </div>

          <div className="form-grid" style={{ padding: '0.8rem', border: '1px solid var(--line)', borderRadius: '10px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Trạng thái</label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | GoalStatus)}>
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-grid" style={{ padding: '0.8rem', border: '1px solid var(--line)', borderRadius: '10px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Tracking mode</label>
            <select value={trackingFilter} onChange={(event) => setTrackingFilter(event.target.value as 'ALL' | TrackingMode)}>
              {TRACKING_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-grid" style={{ padding: '0.8rem', border: '1px solid var(--line)', borderRadius: '10px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>EmployeeId</label>
            <input value={employeeIdFilter} onChange={(event) => setEmployeeIdFilter(event.target.value)} placeholder="emp_xxx" />
          </div>

          <div className="form-grid" style={{ padding: '0.8rem', border: '1px solid var(--line)', borderRadius: '10px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>DepartmentId</label>
            <input
              value={departmentIdFilter}
              onChange={(event) => setDepartmentIdFilter(event.target.value)}
              placeholder="dep_xxx"
            />
          </div>

          <div className="form-grid" style={{ padding: '0.8rem', border: '1px solid var(--line)', borderRadius: '10px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>OrgUnitId</label>
            <input value={orgUnitIdFilter} onChange={(event) => setOrgUnitIdFilter(event.target.value)} placeholder="org_xxx" />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
            <Plus size={14} /> Đăng ký mục tiêu
          </button>
          <button className="btn btn-ghost" onClick={() => void loadData()}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-ghost" onClick={() => void handleRecomputeAll()}>
            <Gauge size={14} /> Recompute auto
          </button>
          <button className="btn btn-ghost" onClick={() => setPollingEnabled((prev) => !prev)}>
            <Timer size={14} /> {pollingEnabled ? 'Pause polling' : 'Resume polling'}
          </button>
        </div>
      </section>

      {error && <div className="banner banner-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {notice && <div className="banner banner-success" style={{ marginBottom: '1rem' }}>{notice}</div>}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.85rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Tổng mục tiêu</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
            <Users size={16} color="var(--primary)" />
            <strong>{overview?.totals.all ?? 0}</strong>
          </div>
        </div>
        <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.85rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Completion rate</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
            <CheckCircle2 size={16} color="var(--success)" />
            <strong>{formatNumber(overview?.progress.completionRatePercent ?? 0)}%</strong>
          </div>
        </div>
        <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.85rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Avg progress</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
            <Gauge size={16} color="var(--primary)" />
            <strong>{formatNumber(overview?.progress.avgProgressPercent ?? 0)}%</strong>
          </div>
        </div>
        <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.85rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Weighted progress</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
            <Clock3 size={16} color="var(--warning)" />
            <strong>{formatNumber(overview?.progress.weightedProgressPercent ?? 0)}%</strong>
          </div>
        </div>
      </section>

      <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.85rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <strong>Phân tích theo quyền truy cập</strong>
          <span className="finance-status-pill finance-status-pill-neutral">Scope: {scopeLabel(effectiveScope)}</span>
        </div>
        {analyticsChartRows.length === 0 ? (
          <p style={{ marginTop: '0.75rem', color: 'var(--muted)', fontSize: '0.82rem' }}>Chưa có dữ liệu biểu đồ.</p>
        ) : (
          <div
            style={{
              marginTop: '0.75rem',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '0.6rem',
              minHeight: '220px',
              padding: '0.75rem',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              background: 'var(--surface)'
            }}
          >
            {analyticsChartRows.map((item) => (
              <div key={item.key} style={{ flex: 1, minWidth: '36px', textAlign: 'center' }}>
                <div
                  title={`${item.label}: ${formatNumber(item.progress)}%`}
                  style={{
                    height: `${Math.max(8, item.progress * 1.8)}px`,
                    borderRadius: '8px 8px 0 0',
                    background: 'linear-gradient(180deg, var(--primary), var(--primary-soft))'
                  }}
                />
                <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--muted)' }}>{item.label}</div>
              </div>
            ))}
          </div>
        )}

        {isSelfScope ? (
          <p style={{ marginTop: '0.75rem', color: 'var(--muted)', fontSize: '0.82rem' }}>
            Scope cá nhân: chỉ hiển thị biểu đồ trực quan, ẩn bảng chi tiết.
          </p>
        ) : (
          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Đơn vị</th>
                  <th>Tổng mục tiêu</th>
                  <th>Đã duyệt</th>
                  <th>Avg progress</th>
                </tr>
              </thead>
              <tbody>
                {analyticsChartRows.map((item) => (
                  <tr key={`detail-${item.key}`}>
                    <td>{item.label}</td>
                    <td>{formatNumber(item.total)}</td>
                    <td>{formatNumber(item.approved)}</td>
                    <td>{formatNumber(item.progress)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))',
          gap: '0.75rem',
          overflowX: 'auto',
          paddingBottom: '0.35rem'
        }}
      >
        {STATUS_COLUMNS.map((column) => {
          const items = grouped?.[column.key] ?? [];
          return (
            <div
              key={column.key}
              style={{
                minHeight: '460px',
                border: '1px solid var(--line)',
                borderRadius: '12px',
                background: 'var(--surface)',
                display: 'grid',
                gridTemplateRows: 'auto 1fr'
              }}
            >
              <header
                style={{
                  borderBottom: '1px solid var(--line)',
                  padding: '0.75rem 0.85rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <strong style={{ fontSize: '0.9rem' }}>{column.title}</strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{items.length}</span>
              </header>
              <div style={{ padding: '0.75rem', display: 'grid', gap: '0.65rem', alignContent: 'start' }}>
                {items.length === 0 && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Không có mục tiêu.</div>
                )}
                {items.map((item) => {
                  const progress = Math.max(0, Math.min(100, Number(item.progressPercent ?? 0)));
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedGoal(item);
                        setProgressForm({
                          currentValue: item.currentValue !== null ? String(item.currentValue) : '',
                          manualAdjustmentValue:
                            item.manualAdjustmentValue !== null ? String(item.manualAdjustmentValue) : '',
                          note: ''
                        });
                      }}
                      style={{
                        border: selectedGoal?.id === item.id ? '1px solid var(--primary)' : '1px solid var(--line)',
                        borderRadius: '10px',
                        padding: '0.7rem',
                        textAlign: 'left',
                        background: selectedGoal?.id === item.id ? 'var(--primary-soft)' : 'white'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <strong style={{ fontSize: '0.84rem' }}>{item.title}</strong>
                        <span className={statusPillClass(item.status)}>{item.status}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.35rem' }}>
                        {item.goalCode ?? item.id}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                        <User size={12} /> {item.employeeName ?? item.employeeId}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.35rem' }}>
                        {item.period} • {item.trackingMode}
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: '8px',
                          borderRadius: '999px',
                          background: 'var(--line)',
                          overflow: 'hidden',
                          marginBottom: '0.35rem'
                        }}
                      >
                        <div
                          style={{
                            width: `${progress}%`,
                            height: '100%',
                            background: 'var(--primary)'
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.76rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{formatNumber(item.currentValue)} / {formatNumber(item.targetValue)}</span>
                        <span>{formatNumber(progress)}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <SidePanel isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Đăng ký mục tiêu mới">
        <form className="form-grid" onSubmit={handleCreateGoal}>
          <div className="field">
            <label>EmployeeId (tùy môi trường)</label>
            <input value={createForm.employeeId} onChange={(event) => setCreateForm((prev) => ({ ...prev, employeeId: event.target.value }))} placeholder="emp_xxx" />
          </div>
          <div className="field">
            <label>Mã mục tiêu</label>
            <input value={createForm.goalCode} onChange={(event) => setCreateForm((prev) => ({ ...prev, goalCode: event.target.value }))} placeholder="GOAL-2026-001" />
          </div>
          <div className="field">
            <label>Tên mục tiêu</label>
            <input required value={createForm.title} onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))} />
          </div>
          <div className="field">
            <label>Mô tả</label>
            <textarea value={createForm.description} onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))} />
          </div>
          <div className="field">
            <label>Kỳ</label>
            <input required value={createForm.period} onChange={(event) => setCreateForm((prev) => ({ ...prev, period: event.target.value }))} placeholder="Q2-2026" />
          </div>
          <div className="field">
            <label>Target value</label>
            <input type="number" value={createForm.targetValue} onChange={(event) => setCreateForm((prev) => ({ ...prev, targetValue: event.target.value }))} />
          </div>
          <div className="field">
            <label>Current value</label>
            <input type="number" value={createForm.currentValue} onChange={(event) => setCreateForm((prev) => ({ ...prev, currentValue: event.target.value }))} />
          </div>
          <div className="field">
            <label>Tracking mode</label>
            <select
              value={createForm.trackingMode}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, trackingMode: event.target.value as TrackingMode }))}
            >
              <option value="MANUAL">MANUAL</option>
              <option value="AUTO">AUTO</option>
              <option value="HYBRID">HYBRID</option>
            </select>
          </div>
          <div className="field">
            <label>Start date</label>
            <input type="date" value={createForm.startDate} onChange={(event) => setCreateForm((prev) => ({ ...prev, startDate: event.target.value }))} />
          </div>
          <div className="field">
            <label>End date</label>
            <input type="date" value={createForm.endDate} onChange={(event) => setCreateForm((prev) => ({ ...prev, endDate: event.target.value }))} />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Liên kết chỉ số (AUTO/HYBRID)</label>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {createForm.metricBindings.length === 0 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  Chưa có dòng cấu hình. Bấm "Thêm dòng metric" để khai báo nguồn chỉ số.
                </div>
              )}
              {createForm.metricBindings.map((binding, index) => (
                <div key={`binding-${index}`} style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
                    <select
                      value={binding.sourceSystem}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          metricBindings: prev.metricBindings.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, sourceSystem: event.target.value } : row
                          )
                        }))
                      }
                    >
                      <option value="">Chọn nguồn dữ liệu</option>
                      {SOURCE_SYSTEM_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <input
                      value={binding.metricKey}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          metricBindings: prev.metricBindings.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, metricKey: event.target.value } : row
                          )
                        }))
                      }
                      placeholder="metricKey (ví dụ: order_amount_sum)"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={binding.weight}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          metricBindings: prev.metricBindings.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, weight: event.target.value } : row
                          )
                        }))
                      }
                      placeholder="Trọng số"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
                    <input
                      value={binding.employeeId}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          metricBindings: prev.metricBindings.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, employeeId: event.target.value } : row
                          )
                        }))
                      }
                      placeholder="employeeId (tuỳ chọn)"
                    />
                    <input
                      value={binding.recruiterId}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          metricBindings: prev.metricBindings.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, recruiterId: event.target.value } : row
                          )
                        }))
                      }
                      placeholder="recruiterId (tuỳ chọn)"
                    />
                    <input
                      value={binding.departmentId}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          metricBindings: prev.metricBindings.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, departmentId: event.target.value } : row
                          )
                        }))
                      }
                      placeholder="departmentId (tuỳ chọn)"
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        setCreateForm((prev) => ({
                          ...prev,
                          metricBindings: prev.metricBindings.filter((_, rowIndex) => rowIndex !== index)
                        }))
                      }
                    >
                      <XCircle size={14} /> Xóa dòng
                    </button>
                  </div>
                </div>
              ))}
              <div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    setCreateForm((prev) => ({
                      ...prev,
                      metricBindings: [...prev.metricBindings, createMetricBindingDraft()]
                    }))
                  }
                >
                  <Plus size={14} /> Thêm dòng metric
                </button>
              </div>
            </div>
          </div>

          <div className="action-buttons">
            <button className="btn btn-primary" type="submit">
              <Plus size={14} /> Tạo mục tiêu
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setIsCreateOpen(false)}>
              Hủy
            </button>
          </div>
        </form>
      </SidePanel>

      <SidePanel isOpen={Boolean(selectedGoal)} onClose={() => setSelectedGoal(null)} title="Chi tiết mục tiêu">
        {selectedGoal && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <strong>{selectedGoal.title}</strong>
                <span className={statusPillClass(selectedGoal.status)}>{selectedGoal.status}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{selectedGoal.goalCode ?? selectedGoal.id}</div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                <div>Nhân viên: {selectedGoal.employeeName ?? selectedGoal.employeeId}</div>
                <div>Phòng ban: {selectedGoal.employeeDepartment ?? '--'}</div>
                <div>Mode: {selectedGoal.trackingMode}</div>
                <div>
                  Giá trị: {formatNumber(selectedGoal.currentValue)} / {formatNumber(selectedGoal.targetValue)}
                </div>
                <div>
                  Auto: {formatNumber(selectedGoal.autoCurrentValue)} | Manual adj: {formatNumber(selectedGoal.manualAdjustmentValue)}
                </div>
                <div>
                  Tiến độ: <strong>{formatNumber(selectedGoal.progressPercent ?? 0)}%</strong>
                </div>
                <div>
                  Thời gian: {formatDateTime(selectedGoal.startDate)} → {formatDateTime(selectedGoal.endDate)}
                </div>
                <div>Cập nhật: {formatDateTime(selectedGoal.updatedAt)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
              <button className="btn btn-ghost" onClick={() => handleRecomputeGoal(selectedGoal.id)}>
                <RefreshCw size={14} /> Recompute auto
              </button>
              {(selectedGoal.status === 'DRAFT' || selectedGoal.status === 'REJECTED') && (
                <button className="btn btn-primary" onClick={() => handleSubmitApproval(selectedGoal.id)}>
                  <Send size={14} /> Submit duyệt
                </button>
              )}
            </div>

            <form className="form-grid" onSubmit={handleUpdateProgress}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Cập nhật tiến độ thủ công</h4>
              <div className="field">
                <label>Current value</label>
                <input
                  type="number"
                  value={progressForm.currentValue}
                  onChange={(event) => setProgressForm((prev) => ({ ...prev, currentValue: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Manual adjustment value</label>
                <input
                  type="number"
                  value={progressForm.manualAdjustmentValue}
                  onChange={(event) => setProgressForm((prev) => ({ ...prev, manualAdjustmentValue: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Ghi chú</label>
                <textarea value={progressForm.note} onChange={(event) => setProgressForm((prev) => ({ ...prev, note: event.target.value }))} />
              </div>
              <button className="btn btn-primary" type="submit">
                <ArrowUpDown size={14} /> Lưu tiến độ
              </button>
            </form>

            <section style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.8rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>Metric bindings</h4>
              {(selectedGoal.metricBindings ?? []).length === 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Chưa có metric binding.</p>
              )}
              {(selectedGoal.metricBindings ?? []).map((binding) => (
                <div key={binding.id ?? `${binding.sourceSystem}-${binding.metricKey}`} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <strong style={{ fontSize: '0.82rem' }}>{binding.sourceSystem} / {binding.metricKey}</strong>
                  <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                    Weight: {formatNumber(binding.weight ?? 1)} | Last value: {formatNumber(binding.lastComputedValue)}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Last computed: {formatDateTime(binding.lastComputedAt)}</div>
                </div>
              ))}
            </section>

            <section style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.8rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>Timeline</h4>
              {isTimelineLoading && <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Đang tải timeline...</p>}
              {!isTimelineLoading && timeline.length === 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Chưa có timeline.</p>
              )}
              {!isTimelineLoading && timeline.map((item) => (
                <div key={item.id} style={{ padding: '0.55rem 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '0.81rem' }}>{item.eventType}</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{formatDateTime(item.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                    {item.fromStatus ?? '--'} → {item.toStatus ?? '--'} | progress: {formatNumber(item.progressPercent ?? 0)}%
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>actor: {item.actorId ?? 'system'}</div>
                  {item.note && <div style={{ fontSize: '0.78rem' }}>{item.note}</div>}
                </div>
              ))}
            </section>
          </div>
        )}
      </SidePanel>
    </article>
  );
}
