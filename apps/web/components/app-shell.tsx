'use client';

import {
  BarChart3,
  Bell,
  Bot,
  Briefcase,
  History,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  Menu,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { ERP_MODULES } from '@erp/shared';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { HR_SECTION_DEFINITIONS, HR_SECTION_MAP, type HrSectionKey } from '../lib/hr-sections';
import { apiRequest } from '../lib/api-client';
import { getVisibleModuleCards, moduleCards } from '../lib/modules';
import { canAccessModule, USER_ROLES } from '../lib/rbac';
import { setRuntimeLocale } from '../lib/runtime-format';
import { useUserRole } from './user-role-context';

function isActive(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname.startsWith(href);
}

const ICON_MAP: Record<string, any> = {
  crm: Users,
  sales: ShoppingCart,
  catalog: Package,
  hr: UserCheck,
  finance: Wallet,
  scm: Truck,
  assets: Briefcase,
  projects: FolderKanban,
  workflows: GitBranch,
  reports: BarChart3,
  audit: History,
  settings: Settings,
  notifications: Bell,
};

const RUNTIME_TOGGLABLE_MODULES = ERP_MODULES.filter((moduleKey) => moduleKey !== 'settings');

function getCurrentModuleTitle(pathname: string) {
  if (pathname === '/') {
    return 'Tổng quan';
  }

  if (pathname.startsWith('/modules/hr/')) {
    const sectionMatch = pathname.match(/^\/modules\/hr\/([^/]+)/);
    const sectionKey = sectionMatch?.[1];
    if (sectionKey && sectionKey in HR_SECTION_MAP) {
      return `Nhân sự • ${HR_SECTION_MAP[sectionKey as HrSectionKey].title}`;
    }
  }

  if (pathname.startsWith('/modules/hr')) {
    return 'Nhân sự';
  }

  if (pathname.startsWith('/modules/crm/conversations')) {
    return 'ZALO Tự động';
  }

  const match = pathname.match(/^\/modules\/([^/]+)/);
  if (!match) {
    return 'ERP Bán lẻ';
  }

  const key = match[1];
  return moduleCards.find((item) => item.key === key)?.title ?? 'ERP Bán lẻ';
}

function resolveModuleFromPath(pathname: string) {
  const match = pathname.match(/^\/modules\/([^/]+)/);
  if (!match) return null;
  return String(match[1] ?? '').toLowerCase() || null;
}

type RuntimeSettingsPayload = {
  organization?: {
    companyName?: string;
    taxCode?: string;
  };
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
  };
  locale?: {
    timezone?: string;
    numberFormat?: string;
    currency?: string;
    dateFormat?: string;
    firstDayOfWeek?: string;
    fiscalYearStartMonth?: number;
  };
  enabledModules?: string[];
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hrExpanded, setHrExpanded] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const {
    role,
    setRole,
    ready,
    authEnabled,
    isAuthenticated,
    mfaPending,
    mfaChallengeEmail,
    requiresPasswordChange,
    userEmail,
    login,
    verifyMfaLogin,
    clearMfaChallenge,
    logout,
    changePassword
  } = useUserRole();
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [runtimePayload, setRuntimePayload] = useState<RuntimeSettingsPayload | null>(null);
  const [runtimeLoaded, setRuntimeLoaded] = useState(false);

  const currentTitle = useMemo(() => getCurrentModuleTitle(pathname), [pathname]);
  const enabledModuleSet = useMemo(() => {
    const modules = Array.isArray(runtimePayload?.enabledModules)
      ? runtimePayload?.enabledModules
      : RUNTIME_TOGGLABLE_MODULES;
    return new Set(modules.map((item) => String(item).toLowerCase()));
  }, [runtimePayload?.enabledModules]);
  const visibleModules = useMemo(
    () =>
      getVisibleModuleCards(role).filter((item) => item.key === 'settings' || enabledModuleSet.has(item.key)),
    [role, enabledModuleSet]
  );
  const showZaloAutomation = useMemo(
    () => canAccessModule(role, 'crm') && enabledModuleSet.has('crm'),
    [role, enabledModuleSet]
  );
  const isHrPath = pathname.startsWith('/modules/hr');

  const { modulesBeforeZalo, modulesAfterZalo } = useMemo(() => {
    const projectsIndex = visibleModules.findIndex((item) => item.key === 'projects');
    if (projectsIndex === -1) {
      return {
        modulesBeforeZalo: visibleModules,
        modulesAfterZalo: [] as typeof visibleModules
      };
    }

    return {
      modulesBeforeZalo: visibleModules.slice(0, projectsIndex + 1),
      modulesAfterZalo: visibleModules.slice(projectsIndex + 1)
    };
  }, [visibleModules]);

  const isModuleLinkActive = (moduleKey: string) => {
    if (moduleKey === 'crm') {
      return pathname === '/modules/crm';
    }
    if (moduleKey === 'hr') {
      return isHrPath;
    }
    return isActive(pathname, `/modules/${moduleKey}`);
  };

  const handleHrParentClick = () => {
    setHrExpanded((prev) => !prev);
    setMobileOpen(false);
    router.push('/modules/hr');
  };

  const renderModuleLink = (item: (typeof visibleModules)[number]) => {
    const Icon = ICON_MAP[item.key] || LayoutDashboard;

    if (item.key === 'hr') {
      return (
        <div key={item.key} className={`side-tree ${hrExpanded ? 'side-tree-open' : ''}`}>
          <button
            type="button"
            className={`side-link side-link-parent ${isHrPath ? 'active' : ''}`}
            onClick={handleHrParentClick}
          >
            <span className="side-link-main">
              <Icon size={18} />
              <span className="link-text">{item.title}</span>
            </span>
            {!menuCollapsed && (
              <ChevronDown size={14} className={`side-link-caret ${hrExpanded ? 'side-link-caret-open' : ''}`} />
            )}
          </button>

          {!menuCollapsed && hrExpanded && (
            <div className="side-submenu">
              {HR_SECTION_DEFINITIONS.map((section) => {
                const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
                return (
                  <Link
                    key={section.key}
                    href={section.href}
                    className={`side-submenu-link ${active ? 'active' : ''}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span className="side-submenu-dot" aria-hidden="true" />
                    <span>{section.title}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    const href = `/modules/${item.key}`;
    return (
      <Link
        key={item.key}
        href={href}
        className={`side-link ${isModuleLinkActive(item.key) ? 'active' : ''}`}
        onClick={() => setMobileOpen(false)}
      >
        <Icon size={18} />
        <span className="link-text">{item.title}</span>
      </Link>
    );
  };

  useEffect(() => {
    if (isHrPath) {
      setHrExpanded(true);
    }
  }, [isHrPath]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setGlobalSearch(new URLSearchParams(window.location.search).get('q') ?? '');
  }, [pathname]);

  const handleGlobalSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = globalSearch.trim();
    const next = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
    if (query) {
      next.set('q', query);
    } else {
      next.delete('q');
    }

    const nextUrl = next.toString() ? `/modules/crm?${next.toString()}` : '/modules/crm';
    router.push(nextUrl);
  };

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError(null);
    try {
      await login(loginEmail, loginPassword);
      setLoginPassword('');
      setMfaCode('');
      setMfaError(null);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Đăng nhập thất bại.');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleMfaSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMfaBusy(true);
    setMfaError(null);
    try {
      await verifyMfaLogin(mfaCode.trim());
      setMfaCode('');
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : 'Xác thực MFA thất bại.');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleChangePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newPassword.trim()) {
      setPasswordError('Vui lòng nhập mật khẩu mới.');
      return;
    }

    setPasswordBusy(true);
    setPasswordError(null);
    try {
      await changePassword({
        currentPassword: currentPassword || undefined,
        newPassword
      });
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Đổi mật khẩu thất bại.');
    } finally {
      setPasswordBusy(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (authEnabled && !isAuthenticated) return;

    let mounted = true;
    const run = async () => {
      try {
        const payload = await apiRequest<RuntimeSettingsPayload>('/settings/runtime');
        if (!mounted) return;
        setRuntimePayload(payload);
        setRuntimeLoaded(true);

        if (payload.locale) {
          setRuntimeLocale({
            timezone: payload.locale.timezone,
            numberFormat: payload.locale.numberFormat,
            currency: payload.locale.currency,
            dateFormat: payload.locale.dateFormat,
            firstDayOfWeek: payload.locale.firstDayOfWeek,
            fiscalYearStartMonth: payload.locale.fiscalYearStartMonth
          });
        }

        if (typeof document !== 'undefined') {
          const primaryColor = String(payload.branding?.primaryColor ?? '').trim();
          if (primaryColor) {
            document.documentElement.style.setProperty('--primary', primaryColor);
          }
        }
      } catch {
        if (!mounted) return;
        setRuntimeLoaded(true);
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [ready, authEnabled, isAuthenticated]);

  useEffect(() => {
    if (!runtimeLoaded) return;
    const moduleKey = resolveModuleFromPath(pathname);
    if (!moduleKey) return;
    if (moduleKey === 'settings') return;
    if (enabledModuleSet.has(moduleKey)) return;
    router.replace(`/modules/settings?blocked=${encodeURIComponent(moduleKey)}`);
  }, [runtimeLoaded, pathname, enabledModuleSet, router]);

  if (authEnabled && !ready) {
    return (
      <div className="auth-gate">
        <div className="auth-card">
          <h1>Đang kiểm tra phiên đăng nhập</h1>
          <p>Vui lòng chờ trong giây lát...</p>
        </div>
      </div>
    );
  }

  if (authEnabled && !isAuthenticated) {
    if (mfaPending) {
      return (
        <div className="auth-gate">
          <form className="auth-card" onSubmit={handleMfaSubmit}>
            <h1>Xác thực MFA</h1>
            <p>
              Nhập mã 6 số từ ứng dụng Authenticator
              {mfaChallengeEmail ? ` cho tài khoản ${mfaChallengeEmail}` : ''}.
            </p>
            <label htmlFor="auth-mfa-code">Mã MFA</label>
            <input
              id="auth-mfa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
            />
            <button type="submit" className="btn btn-primary" disabled={mfaBusy}>
              {mfaBusy ? 'Đang xác thực...' : 'Xác thực'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                clearMfaChallenge();
                setMfaCode('');
              }}
            >
              Đăng nhập lại
            </button>
            {mfaError && <p className="auth-error">{mfaError}</p>}
          </form>
        </div>
      );
    }

    return (
      <div className="auth-gate">
        <form className="auth-card" onSubmit={handleLoginSubmit}>
          <h1>Đăng nhập hệ thống ERP</h1>
          <p>Sử dụng tài khoản nhân viên do quản trị viên cấp trong Settings Center Enterprise.</p>
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            required
            value={loginEmail}
            onChange={(event) => setLoginEmail(event.target.value)}
            placeholder="staff@company.vn"
          />
          <label htmlFor="auth-password">Mật khẩu</label>
          <input
            id="auth-password"
            type="password"
            required
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            placeholder="Nhập mật khẩu"
          />
          <button type="submit" className="btn btn-primary" disabled={loginBusy}>
            {loginBusy ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
          {loginError && <p className="auth-error">{loginError}</p>}
        </form>
      </div>
    );
  }

  if (authEnabled && requiresPasswordChange) {
    return (
      <div className="auth-gate">
        <form className="auth-card" onSubmit={handleChangePasswordSubmit}>
          <h1>Đổi mật khẩu tạm</h1>
          <p>Tài khoản của bạn bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên để tiếp tục sử dụng hệ thống.</p>
          <label htmlFor="auth-current-password">Mật khẩu hiện tại (nếu có)</label>
          <input
            id="auth-current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Mật khẩu hiện tại"
          />
          <label htmlFor="auth-new-password">Mật khẩu mới</label>
          <input
            id="auth-new-password"
            type="password"
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Nhập mật khẩu mới"
          />
          <button type="submit" className="btn btn-primary" disabled={passwordBusy}>
            {passwordBusy ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
          </button>
          {passwordError && <p className="auth-error">{passwordError}</p>}
          <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
            Đăng xuất
          </button>
        </form>
      </div>
    );
  }

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
            <span className="brand-dot" aria-hidden="true">
              {String(runtimePayload?.organization?.companyName ?? 'ERP').slice(0, 1).toUpperCase()}
            </span>
            <span className="brand-title">{runtimePayload?.organization?.companyName ?? 'ERP Retail'}</span>
          </Link>
          <button
            type="button"
            className="btn-ghost desktop-only"
            style={{ padding: '4px' }}
            onClick={() => setMenuCollapsed((prev) => !prev)}
            aria-label={menuCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            {menuCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {!menuCollapsed && <p className="brand-subtitle">{runtimePayload?.organization?.taxCode ? `Tax: ${runtimePayload.organization.taxCode}` : 'Premium Green Workspace'}</p>}

        {!menuCollapsed && <p className="side-section-title">Workspace</p>}

        <nav className="side-nav">
          <div className="side-nav-group">
            <Link
              href="/"
              className={`side-link ${isActive(pathname, '/') && pathname === '/' ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <LayoutDashboard size={18} />
              <span className="link-text">Tổng quan</span>
            </Link>

            {modulesBeforeZalo.map((item) => renderModuleLink(item))}
          </div>

          {showZaloAutomation && (
            <>
              {!menuCollapsed && <p className="side-section-title side-section-title-accent">ZALO Tự động</p>}
              <div className="side-nav-group">
                <Link
                  href="/modules/crm/conversations"
                  className={`side-link ${isActive(pathname, '/modules/crm/conversations') ? 'active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <Bot size={18} />
                  <span className="link-text">Inbox hội thoại</span>
                </Link>
              </div>
            </>
          )}

          {modulesAfterZalo.length > 0 && (
            <div className="side-nav-group">
              {modulesAfterZalo.map((item) => renderModuleLink(item))}
            </div>
          )}
        </nav>

        <div className="side-footer">
          <span className="side-footer-avatar">{role.slice(0, 1)}</span>
        </div>
      </aside>

      <section className="shell-main">
        <header className="main-toolbar">
          <div className="toolbar-left">
            <button
              type="button"
              className="btn-ghost mobile-only"
              aria-label="Mở menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="toolbar-title">{currentTitle}</h1>
              <p className="toolbar-subtitle">Tenant Management • Shared Schema</p>
            </div>
          </div>
          <div className="toolbar-right">
            <form className="global-search-form" onSubmit={handleGlobalSearchSubmit}>
              <Search size={14} />
              <input
                type="search"
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                className="global-search-input"
                placeholder="Tìm kiếm khách hàng..."
              />
            </form>
            {!authEnabled ? (
              <label className="role-switcher" htmlFor="web-role-select">
                <span>Vai trò</span>
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
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
                Đăng xuất
              </button>
            )}
            <span className="tenant-pill">{authEnabled ? `${role} • ${userEmail ?? 'Authenticated'}` : `${role} • Active`}</span>
          </div>
        </header>

        <main className="app-content">{children}</main>
      </section>
    </div>
  );
}
