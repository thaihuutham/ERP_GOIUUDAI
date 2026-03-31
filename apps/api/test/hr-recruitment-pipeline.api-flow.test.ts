import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { HrService } from '../src/modules/hr/hr.service';
import { makeAuthToken, setupSingleTenantAuthTestEnv } from './auth-test.helper';

describe('HR recruitment pipeline API flow', () => {
  let app: INestApplication;
  let hrService: HrService;

  beforeAll(async () => {
    setupSingleTenantAuthTestEnv('phase3-hr-recruitment-secret');

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
    hrService = app.get(HrService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes pipeline board + metrics + stage/status transitions', async () => {
    const managerToken = makeAuthToken('MANAGER');

    vi.spyOn(hrService, 'getRecruitmentPipeline').mockResolvedValue({
      stages: [
        { stage: 'APPLIED', count: 1, items: [{ id: 'app_1' }] },
        { stage: 'SCREENING', count: 0, items: [] },
        { stage: 'INTERVIEW', count: 0, items: [] },
        { stage: 'ASSESSMENT', count: 0, items: [] },
        { stage: 'OFFER', count: 0, items: [] },
        { stage: 'HIRED', count: 0, items: [] }
      ],
      totals: { all: 1, active: 1, rejected: 0, withdrawn: 0, hired: 0 }
    } as any);

    vi.spyOn(hrService, 'getRecruitmentMetrics').mockResolvedValue({
      totals: { applications: 10, hired: 2 },
      conversionRates: { hiredRate: 0.2 }
    } as any);

    vi.spyOn(hrService, 'createRecruitmentApplication').mockResolvedValue({
      id: 'app_1',
      currentStage: 'APPLIED',
      status: 'ACTIVE'
    } as any);

    vi.spyOn(hrService, 'updateRecruitmentApplicationStage').mockResolvedValue({
      id: 'app_1',
      currentStage: 'SCREENING',
      status: 'ACTIVE'
    } as any);

    vi.spyOn(hrService, 'updateRecruitmentApplicationStatus').mockResolvedValue({
      id: 'app_1',
      currentStage: 'SCREENING',
      status: 'REJECTED'
    } as any);

    vi.spyOn(hrService, 'getRecruitmentApplicationDetail').mockResolvedValue({
      id: 'app_1',
      currentStage: 'SCREENING',
      status: 'REJECTED'
    } as any);

    const pipelineRes = await request(app.getHttpServer())
      .get('/api/v1/hr/recruitment/pipeline?status=ACTIVE')
      .set('authorization', `Bearer ${managerToken}`);
    expect(pipelineRes.status).toBe(200);
    expect(Array.isArray(pipelineRes.body.stages)).toBe(true);

    const metricsRes = await request(app.getHttpServer())
      .get('/api/v1/hr/recruitment/metrics')
      .set('authorization', `Bearer ${managerToken}`);
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.body.totals.applications).toBe(10);

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/hr/recruitment/applications')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        jobTitle: 'Sales Executive',
        candidateName: 'Nguyen Van A',
        source: 'REFERRAL',
        cvExternalUrl: 'https://example.com/cv.pdf'
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBe('app_1');

    const stageRes = await request(app.getHttpServer())
      .patch('/api/v1/hr/recruitment/applications/app_1/stage')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ toStage: 'SCREENING' });
    expect(stageRes.status).toBe(200);
    expect(stageRes.body.currentStage).toBe('SCREENING');

    const statusRes = await request(app.getHttpServer())
      .patch('/api/v1/hr/recruitment/applications/app_1/status')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ status: 'REJECTED', reason: 'Không phù hợp JD' });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('REJECTED');

    const detailRes = await request(app.getHttpServer())
      .get('/api/v1/hr/recruitment/applications/app_1')
      .set('authorization', `Bearer ${managerToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.id).toBe('app_1');
  });

  it('supports interview + offer + submit approval + convert employee endpoints', async () => {
    const managerToken = makeAuthToken('MANAGER');

    vi.spyOn(hrService, 'createRecruitmentInterview').mockResolvedValue({
      id: 'int_1',
      applicationId: 'app_1',
      status: 'SCHEDULED'
    } as any);

    vi.spyOn(hrService, 'updateRecruitmentInterview').mockResolvedValue({
      id: 'int_1',
      status: 'COMPLETED'
    } as any);

    vi.spyOn(hrService, 'createRecruitmentOffer').mockResolvedValue({
      id: 'offer_1',
      applicationId: 'app_1',
      status: 'DRAFT'
    } as any);

    vi.spyOn(hrService, 'updateRecruitmentOffer').mockResolvedValue({
      id: 'offer_1',
      status: 'ACCEPTED'
    } as any);

    vi.spyOn(hrService, 'submitRecruitmentOfferApproval').mockResolvedValue({
      id: 'offer_1',
      status: 'PENDING_APPROVAL',
      workflowInstanceId: 'wf_1'
    } as any);

    vi.spyOn(hrService, 'convertRecruitmentApplicationToEmployee').mockResolvedValue({
      employee: {
        id: 'emp_1',
        fullName: 'Nguyen Van A'
      },
      application: {
        id: 'app_1',
        status: 'HIRED'
      }
    } as any);

    const createInterviewRes = await request(app.getHttpServer())
      .post('/api/v1/hr/recruitment/interviews')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        applicationId: 'app_1',
        scheduledAt: '2026-04-02T09:00:00.000Z',
        interviewerName: 'Tran B',
        mode: 'ONLINE'
      });
    expect(createInterviewRes.status).toBe(201);
    expect(createInterviewRes.body.id).toBe('int_1');

    const updateInterviewRes = await request(app.getHttpServer())
      .patch('/api/v1/hr/recruitment/interviews/int_1')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ status: 'COMPLETED', feedback: 'Good' });
    expect(updateInterviewRes.status).toBe(200);
    expect(updateInterviewRes.body.status).toBe('COMPLETED');

    const createOfferRes = await request(app.getHttpServer())
      .post('/api/v1/hr/recruitment/offers')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ applicationId: 'app_1', offeredSalary: 18000000, currency: 'VND' });
    expect(createOfferRes.status).toBe(201);
    expect(createOfferRes.body.id).toBe('offer_1');

    const updateOfferRes = await request(app.getHttpServer())
      .patch('/api/v1/hr/recruitment/offers/offer_1')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ status: 'ACCEPTED' });
    expect(updateOfferRes.status).toBe(200);
    expect(updateOfferRes.body.status).toBe('ACCEPTED');

    const submitRes = await request(app.getHttpServer())
      .post('/api/v1/hr/recruitment/offers/offer_1/submit-approval')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ requestedBy: 'user_1' });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.status).toBe('PENDING_APPROVAL');

    const convertRes = await request(app.getHttpServer())
      .post('/api/v1/hr/recruitment/applications/app_1/convert-to-employee')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ code: 'EMP-9001', employmentType: 'FULL_TIME' });
    expect(convertRes.status).toBe(201);
    expect(convertRes.body.employee.id).toBe('emp_1');
    expect(convertRes.body.application.status).toBe('HIRED');
  });
});
