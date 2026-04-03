'use client';

import {
  Users,
  UserCheck,
  Calendar,
  CreditCard,
  Plus,
  Search,
  RefreshCw,
  Clock,
  Briefcase,
  Mail,
  Phone,
  Building,
  MapPin,
  CheckCircle2,
  XCircle,
  TrendingUp,
  FileText,
  Trash2
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { canAccessModule } from '../lib/rbac';
import { formatRuntimeCurrency, formatRuntimeDateTime } from '../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../lib/bulk-actions';
import { useUserRole } from './user-role-context';
import { StandardDataTable, ColumnDefinition, type StandardTableBulkAction } from './ui/standard-data-table';
import { SidePanel } from './ui/side-panel';

type GenericStatus = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

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
  workDate?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  status?: string | null;
};

type LeaveRequest = {
  id: string;
  leaveType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  reason?: string | null;
};

type Payroll = {
  id: string;
  payMonth?: number | null;
  payYear?: number | null;
  netSalary?: number | string | null;
  status?: string | null;
};

const HR_COLUMN_SETTINGS_KEY = 'erp-retail.hr.employee-table-settings.v2';

function toCurrency(value: any) {
  return formatRuntimeCurrency(Number(value || 0));
}

function toDateTime(value: any) {
  if (!value) return '--';
  const p = new Date(value);
  return isNaN(p.getTime()) ? value : formatRuntimeDateTime(p.toISOString());
}

function statusClass(status: string | null | undefined) {
  const s = (status || '').toUpperCase();
  if (['ACTIVE', 'APPROVED', 'SUCCESS'].includes(s)) return 'finance-status-pill finance-status-pill-success';
  if (['PENDING', 'DRAFT'].includes(s)) return 'finance-status-pill finance-status-pill-warning';
  if (['INACTIVE', 'REJECTED'].includes(s)) return 'finance-status-pill finance-status-pill-danger';
  return 'finance-status-pill finance-status-pill-neutral';
}

