'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { canAccessModule } from '../lib/rbac';
import { useUserRole } from './user-role-context';

type InvoiceStatus = 'ALL' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

type FinanceInvoice = {
  id: string;
  invoiceNo?: string | null;
  invoiceType?: string | null;
  partnerName?: string | null;
  totalAmount?: number | string | null;
  paidAmount?: number | string | null;
  outstandingAmount?: number | string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  closedAt?: string | null;
  status?: string | null;
  createdAt?: string | null;
};

type InvoiceTransitionAction = 'issue' | 'approve' | 'pay' | 'void';

type PaymentAllocation = {
  id: string;
  paymentRef?: string | null;
  sourceInvoiceNo?: string | null;
  allocatedAmount?: number | string | null;
  allocatedAt?: string | null;
  note?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
};

type AgingBuckets = {
  current?: number;
  overdue_1_30?: number;
  overdue_31_60?: number;
  overdue_61_90?: number;
  overdue_over_90?: number;
};

type AgingPartner = {
  partnerName?: string;
  totalOutstanding?: number;
  invoiceCount?: number;
};

type InvoiceAging = {
  asOf?: string;
  invoiceType?: string;
  totalOutstanding?: number;
  buckets?: AgingBuckets;
  partners?: AgingPartner[];
};

type LockedPeriodsResponse = {
  periods?: string[];
  count?: number;
};

type CreateInvoiceForm = {
  invoiceNo: string;
  invoiceType: string;
  partnerName: string;
  totalAmount: string;
  dueAt: string;
};

type AllocateForm = {
  allocatedAmount: string;
  allocatedAt: string;
  paymentRef: string;
  invoiceNo: string;
  note: string;
  createdBy: string;
};

type ClosePeriodForm = {
  period: string;
  closedBy: string;
};

const STATUS_OPTIONS: InvoiceStatus[] = ['ALL', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED'];
const DEFAULT_LIMIT = 20;

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const normalized = Number(value);
  if (Number.isNaN(normalized)) {
    return 0;
  }
  return normalized;
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

function toDateInput(value: string | null | undefined) {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString().slice(0, 10);
}

function normalizeInvoiceList(payload: unknown): FinanceInvoice[] {
  if (Array.isArray(payload)) {
    return payload as FinanceInvoice[];
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const mapped = payload as Record<string, unknown>;
    if (Array.isArray(mapped.items)) {
      return mapped.items as FinanceInvoice[];
    }
  }

  return [];
}

function normalizeAging(payload: unknown): InvoiceAging | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return payload as InvoiceAging;
}

function normalizeAllocations(payload: unknown): PaymentAllocation[] {
  if (Array.isArray(payload)) {
    return payload as PaymentAllocation[];
  }
  return [];
}

function normalizeLockedPeriods(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }
  const mapped = payload as LockedPeriodsResponse;
  if (!Array.isArray(mapped.periods)) {
    return [];
  }
  return mapped.periods.filter((item): item is string => typeof item === 'string');
}

function getStatusClass(status: string | null | undefined) {
  switch (status) {
    case 'APPROVED':
    case 'ARCHIVED':
      return 'finance-status-pill finance-status-pill-success';
    case 'PENDING':
      return 'finance-status-pill finance-status-pill-warning';
    case 'REJECTED':
      return 'finance-status-pill finance-status-pill-danger';
    default:
      return 'finance-status-pill finance-status-pill-neutral';
  }
}

