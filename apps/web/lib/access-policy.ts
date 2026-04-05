import { ERP_MODULES } from '@erp/shared';
import type { HttpMethod } from './module-ui';
import { canAccessAssistantRoute, resolveAssistantRouteFromPath } from './assistant-routes';
import { getMinRoleForModule, hasRoleAtLeast, type UserRole } from './rbac';

export const PERMISSION_ACTIONS = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE'] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export type PermissionEffect = 'ALLOW' | 'DENY';

export type PermissionDecision = {
  allowed: boolean;
  reason: string;
};

export type RoutePolicyRule = {
  key: string;
  matches: (pathname: string) => boolean;
  decide: (snapshot: AccessPolicySnapshot, pathname: string) => PermissionDecision;
};

export type ModulePermissionMatrix = Record<PermissionAction, boolean>;

export type EffectivePermissionMap = Record<string, Partial<Record<PermissionAction, PermissionEffect>>>;

export type AccessPolicySnapshot = {
  role: UserRole;
  enabledModules: string[] | null;
  effectivePermissions: EffectivePermissionMap;
  modulePermissions: Record<string, ModulePermissionMatrix>;
  runtimeResolved: boolean;
  effectiveResolved: boolean;
  loadedAt: string | null;
  isReady: boolean;
};

const APPROVAL_PATH_MARKERS = ['/approve', '/reject', '/submit', '/escalate', '/delegate', '/restore', '/reindex', '/pay'];

const STAFF_WRITE_MODULES = new Set<string>(['notifications']);
const STAFF_HARD_DENY_MODULES = new Set<string>(['finance', 'workflows', 'audit']);
const SENSITIVE_MODULES = new Set<string>(['settings', 'finance', 'workflows', 'audit']);
const RUNTIME_TOGGLABLE_MODULES = new Set<string>(ERP_MODULES.filter((moduleKey) => moduleKey !== 'settings') as string[]);

function normalizePath(pathname: string) {
  const clean = String(pathname ?? '').split('#')[0]?.split('?')[0] ?? '';
  return clean || '/';
}

function normalizeModuleKey(moduleKeyRaw: string) {
  return String(moduleKeyRaw ?? '').trim().toLowerCase();
}

function createDeniedMatrix(): ModulePermissionMatrix {
  return {
    VIEW: false,
    CREATE: false,
    UPDATE: false,
    DELETE: false,
    APPROVE: false
  };
}

function createBaselineMatrix(role: UserRole, moduleKey: string): ModulePermissionMatrix {
  const normalizedModule = normalizeModuleKey(moduleKey);
  const canView = hasRoleAtLeast(role, getMinRoleForModule(normalizedModule));
  if (!canView) {
    return createDeniedMatrix();
  }

  if (role === 'ADMIN') {
    return {
      VIEW: true,
      CREATE: true,
      UPDATE: true,
      DELETE: true,
      APPROVE: true
    };
  }

  if (role === 'MANAGER') {
    return {
      VIEW: true,
      CREATE: true,
      UPDATE: true,
      DELETE: false,
      APPROVE: true
    };
  }

  const canWrite = STAFF_WRITE_MODULES.has(normalizedModule);
  return {
    VIEW: true,
    CREATE: canWrite,
    UPDATE: canWrite,
    DELETE: canWrite,
    APPROVE: canWrite
  };
}

function isHardDeniedByRole(role: UserRole, moduleKeyRaw: string) {
  const moduleKey = normalizeModuleKey(moduleKeyRaw);
  if (moduleKey === 'settings' && role !== 'ADMIN') {
    return true;
  }
  if (role === 'STAFF' && STAFF_HARD_DENY_MODULES.has(moduleKey)) {
    return true;
  }
  return false;
}

function normalizeEnabledModules(modules: string[] | null | undefined) {
  if (!Array.isArray(modules)) {
    return null;
  }

  const unique = new Set<string>();
  for (const moduleKey of modules) {
    const normalized = normalizeModuleKey(moduleKey);
    if (normalized) {
      unique.add(normalized);
    }
  }
  return Array.from(unique.values());
}

