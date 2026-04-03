'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

/**
 * Path segment → Vietnamese label mapping.
 * Extend this map when adding new modules or routes.
 */
const SEGMENT_LABELS: Record<string, string> = {
  modules: 'Phân hệ',
  crm: 'CRM',
  sales: 'Bán hàng',
  catalog: 'Danh mục',
  hr: 'Nhân sự',
  finance: 'Tài chính',
  scm: 'Chuỗi cung ứng',
  assets: 'Tài sản',
  projects: 'Dự án',
  workflows: 'Quy trình',
  reports: 'Báo cáo',
  assistant: 'Trợ lý AI',
  audit: 'Nhật ký',
  settings: 'Cấu hình',
  notifications: 'Thông báo',
  conversations: 'Hội thoại',
  payroll: 'Tiền lương',
  'social-insurance': 'BHXH',
  recruitment: 'Tuyển dụng',
  employees: 'Nhân viên',
  attendance: 'Chấm công',
  regulation: 'Quy chế 2026',
  performance: 'Đánh giá',
  'personal-income-tax': 'Thuế TNCN',
  goals: 'Mục tiêu',
  'custom-fields': 'Trường tuỳ chỉnh',
  runs: 'Phiên chạy',
  access: 'Phân quyền',
  proxy: 'Truy vấn',
  knowledge: 'Nguồn tri thức',
  channels: 'Kênh phân phối',
};

type BreadcrumbItem = {
  label: string;
  href: string;
};

function buildBreadcrumbs(pathname: string): BreadcrumbItem[] {
  if (pathname === '/') return [];

  const segments = pathname.split('/').filter(Boolean);
  const crumbs: BreadcrumbItem[] = [{ label: 'Tổng quan', href: '/' }];

  // Skip 'modules' segment in display but include in href
  let hrefAccum = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    hrefAccum += `/${seg}`;

    // Skip showing "modules" in breadcrumb but keep in path
    if (seg === 'modules') continue;

    crumbs.push({
      label: SEGMENT_LABELS[seg] || seg,
      href: hrefAccum,
    });
  }

  return crumbs;
}

export function Breadcrumb() {
  const pathname = usePathname();
  const crumbs = useMemo(() => buildBreadcrumbs(pathname), [pathname]);

  if (crumbs.length <= 1) return null; // Don't show on dashboard

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={crumb.href} className="breadcrumb-item">
            {idx > 0 && <ChevronRight size={12} className="breadcrumb-separator" />}
            {isLast ? (
              <span className="breadcrumb-current">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="breadcrumb-link">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