export function FinanceOperationsBoard() {
  const { role } = useUserRole();
  const canView = canAccessModule(role, 'finance');
  const canMutate = role === 'MANAGER' || role === 'ADMIN';
  const canClosePeriod = role === 'ADMIN';

  const [invoices, setInvoices] = useState<FinanceInvoice[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [isLoadingAging, setIsLoadingAging] = useState(false);
  const [isLoadingAllocations, setIsLoadingAllocations] = useState(false);
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('ALL');
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState('');
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [transitionNote, setTransitionNote] = useState('');

  const [agingAsOf, setAgingAsOf] = useState('');
  const [aging, setAging] = useState<InvoiceAging | null>(null);

  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [lockedPeriods, setLockedPeriods] = useState<string[]>([]);

  const [createInvoiceForm, setCreateInvoiceForm] = useState<CreateInvoiceForm>({
    invoiceNo: '',
    invoiceType: 'SALES',
    partnerName: '',
    totalAmount: '',
    dueAt: ''
  });

  const [allocateForm, setAllocateForm] = useState<AllocateForm>({
    allocatedAmount: '',
    allocatedAt: '',
    paymentRef: '',
    invoiceNo: '',
    note: '',
    createdBy: ''
  });

  const [closePeriodForm, setClosePeriodForm] = useState<ClosePeriodForm>({
    period: '',
    closedBy: ''
  });

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId]
  );

  const invoiceOutstanding = useMemo(() => {
    if (!selectedInvoice) {
      return 0;
    }
    if (selectedInvoice.outstandingAmount !== undefined && selectedInvoice.outstandingAmount !== null) {
      return toNumber(selectedInvoice.outstandingAmount);
    }
    return Math.max(0, toNumber(selectedInvoice.totalAmount) - toNumber(selectedInvoice.paidAmount));
  }, [selectedInvoice]);

  useEffect(() => {
    if (!selectedInvoiceId && invoices.length > 0) {
      setSelectedInvoiceId(invoices[0].id);
      return;
    }

    if (selectedInvoiceId && invoices.length > 0 && !invoices.some((invoice) => invoice.id === selectedInvoiceId)) {
      setSelectedInvoiceId(invoices[0].id);
    }
  }, [invoices, selectedInvoiceId]);

  const loadInvoices = async () => {
    if (!canView) {
      return;
    }

    setIsLoadingInvoices(true);
    try {
      const payload = await apiRequest<unknown>('/finance/invoices', {
        query: {
          q: search,
          status: status === 'ALL' ? undefined : status,
          invoiceType: invoiceTypeFilter || undefined,
          limit
        }
      });
      setInvoices(normalizeInvoiceList(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách hóa đơn.');
      setInvoices([]);
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  const loadAging = async () => {
    if (!canView) {
      return;
    }

    setIsLoadingAging(true);
    try {
      const payload = await apiRequest<unknown>('/finance/invoices-aging', {
        query: {
          asOf: agingAsOf || undefined,
          invoiceType: invoiceTypeFilter || undefined,
          limit
        }
      });
      setAging(normalizeAging(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được báo cáo aging.');
      setAging(null);
    } finally {
      setIsLoadingAging(false);
    }
  };

  const loadAllocations = async (invoiceId: string | null) => {
    if (!canView || !invoiceId) {
      setAllocations([]);
      return;
    }

    setIsLoadingAllocations(true);
    try {
      const payload = await apiRequest<unknown>(`/finance/invoices/${invoiceId}/allocations`);
      setAllocations(normalizeAllocations(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được lịch sử phân bổ thanh toán.');
      setAllocations([]);
    } finally {
      setIsLoadingAllocations(false);
    }
  };

  const loadLockedPeriods = async () => {
    if (!canView) {
      return;
    }

    setIsLoadingPeriods(true);
    try {
      const payload = await apiRequest<unknown>('/finance/periods/locks');
      setLockedPeriods(normalizeLockedPeriods(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách kỳ đã khóa.');
      setLockedPeriods([]);
    } finally {
      setIsLoadingPeriods(false);
    }
  };

  useEffect(() => {
    void loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, search, status, invoiceTypeFilter, limit]);

  useEffect(() => {
    void loadAging();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, agingAsOf, invoiceTypeFilter, limit]);

  useEffect(() => {
    void loadLockedPeriods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  useEffect(() => {
    void loadAllocations(selectedInvoiceId || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, selectedInvoiceId]);

  const refreshAll = async () => {
    await Promise.all([loadInvoices(), loadAging(), loadLockedPeriods(), loadAllocations(selectedInvoiceId || null)]);
  };

  const onCreateInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate) {
      return;
    }

    setErrorMessage(null);
    setResultMessage(null);

    try {
      const amount = Number(createInvoiceForm.totalAmount);
      if (Number.isNaN(amount) || amount <= 0) {
        throw new Error('Tổng tiền hóa đơn phải lớn hơn 0.');
      }

      await apiRequest('/finance/invoices', {
        method: 'POST',
        body: {
          invoiceNo: createInvoiceForm.invoiceNo || undefined,
          invoiceType: createInvoiceForm.invoiceType,
          partnerName: createInvoiceForm.partnerName || undefined,
          totalAmount: amount,
          dueAt: createInvoiceForm.dueAt || undefined
        }
      });

      setResultMessage('Đã tạo hóa đơn mới.');
      setCreateInvoiceForm({
        invoiceNo: '',
        invoiceType: createInvoiceForm.invoiceType,
        partnerName: '',
        totalAmount: '',
        dueAt: ''
      });
      await refreshAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo hóa đơn.');
    }
  };

  const onTransitionInvoice = async (action: InvoiceTransitionAction) => {
    if (!canMutate || !selectedInvoice) {
      return;
    }

    setErrorMessage(null);
    setResultMessage(null);

    try {
      await apiRequest(`/finance/invoices/${selectedInvoice.id}/${action}`, {
        method: 'POST',
        body: {
          note: transitionNote || undefined
        }
      });
      setResultMessage(`Đã thực hiện action ${action.toUpperCase()} cho hóa đơn.`);
      await refreshAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể chuyển trạng thái hóa đơn.');
    }
  };

  const onAllocate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate || !selectedInvoice) {
      return;
    }

    setErrorMessage(null);
    setResultMessage(null);

    try {
      const allocatedAmount = Number(allocateForm.allocatedAmount);
      if (Number.isNaN(allocatedAmount) || allocatedAmount <= 0) {
        throw new Error('Số tiền phân bổ phải lớn hơn 0.');
      }

      await apiRequest(`/finance/invoices/${selectedInvoice.id}/allocations`, {
        method: 'POST',
        body: {
          allocatedAmount,
          allocatedAt: allocateForm.allocatedAt || undefined,
          paymentRef: allocateForm.paymentRef || undefined,
          invoiceNo: allocateForm.invoiceNo || undefined,
          note: allocateForm.note || undefined,
          createdBy: allocateForm.createdBy || undefined
        }
      });

      setResultMessage('Đã ghi nhận phân bổ thanh toán.');
      setAllocateForm((prev) => ({
        ...prev,
        allocatedAmount: '',
        allocatedAt: '',
        paymentRef: '',
        invoiceNo: '',
        note: ''
      }));
      await refreshAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể phân bổ thanh toán.');
    }
  };

  const onClosePeriod = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canClosePeriod) {
      return;
    }

    setErrorMessage(null);
    setResultMessage(null);

    try {
      const period = closePeriodForm.period.trim();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
        throw new Error('Kỳ cần đúng định dạng YYYY-MM.');
      }

      await apiRequest(`/finance/periods/${period}/close`, {
        method: 'POST',
        body: {
          closedBy: closePeriodForm.closedBy || undefined
        }
      });

      setResultMessage(`Đã khóa kỳ ${period}.`);
      setClosePeriodForm((prev) => ({ ...prev, period: '' }));
      await loadLockedPeriods();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể khóa kỳ kế toán.');
    }
  };

  if (!canView) {
    return (
      <article className="module-workbench">
        <header className="module-header">
          <div>
            <h1>Finance Operations Board</h1>
            <p>Bạn không có quyền truy cập phân hệ Finance với vai trò hiện tại.</p>
          </div>
          <ul>
            <li>Vai trò hiện tại: {role}</li>
            <li>Finance yêu cầu tối thiểu MANAGER.</li>
          </ul>
        </header>
      </article>
    );
  }

  return (
    <article className="module-workbench">
      <header className="module-header">
        <div>
          <h1>Finance Operations Board</h1>
          <p>
            Màn hình nghiệp vụ tài chính chuyên sâu: quản lý vòng đời hóa đơn, theo dõi công nợ (aging), phân bổ thanh toán
            và khóa kỳ kế toán.
          </p>
        </div>
        <ul>
          <li>Flow: create invoice {'->'} issue {'->'} approve {'->'} pay/void</li>
          <li>Aging buckets + danh sách đối tác nợ lớn</li>
          <li>RBAC: MANAGER thao tác nghiệp vụ, ADMIN có thêm quyền khóa kỳ</li>
        </ul>
      </header>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}
      {!canMutate ? (
        <p className="banner banner-warning">Vai trò `{role}` chỉ có quyền xem trong màn hình này.</p>
      ) : null}
      {canMutate && !canClosePeriod ? (
        <p className="banner banner-warning">Vai trò `{role}` không có quyền khóa kỳ kế toán (chỉ ADMIN).</p>
      ) : null}

      <section className="finance-grid">
        <section className="panel-surface finance-panel">
          <div className="finance-panel-head">
            <h2>Hóa đơn và vòng đời phê duyệt</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
              Tải lại
            </button>
          </div>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="finance-search">Từ khóa</label>
              <input
                id="finance-search"
                value={search}
                placeholder="Số hóa đơn hoặc đối tác"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="finance-status">Trạng thái</label>
              <select id="finance-status" value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatus)}>
                {STATUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="finance-invoice-type">Invoice Type</label>
              <input
                id="finance-invoice-type"
                value={invoiceTypeFilter}
                placeholder="VD: SALES / PURCHASE"
                onChange={(event) => setInvoiceTypeFilter(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="finance-limit">Limit</label>
              <select id="finance-limit" value={String(limit)} onChange={(event) => setLimit(Number(event.target.value))}>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          {isLoadingInvoices ? <p className="muted">Đang tải danh sách hóa đơn...</p> : null}
          {!isLoadingInvoices && invoices.length === 0 ? <p className="muted">Chưa có hóa đơn nào phù hợp bộ lọc.</p> : null}

          {invoices.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Type</th>
                    <th>Partner</th>
                    <th>Tổng tiền</th>
                    <th>Đã thanh toán</th>
                    <th>Còn lại</th>
                    <th>Trạng thái</th>
                    <th>Đến hạn</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const outstanding =
                      invoice.outstandingAmount !== undefined && invoice.outstandingAmount !== null
                        ? toNumber(invoice.outstandingAmount)
                        : Math.max(0, toNumber(invoice.totalAmount) - toNumber(invoice.paidAmount));

                    return (
                      <tr
                        key={invoice.id}
                        className={selectedInvoiceId === invoice.id ? 'table-row-selected' : ''}
                        onClick={() => setSelectedInvoiceId(invoice.id)}
                      >
                        <td>{invoice.invoiceNo || invoice.id.slice(-8)}</td>
                        <td>{invoice.invoiceType || '--'}</td>
                        <td>{invoice.partnerName || '--'}</td>
                        <td>{toCurrency(invoice.totalAmount)}</td>
                        <td>{toCurrency(invoice.paidAmount)}</td>
                        <td>{toCurrency(outstanding)}</td>
                        <td>
                          <span className={getStatusClass(invoice.status)}>{invoice.status || '--'}</span>
                        </td>
                        <td>{toDateTime(invoice.dueAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <form className="form-grid" onSubmit={onCreateInvoice}>
            <h3>Tạo hóa đơn mới</h3>
            <div className="field">
              <label htmlFor="create-invoice-no">Số hóa đơn</label>
              <input
                id="create-invoice-no"
                value={createInvoiceForm.invoiceNo}
                placeholder="INV-2026-0001"
                onChange={(event) => setCreateInvoiceForm((prev) => ({ ...prev, invoiceNo: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="create-invoice-type">Invoice Type</label>
              <input
                id="create-invoice-type"
                value={createInvoiceForm.invoiceType}
                required
                onChange={(event) => setCreateInvoiceForm((prev) => ({ ...prev, invoiceType: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="create-partner">Đối tác</label>
              <input
                id="create-partner"
                value={createInvoiceForm.partnerName}
                onChange={(event) => setCreateInvoiceForm((prev) => ({ ...prev, partnerName: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="create-total">Tổng tiền</label>
              <input
                id="create-total"
                type="number"
                min={1}
                step="0.01"
                value={createInvoiceForm.totalAmount}
                required
                onChange={(event) => setCreateInvoiceForm((prev) => ({ ...prev, totalAmount: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="create-due-date">Ngày đến hạn</label>
              <input
                id="create-due-date"
                type="date"
                value={createInvoiceForm.dueAt}
                onChange={(event) => setCreateInvoiceForm((prev) => ({ ...prev, dueAt: event.target.value }))}
              />
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canMutate}>
                Tạo hóa đơn
              </button>
            </div>
          </form>

          <section className="panel-surface">
            <h3>Transition hóa đơn đã chọn</h3>
            <p className="muted">Hóa đơn hiện tại: {selectedInvoice ? selectedInvoice.invoiceNo || selectedInvoice.id : '--'}</p>
            <div className="field">
              <label htmlFor="transition-note">Ghi chú transition</label>
              <input
                id="transition-note"
                value={transitionNote}
                placeholder="Lý do phê duyệt / thanh toán / hủy"
                onChange={(event) => setTransitionNote(event.target.value)}
              />
            </div>
            <div className="action-buttons finance-transition-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!canMutate || !selectedInvoice}
                onClick={() => void onTransitionInvoice('issue')}
              >
                Issue
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!canMutate || !selectedInvoice}
                onClick={() => void onTransitionInvoice('approve')}
              >
                Approve
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canMutate || !selectedInvoice}
                onClick={() => void onTransitionInvoice('pay')}
              >
                Pay
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!canMutate || !selectedInvoice}
                onClick={() => void onTransitionInvoice('void')}
              >
                Void
              </button>
            </div>
          </section>
        </section>

        <section className="panel-surface finance-panel">
          <div className="finance-panel-head">
            <h2>Aging + phân bổ thanh toán</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void loadAging()}>
              Làm mới aging
            </button>
          </div>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="aging-as-of">As Of</label>
              <input id="aging-as-of" type="date" value={agingAsOf} onChange={(event) => setAgingAsOf(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="aging-selected">Invoice đang chọn</label>
              <input id="aging-selected" value={selectedInvoice?.invoiceNo || selectedInvoice?.id || ''} readOnly />
            </div>
            <div className="field">
              <label htmlFor="aging-outstanding">Còn phải thu</label>
              <input id="aging-outstanding" value={toCurrency(invoiceOutstanding)} readOnly />
            </div>
          </div>

          {isLoadingAging ? <p className="muted">Đang tải aging...</p> : null}

          {aging ? (
            <>
              <div className="overview-cards">
                <article className="overview-card">
                  <p>Total Outstanding</p>
                  <strong>{toCurrency(aging.totalOutstanding)}</strong>
                </article>
                <article className="overview-card">
                  <p>As Of</p>
                  <strong>{toDateTime(aging.asOf || null)}</strong>
                </article>
                <article className="overview-card">
                  <p>Invoice Type</p>
                  <strong>{aging.invoiceType || 'ALL'}</strong>
                </article>
              </div>

              <div className="finance-bucket-list">
                <article className="finance-bucket-item">
                  <span>Current</span>
                  <strong>{toCurrency(aging.buckets?.current)}</strong>
                </article>
                <article className="finance-bucket-item">
                  <span>1-30 ngày</span>
                  <strong>{toCurrency(aging.buckets?.overdue_1_30)}</strong>
                </article>
                <article className="finance-bucket-item">
                  <span>31-60 ngày</span>
                  <strong>{toCurrency(aging.buckets?.overdue_31_60)}</strong>
                </article>
                <article className="finance-bucket-item">
                  <span>61-90 ngày</span>
                  <strong>{toCurrency(aging.buckets?.overdue_61_90)}</strong>
                </article>
                <article className="finance-bucket-item">
                  <span>&gt; 90 ngày</span>
                  <strong>{toCurrency(aging.buckets?.overdue_over_90)}</strong>
                </article>
              </div>

              <div className="finance-partner-list">
                {(aging.partners ?? []).slice(0, 5).map((partner) => (
                  <article key={`${partner.partnerName}-${partner.invoiceCount}`} className="finance-partner-item">
                    <div>
                      <strong>{partner.partnerName || 'UNKNOWN'}</strong>
                      <p>{partner.invoiceCount ?? 0} hóa đơn</p>
                    </div>
                    <span>{toCurrency(partner.totalOutstanding)}</span>
                  </article>
                ))}
                {(aging.partners ?? []).length === 0 ? <p className="muted">Không có đối tác nợ mở.</p> : null}
              </div>
            </>
          ) : null}

          <form className="form-grid" onSubmit={onAllocate}>
            <h3>Ghi nhận phân bổ thanh toán</h3>
            <p className="muted">Invoice hiện tại: {selectedInvoice ? selectedInvoice.invoiceNo || selectedInvoice.id : '--'}</p>

            <div className="field">
              <label htmlFor="allocate-amount">Số tiền phân bổ</label>
              <input
                id="allocate-amount"
                type="number"
                min={0.01}
                step="0.01"
                value={allocateForm.allocatedAmount}
                required
                onChange={(event) => setAllocateForm((prev) => ({ ...prev, allocatedAmount: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="allocate-at">Ngày phân bổ</label>
              <input
                id="allocate-at"
                type="date"
                value={allocateForm.allocatedAt}
                onChange={(event) => setAllocateForm((prev) => ({ ...prev, allocatedAt: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="allocate-ref">Payment Ref</label>
              <input
                id="allocate-ref"
                value={allocateForm.paymentRef}
                onChange={(event) => setAllocateForm((prev) => ({ ...prev, paymentRef: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="allocate-source">Source Invoice No</label>
              <input
                id="allocate-source"
                value={allocateForm.invoiceNo}
                onChange={(event) => setAllocateForm((prev) => ({ ...prev, invoiceNo: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="allocate-created-by">Created By</label>
              <input
                id="allocate-created-by"
                value={allocateForm.createdBy}
                onChange={(event) => setAllocateForm((prev) => ({ ...prev, createdBy: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="allocate-note">Ghi chú</label>
              <textarea
                id="allocate-note"
                value={allocateForm.note}
                onChange={(event) => setAllocateForm((prev) => ({ ...prev, note: event.target.value }))}
              />
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canMutate || !selectedInvoice}>
                Ghi nhận payment
              </button>
            </div>
          </form>

          <section className="panel-surface">
            <div className="finance-panel-head">
              <h3>Lịch sử allocations</h3>
              <button type="button" className="btn btn-ghost" onClick={() => void loadAllocations(selectedInvoiceId || null)}>
                Tải lại allocations
              </button>
            </div>
            {isLoadingAllocations ? <p className="muted">Đang tải lịch sử allocations...</p> : null}
            {!isLoadingAllocations && allocations.length === 0 ? <p className="muted">Chưa có phân bổ thanh toán.</p> : null}
            {allocations.length > 0 ? (
              <div className="finance-allocation-list">
                {allocations.map((allocation) => (
                  <article key={allocation.id} className="finance-allocation-item">
                    <div>
                      <strong>{allocation.paymentRef || 'PAYMENT'}</strong>
                      <p>{allocation.sourceInvoiceNo || 'N/A'}</p>
                    </div>
                    <div>
                      <strong>{toCurrency(allocation.allocatedAmount)}</strong>
                      <p>{toDateTime(allocation.allocatedAt || allocation.createdAt || null)}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </section>

        <section className="panel-surface finance-panel">
          <div className="finance-panel-head">
            <h2>Khóa kỳ kế toán</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void loadLockedPeriods()}>
              Tải lại kỳ khóa
            </button>
          </div>

          {isLoadingPeriods ? <p className="muted">Đang tải danh sách kỳ đã khóa...</p> : null}

          <div className="finance-partner-list">
            {lockedPeriods.map((period) => (
              <article key={period} className="finance-partner-item">
                <div>
                  <strong>{period}</strong>
                  <p>Kỳ đã khóa</p>
                </div>
                <span className="finance-status-pill finance-status-pill-danger">LOCKED</span>
              </article>
            ))}
            {lockedPeriods.length === 0 ? <p className="muted">Chưa có kỳ kế toán nào bị khóa.</p> : null}
          </div>

          <form className="form-grid" onSubmit={onClosePeriod}>
            <h3>Đóng kỳ mới (ADMIN)</h3>
            <div className="field">
              <label htmlFor="close-period">Kỳ (YYYY-MM)</label>
              <input
                id="close-period"
                value={closePeriodForm.period}
                placeholder="2026-03"
                required
                onChange={(event) => setClosePeriodForm((prev) => ({ ...prev, period: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="close-by">Closed By</label>
              <input
                id="close-by"
                value={closePeriodForm.closedBy}
                placeholder="finance-admin"
                onChange={(event) => setClosePeriodForm((prev) => ({ ...prev, closedBy: event.target.value }))}
              />
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canClosePeriod}>
                Khóa kỳ
              </button>
            </div>
          </form>

          <section className="panel-surface">
            <h3>Thông tin invoice đang chọn</h3>
            {selectedInvoice ? (
              <dl className="kv-grid">
                <div className="kv-item">
                  <dt>Invoice</dt>
                  <dd>{selectedInvoice.invoiceNo || selectedInvoice.id}</dd>
                </div>
                <div className="kv-item">
                  <dt>Status</dt>
                  <dd>{selectedInvoice.status || '--'}</dd>
                </div>
                <div className="kv-item">
                  <dt>Due At</dt>
                  <dd>{toDateInput(selectedInvoice.dueAt)}</dd>
                </div>
                <div className="kv-item">
                  <dt>Paid At</dt>
                  <dd>{toDateInput(selectedInvoice.paidAt)}</dd>
                </div>
                <div className="kv-item">
                  <dt>Total</dt>
                  <dd>{toCurrency(selectedInvoice.totalAmount)}</dd>
                </div>
                <div className="kv-item">
                  <dt>Outstanding</dt>
                  <dd>{toCurrency(invoiceOutstanding)}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">Chọn một hóa đơn để xem thông tin chi tiết.</p>
            )}
          </section>
        </section>
      </section>
    </article>
  );
}
