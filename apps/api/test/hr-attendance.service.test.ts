import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttendanceMethod, GenericStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { HrService } from '../src/modules/hr/hr.service';

function createRuntimeSettingsMock() {
  return {
    getHrPolicyRuntime: vi.fn().mockResolvedValue({
      shiftDefault: ''
    })
  };
}

function createPrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      employee: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      attendance: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn()
      },
      workShift: {
        findFirst: vi.fn()
      }
    }
  };
}

function createEmployee(attendanceMethod: AttendanceMethod) {
  return {
    id: 'emp_1',
    code: 'E001',
    fullName: 'Nguyen Van A',
    status: GenericStatus.ACTIVE,
    workShiftId: null,
    attendanceMethod
  };
}

describe('HrService attendance methods', () => {
  it('validates attendanceMethod on create and update employee', async () => {
    const prisma = createPrismaMock();
    const runtimeSettings = createRuntimeSettingsMock();
    const service = new HrService(prisma as any, runtimeSettings as any);

    prisma.client.employee.findFirst.mockResolvedValue(createEmployee(AttendanceMethod.REMOTE_TRACKED));
    prisma.client.employee.create.mockImplementation(async ({ data }: any) => ({ id: 'emp_1', ...data }));
    prisma.client.employee.updateMany.mockResolvedValue({ count: 1 });

    await service.createEmployee({
      fullName: 'Le Thi B',
      attendanceMethod: 'OFFICE_EXCEL'
    });
    expect(prisma.client.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attendanceMethod: AttendanceMethod.OFFICE_EXCEL
        })
      })
    );

    await expect(
      service.createEmployee({
        fullName: 'Le Thi C',
        attendanceMethod: 'INVALID_METHOD'
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.updateEmployee('emp_1', {
        attendanceMethod: 'NOT_VALID'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows check-in by day regardless employee default method and blocks when day is EXEMPT', async () => {
    const prisma = createPrismaMock();
    const runtimeSettings = createRuntimeSettingsMock();
    const service = new HrService(prisma as any, runtimeSettings as any);

    prisma.client.employee.findFirst.mockResolvedValue(createEmployee(AttendanceMethod.OFFICE_EXCEL));
    prisma.client.attendance.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.client.attendance.create.mockImplementation(async ({ data }: any) => ({ id: 'att_1', ...data }));

    await service.checkIn({ employeeId: 'emp_1' });
    expect(prisma.client.attendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attendanceMethod: AttendanceMethod.REMOTE_TRACKED,
          workedMinutes: 0
        })
      })
    );

    prisma.client.employee.findFirst.mockResolvedValue(createEmployee(AttendanceMethod.EXEMPT));
    prisma.client.attendance.findFirst.mockResolvedValueOnce({
      id: 'att_exempt_1',
      employeeId: 'emp_1',
      workDate: new Date('2026-03-16T00:00:00.000Z'),
      attendanceMethod: AttendanceMethod.EXEMPT
    });
    await expect(service.checkIn({ employeeId: 'emp_1', workDate: '2026-03-16' })).rejects.toThrow(/Miễn chấm công/i);
  });

  it('accumulates workedMinutes when remote employee check-outs multiple sessions in one day', async () => {
    const prisma = createPrismaMock();
    const runtimeSettings = createRuntimeSettingsMock();
    const service = new HrService(prisma as any, runtimeSettings as any);

    const checkInAt = new Date(Date.now() - 60 * 60 * 1000);
    const openAttendance = {
      id: 'att_1',
      employeeId: 'emp_1',
      workDate: new Date('2026-03-15T00:00:00.000Z'),
      checkInAt,
      checkOutAt: null,
      workedMinutes: 45,
      lateMinutes: 0,
      scheduledEndAt: null,
      status: 'present',
      note: null
    };

    prisma.client.employee.findFirst.mockResolvedValue(createEmployee(AttendanceMethod.REMOTE_TRACKED));
    prisma.client.attendance.findFirst
      .mockResolvedValueOnce(openAttendance)
      .mockResolvedValueOnce({ ...openAttendance, checkOutAt: new Date(), workedMinutes: 105 });
    prisma.client.attendance.updateMany.mockResolvedValue({ count: 1 });

    await service.checkOut({ employeeId: 'emp_1', workDate: '2026-03-15' });

    expect(prisma.client.attendance.updateMany).toHaveBeenCalledTimes(1);
    const updatePayload = prisma.client.attendance.updateMany.mock.calls[0][0].data;
    expect(updatePayload.workedMinutes).toBeGreaterThanOrEqual(104);
    expect(updatePayload.workedMinutes).toBeLessThanOrEqual(106);
    expect(updatePayload.checkOutAt).toBeInstanceOf(Date);
  });

  it('returns monthly attendance matrix with day-level EXEMPT status and minute totals', async () => {
    const prisma = createPrismaMock();
    const runtimeSettings = createRuntimeSettingsMock();
    const service = new HrService(prisma as any, runtimeSettings as any);

    prisma.client.employee.findMany.mockResolvedValue([
      { id: 'emp_mix', code: 'M001', fullName: 'Mixed User', attendanceMethod: AttendanceMethod.OFFICE_EXCEL },
      { id: 'emp_exempt_label', code: 'X001', fullName: 'Exempt Label User', attendanceMethod: AttendanceMethod.EXEMPT }
    ]);

    prisma.client.attendance.findMany.mockResolvedValue([
      {
        employeeId: 'emp_mix',
        workDate: new Date('2026-03-01T00:00:00.000Z'),
        workedMinutes: 120,
        attendanceMethod: AttendanceMethod.REMOTE_TRACKED,
        checkInAt: new Date('2026-03-01T01:00:00.000Z'),
        checkOutAt: new Date('2026-03-01T03:00:00.000Z')
      },
      {
        employeeId: 'emp_mix',
        workDate: new Date('2026-03-02T00:00:00.000Z'),
        workedMinutes: 0,
        attendanceMethod: AttendanceMethod.REMOTE_TRACKED,
        checkInAt: new Date(Date.now() - 30 * 60 * 1000),
        checkOutAt: null
      },
      {
        employeeId: 'emp_mix',
        workDate: new Date('2026-03-03T00:00:00.000Z'),
        workedMinutes: 0,
        attendanceMethod: AttendanceMethod.EXEMPT,
        checkInAt: null,
        checkOutAt: null
      }
    ]);

    const payload = await service.getAttendanceMonthly('2026', '3');

    expect(payload.year).toBe(2026);
    expect(payload.month).toBe(3);
    expect(payload.daysInMonth).toBe(31);

    const mixedRow = payload.rows.find((row) => row.employeeId === 'emp_mix');
    const exemptLabelRow = payload.rows.find((row) => row.employeeId === 'emp_exempt_label');
    expect(mixedRow).toBeDefined();
    expect(exemptLabelRow).toBeDefined();

    expect(mixedRow?.daily[0]).toMatchObject({ day: 1, workedMinutes: 120, status: 'WORKED' });
    expect(mixedRow?.daily[1].workedMinutes ?? 0).toBeGreaterThanOrEqual(29);
    expect(mixedRow?.daily[2]).toMatchObject({ day: 3, workedMinutes: 0, status: 'EXEMPT' });
    expect(mixedRow?.monthTotalMinutes ?? 0).toBeGreaterThanOrEqual(149);

    expect(exemptLabelRow?.monthTotalMinutes).toBe(0);
    expect(exemptLabelRow?.daily[0]).toMatchObject({ day: 1, workedMinutes: 0, status: 'NO_DATA' });
  });

  it('imports office attendance from rows for mixed methods and reports row-level errors', async () => {
    const prisma = createPrismaMock();
    const runtimeSettings = createRuntimeSettingsMock();
    const service = new HrService(prisma as any, runtimeSettings as any);

    prisma.client.employee.findMany.mockResolvedValue([
      {
        id: 'emp_office',
        code: 'E001',
        workShiftId: null
      },
      {
        id: 'emp_remote',
        code: 'R001',
        workShiftId: null
      }
    ]);

    prisma.client.attendance.findFirst.mockResolvedValue(null);
    prisma.client.attendance.create.mockImplementation(async ({ data }: any) => ({ id: 'att_office_1', ...data }));

    const payload = await service.importOfficeAttendance({
      year: 2026,
      month: 3,
      fileName: 'attendance-2026-03.xlsx',
      rows: [
        { employeeCode: 'E001', workDate: '2026-03-15', workedHours: 8, workedMinutes: 30 },
        { employeeCode: 'NOT_FOUND', workDate: '2026-03-15', workedHours: 8, workedMinutes: 0 },
        { employeeCode: 'R001', workDate: '2026-03-15', workedHours: 7, workedMinutes: 0 }
      ]
    });

    expect(payload.totalRows).toBe(3);
    expect(payload.importedCount).toBe(2);
    expect(payload.skippedCount).toBe(1);
    expect(payload.errors).toHaveLength(1);
    expect(payload.errors.some((error) => error.rowIndex === 2)).toBe(true);

    expect(prisma.client.attendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'emp_office',
          workedMinutes: 510,
          attendanceMethod: AttendanceMethod.OFFICE_EXCEL
        })
      })
    );
  });

  it('blocks office import when workDate already marked EXEMPT', async () => {
    const prisma = createPrismaMock();
    const runtimeSettings = createRuntimeSettingsMock();
    const service = new HrService(prisma as any, runtimeSettings as any);

    prisma.client.employee.findMany.mockResolvedValue([
      {
        id: 'emp_office',
        code: 'E001',
        workShiftId: null
      }
    ]);
    prisma.client.attendance.findFirst.mockResolvedValueOnce({
      id: 'att_exempt_1',
      employeeId: 'emp_office',
      workDate: new Date('2026-03-15T00:00:00.000Z'),
      attendanceMethod: AttendanceMethod.EXEMPT
    });

    const payload = await service.importOfficeAttendance({
      year: 2026,
      month: 3,
      rows: [{ employeeCode: 'E001', workDate: '2026-03-15', workedHours: 8, workedMinutes: 0 }]
    });

    expect(payload.importedCount).toBe(0);
    expect(payload.skippedCount).toBe(1);
    expect(payload.errors).toHaveLength(1);
    expect(payload.errors[0]?.message).toMatch(/Miễn chấm công/i);
  });

  it('marks and unmarks exempt day successfully', async () => {
    const prisma = createPrismaMock();
    const runtimeSettings = createRuntimeSettingsMock();
    const service = new HrService(prisma as any, runtimeSettings as any);

    prisma.client.employee.findFirst.mockResolvedValue(createEmployee(AttendanceMethod.REMOTE_TRACKED));
    prisma.client.attendance.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.client.attendance.create.mockImplementation(async ({ data }: any) => ({ id: 'att_exempt_new', ...data }));
    prisma.client.attendance.deleteMany.mockResolvedValue({ count: 1 });

    const exemptAttendance = await service.markAttendanceExemptDay({
      employeeId: 'emp_1',
      workDate: '2026-03-20',
      note: 'Cong tac'
    });

    expect(exemptAttendance).toMatchObject({
      employeeId: 'emp_1',
      attendanceMethod: AttendanceMethod.EXEMPT,
      workedMinutes: 0,
      status: 'exempt'
    });
    expect(prisma.client.attendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'emp_1',
          attendanceMethod: AttendanceMethod.EXEMPT,
          workedMinutes: 0,
          checkInAt: null,
          checkOutAt: null
        })
      })
    );

    const unmarkedPayload = await service.unmarkAttendanceExemptDay('emp_1', '2026-03-20');
    expect(unmarkedPayload).toEqual({
      employeeId: 'emp_1',
      workDate: '2026-03-20',
      removedCount: 1
    });
  });

  it('blocks marking exempt when workday already has worked/open-session attendance', async () => {
    const prisma = createPrismaMock();
    const runtimeSettings = createRuntimeSettingsMock();
    const service = new HrService(prisma as any, runtimeSettings as any);

    prisma.client.employee.findFirst.mockResolvedValue(createEmployee(AttendanceMethod.REMOTE_TRACKED));
    prisma.client.attendance.findFirst.mockResolvedValueOnce({
      id: 'att_worked_1',
      employeeId: 'emp_1',
      workDate: new Date('2026-03-21T00:00:00.000Z'),
      attendanceMethod: AttendanceMethod.REMOTE_TRACKED,
      workedMinutes: 120,
      checkInAt: new Date('2026-03-21T01:00:00.000Z'),
      checkOutAt: new Date('2026-03-21T03:00:00.000Z')
    });

    await expect(
      service.markAttendanceExemptDay({
        employeeId: 'emp_1',
        workDate: '2026-03-21'
      })
    ).rejects.toThrow(/đã có dữ liệu công/i);
  });

  it('returns clear error when check-out has no open session', async () => {
    const prisma = createPrismaMock();
    const runtimeSettings = createRuntimeSettingsMock();
    const service = new HrService(prisma as any, runtimeSettings as any);

    prisma.client.employee.findFirst.mockResolvedValue(createEmployee(AttendanceMethod.REMOTE_TRACKED));
    prisma.client.attendance.findFirst.mockResolvedValue(null);

    await expect(service.checkOut({ employeeId: 'emp_1' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
