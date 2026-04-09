import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  GenericStatus,
  ServiceContractProductType,
  ServiceContractStatus,
  ServiceContractSourceType,
  VehicleKind
} from '@prisma/client';
import { CrmContractsService } from '../src/modules/crm/crm-contracts.service';
import { AUTH_USER_CONTEXT_KEY } from '../src/common/request/request.constants';

function makePrismaMock(contract: Record<string, unknown>) {
  return {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      serviceContract: {
        findFirst: vi.fn().mockResolvedValue(contract)
      }
    }
  };
}

function makeRuntimeSettingsMock(productLeadDays?: number | null) {
  return {
    getSalesCrmPolicyRuntime: vi.fn().mockResolvedValue({
      renewalReminder: {
        globalLeadDays: 30,
        productLeadDays: {
          TELECOM_PACKAGE: productLeadDays ?? null,
          AUTO_INSURANCE: null,
          MOTO_INSURANCE: null,
          DIGITAL_SERVICE: null
        }
      }
    })
  };
}

function makeConfigMock() {
  return {
    get: vi.fn().mockReturnValue(undefined)
  };
}

function makeNotificationsMock() {
  return {
    create: vi.fn().mockResolvedValue(null)
  };
}

function makeClsMock(authUser: Record<string, unknown>) {
  return {
    get: vi.fn((key: string) => (key === AUTH_USER_CONTEXT_KEY ? authUser : undefined))
  };
}

function makeContract(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'contract_1',
    tenant_Id: 'GOIUUDAI',
    customerId: 'cus_1',
    salesOrderId: null,
    productType: ServiceContractProductType.TELECOM_PACKAGE,
    status: ServiceContractStatus.ACTIVE,
    startsAt: new Date('2026-01-01T00:00:00.000Z'),
    endsAt: new Date('2026-05-01T00:00:00.000Z'),
    renewalLeadDaysOverride: null,
    ownerStaffId: null,
    sourceType: ServiceContractSourceType.SALES_ORDER,
    sourceRef: 'SO-1',
    metadataJson: null,
    telecomLine: {
      id: 'line_1',
      tenant_Id: 'GOIUUDAI',
      contractId: 'contract_1',
      servicePhone: '0912345678',
      servicePhoneNormalized: '0912345678',
      packageCode: '3m',
      packageName: 'Goi 3 thang',
      termDays: 90,
      currentExpiryAt: new Date('2026-05-01T00:00:00.000Z'),
      beneficiaryType: 'SELF',
      beneficiaryCustomerId: null,
      beneficiaryName: null,
      beneficiaryPhone: null,
      beneficiaryPhoneNormalized: null,
      beneficiaryRelation: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    },
    ...overrides
  };
}

