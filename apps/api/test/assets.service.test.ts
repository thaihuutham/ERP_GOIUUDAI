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
