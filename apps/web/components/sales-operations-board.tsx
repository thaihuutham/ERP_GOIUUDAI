'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { canAccessModule } from '../lib/rbac';
import { useUserRole } from './user-role-context';

type SalesOrderItem = {
  id?: string;
  productName?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
};

type SalesOrder = {
  id: string;
  orderNo?: string | null;
  customerName?: string | null;
  totalAmount?: number | null;
  status?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  items?: SalesOrderItem[];
};

type SalesOrdersResponse = {
  items: SalesOrder[];
  nextCursor?: string | null;
  limit?: number;
};

type ApprovalRecord = {
  id: string;
  targetId?: string | null;
  requesterId?: string | null;
  approverId?: string | null;
  status?: string | null;
  createdAt?: string | null;
  decidedAt?: string | null;
};

type OrderCreateForm = {
  orderNo: string;
  customerName: string;
  createdBy: string;
  productName: string;
  quantity: string;
  unitPrice: string;
};

type OrderUpdateForm = {
  requesterId: string;
  requesterName: string;
  productName: string;
  quantity: string;
  unitPrice: string;
};

const STATUS_OPTIONS = ['ALL', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED', 'ACTIVE', 'INACTIVE'] as const;

function toCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }
  return Number(value).toLocaleString('vi-VN');
}

function toDate(value: string | null | undefined) {
  if (!value) {
    return '--';
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return value;
  }
  return dt.toLocaleString('vi-VN');
}

function normalizeOrdersPayload(payload: unknown): SalesOrdersResponse {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const mapped = payload as SalesOrdersResponse;
    if (Array.isArray(mapped.items)) {
      return {
        items: mapped.items,
        nextCursor: mapped.nextCursor ?? null,
        limit: mapped.limit
      };
    }
  }
  return {
    items: [],
    nextCursor: null,
    limit: 20
  };
}

function firstItem(order: SalesOrder | null) {
  if (!order || !order.items || order.items.length === 0) {
    return null;
  }
  return order.items[0] ?? null;
}

