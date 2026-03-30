'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { canAccessModule } from '../lib/rbac';
import { useUserRole } from './user-role-context';

type GenericStatus = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

type Vendor = {
  id: string;
  code?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string | null;
  createdAt?: string | null;
};

type PurchaseOrder = {
  id: string;
  poNo?: string | null;
  vendorId?: string | null;
  relatedSalesOrderNo?: string | null;
  totalAmount?: number | string | null;
  receivedAmount?: number | string | null;
  lifecycleStatus?: string | null;
  status?: string | null;
  expectedReceiveAt?: string | null;
  approvedAt?: string | null;
  closedAt?: string | null;
  notes?: string | null;
  vendor?: Vendor | null;
};

type PurchaseReceipt = {
  id: string;
  receiptNo?: string | null;
  invoiceNo?: string | null;
  receivedAmount?: number | string | null;
  receivedQty?: number | null;
  acceptedQty?: number | null;
  rejectedQty?: number | null;
  receivedAt?: string | null;
  note?: string | null;
};

type ThreeWayMatch = {
  purchaseOrder?: {
    id?: string;
    poNo?: string | null;
    vendorName?: string | null;
    lifecycleStatus?: string | null;
    amount?: number;
  };
  receipt?: {
    count?: number;
    amount?: number;
  };
  invoice?: {
    count?: number;
    amount?: number;
  };
  variance?: {
    poVsReceipt?: number;
    receiptVsInvoice?: number;
  };
};

type Shipment = {
  id: string;
  shipmentNo?: string | null;
  orderRef?: string | null;
  purchaseOrderId?: string | null;
  carrier?: string | null;
  lifecycleStatus?: string | null;
  status?: string | null;
  expectedDeliveryAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  onTimeDelivery?: boolean | null;
  damageReported?: boolean | null;
  purchaseOrder?: PurchaseOrder | null;
};

type VendorScorecard = {
  vendorId: string;
  vendorName: string;
  totalPurchaseOrders?: number;
  approvedPurchaseOrders?: number;
  receivedPurchaseOrders?: number;
  closedPurchaseOrders?: number;
  avgLeadTimeDays?: number;
  defectRate?: number;
  onTimeDeliveryRate?: number;
};

type VendorScorecardsResponse = {
  from?: string;
  to?: string;
  scorecards?: VendorScorecard[];
};

type CreateVendorForm = {
  code: string;
  name: string;
  phone: string;
  email: string;
  status: Exclude<GenericStatus, 'ALL'>;
};

type CreatePoForm = {
  poNo: string;
  vendorId: string;
  relatedSalesOrderNo: string;
  totalAmount: string;
  expectedReceiveAt: string;
  lifecycleStatus: string;
  status: Exclude<GenericStatus, 'ALL'>;
  notes: string;
};

type ReceiveForm = {
  receiptNo: string;
  invoiceNo: string;
  receivedAmount: string;
  receivedQty: string;
  acceptedQty: string;
  rejectedQty: string;
  receivedAt: string;
  note: string;
};

type CreateShipmentForm = {
  shipmentNo: string;
  orderRef: string;
  purchaseOrderId: string;
  carrier: string;
  expectedDeliveryAt: string;
  lifecycleStatus: string;
  status: Exclude<GenericStatus, 'ALL'>;
};

const STATUS_OPTIONS: GenericStatus[] = ['ALL', 'ACTIVE', 'INACTIVE', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED'];
const PO_LIFECYCLE_OPTIONS = ['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIAL_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'] as const;
const SHIPMENT_LIFECYCLE_OPTIONS = ['ALL', 'PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as const;

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

function toPercent(value: number | undefined) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '--';
  }
  return `${(value * 100).toFixed(1)}%`;
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
    case 'RECEIVED':
    case 'DELIVERED':
    case 'CLOSED':
      return 'finance-status-pill finance-status-pill-success';
    case 'PENDING':
    case 'SUBMITTED':
    case 'PARTIAL_RECEIVED':
    case 'IN_TRANSIT':
      return 'finance-status-pill finance-status-pill-warning';
    case 'REJECTED':
    case 'CANCELLED':
      return 'finance-status-pill finance-status-pill-danger';
    default:
      return 'finance-status-pill finance-status-pill-neutral';
  }
}

