import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { HrRegulationService } from '../src/modules/hr/hr-regulation.service';
import { makeAuthToken, setupSingleTenantAuthTestEnv } from './auth-test.helper';

describe('HR Regulation API flow', () => {
  let app: INestApplication;
  let regulationService: HrRegulationService;

  beforeAll(async () => {
    setupSingleTenantAuthTestEnv('phase3-hr-regulation-flow-secret');

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
    regulationService = app.get(HrRegulationService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns regulation metadata payload', async () => {
    const managerToken = makeAuthToken('ADMIN');

    vi.spyOn(regulationService, 'getRegulationMetadata').mockResolvedValue({
      viewerScope: 'department',
      canOverrideEmployeeId: false,
      requesterEmployeeId: 'emp_1',
      fieldCatalog: [
        {
          id: 'summary',
          key: 'summary',
          label: 'Tom tat cong viec',
          description: '',
          type: 'text',
          options: [],
          validation: { required: true },
          analyticsEnabled: false,
          aggregator: 'none',
          status: 'ACTIVE',
          version: 1
        }
      ],
      appendices: [
        {
          code: 'PL01',
          name: 'Phụ lục nhật ký công việc ngày',
          description: 'Ghi nhận hoạt động trong ngày theo quy chế 2026.',
          fields: [
            {
              id: 'summary',
              key: 'summary',
              label: 'Tom tat cong viec',
              type: 'text',
              options: [],
              validation: { required: true },
              analyticsEnabled: false,
              aggregator: 'none',
              status: 'ACTIVE',
              version: 1,
              required: true,
              placeholder: '',
              defaultValue: null,
              helpText: '',
              visibility: 'visible',
              kpiAlias: '',
              source: 'global'
            }
          ]
        }
      ]
    } as any);

    const metadataRes = await request(app.getHttpServer())
      .get('/api/v1/hr/regulation/metadata')
      .set('authorization', `Bearer ${managerToken}`);

    expect(metadataRes.status).toBe(200);
    expect(metadataRes.body.viewerScope).toBe('department');
    expect(metadataRes.body.canOverrideEmployeeId).toBe(false);
    expect(Array.isArray(metadataRes.body.fieldCatalog)).toBe(true);
    expect(Array.isArray(metadataRes.body.appendices)).toBe(true);
    expect(Array.isArray(metadataRes.body.appendices?.[0]?.fields)).toBe(true);
  });

  it('runs appendix submission flow and score recompute endpoints', async () => {
    const managerToken = makeAuthToken('ADMIN');

    vi.spyOn(regulationService, 'createAppendixSubmission').mockResolvedValue({
      id: 'sub_flow_1',
      appendixCode: 'PL02',
      employeeId: 'emp_1',
      status: 'DRAFT'
    } as any);
    vi.spyOn(regulationService, 'submitAppendixSubmission').mockResolvedValue({
      id: 'sub_flow_1',
      appendixCode: 'PL02',
      employeeId: 'emp_1',
      status: 'APPROVED'
    } as any);
    vi.spyOn(regulationService, 'approveAppendixSubmission').mockResolvedValue({
      id: 'sub_flow_1',
      appendixCode: 'PL02',
      employeeId: 'emp_1',
      status: 'APPROVED'
    } as any);
    vi.spyOn(regulationService, 'listDailyScores').mockResolvedValue({
      viewerScope: 'team',
      items: [
        {
          id: 'score_1',
          employeeId: 'emp_1',
          workDate: '2026-04-03',
          totalScore: 96,
          status: 'PROVISIONAL'
        }
      ]
    } as any);
    vi.spyOn(regulationService, 'recomputeDailyScores').mockResolvedValue({
      processed: 1,
      snapshots: [{ id: 'score_1', employeeId: 'emp_1' }]
    } as any);

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/hr/appendix/submissions')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        appendixCode: 'PL02',
        employeeId: 'emp_1',
        workDate: '2026-04-03',
        payloadJson: {
          taskLog: ['call', 'meeting']
        }
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBe('sub_flow_1');

    const submitRes = await request(app.getHttpServer())
      .post('/api/v1/hr/appendix/submissions/sub_flow_1/submit')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        actorId: 'emp_1'
      });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.status).toBe('APPROVED');

    const approveRes = await request(app.getHttpServer())
      .post('/api/v1/hr/appendix/submissions/sub_flow_1/approve')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        approverId: 'manager_1'
      });

    expect(approveRes.status).toBe(201);
    expect(approveRes.body.status).toBe('APPROVED');

    const scoreListRes = await request(app.getHttpServer())
      .get('/api/v1/hr/performance/daily-scores?employeeId=emp_1')
      .set('authorization', `Bearer ${managerToken}`);

    expect(scoreListRes.status).toBe(200);
    expect(scoreListRes.body.viewerScope).toBe('team');
    expect(Array.isArray(scoreListRes.body.items)).toBe(true);

    const recomputeRes = await request(app.getHttpServer())
      .post('/api/v1/hr/performance/daily-scores/recompute')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        employeeId: 'emp_1',
        workDate: '2026-04-03'
      });

    expect(recomputeRes.status).toBe(201);
    expect(recomputeRes.body.processed).toBe(1);
  });

  it('serves pip endpoints and auto-draft run', async () => {
    const managerToken = makeAuthToken('ADMIN');

    vi.spyOn(regulationService, 'runAutoDraftPip').mockResolvedValue({
      scannedEmployees: 2,
      createdCount: 1,
      createdCases: [{ pipCaseId: 'pip_1', employeeId: 'emp_1' }]
    } as any);
    vi.spyOn(regulationService, 'listPipCases').mockResolvedValue({
      viewerScope: 'team',
      items: [
        {
          id: 'pip_1',
          employeeId: 'emp_1',
          triggerReason: 'AUTO_PIP_MONTHLY_SCORE_BELOW_75',
          status: 'DRAFT'
        }
      ]
    } as any);

    const autoDraftRes = await request(app.getHttpServer())
      .post('/api/v1/hr/pip/cases/auto-draft/run')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        triggeredBy: 'ops_manual'
      });

    expect(autoDraftRes.status).toBe(201);
    expect(autoDraftRes.body.createdCount).toBe(1);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/hr/pip/cases?status=DRAFT')
      .set('authorization', `Bearer ${managerToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.items)).toBe(true);
    expect(listRes.body.items[0]?.id).toBe('pip_1');
  });
});
