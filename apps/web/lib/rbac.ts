import type { FeatureAction, HttpMethod } from './module-ui';

export const USER_ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_WEB_ROLE: UserRole = 'USER';

const ROLE_RANK: Record<UserRole, number> = {
  USER: 1,
  ADMIN: 2
};

const MODULE_MIN_ROLE: Record<string, UserRole> = {
  crm: 'USER',
  sales: 'USER',
  catalog: 'USER',
  hr: 'USER',
  finance: 'USER',
  scm: 'USER',
  assets: 'USER',
  projects: 'USER',
  workflows: 'USER',
  reports: 'USER',
  assistant: 'USER',
  audit: 'USER',
  settings: 'ADMIN',
  notifications: 'USER'
};

const USER_ALLOWED_WRITE_MODULES = new Set<string>(['notifications']);

export function hasRoleAtLeast(role: UserRole, minRole: UserRole) {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export function getMinRoleForModule(moduleKey: string): UserRole {
  return MODULE_MIN_ROLE[moduleKey] ?? 'USER';
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
    const normalizedAllowedRoles = action.allowedRoles.map((item) => {
      const normalized = String(item ?? '').toUpperCase();
      return normalized === 'ADMIN' ? 'ADMIN' : 'USER';
    });
    return normalizedAllowedRoles.includes(role);
  }

  if (role === 'ADMIN') {
    return true;
  }

  if (action.method === 'GET') {
    return true;
  }

  return USER_ALLOWED_WRITE_MODULES.has(moduleKey);
}
