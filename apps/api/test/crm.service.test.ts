import { describe, expect, it, vi } from 'vitest';
import { CrmService } from '../src/modules/crm/crm.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      customer: {
        findMany: vi.fn().mockResolvedValue([])
      }
    }
  };
}

function makeSearchMock() {
  return {
    shouldUseHybridSearch: vi.fn().mockResolvedValue(false)
  };
}

function makeRuntimeSettingsMock() {
  return {
    getSalesCrmPolicyRuntime: vi.fn().mockResolvedValue({
      customerTaxonomy: {
        stages: ['MOI', 'DANG_CHAM_SOC', 'CHOT_DON'],
        sources: ['ONLINE', 'REFERRAL']
      },
      tagRegistry: {
        customerTags: ['moi'],
        interactionTags: [],
        interactionResultTags: []
      }
    })
  };
}

describe('CrmService', () => {
  it('applies actor scope filter when listing customers', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const iamScopeFilter = {
      resolveForCurrentActor: vi.fn().mockResolvedValue({
        enabled: true,
        mode: 'LIMITED',
        companyWide: false,
        actorIds: ['staff_in_scope_1'],
        employeeIds: [],
        orgUnitIds: []
      })
    };

    const service = new CrmService(
      prisma as any,
      search as any,
      runtimeSettings as any,
      iamScopeFilter as any
    );

    await service.listCustomers({ limit: 20 } as any);

    expect(iamScopeFilter.resolveForCurrentActor).toHaveBeenCalledWith('crm');
    expect(prisma.client.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerStaffId: { in: ['staff_in_scope_1'] }
        })
      })
    );
  });
});
