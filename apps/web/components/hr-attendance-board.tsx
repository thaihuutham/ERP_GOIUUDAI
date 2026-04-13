'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, RefreshCw, Undo2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { readStoredAuthSession } from '../lib/auth-session';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { downloadExcelTemplate } from '../lib/excel-template';
import { isValidCalendarDate } from '../lib/form-validation';
import { useAccessPolicy } from './access-policy-context';
import { ExcelImportBlock } from './ui/excel-import-block';
import { useUserRole } from './user-role-context';

type AttendanceMethod = 'REMOTE_TRACKED' | 'OFFICE_EXCEL' | 'EXEMPT';
type AttendanceDailyStatus = 'WORKED' | 'NO_DATA' | 'EXEMPT';

type AttendanceMonthlyCell = {
  day: number;
  workedMinutes: number;
  status: AttendanceDailyStatus;
};

type AttendanceMonthlyRow = {
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  attendanceMethod: AttendanceMethod;
  daily: AttendanceMonthlyCell[];
  monthTotalMinutes: number;
};

type AttendanceMonthlyPayload = {
  year: number;
  month: number;
  daysInMonth: number;
  rows: AttendanceMonthlyRow[];
};

type OfficeImportError = {
  rowIndex: number;
  employeeCode?: string;
  message: string;
};

type OfficeImportResponse = {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errors: OfficeImportError[];
};

type OfficeImportRow = {
  employeeCode: string;
  workDate: string;
  workedHours: number;
  workedMinutes: number;
  note?: string;
};

type AttendanceRow = {
  id: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
};

type TodayAttendanceState = {
  isLoading: boolean;
  isCheckedIn: boolean;
  workedMinutes: number;
  openSessionStartedAt: string | null;
};

const DEFAULT_REMOTE_IDLE_TIMEOUT_MS = process.env.NODE_ENV === 'production' ? 6 * 60 * 1000 : 6_000;
const REMOTE_IDLE_TIMEOUT_MS_VALUE = Number(
  process.env.NEXT_PUBLIC_REMOTE_IDLE_TIMEOUT_MS ?? DEFAULT_REMOTE_IDLE_TIMEOUT_MS
);
const REMOTE_IDLE_TIMEOUT_MS = Number.isFinite(REMOTE_IDLE_TIMEOUT_MS_VALUE) && REMOTE_IDLE_TIMEOUT_MS_VALUE > 0
  ? REMOTE_IDLE_TIMEOUT_MS_VALUE
  : DEFAULT_REMOTE_IDLE_TIMEOUT_MS;

function createYearOptions(centerYear: number, span = 5) {
  return Array.from({ length: span * 2 + 1 }, (_, index) => centerYear - span + index);
}

function formatMinutes(minutes: number) {
  const safe = Math.max(0, Math.trunc(minutes));
  const hh = Math.floor(safe / 60);
  const mm = safe % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateByParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateTime(value: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function methodLabel(method: AttendanceMethod) {
  if (method === 'OFFICE_EXCEL') return 'Văn phòng (Excel cuối tháng)';
  if (method === 'EXEMPT') return 'Miễn chấm công';
  return 'Remote (Check-in online)';
}

function toNonNegativeInt(value: unknown) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.trunc(numeric));
}

function normalizeExcelDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateOnly(value);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && isValidCalendarDate(parsed.y, parsed.m, parsed.d)) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const ddmmyyyy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]);
    const year = Number(ddmmyyyy[3]);
    if (isValidCalendarDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const yyyymmdd = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymmdd) {
    const year = Number(yyyymmdd[1]);
    const month = Number(yyyymmdd[2]);
    const day = Number(yyyymmdd[3]);
    if (isValidCalendarDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const isoDatePrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[Tt\s])/);
  if (isoDatePrefix) {
    const year = Number(isoDatePrefix[1]);
    const month = Number(isoDatePrefix[2]);
    const day = Number(isoDatePrefix[3]);
    if (isValidCalendarDate(year, month, day)) {
      return `${year}-${isoDatePrefix[2]}-${isoDatePrefix[3]}`;
    }
  }

  return null;
}

