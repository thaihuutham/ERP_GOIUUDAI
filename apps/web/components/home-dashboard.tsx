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
  ArrowRight
} from 'lucide-react';
import { apiRequest } from '../lib/api-client';
import { getVisibleModuleCards } from '../lib/modules';
import { formatRuntimeCurrency } from '../lib/runtime-format';
import { SYSTEM_PROFILE } from '../lib/system-profile';
import { useUserRole } from './user-role-context';

type Overview = {
  totalRevenue?: number;
  totalEmployees?: number;
  pendingInvoices?: number;
  activePurchaseOrders?: number;
};

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
          // Runtime endpoint chỉ là pre-check thân thiện; nếu lỗi vẫn thử gọi overview.
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

  const metrics = useMemo(() => [
    {
      label: 'Phát sinh doanh thu',
      value: overview?.totalRevenue !== undefined ? formatRuntimeCurrency(Number(overview.totalRevenue)) : '--',
      icon: <TrendingUp size={20} />,
      color: 'var(--primary)'
    },
    {
      label: 'Nhân sự vận hành',
      value: overview?.totalEmployees !== undefined ? String(overview.totalEmployees) : '--',
      icon: <Users size={20} />,
      color: 'var(--success)'
    },
    {
      label: 'Hóa đơn chờ xử lý',
      value: overview?.pendingInvoices !== undefined ? String(overview.pendingInvoices) : '--',
      icon: <FileText size={20} />,
      color: 'var(--warning)'
    },
    {
      label: 'Đơn mua hàng (PO)',
      value: overview?.activePurchaseOrders !== undefined ? String(overview.activePurchaseOrders) : '--',
      icon: <ShoppingCart size={20} />,
      color: 'var(--danger)'
    }
  ], [overview]);

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
        <div className="hero-badge">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <ShieldCheck size={14} />
            <span>{SYSTEM_PROFILE.governanceVision}</span>
          </div>
          <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', opacity: 0.9 }}>Vai trò hiện tại: {role}</div>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((m) => (
          <article key={m.label} className="metric-card">
            <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ color: m.color, display: 'inline-flex', alignItems: 'center' }}>{m.icon}</span>
              {m.label}
            </h2>
            <p>{m.value}</p>
          </article>
        ))}
      </section>

      <section>
        <h3 style={{ fontSize: '1.02rem', marginBottom: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
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
      </section>

      {error && <div className={`banner ${error === REPORTS_DISABLED_NOTICE ? 'banner-warning' : 'banner-error'}`}>{error}</div>}
    </div>
  );
}
