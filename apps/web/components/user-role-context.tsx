'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AUTH_SESSION_EXPIRED_EVENT,
  readStoredAuthSession,
  writeStoredAuthSession,
  type WebAuthSession
} from '../lib/auth-session';
import { apiRequest } from '../lib/api-client';
import { DEFAULT_WEB_ROLE, type UserRole } from '../lib/rbac';

type UserRoleContextValue = {
  role: UserRole;
  setRole: (role: UserRole) => void;
  ready: boolean;
  authEnabled: boolean;
  isAuthenticated: boolean;
  mfaPending: boolean;
  mfaChallengeEmail: string | null;
  requiresPasswordChange: boolean;
  userEmail: string | null;
  login: (email: string, password: string) => Promise<void>;
  verifyMfaLogin: (code: string) => Promise<void>;
  clearMfaChallenge: () => void;
  logout: () => Promise<void>;
  changePassword: (args: { currentPassword?: string; newPassword: string }) => Promise<void>;
};

const STORAGE_KEY = 'erp_web_role';
const AUTH_ENABLED = String(process.env.NEXT_PUBLIC_AUTH_ENABLED ?? 'true').trim().toLowerCase() === 'true';

const UserRoleContext = createContext<UserRoleContextValue | undefined>(undefined);

type MfaChallengePayload = {
  mfaRequired: true;
  challengeToken: string;
  challengeExpiresIn?: string;
  user?: {
    email?: string;
  };
};

function isMfaChallengePayload(value: unknown): value is MfaChallengePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.mfaRequired === true && typeof record.challengeToken === 'string' && record.challengeToken.trim().length > 0;
}

function normalizeWebRole(value: unknown): UserRole {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'ADMIN') {
    return 'ADMIN';
  }
  if (normalized === 'USER') {
    return 'USER';
  }
  return DEFAULT_WEB_ROLE;
}

export function UserRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<UserRole>(DEFAULT_WEB_ROLE);
  const [authSession, setAuthSession] = useState<WebAuthSession | null>(null);
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaChallengeEmail, setMfaChallengeEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (AUTH_ENABLED) {
      const session = readStoredAuthSession();
      if (session) {
        setAuthSession(session);
        setRoleState(normalizeWebRole(session.user?.role));
      }
      setReady(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setRoleState(normalizeWebRole(raw));
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!AUTH_ENABLED || typeof window === 'undefined') {
      return;
    }

    const handleSessionExpired = () => {
      setAuthSession(null);
      writeStoredAuthSession(null);
      setMfaChallengeToken(null);
      setMfaChallengeEmail(null);
      setRoleState(DEFAULT_WEB_ROLE);
    };

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  const setRole = (nextRole: UserRole) => {
    if (AUTH_ENABLED) {
      return;
    }
    setRoleState(nextRole);
    window.localStorage.setItem(STORAGE_KEY, nextRole);
  };

  const applyAuthSession = (nextSession: WebAuthSession | null) => {
    setAuthSession(nextSession);
    writeStoredAuthSession(nextSession);
    if (nextSession) {
      setMfaChallengeToken(null);
      setMfaChallengeEmail(null);
    }

    if (!nextSession) {
      setRoleState(DEFAULT_WEB_ROLE);
      return;
    }

    setRoleState(normalizeWebRole(nextSession.user?.role));
  };

  const login = async (email: string, password: string) => {
    const payload = await apiRequest<WebAuthSession | MfaChallengePayload>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuth: true
    });

    if (isMfaChallengePayload(payload)) {
      setMfaChallengeToken(payload.challengeToken);
      setMfaChallengeEmail(String(payload.user?.email ?? email).trim() || null);
      applyAuthSession(null);
      return;
    }

    applyAuthSession(payload);
  };

  const verifyMfaLogin = async (code: string) => {
    if (!mfaChallengeToken) {
      throw new Error('Không tìm thấy MFA challenge. Vui lòng đăng nhập lại.');
    }

    const payload = await apiRequest<WebAuthSession>('/auth/mfa/verify-login', {
      method: 'POST',
      body: {
        challengeToken: mfaChallengeToken,
        code
      },
      skipAuth: true
    });
    applyAuthSession(payload);
  };

  const clearMfaChallenge = () => {
    setMfaChallengeToken(null);
    setMfaChallengeEmail(null);
  };

  const logout = async () => {
    if (AUTH_ENABLED && authSession?.accessToken) {
      try {
        await apiRequest('/auth/logout', {
          method: 'POST'
        });
      } catch {
        // ignore logout transport errors on client and clear local session anyway
      }
    }
    applyAuthSession(null);
  };

  const changePassword = async (args: { currentPassword?: string; newPassword: string }) => {
    const payload = await apiRequest<WebAuthSession>('/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: args.currentPassword,
        newPassword: args.newPassword
      }
    });
    applyAuthSession(payload);
  };

  const requiresPasswordChange = AUTH_ENABLED
    ? authSession?.mustChangePassword === true || authSession?.user?.mustChangePassword === true
    : false;
  const mfaPending = AUTH_ENABLED ? Boolean(mfaChallengeToken) && !authSession?.accessToken : false;

  const userEmail = AUTH_ENABLED ? String(authSession?.user?.email ?? '') || null : null;
  const isAuthenticated = AUTH_ENABLED ? Boolean(authSession?.accessToken) : true;

  const value = useMemo(
    () => ({
      role,
      setRole,
      ready,
      authEnabled: AUTH_ENABLED,
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
    }),
    [
      changePassword,
      clearMfaChallenge,
      isAuthenticated,
      login,
      logout,
      mfaChallengeEmail,
      mfaPending,
      ready,
      requiresPasswordChange,
      role,
      userEmail,
      verifyMfaLogin
    ]
  );

  return <UserRoleContext.Provider value={value}>{children}</UserRoleContext.Provider>;
}

export function useUserRole() {
  const ctx = useContext(UserRoleContext);
  if (!ctx) {
    throw new Error('useUserRole must be used inside UserRoleProvider');
  }
  return ctx;
}