function collectModuleKeys(effectivePermissions: EffectivePermissionMap) {
  const keys = new Set<string>(ERP_MODULES);
  Object.keys(effectivePermissions).forEach((moduleKey) => {
    const normalized = normalizeModuleKey(moduleKey);
    if (normalized) {
      keys.add(normalized);
    }
  });
  return Array.from(keys.values());
}

export function createAccessPolicySnapshot(args: {
  role: UserRole;
  enabledModules?: string[] | null;
  effectivePermissions?: EffectivePermissionMap;
  runtimeResolved?: boolean;
  effectiveResolved?: boolean;
  loadedAt?: string | null;
}): AccessPolicySnapshot {
  const role = args.role;
  const enabledModules = normalizeEnabledModules(args.enabledModules);
  const effectivePermissions = args.effectivePermissions ?? {};
  const runtimeResolved = args.runtimeResolved === true;
  const effectiveResolved = args.effectiveResolved === true;

  const enabledSet = enabledModules ? new Set(enabledModules) : null;
  const modulePermissions: Record<string, ModulePermissionMatrix> = {};

  for (const moduleKey of collectModuleKeys(effectivePermissions)) {
    const normalizedModule = normalizeModuleKey(moduleKey);
    let matrix = createBaselineMatrix(role, normalizedModule);

    if (isHardDeniedByRole(role, normalizedModule)) {
      matrix = createDeniedMatrix();
    } else {
      const overrides = effectivePermissions[normalizedModule] ?? effectivePermissions[moduleKey] ?? {};
      for (const action of PERMISSION_ACTIONS) {
        const effect = overrides[action];
        if (effect === 'DENY') {
          matrix[action] = false;
        } else if (effect === 'ALLOW') {
          matrix[action] = true;
        }
      }
    }

    if (enabledSet && RUNTIME_TOGGLABLE_MODULES.has(normalizedModule) && !enabledSet.has(normalizedModule)) {
      matrix = createDeniedMatrix();
    }

    modulePermissions[normalizedModule] = matrix;
  }

  return {
    role,
    enabledModules,
    effectivePermissions,
    modulePermissions,
    runtimeResolved,
    effectiveResolved,
    loadedAt: args.loadedAt ?? null,
    isReady: runtimeResolved && effectiveResolved
  };
}

export function parseRuntimeEnabledModules(payload: unknown): string[] | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.enabledModules)) {
    return null;
  }
  return normalizeEnabledModules(record.enabledModules as string[]);
}

export function parseEffectivePermissionMap(payload: unknown): EffectivePermissionMap {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const effective = (payload as Record<string, unknown>).effective;
  if (!Array.isArray(effective)) {
    return {};
  }

  const map: EffectivePermissionMap = {};
  for (const row of effective) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue;
    }

    const record = row as Record<string, unknown>;
    const moduleKey = normalizeModuleKey(String(record.moduleKey ?? ''));
    if (!moduleKey) {
      continue;
    }

    const actionsRaw = record.actions;
    if (!actionsRaw || typeof actionsRaw !== 'object' || Array.isArray(actionsRaw)) {
      continue;
    }

    const actionMap: Partial<Record<PermissionAction, PermissionEffect>> = {};
    for (const action of PERMISSION_ACTIONS) {
      const raw = String((actionsRaw as Record<string, unknown>)[action] ?? '').trim().toUpperCase();
      if (raw === 'ALLOW' || raw === 'DENY') {
        actionMap[action] = raw;
      }
    }

    map[moduleKey] = actionMap;
  }

  return map;
}

