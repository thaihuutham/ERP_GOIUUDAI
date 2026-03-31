import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { RuntimeSettingsService } from '../src/common/settings/runtime-settings.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchService } from '../src/modules/search/search.service';

describe('Hybrid search API flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let search: SearchService;
  let runtimeSettings: RuntimeSettingsService;

  const makeToken = (role: 'ADMIN' | 'MANAGER' | 'STAFF') =>
    sign(
      {
        sub: `test_${role.toLowerCase()}`,
        userId: `test_${role.toLowerCase()}`,
        email: `${role.toLowerCase()}@example.com`,
        role,
        tenantId: 'GOIUUDAI'
      },
      process.env.JWT_SECRET as string,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ENABLED = 'true';
    process.env.JWT_SECRET = 'search-hybrid-flow-secret';
    process.env.PRISMA_SKIP_CONNECT = 'true';
    process.env.SEARCH_ENGINE = 'meili_hybrid';
    process.env.MEILI_HOST = 'http://localhost:7700';

    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false
    });

    app.setGlobalPrefix('api/v1');
    app.enableCors();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true
      })
    );

    await app.init();

    prisma = app.get(PrismaService);
    search = app.get(SearchService);
    runtimeSettings = app.get(RuntimeSettingsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('uses Meili ranked ids for CRM customers when hybrid search is enabled', async () => {
    const token = makeToken('MANAGER');
    vi.spyOn(runtimeSettings, 'isModuleEnabled').mockResolvedValue(true);
    vi.spyOn(search, 'searchCustomerIds').mockResolvedValue(['cus_2', 'cus_1']);
    vi.spyOn(prisma.client.customer, 'findMany').mockResolvedValue([
      {
        id: 'cus_1',
        tenant_Id: 'GOIUUDAI',
        fullName: 'Nguyen Van A',
        email: 'a@example.com',
        phone: '0909',
        tags: ['vip'],
        status: 'ACTIVE',
        customerStage: 'MOI'
      },
      {
        id: 'cus_2',
        tenant_Id: 'GOIUUDAI',
        fullName: 'Nguyen Van B',
        email: 'b@example.com',
        phone: '0908',
        tags: ['moi'],
        status: 'ACTIVE',
        customerStage: 'MOI'
      }
    ] as any);

    const res = await request(app.getHttpServer())
      .get('/api/v1/crm/customers')
      .query({ q: 'nguyen', limit: 2 })
      .set('authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual(['cus_2', 'cus_1']);
    expect(res.body.nextCursor).toBeNull();
  });

  it('falls back to SQL in Sales when Meili result is unavailable', async () => {
    const token = makeToken('MANAGER');
    vi.spyOn(runtimeSettings, 'isModuleEnabled').mockResolvedValue(true);
    vi.spyOn(search, 'searchOrderIds').mockResolvedValue(null);
    const findManySpy = vi.spyOn(prisma.client.order, 'findMany').mockResolvedValue([
      {
        id: 'ord_1',
        tenant_Id: 'GOIUUDAI',
        orderNo: 'SO-001',
        customerName: 'Nguyen Van A',
        status: 'PENDING',
        items: []
      }
    ] as any);

    const res = await request(app.getHttpServer())
      .get('/api/v1/sales/orders')
      .query({ q: 'SO-001' })
      .set('authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items[0]?.id).toBe('ord_1');
    const where = findManySpy.mock.calls[0]?.[0]?.where as { OR?: unknown[] };
    expect(Array.isArray(where.OR)).toBe(true);
  });

  it('uses Meili ranked ids for Catalog products while keeping response contract', async () => {
    const token = makeToken('MANAGER');
    vi.spyOn(runtimeSettings, 'isModuleEnabled').mockResolvedValue(true);
    vi.spyOn(search, 'searchProductIds').mockResolvedValue(['prod_2', 'prod_1']);
    vi.spyOn(prisma.client.product, 'findMany').mockResolvedValue([
      {
        id: 'prod_1',
        tenant_Id: 'GOIUUDAI',
        sku: 'SKU-1',
        name: 'Product 1',
        productType: 'goods',
        categoryPath: 'A/B',
        unitPrice: 100,
        status: 'ACTIVE',
        archivedAt: null,
        variantOf: null,
        variants: []
      },
      {
        id: 'prod_2',
        tenant_Id: 'GOIUUDAI',
        sku: 'SKU-2',
        name: 'Product 2',
        productType: 'goods',
        categoryPath: 'A/B',
        unitPrice: 200,
        status: 'ACTIVE',
        archivedAt: null,
        variantOf: null,
        variants: []
      }
    ] as any);

    const res = await request(app.getHttpServer())
      .get('/api/v1/catalog/products')
      .query({ q: 'product', limit: 2 })
      .set('authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.map((item: { id: string }) => item.id)).toEqual(['prod_2', 'prod_1']);
  });
});
