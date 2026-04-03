'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
import { apiRequest } from '../lib/api-client';
import { getVisibleModuleCards } from '../lib/modules';
import { formatRuntimeCurrency } from '../lib/runtime-format';
import { SYSTEM_PROFILE } from '../lib/system-profile';
import { useUserRole } from './user-role-context';
import { StatCard, SimpleAreaChart, SimplePieChart, Badge } from './ui';

type Overview = {
  totalRevenue?: number;
  totalEmployees?: number;
  pendingInvoices?: number;
  activePurchaseOrders?: number;
};

// Mock data items that represent common business trends
const REVENUE_DATA = [
  { name: 'T1', value: 12000000 },
  { name: 'T2', value: 15500000 },
  { name: 'T3', value: 14200000 },
  { name: 'T4', value: 18000000 },
  { name: 'T5', value: 19500000 },
  { name: 'T6', value: 24000000 },
  { name: 'T7', value: 28000000 },
];

const ORDER_STATUS_DATA = [
  { name: 'Hoàn thành', value: 65 },
  { name: 'Đang xử lý', value: 20 },
  { name: 'Đang giao', value: 10 },
  { name: 'Hủy', value: 5 },
];

const QUICK_TASKS = [
  { id: 1, title: 'Duyệt bảng lương tháng', status: 'pending', module: 'HR' },
  { id: 2, title: 'Kiểm tra tồn kho thiếu hụt', status: 'urgent', module: 'SCM' },
  { id: 3, title: 'Ký báo cáo thuế quý', status: 'completed', module: 'FIN' },
];

const ACTIVITIES = [
  { id: 1, text: 'Đơn hàng #SO-2453 đã được giao thành công', time: '10 phút trước', color: 'var(--success)' },
  { id: 2, text: 'Có 5 nhân viên gửi yêu cầu nghỉ phép mới', time: '1 tiếng trước', color: 'var(--warning)' },
  { id: 3, text: 'Hệ thống tự động sao lưu dữ liệu hoàn tất', time: '3 tiếng trước', color: 'var(--primary)' },
];

const REPORTS_DISABLED_NOTICE =
  "Phân hệ 'reports' đang tắt. Vui lòng bật lại tại Cấu hình hệ thống > Hồ sơ tổ chức > Phân hệ đang bật.";

function isReportsDisabledErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("phân hệ 'reports' đang bị tắt") ||
    (normalized.includes('reports') && normalized.includes('đang bị tắt')) ||
    normalized.includes("module 'reports' is disabled")
  );
}

export function HomeDashboard() {
  const { role } = useUserRole();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      let shouldFetchOverview = true;

      try {
        try {
          const runtime = await apiRequest<{ enabledModules?: unknown }>('/settings/runtime');
          const enabledModules = Array.isArray(runtime?.enabledModules)
            ? runtime.enabledModules
                .map((item) => String(item).toLowerCase())
                .filter((item) => item.length > 0)
            : [];
          if (enabledModules.length > 0 && !enabledModules.includes('reports')) {
            shouldFetchOverview = false;
          }
        } catch {
          // Runtime endpoint is just a pre-check
        }

        if (!shouldFetchOverview) {
          if (active) {
            setOverview(null);
            setError(REPORTS_DISABLED_NOTICE);
          }
          return;
        }

        const payload = await apiRequest<Overview>('/reports/overview');
        if (active) {
          setOverview(payload);
          setError(null);
        }
      } catch (err) {
        if (active) {
          const message = err instanceof Error ? err.message : 'Lỗi hệ thống';
          setOverview(null);
          setError(isReportsDisabledErrorMessage(message) ? REPORTS_DISABLED_NOTICE : message);
        }
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const visibleModules = useMemo(() => getVisibleModuleCards(role), [role]);

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
          value={overview?.totalRevenue !== undefined ? formatRuntimeCurrency(Number(overview.totalRevenue)) : '28.000.000 ₫'} 
          icon={<TrendingUp size={18} />} 
          color="var(--primary)" 
          trend={12.5} 
        />
        <StatCard 
          label="Nhân sự vận hành" 
          value={overview?.totalEmployees !== undefined ? String(overview.totalEmployees) : '45'} 
          icon={<Users size={18} />} 
          color="var(--success)" 
          trend={3.2} 
        />
        <StatCard 
          label="Hóa đơn chờ xử lý" 
          value={overview?.pendingInvoices !== undefined ? String(overview.pendingInvoices) : '12'} 
          icon={<FileText size={18} />} 
          color="var(--warning)" 
        />
        <StatCard 
          label="Đơn mua hàng (PO)" 
          value={overview?.activePurchaseOrders !== undefined ? String(overview.activePurchaseOrders) : '8'} 
          icon={<ShoppingCart size={18} />} 
          color="var(--danger)" 
          trend={-2.1} 
        />
      </section>

      {/* Visualizations & Data Row */}
      <section className="dashboard-charts-row">
        {/* Main Chart */}
        <div className="dashboard-chart-card">
          <h3><TrendingUp size={16} color="var(--primary)" /> Tăng trưởng doanh thu 7 tháng gần nhất</h3>
          <div style={{ padding: '0.5rem 0 0 0' }}>
            <SimpleAreaChart 
              data={REVENUE_DATA} 
              xKey="name" 
              yKey="value" 
              height={260}
              formatY={(val) => `${(val / 1000000).toFixed(0)}Tr`}
            />
          </div>
        </div>

        {/* Secondary Info (Pie Chart + Tasks) */}
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div className="dashboard-chart-card" style={{ paddingBottom: '0.5rem' }}>
            <h3><ShoppingCart size={16} /> Trạng thái đơn hàng</h3>
            <div style={{ padding: '0.5rem 0' }}>
              <SimplePieChart 
                data={ORDER_STATUS_DATA} 
                height={160} 
                innerRadius={30}
              />
            </div>
          </div>
          
          <div className="quick-tasks-panel">
            <h3><ListTodo size={16} /> Việc cần làm nhanh</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.2rem' }}>
              {QUICK_TASKS.map(task => (
                <div key={task.id} className="quick-task-item">
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {task.status === 'completed' ? <CheckCircle2 size={14} color="var(--success)" /> : 
                     task.status === 'urgent' ? <AlertCircle size={14} color="var(--danger)" /> : 
                     <Clock size={14} color="var(--text-muted)" />}
                    <span style={{ fontWeight: 500 }}>{task.title}</span>
                  </div>
                  <Badge variant={task.status === 'urgent' ? 'danger' : task.status === 'completed' ? 'success' : 'neutral'}>{task.module}</Badge>
                </div>
              ))}
            </div>
          </div>
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
          <h3 style={{ marginBottom: '0.35rem' }}><Activity size={16} color="var(--primary)" /> Hoạt động mới nhất</h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ACTIVITIES.map(activity => (
              <div key={activity.id} className="activity-item">
                <div className="activity-dot" style={{ backgroundColor: activity.color }} />
                <span>{activity.text}</span>
                <span className="activity-time">{activity.time}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {error && <div className={`banner ${error === REPORTS_DISABLED_NOTICE ? 'banner-warning' : 'banner-error'}`}>{error}</div>}
    </div>
  );
}