export function resolveModuleKeyFromPathname(pathname: string) {
  const normalized = normalizePath(pathname).toLowerCase();
  const match = normalized.match(/^\/modules\/([^/?#]+)/);
  return match ? normalizeModuleKey(match[1]) : null;
}

export function inferPermissionActionFromRequest(methodRaw: HttpMethod | string, pathRaw: string): PermissionAction {
  const method = String(methodRaw ?? '').trim().toUpperCase();
  const path = String(pathRaw ?? '').toLowerCase();

  if (APPROVAL_PATH_MARKERS.some((marker) => path.includes(marker))) {
    return 'APPROVE';
  }
  if (method === 'GET' || method === 'HEAD') {
    return 'VIEW';
  }
  if (method === 'POST') {
    return 'CREATE';
  }
  if (method === 'PUT' || method === 'PATCH') {
    return 'UPDATE';
  }
  if (method === 'DELETE') {
    return 'DELETE';
  }
  return 'VIEW';
}

export function decideModuleAccess(snapshot: AccessPolicySnapshot, moduleKeyRaw: string): PermissionDecision {
  const moduleKey = normalizeModuleKey(moduleKeyRaw);
  if (!moduleKey) {
    return {
      allowed: false,
      reason: 'MODULE_KEY_INVALID'
    };
  }

  if (!snapshot.isReady && SENSITIVE_MODULES.has(moduleKey)) {
    return {
      allowed: false,
      reason: 'POLICY_LOADING'
    };
  }

  const matrix = snapshot.modulePermissions[moduleKey] ?? createBaselineMatrix(snapshot.role, moduleKey);
  if (!matrix.VIEW) {
    return {
      allowed: false,
      reason: 'MODULE_DENIED'
    };
  }

  return {
    allowed: true,
    reason: 'MODULE_ALLOWED'
  };
}

export function decideActionAccess(
  snapshot: AccessPolicySnapshot,
  moduleKeyRaw: string,
  action: PermissionAction
): PermissionDecision {
  const moduleDecision = decideModuleAccess(snapshot, moduleKeyRaw);
  if (!moduleDecision.allowed) {
    return moduleDecision;
  }

  if (!snapshot.isReady && action !== 'VIEW') {
    return {
      allowed: false,
      reason: 'POLICY_LOADING'
    };
  }

  const moduleKey = normalizeModuleKey(moduleKeyRaw);
  const matrix = snapshot.modulePermissions[moduleKey] ?? createBaselineMatrix(snapshot.role, moduleKey);
  return {
    allowed: Boolean(matrix[action]),
    reason: matrix[action] ? 'ACTION_ALLOWED' : 'ACTION_DENIED'
  };
}

const settingsRouteRule: RoutePolicyRule = {
  key: 'settings-admin-only',
  matches: (pathname) => normalizePath(pathname).startsWith('/modules/settings'),
  decide: (snapshot) => ({
    allowed: snapshot.role === 'ADMIN',
    reason: snapshot.role === 'ADMIN' ? 'SETTINGS_ALLOWED' : 'SETTINGS_ADMIN_ONLY'
  })
};

const moduleRouteRule: RoutePolicyRule = {
  key: 'module-access',
  matches: (pathname) => Boolean(resolveModuleKeyFromPathname(pathname)),
  decide: (snapshot, pathname) => {
    const moduleKey = resolveModuleKeyFromPathname(pathname);
    if (!moduleKey) {
      return {
        allowed: true,
        reason: 'MODULE_ROUTE_IGNORED'
      };
    }
    return decideModuleAccess(snapshot, moduleKey);
  }
};

const assistantSubRouteRule: RoutePolicyRule = {
  key: 'assistant-subroute',
  matches: (pathname) => normalizePath(pathname).startsWith('/modules/assistant/'),
  decide: (snapshot, pathname) => {
    const routeKey = resolveAssistantRouteFromPath(normalizePath(pathname));
    if (!routeKey) {
      return {
        allowed: true,
        reason: 'ASSISTANT_ROUTE_DEFAULT'
      };
    }

    const allowed = canAccessAssistantRoute(snapshot.role, routeKey);
    return {
      allowed,
      reason: allowed ? 'ASSISTANT_ROUTE_ALLOWED' : 'ASSISTANT_ROUTE_DENIED'
    };
  }
};

export const ROUTE_POLICY_RULES: RoutePolicyRule[] = [
  settingsRouteRule,
  moduleRouteRule,
  assistantSubRouteRule
];

export function decideRouteAccess(snapshot: AccessPolicySnapshot, pathname: string): PermissionDecision {
  const normalizedPath = normalizePath(pathname);
  if (!normalizedPath.startsWith('/modules/')) {
    return {
      allowed: true,
      reason: 'NON_MODULE_ROUTE'
    };
  }

  for (const rule of ROUTE_POLICY_RULES) {
    if (!rule.matches(normalizedPath)) {
      continue;
    }
    const decision = rule.decide(snapshot, normalizedPath);
    if (!decision.allowed) {
      return decision;
    }
  }

  return {
    allowed: true,
    reason: 'ROUTE_ALLOWED'
  };
}
