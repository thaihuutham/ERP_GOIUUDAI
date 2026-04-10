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
  role: 'USER' | 'ADMIN';
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
  it('maps runtime role to access role in admin/user model', () => {
    expect(mapRuntimeRoleToAccessRole('USER', true)).toBe('USER');
    expect(mapRuntimeRoleToAccessRole('USER', false)).toBe('USER');
    expect(mapRuntimeRoleToAccessRole('ADMIN', true)).toBe('ADMIN');
    expect(mapRuntimeRoleToAccessRole('ADMIN', false)).toBe('ADMIN');
  });

  it('applies baseline then effective permissions', () => {
    const snapshot = buildSnapshot({
      role: 'USER',
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

  it('keeps hard deny rules for settings', () => {
    const userSnapshot = buildSnapshot({
      role: 'USER',
      enabledModules: ['settings', 'crm'],
      effectivePermissions: {
        settings: {
          VIEW: 'ALLOW',
          UPDATE: 'ALLOW'
        }
      }
    });

    expect(decideModuleAccess(userSnapshot, 'settings').allowed).toBe(false);
    expect(decideActionAccess(userSnapshot, 'settings', 'UPDATE').allowed).toBe(false);
  });

  it('applies runtime-enabled modules as final gate', () => {
    const snapshot = buildSnapshot({
      role: 'USER',
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
      role: 'USER',
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
  it('denies settings for USER while keeping assistant routes available', () => {
    const userSnapshot = buildSnapshot({
      role: 'USER',
      enabledModules: ['crm', 'sales', 'finance', 'workflows', 'audit', 'assistant', 'reports', 'notifications']
    });

    expect(decideRouteAccess(userSnapshot, '/modules/settings').allowed).toBe(false);
    expect(decideRouteAccess(userSnapshot, '/modules/assistant/channels').allowed).toBe(true);
    expect(decideRouteAccess(userSnapshot, '/modules/assistant/runs').allowed).toBe(true);
    expect(decideRouteAccess(userSnapshot, '/modules/finance').allowed).toBe(true);
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