export function ScmOperationsBoard() {
  const { role } = useUserRole();
  const canView = canAccessModule(role, 'scm');
  const canMutate = role === 'MANAGER' || role === 'ADMIN';

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [vendorSearch, setVendorSearch] = useState('');
  const [poSearch, setPoSearch] = useState('');
  const [shipmentSearch, setShipmentSearch] = useState('');
  const [poStatus, setPoStatus] = useState<GenericStatus>('ALL');
  const [poLifecycle, setPoLifecycle] = useState<(typeof PO_LIFECYCLE_OPTIONS)[number]>('ALL');
  const [shipmentLifecycle, setShipmentLifecycle] = useState<(typeof SHIPMENT_LIFECYCLE_OPTIONS)[number]>('ALL');
  const [limit, setLimit] = useState(20);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [threeWayMatch, setThreeWayMatch] = useState<ThreeWayMatch | null>(null);
  const [scorecards, setScorecards] = useState<VendorScorecard[]>([]);

  const [selectedPoId, setSelectedPoId] = useState('');
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [poTransitionNote, setPoTransitionNote] = useState('');
  const [shipmentTransitionNote, setShipmentTransitionNote] = useState('');
  const [scorecardFrom, setScorecardFrom] = useState('');
  const [scorecardTo, setScorecardTo] = useState('');

  const [isLoadingVendors, setIsLoadingVendors] = useState(false);
  const [isLoadingPo, setIsLoadingPo] = useState(false);
  const [isLoadingShipments, setIsLoadingShipments] = useState(false);
  const [isLoadingReceipts, setIsLoadingReceipts] = useState(false);
  const [isLoadingScorecards, setIsLoadingScorecards] = useState(false);

  const [createVendorForm, setCreateVendorForm] = useState<CreateVendorForm>({
    code: '',
    name: '',
    phone: '',
    email: '',
    status: 'ACTIVE'
  });

  const [createPoForm, setCreatePoForm] = useState<CreatePoForm>({
    poNo: '',
    vendorId: '',
    relatedSalesOrderNo: '',
    totalAmount: '',
    expectedReceiveAt: '',
    lifecycleStatus: 'DRAFT',
    status: 'DRAFT',
    notes: ''
  });

  const [receiveForm, setReceiveForm] = useState<ReceiveForm>({
    receiptNo: '',
    invoiceNo: '',
    receivedAmount: '',
    receivedQty: '',
    acceptedQty: '',
    rejectedQty: '',
    receivedAt: '',
    note: ''
  });

  const [createShipmentForm, setCreateShipmentForm] = useState<CreateShipmentForm>({
    shipmentNo: '',
    orderRef: '',
    purchaseOrderId: '',
    carrier: '',
    expectedDeliveryAt: '',
    lifecycleStatus: 'PENDING',
    status: 'PENDING'
  });

  const selectedPo = useMemo(() => purchaseOrders.find((row) => row.id === selectedPoId) ?? null, [purchaseOrders, selectedPoId]);
  const selectedShipment = useMemo(() => shipments.find((row) => row.id === selectedShipmentId) ?? null, [shipments, selectedShipmentId]);

  useEffect(() => {
    if (!selectedPoId && purchaseOrders.length > 0) {
      setSelectedPoId(purchaseOrders[0].id);
      return;
    }
    if (selectedPoId && purchaseOrders.length > 0 && !purchaseOrders.some((row) => row.id === selectedPoId)) {
      setSelectedPoId(purchaseOrders[0].id);
    }
  }, [purchaseOrders, selectedPoId]);

  useEffect(() => {
    if (!selectedShipmentId && shipments.length > 0) {
      setSelectedShipmentId(shipments[0].id);
      return;
    }
    if (selectedShipmentId && shipments.length > 0 && !shipments.some((row) => row.id === selectedShipmentId)) {
      setSelectedShipmentId(shipments[0].id);
    }
  }, [shipments, selectedShipmentId]);

  const loadVendors = async () => {
    if (!canView) return;
    setIsLoadingVendors(true);
    try {
      const payload = await apiRequest<unknown>('/scm/vendors', {
        query: { q: vendorSearch, limit }
      });
      setVendors(normalizeArray<Vendor>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách vendor.');
      setVendors([]);
    } finally {
      setIsLoadingVendors(false);
    }
  };

  const loadPurchaseOrders = async () => {
    if (!canView) return;
    setIsLoadingPo(true);
    try {
      const payload = await apiRequest<unknown>('/scm/purchase-orders', {
        query: {
          q: poSearch,
          limit,
          status: poStatus === 'ALL' ? undefined : poStatus,
          lifecycleStatus: poLifecycle === 'ALL' ? undefined : poLifecycle
        }
      });
      setPurchaseOrders(normalizeArray<PurchaseOrder>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách PO.');
      setPurchaseOrders([]);
    } finally {
      setIsLoadingPo(false);
    }
  };

  const loadShipments = async () => {
    if (!canView) return;
    setIsLoadingShipments(true);
    try {
      const payload = await apiRequest<unknown>('/scm/shipments', {
        query: {
          q: shipmentSearch,
          limit,
          lifecycleStatus: shipmentLifecycle === 'ALL' ? undefined : shipmentLifecycle
        }
      });
      setShipments(normalizeArray<Shipment>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách shipment.');
      setShipments([]);
    } finally {
      setIsLoadingShipments(false);
    }
  };

  const loadReceiptsAndMatch = async (poId: string | null) => {
    if (!canView || !poId) {
      setReceipts([]);
      setThreeWayMatch(null);
      return;
    }

    setIsLoadingReceipts(true);
    try {
      const [receiptsPayload, matchPayload] = await Promise.all([
        apiRequest<unknown>(`/scm/purchase-orders/${poId}/receipts`),
        apiRequest<unknown>(`/scm/purchase-orders/${poId}/three-way-match`)
      ]);
      setReceipts(normalizeArray<PurchaseReceipt>(receiptsPayload));
      setThreeWayMatch(normalizeObject<ThreeWayMatch>(matchPayload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được receipts/three-way-match.');
      setReceipts([]);
      setThreeWayMatch(null);
    } finally {
      setIsLoadingReceipts(false);
    }
  };

  const loadScorecards = async () => {
    if (!canView) return;
    setIsLoadingScorecards(true);
    try {
      const payload = await apiRequest<unknown>('/scm/vendor-scorecards', {
        query: {
          from: scorecardFrom || undefined,
          to: scorecardTo || undefined
        }
      });
      const mapped = normalizeObject<VendorScorecardsResponse>(payload);
      setScorecards(mapped?.scorecards ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được vendor scorecards.');
      setScorecards([]);
    } finally {
      setIsLoadingScorecards(false);
    }
  };

  useEffect(() => {
    void loadVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, vendorSearch, limit]);

  useEffect(() => {
    void loadPurchaseOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, poSearch, poStatus, poLifecycle, limit]);

  useEffect(() => {
    void loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, shipmentSearch, shipmentLifecycle, limit]);

  useEffect(() => {
    void loadScorecards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, scorecardFrom, scorecardTo]);

  useEffect(() => {
    void loadReceiptsAndMatch(selectedPoId || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, selectedPoId]);

  const refreshAll = async () => {
    await Promise.all([loadVendors(), loadPurchaseOrders(), loadShipments(), loadScorecards(), loadReceiptsAndMatch(selectedPoId || null)]);
  };

  const onCreateVendor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      if (!createVendorForm.name.trim()) {
        throw new Error('Tên nhà cung cấp là bắt buộc.');
      }
      await apiRequest('/scm/vendors', {
        method: 'POST',
        body: {
          code: createVendorForm.code || undefined,
          name: createVendorForm.name,
          phone: createVendorForm.phone || undefined,
          email: createVendorForm.email || undefined,
          status: createVendorForm.status
        }
      });
      setResultMessage('Đã tạo nhà cung cấp.');
      setCreateVendorForm((prev) => ({ ...prev, code: '', name: '', phone: '', email: '' }));
      await loadVendors();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo vendor.');
    }
  };

  const onCreatePo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      const totalAmount = createPoForm.totalAmount ? Number(createPoForm.totalAmount) : undefined;
      if (totalAmount !== undefined && (!Number.isFinite(totalAmount) || totalAmount < 0)) {
        throw new Error('Tổng tiền PO không hợp lệ.');
      }

      await apiRequest('/scm/purchase-orders', {
        method: 'POST',
        body: {
          poNo: createPoForm.poNo || undefined,
          vendorId: createPoForm.vendorId || undefined,
          relatedSalesOrderNo: createPoForm.relatedSalesOrderNo || undefined,
          totalAmount,
          expectedReceiveAt: createPoForm.expectedReceiveAt || undefined,
          lifecycleStatus: createPoForm.lifecycleStatus || undefined,
          status: createPoForm.status,
          notes: createPoForm.notes || undefined
        }
      });

      setResultMessage('Đã tạo purchase order.');
      setCreatePoForm((prev) => ({
        ...prev,
        poNo: '',
        relatedSalesOrderNo: '',
        totalAmount: '',
        expectedReceiveAt: '',
        notes: ''
      }));
      await loadPurchaseOrders();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo PO.');
    }
  };

  const onPoTransition = async (action: 'submit' | 'approve' | 'cancel' | 'close') => {
    if (!canMutate || !selectedPo) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      await apiRequest(`/scm/purchase-orders/${selectedPo.id}/${action}`, {
        method: 'POST',
        body: {
          note: poTransitionNote || undefined
        }
      });
      setResultMessage(`Đã thực hiện ${action.toUpperCase()} cho PO.`);
      await Promise.all([loadPurchaseOrders(), loadReceiptsAndMatch(selectedPo.id)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể chuyển trạng thái PO.');
    }
  };

  const onReceivePo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate || !selectedPo) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      const receivedAmount = Number(receiveForm.receivedAmount);
      if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) {
        throw new Error('Số tiền nhận hàng phải lớn hơn 0.');
      }

      await apiRequest(`/scm/purchase-orders/${selectedPo.id}/receive`, {
        method: 'POST',
        body: {
          receiptNo: receiveForm.receiptNo || undefined,
          invoiceNo: receiveForm.invoiceNo || undefined,
          receivedAmount,
          receivedQty: receiveForm.receivedQty ? Number(receiveForm.receivedQty) : undefined,
          acceptedQty: receiveForm.acceptedQty ? Number(receiveForm.acceptedQty) : undefined,
          rejectedQty: receiveForm.rejectedQty ? Number(receiveForm.rejectedQty) : undefined,
          receivedAt: receiveForm.receivedAt || undefined,
          note: receiveForm.note || undefined
        }
      });

      setResultMessage('Đã ghi nhận receipt cho PO.');
      setReceiveForm((prev) => ({ ...prev, receiptNo: '', invoiceNo: '', receivedAmount: '', receivedQty: '', acceptedQty: '', rejectedQty: '', receivedAt: '', note: '' }));
      await Promise.all([loadPurchaseOrders(), loadReceiptsAndMatch(selectedPo.id)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể ghi nhận receipt.');
    }
  };

  const onCreateShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      await apiRequest('/scm/shipments', {
        method: 'POST',
        body: {
          shipmentNo: createShipmentForm.shipmentNo || undefined,
          orderRef: createShipmentForm.orderRef || undefined,
          purchaseOrderId: createShipmentForm.purchaseOrderId || undefined,
          carrier: createShipmentForm.carrier || undefined,
          expectedDeliveryAt: createShipmentForm.expectedDeliveryAt || undefined,
          lifecycleStatus: createShipmentForm.lifecycleStatus || undefined,
          status: createShipmentForm.status
        }
      });

      setResultMessage('Đã tạo shipment mới.');
      setCreateShipmentForm((prev) => ({ ...prev, shipmentNo: '', orderRef: '', expectedDeliveryAt: '' }));
      await loadShipments();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo shipment.');
    }
  };

  const onShipmentTransition = async (action: 'ship' | 'deliver') => {
    if (!canMutate || !selectedShipment) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      await apiRequest(`/scm/shipments/${selectedShipment.id}/${action}`, {
        method: 'POST',
        body: {
          note: shipmentTransitionNote || undefined
        }
      });
      setResultMessage(`Đã chuyển shipment sang trạng thái ${action.toUpperCase()}.`);
      await loadShipments();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể chuyển trạng thái shipment.');
    }
  };

  if (!canView) {
    return (
      <article className="module-workbench">
        <header className="module-header">
          <div>
            <h1>SCM Operations Board</h1>
            <p>Bạn không có quyền truy cập phân hệ SCM với vai trò hiện tại.</p>
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
          <h1>SCM Operations Board</h1>
          <p>Luồng nghiệp vụ chuỗi cung ứng: vendor, purchase order lifecycle, nhận hàng, vận chuyển và scorecard nhà cung cấp.</p>
        </div>
        <ul>
          <li>Flow PO: create - submit - approve - receive - close/cancel</li>
          <li>Three-way match theo PO/receipt/invoice</li>
          <li>Shipment flow: pending - in_transit - delivered</li>
        </ul>
      </header>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}
      {!canMutate ? <p className="banner banner-warning">Vai trò `{role}` chỉ có quyền xem trong module này.</p> : null}

      <section className="scm-grid">
        <section className="panel-surface scm-panel">
          <div className="scm-panel-head">
            <h2>Vendor Master</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
              Tải lại
            </button>
          </div>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="vendor-search">Từ khóa vendor</label>
              <input id="vendor-search" value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} placeholder="Tên, code, email" />
            </div>
            <div className="field">
              <label htmlFor="scm-limit">Limit</label>
              <select id="scm-limit" value={String(limit)} onChange={(event) => setLimit(Number(event.target.value))}>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          {isLoadingVendors ? <p className="muted">Đang tải vendor...</p> : null}
          {!isLoadingVendors && vendors.length === 0 ? <p className="muted">Chưa có vendor.</p> : null}

          {vendors.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((vendor) => (
                    <tr key={vendor.id}>
                      <td>{vendor.code || '--'}</td>
                      <td>{vendor.name || '--'}</td>
                      <td>{vendor.phone || '--'}</td>
                      <td>{vendor.email || '--'}</td>
                      <td>
                        <span className={statusClass(vendor.status)}>{vendor.status || '--'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <form className="form-grid" onSubmit={onCreateVendor}>
            <h3>Tạo nhà cung cấp</h3>
            <div className="field">
              <label htmlFor="vendor-code">Code</label>
              <input id="vendor-code" value={createVendorForm.code} onChange={(event) => setCreateVendorForm((prev) => ({ ...prev, code: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="vendor-name">Tên nhà cung cấp</label>
              <input id="vendor-name" value={createVendorForm.name} required onChange={(event) => setCreateVendorForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="vendor-phone">SĐT</label>
              <input id="vendor-phone" value={createVendorForm.phone} onChange={(event) => setCreateVendorForm((prev) => ({ ...prev, phone: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="vendor-email">Email</label>
              <input id="vendor-email" value={createVendorForm.email} onChange={(event) => setCreateVendorForm((prev) => ({ ...prev, email: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="vendor-status">Status</label>
              <select id="vendor-status" value={createVendorForm.status} onChange={(event) => setCreateVendorForm((prev) => ({ ...prev, status: event.target.value as Exclude<GenericStatus, 'ALL'> }))}>
                {STATUS_OPTIONS.filter((item) => item !== 'ALL').map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canMutate}>Tạo vendor</button>
            </div>
          </form>
        </section>

        <section className="panel-surface scm-panel">
          <div className="scm-panel-head">
            <h2>Purchase Orders</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void loadPurchaseOrders()}>
              Tải lại PO
            </button>
          </div>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="po-search">Từ khóa PO</label>
              <input id="po-search" value={poSearch} onChange={(event) => setPoSearch(event.target.value)} placeholder="PO code / sales order" />
            </div>
            <div className="field">
              <label htmlFor="po-status">Status</label>
              <select id="po-status" value={poStatus} onChange={(event) => setPoStatus(event.target.value as GenericStatus)}>
                {STATUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="po-lifecycle">Lifecycle</label>
              <select id="po-lifecycle" value={poLifecycle} onChange={(event) => setPoLifecycle(event.target.value as (typeof PO_LIFECYCLE_OPTIONS)[number])}>
                {PO_LIFECYCLE_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          {isLoadingPo ? <p className="muted">Đang tải purchase orders...</p> : null}
          {!isLoadingPo && purchaseOrders.length === 0 ? <p className="muted">Chưa có purchase order phù hợp.</p> : null}

          {purchaseOrders.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>PO</th>
                    <th>Vendor</th>
                    <th>Total</th>
                    <th>Received</th>
                    <th>Lifecycle</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders.map((po) => (
                    <tr key={po.id} className={selectedPoId === po.id ? 'table-row-selected' : ''} onClick={() => setSelectedPoId(po.id)}>
                      <td>{po.poNo || po.id.slice(-8)}</td>
                      <td>{po.vendor?.name || po.vendorId || '--'}</td>
                      <td>{toCurrency(po.totalAmount)}</td>
                      <td>{toCurrency(po.receivedAmount)}</td>
                      <td><span className={statusClass(po.lifecycleStatus)}>{po.lifecycleStatus || '--'}</span></td>
                      <td><span className={statusClass(po.status)}>{po.status || '--'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <form className="form-grid" onSubmit={onCreatePo}>
            <h3>Tạo PO</h3>
            <div className="field">
              <label htmlFor="po-no">PO No</label>
              <input id="po-no" value={createPoForm.poNo} onChange={(event) => setCreatePoForm((prev) => ({ ...prev, poNo: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="po-vendor">Vendor ID</label>
              <input id="po-vendor" value={createPoForm.vendorId} onChange={(event) => setCreatePoForm((prev) => ({ ...prev, vendorId: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="po-sales-order">Related Sales Order</label>
              <input id="po-sales-order" value={createPoForm.relatedSalesOrderNo} onChange={(event) => setCreatePoForm((prev) => ({ ...prev, relatedSalesOrderNo: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="po-total">Total Amount</label>
              <input id="po-total" type="number" min={0} step="0.01" value={createPoForm.totalAmount} onChange={(event) => setCreatePoForm((prev) => ({ ...prev, totalAmount: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="po-expected">Expected Receive Date</label>
              <input id="po-expected" type="date" value={createPoForm.expectedReceiveAt} onChange={(event) => setCreatePoForm((prev) => ({ ...prev, expectedReceiveAt: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="po-lifecycle-create">Lifecycle</label>
              <select id="po-lifecycle-create" value={createPoForm.lifecycleStatus} onChange={(event) => setCreatePoForm((prev) => ({ ...prev, lifecycleStatus: event.target.value }))}>
                {PO_LIFECYCLE_OPTIONS.filter((item) => item !== 'ALL').map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="po-status-create">Status</label>
              <select id="po-status-create" value={createPoForm.status} onChange={(event) => setCreatePoForm((prev) => ({ ...prev, status: event.target.value as Exclude<GenericStatus, 'ALL'> }))}>
                {STATUS_OPTIONS.filter((item) => item !== 'ALL').map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="po-notes">Notes</label>
              <textarea id="po-notes" value={createPoForm.notes} onChange={(event) => setCreatePoForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canMutate}>Tạo PO</button>
            </div>
          </form>

          <section className="panel-surface">
            <h3>PO Flow & Receiving</h3>
            <p className="muted">PO đang chọn: {selectedPo ? selectedPo.poNo || selectedPo.id : '--'}</p>
            <div className="field">
              <label htmlFor="po-transition-note">Transition note</label>
              <input id="po-transition-note" value={poTransitionNote} onChange={(event) => setPoTransitionNote(event.target.value)} />
            </div>
            <div className="action-buttons">
              <button type="button" className="btn btn-ghost" disabled={!canMutate || !selectedPo} onClick={() => void onPoTransition('submit')}>Submit</button>
              <button type="button" className="btn btn-ghost" disabled={!canMutate || !selectedPo} onClick={() => void onPoTransition('approve')}>Approve</button>
              <button type="button" className="btn btn-ghost" disabled={!canMutate || !selectedPo} onClick={() => void onPoTransition('cancel')}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!canMutate || !selectedPo} onClick={() => void onPoTransition('close')}>Close</button>
            </div>

            <form className="form-grid" onSubmit={onReceivePo}>
              <h4>Receive hàng cho PO</h4>
              <div className="field">
                <label htmlFor="receipt-amount">Received Amount</label>
                <input id="receipt-amount" type="number" min={0.01} step="0.01" value={receiveForm.receivedAmount} required onChange={(event) => setReceiveForm((prev) => ({ ...prev, receivedAmount: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="receipt-no">Receipt No</label>
                <input id="receipt-no" value={receiveForm.receiptNo} onChange={(event) => setReceiveForm((prev) => ({ ...prev, receiptNo: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="receipt-invoice-no">Invoice No</label>
                <input id="receipt-invoice-no" value={receiveForm.invoiceNo} onChange={(event) => setReceiveForm((prev) => ({ ...prev, invoiceNo: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="receipt-date">Received At</label>
                <input id="receipt-date" type="date" value={receiveForm.receivedAt} onChange={(event) => setReceiveForm((prev) => ({ ...prev, receivedAt: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="receipt-qty">Received Qty</label>
                <input id="receipt-qty" type="number" min={0} value={receiveForm.receivedQty} onChange={(event) => setReceiveForm((prev) => ({ ...prev, receivedQty: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="accepted-qty">Accepted Qty</label>
                <input id="accepted-qty" type="number" min={0} value={receiveForm.acceptedQty} onChange={(event) => setReceiveForm((prev) => ({ ...prev, acceptedQty: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="rejected-qty">Rejected Qty</label>
                <input id="rejected-qty" type="number" min={0} value={receiveForm.rejectedQty} onChange={(event) => setReceiveForm((prev) => ({ ...prev, rejectedQty: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="receipt-note">Note</label>
                <textarea id="receipt-note" value={receiveForm.note} onChange={(event) => setReceiveForm((prev) => ({ ...prev, note: event.target.value }))} />
              </div>
              <div className="action-buttons">
                <button type="submit" className="btn btn-primary" disabled={!canMutate || !selectedPo}>Ghi nhận receive</button>
              </div>
            </form>

            {isLoadingReceipts ? <p className="muted">Đang tải receipts và đối soát...</p> : null}

            {threeWayMatch ? (
              <div className="overview-cards">
                <article className="overview-card">
                  <p>PO Amount</p>
                  <strong>{toCurrency(threeWayMatch.purchaseOrder?.amount)}</strong>
                </article>
                <article className="overview-card">
                  <p>Receipt Amount</p>
                  <strong>{toCurrency(threeWayMatch.receipt?.amount)}</strong>
                </article>
                <article className="overview-card">
                  <p>Invoice Amount</p>
                  <strong>{toCurrency(threeWayMatch.invoice?.amount)}</strong>
                </article>
              </div>
            ) : null}

            {receipts.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Invoice</th>
                      <th>Received Amount</th>
                      <th>Accepted</th>
                      <th>Rejected</th>
                      <th>Received At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((receipt) => (
                      <tr key={receipt.id}>
                        <td>{receipt.receiptNo || receipt.id.slice(-8)}</td>
                        <td>{receipt.invoiceNo || '--'}</td>
                        <td>{toCurrency(receipt.receivedAmount)}</td>
                        <td>{receipt.acceptedQty ?? '--'}</td>
                        <td>{receipt.rejectedQty ?? '--'}</td>
                        <td>{toDateTime(receipt.receivedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !isLoadingReceipts ? <p className="muted">PO này chưa có receipt.</p> : null
            )}
          </section>
        </section>

        <section className="panel-surface scm-panel">
          <div className="scm-panel-head">
            <h2>Shipments & Vendor Scorecard</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void loadShipments()}>
              Tải lại shipment
            </button>
          </div>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="shipment-search">Từ khóa shipment</label>
              <input id="shipment-search" value={shipmentSearch} onChange={(event) => setShipmentSearch(event.target.value)} placeholder="shipmentNo / orderRef / carrier" />
            </div>
            <div className="field">
              <label htmlFor="shipment-lifecycle">Shipment lifecycle</label>
              <select id="shipment-lifecycle" value={shipmentLifecycle} onChange={(event) => setShipmentLifecycle(event.target.value as (typeof SHIPMENT_LIFECYCLE_OPTIONS)[number])}>
                {SHIPMENT_LIFECYCLE_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          {isLoadingShipments ? <p className="muted">Đang tải shipment...</p> : null}
          {!isLoadingShipments && shipments.length === 0 ? <p className="muted">Không có shipment phù hợp.</p> : null}

          {shipments.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Shipment</th>
                    <th>Carrier</th>
                    <th>PO</th>
                    <th>Lifecycle</th>
                    <th>Expected</th>
                    <th>Delivered</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => (
                    <tr key={shipment.id} className={selectedShipmentId === shipment.id ? 'table-row-selected' : ''} onClick={() => setSelectedShipmentId(shipment.id)}>
                      <td>{shipment.shipmentNo || shipment.id.slice(-8)}</td>
                      <td>{shipment.carrier || '--'}</td>
                      <td>{shipment.purchaseOrder?.poNo || shipment.purchaseOrderId || '--'}</td>
                      <td><span className={statusClass(shipment.lifecycleStatus)}>{shipment.lifecycleStatus || '--'}</span></td>
                      <td>{toDateTime(shipment.expectedDeliveryAt)}</td>
                      <td>{toDateTime(shipment.deliveredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <form className="form-grid" onSubmit={onCreateShipment}>
            <h3>Tạo shipment</h3>
            <div className="field">
              <label htmlFor="shipment-no">Shipment No</label>
              <input id="shipment-no" value={createShipmentForm.shipmentNo} onChange={(event) => setCreateShipmentForm((prev) => ({ ...prev, shipmentNo: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="shipment-order-ref">Order Ref</label>
              <input id="shipment-order-ref" value={createShipmentForm.orderRef} onChange={(event) => setCreateShipmentForm((prev) => ({ ...prev, orderRef: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="shipment-po-id">Purchase Order ID</label>
              <input id="shipment-po-id" value={createShipmentForm.purchaseOrderId} onChange={(event) => setCreateShipmentForm((prev) => ({ ...prev, purchaseOrderId: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="shipment-carrier">Carrier</label>
              <input id="shipment-carrier" value={createShipmentForm.carrier} onChange={(event) => setCreateShipmentForm((prev) => ({ ...prev, carrier: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="shipment-expected">Expected Delivery</label>
              <input id="shipment-expected" type="date" value={createShipmentForm.expectedDeliveryAt} onChange={(event) => setCreateShipmentForm((prev) => ({ ...prev, expectedDeliveryAt: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="shipment-lifecycle-create">Lifecycle</label>
              <select id="shipment-lifecycle-create" value={createShipmentForm.lifecycleStatus} onChange={(event) => setCreateShipmentForm((prev) => ({ ...prev, lifecycleStatus: event.target.value }))}>
                {SHIPMENT_LIFECYCLE_OPTIONS.filter((item) => item !== 'ALL').map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="shipment-status-create">Status</label>
              <select id="shipment-status-create" value={createShipmentForm.status} onChange={(event) => setCreateShipmentForm((prev) => ({ ...prev, status: event.target.value as Exclude<GenericStatus, 'ALL'> }))}>
                {STATUS_OPTIONS.filter((item) => item !== 'ALL').map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canMutate}>Tạo shipment</button>
            </div>
          </form>

          <section className="panel-surface">
            <h3>Shipment transitions</h3>
            <p className="muted">Shipment đang chọn: {selectedShipment ? selectedShipment.shipmentNo || selectedShipment.id : '--'}</p>
            <div className="field">
              <label htmlFor="shipment-transition-note">Transition note</label>
              <input id="shipment-transition-note" value={shipmentTransitionNote} onChange={(event) => setShipmentTransitionNote(event.target.value)} />
            </div>
            <div className="action-buttons">
              <button type="button" className="btn btn-ghost" disabled={!canMutate || !selectedShipment} onClick={() => void onShipmentTransition('ship')}>Mark Shipped</button>
              <button type="button" className="btn btn-primary" disabled={!canMutate || !selectedShipment} onClick={() => void onShipmentTransition('deliver')}>Mark Delivered</button>
            </div>
          </section>

          <section className="panel-surface">
            <div className="scm-panel-head">
              <h3>Vendor scorecards</h3>
              <button type="button" className="btn btn-ghost" onClick={() => void loadScorecards()}>
                Tải lại scorecard
              </button>
            </div>
            <div className="filter-grid">
              <div className="field">
                <label htmlFor="score-from">From</label>
                <input id="score-from" type="date" value={scorecardFrom} onChange={(event) => setScorecardFrom(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="score-to">To</label>
                <input id="score-to" type="date" value={scorecardTo} onChange={(event) => setScorecardTo(event.target.value)} />
              </div>
            </div>

            {isLoadingScorecards ? <p className="muted">Đang tải scorecard...</p> : null}
            {!isLoadingScorecards && scorecards.length === 0 ? <p className="muted">Không có scorecard trong khoảng thời gian đã chọn.</p> : null}

            {scorecards.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th>Total PO</th>
                      <th>Avg Lead Time</th>
                      <th>Defect Rate</th>
                      <th>OTD Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorecards.map((card) => (
                      <tr key={card.vendorId}>
                        <td>{card.vendorName}</td>
                        <td>{card.totalPurchaseOrders ?? 0}</td>
                        <td>{card.avgLeadTimeDays ?? 0} ngày</td>
                        <td>{toPercent(card.defectRate)}</td>
                        <td>{toPercent(card.onTimeDeliveryRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </section>
      </section>
    </article>
  );
}
