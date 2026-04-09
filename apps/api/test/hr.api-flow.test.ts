import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { HrService } from '../src/modules/hr/hr.service';
import { makeAuthToken, setupSingleTenantAuthTestEnv } from './auth-test.helper';

describe('HR API flow integration', () => {
  let app: INestApplication;
  let hrService: HrService;

  beforeAll(async () => {
    setupSingleTenantAuthTestEnv('phase3-hr-flow-secret');

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

  it('executes HR flow: employee -> attendance -> leave -> payroll', async () => {
    const managerToken = makeAuthToken('ADMIN');

    const state = {
      employee: {
        id: 'emp_api_1',
        fullName: 'Tran Thi B',
        code: 'EMP-API-001',
        status: 'ACTIVE'
      },
      leave: {
        id: 'leave_api_1',
        employeeId: 'emp_api_1',
        leaveType: 'PHEP_NAM',
        status: 'PENDING'
      },
      payroll: {
        id: 'payroll_api_1',
        employeeId: 'emp_api_1',
        payMonth: 3,
        payYear: 2026,
        netSalary: 10000000,
        status: 'PENDING'
      }
    };

    vi.spyOn(hrService, 'createEmployee').mockImplementation(async (body: any) => {
      state.employee = {
        ...state.employee,
        ...body,
        id: state.employee.id
      };
      return state.employee as any;
    });

    vi.spyOn(hrService, 'checkIn').mockImplementation(async (body: any) => ({
      id: 'attendance_api_1',
      employeeId: body.employeeId,
      workDate: body.workDate ?? '2026-03-28',
      checkInAt: new Date().toISOString(),
      status: 'PRESENT'
    }) as any);

    vi.spyOn(hrService, 'checkOut').mockImplementation(async (body: any) => ({
      id: 'attendance_api_1',
      employeeId: body.employeeId,
      workDate: body.workDate ?? '2026-03-28',
      checkInAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      checkOutAt: new Date().toISOString(),
      status: 'PRESENT'
    }) as any);

    vi.spyOn(hrService, 'createLeaveRequest').mockImplementation(async (body: any) => {
      state.leave = {
        ...state.leave,
        ...body,
        id: state.leave.id,
        status: 'PENDING'
      };
      return state.leave as any;
    });

    vi.spyOn(hrService, 'approveLeaveRequest').mockImplementation(async (_id: string, approverId?: string) => ({
      ...state.leave,
      status: 'APPROVED',
      approvedBy: approverId ?? 'approver_api'
    }) as any);

    vi.spyOn(hrService, 'generatePayroll').mockImplementation(async (body: any) => {
      state.payroll = {
        ...state.payroll,
        ...body,
        id: state.payroll.id,
        status: 'PENDING'
      };
      return [state.payroll] as any;
    });

    vi.spyOn(hrService, 'payPayroll').mockImplementation(async (_id: string) => ({
      ...state.payroll,
      status: 'APPROVED',
      paidAt: new Date().toISOString()
    }) as any);

    const createEmployeeRes = await request(app.getHttpServer())
      .post('/api/v1/hr/employees')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        code: 'EMP-API-001',
        fullName: 'Tran Thi B',
        employmentType: 'FULL_TIME',
        status: 'ACTIVE'
      });

    expect(createEmployeeRes.status).toBe(201);
    expect(createEmployeeRes.body.id).toBe('emp_api_1');

    const checkInRes = await request(app.getHttpServer())
      .post('/api/v1/hr/attendance/check-in')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        employeeId: 'emp_api_1',
        workDate: '2026-03-28'
      });

    expect(checkInRes.status).toBe(201);
    expect(checkInRes.body.employeeId).toBe('emp_api_1');

    const checkOutRes = await request(app.getHttpServer())
      .post('/api/v1/hr/attendance/check-out')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        employeeId: 'emp_api_1',
        workDate: '2026-03-28'
      });

    expect(checkOutRes.status).toBe(201);
    expect(checkOutRes.body.checkOutAt).toBeTruthy();

    const createLeaveRes = await request(app.getHttpServer())
      .post('/api/v1/hr/leave-requests')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        employeeId: 'emp_api_1',
        leaveType: 'PHEP_NAM',
        startDate: '2026-04-02',
        endDate: '2026-04-03',
        reason: 'Nghi phep ca nhan'
      });

    expect(createLeaveRes.status).toBe(201);
    expect(createLeaveRes.body.status).toBe('PENDING');

    const approveLeaveRes = await request(app.getHttpServer())
      .post('/api/v1/hr/leave-requests/leave_api_1/approve')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        approverId: 'test_manager'
      });

    expect(approveLeaveRes.status).toBe(201);
    expect(approveLeaveRes.body.status).toBe('APPROVED');

    const generatePayrollRes = await request(app.getHttpServer())
      .post('/api/v1/hr/payrolls/generate')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        month: 3,
        year: 2026,
        employeeId: 'emp_api_1'
      });

    expect(generatePayrollRes.status).toBe(201);
    expect(Array.isArray(generatePayrollRes.body)).toBe(true);

    const payPayrollRes = await request(app.getHttpServer())
      .post('/api/v1/hr/payrolls/payroll_api_1/pay')
      .set('authorization', `Bearer ${managerToken}`)
      .send({});

    expect(payPayrollRes.status).toBe(201);
    expect(payPayrollRes.body.status).toBe('APPROVED');
    expect(payPayrollRes.body.paidAt).toBeTruthy();
  });

  it('serves GET /api/v1/hr/attendance/monthly and maps year/month query correctly', async () => {
    const managerToken = makeAuthToken('ADMIN');
    const monthlyPayload = {
      year: 2026,
      month: 4,
      daysInMonth: 30,
      rows: []
    };
    const monthlySpy = vi.spyOn(hrService, 'getAttendanceMonthly').mockResolvedValue(monthlyPayload as any);

    const monthlyRes = await request(app.getHttpServer())
      .get('/api/v1/hr/attendance/monthly?year=2026&month=4')
      .set('authorization', `Bearer ${managerToken}`);

    expect(monthlyRes.status).toBe(200);
    expect(monthlySpy).toHaveBeenCalledWith('2026', '4');
    expect(monthlyRes.body).toEqual(monthlyPayload);
  });

  it('serves POST/DELETE /api/v1/hr/attendance/exempt-day and maps payload/query correctly', async () => {
    const managerToken = makeAuthToken('ADMIN');
    const markPayload = {
      id: 'att_exempt_1',
      employeeId: 'emp_api_1',
      workDate: '2026-04-10',
      attendanceMethod: 'EXEMPT',
      workedMinutes: 0,
      status: 'exempt'
    };
    const markSpy = vi.spyOn(hrService, 'markAttendanceExemptDay').mockResolvedValue(markPayload as any);
    const unmarkSpy = vi.spyOn(hrService, 'unmarkAttendanceExemptDay').mockResolvedValue({
      employeeId: 'emp_api_1',
      workDate: '2026-04-10',
      removedCount: 1
    } as any);

    const markRes = await request(app.getHttpServer())
      .post('/api/v1/hr/attendance/exempt-day')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        employeeId: 'emp_api_1',
        workDate: '2026-04-10',
        note: 'Cong tac'
      });

    expect(markRes.status).toBe(201);
    expect(markSpy).toHaveBeenCalledWith({
      employeeId: 'emp_api_1',
      workDate: '2026-04-10',
      note: 'Cong tac'
    });
    expect(markRes.body).toEqual(markPayload);

    const unmarkRes = await request(app.getHttpServer())
      .delete('/api/v1/hr/attendance/exempt-day?employeeId=emp_api_1&workDate=2026-04-10')
      .set('authorization', `Bearer ${managerToken}`);

    expect(unmarkRes.status).toBe(200);
    expect(unmarkSpy).toHaveBeenCalledWith('emp_api_1', '2026-04-10');
    expect(unmarkRes.body).toEqual({
      employeeId: 'emp_api_1',
      workDate: '2026-04-10',
      removedCount: 1
    });
  });
});
