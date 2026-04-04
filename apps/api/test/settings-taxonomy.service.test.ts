import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../src/modules/settings/settings.service';

function makeServiceHarness() {
  const settingsPolicy = {
    getDomain: vi.fn(),
    updateDomain: vi.fn(),
    syncFromLegacySystemConfig: vi.fn(),
    getCenter: vi.fn(),
    getLayoutMetadata: vi.fn(),
    validateDomain: vi.fn(),
    testConnection: vi.fn(),
    listAudit: vi.fn(),
    createSnapshot: vi.fn(),
    listSnapshots: vi.fn(),
    restoreSnapshot: vi.fn(),
    buildLegacySystemConfig: vi.fn()
  };

  const prisma = {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      customer: {
        groupBy: vi.fn(),
        count: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn()
      },
      customerInteraction: {
        count: vi.fn(),
        updateMany: vi.fn()
      },
      setting: {
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      notification: {
        count: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn()
      },
      auditLog: {
        count: vi.fn(),
        deleteMany: vi.fn()
      },
      $transaction: vi.fn()
    }
  };

  const search = {
    getStatus: vi.fn(),
    reindex: vi.fn()
  };

  const runtimeSettings = {
    getWebRuntime: vi.fn(),
    getSearchPerformanceRuntime: vi.fn(),
    getDataGovernanceRuntime: vi.fn()
  };

  const auditArchive = {
    runArchiveAndPrune: vi.fn()
  };

  const service = new SettingsService(
    prisma as any,
    search as any,
    settingsPolicy as any,
    runtimeSettings as any,
    auditArchive as any
  );

  return {
    service,
    prisma,
    settingsPolicy
  };
}

