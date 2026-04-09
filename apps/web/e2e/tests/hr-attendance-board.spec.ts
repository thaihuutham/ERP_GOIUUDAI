import { expect, test, type Page, type Route } from '@playwright/test';
import * as XLSX from 'xlsx';

type AttendanceMethod = 'REMOTE_TRACKED' | 'OFFICE_EXCEL' | 'EXEMPT';
type DailyCell = { day: number; workedMinutes: number; status: 'WORKED' | 'NO_DATA' | 'EXEMPT' };

type AttendanceMockState = {
  monthlyCalls: number;
  remoteCheckedIn: boolean;
  checkOutCalls: number;
  officeImportCalls: number;
  exemptPostCalls: number;
  exemptDeleteCalls: number;
  methodByEmployee: Record<string, AttendanceMethod>;
  workedMinutesByEmployeeDay: Record<string, Record<number, number>>;
  exemptDaysByEmployee: Record<string, number[]>;
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

function parseBody(route: Route): Record<string, unknown> {
  const raw = route.request().postData();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildDaily(daysInMonth: number, workedByDay: Record<number, number>, exemptDays: number[]): DailyCell[] {
  const exemptSet = new Set<number>(exemptDays);
  const result: DailyCell[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    if (exemptSet.has(day)) {
      result.push({ day, workedMinutes: 0, status: 'EXEMPT' });
      continue;
    }
    const workedMinutes = workedByDay[day] ?? 0;
    result.push({
      day,
      workedMinutes,
      status: workedMinutes > 0 ? 'WORKED' : 'NO_DATA'
    });
  }
  return result;
}

function buildMonthlyPayload(state: AttendanceMockState, year: number, month: number) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const remoteDaily = buildDaily(
    daysInMonth,
    state.workedMinutesByEmployeeDay.emp_remote ?? {},
    state.exemptDaysByEmployee.emp_remote ?? []
  );
  const officeMethod = state.methodByEmployee.emp_office;
  const officeDaily = buildDaily(
    daysInMonth,
    state.workedMinutesByEmployeeDay.emp_office ?? {},
    state.exemptDaysByEmployee.emp_office ?? []
  );
  const exemptDaily = buildDaily(
    daysInMonth,
    state.workedMinutesByEmployeeDay.emp_exempt ?? {},
    state.exemptDaysByEmployee.emp_exempt ?? []
  );

  const rows = [
    {
      employeeId: 'emp_remote',
      employeeCode: 'R001',
      employeeName: 'Remote User',
      attendanceMethod: 'REMOTE_TRACKED' as AttendanceMethod,
      daily: remoteDaily,
      monthTotalMinutes: remoteDaily.reduce((sum, cell) => sum + cell.workedMinutes, 0)
    },
    {
      employeeId: 'emp_office',
      employeeCode: 'O001',
      employeeName: 'Office User',
      attendanceMethod: officeMethod,
      daily: officeDaily,
      monthTotalMinutes: officeDaily.reduce((sum, cell) => sum + cell.workedMinutes, 0)
    },
    {
      employeeId: 'emp_exempt',
      employeeCode: 'X001',
      employeeName: 'Exempt User',
      attendanceMethod: 'EXEMPT' as AttendanceMethod,
      daily: exemptDaily,
      monthTotalMinutes: 0
    }
  ];

  return {
    year,
    month,
    daysInMonth,
    rows
  };
}

async function mockAttendanceApis(page: Page, state: AttendanceMockState) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === 'GET' && path === '/api/v1/settings/runtime') {
      return json(route, {
        organization: { companyName: 'ERP Demo' },
        locale: {
          timezone: 'Asia/Ho_Chi_Minh',
          currency: 'VND',
          numberFormat: 'vi-VN',
          dateFormat: 'DD/MM/YYYY'
        }
      });
    }

    if (method === 'GET' && path === '/api/v1/hr/attendance/monthly') {
      state.monthlyCalls += 1;
      const year = Number(url.searchParams.get('year') ?? 2026);
      const month = Number(url.searchParams.get('month') ?? 3);
      return json(route, buildMonthlyPayload(state, year, month));
    }

    if (method === 'PATCH' && path.startsWith('/api/v1/hr/employees/')) {
      const employeeId = path.split('/').at(-1) ?? '';
      const body = parseBody(route);
      const nextMethod = String(body.attendanceMethod ?? '').trim().toUpperCase();
      if (employeeId && ['REMOTE_TRACKED', 'OFFICE_EXCEL', 'EXEMPT'].includes(nextMethod)) {
        state.methodByEmployee[employeeId] = nextMethod as AttendanceMethod;
      }
      return json(route, { id: employeeId, attendanceMethod: state.methodByEmployee[employeeId] ?? 'REMOTE_TRACKED' });
    }

    if (method === 'GET' && path === '/api/v1/hr/attendance') {
      if (state.remoteCheckedIn) {
        return json(route, [
          {
            id: 'att_open_1',
            checkInAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            checkOutAt: null,
            workedMinutes: 0
          }
        ]);
      }
      return json(route, [
        {
          id: 'att_closed_1',
          checkInAt: '2026-03-01T01:00:00.000Z',
          checkOutAt: '2026-03-01T09:30:00.000Z',
          workedMinutes: 510
        }
      ]);
    }

    if (method === 'POST' && path === '/api/v1/hr/attendance/check-in') {
      state.remoteCheckedIn = true;
      return json(
        route,
        {
          id: 'att_open_1',
          employeeId: 'emp_remote',
          checkInAt: new Date().toISOString(),
          checkOutAt: null
        },
        201
      );
    }

    if (method === 'POST' && path === '/api/v1/hr/attendance/check-out') {
      state.remoteCheckedIn = false;
      state.checkOutCalls += 1;
      return json(
        route,
        {
          id: 'att_closed_2',
          employeeId: 'emp_remote',
          checkOutAt: new Date().toISOString(),
          workedMinutes: 15
        },
        201
      );
    }

    if (method === 'POST' && path === '/api/v1/hr/attendance/exempt-day') {
      const body = parseBody(route);
      const employeeId = String(body.employeeId ?? '').trim();
      const workDate = String(body.workDate ?? '').trim();
      const parsedDay = Number(workDate.slice(-2));
      if (employeeId && Number.isFinite(parsedDay)) {
        const days = state.exemptDaysByEmployee[employeeId] ?? [];
        if (!days.includes(parsedDay)) {
          days.push(parsedDay);
          days.sort((a, b) => a - b);
        }
        state.exemptDaysByEmployee[employeeId] = days;
      }
      state.exemptPostCalls += 1;
      return json(route, { ok: true }, 201);
    }

    if (method === 'DELETE' && path === '/api/v1/hr/attendance/exempt-day') {
      const employeeId = String(url.searchParams.get('employeeId') ?? '').trim();
      const workDate = String(url.searchParams.get('workDate') ?? '').trim();
      const parsedDay = Number(workDate.slice(-2));
      if (employeeId && Number.isFinite(parsedDay)) {
        const days = state.exemptDaysByEmployee[employeeId] ?? [];
        state.exemptDaysByEmployee[employeeId] = days.filter((day) => day !== parsedDay);
      }
      state.exemptDeleteCalls += 1;
      return json(route, { ok: true });
    }

    if (method === 'POST' && path === '/api/v1/hr/attendance/office-import') {
      state.officeImportCalls += 1;
      return json(
        route,
        {
          totalRows: 2,
          importedCount: 1,
          skippedCount: 1,
          errors: [
            {
              rowIndex: 2,
              employeeCode: 'UNKNOWN',
              message: 'Không tìm thấy nhân sự.'
            }
          ]
        },
        201
      );
    }

    return json(route, { ok: true });
  });
}