export function SalesOperationsBoard() {
  const { role } = useUserRole();
  const canView = canAccessModule(role, 'sales');
  const canMutate = role === 'MANAGER' || role === 'ADMIN';

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isLoadingApprovals, setIsLoadingApprovals] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>('ALL');
  const [limit, setLimit] = useState(20);
  const [pageCursor, setPageCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [createForm, setCreateForm] = useState<OrderCreateForm>({
    orderNo: '',
    customerName: '',
    createdBy: '',
    productName: '',
    quantity: '1',
    unitPrice: ''
  });
  const [updateForm, setUpdateForm] = useState<OrderUpdateForm>({
    requesterId: '',
    requesterName: '',
    productName: '',
    quantity: '1',
    unitPrice: ''
  });

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) ?? null, [orders, selectedOrderId]);
  const selectedOrderFirstItem = useMemo(() => firstItem(selectedOrder), [selectedOrder]);

  useEffect(() => {
    if (!selectedOrderId && orders.length > 0) {
      setSelectedOrderId(orders[0].id);
      return;
    }
    if (selectedOrderId && orders.length > 0 && !orders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(orders[0].id);
    }
  }, [orders, selectedOrderId]);

  useEffect(() => {
    setUpdateForm((prev) => ({
      ...prev,
      productName: selectedOrderFirstItem?.productName ?? '',
      quantity: String(selectedOrderFirstItem?.quantity ?? 1),
      unitPrice: String(selectedOrderFirstItem?.unitPrice ?? '')
    }));
  }, [selectedOrderFirstItem]);

  const loadOrders = async () => {
    if (!canView) {
      return;
    }
    setIsLoadingOrders(true);
    setErrorMessage(null);

    try {
      const payload = await apiRequest<SalesOrdersResponse>('/sales/orders', {
        query: {
          q: search,
          status,
          limit,
          cursor: pageCursor
        }
      });
      const normalized = normalizeOrdersPayload(payload);
      setOrders(normalized.items);
      setNextCursor(normalized.nextCursor ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách đơn hàng.');
      setOrders([]);
      setNextCursor(null);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const loadApprovals = async () => {
    if (!canView) {
      return;
    }
    setIsLoadingApprovals(true);
    try {
      const payload = await apiRequest<ApprovalRecord[]>('/sales/approvals');
      setApprovals(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được hàng chờ phê duyệt.');
      setApprovals([]);
    } finally {
      setIsLoadingApprovals(false);
    }
  };

  useEffect(() => {
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, limit, pageCursor, canView]);

  useEffect(() => {
    void loadApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const refreshAll = async () => {
    await Promise.all([loadOrders(), loadApprovals()]);
  };

  const onSubmitCreateOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate) {
      return;
    }
    setResultMessage(null);
    setErrorMessage(null);
    try {
      const quantity = Math.max(1, Number(createForm.quantity || '1'));
      const unitPrice = Number(createForm.unitPrice);
      if (Number.isNaN(unitPrice) || unitPrice <= 0) {
        throw new Error('Đơn giá phải lớn hơn 0.');
      }

      await apiRequest('/sales/orders', {
        method: 'POST',
        body: {
          orderNo: createForm.orderNo || undefined,
          customerName: createForm.customerName || undefined,
          createdBy: createForm.createdBy || undefined,
          productName: createForm.productName,
          quantity,
          unitPrice
        }
      });
      setResultMessage('Tạo đơn hàng thành công.');
      setCreateForm({
        orderNo: '',
        customerName: '',
        createdBy: '',
        productName: '',
        quantity: '1',
        unitPrice: ''
      });
      setPageCursor(undefined);
      setCursorHistory([]);
      await refreshAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo đơn hàng.');
    }
  };

  const onSubmitUpdateOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate || !selectedOrder) {
      return;
    }
    setResultMessage(null);
    setErrorMessage(null);
    try {
      const quantity = Math.max(1, Number(updateForm.quantity || '1'));
      const unitPrice = Number(updateForm.unitPrice);
      if (Number.isNaN(unitPrice) || unitPrice <= 0) {
        throw new Error('Đơn giá cập nhật phải lớn hơn 0.');
      }
      if (!updateForm.requesterId || !updateForm.requesterName) {
        throw new Error('Cần nhập requesterId và requesterName để gửi yêu cầu chỉnh sửa.');
      }

      const response = await apiRequest<{ needsApproval?: boolean; message?: string } | SalesOrder>(
        `/sales/orders/${selectedOrder.id}`,
        {
          method: 'PATCH',
          body: {
            requesterId: updateForm.requesterId,
            requesterName: updateForm.requesterName,
            productName: updateForm.productName,
            quantity,
            unitPrice
          }
        }
      );

      if (response && typeof response === 'object' && 'needsApproval' in response) {
        setResultMessage(String(response.message ?? 'Yêu cầu chỉnh sửa đã được gửi.'));
      } else {
        setResultMessage('Đơn hàng đã được cập nhật.');
      }

      await refreshAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật đơn hàng.');
    }
  };

  const onDecision = async (approvalId: string, decision: 'approve' | 'reject') => {
    if (!canMutate) {
      return;
    }
    setResultMessage(null);
    setErrorMessage(null);
    try {
      await apiRequest(`/sales/approvals/${approvalId}/${decision}`, { method: 'POST' });
      setResultMessage(decision === 'approve' ? 'Đã duyệt yêu cầu chỉnh sửa.' : 'Đã từ chối yêu cầu chỉnh sửa.');
      await refreshAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể xử lý yêu cầu phê duyệt.');
    }
  };

  const goNextPage = () => {
    if (!nextCursor) {
      return;
    }
    setCursorHistory((prev) => [...prev, pageCursor ?? '']);
    setPageCursor(nextCursor);
  };

  const goPrevPage = () => {
    if (cursorHistory.length === 0) {
      setPageCursor(undefined);
      return;
    }
    const cloned = [...cursorHistory];
    const previousCursor = cloned.pop() ?? '';
    setCursorHistory(cloned);
    setPageCursor(previousCursor || undefined);
  };

  if (!canView) {
    return (
      <article className="module-workbench">
        <header className="module-header">
          <div>
            <h1>Sales Operations Board</h1>
            <p>Bạn không có quyền truy cập phân hệ Sales với vai trò hiện tại.</p>
          </div>
          <ul>
            <li>Vai trò hiện tại: {role}</li>
            <li>Đổi vai trò ở thanh công cụ để mô phỏng phân quyền.</li>
          </ul>
        </header>
      </article>
    );
  }

  return (
    <article className="module-workbench">
      <header className="module-header">
        <div>
          <h1>Sales Operations Board</h1>
          <p>Màn hình nghiệp vụ chuyên sâu cho luồng đơn hàng: danh sách, chỉnh sửa có duyệt và timeline phê duyệt.</p>
        </div>
        <ul>
          <li>Server-side filter: `q`, `status`, `limit`, `cursor`</li>
          <li>Flow UI: tạo đơn {'->'} cập nhật {'->'} hàng chờ duyệt {'->'} approve/reject</li>
          <li>Action gating theo RBAC (STAFF read-only, MANAGER/ADMIN thao tác đầy đủ)</li>
        </ul>
      </header>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}
      {!canMutate ? (
        <p className="banner banner-warning">Vai trò `{role}` chỉ có quyền xem trong màn hình này.</p>
      ) : null}

      <section className="sales-grid">
        <section className="panel-surface sales-panel">
          <div className="sales-panel-head">
            <h2>Danh sách đơn hàng</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
              Tải lại
            </button>
          </div>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="sales-search">Từ khóa</label>
              <input
                id="sales-search"
                value={search}
                placeholder="Mã đơn hoặc tên khách hàng"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPageCursor(undefined);
                  setCursorHistory([]);
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="sales-status">Trạng thái</label>
              <select
                id="sales-status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as (typeof STATUS_OPTIONS)[number]);
                  setPageCursor(undefined);
                  setCursorHistory([]);
                }}
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="sales-limit">Limit</label>
              <select
                id="sales-limit"
                value={String(limit)}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setPageCursor(undefined);
                  setCursorHistory([]);
                }}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>

          {isLoadingOrders ? <p className="muted">Đang tải đơn hàng...</p> : null}

          {!isLoadingOrders && orders.length === 0 ? <p className="muted">Chưa có đơn hàng nào.</p> : null}

          {orders.length > 0 ? (
            <>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mã đơn</th>
                      <th>Khách hàng</th>
                      <th>Tổng tiền</th>
                      <th>Trạng thái</th>
                      <th>Tạo bởi</th>
                      <th>Ngày tạo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className={selectedOrderId === order.id ? 'table-row-selected' : ''}
                        onClick={() => setSelectedOrderId(order.id)}
                      >
                        <td>{order.orderNo || order.id.slice(-8)}</td>
                        <td>{order.customerName || '--'}</td>
                        <td>{toCurrency(order.totalAmount)}</td>
                        <td>{order.status || '--'}</td>
                        <td>{order.createdBy || '--'}</td>
                        <td>{toDate(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination-row">
                <div className="pagination-left">
                  <span>Đang hiển thị: {orders.length} bản ghi</span>
                </div>
                <div className="pagination-right">
                  <button type="button" className="btn btn-ghost" disabled={cursorHistory.length === 0} onClick={goPrevPage}>
                    Trang trước
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={!nextCursor} onClick={goNextPage}>
                    Trang sau
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </section>

        <section className="panel-surface sales-panel">
          <div className="sales-panel-head">
            <h2>Tạo / cập nhật đơn hàng</h2>
            <p className="muted">Flow thao tác nghiệp vụ theo vai trò.</p>
          </div>

          <form className="form-grid" onSubmit={onSubmitCreateOrder}>
            <h3>Tạo đơn hàng mới</h3>
            <div className="field">
              <label htmlFor="create-order-no">Mã đơn</label>
              <input
                id="create-order-no"
                value={createForm.orderNo}
                placeholder="SO-2026-001"
                onChange={(event) => setCreateForm((prev) => ({ ...prev, orderNo: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="create-customer">Khách hàng</label>
              <input
                id="create-customer"
                value={createForm.customerName}
                required
                onChange={(event) => setCreateForm((prev) => ({ ...prev, customerName: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="create-created-by">Người tạo</label>
              <input
                id="create-created-by"
                value={createForm.createdBy}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, createdBy: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="create-product">Sản phẩm</label>
              <input
                id="create-product"
                value={createForm.productName}
                required
                onChange={(event) => setCreateForm((prev) => ({ ...prev, productName: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="create-quantity">Số lượng</label>
              <input
                id="create-quantity"
                type="number"
                min={1}
                value={createForm.quantity}
                required
                onChange={(event) => setCreateForm((prev) => ({ ...prev, quantity: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="create-price">Đơn giá</label>
              <input
                id="create-price"
                type="number"
                min={1}
                value={createForm.unitPrice}
                required
                onChange={(event) => setCreateForm((prev) => ({ ...prev, unitPrice: event.target.value }))}
              />
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canMutate}>
                Tạo đơn
              </button>
            </div>
          </form>

          <form className="form-grid" onSubmit={onSubmitUpdateOrder}>
            <h3>Yêu cầu chỉnh sửa đơn đã chọn</h3>
            <p className="muted">Đơn hiện tại: {selectedOrder ? selectedOrder.orderNo || selectedOrder.id : '--'}</p>
            <div className="field">
              <label htmlFor="update-requester-id">Requester ID</label>
              <input
                id="update-requester-id"
                value={updateForm.requesterId}
                required
                onChange={(event) => setUpdateForm((prev) => ({ ...prev, requesterId: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="update-requester-name">Requester Name</label>
              <input
                id="update-requester-name"
                value={updateForm.requesterName}
                required
                onChange={(event) => setUpdateForm((prev) => ({ ...prev, requesterName: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="update-product">Sản phẩm</label>
              <input
                id="update-product"
                value={updateForm.productName}
                required
                onChange={(event) => setUpdateForm((prev) => ({ ...prev, productName: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="update-quantity">Số lượng</label>
              <input
                id="update-quantity"
                type="number"
                min={1}
                value={updateForm.quantity}
                required
                onChange={(event) => setUpdateForm((prev) => ({ ...prev, quantity: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="update-price">Đơn giá</label>
              <input
                id="update-price"
                type="number"
                min={1}
                value={updateForm.unitPrice}
                required
                onChange={(event) => setUpdateForm((prev) => ({ ...prev, unitPrice: event.target.value }))}
              />
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canMutate || !selectedOrder}>
                Gửi yêu cầu chỉnh sửa
              </button>
            </div>
          </form>
        </section>

        <section className="panel-surface sales-panel">
          <div className="sales-panel-head">
            <h2>Timeline phê duyệt chỉnh sửa</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void loadApprovals()}>
              Tải lại timeline
            </button>
          </div>

          {isLoadingApprovals ? <p className="muted">Đang tải hàng chờ phê duyệt...</p> : null}
          {!isLoadingApprovals && approvals.length === 0 ? <p className="muted">Không có yêu cầu phê duyệt nào.</p> : null}

          {approvals.length > 0 ? (
            <div className="sales-approval-list">
              {approvals.map((approval) => (
                <article key={approval.id} className="sales-approval-item">
                  <div className="sales-approval-meta">
                    <strong>{approval.targetId || '--'}</strong>
                    <span>{approval.status || '--'}</span>
                  </div>
                  <p>
                    requester: <strong>{approval.requesterId || '--'}</strong> | approver:{' '}
                    <strong>{approval.approverId || '--'}</strong>
                  </p>
                  <p>
                    tạo lúc: {toDate(approval.createdAt)} | quyết định: {toDate(approval.decidedAt)}
                  </p>
                  {approval.status === 'PENDING' ? (
                    <div className="action-buttons">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!canMutate}
                        onClick={() => void onDecision(approval.id, 'approve')}
                      >
                        Duyệt
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={!canMutate}
                        onClick={() => void onDecision(approval.id, 'reject')}
                      >
                        Từ chối
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </section>
    </article>
  );
}
