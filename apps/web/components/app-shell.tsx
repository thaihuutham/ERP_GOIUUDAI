'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { getVisibleModuleCards, moduleCards } from '../lib/modules';
import { USER_ROLES } from '../lib/rbac';
import { useUserRole } from './user-role-context';

function isActive(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname.startsWith(href);
}

function getCurrentModuleTitle(pathname: string) {
  if (pathname === '/') {
    return 'Tổng quan';
  }

  const match = pathname.match(/^\/modules\/([^/]+)/);
  if (!match) {
    return 'ERP Bán lẻ';
  }

  const key = match[1];
  return moduleCards.find((item) => item.key === key)?.title ?? 'ERP Bán lẻ';
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { role, setRole, ready } = useUserRole();

  const currentTitle = useMemo(() => getCurrentModuleTitle(pathname), [pathname]);
  const visibleModules = useMemo(() => getVisibleModuleCards(role), [role]);

  return (
    <div className={`shell-layout ${menuCollapsed ? 'shell-layout-collapsed' : ''}`}>
      <button
        type="button"
        className={`shell-backdrop ${mobileOpen ? 'shell-backdrop-open' : ''}`}
        aria-label="Đóng menu"
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`side-menu ${mobileOpen ? 'side-menu-open' : ''}`} aria-label="Điều hướng các phân hệ">
        <div className="side-brand">
          <Link href="/" className="brand-link">
            <span className="brand-dot" aria-hidden="true" />
            <span className="brand-title">ERP Bán lẻ</span>
          </Link>
          <button
            type="button"
            className="menu-icon-btn desktop-only"
            onClick={() => setMenuCollapsed((prev) => !prev)}
            aria-label={menuCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            {menuCollapsed ? '»' : '«'}
          </button>
        </div>

        <p className="brand-subtitle">Sẵn sàng SaaS • Đồng bộ 1 chiều • Theo từng tenant</p>

        <nav className="side-nav">
          <Link
            href="/"
            className={`side-link ${isActive(pathname, '/') && pathname === '/' ? 'active' : ''}`}
            onClick={() => setMobileOpen(false)}
          >
            Tổng quan
          </Link>
          {visibleModules.map((item) => {
            const href = `/modules/${item.key}`;
            return (
              <Link
                key={item.key}
                href={href}
                className={`side-link ${isActive(pathname, href) ? 'active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>
      </aside>

      <section className="shell-main">
        <header className="main-toolbar">
          <div className="toolbar-left">
            <button
              type="button"
              className="menu-icon-btn mobile-only"
              aria-label="Mở menu"
              onClick={() => setMobileOpen(true)}
            >
              ☰
            </button>
            <div>
              <h1 className="toolbar-title">{currentTitle}</h1>
              <p className="toolbar-subtitle">Chế độ tenant: Lược đồ dùng chung (Shared Schema)</p>
            </div>
          </div>
          <div className="toolbar-right">
            <label className="role-switcher" htmlFor="web-role-select">
              <span>Vai trò UI</span>
              <select
                id="web-role-select"
                value={role}
                disabled={!ready}
                onChange={(event) => setRole(event.target.value as (typeof USER_ROLES)[number])}
              >
                {USER_ROLES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <span className="tenant-pill">Shared schema • {role}</span>
          </div>
        </header>

        <main className="app-content">{children}</main>
      </section>
    </div>
  );
}
