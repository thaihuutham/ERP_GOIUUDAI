import { GenericStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AssetsService } from '../src/modules/assets/assets.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      asset: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      employee: {
        findFirst: vi.fn()
      },
      assetAllocation: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      assetMaintenanceSchedule: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      assetDepreciationEntry: {
        findMany: vi.fn(),
        aggregate: vi.fn(),
        create: vi.fn()
      }
    }
  };
}

describe('AssetsService', () => {
  it('lists assets with cursor pagination + sortable metadata', async () => {
    const prisma = makePrismaMock();
    prisma.client.asset.findMany.mockResolvedValue([
      { id: 'asset_3', name: 'Asset C' },
      { id: 'asset_2', name: 'Asset B' },
      { id: 'asset_1', name: 'Asset A' }
    ]);

    const service = new AssetsService(prisma as any);
    const result = await service.listAssets({
      limit: 2,
      sortBy: 'name',
      sortDir: 'asc'
    } as any);

    expect(prisma.client.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 3
      })
    );
    expect(result.items).toHaveLength(2);
    expect(result.pageInfo).toMatchObject({
      limit: 2,
      hasMore: true,
      nextCursor: 'asset_2'
    });
    expect(result.sortMeta).toMatchObject({
      sortBy: 'name',
      sortDir: 'asc'
    });
  });

  it('lists allocations with cursor pagination + sortable metadata', async () => {
    const prisma = makePrismaMock();
    prisma.client.assetAllocation.findMany.mockResolvedValue([
      { id: 'alloc_3', assetId: 'asset_1', employeeId: 'emp_1', status: GenericStatus.ACTIVE },
      { id: 'alloc_2', assetId: 'asset_1', employeeId: 'emp_2', status: GenericStatus.ACTIVE },
      { id: 'alloc_1', assetId: 'asset_2', employeeId: 'emp_3', status: GenericStatus.ARCHIVED }
    ]);

    const service = new AssetsService(prisma as any);
    const result = await service.listAllocations({
      limit: 2,
      sortBy: 'allocatedAt',
      sortDir: 'desc'
    } as any);

    expect(prisma.client.assetAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ allocatedAt: 'desc' }, { id: 'desc' }],
        take: 3
      })
    );
    expect(result.items).toHaveLength(2);
    expect(result.pageInfo).toMatchObject({
      limit: 2,
      hasMore: true,
      nextCursor: 'alloc_2'
    });
    expect(result.sortMeta).toMatchObject({
      sortBy: 'allocatedAt',
      sortDir: 'desc'
    });
  });

  it('posts monthly depreciation and returns remaining amount', async () => {
    const prisma = makePrismaMock();
    prisma.client.asset.findFirst
      .mockResolvedValueOnce({
        id: 'asset_1',
        value: 1200,
        salvageValue: 0,
        usefulLifeMonths: 12,
        status: GenericStatus.ACTIVE,
        lifecycleStatus: 'IN_USE'
      })
      .mockResolvedValueOnce({
        id: 'asset_1',
        value: 1200,
        salvageValue: 0,
        usefulLifeMonths: 12,
        status: GenericStatus.ACTIVE,
        lifecycleStatus: 'IN_USE'
      });

    prisma.client.assetDepreciationEntry.aggregate.mockResolvedValue({
      _sum: { amount: 200 }
    });
    prisma.client.assetDepreciationEntry.create.mockResolvedValue({
      id: 'dep_1',
      assetId: 'asset_1',
      amount: 100,
      bookValue: 1100
    });

    const service = new AssetsService(prisma as any);
    const result = await service.postDepreciation('asset_1', { period: '2026-03' });

    expect(prisma.client.assetDepreciationEntry.create).toHaveBeenCalled();
    expect(result.bookValue).toBe(900);
    expect(result.remainingDepreciable).toBe(900);
  });

  it('transitions lifecycle to retired and sets inactive status', async () => {
    const prisma = makePrismaMock();
    prisma.client.asset.findFirst
      .mockResolvedValueOnce({
        id: 'asset_2',
        lifecycleStatus: 'IN_USE',
        status: GenericStatus.ACTIVE
      })
      .mockResolvedValueOnce({
        id: 'asset_2',
        lifecycleStatus: 'RETIRED',
        status: GenericStatus.INACTIVE
      });

    const service = new AssetsService(prisma as any);
    const result = await service.transitionLifecycle('asset_2', { action: 'RETIRE' });

    expect(prisma.client.asset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset_2' },
        data: expect.objectContaining({
          lifecycleStatus: 'RETIRED',
          status: GenericStatus.INACTIVE
        })
      })
    );
    expect(result.lifecycleStatus).toBe('RETIRED');
  });
});