describe('CrmContractsService', () => {
  it('uses contract lead days override with highest precedence', async () => {
    const contract = makeContract({ renewalLeadDaysOverride: 15 });
    const prisma = makePrismaMock(contract);
    const runtimeSettings = makeRuntimeSettingsMock(45);
    const service = new CrmContractsService(
      prisma as any,
      runtimeSettings as any,
      makeConfigMock() as any,
      makeNotificationsMock() as any
    );

    const preview = await service.renewContractPreview('contract_1', {
      transactionDate: '2026-04-01T00:00:00.000Z',
      termDays: 90
    });

    expect(preview.reminderLeadDays).toBe(15);
  });

  it('falls back to product override when contract override is null', async () => {
    const contract = makeContract({ renewalLeadDaysOverride: null });
    const prisma = makePrismaMock(contract);
    const runtimeSettings = makeRuntimeSettingsMock(45);
    const service = new CrmContractsService(
      prisma as any,
      runtimeSettings as any,
      makeConfigMock() as any,
      makeNotificationsMock() as any
    );

    const preview = await service.renewContractPreview('contract_1', {
      transactionDate: '2026-04-01T00:00:00.000Z',
      termDays: 90
    });

    expect(preview.reminderLeadDays).toBe(45);
  });

  it('falls back to global default when product override is not configured', async () => {
    const contract = makeContract({ renewalLeadDaysOverride: null });
    const prisma = makePrismaMock(contract);
    const runtimeSettings = makeRuntimeSettingsMock(null);
    const service = new CrmContractsService(
      prisma as any,
      runtimeSettings as any,
      makeConfigMock() as any,
      makeNotificationsMock() as any
    );

    const preview = await service.renewContractPreview('contract_1', {
      transactionDate: '2026-04-01T00:00:00.000Z',
      termDays: 90
    });

    expect(preview.reminderLeadDays).toBe(30);
  });

  it('blocks non-admin create vehicle when customer is not owned by actor', async () => {
    const prisma = {
      getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
      client: {
        customer: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'cus_2',
            fullName: 'Khach B',
            ownerStaffId: 'dev_other'
          })
        },
        vehicle: {
          create: vi.fn()
        }
      }
    };

    const service = new CrmContractsService(
      prisma as any,
      makeRuntimeSettingsMock() as any,
      makeConfigMock() as any,
      makeNotificationsMock() as any,
      makeClsMock({ role: 'USER', userId: 'dev_manager' }) as any
    );

    await expect(
      service.createVehicle({
        ownerCustomerId: 'cus_2',
        ownerFullName: 'Khach B',
        plateNumber: '29A-12345',
        chassisNumber: 'CS-01',
        engineNumber: 'EN-01',
        vehicleKind: 'AUTO',
        vehicleType: 'SUV'
      })
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.client.vehicle.create).not.toHaveBeenCalled();
  });

  it('allows admin to update and archive any vehicle (soft delete)', async () => {
    const updatedVehicle = {
      id: 'veh_1',
      ownerCustomerId: 'cus_2',
      status: GenericStatus.ACTIVE,
      ownerCustomer: {
        id: 'cus_2',
        fullName: 'Khach B',
        phone: '0900000000',
        ownerStaffId: 'dev_other'
      }
    };
    const archivedVehicle = {
      ...updatedVehicle,
      status: GenericStatus.ARCHIVED
    };

    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'veh_1',
        ownerCustomerId: 'cus_2',
        ownerCustomer: {
          id: 'cus_2',
          fullName: 'Khach B',
          ownerStaffId: 'dev_other'
        }
      })
      .mockResolvedValueOnce(updatedVehicle)
      .mockResolvedValueOnce({
        id: 'veh_1',
        ownerCustomerId: 'cus_2',
        ownerCustomer: {
          id: 'cus_2',
          ownerStaffId: 'dev_other'
        }
      })
      .mockResolvedValueOnce(archivedVehicle);

    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    const prisma = {
      getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
      client: {
        customer: {
          findFirst: vi.fn()
        },
        vehicle: {
          findFirst,
          updateMany
        }
      }
    };

    const service = new CrmContractsService(
      prisma as any,
      makeRuntimeSettingsMock() as any,
      makeConfigMock() as any,
      makeNotificationsMock() as any,
      makeClsMock({ role: 'ADMIN', userId: 'dev_admin' }) as any
    );

    const updated = await service.updateVehicle('veh_1', {
      vehicleKind: VehicleKind.AUTO,
      vehicleType: 'Sedan',
      ownerFullName: 'Khach B'
    });
    expect(updated.id).toBe('veh_1');

    const archived = await service.archiveVehicle('veh_1');
    expect(archived.status).toBe(GenericStatus.ARCHIVED);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'veh_1' },
      data: expect.objectContaining({ status: GenericStatus.ARCHIVED })
    }));
  });

  it('blocks non-admin import vehicles', async () => {
    const prisma = {
      getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
      client: {
        customer: {
          findFirst: vi.fn()
        },
        vehicle: {
          create: vi.fn()
        }
      }
    };

    const service = new CrmContractsService(
      prisma as any,
      makeRuntimeSettingsMock() as any,
      makeConfigMock() as any,
      makeNotificationsMock() as any,
      makeClsMock({ role: 'USER', userId: 'dev_manager' }) as any
    );

    await expect(
      service.importVehicles({
        rows: [
          {
            ownerCustomerId: 'cus_1',
            ownerFullName: 'Khach A',
            plateNumber: '30A-12345',
            chassisNumber: 'CS-01',
            engineNumber: 'EN-01',
            vehicleKind: 'AUTO',
            vehicleType: 'SUV'
          }
        ]
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admin import vehicles and resolve owner by phone', async () => {
    const customerFindFirst = vi.fn(async (args: any) => {
      if (args?.where?.phoneNormalized) {
        return { id: 'cus_phone_1' };
      }
      if (args?.where?.id) {
        return {
          id: 'cus_phone_1',
          fullName: 'Khach Theo So',
          ownerStaffId: 'dev_other'
        };
      }
      return null;
    });

    const vehicleCreate = vi.fn().mockResolvedValue({ id: 'veh_1' });
    const prisma = {
      getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
      client: {
        customer: {
          findFirst: customerFindFirst
        },
        vehicle: {
          create: vehicleCreate
        }
      }
    };

    const service = new CrmContractsService(
      prisma as any,
      makeRuntimeSettingsMock() as any,
      makeConfigMock() as any,
      makeNotificationsMock() as any,
      makeClsMock({ role: 'ADMIN', userId: 'dev_admin' }) as any
    );

    const result = await service.importVehicles({
      rows: [
        {
          ownerCustomerPhone: '0901234567',
          ownerFullName: 'Khach Theo So',
          plateNumber: '30A-12345',
          chassisNumber: 'CS-01',
          engineNumber: 'EN-01',
          vehicleKind: 'AUTO',
          vehicleType: 'SUV'
        }
      ]
    });

    expect(result.importedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(customerFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { phoneNormalized: '0901234567' },
      select: { id: true }
    }));
    expect(vehicleCreate).toHaveBeenCalledTimes(1);
  });

  it('resolves customer by strict social identity match', async () => {
    const customerFindFirst = vi.fn();
    const prisma = {
      getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
      client: {
        customerSocialIdentity: {
          findFirst: vi.fn().mockResolvedValue({
            customerId: 'cus_social_1'
          })
        },
        customer: {
          findFirst: customerFindFirst
        }
      }
    };

    const service = new CrmContractsService(
      prisma as any,
      makeRuntimeSettingsMock() as any,
      makeConfigMock() as any,
      makeNotificationsMock() as any
    );

    const resolved = await service.resolveCustomerIdForExternalIdentity(
      'ZALO_PERSONAL' as any,
      'uid_123'
    );

    expect(resolved).toBe('cus_social_1');
    expect(customerFindFirst).not.toHaveBeenCalled();
  });

  it('does not fallback to phone when social identity is missing', async () => {
    const customerFindFirst = vi.fn().mockResolvedValue({ id: 'cus_phone_1' });
    const prisma = {
      getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
      client: {
        customerSocialIdentity: {
          findFirst: vi.fn().mockResolvedValue(null)
        },
        customer: {
          findFirst: customerFindFirst
        }
      }
    };

    const service = new CrmContractsService(
      prisma as any,
      makeRuntimeSettingsMock() as any,
      makeConfigMock() as any,
      makeNotificationsMock() as any
    );

    const resolved = await service.resolveCustomerIdForExternalIdentity(
      'ZALO_PERSONAL' as any,
      undefined,
      '0900000000'
    );

    expect(resolved).toBeNull();
    expect(customerFindFirst).not.toHaveBeenCalled();
  });
});
