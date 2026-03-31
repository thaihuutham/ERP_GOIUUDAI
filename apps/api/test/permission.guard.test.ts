import { ForbiddenException } from '@nestjs/common';
import { PermissionAction, PermissionEffect } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PermissionGuard } from '../src/common/auth/permission.guard';

function makeContext(path: string, method = 'GET') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        originalUrl: path
      })
    }),
    getHandler: () => ({}),
    getClass: () => ({})
  } as any;
}

function makeGuard(options?: {
  positionRules?: Array<{ moduleKey: string; action: PermissionAction; effect: PermissionEffect }>;
  overrides?: Array<{ moduleKey: string; action: PermissionAction; effect: PermissionEffect }>;
}) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(false)
  };

  const config = {
    get: vi.fn((key: string, fallback?: string) => {
      if (key === 'AUTH_ENABLED') return 'true';
      if (key === 'PERMISSION_ENGINE_ENABLED') return undefined;
      return fallback;
    })
  };

  const clsState: Record<string, unknown> = {
    authUser: {
      userId: 'user_1',
      email: 'staff@erp.local',
      role: 'STAFF',
      positionId: 'pos_1'
    },
    tenantId: 'GOIUUDAI'
  };

  const cls = {
    get: vi.fn((key: string) => clsState[key])
  };

  const prisma = {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      setting: {
        findFirst: vi.fn().mockResolvedValue({
          settingValue: {
            permissionPolicy: {
              enabled: true,
              conflictPolicy: 'DENY_OVERRIDES',
              superAdminIds: [],
              superAdminEmails: []
            }
          }
        })
      },
      positionPermissionRule: {
        findMany: vi.fn().mockResolvedValue(options?.positionRules ?? [])
      },
      userPermissionOverride: {
        findMany: vi.fn().mockResolvedValue(options?.overrides ?? [])
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }
  };

  return new PermissionGuard(reflector as any, config as any, cls as any, prisma as any);
}

describe('PermissionGuard', () => {
  it('falls back to role gate when no granular rules are configured', async () => {
    const guard = makeGuard({
      positionRules: [],
      overrides: []
    });

    await expect(guard.canActivate(makeContext('/api/v1/sales/orders', 'GET'))).resolves.toBe(true);
  });

  it('applies deny-first precedence over allow', async () => {
    const guard = makeGuard({
      positionRules: [
        {
          moduleKey: 'sales',
          action: PermissionAction.VIEW,
          effect: PermissionEffect.ALLOW
        }
      ],
      overrides: [
        {
          moduleKey: 'sales',
          action: PermissionAction.VIEW,
          effect: PermissionEffect.DENY
        }
      ]
    });

    await expect(guard.canActivate(makeContext('/api/v1/sales/orders', 'GET'))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

