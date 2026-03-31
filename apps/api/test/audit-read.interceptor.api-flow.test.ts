import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { makeAuthToken, setupSingleTenantAuthTestEnv } from './auth-test.helper';

describe('Audit read interceptor integration', () => {
  let app: INestApplication;
  let catalogService: CatalogService;
  let prismaService: PrismaService;

  beforeAll(async () => {
    setupSingleTenantAuthTestEnv('audit-read-flow-secret');

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
    catalogService = app.get(CatalogService);
    prismaService = app.get(PrismaService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('emits READ audit log for whitelisted endpoint', async () => {
    const managerToken = makeAuthToken('MANAGER');
    const appendAuditSpy = vi.spyOn(prismaService, 'appendAuditLog').mockResolvedValue();

    vi.spyOn(catalogService, 'getProduct').mockResolvedValue({
      id: 'prd_audit_1',
      sku: 'SKU-AUDIT-001',
      name: 'Audit Product',
      productType: 'PRODUCT',
      unitPrice: 100000,
      status: 'ACTIVE'
    } as any);

    const res = await request(app.getHttpServer())
      .get('/api/v1/catalog/products/prd_audit_1')
      .set('authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(appendAuditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'catalog',
        entityType: 'Product',
        entityId: 'prd_audit_1',
        action: 'READ_PRODUCT_DETAIL',
        operationType: 'READ'
      })
    );
  });

  it('does not emit READ audit log for non-whitelisted endpoint', async () => {
    const managerToken = makeAuthToken('MANAGER');
    const appendAuditSpy = vi.spyOn(prismaService, 'appendAuditLog').mockResolvedValue();

    vi.spyOn(catalogService, 'listProducts').mockResolvedValue({
      items: [],
      pageInfo: {
        hasNextPage: false,
        nextCursor: null
      }
    } as any);

    const res = await request(app.getHttpServer())
      .get('/api/v1/catalog/products')
      .set('authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(appendAuditSpy).not.toHaveBeenCalled();
  });
});
