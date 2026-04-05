import { describe, expect, it, vi } from 'vitest';
import { IamScopeService } from '../src/modules/iam/iam-scope.service';

function makeService(options?: {
  overrides?: Array<{ scopeMode: 'SELF' | 'SUBTREE' | 'UNIT_FULL'; rootOrgUnitId: string | null; effectiveFrom?: Date | null; effectiveTo?: Date | null; updatedAt?: Date }>;
  employeePositionId?: string | null;
  positionTitle?: string | null;
}) {
  const prisma = {
    client: {
      iamUserScopeOverride: {
        findMany: vi.fn().mockResolvedValue(options?.overrides ?? [])
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue(
          options?.employeePositionId
            ? {
                positionId: options.employeePositionId
              }
            : null
        )
      },
      position: {
        findFirst: vi.fn().mockResolvedValue(
          options?.positionTitle
            ? {
                title: options.positionTitle
              }
            : null
        )
      }
    }
  };

  return new IamScopeService(prisma as any);
}

describe('IamScopeService', () => {
  it('resolves scope mode from override before title mapping', async () => {
    const service = makeService({
      overrides: [
        {
          scopeMode: 'SUBTREE',
          rootOrgUnitId: 'org-sales',
          effectiveFrom: null,
          effectiveTo: null,
          updatedAt: new Date()
        }
      ],
      employeePositionId: 'pos_1',
      positionTitle: 'Truong phong kinh doanh'
    });

    const scope = await service.resolveEffectiveScope({
      tenantId: 'GOIUUDAI',
      userId: 'user_1',
      employeeId: 'emp_1'
    });

    expect(scope.mode).toBe('SUBTREE');
    expect(scope.source).toBe('override');
    expect(scope.rootOrgUnitId).toBe('org-sales');
  });

  it('resolves title-based defaults when override does not exist', async () => {
    const service = makeService({
      overrides: [],
      employeePositionId: 'pos_2',
      positionTitle: 'Giam doc chi nhanh'
    });

    const scope = await service.resolveEffectiveScope({
      tenantId: 'GOIUUDAI',
      userId: 'user_2',
      employeeId: 'emp_2'
    });

    expect(scope.mode).toBe('UNIT_FULL');
    expect(scope.source).toBe('title');
  });

  it('falls back to SELF when no override and no title mapping', async () => {
    const service = makeService({
      overrides: [],
      employeePositionId: 'pos_3',
      positionTitle: 'Nhan vien kinh doanh'
    });

    const scope = await service.resolveEffectiveScope({
      tenantId: 'GOIUUDAI',
      userId: 'user_3',
      employeeId: 'emp_3'
    });

    expect(scope.mode).toBe('SELF');
    expect(scope.source).toBe('default');
  });
});