function extractHeaderValue(row: Record<string, unknown>, keys: string[]) {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(key.trim().toLowerCase(), value);
  }
  for (const key of keys) {
    if (!normalized.has(key)) {
      continue;
    }
    const value = normalized.get(key);
    if (value === undefined || value === null || value === '') {
      continue;
    }
    return value;
  }
  return undefined;
}

async function parseOfficeXlsx(file: File): Promise<OfficeImportRow[]> {
  const fileBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheet];
  const parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: true,
    defval: null
  });

  return parsedRows.map((row) => {
    const employeeCodeRaw = extractHeaderValue(row, [
      'employeecode',
      'employee_code',
      'code',
      'mã nhân viên',
      'ma nhan vien',
      'mã nv',
      'ma nv'
    ]);
    const workDateRaw = extractHeaderValue(row, ['workdate', 'work_date', 'date', 'ngày', 'ngay', 'ngày công', 'ngay cong']);
    const workedHoursRaw = extractHeaderValue(row, ['workedhours', 'worked_hours', 'hours', 'giờ', 'gio', 'số giờ', 'so gio']);
    const workedMinutesRaw = extractHeaderValue(row, [
      'workedminutes',
      'worked_minutes',
      'minutes',
      'phút',
      'phut',
      'số phút',
      'so phut'
    ]);
    const noteRaw = extractHeaderValue(row, ['note', 'ghi chú', 'ghi chu']);

    return {
      employeeCode: String(employeeCodeRaw ?? '').trim(),
      workDate: normalizeExcelDate(workDateRaw) ?? '',
      workedHours: toNonNegativeInt(workedHoursRaw),
      workedMinutes: toNonNegativeInt(workedMinutesRaw),
      note: noteRaw ? String(noteRaw).trim() : undefined
    };
  });
}

function normalizeAttendanceList(payload: unknown): AttendanceRow[] {
  return normalizeListPayload(payload) as AttendanceRow[];
}

