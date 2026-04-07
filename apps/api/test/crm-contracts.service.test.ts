import { describe, expect, it, vi } from 'vitest';
import {
  ServiceContractProductType,
  ServiceContractStatus,
  ServiceContractSourceType
} from '@prisma/client';
import { CrmContractsService } from '../src/modules/crm/crm-contracts.service';

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
});
