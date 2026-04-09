import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ZaloService } from '../src/modules/zalo/zalo.service';
import { makeAuthToken, setupSingleTenantAuthTestEnv } from './auth-test.helper';

describe('Zalo API flow integration', () => {
  let app: INestApplication;
  let zaloService: ZaloService;

  beforeAll(async () => {
    setupSingleTenantAuthTestEnv('phase-zalo-api-flow-secret');

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
    zaloService = app.get(ZaloService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('executes sync-contacts endpoint', async () => {
    const managerToken = makeAuthToken('ADMIN');
    vi.spyOn(zaloService, 'syncContacts').mockResolvedValue({
      success: true,
      accountId: 'acc_personal_1',
      totalContacts: 12,
      created: 5,
      updated: 7,
      skippedNoPhone: 0,
      skippedInvalidPhone: 0
    } as any);

    const response = await request(app.getHttpServer())
      .post('/api/v1/zalo/accounts/acc_personal_1/sync-contacts')
      .set('authorization', `Bearer ${managerToken}`)
      .send({});

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      accountId: 'acc_personal_1',
      totalContacts: 12
    });
  });

  it('executes soft-delete endpoint', async () => {
    const managerToken = makeAuthToken('ADMIN');
    vi.spyOn(zaloService, 'softDeleteAccount').mockResolvedValue({
      success: true,
      message: 'Đã xóa mềm tài khoản Zalo và giữ nguyên dữ liệu hội thoại.',
      account: {
        id: 'acc_personal_1',
        status: 'INACTIVE'
      }
    } as any);

    const response = await request(app.getHttpServer())
      .delete('/api/v1/zalo/accounts/acc_personal_1')
      .set('authorization', `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      account: {
        id: 'acc_personal_1',
        status: 'INACTIVE'
      }
    });
  });
});