describe('SettingsService sales taxonomy management', () => {
  it('returns usage statistics for stages and sources', async () => {
    const { service, prisma, settingsPolicy } = makeServiceHarness();

    settingsPolicy.getDomain.mockResolvedValue({
      domain: 'sales_crm_policies',
      data: {
        customerTaxonomy: {
          stages: ['MOI', 'DANG_CHAM_SOC'],
          sources: ['ONLINE', 'REFERRAL']
        }
      }
    });

    prisma.client.customer.groupBy
      .mockResolvedValueOnce([
        { customerStage: 'MOI', _count: { _all: 2 } },
        { customerStage: 'DANG_CHAM_SOC', _count: { _all: 1 } }
      ])
      .mockResolvedValueOnce([
        { source: 'ONLINE', _count: { _all: 3 } }
      ]);

    const result = await service.getSalesTaxonomyOverview();

    expect(result.stages).toEqual([
      { id: 'stages:MOI', value: 'MOI', usageCount: 2, canDelete: false },
      { id: 'stages:DANG_CHAM_SOC', value: 'DANG_CHAM_SOC', usageCount: 1, canDelete: false }
    ]);
    expect(result.sources).toEqual([
      { id: 'sources:ONLINE', value: 'ONLINE', usageCount: 3, canDelete: false },
      { id: 'sources:REFERRAL', value: 'REFERRAL', usageCount: 0, canDelete: true }
    ]);
  });

  it('blocks deleting taxonomy value when data is in use', async () => {
    const { service, prisma, settingsPolicy } = makeServiceHarness();

    settingsPolicy.getDomain.mockResolvedValue({
      domain: 'sales_crm_policies',
      data: {
        customerTaxonomy: {
          stages: ['MOI'],
          sources: ['ONLINE']
        }
      }
    });

    prisma.client.customer.count.mockResolvedValue(4);

    await expect(service.deleteSalesTaxonomyItem('stages', 'MOI', {})).rejects.toThrow(
      "Không thể xóa 'MOI' vì đang có 4 khách hàng sử dụng giá trị này."
    );
    expect(settingsPolicy.updateDomain).not.toHaveBeenCalled();
  });

  it('renames taxonomy and migrates customers', async () => {
    const { service, prisma, settingsPolicy } = makeServiceHarness();

    settingsPolicy.getDomain.mockResolvedValue({
      domain: 'sales_crm_policies',
      data: {
        customerTaxonomy: {
          stages: ['MOI', 'DANG_CHAM_SOC'],
          sources: ['ONLINE']
        }
      }
    });

    prisma.client.customer.updateMany.mockResolvedValue({ count: 7 });
    prisma.client.customer.groupBy
      .mockResolvedValueOnce([
        { customerStage: 'DANG_TU_VAN', _count: { _all: 7 } },
        { customerStage: 'DANG_CHAM_SOC', _count: { _all: 1 } }
      ])
      .mockResolvedValueOnce([
        { source: 'ONLINE', _count: { _all: 2 } }
      ]);

    const result = await service.renameSalesTaxonomyItem('stages', 'MOI', {
      nextValue: 'DANG_TU_VAN',
      reasonTemplate: 'Chuẩn hóa taxonomy'
    });

    expect(prisma.client.customer.updateMany).toHaveBeenCalledWith({
      where: { customerStage: 'MOI' },
      data: { customerStage: 'DANG_TU_VAN' }
    });
    expect(settingsPolicy.updateDomain).toHaveBeenCalledTimes(2);
    expect(result.migratedCount).toBe(7);
    expect(result.value).toBe('DANG_TU_VAN');
  });

  it('returns CRM tag registry overview with usage counters', async () => {
    const { service, prisma, settingsPolicy } = makeServiceHarness();

    settingsPolicy.getDomain.mockResolvedValue({
      domain: 'sales_crm_policies',
      data: {
        tagRegistry: {
          customerTags: ['vip'],
          interactionTags: ['quan_tam'],
          interactionResultTags: ['da_mua']
        }
      }
    });

    prisma.client.customer.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    prisma.client.customerInteraction.count.mockResolvedValueOnce(4);

    const result = await service.getCrmTagRegistryOverview();

    expect(result.customerTags).toEqual([
      { id: 'customerTags:vip', value: 'vip', usageCount: 5, canDelete: false }
    ]);
    expect(result.interactionTags).toEqual([
      { id: 'interactionTags:quan_tam', value: 'quan_tam', usageCount: 3, canDelete: false }
    ]);
    expect(result.interactionResultTags).toEqual([
      { id: 'interactionResultTags:da_mua', value: 'da_mua', usageCount: 4, canDelete: false }
    ]);
  });

  it('renames interaction result tag and migrates customer/interactions', async () => {
    const { service, prisma, settingsPolicy } = makeServiceHarness();

    settingsPolicy.getDomain.mockResolvedValue({
      domain: 'sales_crm_policies',
      data: {
        tagRegistry: {
          customerTags: ['vip'],
          interactionTags: ['quan_tam'],
          interactionResultTags: ['da_mua', 'khong_phan_hoi']
        }
      }
    });

    prisma.client.customerInteraction.updateMany.mockResolvedValue({ count: 2 });
    prisma.client.customer.findMany.mockResolvedValue([
      { id: 'cust_1', tags: ['vip', 'da_mua'] }
    ]);
    prisma.client.customer.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.customer.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    prisma.client.customerInteraction.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const result = await service.renameCrmTagRegistryItem('interactionResultTags', 'da_mua', {
      nextValue: 'chot_thanh_cong',
      reasonTemplate: 'Migrate result tag'
    });

    expect(prisma.client.customerInteraction.updateMany).toHaveBeenCalledWith({
      where: { resultTag: 'da_mua' },
      data: { resultTag: 'chot_thanh_cong' }
    });
    expect(prisma.client.customer.updateMany).toHaveBeenCalledWith({
      where: { id: 'cust_1' },
      data: { tags: ['vip', 'chot_thanh_cong'] }
    });
    expect(result.value).toBe('chot_thanh_cong');
    expect(result.migratedCount).toBe(3);
  });
});
