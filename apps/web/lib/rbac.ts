import type { FeatureAction, HttpMethod } from './module-ui';

export const USER_ROLES = ['STAFF', 'MANAGER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_WEB_ROLE: UserRole = 'MANAGER';

const ROLE_RANK: Record<UserRole, number> = {
  STAFF: 1,
  MANAGER: 2,
  ADMIN: 3
};

const MODULE_MIN_ROLE: Record<string, UserRole> = {
  crm: 'STAFF',
  sales: 'STAFF',
  catalog: 'STAFF',
  hr: 'STAFF',
  finance: 'MANAGER',
  scm: 'STAFF',
  assets: 'STAFF',
  projects: 'STAFF',
  workflows: 'MANAGER',
  reports: 'STAFF',
  assistant: 'STAFF',
  audit: 'MANAGER',
  settings: 'ADMIN',
  notifications: 'STAFF'
};

const STAFF_ALLOWED_WRITE_MODULES = new Set<string>(['notifications']);
const MANAGER_DENY_METHODS = new Set<HttpMethod>(['DELETE']);

export function hasRoleAtLeast(role: UserRole, minRole: UserRole) {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export function getMinRoleForModule(moduleKey: string): UserRole {
  return MODULE_MIN_ROLE[moduleKey] ?? 'STAFF';
}

export function canAccessModule(role: UserRole, moduleKey: string) {
  return hasRoleAtLeast(role, getMinRoleForModule(moduleKey));
}

export function canRunAction(args: {
  role: UserRole;
  moduleKey: string;
  action: FeatureAction;
}) {
  const { role, moduleKey, action } = args;

  if (!canAccessModule(role, moduleKey)) {
    return false;
  }

  if (action.allowedRoles && action.allowedRoles.length > 0) {
    return action.allowedRoles.includes(role);
  }

  if (role === 'ADMIN') {
    return true;
  }

  if (role === 'MANAGER') {
    return !MANAGER_DENY_METHODS.has(action.method);
  }

  if (action.method === 'GET') {
    return true;
  }

  return STAFF_ALLOWED_WRITE_MODULES.has(moduleKey);
}