export function HrAttendanceBoard() {
  const { authEnabled, logout } = useUserRole();
  const { canAction } = useAccessPolicy();
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [monthlyData, setMonthlyData] = useState<AttendanceMonthlyPayload | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 50;
  const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);
  const [todayState, setTodayState] = useState<TodayAttendanceState>({
    isLoading: false,
    isCheckedIn: false,
    workedMinutes: 0,
    openSessionStartedAt: null
  });
  const [selectedRemoteEmployeeId, setSelectedRemoteEmployeeId] = useState<string>('');
  const [isSubmittingRemoteAction, setIsSubmittingRemoteAction] = useState(false);
  const [methodUpdatingEmployeeId, setMethodUpdatingEmployeeId] = useState<string | null>(null);
  const [isImportingOfficeFile, setIsImportingOfficeFile] = useState(false);
  const [importResult, setImportResult] = useState<OfficeImportResponse | null>(null);
  const [exemptDayActionKey, setExemptDayActionKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const inactivityTimerRef = useRef<number | null>(null);
  const handlingInactivityRef = useRef(false);

  const canManageAttendance = canAction('hr', 'APPROVE');
  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        value: index + 1,
        label: `Tháng ${index + 1}`
      })),
    []
  );
  const yearOptions = useMemo(() => createYearOptions(new Date().getFullYear(), 5), []);
  const authEmployeeId = authEnabled ? String(readStoredAuthSession()?.user?.employeeId ?? '').trim() : '';
  const selectableEmployees = useMemo(
    () => monthlyData?.rows ?? [],
    [monthlyData?.rows]
  );

  const activeRemoteEmployeeId = authEnabled ? authEmployeeId || null : selectedRemoteEmployeeId || null;
  const activeRemoteEmployee = useMemo(
    () => (monthlyData?.rows ?? []).find((row) => row.employeeId === activeRemoteEmployeeId) ?? null,
    [activeRemoteEmployeeId, monthlyData?.rows]
  );
  const canUseRemoteCheckIn = Boolean(activeRemoteEmployeeId);

  const loadMonthlyAttendance = useCallback(async () => {
    setIsLoadingMonthly(true);
    setErrorMessage(null);

    try {
      const payload = await apiRequest<AttendanceMonthlyPayload>('/hr/attendance/monthly', {
        query: { year: selectedYear, month: selectedMonth }
      });
      setMonthlyData(payload);

      if (!authEnabled) {
        const firstEmployeeId = payload.rows[0]?.employeeId ?? '';
        setSelectedRemoteEmployeeId((current) => {
          if (current && payload.rows.some((row) => row.employeeId === current)) {
            return current;
          }
          return firstEmployeeId;
        });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tải bảng chấm công theo tháng.');
      setMonthlyData(null);
    } finally {
      setIsLoadingMonthly(false);
    }
  }, [authEnabled, selectedMonth, selectedYear]);

  const loadTodayAttendance = useCallback(async () => {
    if (!activeRemoteEmployeeId) {
      setTodayState({
        isLoading: false,
        isCheckedIn: false,
        workedMinutes: 0,
        openSessionStartedAt: null
      });
      return;
    }

    setTodayState((prev) => ({ ...prev, isLoading: true }));
    try {
      const today = formatDateOnly(new Date());
      const payload = await apiRequest('/hr/attendance', {
        query: {
          employeeId: activeRemoteEmployeeId,
          date: today,
          limit: 100
        }
      });
      const rows = normalizeAttendanceList(payload);

      let workedMinutes = 0;
      let openSessionStartedAt: string | null = null;
      const now = Date.now();

      rows.forEach((row) => {
        const persistedMinutes = toNonNegativeInt(row.workedMinutes ?? 0);
        let rowWorkedMinutes = persistedMinutes;
        if (row.checkInAt && !row.checkOutAt) {
          const startedAt = new Date(row.checkInAt);
          if (!Number.isNaN(startedAt.getTime())) {
            rowWorkedMinutes += Math.max(0, Math.floor((now - startedAt.getTime()) / 60000));
            openSessionStartedAt = row.checkInAt;
          }
        }
        workedMinutes += rowWorkedMinutes;
      });

      setTodayState({
        isLoading: false,
        isCheckedIn: Boolean(openSessionStartedAt),
        workedMinutes,
        openSessionStartedAt
      });
    } catch (error) {
      setTodayState({
        isLoading: false,
        isCheckedIn: false,
        workedMinutes: 0,
        openSessionStartedAt: null
      });
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tải trạng thái chấm công hôm nay.');
    }
  }, [activeRemoteEmployeeId]);

  useEffect(() => {
    void loadMonthlyAttendance();
    setCurrentPage(1);
  }, [loadMonthlyAttendance]);

  useEffect(() => {
    void loadTodayAttendance();
  }, [loadTodayAttendance]);

  const handleRefresh = async () => {
    await Promise.all([loadMonthlyAttendance(), loadTodayAttendance()]);
  };

  const handleChangeEmployeeMethod = async (employeeId: string, attendanceMethod: AttendanceMethod) => {
    setMethodUpdatingEmployeeId(employeeId);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await apiRequest(`/hr/employees/${employeeId}`, {
        method: 'PATCH',
        body: { attendanceMethod }
      });
      setNoticeMessage('Đã cập nhật phương pháp chấm công.');
      await Promise.all([loadMonthlyAttendance(), loadTodayAttendance()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật phương pháp chấm công.');
    } finally {
      setMethodUpdatingEmployeeId(null);
    }
  };

  const handleRemoteAction = async (action: 'check-in' | 'check-out') => {
    if (!activeRemoteEmployeeId) {
      setErrorMessage('Thiếu nhân sự để thao tác chấm công.');
      return;
    }
    setIsSubmittingRemoteAction(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const today = formatDateOnly(new Date());
      await apiRequest(`/hr/attendance/${action}`, {
        method: 'POST',
        body: {
          employeeId: activeRemoteEmployeeId,
          workDate: today
        }
      });
      setNoticeMessage(action === 'check-in' ? 'Check-in thành công.' : 'Check-out thành công.');
      await Promise.all([loadMonthlyAttendance(), loadTodayAttendance()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Thao tác chấm công thất bại.');
    } finally {
      setIsSubmittingRemoteAction(false);
    }
  };

  const handleOfficeFileUpload = async (file: File) => {
    if (!file) {
      return;
    }

    setIsImportingOfficeFile(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    setImportResult(null);

    try {
      const rows = await parseOfficeXlsx(file);
      const payload = await apiRequest<OfficeImportResponse>('/hr/attendance/office-import', {
        method: 'POST',
        body: {
          year: selectedYear,
          month: selectedMonth,
          fileName: file.name,
          rows
        }
      });
      setImportResult(payload);
      setNoticeMessage(`Đã xử lý import ${payload.totalRows} dòng.`);
      await loadMonthlyAttendance();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể import file chấm công văn phòng.');
    } finally {
      setIsImportingOfficeFile(false);
    }
  };

  const handleDownloadOfficeImportTemplate = () => {
    downloadExcelTemplate('attendance-office-import-template.xlsx', 'Attendance', [
      {
        employeeCode: 'NV001',
        workDate: '2026-04-01',
        workedHours: 8,
        workedMinutes: 0,
        note: 'Di lam full ngay'
      },
      {
        employeeCode: 'NV002',
        workDate: '2026-04-01',
        workedHours: 7,
        workedMinutes: 30,
        note: 'Co tang ca 30 phut'
      }
    ]);
  };

  const handleToggleExemptDay = async (employeeId: string, day: number, isCurrentlyExempt: boolean) => {
    const workDate = formatDateByParts(selectedYear, selectedMonth, day);
    const actionKey = `${employeeId}-${workDate}`;
    setExemptDayActionKey(actionKey);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      if (isCurrentlyExempt) {
        await apiRequest('/hr/attendance/exempt-day', {
          method: 'DELETE',
          query: {
            employeeId,
            workDate
          }
        });
        setNoticeMessage(`Đã gỡ miễn chấm công ngày ${workDate}.`);
      } else {
        await apiRequest('/hr/attendance/exempt-day', {
          method: 'POST',
          body: {
            employeeId,
            workDate
          }
        });
        setNoticeMessage(`Đã đánh dấu miễn chấm công ngày ${workDate}.`);
      }
      await Promise.all([loadMonthlyAttendance(), loadTodayAttendance()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật ngày miễn chấm công.');
    } finally {
      setExemptDayActionKey(null);
    }
  };

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current !== null) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const handleInactivityTimeout = useCallback(async () => {
    if (handlingInactivityRef.current) {
      return;
    }
    handlingInactivityRef.current = true;

    const employeeId = activeRemoteEmployeeId;
    try {
      if (employeeId) {
        try {
          await apiRequest('/hr/attendance/check-out', {
            method: 'POST',
            body: {
              employeeId,
              workDate: formatDateOnly(new Date())
            }
          });
        } catch {
          // best effort as requested
        }
      }
      setNoticeMessage('Hệ thống tự check-out do không có click trong 6 phút.');
      await Promise.all([loadMonthlyAttendance(), loadTodayAttendance()]);
    } finally {
      try {
        await logout();
      } catch {
        // ignore client-side logout transport errors
      }
      handlingInactivityRef.current = false;
    }
  }, [activeRemoteEmployeeId, loadMonthlyAttendance, loadTodayAttendance, logout]);

  const resetInactivityTimer = useCallback(() => {
    if (!todayState.isCheckedIn || !canUseRemoteCheckIn) {
      return;
    }
    clearInactivityTimer();
    inactivityTimerRef.current = window.setTimeout(() => {
      void handleInactivityTimeout();
    }, REMOTE_IDLE_TIMEOUT_MS);
  }, [canUseRemoteCheckIn, clearInactivityTimer, handleInactivityTimeout, todayState.isCheckedIn]);

  useEffect(() => {
    if (!todayState.isCheckedIn || !canUseRemoteCheckIn) {
      clearInactivityTimer();
      return;
    }

    let throttleTimeout: number | null = null;
    const onClick = () => {
      if (throttleTimeout !== null) return;
      throttleTimeout = window.setTimeout(() => {
        throttleTimeout = null;
      }, 1000);
      resetInactivityTimer();
    };
    
    window.addEventListener('click', onClick, true);
    resetInactivityTimer();

    return () => {
      window.removeEventListener('click', onClick, true);
      clearInactivityTimer();
      if (throttleTimeout !== null) window.clearTimeout(throttleTimeout);
    };
  }, [canUseRemoteCheckIn, clearInactivityTimer, resetInactivityTimer, todayState.isCheckedIn]);

  const daysInMonth = monthlyData?.daysInMonth ?? new Date(selectedYear, selectedMonth, 0).getDate();
  const employeeColumnWidth = 280;
  const dayColumnWidth = 56;
  const totalColumnWidth = 130;
  const tableMinWidth = employeeColumnWidth + totalColumnWidth + daysInMonth * dayColumnWidth;
  
  const totalRecords = monthlyData?.rows.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / recordsPerPage));
  const startIndex = (currentPage - 1) * recordsPerPage;
  const currentRows = monthlyData?.rows.slice(startIndex, startIndex + recordsPerPage) ?? [];

  return (
    <article className="module-workbench">
      <header className="module-header">
        <div>
          <h1>Bảng chấm công theo tháng</h1>
          <p>Quản lý đa phương thức: Remote check-in/out, Office import Excel, và nhân sự miễn chấm công.</p>
        </div>
      </header>

      <section className="module-card">
        <div className="main-toolbar" style={{ borderBottom: 'none', paddingInline: 0, background: 'transparent' }}>
          <div className="toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
            <div className="field" style={{ minWidth: '150px' }}>
              <label>Tháng</label>
              <select value={String(selectedMonth)} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                {monthOptions.map((option) => (
                  <option key={`month-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: '130px' }}>
              <label>Năm</label>
              <select value={String(selectedYear)} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                {yearOptions.map((year) => (
                  <option key={`year-${year}`} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="toolbar-right">
            <button type="button" className="btn btn-ghost" onClick={() => void handleRefresh()} disabled={isLoadingMonthly}>
              <RefreshCw size={16} />
              Làm mới
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="finance-alert finance-alert-danger" style={{ marginBottom: '0.8rem' }}>
            <strong>Lỗi:</strong> {errorMessage}
          </div>
        ) : null}
        {noticeMessage ? (
          <div className="finance-alert finance-alert-success" style={{ marginBottom: '0.8rem' }}>
            <strong>Thông báo:</strong> {noticeMessage}
          </div>
        ) : null}

        <div className="standard-table-wrap" style={{ maxWidth: '100%', overflowX: 'auto' }}>
          <table className="standard-table-table" style={{ minWidth: `${tableMinWidth}px`, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 3,
                    background: '#fff',
                    minWidth: `${employeeColumnWidth}px`,
                    width: `${employeeColumnWidth}px`,
                    border: '1px solid #dfe7e2'
                  }}
                >
                  Nhân sự
                </th>
                {Array.from({ length: daysInMonth }, (_, index) => (
                  <th
                    key={`day-header-${index + 1}`}
                    style={{
                      textAlign: 'center',
                      minWidth: `${dayColumnWidth}px`,
                      width: `${dayColumnWidth}px`,
                      padding: '0.34rem 0.18rem',
                      fontSize: '0.75rem',
                      border: '1px solid #dfe7e2'
                    }}
                  >
                    {index + 1}
                  </th>
                ))}
                <th
                  style={{
                    minWidth: `${totalColumnWidth}px`,
                    width: `${totalColumnWidth}px`,
                    textAlign: 'center',
                    border: '1px solid #dfe7e2'
                  }}
                >
                  Tổng tháng
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoadingMonthly ? (
                <tr>
                  <td className="standard-table-empty-row" colSpan={daysInMonth + 2}>
                    Đang tải dữ liệu chấm công...
                  </td>
                </tr>
              ) : currentRows.length === 0 ? (
                <tr>
                  <td className="standard-table-empty-row" colSpan={daysInMonth + 2}>
                    Không có dữ liệu chấm công.
                  </td>
                </tr>
              ) : (
                currentRows.map((row) => {
                  const workedDaysCount = row.daily.filter((cell) => cell.status === 'WORKED' && cell.workedMinutes > 0).length;
                  const exemptDaysCount = row.daily.filter((cell) => cell.status === 'EXEMPT').length;
                  const totalLabel =
                    row.monthTotalMinutes > 0
                      ? formatMinutes(row.monthTotalMinutes)
                      : exemptDaysCount > 0
                        ? 'Miễn chấm công'
                        : formatMinutes(0);

                  return (
                    <tr key={row.employeeId} className="standard-table-row">
                      <td
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                        background: '#fff',
                        border: '1px solid #dfe7e2',
                        minWidth: `${employeeColumnWidth}px`,
                        width: `${employeeColumnWidth}px`,
                        padding: '0.48rem 0.56rem',
                        verticalAlign: 'top'
                      }}
                    >
                      <div style={{ display: 'grid', gap: '0.35rem' }}>
                        <div style={{ fontWeight: 600 }}>
                          {row.employeeName}
                          {row.employeeCode ? (
                            <span style={{ color: 'var(--muted)', marginLeft: '0.45rem', fontWeight: 500 }}>
                              ({row.employeeCode})
                            </span>
                          ) : null}
                        </div>
                        <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{methodLabel(row.attendanceMethod)}</div>
                        <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                          WORKED: {workedDaysCount} | EXEMPT: {exemptDaysCount}
                        </div>
                        {canManageAttendance ? (
                          <select
                            value={row.attendanceMethod}
                            disabled={methodUpdatingEmployeeId === row.employeeId}
                            onChange={(event) =>
                              void handleChangeEmployeeMethod(row.employeeId, event.target.value as AttendanceMethod)
                            }
                          >
                            <option value="REMOTE_TRACKED">Remote (Check-in online)</option>
                            <option value="OFFICE_EXCEL">Văn phòng (Excel)</option>
                            <option value="EXEMPT">Miễn chấm công</option>
                          </select>
                        ) : null}
                      </div>
                      </td>

                      {row.daily.map((cell) => {
                        const workDate = formatDateByParts(selectedYear, selectedMonth, cell.day);
                        const actionKey = `${row.employeeId}-${workDate}`;
                        const canMarkExempt = canManageAttendance && cell.status === 'NO_DATA';
                        const canUnmarkExempt = canManageAttendance && cell.status === 'EXEMPT';
                        const isExemptActionLoading = exemptDayActionKey === actionKey;
                        return (
                          <td
                            key={`${row.employeeId}-${cell.day}`}
                            style={{
                              textAlign: 'center',
                              whiteSpace: 'nowrap',
                              minWidth: `${dayColumnWidth}px`,
                              width: `${dayColumnWidth}px`,
                              padding: '0.36rem 0.18rem',
                              fontSize: '0.76rem',
                              border: '1px solid #dfe7e2'
                            }}
                          >
                            <div style={{ display: 'grid', justifyItems: 'center', gap: '0.2rem' }}>
                              <span>{cell.status === 'WORKED' && cell.workedMinutes > 0 ? formatMinutes(cell.workedMinutes) : ''}</span>
                              {canMarkExempt ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ fontSize: '0.68rem', padding: '0.08rem 0.2rem', lineHeight: 0 }}
                                  onClick={() => void handleToggleExemptDay(row.employeeId, cell.day, false)}
                                  disabled={isExemptActionLoading}
                                  aria-label="Đánh dấu miễn chấm công"
                                  title="Đánh dấu miễn chấm công"
                                >
                                  <Ban size={12} />
                                </button>
                              ) : null}
                              {canUnmarkExempt ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ fontSize: '0.68rem', padding: '0.08rem 0.2rem', lineHeight: 0 }}
                                  onClick={() => void handleToggleExemptDay(row.employeeId, cell.day, true)}
                                  disabled={isExemptActionLoading}
                                  aria-label="Gỡ miễn chấm công"
                                  title="Gỡ miễn chấm công"
                                >
                                  <Undo2 size={12} />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}

                      <td
                        style={{
                          textAlign: 'center',
                          fontWeight: 600,
                          minWidth: `${totalColumnWidth}px`,
                          width: `${totalColumnWidth}px`,
                          padding: '0.36rem 0.3rem',
                          fontSize: '0.8rem',
                          border: '1px solid #dfe7e2'
                        }}
                      >
                        {totalLabel}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalRecords > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
              Hiển thị {startIndex + 1} - {Math.min(startIndex + recordsPerPage, totalRecords)} / {totalRecords} nhân sự
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button 
                className="btn btn-ghost" 
                disabled={currentPage === 1} 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                Trước
              </button>
              <span style={{ fontSize: '0.875rem' }}>{currentPage} / {totalPages}</span>
              <button 
                className="btn btn-ghost" 
                disabled={currentPage >= totalPages} 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              >
                Tiếp
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="module-card">
        <h3>Remote Check-in (Self)</h3>
        <p style={{ color: 'var(--muted)', marginBottom: '0.9rem' }}>
          Nếu đang check-in remote, hệ thống sẽ tự check-out và logout khi không có click trong 6 phút.
        </p>

        {!authEnabled ? (
          <div className="field" style={{ maxWidth: '340px', marginBottom: '0.9rem' }}>
            <label>Chọn nhân sự (môi trường AUTH tắt)</label>
            <select value={selectedRemoteEmployeeId} onChange={(event) => setSelectedRemoteEmployeeId(event.target.value)}>
              {selectableEmployees.length === 0 ? <option value="">Không có nhân sự</option> : null}
              {selectableEmployees.map((row) => (
                <option key={row.employeeId} value={row.employeeId}>
                  {row.employeeName}
                  {row.employeeCode ? ` (${row.employeeCode})` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {authEnabled && !authEmployeeId ? (
          <p style={{ color: 'var(--danger)' }}>
            Tài khoản hiện tại chưa gắn `employeeId`, chưa thể chấm công self remote.
          </p>
        ) : null}

        <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '0.9rem' }}>
          <div>
            <strong>Trạng thái hôm nay:</strong>{' '}
            {todayState.isLoading
              ? 'Đang tải...'
              : todayState.isCheckedIn
                ? `Đang check-in từ ${formatDateTime(todayState.openSessionStartedAt)}`
                : 'Chưa check-in'}
          </div>
          <div>
            <strong>Tổng thời gian hôm nay:</strong> {formatMinutes(todayState.workedMinutes)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canUseRemoteCheckIn || todayState.isCheckedIn || isSubmittingRemoteAction}
            onClick={() => void handleRemoteAction('check-in')}
          >
            Check-in
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!canUseRemoteCheckIn || !todayState.isCheckedIn || isSubmittingRemoteAction}
            onClick={() => void handleRemoteAction('check-out')}
          >
            Check-out
          </button>
        </div>
      </section>

      <ExcelImportBlock<OfficeImportError>
        title="Import công văn phòng (.xlsx)"
        description="Frontend đọc file và gửi JSON rows lên API import để cập nhật công theo ngày."
        fileLabel="File chấm công văn phòng"
        onDownloadTemplate={handleDownloadOfficeImportTemplate}
        onFileSelected={handleOfficeFileUpload}
        canImport={canManageAttendance}
        deniedMessage="Chỉ admin được import công văn phòng."
        isLoading={isImportingOfficeFile}
        loadingText="Đang parse và import file..."
        summary={importResult}
        formatError={(error) => `Dòng ${error.rowIndex}${error.employeeCode ? ` (${error.employeeCode})` : ''}: ${error.message}`}
      />
    </article>
  );
}
