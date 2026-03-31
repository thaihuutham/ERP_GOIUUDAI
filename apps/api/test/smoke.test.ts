import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { describe, beforeAll, afterAll, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { makeAuthToken, setupSingleTenantAuthTestEnv } from './auth-test.helper';

describe('API smoke', () => {
  let app: INestApplication;

  beforeAll(async () => {
    setupSingleTenantAuthTestEnv('phase0-test-secret');

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health should be public', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        service: 'erp-api'
      })
    );
  });

  it('GET /api/v1/crm/customers should return 401 for invalid token and keep error shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/crm/customers')
      .set('authorization', 'Bearer invalid.token.value');

    expect(res.status).toBe(401);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 401
        }),
        meta: expect.objectContaining({
          path: '/api/v1/crm/customers',
          method: 'GET',
          requestId: expect.any(String)
        })
      })
    );
  });

  it('PUT /api/v1/settings/config should return 403 for STAFF role', async () => {
    const staffToken = makeAuthToken('STAFF');
    const res = await request(app.getHttpServer())
      .put('/api/v1/settings/config')
      .set('authorization', `Bearer ${staffToken}`)
      .send({
        companyName: 'Blocked Update'
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 403
        }),
        meta: expect.objectContaining({
          path: '/api/v1/settings/config',
          method: 'PUT',
          requestId: expect.any(String)
        })
      })
    );
  });

  it('GET /api/v1/crm/customers should return 401 without token and keep error shape', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/crm/customers');

    expect(res.status).toBe(401);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 401
        }),
        meta: expect.objectContaining({
          path: '/api/v1/crm/customers',
          method: 'GET',
          requestId: expect.any(String)
        })
      })
    );
  });

  it('GET /api/v1/crm/customers should return 401 when token tenant mismatches single-tenant runtime', async () => {
    const mismatchedTenantToken = makeAuthToken('MANAGER', { tenantId: 'tenant_demo_company' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/crm/customers')
      .set('authorization', `Bearer ${mismatchedTenantToken}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 401
        }),
        meta: expect.objectContaining({
          path: '/api/v1/crm/customers',
          method: 'GET',
          requestId: expect.any(String)
        })
      })
    );
  });
});
