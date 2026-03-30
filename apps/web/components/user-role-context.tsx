'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_WEB_ROLE, USER_ROLES, type UserRole } from '../lib/rbac';

type UserRoleContextValue = {
  role: UserRole;
  setRole: (role: UserRole) => void;
  ready: boolean;
};

const STORAGE_KEY = 'erp_web_role';

const UserRoleContext = createContext<UserRoleContextValue | undefined>(undefined);

export function UserRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<UserRole>(DEFAULT_WEB_ROLE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw && USER_ROLES.includes(raw as UserRole)) {
        setRoleState(raw as UserRole);
      }
    } finally {
      setReady(true);
    }
  }, []);

  const setRole = (nextRole: UserRole) => {
    setRoleState(nextRole);
    window.localStorage.setItem(STORAGE_KEY, nextRole);
  };

  const value = useMemo(
    () => ({
      role,
      setRole,
      ready
    }),
    [role, ready]
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
