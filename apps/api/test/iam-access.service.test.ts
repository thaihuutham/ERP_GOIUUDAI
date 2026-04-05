import { PermissionAction, PermissionEffect } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { IamAccessService } from '../src/modules/iam/iam-access.service';

function makeService(effects: PermissionEffect[]) {
  const prisma = {
    client: {
      iamActionGrant: {
        findMany: vi.fn().mockResolvedValue(effects.map((effect, index) => ({
          effect,
          priority: index + 1,
          createdAt: new Date()
        })))
      }
    }
  };

  const scopeService = {
    resolveEffectiveScope: vi.fn().mockResolvedValue({
      mode: 'SELF',
      rootOrgUnitId: null,
      source: 'default'
    })
  };

  return new IamAccessService(prisma as any, scopeService as any);
}

describe('IamAccessService', () => {
  it('applies deny-overrides for action grants', async () => {
    const service = makeService([PermissionEffect.ALLOW, PermissionEffect.DENY]);

    const result = await service.resolveActionDecision(
      {
        tenantId: 'GOIUUDAI',
        userId: 'user_1',
        role: 'USER'
      },
      'crm',
      PermissionAction.VIEW
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('DENY_OVERRIDE');
  });

  it('returns allow when at least one allow and no deny', async () => {
    const service = makeService([PermissionEffect.ALLOW]);

    const result = await service.resolveActionDecision(
      {
        tenantId: 'GOIUUDAI',
        userId: 'user_1',
        role: 'USER'
      },
      'sales',
      PermissionAction.CREATE
    );

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ALLOW_MATCH');
  });

  it('bypasses grant checks for ADMIN', async () => {
    const service = makeService([PermissionEffect.DENY]);

    const result = await service.resolveActionDecision(
      {
        tenantId: 'GOIUUDAI',
        userId: 'admin_1',
        role: 'ADMIN'
      },
      'finance',
      PermissionAction.DELETE
    );

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ADMIN_BYPASS');
  });
});
