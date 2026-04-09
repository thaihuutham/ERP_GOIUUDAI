import { ForbiddenException } from '@nestjs/common';
import { CustomerCareStatus, CustomerZaloNickType, UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_USER_CONTEXT_KEY } from '../src/common/request/request.constants';
import { CrmService } from '../src/modules/crm/crm.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      setting: {
        findFirst: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'setting_1' }),
      },
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

  it('applies customFilter in database query and skips hybrid branch', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    search.shouldUseHybridSearch.mockResolvedValue(true);

    const service = new CrmService(
      prisma as any,
      search as any,
      runtimeSettings as any,
    );

    await service.listCustomers(
      { limit: 20, q: 'bao hiem' } as any,
      {
        customFilter: JSON.stringify({
          logic: 'AND',
          conditions: [
            { field: 'vehicleKinds', operator: 'equals', value: 'AUTO' },
            { field: 'insurancePolicyNumbers', operator: 'contains', value: 'GCN-01' },
          ],
        }),
      },
    );

    expect(search.searchCustomerIds).not.toHaveBeenCalled();
    expect(prisma.client.customer.findMany).toHaveBeenCalledTimes(1);

    const findManyArgs = prisma.client.customer.findMany.mock.calls[0][0];
    const whereString = JSON.stringify(findManyArgs.where);
    expect(whereString).toContain('"vehicleKind":"AUTO"');
    expect(whereString).toContain('"soGCN"');
    expect(whereString).toContain('"contains":"GCN-01"');
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
              role: UserRole.USER,
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

  it('blocks customer import preview when actor is not admin', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const cls = {
      get: vi.fn((key: string) =>
        key === AUTH_USER_CONTEXT_KEY
          ? {
              userId: 'manager_1',
              role: UserRole.USER,
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
      service.previewCustomerImport({
        rows: [{ fullName: 'Khach A', phone: '0901234567' }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('previews customer import without writing database changes', async () => {
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

    prisma.client.customer.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.phoneNormalized === '0909999999') {
        return {
          id: 'cus_existing_1',
          fullName: 'Khach cu',
          phone: '0909999999',
          phoneNormalized: '0909999999',
          email: null,
          emailNormalized: null,
          customerStage: 'MOI',
          source: 'ONLINE',
          segment: null,
          ownerStaffId: null,
          consentStatus: null,
          tags: [],
          status: CustomerCareStatus.MOI_CHUA_TU_VAN,
          zaloNickType: CustomerZaloNickType.CHUA_KIEM_TRA,
          totalSpent: null,
          totalOrders: 0,
          lastOrderAt: null,
          lastContactAt: null,
        } as any;
      }
      return null;
    });

    const service = new CrmService(
      prisma as any,
      search as any,
      runtimeSettings as any,
      undefined,
      cls as any,
    );

    const preview = await service.previewCustomerImport({
      rows: [
        {
          fullName: 'Khach moi',
          phone: '0901234567',
          source: 'ONLINE',
        },
        {
          fullName: 'Khach cu',
          phone: '0909999999',
          status: 'DANG_SUY_NGHI',
        },
        {
          fullName: 'Khong hop le',
        },
      ],
    });

    expect(preview).toEqual(
      expect.objectContaining({
        totalRows: 3,
        validRows: 2,
        wouldCreateCount: 1,
        wouldUpdateCount: 1,
        skippedCount: 1,
      }),
    );
    expect(preview.errors).toHaveLength(1);
    expect(prisma.client.customer.updateMany).not.toHaveBeenCalled();
    expect(prisma.client.customer.create).not.toHaveBeenCalled();
    expect(search.syncCustomerUpsert).not.toHaveBeenCalled();
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

  it('stores customer saved filters by current actor and toggles default filter', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const cls = {
      get: vi.fn((key: string) =>
        key === AUTH_USER_CONTEXT_KEY
          ? {
              userId: 'staff_42',
              role: UserRole.USER,
              email: 'staff42@local.erp',
            }
          : undefined),
    };

    prisma.client.setting.findFirst.mockResolvedValue(null);
    const service = new CrmService(
      prisma as any,
      search as any,
      runtimeSettings as any,
      undefined,
      cls as any,
    );

    const upsertResult = await service.upsertCustomerSavedFilter({
      name: 'Khach da mua gan day',
      logic: 'AND',
      isDefault: true,
      conditions: [
        {
          field: 'status',
          operator: 'equals',
          value: 'DONG_Y_CHUYEN_THANH_KH',
        },
      ],
    });

    expect(upsertResult.defaultFilterId).toBeTruthy();
    expect(upsertResult.items).toHaveLength(1);
    expect(upsertResult.items[0]?.isDefault).toBe(true);

    expect(prisma.client.setting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settingKey: expect.stringMatching(/^crm\.customers\.filters\.v1\.staff_42$/),
        }),
      }),
    );
  });

  it('deletes customer saved filter and clears default when target is default', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const cls = {
      get: vi.fn((key: string) =>
        key === AUTH_USER_CONTEXT_KEY
          ? {
              userId: 'manager_1',
              role: UserRole.USER,
              email: 'manager_1@local.erp',
            }
          : undefined),
    };

    prisma.client.setting.findFirst.mockResolvedValueOnce({
      id: 'setting_1',
      settingValue: {
        version: 1,
        defaultFilterId: 'filter_default',
        filters: [
          {
            id: 'filter_default',
            name: 'Default filter',
            logic: 'AND',
            conditions: [
              { field: 'status', operator: 'equals', value: 'MOI_CHUA_TU_VAN' },
            ],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      },
    });
    prisma.client.setting.findFirst.mockResolvedValueOnce({ id: 'setting_1' });

    const service = new CrmService(
      prisma as any,
      search as any,
      runtimeSettings as any,
      undefined,
      cls as any,
    );

    const result = await service.deleteCustomerSavedFilter('filter_default');
    expect(result.items).toHaveLength(0);
    expect(result.defaultFilterId).toBeNull();
    expect(prisma.client.setting.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'setting_1' },
      }),
    );
  });
});
