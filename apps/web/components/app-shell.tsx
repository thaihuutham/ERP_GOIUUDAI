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
  GraduationCap,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  getAllowedAssistantRoutes,
  resolveAssistantRouteFromPath
} from '../lib/assistant-routes';
import { HR_SECTION_DEFINITIONS, HR_SECTION_MAP, type HrSectionKey } from '../lib/hr-sections';
import { apiRequest } from '../lib/api-client';
import { moduleCards } from '../lib/modules';
import { USER_ROLES } from '../lib/rbac';
import { SIDEBAR_GROUPS, type SidebarNavItemConfig } from '../lib/sidebar-config';
import { setRuntimeLocale } from '../lib/runtime-format';
import { SYSTEM_PROFILE } from '../lib/system-profile';
import { useAccessPolicy } from './access-policy-context';
import { GlobalSearchCommand } from './global-search-command';
import { Breadcrumb } from './ui/breadcrumb';
import { useUserRole } from './user-role-context';
import { DailyQuizGate } from './daily-quiz-gate';

function isActive(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname.startsWith(href);
}

const ICON_MAP: Record<string, any> = {
  dashboard: LayoutDashboard,
  conversations: Bot,
  zaloAccounts: Users,
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
  assistant: Bot,
  audit: History,
  settings: Settings,
  notifications: Bell,
  elearning: GraduationCap,
};

const ACCESS_REDIRECT_NOTICE_KEY = 'erp_access_redirect_notice';

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

  if (pathname.startsWith('/modules/settings/custom-fields')) {
    return 'Cài đặt • Trường tùy chỉnh';
  }

  if (pathname.startsWith('/modules/zalo-automation/messages')) {
    return 'Zalo Automation • Tin nhắn';
  }

  if (pathname.startsWith('/modules/zalo-automation/accounts')) {
    return 'Zalo Automation • Tài khoản Zalo';
  }

  if (pathname.startsWith('/modules/zalo-automation/ai-runs')) {
    return 'Zalo Automation • AI đánh giá & Phiên chạy';
  }

  if (pathname.startsWith('/modules/zalo-automation/campaigns')) {
    return 'Zalo Automation • Chiến dịch';
  }

  if (pathname.startsWith('/modules/crm/conversations')) {
    return 'Zalo Automation • Tin nhắn';
  }

  if (pathname.startsWith('/modules/crm/vehicles')) {
    return 'CRM • Quản lý xe';
  }

  if (pathname.startsWith('/modules/crm/customers/import')) {
    return 'CRM • Import khách hàng';
  }

  if (pathname.startsWith('/modules/crm/zalo-accounts')) {
    return 'Quản lý tài khoản Zalo';
  }

  const match = pathname.match(/^\/modules\/([^/]+)/);
  if (!match) {
    return SYSTEM_PROFILE.systemName;
  }

  const key = match[1];
  return moduleCards.find((item) => item.key === key)?.title ?? SYSTEM_PROFILE.systemName;
}

