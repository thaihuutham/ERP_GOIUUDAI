import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { describe, beforeAll, afterAll, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('API smoke', () => {
  let app: INestApplication;
  const makeToken = (role: 'ADMIN' | 'MANAGER' | 'STAFF') =>
    sign(
      {
        sub: `test_${role.toLowerCase()}`,
        userId: `test_${role.toLowerCase()}`,
        email: `${role.toLowerCase()}@example.com`,
        role,
        tenantId: 'tenant_demo_company'
      },
      process.env.JWT_SECRET as string,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ENABLED = 'true';
    process.env.JWT_SECRET = 'phase0-test-secret';
    process.env.PRISMA_SKIP_CONNECT = 'true';

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
    const staffToken = makeToken('STAFF');
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
});