export function HrOperationsBoard() {
  const { role } = useUserRole();
  const canView = canAccessModule(role, 'hr');
  const canMutate = role === 'MANAGER' || role === 'ADMIN';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<BulkRowId[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isArchivingEmployee, setIsArchivingEmployee] = useState(false);

  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const loadEmployees = async () => {
    if (!canView) return;
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>('/hr/employees', { query: { q: search, limit: 100 } });
      setEmployees(Array.isArray(payload) ? payload : payload?.items || []);
      setErrorMessage(null);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Không thể tải danh sách nhân sự');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetails = async (id: string) => {
    setIsLoadingDetails(true);
    try {
      const [att, lve, pay] = await Promise.all([
        apiRequest<any>('/hr/attendance', { query: { employeeId: id, limit: 10 } }),
        apiRequest<any>('/hr/leave-requests', { query: { employeeId: id, limit: 10 } }),
        apiRequest<any>('/hr/payrolls', { query: { employeeId: id, limit: 5 } }),
      ]);
      setAttendance(Array.isArray(att) ? att : att?.items || []);
      setLeaves(Array.isArray(lve) ? lve : lve?.items || []);
      setPayrolls(Array.isArray(pay) ? pay : pay?.items || []);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Không thể tải chi tiết nhân sự');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleArchiveEmployee = async () => {
    if (!selectedEmployee || !canMutate || isArchivingEmployee) return;
    if (!window.confirm(`Lưu trữ nhân viên ${selectedEmployee.fullName || selectedEmployee.id}?`)) {
      return;
    }

    setIsArchivingEmployee(true);
    try {
      await apiRequest(`/hr/employees/${selectedEmployee.id}`, {
        method: 'DELETE'
      });
      setResultMessage(`Đã lưu trữ nhân viên ${selectedEmployee.fullName || selectedEmployee.id}.`);
      setErrorMessage(null);
      setSelectedEmployee(null);
      await loadEmployees();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Không thể lưu trữ nhân viên');
    } finally {
      setIsArchivingEmployee(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [search]);

  useEffect(() => {
    if (selectedEmployee) loadDetails(selectedEmployee.id);
  }, [selectedEmployee]);

  const columns: ColumnDefinition<Employee>[] = [
    { key: 'code', label: 'Mã NV', isLink: true },
    { key: 'fullName', label: 'Họ và tên' },
    { key: 'department', label: 'Phòng ban' },
    { key: 'position', label: 'Chức danh' },
    { key: 'employmentType', label: 'Loại HĐ' },
    { key: 'status', label: 'Trạng thái', render: (e) => <span className={statusClass(e.status)}>{e.status}</span> },
    { key: 'joinDate', label: 'Ngày vào', render: (e) => toDateTime(e.joinDate) },
  ];

  const bulkActions: StandardTableBulkAction<Employee>[] = canMutate
    ? [
        {
          key: 'bulk-archive-employees',
          label: 'Archive',
          tone: 'danger',
          confirmMessage: (rows) => `Lưu trữ ${rows.length} nhân viên đã chọn?`,
          execute: async (selectedRows) => {
            const ids = selectedRows.map((row) => String(row.id)).filter(Boolean);
            const result = await runBulkOperation({
              ids,
              continueOnError: true,
              chunkSize: 10,
              execute: async (employeeId) => {
                await apiRequest(`/hr/employees/${employeeId}`, {
                  method: 'DELETE'
                });
              }
            });

            const normalized: BulkExecutionResult = {
              ...result,
              actionLabel: 'Lưu trữ nhân viên',
              message: formatBulkSummary(
                {
                  ...result,
                  actionLabel: 'Lưu trữ nhân viên'
                },
                'Lưu trữ nhân viên'
              )
            };

            if (normalized.successCount > 0) {
              await loadEmployees();
            }
            setResultMessage(normalized.message ?? null);
            if (normalized.failedCount > 0) {
              setErrorMessage('Một số nhân viên lỗi khi lưu trữ.');
            } else {
              setErrorMessage(null);
            }
            return normalized;
          }
        }
      ]
    : [];

  if (!canView) return <div style={{ padding: '2rem', textAlign: 'center' }}>Hạn chế truy cập module nhân sự.</div>;

  return (
    <div className="hr-board">
      {errorMessage && (
        <div className="finance-alert finance-alert-danger" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span><strong>Lỗi:</strong> {errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
        </div>
      )}
      {resultMessage && (
        <div className="finance-alert finance-alert-success" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span><strong>Thành công:</strong> {resultMessage}</span>
          <button onClick={() => setResultMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
        </div>
      )}

      {/* Metrics */}
      <div className="metrics-grid" style={{ marginBottom: '2rem', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <h4 className="finance-status-title"><Users size={16} /> Tổng nhân sự</h4>
          <p className="finance-status-value">{employees.length}</p>
        </div>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--success)' }}>
          <h4 className="finance-status-title"><UserCheck size={16} /> Đang làm việc</h4>
          <p className="finance-status-value finance-status-value-success">{employees.filter(e => e.status === 'ACTIVE').length}</p>
        </div>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--warning)' }}>
          <h4 className="finance-status-title"><Calendar size={16} /> Nghỉ phép hôm nay</h4>
          <p className="finance-status-value finance-status-value-warning">0</p>
        </div>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--danger)' }}>
          <h4 className="finance-status-title"><TrendingUp size={16} /> Tỉ lệ nghỉ việc</h4>
          <p className="finance-status-value finance-status-value-danger">1.2%</p>
        </div>
      </div>

      <div className="main-toolbar" style={{ borderBottom: 'none', marginBottom: '1rem', paddingBottom: '0' }}>
        <div className="toolbar-left">
          <div className="field" style={{ width: '300px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                placeholder="Tìm nhân viên, phòng ban..."
                style={{ paddingLeft: '36px' }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-ghost" onClick={() => loadEmployees()}><RefreshCw size={16} /> Refresh</button>
          <button className="btn btn-primary"><Plus size={16} /> Tuyển dụng mới</button>
        </div>
      </div>

      <StandardDataTable
        data={employees}
        columns={columns}
        isLoading={isLoading}
        storageKey={HR_COLUMN_SETTINGS_KEY}
        onRowClick={(e) => setSelectedEmployee(e)}
        enableRowSelection
        selectedRowIds={selectedRowIds}
        onSelectedRowIdsChange={setSelectedRowIds}
        bulkActions={bulkActions}
        showDefaultBulkUtilities
      />

      <SidePanel
        isOpen={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        title="Hồ sơ nhân viên"
      >
        {selectedEmployee && (
          <div style={{ display: 'grid', gap: '2rem' }}>
            {/* Profile Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--line)' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontSize: '1.5rem', fontWeight: 600 }}>
                {selectedEmployee.fullName?.charAt(0)}
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{selectedEmployee.fullName}</h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>{selectedEmployee.position} • {selectedEmployee.department}</p>
              </div>
            </div>

            {/* Quick Info Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="info-item">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '4px' }}><Mail size={12} /> Email</label>
                <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>{selectedEmployee.email || '--'}</p>
              </div>
              <div className="info-item">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '4px' }}><Phone size={12} /> Điện thoại</label>
                <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>{selectedEmployee.phone || '--'}</p>
              </div>
              <div className="info-item">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '4px' }}><Clock size={12} /> Ngày gia nhập</label>
                <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>{toDateTime(selectedEmployee.joinDate)}</p>
              </div>
              <div className="info-item">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '4px' }}><Briefcase size={12} /> Lương cơ bản</label>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--primary)' }}>{toCurrency(selectedEmployee.baseSalary)}</p>
              </div>
            </div>

            {/* Detailed Tabs/Sections */}
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              <section>
                <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={18} /> Chấm công gần đây
                </h4>
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  {attendance.length === 0 ? <p style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--muted)' }}>Không có dữ liệu.</p> : (
                    attendance.slice(0, 3).map(a => (
                      <div key={a.id} style={{ padding: '0.75rem', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <span>{toDateTime(a.workDate)}</span>
                        <span style={{ fontWeight: 500 }}>{a.checkInAt ? `In: ${a.checkInAt.slice(11, 16)}` : '--'}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={18} /> Nghỉ phép
                </h4>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {leaves.length === 0 ? <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Không có yêu cầu.</p> : (
                    leaves.map(l => (
                      <div key={l.id} style={{ padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>{l.leaveType}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{toDateTime(l.startDate)}</p>
                        </div>
                        <span className={statusClass(l.status)} style={{ fontSize: '0.75rem' }}>{l.status}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* Footer Actions */}
            <div style={{ display: 'flex', gap: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--line)' }}>
              <button className="btn btn-primary" style={{ flex: 1 }}><CheckCircle2 size={16} /> Phê duyệt phép</button>
              <button className="btn btn-ghost" style={{ flex: 1 }}><FileText size={16} /> Bảng lương</button>
              <button
                className="btn btn-danger"
                style={{ flex: 1 }}
                onClick={handleArchiveEmployee}
                disabled={!canMutate || isArchivingEmployee || String(selectedEmployee.status || '').toUpperCase() === 'ARCHIVED'}
              >
                <Trash2 size={16} /> {isArchivingEmployee ? 'Đang lưu trữ...' : 'Lưu trữ nhân viên'}
              </button>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
