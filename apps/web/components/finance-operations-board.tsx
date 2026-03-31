'use client';

import {
  History,
  Lock,
  Plus,
  Search,
  RefreshCw,
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { canAccessModule } from '../lib/rbac';
import { formatRuntimeCurrency, formatRuntimeDateTime } from '../lib/runtime-format';
import { useUserRole } from './user-role-context';
import { StandardDataTable, ColumnDefinition } from './ui/standard-data-table';
import { SidePanel } from './ui/side-panel';

type InvoiceStatus = 'ALL' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

type FinanceInvoice = {
  id: string;
  invoiceNo?: string | null;
  invoiceType?: string | null;
  partnerName?: string | null;
  orderId?: string | null;
  orderNo?: string | null;
  totalAmount?: number | string | null;
  paidAmount?: number | string | null;
  outstandingAmount?: number | string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  closedAt?: string | null;
  status?: string | null;
  createdAt?: string | null;
};

type InvoiceAging = {
  asOf?: string;
  invoiceType?: string;
  totalOutstanding?: number;
  buckets?: {
    current?: number;
    overdue_1_30?: number;
    overdue_31_60?: number;
    overdue_61_90?: number;
    overdue_over_90?: number;
  };
};

type PaymentAllocation = {
  id: string;
  paymentRef?: string | null;
  allocatedAmount?: number | string | null;
  allocatedAt?: string | null;
  note?: string | null;
};

type CreateInvoiceFormState = {
  invoiceType: string;
  partnerName: string;
  totalAmount: string;
  dueAt: string;
};

type PaymentFormState = {
  allocatedAmount: string;
  paymentRef: string;
  note: string;
};

const STATUS_OPTIONS: InvoiceStatus[] = ['ALL', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED'];
const FINANCE_COLUMN_SETTINGS_KEY = 'erp-retail.finance.invoice-table-settings.v3';

function toNumber(value: number | string | null | undefined) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function toCurrency(value: number | string | null | undefined) {
  return formatRuntimeCurrency(toNumber(value));
}

function toDateTime(value: string | null | undefined) {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatRuntimeDateTime(parsed.toISOString());
}

function getStatusClass(status: string | null | undefined) {
  const normalized = (status || '').toUpperCase();
  if (['APPROVED', 'ARCHIVED', 'PAID'].includes(normalized)) return 'finance-status-pill finance-status-pill-success';
  if (['PENDING', 'DRAFT'].includes(normalized)) return 'finance-status-pill finance-status-pill-warning';
  if (['REJECTED', 'VOID', 'OVERDUE'].includes(normalized)) return 'finance-status-pill finance-status-pill-danger';
  return 'finance-status-pill finance-status-pill-neutral';
}

function buildAuditObjectHref(entityType: string, entityId: string) {
  const params = new URLSearchParams({
    entityType,
    entityId
  });
  return `/modules/audit?${params.toString()}`;
}

function buildInitialInvoiceForm(): CreateInvoiceFormState {
  return {
    invoiceType: 'SALES',
    partnerName: '',
    totalAmount: '',
    dueAt: ''
  };
}

function buildInitialPaymentForm(): PaymentFormState {
  return {
    allocatedAmount: '',
    paymentRef: '',
    note: ''
  };
}

export function FinanceOperationsBoard() {
  const { role } = useUserRole();
  const canView = canAccessModule(role, 'finance');
  const canMutate = role === 'MANAGER' || role === 'ADMIN';

  const [invoices, setInvoices] = useState<FinanceInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<FinanceInvoice | null>(null);
  const [aging, setAging] = useState<InvoiceAging | null>(null);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [isLoadingAllocations, setIsLoadingAllocations] = useState(false);

  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [createInvoiceForm, setCreateInvoiceForm] = useState<CreateInvoiceFormState>(buildInitialInvoiceForm());

  const [isTransitioningInvoice, setIsTransitioningInvoice] = useState(false);
  const [isAllocatingPayment, setIsAllocatingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(buildInitialPaymentForm());

  const loadInvoices = async () => {
    if (!canView) return;
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>('/finance/invoices', {
        query: { q: search, status: status !== 'ALL' ? status : undefined, limit: 200 }
      });
      setInvoices(Array.isArray(payload) ? payload : payload?.items || []);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi tải hóa đơn');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAging = async () => {
    if (!canView) return;
    try {
      const payload = await apiRequest<InvoiceAging>('/finance/invoices-aging');
      setAging(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi tải báo cáo aging');
    }
  };

  const loadAllocations = async (invoiceId: string) => {
    setIsLoadingAllocations(true);
    try {
      const payload = await apiRequest<any>(`/finance/invoices/${invoiceId}/allocations`);
      setAllocations(Array.isArray(payload) ? payload : []);
      setErrorMessage(null);
    } catch (error) {
      setAllocations([]);
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi tải lịch sử thanh toán');
    } finally {
      setIsLoadingAllocations(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadInvoices();
      loadAging();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, status, canView]);

  useEffect(() => {
    if (!selectedInvoice) return;
    loadAllocations(selectedInvoice.id);
  }, [selectedInvoice]);

  useEffect(() => {
    if (!selectedInvoice) return;
    const refreshed = invoices.find((invoice) => invoice.id === selectedInvoice.id);
    if (refreshed) {
      setSelectedInvoice(refreshed);
    }
  }, [invoices, selectedInvoice]);

  useEffect(() => {
    if (!selectedInvoice) {
      setPaymentForm(buildInitialPaymentForm());
      return;
    }

    const outstanding = Math.max(
      0,
      toNumber(selectedInvoice.totalAmount) - toNumber(selectedInvoice.paidAmount)
    );
    setPaymentForm((prev) => ({
      ...prev,
      allocatedAmount: outstanding > 0 ? String(outstanding) : prev.allocatedAmount
    }));
  }, [selectedInvoice]);

  const columns: ColumnDefinition<FinanceInvoice>[] = [
    {
      key: 'invoiceNo',
      label: 'Số hóa đơn',
      isLink: true,
      render: (invoice) => invoice.invoiceNo || invoice.id.slice(-8)
    },
    { key: 'invoiceType', label: 'Loại' },
    { key: 'partnerName', label: 'Đối tác' },
    {
      key: 'orderNo',
      label: 'Đơn hàng',
      render: (invoice) => invoice.orderNo || '--'
    },
    {
      key: 'totalAmount',
      label: 'Tổng tiền',
      render: (invoice) => toCurrency(invoice.totalAmount)
    },
    {
      key: 'paidAmount',
      label: 'Đã trả',
      render: (invoice) => toCurrency(invoice.paidAmount)
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (invoice) => <span className={getStatusClass(invoice.status)}>{invoice.status || '--'}</span>
    },
    {
      key: 'dueAt',
      label: 'Ngày hạn',
      render: (invoice) => toDateTime(invoice.dueAt)
    }
  ];

  if (!canView) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Hạn chế quyền truy cập.</div>;
  }

  const normalizedInvoiceStatus = String(selectedInvoice?.status || '').toUpperCase();
  const canIssueInvoice = canMutate && normalizedInvoiceStatus === 'DRAFT';
  const canApproveInvoice = canMutate && normalizedInvoiceStatus === 'PENDING';
  const canAllocatePayment = canMutate && normalizedInvoiceStatus === 'APPROVED';

  const outstandingAmount = selectedInvoice
    ? Math.max(0, toNumber(selectedInvoice.totalAmount) - toNumber(selectedInvoice.paidAmount))
    : 0;

  const handleCreateInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate) return;

    const totalAmount = Number(createInvoiceForm.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      setErrorMessage('Tổng tiền hóa đơn phải lớn hơn 0.');
      return;
    }

    setIsCreatingInvoice(true);
    try {
      const payload = await apiRequest<any>('/finance/invoices', {
        method: 'POST',
        body: {
          invoiceType: createInvoiceForm.invoiceType,
          partnerName: createInvoiceForm.partnerName || undefined,
          totalAmount,
          dueAt: createInvoiceForm.dueAt || undefined
        }
      });
      setResultMessage(`Đã tạo hóa đơn ${payload?.invoiceNo || payload?.id || ''}.`);
      setErrorMessage(null);
      setIsCreatePanelOpen(false);
      setCreateInvoiceForm(buildInitialInvoiceForm());
      await loadInvoices();
      await loadAging();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo hóa đơn');
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  const handleIssueOrApproveInvoice = async () => {
    if (!selectedInvoice || (!canIssueInvoice && !canApproveInvoice)) return;
    setIsTransitioningInvoice(true);
    try {
      if (canIssueInvoice) {
        await apiRequest(`/finance/invoices/${selectedInvoice.id}/issue`, {
          method: 'POST',
          body: { note: 'Issue từ Operations Board' }
        });
        setResultMessage(`Đã phát hành hóa đơn ${selectedInvoice.invoiceNo || selectedInvoice.id.slice(-8)}.`);
      } else {
        await apiRequest(`/finance/invoices/${selectedInvoice.id}/approve`, {
          method: 'POST',
          body: { note: 'Approve từ Operations Board' }
        });
        setResultMessage(`Đã phê duyệt hóa đơn ${selectedInvoice.invoiceNo || selectedInvoice.id.slice(-8)}.`);
      }
      setErrorMessage(null);
      await loadInvoices();
      await loadAging();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể chuyển trạng thái hóa đơn');
    } finally {
      setIsTransitioningInvoice(false);
    }
  };

  const handleAllocatePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedInvoice || !canAllocatePayment) return;

    const amount = Number(paymentForm.allocatedAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Số tiền thanh toán phải lớn hơn 0.');
      return;
    }

    setIsAllocatingPayment(true);
    try {
      await apiRequest(`/finance/invoices/${selectedInvoice.id}/allocations`, {
        method: 'POST',
        body: {
          allocatedAmount: amount,
          paymentRef: paymentForm.paymentRef || undefined,
          note: paymentForm.note || undefined
        }
      });
      setResultMessage(`Đã ghi nhận thanh toán ${toCurrency(amount)} cho hóa đơn ${selectedInvoice.invoiceNo || selectedInvoice.id.slice(-8)}.`);
      setErrorMessage(null);
      setPaymentForm(buildInitialPaymentForm());
      await loadInvoices();
      await loadAging();
      await loadAllocations(selectedInvoice.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể ghi nhận thanh toán');
    } finally {
      setIsAllocatingPayment(false);
    }
  };

  return (
    <div className="finance-board">
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

      {aging && (
        <div className="metrics-grid" style={{ marginBottom: '2rem', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="finance-status-card" style={{ borderLeft: '4px solid var(--primary)' }}>
            <h4 className="finance-status-title"><Wallet size={16} /> Tổng công nợ</h4>
            <p className="finance-status-value">{toCurrency(aging.totalOutstanding)}</p>
          </div>
          <div className="finance-status-card" style={{ borderLeft: '4px solid var(--success)' }}>
            <h4 className="finance-status-title"><TrendingUp size={16} /> Trong hạn</h4>
            <p className="finance-status-value finance-status-value-success">{toCurrency(aging.buckets?.current)}</p>
          </div>
          <div className="finance-status-card" style={{ borderLeft: '4px solid var(--warning)' }}>
            <h4 className="finance-status-title"><Clock size={16} /> Quá hạn (1-30 ngày)</h4>
            <p className="finance-status-value finance-status-value-warning">{toCurrency(aging.buckets?.overdue_1_30)}</p>
          </div>
          <div className="finance-status-card" style={{ borderLeft: '4px solid var(--danger)' }}>
            <h4 className="finance-status-title"><Lock size={16} /> Quá hạn nợ xấu (&gt;90 ngày)</h4>
            <p className="finance-status-value finance-status-value-danger">{toCurrency(aging.buckets?.overdue_over_90)}</p>
          </div>
        </div>
      )}

      <div className="main-toolbar" style={{ borderBottom: 'none', marginBottom: '1rem', paddingBottom: '0' }}>
        <div className="toolbar-left">
          <div className="field" style={{ width: '320px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                placeholder="Tìm hóa đơn, đối tác..."
                style={{ paddingLeft: '36px' }}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="field" style={{ width: '170px' }}>
            <select value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatus)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'ALL' ? 'Tất cả trạng thái' : option}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-ghost" onClick={() => { loadInvoices(); loadAging(); }}><RefreshCw size={16} /> Làm mới</button>
          <button
            className="btn btn-primary"
            disabled={!canMutate}
            onClick={() => {
              if (!canMutate) return;
              setIsCreatePanelOpen(true);
            }}
          >
            <Plus size={16} /> Tạo hóa đơn
          </button>
        </div>
      </div>

      <StandardDataTable
        data={invoices}
        columns={columns}
        isLoading={isLoading}
        storageKey={FINANCE_COLUMN_SETTINGS_KEY}
        onRowClick={(invoice) => setSelectedInvoice(invoice)}
      />

      <SidePanel
        isOpen={Boolean(selectedInvoice)}
        onClose={() => {
          setSelectedInvoice(null);
          setPaymentForm(buildInitialPaymentForm());
        }}
        title="Chi tiết hóa đơn"
      >
        {selectedInvoice && (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div style={{ padding: '1.1rem', background: 'var(--primary-soft)', borderRadius: 'var(--radius-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase' }}>Hóa đơn {selectedInvoice.invoiceType || '--'}</p>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{selectedInvoice.invoiceNo || selectedInvoice.id.slice(-8)}</h3>
              </div>
              <span className={getStatusClass(selectedInvoice.status)}>{selectedInvoice.status || '--'}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ padding: '0.85rem', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ color: 'var(--muted)', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Tổng cộng</p>
                <p style={{ fontSize: '1rem', fontWeight: 600 }}>{toCurrency(selectedInvoice.totalAmount)}</p>
              </div>
              <div style={{ padding: '0.85rem', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ color: 'var(--muted)', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Số dư còn lại</p>
                <p style={{ fontSize: '1rem', fontWeight: 600, color: outstandingAmount > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {toCurrency(outstandingAmount)}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '0.45rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Đối tác</span>
                <span style={{ fontWeight: 500 }}>{selectedInvoice.partnerName || '--'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Đơn hàng liên kết</span>
                <span style={{ fontWeight: 500 }}>{selectedInvoice.orderNo || '--'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Ngày đến hạn</span>
                <span style={{ fontWeight: 500 }}>{toDateTime(selectedInvoice.dueAt)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Ngày tạo</span>
                <span style={{ fontWeight: 500 }}>{toDateTime(selectedInvoice.createdAt)}</span>
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History size={16} /> Lịch sử thanh toán
              </h4>
              {isLoadingAllocations ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Đang tải...</p>
              ) : allocations.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>Chưa có thanh toán nào được ghi nhận.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {allocations.map((allocation) => (
                    <div key={allocation.id} style={{ padding: '0.7rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ fontWeight: 500, fontSize: '0.82rem' }}>{toCurrency(allocation.allocatedAmount)}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Ref: {allocation.paymentRef || '--'}</p>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{toDateTime(allocation.allocatedAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <button
                className="btn btn-primary"
                disabled={(!canIssueInvoice && !canApproveInvoice) || isTransitioningInvoice}
                onClick={handleIssueOrApproveInvoice}
              >
                <CheckCircle2 size={16} />
                {isTransitioningInvoice
                  ? 'Đang xử lý...'
                  : canIssueInvoice
                    ? 'Phát hành hóa đơn'
                    : canApproveInvoice
                      ? 'Phê duyệt hóa đơn'
                      : 'Không thể phê duyệt'}
              </button>

              <a className="btn btn-ghost" href={buildAuditObjectHref('Invoice', selectedInvoice.id)}>
                <History size={16} /> Xem audit log
              </a>

              <form onSubmit={handleAllocatePayment} style={{ display: 'grid', gap: '0.5rem', padding: '0.75rem', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.2rem' }}>Ghi nhận thanh toán</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={paymentForm.allocatedAmount}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, allocatedAmount: event.target.value }))}
                  placeholder="Số tiền"
                  disabled={!canAllocatePayment || isAllocatingPayment}
                />
                <input
                  value={paymentForm.paymentRef}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, paymentRef: event.target.value }))}
                  placeholder="Mã tham chiếu thanh toán"
                  disabled={!canAllocatePayment || isAllocatingPayment}
                />
                <input
                  value={paymentForm.note}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Ghi chú"
                  disabled={!canAllocatePayment || isAllocatingPayment}
                />
                <button className="btn btn-ghost" type="submit" disabled={!canAllocatePayment || isAllocatingPayment}>
                  {isAllocatingPayment ? 'Đang ghi nhận...' : 'Ghi nhận thanh toán'}
                </button>
              </form>
            </div>
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isCreatePanelOpen}
        onClose={() => {
          if (isCreatingInvoice) return;
          setIsCreatePanelOpen(false);
          setCreateInvoiceForm(buildInitialInvoiceForm());
        }}
        title="Tạo hóa đơn thủ công"
      >
        <form onSubmit={handleCreateInvoice} style={{ display: 'grid', gap: '1rem' }}>
          <div className="field">
            <label>Loại hóa đơn *</label>
            <input
              required
              value={createInvoiceForm.invoiceType}
              onChange={(event) => setCreateInvoiceForm((prev) => ({ ...prev, invoiceType: event.target.value }))}
              placeholder="SALES"
            />
          </div>
          <div className="field">
            <label>Đối tác</label>
            <input
              value={createInvoiceForm.partnerName}
              onChange={(event) => setCreateInvoiceForm((prev) => ({ ...prev, partnerName: event.target.value }))}
              placeholder="Công ty / Khách hàng"
            />
          </div>
          <div className="field">
            <label>Tổng tiền *</label>
            <input
              required
              type="number"
              min={0}
              step="0.01"
              value={createInvoiceForm.totalAmount}
              onChange={(event) => setCreateInvoiceForm((prev) => ({ ...prev, totalAmount: event.target.value }))}
              placeholder="1000000"
            />
          </div>
          <div className="field">
            <label>Ngày đến hạn</label>
            <input
              type="date"
              value={createInvoiceForm.dueAt}
              onChange={(event) => setCreateInvoiceForm((prev) => ({ ...prev, dueAt: event.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className="btn btn-primary" type="submit" disabled={isCreatingInvoice} style={{ flex: 1 }}>
              {isCreatingInvoice ? 'Đang tạo...' : 'Tạo hóa đơn'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => {
                if (isCreatingInvoice) return;
                setIsCreatePanelOpen(false);
                setCreateInvoiceForm(buildInitialInvoiceForm());
              }}
            >
              Hủy
            </button>
          </div>
        </form>
      </SidePanel>
    </div>
  );
}
