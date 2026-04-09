import { ForbiddenException } from '@nestjs/common';
import { PermissionAction, PermissionEffect } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PermissionGuard } from '../src/common/auth/permission.guard';
import { IamShadowLogPayload, IamShadowLogService } from '../src/modules/iam/iam-shadow-log.service';
import { IamShadowReportService } from '../src/modules/iam/iam-shadow-report.service';

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
  iamAllowed?: boolean;
  iamMode?: 'OFF' | 'SHADOW' | 'ENFORCE';
  iamEnabled?: boolean;
  iamEnforcementModules?: string[];
  iamShadowLog?: { logLegacyVsIam: (payload: IamShadowLogPayload) => void };
}) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(false)
  };

  const config = {
    get: vi.fn((key: string, fallback?: string) => {
      if (key === 'AUTH_ENABLED') return 'true';
      if (key === 'PERMISSION_ENGINE_ENABLED') return undefined;
      if (key === 'IAM_V2_ENABLED') return undefined;
      return fallback;
    })
  };

  const clsState: Record<string, unknown> = {
    authUser: {
      userId: 'user_1',
      email: 'staff@erp.local',
      role: 'USER',
      positionId: 'pos_1',
      employeeId: 'emp_1'
    },
    tenantId: 'GOIUUDAI'
  };

  const cls = {
    get: vi.fn((key: string) => clsState[key]),
    set: vi.fn()
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
            },
            iamV2: {
              enabled: options?.iamEnabled ?? false,
              mode: options?.iamMode ?? 'SHADOW',
              enforcementModules: options?.iamEnforcementModules ?? ['sales'],
              protectAdminCore: true,
              denySelfElevation: true
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
      userPositionAssignment: {
        findMany: vi.fn().mockResolvedValue([])
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }
  };

  const iamAccess = {
    resolveActionDecision: vi.fn().mockResolvedValue({
      allowed: options?.iamAllowed ?? true,
      reason: (options?.iamAllowed ?? true) ? 'ALLOW_MATCH' : 'DENY_OVERRIDE'
    })
  };

  const iamShadowLog = options?.iamShadowLog ?? {
    logLegacyVsIam: vi.fn()
  };

  const guard = new PermissionGuard(
    reflector as any,
    config as any,
    cls as any,
    prisma as any,
    iamAccess as any,
    iamShadowLog as any,
    {
      resolveScopeAccess: vi.fn().mockResolvedValue({
        mode: 'SELF',
        source: 'default',
        companyWide: false,
        actorIds: ['user_1'],
        employeeIds: ['emp_1'],
        orgUnitIds: ['org_1']
      })
    } as any
  );

  return {
    guard,
    iamAccess,
    iamShadowLog
  };
}

describe('PermissionGuard', () => {
  it('falls back to role gate when no granular rules are configured', async () => {
    const { guard } = makeGuard({
      positionRules: [],
      overrides: []
    });

    await expect(guard.canActivate(makeContext('/api/v1/sales/orders', 'GET'))).resolves.toBe(true);
  });

  it('applies deny-first precedence over allow', async () => {
    const { guard } = makeGuard({
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

  it('denies when legacy allows but iam v2 denies in ENFORCE mode', async () => {
    const { guard } = makeGuard({
      positionRules: [
        {
          moduleKey: 'sales',
          action: PermissionAction.VIEW,
          effect: PermissionEffect.ALLOW
        }
      ],
      overrides: [],
      iamEnabled: true,
      iamMode: 'ENFORCE',
      iamAllowed: false,
      iamEnforcementModules: ['sales']
    });

    await expect(guard.canActivate(makeContext('/api/v1/sales/orders', 'GET'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows but logs mismatch in SHADOW mode', async () => {
    const { guard, iamShadowLog } = makeGuard({
      positionRules: [
        {
          moduleKey: 'sales',
          action: PermissionAction.VIEW,
          effect: PermissionEffect.ALLOW
        }
      ],
      overrides: [],
      iamEnabled: true,
      iamMode: 'SHADOW',
      iamAllowed: false,
      iamEnforcementModules: ['sales']
    });

    await expect(guard.canActivate(makeContext('/api/v1/sales/orders', 'GET'))).resolves.toBe(true);
    expect(iamShadowLog.logLegacyVsIam).toHaveBeenCalledTimes(1);
  });

  it('applies iam v2 to all modules when enforcementModules contains ALL token', async () => {
    const { guard } = makeGuard({
      positionRules: [
        {
          moduleKey: 'sales',
          action: PermissionAction.VIEW,
          effect: PermissionEffect.ALLOW
        }
      ],
      overrides: [],
      iamEnabled: true,
      iamMode: 'ENFORCE',
      iamAllowed: false,
      iamEnforcementModules: ['*']
    });

    await expect(guard.canActivate(makeContext('/api/v1/sales/orders', 'GET'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records legacy vs iam decision mismatches with module/action dimensions', async () => {
    const shadowReport = new IamShadowReportService();
    const shadowLog = new IamShadowLogService(shadowReport);
    const { guard } = makeGuard({
      positionRules: [
        {
          moduleKey: 'crm',
          action: PermissionAction.VIEW,
          effect: PermissionEffect.ALLOW
        }
      ],
      overrides: [],
      iamEnabled: true,
      iamMode: 'SHADOW',
      iamAllowed: false,
      iamEnforcementModules: ['crm'],
      iamShadowLog: shadowLog
    });

    await expect(guard.canActivate(makeContext('/api/v1/crm/customers', 'GET'))).resolves.toBe(true);

    const report = shadowReport.getMismatchReport({
      tenantId: 'GOIUUDAI'
    });
    expect(report.items[0]).toEqual(
      expect.objectContaining({
        moduleKey: 'crm',
        action: PermissionAction.VIEW
      })
    );
  });
});
