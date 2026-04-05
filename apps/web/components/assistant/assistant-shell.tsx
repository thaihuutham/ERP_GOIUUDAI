'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { assistantApi, type AssistantAccess } from '../../lib/assistant-api';
import {
  getAllowedAssistantRoutes,
  resolveAssistantRouteFromPath,
  type AssistantRouteKey
} from '../../lib/assistant-routes';
import { useAccessPolicy } from '../access-policy-context';
import { useUserRole } from '../user-role-context';

type AssistantShellContextValue = {
  access: AssistantAccess | null;
  accessLoading: boolean;
  accessError: string | null;
  reloadAccess: () => Promise<void>;
  activeRoute: AssistantRouteKey | null;
};

const AssistantShellContext = createContext<AssistantShellContextValue | undefined>(undefined);

export function useAssistantShell() {
  const context = useContext(AssistantShellContext);
  if (!context) {
    throw new Error('useAssistantShell must be used inside AssistantShell');
  }
  return context;
}

type AssistantShellProps = {
  children: ReactNode;
};

export function AssistantShell({ children }: AssistantShellProps) {
  const pathname = usePathname();
  const { role } = useUserRole();
  const { canModule, canRoute } = useAccessPolicy();
  const [access, setAccess] = useState<AssistantAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  const activeRoute = useMemo(() => resolveAssistantRouteFromPath(pathname), [pathname]);
  const allowedRoutes = useMemo(
    () => getAllowedAssistantRoutes(role).filter((route) => canRoute(route.href)),
    [role, canRoute]
  );

  const loadAccess = async () => {
    setAccessLoading(true);
    setAccessError(null);
    try {
      const payload = await assistantApi.getAccessMe();
      setAccess(payload);
    } catch (error) {
      setAccess(null);
      setAccessError(error instanceof Error ? error.message : 'Không thể tải phạm vi truy cập hiện tại của Trợ lý AI.');
    } finally {
      setAccessLoading(false);
    }
  };

  useEffect(() => {
    void loadAccess();
  }, []);

  if (!canModule('assistant')) {
    return null;
  }

  if (activeRoute && !canRoute(`/modules/assistant/${activeRoute}`)) {
    return null;
  }

  return (
    <AssistantShellContext.Provider
      value={{
        access,
        accessLoading,
        accessError,
        reloadAccess: loadAccess,
        activeRoute
      }}
    >
      <article className="module-workbench">
        <header className="module-header">
          <div>
            <h1>Trợ lý AI</h1>
            <p>Điều phối AI theo phạm vi truy cập: phiên chạy, quyền dữ liệu, proxy, tri thức và kênh phân phối.</p>
          </div>
          <ul>
            <li>Vai trò hiện tại: {role}</li>
            <li>Phạm vi hiện tại: {access?.scope?.type ?? (accessLoading ? 'đang tải' : '--')}</li>
            <li>Phân hệ AI được phép: {access?.allowedModules?.join(', ') || '--'}</li>
          </ul>
        </header>

        <section className="feature-panel" style={{ gap: '0.9rem' }}>
          <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {allowedRoutes.map((route) => (
              <Link
                key={route.key}
                href={route.href}
                className={`btn ${activeRoute === route.key ? 'btn-primary' : 'btn-ghost'}`}
              >
                {route.title}
              </Link>
            ))}
          </nav>

          {accessLoading && (
            <p className="banner banner-warning" style={{ margin: 0 }}>
              Đang tải ảnh chụp phạm vi truy cập Trợ lý AI...
            </p>
          )}
          {accessError && (
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              <p className="banner banner-error" style={{ margin: 0 }}>
                {accessError}
              </p>
              <div>
                <button type="button" className="btn btn-ghost" onClick={() => void loadAccess()}>
                  Tải lại phạm vi truy cập
                </button>
              </div>
            </div>
          )}

          {children}
        </section>
      </article>
    </AssistantShellContext.Provider>
  );
}