test.describe('HR Attendance board', () => {
  test('renders monthly matrix, supports month/year filters, per-day EXEMPT actions, and office xlsx import', async ({ page }) => {
    const state: AttendanceMockState = {
      monthlyCalls: 0,
      remoteCheckedIn: false,
      checkOutCalls: 0,
      officeImportCalls: 0,
      exemptPostCalls: 0,
      exemptDeleteCalls: 0,
      methodByEmployee: {
        emp_remote: 'REMOTE_TRACKED',
        emp_office: 'OFFICE_EXCEL',
        emp_exempt: 'EXEMPT'
      },
      workedMinutesByEmployeeDay: {
        emp_remote: { 1: 8 * 60 + 30 },
        emp_office: { 1: 8 * 60 },
        emp_exempt: {}
      },
      exemptDaysByEmployee: {
        emp_remote: [],
        emp_office: [],
        emp_exempt: [1]
      }
    };

    await page.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'ADMIN');
    });
    await mockAttendanceApis(page, state);

    await page.goto('/modules/hr/attendance');
    await expect(page.getByRole('heading', { name: 'Bảng chấm công theo tháng' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '08:30' }).first()).toBeVisible();
    await expect(page.getByText('Miễn chấm công').first()).toBeVisible();
    await expect(page.getByText('--')).toHaveCount(0);

    const exemptRow = page.locator('tr', { hasText: 'Exempt User' });
    await expect(exemptRow.locator('td').nth(1)).toHaveText('');

    const officeRow = page.locator('tr', { hasText: 'Office User' });
    await expect(officeRow.locator('td').nth(2)).toHaveText('');

    const monthSelect = page.locator('label:has-text("Tháng")').locator('..').locator('select');
    const yearSelect = page.locator('label:has-text("Năm")').locator('..').locator('select');

    const currentYear = new Date().getFullYear();
    await yearSelect.selectOption(String(currentYear + 1));
    await expect.poll(() => state.monthlyCalls).toBeGreaterThan(1);

    await monthSelect.selectOption('2');
    await expect.poll(() => state.monthlyCalls).toBeGreaterThan(2);

    await officeRow.locator('select').selectOption('EXEMPT');
    await expect(page.getByText('Đã cập nhật phương pháp chấm công.')).toBeVisible();
    await expect(officeRow.locator('select')).toHaveValue('EXEMPT');
    await expect(officeRow.locator('td').nth(1)).toHaveText('08:00');

    await officeRow.getByRole('button', { name: 'Đánh dấu miễn chấm công' }).first().click();
    await expect.poll(() => state.exemptPostCalls).toBe(1);
    await expect(officeRow.getByText('WORKED: 1 | EXEMPT: 1')).toBeVisible();

    await officeRow.getByRole('button', { name: 'Đánh dấu miễn chấm công' }).first().click();
    await expect.poll(() => state.exemptPostCalls).toBe(2);
    await expect(officeRow.getByText('WORKED: 1 | EXEMPT: 2')).toBeVisible();

    await officeRow.getByRole('button', { name: 'Gỡ miễn chấm công' }).first().click();
    await expect.poll(() => state.exemptDeleteCalls).toBe(1);
    await expect(officeRow.getByText('WORKED: 1 | EXEMPT: 1')).toBeVisible();

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet([
      {
        employeeCode: 'O001',
        workDate: '2026-03-15',
        workedHours: 8,
        workedMinutes: 30
      },
      {
        employeeCode: 'UNKNOWN',
        workDate: '2026-03-15',
        workedHours: 8,
        workedMinutes: 0
      }
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
    const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    await page.locator('input[type="file"]').setInputFiles({
      name: 'office-attendance.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(fileBuffer)
    });

    await expect(page.getByText('Import thành công: 1')).toBeVisible();
    await expect(page.getByText('Bỏ qua/Lỗi: 1')).toBeVisible();
    expect(state.officeImportCalls).toBe(1);
  });

  test('auto check-out when remote user is idle (timeout override for test)', async ({ page }) => {
    const state: AttendanceMockState = {
      monthlyCalls: 0,
      remoteCheckedIn: false,
      checkOutCalls: 0,
      officeImportCalls: 0,
      exemptPostCalls: 0,
      exemptDeleteCalls: 0,
      methodByEmployee: {
        emp_remote: 'REMOTE_TRACKED',
        emp_office: 'OFFICE_EXCEL',
        emp_exempt: 'EXEMPT'
      },
      workedMinutesByEmployeeDay: {
        emp_remote: { 1: 8 * 60 + 30 },
        emp_office: { 1: 8 * 60 },
        emp_exempt: {}
      },
      exemptDaysByEmployee: {
        emp_remote: [],
        emp_office: [],
        emp_exempt: [1]
      }
    };

    await page.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'USER');
    });
    await mockAttendanceApis(page, state);

    await page.goto('/modules/hr/attendance');
    await page.getByRole('button', { name: 'Check-in' }).click();
    await expect(page.getByText('Đang check-in từ')).toBeVisible();

    await expect.poll(() => state.checkOutCalls, { timeout: 8_000 }).toBeGreaterThan(0);
    await expect(page.getByText('Hệ thống tự check-out do không có click trong 6 phút.')).toBeVisible();
  });
});
