import { CustomerCareStatus, GenericStatus, Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SearchService } from '../src/modules/search/search.service';

function makeConfigMock(values: Record<string, string | undefined>) {
  return {
    get: vi.fn((key: string) => values[key])
  };
}

function makeRuntimeSettingsMock(overrides: Partial<{
  engine: 'sql' | 'meili_hybrid';
  timeoutMs: number;
  indexPrefix: string;
  writeSyncEnabled: boolean;
}> = {}) {
  return {
    getSearchPerformanceRuntime: vi.fn().mockResolvedValue({
      engine: overrides.engine ?? 'sql',
      timeoutMs: overrides.timeoutMs ?? 45000,
      indexPrefix: overrides.indexPrefix ?? 'erp_retail',
      writeSyncEnabled: overrides.writeSyncEnabled ?? false,
      reindexPolicy: {
        autoAfterDeploy: false,
        allowEntity: ['customers', 'orders', 'products', 'all']
      }
    })
  };
}

describe('SearchService', () => {
  it('builds customer Meili filter and returns ranked ids', async () => {
    const config = makeConfigMock({ SEARCH_ENGINE: 'meili_hybrid', MEILI_HOST: 'http://localhost:7700' });
    const prisma = { client: {} };
    const runtimeSettings = makeRuntimeSettingsMock({ engine: 'meili_hybrid' });
    const service = new SearchService(prisma as any, config as any, runtimeSettings as any);
    const index = {
      search: vi.fn().mockResolvedValue({ hits: [{ id: 'cus_2' }, { id: 'cus_1' }] })
    };

    vi.spyOn(service as any, 'isMeiliConfigured').mockReturnValue(true);
    vi.spyOn(service as any, 'ensureIndexes').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'getIndex').mockReturnValue(index);

    const ids = await service.searchCustomerIds('nguyen', 'GOIUUDAI', 20, {
      status: CustomerCareStatus.MOI_CHUA_TU_VAN,
      stage: 'MOI',
      tag: 'vip'
    });

    expect(ids).toEqual(['cus_2', 'cus_1']);
    expect(index.search).toHaveBeenCalledWith(
      'nguyen',
      expect.objectContaining({
        attributesToRetrieve: ['id'],
        limit: 20
      })
    );

    const queryOptions = index.search.mock.calls[0]?.[1] as { filter: string };
    expect(queryOptions.filter).toContain('tenant_Id = "GOIUUDAI"');
    expect(queryOptions.filter).toContain('status = "MOI_CHUA_TU_VAN"');
    expect(queryOptions.filter).toContain('customerStage = "MOI"');
    expect(queryOptions.filter).toContain('tags = "vip"');
  });

  it('maps document payload correctly when syncing customer upsert', async () => {
    const config = makeConfigMock({
      SEARCH_ENGINE: 'sql',
      MEILI_HOST: 'http://localhost:7700',
      MEILI_ENABLE_WRITE_SYNC: 'true'
    });
    const prisma = { client: {} };
    const runtimeSettings = makeRuntimeSettingsMock({ engine: 'sql', writeSyncEnabled: true });
    const service = new SearchService(prisma as any, config as any, runtimeSettings as any);

    const index = {
      addDocuments: vi.fn().mockResolvedValue({ taskUid: 1 })
    };

    vi.spyOn(service as any, 'isMeiliConfigured').mockReturnValue(true);
    vi.spyOn(service as any, 'ensureIndexes').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'getIndex').mockReturnValue(index);

    await service.syncCustomerUpsert({
      id: 'cus_1',
      tenant_Id: 'GOIUUDAI',
      fullName: 'Nguyen Van A',
      email: 'a@example.com',
      phone: '0909000000',
      tags: ['vip'],
      status: CustomerCareStatus.MOI_CHUA_TU_VAN,
      customerStage: 'MOI',
      totalSpent: new Prisma.Decimal('1250000.5'),
      updatedAt: new Date('2026-03-30T09:00:00.000Z')
    });

    expect(index.addDocuments).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'cus_1',
          tenant_Id: 'GOIUUDAI',
          totalSpent: 1250000.5,
          updatedAt: '2026-03-30T09:00:00.000Z'
        })
      ],
      { primaryKey: 'id' }
    );
  });

  it('returns null when Meili query fails so caller can fallback SQL', async () => {
    const config = makeConfigMock({ SEARCH_ENGINE: 'meili_hybrid', MEILI_HOST: 'http://localhost:7700' });
    const prisma = { client: {} };
    const runtimeSettings = makeRuntimeSettingsMock({ engine: 'meili_hybrid' });
    const service = new SearchService(prisma as any, config as any, runtimeSettings as any);
    const index = {
      search: vi.fn().mockRejectedValue(new Error('timeout'))
    };

    vi.spyOn(service as any, 'isMeiliConfigured').mockReturnValue(true);
    vi.spyOn(service as any, 'ensureIndexes').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'getIndex').mockReturnValue(index);

    const ids = await service.searchOrderIds('SO-001', 'GOIUUDAI', 20, {
      status: GenericStatus.PENDING
    });

    expect(ids).toBeNull();
  });
});
