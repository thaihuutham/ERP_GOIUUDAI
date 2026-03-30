import { GenericStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../src/modules/catalog/catalog.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      product: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      }
    }
  };
}

describe('CatalogService', () => {
  it('archives product with soft-delete fields', async () => {
    const prisma = makePrismaMock();
    prisma.client.product.findFirst
      .mockResolvedValueOnce({
        id: 'prod_1',
        status: GenericStatus.ACTIVE,
        archivedAt: null
      })
      .mockResolvedValueOnce({
        id: 'prod_1',
        status: GenericStatus.ARCHIVED,
        archivedAt: new Date('2026-03-28T01:00:00.000Z')
      });

    const service = new CatalogService(prisma as any);
    const result = await service.archiveProduct('prod_1', {});

    expect(prisma.client.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod_1' },
        data: expect.objectContaining({
          status: GenericStatus.ARCHIVED
        })
      })
    );
    expect(result.status).toBe(GenericStatus.ARCHIVED);
    expect(result.archivedAt).toBeTruthy();
  });

  it('updates product pricing policy', async () => {
    const prisma = makePrismaMock();
    prisma.client.product.findFirst
      .mockResolvedValueOnce({
        id: 'prod_2',
        status: GenericStatus.ACTIVE,
        archivedAt: null
      })
      .mockResolvedValueOnce({
        id: 'prod_2',
        status: GenericStatus.ACTIVE,
        archivedAt: null,
        pricePolicyCode: 'RETAIL_V2'
      });

    const service = new CatalogService(prisma as any);
    const result = await service.setPricePolicy('prod_2', {
      policyCode: 'RETAIL_V2',
      unitPrice: 149000
    });

    expect(prisma.client.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod_2' },
        data: expect.objectContaining({
          pricePolicyCode: 'RETAIL_V2'
        })
      })
    );
    expect(result.pricePolicyCode).toBe('RETAIL_V2');
  });
});
