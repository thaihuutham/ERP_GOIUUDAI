export const WEB_AUTH_STORAGE_KEY = 'erp_web_auth_session_v1';

export type WebAuthUser = {
  id: string;
  email: string;
  role: string;
  tenantId?: string | null;
  employeeId?: string | null;
  positionId?: string | null;
  mustChangePassword?: boolean;
  isActive?: boolean;
};

export type WebAuthSession = {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn?: string | number;
  mustChangePassword?: boolean;
  user: WebAuthUser;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readStoredAuthSession(): WebAuthSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(WEB_AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.user)) {
      return null;
    }

    const accessToken = String(parsed.accessToken ?? '').trim();
    const refreshToken = String(parsed.refreshToken ?? '').trim();
    const user = parsed.user;
    const id = String(user.id ?? '').trim();
    const role = String(user.role ?? '').trim();

    if (!accessToken || !refreshToken || !id || !role) {
      return null;
    }

    return {
      accessToken,
      refreshToken,
      tokenType: String(parsed.tokenType ?? 'Bearer'),
      expiresIn: parsed.expiresIn as string | number | undefined,
      mustChangePassword: parsed.mustChangePassword === true || user.mustChangePassword === true,
      user: {
        id,
        email: String(user.email ?? ''),
        role,
        tenantId: user.tenantId ? String(user.tenantId) : null,
        employeeId: user.employeeId ? String(user.employeeId) : null,
        positionId: user.positionId ? String(user.positionId) : null,
        mustChangePassword: user.mustChangePassword === true,
        isActive: user.isActive !== false
      }
    };
  } catch {
    return null;
  }
}

export function writeStoredAuthSession(session: WebAuthSession | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(WEB_AUTH_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(WEB_AUTH_STORAGE_KEY, JSON.stringify(session));
}

