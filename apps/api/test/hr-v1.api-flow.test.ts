import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { HrService } from '../src/modules/hr/hr.service';
import { makeAuthToken, setupSingleTenantAuthTestEnv } from './auth-test.helper';

describe('HR v1 API flow (PIT + Goals + Employee Info)', () => {
  let app: INestApplication;
  let hrService: HrService;

  beforeAll(async () => {
    setupSingleTenantAuthTestEnv('phase3-hr-v1-secret');

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

  it('supports PIT profile/record CRUD and generate flow', async () => {
    const managerToken = makeAuthToken('MANAGER');

    vi.spyOn(hrService, 'listPersonalIncomeTaxProfiles').mockResolvedValue([
      {
        id: 'pit_profile_1',
        employeeId: 'emp_1',
        taxCode: '1234567890'
      }
    ] as any);
    vi.spyOn(hrService, 'createPersonalIncomeTaxProfile').mockResolvedValue({
      id: 'pit_profile_1',
      employeeId: 'emp_1',
      taxCode: '1234567890'
    } as any);
    vi.spyOn(hrService, 'updatePersonalIncomeTaxProfile').mockResolvedValue({
      id: 'pit_profile_1',
      employeeId: 'emp_1',
      taxCode: '1234567890',
      dependentCount: 2
    } as any);

    vi.spyOn(hrService, 'listPersonalIncomeTaxRecords').mockResolvedValue([
      {
        id: 'pit_record_1',
        employeeId: 'emp_1',
        taxMonth: 3,
        taxYear: 2026,
        taxAmount: 610000
      }
    ] as any);
    vi.spyOn(hrService, 'createPersonalIncomeTaxRecord').mockResolvedValue({
      id: 'pit_record_1',
      employeeId: 'emp_1',
      taxMonth: 3,
      taxYear: 2026,
      taxAmount: 610000
    } as any);
    vi.spyOn(hrService, 'updatePersonalIncomeTaxRecord').mockResolvedValue({
      id: 'pit_record_1',
      status: 'APPROVED'
    } as any);
    vi.spyOn(hrService, 'generatePersonalIncomeTaxRecords').mockResolvedValue({
      taxMonth: 3,
      taxYear: 2026,
      count: 12
    } as any);

    const listProfiles = await request(app.getHttpServer())
      .get('/api/v1/hr/personal-income-tax/profiles?employeeId=emp_1')
      .set('authorization', `Bearer ${managerToken}`);
    expect(listProfiles.status).toBe(200);
    expect(Array.isArray(listProfiles.body)).toBe(true);

    const createProfile = await request(app.getHttpServer())
      .post('/api/v1/hr/personal-income-tax/profiles')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ employeeId: 'emp_1', taxCode: '1234567890' });
    expect(createProfile.status).toBe(201);
    expect(createProfile.body.id).toBe('pit_profile_1');

    const updateProfile = await request(app.getHttpServer())
      .patch('/api/v1/hr/personal-income-tax/profiles/pit_profile_1')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ dependentCount: 2 });
    expect(updateProfile.status).toBe(200);
    expect(updateProfile.body.dependentCount).toBe(2);

    const listRecords = await request(app.getHttpServer())
      .get('/api/v1/hr/personal-income-tax/records?month=3&year=2026')
      .set('authorization', `Bearer ${managerToken}`);
    expect(listRecords.status).toBe(200);
    expect(Array.isArray(listRecords.body)).toBe(true);

    const createRecord = await request(app.getHttpServer())
      .post('/api/v1/hr/personal-income-tax/records')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ employeeId: 'emp_1', taxMonth: 3, taxYear: 2026 });
    expect(createRecord.status).toBe(201);
    expect(createRecord.body.id).toBe('pit_record_1');

    const updateRecord = await request(app.getHttpServer())
      .patch('/api/v1/hr/personal-income-tax/records/pit_record_1')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ status: 'APPROVED' });
    expect(updateRecord.status).toBe(200);
    expect(updateRecord.body.status).toBe('APPROVED');

    const generateRecords = await request(app.getHttpServer())
      .post('/api/v1/hr/personal-income-tax/records/generate')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ taxMonth: 3, taxYear: 2026 });
    expect(generateRecords.status).toBe(201);
    expect(generateRecords.body.count).toBe(12);
  });

  it('supports goals CRUD/progress and employee-info list/detail/update flow', async () => {
    const managerToken = makeAuthToken('MANAGER');

    vi.spyOn(hrService, 'listGoals').mockResolvedValue([
      {
        id: 'goal_1',
        employeeId: 'emp_1',
        period: 'Q1-2026',
        progressPercent: 25
      }
    ] as any);
    vi.spyOn(hrService, 'createGoal').mockResolvedValue({
      id: 'goal_1',
      employeeId: 'emp_1',
      title: 'Đạt doanh số',
      period: 'Q1-2026'
    } as any);
    vi.spyOn(hrService, 'updateGoal').mockResolvedValue({
      id: 'goal_1',
      title: 'Đạt doanh số mới'
    } as any);
    vi.spyOn(hrService, 'updateGoalProgress').mockResolvedValue({
      id: 'goal_1',
      progressPercent: 100,
      status: 'APPROVED'
    } as any);

    vi.spyOn(hrService, 'listEmployeeInfo').mockResolvedValue([
      {
        id: 'emp_1',
        code: 'EMP-001',
        fullName: 'Nhân viên A'
      }
    ] as any);
    vi.spyOn(hrService, 'getEmployeeInfo').mockResolvedValue({
      employee: {
        id: 'emp_1',
        code: 'EMP-001',
        fullName: 'Nhân viên A'
      },
      contracts: [],
      benefits: [],
      events: [],
      payrolls: [],
      taxProfile: null,
      goals: []
    } as any);
    vi.spyOn(hrService, 'updateEmployeeInfo').mockResolvedValue({
      employee: {
        id: 'emp_1',
        fullName: 'Nhân viên A cập nhật'
      },
      contracts: [],
      benefits: [],
      events: [],
      payrolls: [],
      taxProfile: null,
      goals: []
    } as any);

    const listGoals = await request(app.getHttpServer())
      .get('/api/v1/hr/goals?period=Q1-2026')
      .set('authorization', `Bearer ${managerToken}`);
    expect(listGoals.status).toBe(200);
    expect(Array.isArray(listGoals.body)).toBe(true);

    const createGoal = await request(app.getHttpServer())
      .post('/api/v1/hr/goals')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ employeeId: 'emp_1', title: 'Đạt doanh số', period: 'Q1-2026' });
    expect(createGoal.status).toBe(201);
    expect(createGoal.body.id).toBe('goal_1');

    const updateGoal = await request(app.getHttpServer())
      .patch('/api/v1/hr/goals/goal_1')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ title: 'Đạt doanh số mới' });
    expect(updateGoal.status).toBe(200);
    expect(updateGoal.body.title).toBe('Đạt doanh số mới');

    const updateProgress = await request(app.getHttpServer())
      .patch('/api/v1/hr/goals/goal_1/progress')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ currentValue: 100 });
    expect(updateProgress.status).toBe(200);
    expect(updateProgress.body.progressPercent).toBe(100);

    const listEmployeeInfo = await request(app.getHttpServer())
      .get('/api/v1/hr/employee-info')
      .set('authorization', `Bearer ${managerToken}`);
    expect(listEmployeeInfo.status).toBe(200);
    expect(Array.isArray(listEmployeeInfo.body)).toBe(true);

    const employeeDetail = await request(app.getHttpServer())
      .get('/api/v1/hr/employee-info/emp_1')
      .set('authorization', `Bearer ${managerToken}`);
    expect(employeeDetail.status).toBe(200);
    expect(employeeDetail.body.employee.id).toBe('emp_1');

    const updateEmployeeInfo = await request(app.getHttpServer())
      .patch('/api/v1/hr/employee-info/emp_1')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ fullName: 'Nhân viên A cập nhật' });
    expect(updateEmployeeInfo.status).toBe(200);
    expect(updateEmployeeInfo.body.employee.fullName).toBe('Nhân viên A cập nhật');
  });

  it('supports goals tracker workflow endpoints (tracker/overview/timeline/submit/recompute)', async () => {
    const managerToken = makeAuthToken('MANAGER');

    vi.spyOn(hrService, 'getGoalsTracker').mockResolvedValue({
      scope: 'team',
      items: [
        {
          id: 'goal_1',
          title: 'Tăng doanh số đội nhóm',
          status: 'PENDING'
        }
      ],
      grouped: {
        DRAFT: [],
        PENDING: [{ id: 'goal_1', title: 'Tăng doanh số đội nhóm', status: 'PENDING' }],
        ACTIVE: [],
        APPROVED: [],
        REJECTED: [],
        ARCHIVED: []
      },
      totals: {
        all: 1,
        draft: 0,
        pending: 1,
        active: 0,
        approved: 0,
        rejected: 0,
        archived: 0
      }
    } as any);
    vi.spyOn(hrService, 'getGoalsOverview').mockResolvedValue({
      scope: 'team',
      totals: {
        all: 1,
        draft: 0,
        pending: 1,
        active: 0,
        approved: 0,
        rejected: 0,
        archived: 0
      },
      progress: {
        avgProgressPercent: 45,
        weightedProgressPercent: 45,
        completionRatePercent: 0
      },
      trackingModes: {
        manual: 0,
        auto: 0,
        hybrid: 1
      },
      byDepartment: [],
      byEmployee: []
    } as any);
    vi.spyOn(hrService, 'getGoalTimeline').mockResolvedValue([
      {
        id: 'goal_timeline_1',
        eventType: 'SUBMITTED',
        toStatus: 'PENDING'
      }
    ] as any);
    vi.spyOn(hrService, 'submitGoalApproval').mockResolvedValue({
      id: 'goal_1',
      status: 'PENDING',
      workflowInstanceId: 'wf_goal_1'
    } as any);
    vi.spyOn(hrService, 'recomputeGoalAuto').mockResolvedValue({
      id: 'goal_1',
      currentValue: 72,
      progressPercent: 72
    } as any);
    vi.spyOn(hrService, 'recomputeGoalsAuto').mockResolvedValue({
      total: 5,
      updated: 5
    } as any);

    const trackerRes = await request(app.getHttpServer())
      .get('/api/v1/hr/goals/tracker?scope=team&period=Q2-2026')
      .set('authorization', `Bearer ${managerToken}`);
    expect(trackerRes.status).toBe(200);
    expect(trackerRes.body.scope).toBe('team');
    expect(Array.isArray(trackerRes.body.items)).toBe(true);

    const overviewRes = await request(app.getHttpServer())
      .get('/api/v1/hr/goals/overview?scope=team&period=Q2-2026')
      .set('authorization', `Bearer ${managerToken}`);
    expect(overviewRes.status).toBe(200);
    expect(overviewRes.body.scope).toBe('team');
    expect(overviewRes.body.progress.avgProgressPercent).toBe(45);

    const timelineRes = await request(app.getHttpServer())
      .get('/api/v1/hr/goals/goal_1/timeline')
      .set('authorization', `Bearer ${managerToken}`);
    expect(timelineRes.status).toBe(200);
    expect(Array.isArray(timelineRes.body)).toBe(true);
    expect(timelineRes.body[0].eventType).toBe('SUBMITTED');

    const submitRes = await request(app.getHttpServer())
      .post('/api/v1/hr/goals/goal_1/submit-approval')
      .set('authorization', `Bearer ${managerToken}`)
      .send({});
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.workflowInstanceId).toBe('wf_goal_1');

    const recomputeOneRes = await request(app.getHttpServer())
      .post('/api/v1/hr/goals/goal_1/recompute-auto')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ force: true });
    expect(recomputeOneRes.status).toBe(201);
    expect(recomputeOneRes.body.progressPercent).toBe(72);

    const recomputeAllRes = await request(app.getHttpServer())
      .post('/api/v1/hr/goals/recompute-auto')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ scope: 'team', force: true });
    expect(recomputeAllRes.status).toBe(201);
    expect(recomputeAllRes.body.updated).toBe(5);
  });
});
