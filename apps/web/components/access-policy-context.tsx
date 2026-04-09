'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiRequest } from '../lib/api-client';
import {
  createAccessPolicySnapshot,
  decideActionAccess,
  decideModuleAccess,
  decideRouteAccess,
  IAM_V2_ENFORCE_MODE,
  parseAccessSecurityIamV2State,
  parseEffectivePermissionMap,
  parseRuntimeEnabledModules,
  type AccessPolicySnapshot,
  type EffectivePermissionMap,
  type PermissionAction
} from '../lib/access-policy';
import type { UserRole } from '../lib/rbac';
import { useUserRole } from './user-role-context';

type AccessPolicyContextValue = {
  snapshot: AccessPolicySnapshot;
  isReady: boolean;
  canRoute: (pathname: string) => boolean;
  canModule: (moduleKey: string) => boolean;
  canAction: (moduleKey: string, action: PermissionAction) => boolean;
  canAnyAction: (moduleKey: string, actions: PermissionAction[]) => boolean;
};

type AccessPolicyCachePayload = {
  role: UserRole;
  iamV2Enabled: boolean;
  enabledModules: string[] | null;
  effectivePermissions: EffectivePermissionMap;
  loadedAt: string;
};

const CACHE_KEY_PREFIX = 'erp_access_policy_cache_v1:';
const CACHE_TTL_MS = 30_000;
const POLICY_LOADING_STABILIZATION_MS = 2200;

const AccessPolicyContext = createContext<AccessPolicyContextValue | undefined>(undefined);

function createEmptySnapshot(role: UserRole) {
  return createAccessPolicySnapshot({
    role,
    iamV2Enabled: false,
    enabledModules: null,
    effectivePermissions: {},
    runtimeResolved: false,
    effectiveResolved: false,
    loadedAt: null
  });
}

function readCachedPolicy(role: UserRole): AccessPolicyCachePayload | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(`${CACHE_KEY_PREFIX}${role}`);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AccessPolicyCachePayload;
    const loadedAt = new Date(String(parsed.loadedAt ?? '')).getTime();
    if (!Number.isFinite(loadedAt)) {
      return null;
    }
    if (Date.now() - loadedAt > CACHE_TTL_MS) {
      return null;
    }
    if (parsed.role !== role) {
      return null;
    }
    return {
      role,
      iamV2Enabled: parsed.iamV2Enabled === true,
      enabledModules: Array.isArray(parsed.enabledModules) ? parsed.enabledModules : null,
      effectivePermissions:
        parsed.effectivePermissions && typeof parsed.effectivePermissions === 'object'
          ? parsed.effectivePermissions
          : {},
      loadedAt: new Date(loadedAt).toISOString()
    };
  } catch {
    return null;
  }
}

function writeCachedPolicy(snapshot: AccessPolicySnapshot) {
  if (typeof window === 'undefined' || !snapshot.loadedAt) {
    return;
  }

  const payload: AccessPolicyCachePayload = {
    role: snapshot.role,
    iamV2Enabled: snapshot.iamV2Enabled,
    enabledModules: snapshot.enabledModules,
    effectivePermissions: snapshot.effectivePermissions,
    loadedAt: snapshot.loadedAt
  };

  window.sessionStorage.setItem(`${CACHE_KEY_PREFIX}${snapshot.role}`, JSON.stringify(payload));
}

export function AccessPolicyProvider({ children }: { children: ReactNode }) {
  const { role, ready, authEnabled, isAuthenticated } = useUserRole();
  const [snapshot, setSnapshot] = useState<AccessPolicySnapshot>(() => createEmptySnapshot(role));

  useEffect(() => {
    setSnapshot((current) => {
      if (current.role === role) {
        return current;
      }
      return createEmptySnapshot(role);
    });
  }, [role]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (authEnabled && !isAuthenticated) {
      return;
    }

    let mounted = true;
    const cached = readCachedPolicy(role);

    if (cached) {
      setSnapshot(
        createAccessPolicySnapshot({
          role,
          iamV2Enabled: cached.iamV2Enabled,
          enabledModules: cached.enabledModules,
          effectivePermissions: cached.effectivePermissions,
          runtimeResolved: true,
          effectiveResolved: true,
          loadedAt: cached.loadedAt
        })
      );
    } else {
      setSnapshot(createEmptySnapshot(role));
    }

    const load = async () => {
      const loadStartedAt = Date.now();
      const [runtimeResult, effectiveResult, accessSecurityResult] = await Promise.allSettled([
        apiRequest('/settings/runtime'),
        apiRequest('/settings/permissions/effective'),
        apiRequest('/settings/domains/access_security')
      ]);

      const elapsed = Date.now() - loadStartedAt;
      if (elapsed < POLICY_LOADING_STABILIZATION_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLICY_LOADING_STABILIZATION_MS - elapsed));
      }

      if (!mounted) {
        return;
      }

      const enabledModules =
        runtimeResult.status === 'fulfilled'
          ? parseRuntimeEnabledModules(runtimeResult.value)
          : cached?.enabledModules ?? null;

      const effectivePermissions =
        effectiveResult.status === 'fulfilled'
          ? parseEffectivePermissionMap(effectiveResult.value)
          : cached?.effectivePermissions ?? {};
      const iamV2State =
        accessSecurityResult.status === 'fulfilled'
          ? parseAccessSecurityIamV2State(accessSecurityResult.value)
          : { enabled: cached?.iamV2Enabled === true, mode: 'SHADOW' as const };
      const iamV2Enabled = iamV2State.enabled && iamV2State.mode === IAM_V2_ENFORCE_MODE;

      const resolvedSnapshot = createAccessPolicySnapshot({
        role,
        iamV2Enabled,
        enabledModules,
        effectivePermissions,
        runtimeResolved: true,
        effectiveResolved: true,
        loadedAt: new Date().toISOString()
      });

      setSnapshot(resolvedSnapshot);
      writeCachedPolicy(resolvedSnapshot);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [role, ready, authEnabled, isAuthenticated]);

  const value = useMemo<AccessPolicyContextValue>(() => {
    return {
      snapshot,
      isReady: snapshot.isReady,
      canRoute: (pathname: string) => decideRouteAccess(snapshot, pathname).allowed,
      canModule: (moduleKey: string) => decideModuleAccess(snapshot, moduleKey).allowed,
      canAction: (moduleKey: string, action: PermissionAction) =>
        decideActionAccess(snapshot, moduleKey, action).allowed,
      canAnyAction: (moduleKey: string, actions: PermissionAction[]) =>
        actions.some((action) => decideActionAccess(snapshot, moduleKey, action).allowed)
    };
  }, [snapshot]);

  return <AccessPolicyContext.Provider value={value}>{children}</AccessPolicyContext.Provider>;
}

export function useAccessPolicy() {
  const context = useContext(AccessPolicyContext);
  if (!context) {
    throw new Error('useAccessPolicy must be used inside AccessPolicyProvider');
  }
  return context;
}
