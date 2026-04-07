import { ForbiddenException } from '@nestjs/common';
import { CustomerCareStatus, CustomerZaloNickType, UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_USER_CONTEXT_KEY } from '../src/common/request/request.constants';
import { CrmService } from '../src/modules/crm/crm.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      customer: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
      },
    },
  };
}

function makeSearchMock() {
  return {
    shouldUseHybridSearch: vi.fn().mockResolvedValue(false),
    syncCustomerUpsert: vi.fn().mockResolvedValue(undefined),
    syncCustomerDelete: vi.fn().mockResolvedValue(undefined),
    searchCustomerIds: vi.fn().mockResolvedValue(null),
  };
}

function makeRuntimeSettingsMock() {
  return {
    getSalesCrmPolicyRuntime: vi.fn().mockResolvedValue({
      customerTaxonomy: {
        stages: ['MOI', 'DANG_CHAM_SOC', 'DA_MUA'],
        sources: ['ONLINE', 'REFERRAL'],
      },
      tagRegistry: {
        customerTags: ['vip', 'khach_moi'],
        interactionTags: [],
        interactionResultTags: [],
      },
    }),
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
        orgUnitIds: [],
      }),
    };

    const service = new CrmService(
      prisma as any,
      search as any,
      runtimeSettings as any,
      iamScopeFilter as any,
    );

    await service.listCustomers({ limit: 20 } as any);

    expect(iamScopeFilter.resolveForCurrentActor).toHaveBeenCalledWith('crm');
    expect(prisma.client.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerStaffId: { in: ['staff_in_scope_1'] },
        }),
      }),
    );
  });

  it('soft skips customer by setting SAI_SO_KHONG_TON_TAI_BO_QUA_XOA and syncs search', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();

    prisma.client.customer.findFirst
      .mockResolvedValueOnce({
        id: 'cus_1',
        tenant_Id: 'tenant_demo_company',
        status: CustomerCareStatus.MOI_CHUA_TU_VAN,
      })
      .mockResolvedValueOnce({
        id: 'cus_1',
        tenant_Id: 'tenant_demo_company',
        status: CustomerCareStatus.SAI_SO_KHONG_TON_TAI_BO_QUA_XOA,
      });

    const service = new CrmService(
      prisma as any,
      search as any,
      runtimeSettings as any,
    );

    const result = await service.softSkipCustomer('cus_1');

    expect(prisma.client.customer.updateMany).toHaveBeenCalledWith({
      where: { id: 'cus_1' },
      data: {
        status: CustomerCareStatus.SAI_SO_KHONG_TON_TAI_BO_QUA_XOA,
      },
    });
    expect(search.syncCustomerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cus_1',
        status: CustomerCareStatus.SAI_SO_KHONG_TON_TAI_BO_QUA_XOA,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'cus_1',
        status: CustomerCareStatus.SAI_SO_KHONG_TON_TAI_BO_QUA_XOA,
      }),
    );
  });

  it('blocks customer import when actor is not admin', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const cls = {
      get: vi.fn((key: string) =>
        key === AUTH_USER_CONTEXT_KEY
          ? {
              userId: 'manager_1',
              role: UserRole.MANAGER,
            }
          : undefined),
    };

    const service = new CrmService(
      prisma as any,
      search as any,
      runtimeSettings as any,
      undefined,
      cls as any,
    );

    await expect(
      service.importCustomers({
        rows: [{ fullName: 'Khach A', phone: '0901234567' }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('imports customer row and forces customerStage=DA_MUA when status is DONG_Y_CHUYEN_THANH_KH', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const cls = {
      get: vi.fn((key: string) =>
        key === AUTH_USER_CONTEXT_KEY
          ? {
              userId: 'admin_1',
              role: UserRole.ADMIN,
            }
          : undefined),
    };

    prisma.client.customer.findFirst.mockResolvedValue(null);
    prisma.client.customer.create.mockImplementation(async ({ data }: any) => ({
      id: 'cus_created_1',
      tenant_Id: 'tenant_demo_company',
      ...data,
    }));
    prisma.client.customer.findMany.mockResolvedValue([
      {
        id: 'cus_created_1',
        tenant_Id: 'tenant_demo_company',
        status: CustomerCareStatus.DONG_Y_CHUYEN_THANH_KH,
        customerStage: 'DA_MUA',
        zaloNickType: CustomerZaloNickType.GUI_DUOC_TIN_NHAN,
      },
    ]);

    const service = new CrmService(
      prisma as any,
      search as any,
      runtimeSettings as any,
      undefined,
      cls as any,
    );

    const summary = await service.importCustomers({
      rows: [
        {
          fullName: 'Nguyen Van A',
          phone: '0901234567',
          status: 'DONG_Y_CHUYEN_THANH_KH',
          zaloNickType: 'GUI_DUOC_TIN_NHAN',
        },
      ],
    });

    expect(prisma.client.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fullName: 'Nguyen Van A',
          status: CustomerCareStatus.DONG_Y_CHUYEN_THANH_KH,
          customerStage: 'DA_MUA',
          zaloNickType: CustomerZaloNickType.GUI_DUOC_TIN_NHAN,
        }),
      }),
    );
    expect(search.syncCustomerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cus_created_1',
      }),
    );
    expect(summary).toEqual(
      expect.objectContaining({
        totalRows: 1,
        importedCount: 1,
        skippedCount: 0,
      }),
    );
  });
});
