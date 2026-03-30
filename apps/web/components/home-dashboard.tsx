'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { getVisibleModuleCards } from '../lib/modules';
import { useUserRole } from './user-role-context';

type Overview = {
  totalRevenue?: number;
  totalEmployees?: number;
  pendingInvoices?: number;
  activePurchaseOrders?: number;
};

export function HomeDashboard() {
  const { role } = useUserRole();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const payload = await apiRequest<Overview>('/reports/overview');
        if (active) {
          setOverview(payload);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Không tải được dữ liệu tổng quan.');
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(
    () => [
      {
        label: 'Tổng doanh thu',
        value: overview?.totalRevenue !== undefined ? Number(overview.totalRevenue).toLocaleString('vi-VN') : '--',
        accent: 'metric-accent-blue'
      },
      {
        label: 'Tổng nhân sự',
        value: overview?.totalEmployees !== undefined ? String(overview.totalEmployees) : '--',
        accent: 'metric-accent-green'
      },
      {
        label: 'Hóa đơn chờ xử lý',
        value: overview?.pendingInvoices !== undefined ? String(overview.pendingInvoices) : '--',
        accent: 'metric-accent-orange'
      },
      {
        label: 'Đơn mua hàng đang mở',
        value: overview?.activePurchaseOrders !== undefined ? String(overview.activePurchaseOrders) : '--',
        accent: 'metric-accent-cyan'
      }
    ],
    [overview]
  );
  const visibleModules = useMemo(() => getVisibleModuleCards(role), [role]);

  return (
    <div className="dashboard-root">
      <section className="hero-panel">
        <div>
          <h1>Trung tâm điều hành ERP Bán lẻ</h1>
          <p>
            Trung tâm điều hành cho toàn bộ phân hệ ERP theo kiến trúc SaaS-ready. Mọi thao tác dữ liệu đều đi qua API
            theo tenant.
          </p>
        </div>
        <div className="hero-badge">12 phân hệ • Lược đồ dùng chung • Ngữ cảnh tenant CLS</div>
      </section>

      <section className="metrics-grid" aria-label="Chỉ số tổng quan ERP">
        {metrics.map((metric) => (
          <article className={`metric-card ${metric.accent}`} key={metric.label}>
            <h2>{metric.label}</h2>
            <p>{metric.value}</p>
          </article>
        ))}
      </section>

      {error ? <p className="banner banner-warning">{error}</p> : null}

      <section className="module-card-grid">
        {visibleModules.map((module) => (
          <Link className="module-card" key={module.key} href={`/modules/${module.key}`}>
            <h3>{module.title}</h3>
            <p>{module.description}</p>
            <span className="module-card-link">Mở phân hệ</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
