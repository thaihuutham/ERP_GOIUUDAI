import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ConversationQualityService } from '../src/modules/conversation-quality/conversation-quality.service';

describe('Conversation quality API flow integration', () => {
  let app: INestApplication;
  let conversationQualityService: ConversationQualityService;

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
    process.env.JWT_SECRET = 'phase-conversation-quality-flow-secret';
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
    conversationQualityService = app.get(ConversationQualityService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('executes quality job flow: list/create/update -> run now -> list/get runs', async () => {
    const managerToken = makeToken('MANAGER');

    vi.spyOn(conversationQualityService, 'listJobs').mockResolvedValue([
      {
        id: 'job_api_1',
        name: 'Daily QC',
        intervalMinutes: 120,
        isActive: true
      }
    ] as any);

    vi.spyOn(conversationQualityService, 'createJob').mockResolvedValue({
      id: 'job_api_2',
      name: 'OA Quality Batch',
      intervalMinutes: 60,
      isActive: true
    } as any);

    vi.spyOn(conversationQualityService, 'updateJob').mockResolvedValue({
      id: 'job_api_2',
      name: 'OA Quality Batch Updated',
      intervalMinutes: 30,
      isActive: true
    } as any);

    vi.spyOn(conversationQualityService, 'runJobNow').mockResolvedValue({
      runId: 'run_api_1',
      summary: {
        triggerType: 'MANUAL',
        totalThreads: 3,
        evaluatedCount: 3,
        failedCount: 0,
        skippedCount: 0
      }
    } as any);

    vi.spyOn(conversationQualityService, 'listRuns').mockResolvedValue([
      {
        id: 'run_api_1',
        jobId: 'job_api_2',
        status: 'SUCCESS'
      }
    ] as any);

    vi.spyOn(conversationQualityService, 'getRun').mockResolvedValue({
      id: 'run_api_1',
      status: 'SUCCESS',
      evaluations: [
        {
          id: 'eval_api_1',
          verdict: 'PASS',
          score: 90
        }
      ]
    } as any);

    const listJobsRes = await request(app.getHttpServer())
      .get('/api/v1/conversation-quality/jobs')
      .set('authorization', `Bearer ${managerToken}`);

    expect(listJobsRes.status).toBe(200);
    expect(listJobsRes.body).toHaveLength(1);
    expect(listJobsRes.body[0].id).toBe('job_api_1');

    const createJobRes = await request(app.getHttpServer())
      .post('/api/v1/conversation-quality/jobs')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        name: 'OA Quality Batch',
        intervalMinutes: 60,
        isActive: true
      });

    expect(createJobRes.status).toBe(201);
    expect(createJobRes.body.id).toBe('job_api_2');

    const updateJobRes = await request(app.getHttpServer())
      .patch('/api/v1/conversation-quality/jobs/job_api_2')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        name: 'OA Quality Batch Updated',
        intervalMinutes: 30
      });

    expect(updateJobRes.status).toBe(200);
    expect(updateJobRes.body.intervalMinutes).toBe(30);

    const runNowRes = await request(app.getHttpServer())
      .post('/api/v1/conversation-quality/jobs/job_api_2/run-now')
      .set('authorization', `Bearer ${managerToken}`)
      .send({});

    expect(runNowRes.status).toBe(201);
    expect(runNowRes.body.runId).toBe('run_api_1');
    expect(runNowRes.body.summary.evaluatedCount).toBe(3);

    const listRunsRes = await request(app.getHttpServer())
      .get('/api/v1/conversation-quality/runs?jobId=job_api_2')
      .set('authorization', `Bearer ${managerToken}`);

    expect(listRunsRes.status).toBe(200);
    expect(listRunsRes.body).toHaveLength(1);
    expect(listRunsRes.body[0].id).toBe('run_api_1');

    const getRunRes = await request(app.getHttpServer())
      .get('/api/v1/conversation-quality/runs/run_api_1')
      .set('authorization', `Bearer ${managerToken}`);

    expect(getRunRes.status).toBe(200);
    expect(getRunRes.body.id).toBe('run_api_1');
    expect(getRunRes.body.evaluations).toHaveLength(1);
  });
});
