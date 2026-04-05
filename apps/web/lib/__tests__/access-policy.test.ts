import { describe, expect, it } from 'vitest';
import {
  createAccessPolicySnapshot,
  decideActionAccess,
  decideModuleAccess,
  decideRouteAccess,
  mapRuntimeRoleToAccessRole,
  type EffectivePermissionMap
} from '../access-policy';

function buildSnapshot(args: {
  role: 'STAFF' | 'MANAGER' | 'ADMIN';
  enabledModules?: string[] | null;
  effectivePermissions?: EffectivePermissionMap;
  runtimeResolved?: boolean;
  effectiveResolved?: boolean;
}) {
  return createAccessPolicySnapshot({
    role: args.role,
    enabledModules: args.enabledModules ?? null,
    effectivePermissions: args.effectivePermissions ?? {},
    runtimeResolved: args.runtimeResolved ?? true,
    effectiveResolved: args.effectiveResolved ?? true
  });
}

describe('access policy snapshot merge', () => {
  it('treats MANAGER/STAFF legacy roles as USER in iam v2 mode', () => {
    expect(mapRuntimeRoleToAccessRole('MANAGER', true)).toBe('USER');
    expect(mapRuntimeRoleToAccessRole('STAFF', true)).toBe('USER');
    expect(mapRuntimeRoleToAccessRole('ADMIN', true)).toBe('ADMIN');
    expect(mapRuntimeRoleToAccessRole('MANAGER', false)).toBe('MANAGER');
  });

  it('applies baseline then effective permissions', () => {
    const snapshot = buildSnapshot({
      role: 'MANAGER',
      enabledModules: ['crm', 'sales', 'reports'],
      effectivePermissions: {
        crm: {
          DELETE: 'ALLOW',
          UPDATE: 'DENY'
        }
      }
    });

    expect(decideActionAccess(snapshot, 'crm', 'VIEW').allowed).toBe(true);
    expect(decideActionAccess(snapshot, 'crm', 'CREATE').allowed).toBe(true);
    expect(decideActionAccess(snapshot, 'crm', 'UPDATE').allowed).toBe(false);
    expect(decideActionAccess(snapshot, 'crm', 'DELETE').allowed).toBe(true);
    expect(decideActionAccess(snapshot, 'crm', 'APPROVE').allowed).toBe(true);
  });

  it('keeps hard deny rules for settings and staff restricted modules', () => {
    const managerSnapshot = buildSnapshot({
      role: 'MANAGER',
      enabledModules: ['settings', 'crm'],
      effectivePermissions: {
        settings: {
          VIEW: 'ALLOW',
          UPDATE: 'ALLOW'
        }
      }
    });
    const staffSnapshot = buildSnapshot({
      role: 'STAFF',
      enabledModules: ['finance', 'workflows', 'audit', 'crm'],
      effectivePermissions: {
        finance: {
          VIEW: 'ALLOW',
          APPROVE: 'ALLOW'
        }
      }
    });

    expect(decideModuleAccess(managerSnapshot, 'settings').allowed).toBe(false);
    expect(decideActionAccess(managerSnapshot, 'settings', 'UPDATE').allowed).toBe(false);
    expect(decideModuleAccess(staffSnapshot, 'finance').allowed).toBe(false);
    expect(decideModuleAccess(staffSnapshot, 'workflows').allowed).toBe(false);
    expect(decideModuleAccess(staffSnapshot, 'audit').allowed).toBe(false);
  });

  it('applies runtime-enabled modules as final gate', () => {
    const snapshot = buildSnapshot({
      role: 'MANAGER',
      enabledModules: ['sales'],
      effectivePermissions: {
        crm: {
          VIEW: 'ALLOW',
          CREATE: 'ALLOW'
        }
      }
    });

    expect(decideModuleAccess(snapshot, 'crm').allowed).toBe(false);
    expect(decideModuleAccess(snapshot, 'sales').allowed).toBe(true);
  });

  it('fails safe on sensitive modules while policy is loading', () => {
    const snapshot = buildSnapshot({
      role: 'MANAGER',
      enabledModules: null,
      runtimeResolved: false,
      effectiveResolved: false
    });

    expect(decideModuleAccess(snapshot, 'finance')).toMatchObject({
      allowed: false,
      reason: 'POLICY_LOADING'
    });
    expect(decideModuleAccess(snapshot, 'settings')).toMatchObject({
      allowed: false,
      reason: 'POLICY_LOADING'
    });
    expect(decideModuleAccess(snapshot, 'crm').allowed).toBe(true);
  });
});

describe('access policy route decisions', () => {
  it('denies restricted routes for staff and manager correctly', () => {
    const staffSnapshot = buildSnapshot({
      role: 'STAFF',
      enabledModules: ['crm', 'sales', 'hr', 'reports', 'assistant', 'notifications']
    });
    const managerSnapshot = buildSnapshot({
      role: 'MANAGER',
      enabledModules: ['crm', 'sales', 'finance', 'workflows', 'audit', 'assistant', 'reports']
    });

    expect(decideRouteAccess(staffSnapshot, '/modules/finance').allowed).toBe(false);
    expect(decideRouteAccess(staffSnapshot, '/modules/workflows').allowed).toBe(false);
    expect(decideRouteAccess(staffSnapshot, '/modules/audit').allowed).toBe(false);
    expect(decideRouteAccess(staffSnapshot, '/modules/settings').allowed).toBe(false);
    expect(decideRouteAccess(staffSnapshot, '/modules/assistant/channels').allowed).toBe(false);
    expect(decideRouteAccess(staffSnapshot, '/modules/assistant/runs').allowed).toBe(true);

    expect(decideRouteAccess(managerSnapshot, '/modules/settings').allowed).toBe(false);
    expect(decideRouteAccess(managerSnapshot, '/modules/finance').allowed).toBe(true);
    expect(decideRouteAccess(managerSnapshot, '/modules/workflows').allowed).toBe(true);
  });

  it('allows admin module routes and non-module routes', () => {
    const adminSnapshot = buildSnapshot({
      role: 'ADMIN',
      enabledModules: [
        'crm',
        'sales',
        'catalog',
        'hr',
        'finance',
        'scm',
        'assets',
        'projects',
        'workflows',
        'reports',
        'assistant',
        'audit',
        'settings',
        'notifications'
      ]
    });

    expect(decideRouteAccess(adminSnapshot, '/modules/settings').allowed).toBe(true);
    expect(decideRouteAccess(adminSnapshot, '/modules/audit').allowed).toBe(true);
    expect(decideRouteAccess(adminSnapshot, '/').allowed).toBe(true);
    expect(decideRouteAccess(adminSnapshot, '/profile').allowed).toBe(true);
  });
});
