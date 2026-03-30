'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { canAccessModule } from '../lib/rbac';
import { useUserRole } from './user-role-context';

type GenericStatus = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';

type Employee = {
  id: string;
  code?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  joinDate?: string | null;
  employmentType?: string | null;
  baseSalary?: number | string | null;
  status?: string | null;
};

type AttendanceRow = {
  id: string;
  employeeId?: string | null;
  workDate?: string | null;
  workShiftId?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  lateMinutes?: number | null;
  overtimeMinutes?: number | null;
  status?: string | null;
  note?: string | null;
};

type LeaveRequest = {
  id: string;
  employeeId?: string | null;
  leaveType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  durationDays?: number | string | null;
  status?: string | null;
  approvedBy?: string | null;
  reason?: string | null;
};

type LeaveBalance = {
  employeeId?: string;
  year?: number;
  balances?: Array<{
    leavePolicyId?: string;
    name?: string;
    leaveType?: string;
    annualQuotaDays?: number;
    usedDays?: number;
    remainingDays?: number;
  }>;
};

type Payroll = {
  id: string;
  employeeId?: string | null;
  payMonth?: number | null;
  payYear?: number | null;
  workingDays?: number | null;
  overtimeHours?: number | string | null;
  grossSalary?: number | string | null;
  deduction?: number | string | null;
  netSalary?: number | string | null;
  status?: string | null;
  paidAt?: string | null;
};

type PayrollLine = {
  id: string;
  payrollId?: string | null;
  componentCode?: string | null;
  componentName?: string | null;
  componentType?: string | null;
  amount?: number | string | null;
  isTaxable?: boolean | null;
  note?: string | null;
};

type CreateEmployeeForm = {
  code: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  joinDate: string;
  employmentType: EmploymentType;
  baseSalary: string;
  status: Exclude<GenericStatus, 'ALL'>;
};

type CheckInForm = {
  workDate: string;
  workShiftId: string;
  note: string;
};

type CheckOutForm = {
  workDate: string;
  note: string;
};

type CreateLeaveForm = {
  leavePolicyId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  attachmentUrl: string;
};

type GeneratePayrollForm = {
  month: string;
  year: string;
  employeeId: string;
  note: string;
};

const STATUS_OPTIONS: GenericStatus[] = ['ALL', 'ACTIVE', 'INACTIVE', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED'];
const EMPLOYMENT_TYPES: EmploymentType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function toCurrency(value: number | string | null | undefined) {
  return toNumber(value).toLocaleString('vi-VN');
}

function toDateTime(value: string | null | undefined) {
  if (!value) {
    return '--';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('vi-VN');
}

function normalizeArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const mapped = payload as Record<string, unknown>;
    if (Array.isArray(mapped.items)) {
      return mapped.items as T[];
    }
  }
  return [];
}

function normalizeObject<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return payload as T;
}

function statusClass(status: string | null | undefined) {
  switch (status) {
    case 'APPROVED':
    case 'ACTIVE':
      return 'finance-status-pill finance-status-pill-success';
    case 'PENDING':
    case 'DRAFT':
      return 'finance-status-pill finance-status-pill-warning';
    case 'REJECTED':
    case 'INACTIVE':
      return 'finance-status-pill finance-status-pill-danger';
    default:
      return 'finance-status-pill finance-status-pill-neutral';
  }
}

