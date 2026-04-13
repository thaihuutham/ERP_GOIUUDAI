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
  it('lists products with cursor pagination + sort metadata', async () => {
    const prisma = makePrismaMock();
    const search = {
      shouldUseHybridSearch: vi.fn().mockResolvedValue(false),
      searchProductIds: vi.fn(),
      syncProductUpsert: vi.fn().mockResolvedValue(undefined)
    };
    prisma.client.product.findMany.mockResolvedValue([
      { id: 'prod_3', name: 'C Product' },
      { id: 'prod_2', name: 'B Product' },
      { id: 'prod_1', name: 'A Product' }
    ]);

    const service = new CatalogService(prisma as any, search as any);
    const result = await service.listProducts(
      {
        limit: 2,
        cursor: 'prod_4',
        sortBy: 'name',
        sortDir: 'asc'
      } as any,
      undefined
    );

    expect(prisma.client.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        cursor: { id: 'prod_4' },
        skip: 1,
        take: 3
      })
    );
    expect(result.items).toHaveLength(2);
    expect(result.pageInfo).toMatchObject({
      limit: 2,
      hasMore: true,
      nextCursor: 'prod_2'
    });
    expect(result.sortMeta).toMatchObject({
      sortBy: 'name',
      sortDir: 'asc'
    });
  });

  it('archives product with soft-delete fields', async () => {
    const prisma = makePrismaMock();
    const search = { syncProductUpsert: vi.fn().mockResolvedValue(undefined) };
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

    const service = new CatalogService(prisma as any, search as any);
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
    expect(search.syncProductUpsert).toHaveBeenCalled();
  });

  it('updates product pricing policy', async () => {
    const prisma = makePrismaMock();
    const search = { syncProductUpsert: vi.fn().mockResolvedValue(undefined) };
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

    const service = new CatalogService(prisma as any, search as any);
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
    expect(search.syncProductUpsert).toHaveBeenCalled();
  });

  it('imports products by upserting with sku', async () => {
    const prisma = makePrismaMock();
    const search = {
      shouldUseHybridSearch: vi.fn(),
      searchProductIds: vi.fn(),
      syncProductUpsert: vi.fn().mockResolvedValue(undefined)
    };

    prisma.client.product.findFirst
      .mockResolvedValueOnce({
        id: 'prod_existing',
        sku: 'SKU-001',
        status: GenericStatus.ACTIVE,
        archivedAt: null
      })
      .mockResolvedValueOnce(null);

    prisma.client.product.create.mockResolvedValue({
      id: 'prod_new',
      sku: 'SKU-NEW-001'
    });

    prisma.client.product.findMany.mockResolvedValue([
      { id: 'prod_existing', sku: 'SKU-001' },
      { id: 'prod_new', sku: 'SKU-NEW-001' }
    ]);

    const service = new CatalogService(prisma as any, search as any);
    const result = await service.importProducts({
      rows: [
        {
          sku: 'SKU-001',
          name: 'Updated product name',
          unitPrice: 1200000
        },
        {
          sku: 'SKU-NEW-001',
          name: 'New product',
          productType: 'PRODUCT',
          unitPrice: 500000
        },
        {
          name: 'Missing SKU row',
          productType: 'SERVICE',
          unitPrice: 100000
        }
      ]
    });

    expect(prisma.client.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod_existing' },
        data: expect.objectContaining({
          name: 'Updated product name'
        })
      })
    );
    expect(prisma.client.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sku: 'SKU-NEW-001',
          name: 'New product'
        })
      })
    );
    expect(result).toMatchObject({
      totalRows: 3,
      importedCount: 2,
      skippedCount: 1
    });
    expect(result.errors[0]?.message).toContain('Thiếu SKU');
    expect(search.syncProductUpsert).toHaveBeenCalledTimes(2);
  });
});