type RuntimeSettingsPayload = {
  organization?: {
    companyName?: string;
    taxCode?: string;
  };
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    appearance?: {
      primary?: string;
      primaryHover?: string;
      primarySoft?: string;
      topbarBg?: string;
      sidebarBg?: string;
      sidebarText?: string;
      surface?: string;
      surfaceMuted?: string;
      border?: string;
      success?: string;
      warning?: string;
      danger?: string;
      info?: string;
      chart1?: string;
      chart2?: string;
      chart3?: string;
      chart4?: string;
      chart5?: string;
      chart6?: string;
      radiusSm?: number;
      radiusMd?: number;
      radiusLg?: number;
      shadowSm?: string;
      shadowMd?: string;
      density?: 'comfortable' | 'compact';
      fontScale?: number;
    };
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
  const [assistantExpanded, setAssistantExpanded] = useState(false);
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
  const { canModule, canRoute } = useAccessPolicy();
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
  const [accessRedirectNotice, setAccessRedirectNotice] = useState<string | null>(null);
  const [dailyQuizCompleted, setDailyQuizCompleted] = useState(false);

  const currentTitle = useMemo(() => getCurrentModuleTitle(pathname), [pathname]);
  const visibleModules = useMemo(
    () => moduleCards.filter((item) => canModule(item.key)),
    [canModule]
  );
  const visibleModulesByKey = useMemo(
    () => new Map(visibleModules.map((item) => [item.key, item])),
    [visibleModules]
  );
  const showZaloAutomation = useMemo(() => canRoute('/modules/zalo-automation/messages'), [canRoute]);
  const isHrPath = pathname.startsWith('/modules/hr');
  const isAssistantPath = pathname.startsWith('/modules/assistant');
  const assistantRouteKey = useMemo(() => resolveAssistantRouteFromPath(pathname), [pathname]);
  const assistantRoutes = useMemo(
    () => getAllowedAssistantRoutes(role).filter((route) => canRoute(route.href)),
    [role, canRoute]
  );



  const isModuleLinkActive = (moduleKey: string) => {
    if (moduleKey === 'crm') {
      return (
        pathname === '/modules/crm'
        || pathname.startsWith('/modules/crm/vehicles')
        || pathname.startsWith('/modules/crm/customers')
        || pathname.startsWith('/modules/crm/distribution')
      );
    }
    if (moduleKey === 'hr') {
      return isHrPath;
    }
    if (moduleKey === 'assistant') {
      return isAssistantPath;
    }
    return isActive(pathname, `/modules/${moduleKey}`);
  };

  const handleAssistantParentClick = () => {
    setAssistantExpanded((prev) => !prev);
    setMobileOpen(false);
    router.push('/modules/assistant/runs');
  };

  const renderModuleLink = (item: (typeof visibleModules)[number]) => {
    const Icon = ICON_MAP[item.key] || LayoutDashboard;
    const tooltip = menuCollapsed ? item.title : undefined;

    if (item.key === 'hr') {
      return (
        <div key={item.key} className="side-tree side-tree-static">
          <Link
            href="/modules/hr"
            className={`side-link side-link-parent ${isHrPath ? 'active' : ''}`}
            onClick={() => setMobileOpen(false)}
            title={tooltip}
          >
            <span className="side-link-main">
              <Icon size={18} />
              <span className="link-text">{item.title}</span>
            </span>
          </Link>

          {!menuCollapsed && (
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

    if (item.key === 'assistant') {
      return (
        <div key={item.key} className={`side-tree ${assistantExpanded ? 'side-tree-open' : ''}`}>
          <button
            type="button"
            className={`side-link side-link-parent ${isAssistantPath ? 'active' : ''}`}
            onClick={handleAssistantParentClick}
            title={tooltip}
          >
            <span className="side-link-main">
              <Icon size={18} />
              <span className="link-text">{item.title}</span>
            </span>
            {!menuCollapsed && (
              <ChevronDown
                size={14}
                className={`side-link-caret ${assistantExpanded ? 'side-link-caret-open' : ''}`}
              />
            )}
          </button>

          {!menuCollapsed && assistantExpanded && (
            <div className="side-submenu">
              {assistantRoutes.map((subRoute) => {
                const active =
                  assistantRouteKey === subRoute.key ||
                  pathname === subRoute.href ||
                  pathname.startsWith(`${subRoute.href}/`);
                return (
                  <Link
                    key={subRoute.key}
                    href={subRoute.href}
                    className={`side-submenu-link ${active ? 'active' : ''}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span className="side-submenu-dot" aria-hidden="true" />
                    <span>{subRoute.title}</span>
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
        title={tooltip}
      >
        <Icon size={18} />
        <span className="link-text">{item.title}</span>
      </Link>
    );
  };

  useEffect(() => {
    if (isAssistantPath) {
      setAssistantExpanded(true);
    }
  }, [isAssistantPath]);

  const shouldRenderSidebarItem = (item: SidebarNavItemConfig) => {
    if (item.type === 'module') {
      return visibleModulesByKey.has(item.moduleKey);
    }
    if (item.type === 'custom' && item.requiresFlag === 'zaloAutomation') {
      return showZaloAutomation && canRoute(item.href);
    }
    return true;
  };

  const renderSidebarItem = (item: SidebarNavItemConfig) => {
    if (item.type === 'module') {
      const moduleItem = visibleModulesByKey.get(item.moduleKey);
      if (!moduleItem) return null;
      return renderModuleLink(moduleItem);
    }

    const Icon = ICON_MAP[item.iconKey] || LayoutDashboard;
    const tooltip = menuCollapsed ? item.title : undefined;
    const active = isActive(pathname, item.href);

    return (
      <Link
        key={item.key}
        href={item.href}
        className={`side-link ${active ? 'active' : ''}`}
        onClick={() => setMobileOpen(false)}
        title={tooltip}
      >
        <Icon size={18} />
        <span className="link-text">{item.title}</span>
      </Link>
    );
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const notice = window.sessionStorage.getItem(ACCESS_REDIRECT_NOTICE_KEY);
    if (notice) {
      setAccessRedirectNotice(notice);
      window.sessionStorage.removeItem(ACCESS_REDIRECT_NOTICE_KEY);
    } else {
      setAccessRedirectNotice(null);
    }
  }, [pathname]);

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
          const root = document.documentElement;
          const appearance = payload.branding?.appearance;
          const primaryColor = String(appearance?.primary ?? payload.branding?.primaryColor ?? '').trim();

          if (primaryColor) {
            root.style.setProperty('--primary', primaryColor);
          }
          if (appearance?.primaryHover) root.style.setProperty('--primary-hover', appearance.primaryHover);
          if (appearance?.primarySoft) root.style.setProperty('--primary-soft', appearance.primarySoft);
          if (appearance?.topbarBg) root.style.setProperty('--topbar-bg', appearance.topbarBg);
          if (appearance?.sidebarBg) root.style.setProperty('--sidebar-bg', appearance.sidebarBg);
          if (appearance?.sidebarText) root.style.setProperty('--sidebar-text', appearance.sidebarText);
          if (appearance?.surface) {
            root.style.setProperty('--surface', appearance.surface);
            root.style.setProperty('--bg-card', appearance.surface);
          }
          if (appearance?.surfaceMuted) root.style.setProperty('--surface-muted', appearance.surfaceMuted);
          if (appearance?.border) {
            root.style.setProperty('--border', appearance.border);
            root.style.setProperty('--line', appearance.border);
          }
          if (appearance?.success) root.style.setProperty('--success', appearance.success);
          if (appearance?.warning) root.style.setProperty('--warning', appearance.warning);
          if (appearance?.danger) root.style.setProperty('--danger', appearance.danger);
          if (appearance?.info) root.style.setProperty('--info', appearance.info);
          if (appearance?.chart1) root.style.setProperty('--chart1', appearance.chart1);
          if (appearance?.chart2) root.style.setProperty('--chart2', appearance.chart2);
          if (appearance?.chart3) root.style.setProperty('--chart3', appearance.chart3);
          if (appearance?.chart4) root.style.setProperty('--chart4', appearance.chart4);
          if (appearance?.chart5) root.style.setProperty('--chart5', appearance.chart5);
          if (appearance?.chart6) root.style.setProperty('--chart6', appearance.chart6);
          if (typeof appearance?.radiusSm === 'number') root.style.setProperty('--radius-sm', `${appearance.radiusSm}px`);
          if (typeof appearance?.radiusMd === 'number') root.style.setProperty('--radius-md', `${appearance.radiusMd}px`);
          if (typeof appearance?.radiusLg === 'number') root.style.setProperty('--radius-lg', `${appearance.radiusLg}px`);
          if (appearance?.shadowSm) root.style.setProperty('--shadow-sm', appearance.shadowSm);
          if (appearance?.shadowMd) root.style.setProperty('--shadow-md', appearance.shadowMd);
          if (typeof appearance?.fontScale === 'number' && Number.isFinite(appearance.fontScale)) {
            root.style.setProperty('--font-scale', String(appearance.fontScale));
          }
          root.setAttribute('data-density', appearance?.density === 'compact' ? 'compact' : 'comfortable');
        }
      } catch {
        // Keep default runtime formatting when settings runtime is unavailable.
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [ready, authEnabled, isAuthenticated]);

  useEffect(() => {
    if (canRoute(pathname)) return;
    if (pathname === '/') return;

    const message = 'Trang bạn mở không thuộc phạm vi quyền truy cập. Hệ thống đã chuyển về Tổng quan.';
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(ACCESS_REDIRECT_NOTICE_KEY, message);
    }
    router.replace('/');
  }, [canRoute, pathname, router]);

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
          <h1>{SYSTEM_PROFILE.systemName}</h1>
          <p>Đăng nhập bằng tài khoản nội bộ GOIUUDAI để truy cập hệ thống.</p>
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

  if (authEnabled && !dailyQuizCompleted && userEmail) {
    return (
      <DailyQuizGate
        userEmail={userEmail}
        onComplete={() => setDailyQuizCompleted(true)}
      />
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
              {String(runtimePayload?.organization?.companyName ?? SYSTEM_PROFILE.companyName).slice(0, 1).toUpperCase()}
            </span>
            <span className="brand-title">{runtimePayload?.organization?.companyName ?? SYSTEM_PROFILE.companyName}</span>
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

        {!menuCollapsed && (
          <p className="brand-subtitle">
            {runtimePayload?.organization?.taxCode ? `MST: ${runtimePayload.organization.taxCode}` : SYSTEM_PROFILE.businessDomain}
          </p>
        )}

        <nav className="side-nav">
          {SIDEBAR_GROUPS.map((group) => {
            const items = group.items.filter(shouldRenderSidebarItem);
            if (items.length === 0) {
              return null;
            }

            const groupTitleStyle = group.accentToken ? { color: `var(${group.accentToken})` } : undefined;

            return (
              <div key={group.key}>
                {group.title && !menuCollapsed && (
                  <p className="side-section-title" style={groupTitleStyle}>
                    {group.title}
                  </p>
                )}
                <div className="side-nav-group">{items.map((item) => renderSidebarItem(item))}</div>
              </div>
            );
          })}
        </nav>

        <div className="side-footer">
          {authEnabled ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void logout()} style={{ width: '100%' }}>
              Đăng xuất
            </button>
          ) : (
            <span className="side-footer-avatar">{role.slice(0, 1)}</span>
          )}
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
              <p className="toolbar-subtitle">{`${SYSTEM_PROFILE.operatingModel} • ${SYSTEM_PROFILE.governanceVision}`}</p>
            </div>
          </div>
          <div className="toolbar-right">
            <GlobalSearchCommand />
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

        <Breadcrumb />
        {accessRedirectNotice && (
          <div className="banner banner-warning" style={{ margin: '0 1.5rem 0.8rem' }}>
            {accessRedirectNotice}
          </div>
        )}
        <main className="app-content">{children}</main>
      </section>
    </div>
  );
}