export function HrOperationsBoard() {
  const { role } = useUserRole();
  const canView = canAccessModule(role, 'hr');
  const canManagerActions = role === 'MANAGER' || role === 'ADMIN';

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [leaveStatus, setLeaveStatus] = useState<GenericStatus>('ALL');
  const [limit, setLimit] = useState(20);
  const [leaveBalanceYear, setLeaveBalanceYear] = useState(String(new Date().getFullYear()));

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [payrollLines, setPayrollLines] = useState<PayrollLine[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedPayrollId, setSelectedPayrollId] = useState('');
  const [approverId, setApproverId] = useState('');

  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [isLoadingLeaves, setIsLoadingLeaves] = useState(false);
  const [isLoadingPayrolls, setIsLoadingPayrolls] = useState(false);
  const [isLoadingPayrollLines, setIsLoadingPayrollLines] = useState(false);
  const [isLoadingLeaveBalance, setIsLoadingLeaveBalance] = useState(false);

  const [createEmployeeForm, setCreateEmployeeForm] = useState<CreateEmployeeForm>({
    code: '',
    fullName: '',
    email: '',
    phone: '',
    department: '',
    position: '',
    joinDate: '',
    employmentType: 'FULL_TIME',
    baseSalary: '',
    status: 'ACTIVE'
  });

  const [checkInForm, setCheckInForm] = useState<CheckInForm>({
    workDate: '',
    workShiftId: '',
    note: ''
  });

  const [checkOutForm, setCheckOutForm] = useState<CheckOutForm>({
    workDate: '',
    note: ''
  });

  const [createLeaveForm, setCreateLeaveForm] = useState<CreateLeaveForm>({
    leavePolicyId: '',
    leaveType: '',
    startDate: '',
    endDate: '',
    reason: '',
    attachmentUrl: ''
  });

  const [generatePayrollForm, setGeneratePayrollForm] = useState<GeneratePayrollForm>({
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
    employeeId: '',
    note: ''
  });

  const selectedEmployee = useMemo(() => employees.find((row) => row.id === selectedEmployeeId) ?? null, [employees, selectedEmployeeId]);
  const selectedPayroll = useMemo(() => payrolls.find((row) => row.id === selectedPayrollId) ?? null, [payrolls, selectedPayrollId]);

  useEffect(() => {
    if (!selectedEmployeeId && employees.length > 0) {
      setSelectedEmployeeId(employees[0].id);
      return;
    }
    if (selectedEmployeeId && employees.length > 0 && !employees.some((row) => row.id === selectedEmployeeId)) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  useEffect(() => {
    if (!selectedPayrollId && payrolls.length > 0) {
      setSelectedPayrollId(payrolls[0].id);
      return;
    }
    if (selectedPayrollId && payrolls.length > 0 && !payrolls.some((row) => row.id === selectedPayrollId)) {
      setSelectedPayrollId(payrolls[0].id);
    }
  }, [payrolls, selectedPayrollId]);

  const loadEmployees = async () => {
    if (!canView) return;
    setIsLoadingEmployees(true);
    try {
      const payload = await apiRequest<unknown>('/hr/employees', {
        query: {
          q: employeeSearch,
          limit
        }
      });
      setEmployees(normalizeArray<Employee>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách nhân viên.');
      setEmployees([]);
    } finally {
      setIsLoadingEmployees(false);
    }
  };

  const loadAttendance = async () => {
    if (!canView || !selectedEmployeeId) {
      setAttendanceRows([]);
      return;
    }
    setIsLoadingAttendance(true);
    try {
      const payload = await apiRequest<unknown>('/hr/attendance', {
        query: {
          employeeId: selectedEmployeeId,
          limit: 50
        }
      });
      setAttendanceRows(normalizeArray<AttendanceRow>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu chấm công.');
      setAttendanceRows([]);
    } finally {
      setIsLoadingAttendance(false);
    }
  };

  const loadLeaveRequests = async () => {
    if (!canView || !selectedEmployeeId) {
      setLeaveRequests([]);
      return;
    }
    setIsLoadingLeaves(true);
    try {
      const payload = await apiRequest<unknown>('/hr/leave-requests', {
        query: {
          employeeId: selectedEmployeeId,
          status: leaveStatus === 'ALL' ? undefined : leaveStatus,
          limit: 50
        }
      });
      setLeaveRequests(normalizeArray<LeaveRequest>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được đơn nghỉ phép.');
      setLeaveRequests([]);
    } finally {
      setIsLoadingLeaves(false);
    }
  };

  const loadPayrolls = async () => {
    if (!canView || !selectedEmployeeId) {
      setPayrolls([]);
      return;
    }
    setIsLoadingPayrolls(true);
    try {
      const payload = await apiRequest<unknown>('/hr/payrolls', {
        query: {
          employeeId: selectedEmployeeId,
          limit: 50
        }
      });
      setPayrolls(normalizeArray<Payroll>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được bảng lương.');
      setPayrolls([]);
    } finally {
      setIsLoadingPayrolls(false);
    }
  };

  const loadPayrollLines = async (payrollId: string | null) => {
    if (!canView || !payrollId) {
      setPayrollLines([]);
      return;
    }
    setIsLoadingPayrollLines(true);
    try {
      const payload = await apiRequest<unknown>(`/hr/payrolls/${payrollId}/lines`);
      setPayrollLines(normalizeArray<PayrollLine>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được chi tiết payroll line.');
      setPayrollLines([]);
    } finally {
      setIsLoadingPayrollLines(false);
    }
  };

  const loadLeaveBalance = async () => {
    if (!canView || !selectedEmployeeId) {
      setLeaveBalance(null);
      return;
    }
    setIsLoadingLeaveBalance(true);
    try {
      const payload = await apiRequest<unknown>(`/hr/employees/${selectedEmployeeId}/leave-balance`, {
        query: {
          year: leaveBalanceYear || undefined
        }
      });
      setLeaveBalance(normalizeObject<LeaveBalance>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được leave balance.');
      setLeaveBalance(null);
    } finally {
      setIsLoadingLeaveBalance(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, employeeSearch, limit]);

  useEffect(() => {
    void Promise.all([loadAttendance(), loadLeaveRequests(), loadPayrolls()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, selectedEmployeeId, leaveStatus]);

  useEffect(() => {
    void loadPayrollLines(selectedPayrollId || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, selectedPayrollId]);

  useEffect(() => {
    void loadLeaveBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, selectedEmployeeId]);

  const refreshAll = async () => {
    await Promise.all([loadEmployees(), loadAttendance(), loadLeaveRequests(), loadPayrolls(), loadPayrollLines(selectedPayrollId || null), loadLeaveBalance()]);
  };

  const onCreateEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManagerActions) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      if (!createEmployeeForm.fullName.trim()) {
        throw new Error('Họ tên nhân viên là bắt buộc.');
      }

      await apiRequest('/hr/employees', {
        method: 'POST',
        body: {
          code: createEmployeeForm.code || undefined,
          fullName: createEmployeeForm.fullName,
          email: createEmployeeForm.email || undefined,
          phone: createEmployeeForm.phone || undefined,
          department: createEmployeeForm.department || undefined,
          position: createEmployeeForm.position || undefined,
          joinDate: createEmployeeForm.joinDate || undefined,
          employmentType: createEmployeeForm.employmentType,
          baseSalary: createEmployeeForm.baseSalary ? Number(createEmployeeForm.baseSalary) : undefined,
          status: createEmployeeForm.status
        }
      });

      setResultMessage('Đã tạo hồ sơ nhân viên mới.');
      setCreateEmployeeForm((prev) => ({ ...prev, code: '', fullName: '', email: '', phone: '', department: '', position: '', joinDate: '', baseSalary: '' }));
      await loadEmployees();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo nhân viên.');
    }
  };

  const onCheckIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEmployeeId) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      await apiRequest('/hr/attendance/check-in', {
        method: 'POST',
        body: {
          employeeId: selectedEmployeeId,
          workDate: checkInForm.workDate || undefined,
          workShiftId: checkInForm.workShiftId || undefined,
          note: checkInForm.note || undefined
        }
      });
      setResultMessage('Check-in thành công.');
      setCheckInForm((prev) => ({ ...prev, note: '' }));
      await loadAttendance();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể check-in.');
    }
  };

  const onCheckOut = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEmployeeId) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      await apiRequest('/hr/attendance/check-out', {
        method: 'POST',
        body: {
          employeeId: selectedEmployeeId,
          workDate: checkOutForm.workDate || undefined,
          note: checkOutForm.note || undefined
        }
      });
      setResultMessage('Check-out thành công.');
      setCheckOutForm((prev) => ({ ...prev, note: '' }));
      await loadAttendance();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể check-out.');
    }
  };

  const onCreateLeaveRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEmployeeId) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      if (!createLeaveForm.startDate || !createLeaveForm.endDate) {
        throw new Error('Đơn nghỉ phép cần ngày bắt đầu và ngày kết thúc.');
      }

      await apiRequest('/hr/leave-requests', {
        method: 'POST',
        body: {
          employeeId: selectedEmployeeId,
          leavePolicyId: createLeaveForm.leavePolicyId || undefined,
          leaveType: createLeaveForm.leaveType || undefined,
          startDate: createLeaveForm.startDate,
          endDate: createLeaveForm.endDate,
          reason: createLeaveForm.reason || undefined,
          attachmentUrl: createLeaveForm.attachmentUrl || undefined
        }
      });

      setResultMessage('Đã tạo đơn nghỉ phép mới.');
      setCreateLeaveForm((prev) => ({ ...prev, leavePolicyId: '', leaveType: '', startDate: '', endDate: '', reason: '', attachmentUrl: '' }));
      await Promise.all([loadLeaveRequests(), loadLeaveBalance()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo đơn nghỉ phép.');
    }
  };

  const onLeaveDecision = async (leaveId: string, action: 'approve' | 'reject') => {
    if (!canManagerActions) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      await apiRequest(`/hr/leave-requests/${leaveId}/${action}`, {
        method: 'POST',
        body: {
          approverId: approverId || undefined
        }
      });
      setResultMessage(action === 'approve' ? 'Đã duyệt đơn nghỉ phép.' : 'Đã từ chối đơn nghỉ phép.');
      await Promise.all([loadLeaveRequests(), loadLeaveBalance()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể xử lý đơn nghỉ phép.');
    }
  };

  const onGeneratePayroll = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManagerActions) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      const month = Number(generatePayrollForm.month);
      const year = Number(generatePayrollForm.year);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Tháng bảng lương không hợp lệ.');
      }
      if (!Number.isInteger(year) || year < 2000) {
        throw new Error('Năm bảng lương không hợp lệ.');
      }

      await apiRequest('/hr/payrolls/generate', {
        method: 'POST',
        body: {
          month,
          year,
          employeeId: generatePayrollForm.employeeId || selectedEmployeeId || undefined,
          note: generatePayrollForm.note || undefined
        }
      });

      setResultMessage('Đã chạy generate payroll.');
      await loadPayrolls();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể generate payroll.');
    }
  };

  const onPayPayroll = async (payrollId: string) => {
    if (!canManagerActions) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      await apiRequest(`/hr/payrolls/${payrollId}/pay`, {
        method: 'POST'
      });
      setResultMessage('Đã đánh dấu payroll là đã thanh toán.');
      await loadPayrolls();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể pay payroll.');
    }
  };

  if (!canView) {
    return (
      <article className="module-workbench">
        <header className="module-header">
          <div>
            <h1>HR Operations Board</h1>
            <p>Bạn không có quyền truy cập phân hệ HR với vai trò hiện tại.</p>
          </div>
          <ul>
            <li>Vai trò hiện tại: {role}</li>
            <li>Đổi role ở toolbar để mô phỏng quyền.</li>
          </ul>
        </header>
      </article>
    );
  }

  return (
    <article className="module-workbench">
      <header className="module-header">
        <div>
          <h1>HR Operations Board</h1>
          <p>Luồng HR chuyên sâu: hồ sơ nhân sự, chấm công, nghỉ phép, quota nghỉ và bảng lương.</p>
        </div>
        <ul>
          <li>Employee master và filter theo từ khóa</li>
          <li>Attendance + Leave request + approve/reject</li>
          <li>Generate payroll, xem line item và mark paid</li>
        </ul>
      </header>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}
      {!canManagerActions ? (
        <p className="banner banner-warning">Vai trò `{role}` không có quyền duyệt phép/payroll, nhưng vẫn có thể thao tác attendance/leave self-service.</p>
      ) : null}

      <section className="hr-grid">
        <section className="panel-surface hr-panel">
          <div className="hr-panel-head">
            <h2>Employee Master</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
              Tải lại
            </button>
          </div>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="employee-search">Tìm nhân viên</label>
              <input id="employee-search" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Tên, email, phone, phòng ban" />
            </div>
            <div className="field">
              <label htmlFor="hr-limit">Limit</label>
              <select id="hr-limit" value={String(limit)} onChange={(event) => setLimit(Number(event.target.value))}>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          {isLoadingEmployees ? <p className="muted">Đang tải danh sách nhân viên...</p> : null}
          {!isLoadingEmployees && employees.length === 0 ? <p className="muted">Không có nhân viên phù hợp.</p> : null}

          {employees.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Họ tên</th>
                    <th>Phòng ban</th>
                    <th>Chức danh</th>
                    <th>Lương cơ bản</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id} className={selectedEmployeeId === employee.id ? 'table-row-selected' : ''} onClick={() => setSelectedEmployeeId(employee.id)}>
                      <td>{employee.code || '--'}</td>
                      <td>{employee.fullName || '--'}</td>
                      <td>{employee.department || '--'}</td>
                      <td>{employee.position || '--'}</td>
                      <td>{toCurrency(employee.baseSalary)}</td>
                      <td><span className={statusClass(employee.status)}>{employee.status || '--'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <form className="form-grid" onSubmit={onCreateEmployee}>
            <h3>Tạo nhân viên mới</h3>
            <div className="field">
              <label htmlFor="employee-code">Code</label>
              <input id="employee-code" value={createEmployeeForm.code} onChange={(event) => setCreateEmployeeForm((prev) => ({ ...prev, code: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="employee-name">Họ tên</label>
              <input id="employee-name" value={createEmployeeForm.fullName} required onChange={(event) => setCreateEmployeeForm((prev) => ({ ...prev, fullName: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="employee-email">Email</label>
              <input id="employee-email" value={createEmployeeForm.email} onChange={(event) => setCreateEmployeeForm((prev) => ({ ...prev, email: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="employee-phone">Phone</label>
              <input id="employee-phone" value={createEmployeeForm.phone} onChange={(event) => setCreateEmployeeForm((prev) => ({ ...prev, phone: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="employee-dept">Department</label>
              <input id="employee-dept" value={createEmployeeForm.department} onChange={(event) => setCreateEmployeeForm((prev) => ({ ...prev, department: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="employee-position">Position</label>
              <input id="employee-position" value={createEmployeeForm.position} onChange={(event) => setCreateEmployeeForm((prev) => ({ ...prev, position: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="employee-join-date">Join date</label>
              <input id="employee-join-date" type="date" value={createEmployeeForm.joinDate} onChange={(event) => setCreateEmployeeForm((prev) => ({ ...prev, joinDate: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="employee-type">Employment type</label>
              <select id="employee-type" value={createEmployeeForm.employmentType} onChange={(event) => setCreateEmployeeForm((prev) => ({ ...prev, employmentType: event.target.value as EmploymentType }))}>
                {EMPLOYMENT_TYPES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="employee-salary">Base salary</label>
              <input id="employee-salary" type="number" min={0} step="0.01" value={createEmployeeForm.baseSalary} onChange={(event) => setCreateEmployeeForm((prev) => ({ ...prev, baseSalary: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="employee-status">Status</label>
              <select id="employee-status" value={createEmployeeForm.status} onChange={(event) => setCreateEmployeeForm((prev) => ({ ...prev, status: event.target.value as Exclude<GenericStatus, 'ALL'> }))}>
                {STATUS_OPTIONS.filter((item) => item !== 'ALL').map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canManagerActions}>Tạo nhân viên</button>
            </div>
          </form>
        </section>

        <section className="panel-surface hr-panel">
          <div className="hr-panel-head">
            <h2>Attendance & Leave</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void Promise.all([loadAttendance(), loadLeaveRequests()])}>
              Tải lại
            </button>
          </div>

          <p className="muted">Nhân viên đang chọn: {selectedEmployee ? `${selectedEmployee.fullName || '--'} (${selectedEmployee.id})` : '--'}</p>

          <form className="form-grid" onSubmit={onCheckIn}>
            <h3>Check-in</h3>
            <div className="field">
              <label htmlFor="checkin-date">Work date</label>
              <input id="checkin-date" type="date" value={checkInForm.workDate} onChange={(event) => setCheckInForm((prev) => ({ ...prev, workDate: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="checkin-shift">Work shift ID</label>
              <input id="checkin-shift" value={checkInForm.workShiftId} onChange={(event) => setCheckInForm((prev) => ({ ...prev, workShiftId: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="checkin-note">Note</label>
              <textarea id="checkin-note" value={checkInForm.note} onChange={(event) => setCheckInForm((prev) => ({ ...prev, note: event.target.value }))} />
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!selectedEmployeeId}>Check-in</button>
            </div>
          </form>

          <form className="form-grid" onSubmit={onCheckOut}>
            <h3>Check-out</h3>
            <div className="field">
              <label htmlFor="checkout-date">Work date</label>
              <input id="checkout-date" type="date" value={checkOutForm.workDate} onChange={(event) => setCheckOutForm((prev) => ({ ...prev, workDate: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="checkout-note">Note</label>
              <textarea id="checkout-note" value={checkOutForm.note} onChange={(event) => setCheckOutForm((prev) => ({ ...prev, note: event.target.value }))} />
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!selectedEmployeeId}>Check-out</button>
            </div>
          </form>

          {isLoadingAttendance ? <p className="muted">Đang tải attendance...</p> : null}
          {attendanceRows.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Work date</th>
                    <th>Check in</th>
                    <th>Check out</th>
                    <th>Late</th>
                    <th>OT</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRows.map((row) => (
                    <tr key={row.id}>
                      <td>{toDateTime(row.workDate)}</td>
                      <td>{toDateTime(row.checkInAt)}</td>
                      <td>{toDateTime(row.checkOutAt)}</td>
                      <td>{row.lateMinutes ?? 0} phút</td>
                      <td>{row.overtimeMinutes ?? 0} phút</td>
                      <td><span className={statusClass(row.status)}>{row.status || '--'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !isLoadingAttendance ? <p className="muted">Chưa có dữ liệu attendance.</p> : null
          )}

          <section className="panel-surface">
            <h3>Tạo đơn nghỉ phép</h3>
            <form className="form-grid" onSubmit={onCreateLeaveRequest}>
              <div className="field">
                <label htmlFor="leave-policy">Leave policy ID</label>
                <input id="leave-policy" value={createLeaveForm.leavePolicyId} onChange={(event) => setCreateLeaveForm((prev) => ({ ...prev, leavePolicyId: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="leave-type">Leave type</label>
                <input id="leave-type" value={createLeaveForm.leaveType} onChange={(event) => setCreateLeaveForm((prev) => ({ ...prev, leaveType: event.target.value }))} placeholder="phep_nam / khong_luong" />
              </div>
              <div className="field">
                <label htmlFor="leave-start">Start date</label>
                <input id="leave-start" type="date" value={createLeaveForm.startDate} required onChange={(event) => setCreateLeaveForm((prev) => ({ ...prev, startDate: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="leave-end">End date</label>
                <input id="leave-end" type="date" value={createLeaveForm.endDate} required onChange={(event) => setCreateLeaveForm((prev) => ({ ...prev, endDate: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="leave-reason">Reason</label>
                <textarea id="leave-reason" value={createLeaveForm.reason} onChange={(event) => setCreateLeaveForm((prev) => ({ ...prev, reason: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="leave-attachment">Attachment URL</label>
                <input id="leave-attachment" value={createLeaveForm.attachmentUrl} onChange={(event) => setCreateLeaveForm((prev) => ({ ...prev, attachmentUrl: event.target.value }))} />
              </div>
              <div className="action-buttons">
                <button type="submit" className="btn btn-primary" disabled={!selectedEmployeeId}>Tạo đơn nghỉ</button>
              </div>
            </form>

            <div className="filter-grid">
              <div className="field">
                <label htmlFor="leave-status-filter">Filter status</label>
                <select id="leave-status-filter" value={leaveStatus} onChange={(event) => setLeaveStatus(event.target.value as GenericStatus)}>
                  {STATUS_OPTIONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="approver-id">Approver ID</label>
                <input id="approver-id" value={approverId} onChange={(event) => setApproverId(event.target.value)} />
              </div>
            </div>

            {isLoadingLeaves ? <p className="muted">Đang tải leave requests...</p> : null}
            {leaveRequests.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Leave type</th>
                      <th>Từ ngày</th>
                      <th>Đến ngày</th>
                      <th>Số ngày</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRequests.map((leave) => (
                      <tr key={leave.id}>
                        <td>{leave.leaveType || '--'}</td>
                        <td>{toDateTime(leave.startDate)}</td>
                        <td>{toDateTime(leave.endDate)}</td>
                        <td>{toNumber(leave.durationDays)}</td>
                        <td><span className={statusClass(leave.status)}>{leave.status || '--'}</span></td>
                        <td>
                          <div className="action-buttons">
                            <button type="button" className="btn btn-ghost" disabled={!canManagerActions || leave.status !== 'PENDING'} onClick={() => void onLeaveDecision(leave.id, 'approve')}>
                              Duyệt
                            </button>
                            <button type="button" className="btn btn-ghost" disabled={!canManagerActions || leave.status !== 'PENDING'} onClick={() => void onLeaveDecision(leave.id, 'reject')}>
                              Từ chối
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !isLoadingLeaves ? <p className="muted">Chưa có leave request.</p> : null
            )}
          </section>
        </section>

        <section className="panel-surface hr-panel">
          <div className="hr-panel-head">
            <h2>Leave Balance & Payroll</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void Promise.all([loadLeaveBalance(), loadPayrolls(), loadPayrollLines(selectedPayrollId || null)])}>
              Tải lại
            </button>
          </div>

          <section className="panel-surface">
            <h3>Leave balance</h3>
            <div className="filter-grid">
              <div className="field">
                <label htmlFor="leave-balance-year">Year</label>
                <input id="leave-balance-year" type="number" min={2000} value={leaveBalanceYear} onChange={(event) => setLeaveBalanceYear(event.target.value)} />
              </div>
              <div className="action-buttons">
                <button type="button" className="btn btn-primary" disabled={!selectedEmployeeId} onClick={() => void loadLeaveBalance()}>
                  Xem quota
                </button>
              </div>
            </div>

            {isLoadingLeaveBalance ? <p className="muted">Đang tải leave balance...</p> : null}
            {leaveBalance?.balances && leaveBalance.balances.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Leave type</th>
                      <th>Quota</th>
                      <th>Used</th>
                      <th>Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveBalance.balances.map((item) => (
                      <tr key={item.leavePolicyId || item.leaveType}>
                        <td>{item.leaveType || item.name || '--'}</td>
                        <td>{toNumber(item.annualQuotaDays)}</td>
                        <td>{toNumber(item.usedDays)}</td>
                        <td>{toNumber(item.remainingDays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !isLoadingLeaveBalance ? <p className="muted">Chưa có dữ liệu leave balance cho nhân viên này.</p> : null
            )}
          </section>

          <section className="panel-surface">
            <h3>Generate payroll</h3>
            <form className="form-grid" onSubmit={onGeneratePayroll}>
              <div className="field">
                <label htmlFor="payroll-month">Month</label>
                <input id="payroll-month" type="number" min={1} max={12} value={generatePayrollForm.month} required onChange={(event) => setGeneratePayrollForm((prev) => ({ ...prev, month: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="payroll-year">Year</label>
                <input id="payroll-year" type="number" min={2000} value={generatePayrollForm.year} required onChange={(event) => setGeneratePayrollForm((prev) => ({ ...prev, year: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="payroll-employee-id">Employee ID (optional)</label>
                <input id="payroll-employee-id" value={generatePayrollForm.employeeId} onChange={(event) => setGeneratePayrollForm((prev) => ({ ...prev, employeeId: event.target.value }))} placeholder={selectedEmployeeId || 'Để trống = theo selected'} />
              </div>
              <div className="field">
                <label htmlFor="payroll-note">Note</label>
                <textarea id="payroll-note" value={generatePayrollForm.note} onChange={(event) => setGeneratePayrollForm((prev) => ({ ...prev, note: event.target.value }))} />
              </div>
              <div className="action-buttons">
                <button type="submit" className="btn btn-primary" disabled={!canManagerActions}>Generate payroll</button>
              </div>
            </form>
          </section>

          {isLoadingPayrolls ? <p className="muted">Đang tải payrolls...</p> : null}
          {payrolls.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Working days</th>
                    <th>Gross</th>
                    <th>Deduction</th>
                    <th>Net</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payrolls.map((payroll) => (
                    <tr key={payroll.id} className={selectedPayrollId === payroll.id ? 'table-row-selected' : ''} onClick={() => setSelectedPayrollId(payroll.id)}>
                      <td>{payroll.payMonth || '--'}/{payroll.payYear || '--'}</td>
                      <td>{payroll.workingDays ?? 0}</td>
                      <td>{toCurrency(payroll.grossSalary)}</td>
                      <td>{toCurrency(payroll.deduction)}</td>
                      <td>{toCurrency(payroll.netSalary)}</td>
                      <td><span className={statusClass(payroll.status)}>{payroll.status || '--'}</span></td>
                      <td>
                        <button type="button" className="btn btn-ghost" disabled={!canManagerActions} onClick={() => void onPayPayroll(payroll.id)}>
                          Mark Paid
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !isLoadingPayrolls ? <p className="muted">Chưa có dữ liệu payroll.</p> : null
          )}

          <section className="panel-surface">
            <h3>Payroll line items</h3>
            <p className="muted">Payroll đang chọn: {selectedPayroll ? selectedPayroll.id : '--'}</p>
            {isLoadingPayrollLines ? <p className="muted">Đang tải payroll line items...</p> : null}
            {payrollLines.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Taxable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollLines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.componentCode || '--'}</td>
                        <td>{line.componentName || '--'}</td>
                        <td>{line.componentType || '--'}</td>
                        <td>{toCurrency(line.amount)}</td>
                        <td>{line.isTaxable ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !isLoadingPayrollLines ? <p className="muted">Không có line item cho payroll đang chọn.</p> : null
            )}
          </section>
        </section>
      </section>
    </article>
  );
}
