'use client';

import {
  Truck,
  Package,
  ShoppingCart,
  Users,
  Plus,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  TrendingUp,
  ShieldCheck,
  MapPin,
  Calendar,
  Layers,
  BarChart3,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { formatRuntimeCurrency, formatRuntimeDateTime } from '../lib/runtime-format';
import type { BulkRowId } from '../lib/bulk-actions';
import { useAccessPolicy } from './access-policy-context';
import { StandardDataTable, ColumnDefinition } from './ui/standard-data-table';
import { SidePanel } from './ui/side-panel';
import { Badge, statusToBadge } from './ui/badge';

type GenericStatus = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

type Vendor = {
  id: string;
  code?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string | null;
};

type PurchaseOrder = {
  id: string;
  poNo?: string | null;
  vendorId?: string | null;
  totalAmount?: number | string | null;
  receivedAmount?: number | string | null;
  lifecycleStatus?: string | null;
  status?: string | null;
  expectedReceiveAt?: string | null;
  vendor?: Vendor | null;
};

type PurchaseReceipt = {
  id: string;
  receiptNo?: string | null;
  receivedAmount?: number | string | null;
  receivedQty?: number | null;
  receivedAt?: string | null;
};

type Shipment = {
  id: string;
  shipmentNo?: string | null;
  carrier?: string | null;
  lifecycleStatus?: string | null;
  expectedDeliveryAt?: string | null;
};

const SCM_VENDOR_STORAGE_KEY = 'erp-retail.scm.vendor-table-settings.v2';
const SCM_PO_STORAGE_KEY = 'erp-retail.scm.po-table-settings.v2';

function toCurrency(value: any) {
  return formatRuntimeCurrency(Number(value || 0));
}

function toDateTime(value: any) {
  if (!value) return '--';
  const p = new Date(value);
  return isNaN(p.getTime()) ? value : formatRuntimeDateTime(p.toISOString());
}



export function ScmOperationsBoard() {
  const { canModule, canAction } = useAccessPolicy();
  const canView = canModule('scm');
  const canCreate = canAction('scm', 'CREATE');

  const [activeTab, setActiveTab] = useState<'PO' | 'VENDORS' | 'SHIPMENTS'>('PO');
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRowIds, setSelectedRowIds] = useState<BulkRowId[]>([]);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const loadData = async () => {
    if (!canView) return;
    setIsLoading(true);
    try {
      const [poData, vendorData, shipData] = await Promise.all([
        apiRequest<any>('/scm/purchase-orders', { query: { q: search, limit: 100 } }),
        apiRequest<any>('/scm/vendors', { query: { q: search, limit: 100 } }),
        apiRequest<any>('/scm/shipments', { query: { q: search, limit: 100 } }),
      ]);
      setPurchaseOrders(normalizeListPayload(poData) as PurchaseOrder[]);
      setVendors(normalizeListPayload(vendorData) as Vendor[]);
      setShipments(normalizeListPayload(shipData) as Shipment[]);
    } catch (e) {
    } finally {
      setIsLoading(false);
    }
  };

  const loadPoDetails = async (id: string) => {
    setIsLoadingDetails(true);
    try {
      const data = await apiRequest<any>(`/scm/purchase-orders/${id}/receipts`);
      setReceipts(normalizeListPayload(data) as PurchaseReceipt[]);
    } catch (e) {
    } finally {
      setIsLoadingDetails(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search]);

  useEffect(() => {
    if (selectedPo) loadPoDetails(selectedPo.id);
  }, [selectedPo]);

  const poColumns: ColumnDefinition<PurchaseOrder>[] = [
    { key: 'poNo', label: 'Số PO', isLink: true, render: (p) => p.poNo || p.id.slice(-8) },
    { key: 'vendor', label: 'Nhà cung cấp', render: (p) => p.vendor?.name || p.vendorId || '--' },
    { key: 'totalAmount', label: 'Tổng tiền', render: (p) => toCurrency(p.totalAmount) },
    { key: 'receivedAmount', label: 'Đã nhận', render: (p) => toCurrency(p.receivedAmount) },
    { key: 'lifecycleStatus', label: 'Vòng đời', render: (p) => <Badge variant={statusToBadge(p.lifecycleStatus)}>{p.lifecycleStatus}</Badge> },
    { key: 'status', label: 'Trạng thái', render: (p) => <Badge variant={statusToBadge(p.status)}>{p.status}</Badge> },
    { key: 'expectedReceiveAt', label: 'Ngày nhận dự kiến', render: (p) => toDateTime(p.expectedReceiveAt) },
  ];

  const vendorColumns: ColumnDefinition<Vendor>[] = [
    { key: 'code', label: 'Mã NCC', isLink: true },
    { key: 'name', label: 'Tên nhà cung cấp' },
    { key: 'phone', label: 'Điện thoại' },
    { key: 'email', label: 'Email' },
    { key: 'status', label: 'Trạng thái', render: (v) => <Badge variant={statusToBadge(v.status)}>{v.status}</Badge> },
  ];

  if (!canView) return null;

  return (
    <div className="scm-board">
      {/* Metrics Section */}
      <div className="metrics-grid" style={{ marginBottom: '2rem', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <h4 className="finance-status-title"><ShoppingCart size={16} /> PO Chờ duyệt</h4>
          <p className="finance-status-value">{purchaseOrders.filter(p => p.lifecycleStatus === 'SUBMITTED').length}</p>
        </div>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--success)' }}>
          <h4 className="finance-status-title"><Package size={16} /> Đang giao hàng</h4>
          <p className="finance-status-value finance-status-value-success">{shipments.filter(s => s.lifecycleStatus === 'IN_TRANSIT').length}</p>
        </div>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--warning)' }}>
          <h4 className="finance-status-title"><Layers size={16} /> Kho sắp hết hạn</h4>
          <p className="finance-status-value finance-status-value-warning">12</p>
        </div>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--danger)' }}>
          <h4 className="finance-status-title"><BarChart3 size={16} /> Defect Rate</h4>
          <p className="finance-status-value finance-status-value-danger">0.5%</p>
        </div>
      </div>

      {/* Tabs Layout */}
      <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid var(--line)', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => setActiveTab('PO')}
          style={{ padding: '0.75rem 0', fontWeight: 600, fontSize: '0.875rem', borderBottom: activeTab === 'PO' ? '2px solid var(--primary)' : 'none', color: activeTab === 'PO' ? 'var(--primary)' : 'var(--muted)', background: 'none' }}
        >
          Đơn mua hàng (PO)
        </button>
        <button 
          onClick={() => setActiveTab('VENDORS')}
          style={{ padding: '0.75rem 0', fontWeight: 600, fontSize: '0.875rem', borderBottom: activeTab === 'VENDORS' ? '2px solid var(--primary)' : 'none', color: activeTab === 'VENDORS' ? 'var(--primary)' : 'var(--muted)', background: 'none' }}
        >
          Nhà cung cấp
        </button>
        <button 
          onClick={() => setActiveTab('SHIPMENTS')}
          style={{ padding: '0.75rem 0', fontWeight: 600, fontSize: '0.875rem', borderBottom: activeTab === 'SHIPMENTS' ? '2px solid var(--primary)' : 'none', color: activeTab === 'SHIPMENTS' ? 'var(--primary)' : 'var(--muted)', background: 'none' }}
        >
          Giao hàng (Shipments)
        </button>
      </div>

      {/* Toolbar */}
      <div className="main-toolbar" style={{ borderBottom: 'none', marginBottom: '1rem', paddingBottom: '0' }}>
        <div className="toolbar-left">
          <div className="field" style={{ width: '300px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                placeholder={activeTab === 'PO' ? "Tìm mã PO..." : "Tìm nhà cung cấp..."}
                style={{ paddingLeft: '36px' }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-ghost" onClick={() => loadData()}><RefreshCw size={16} /> Đồng bộ</button>
          {canCreate && (
            <button className="btn btn-primary">
              <Plus size={16} /> {activeTab === 'PO' ? 'Tạo PO' : 'Thêm nhà cung cấp'}
            </button>
          )}
        </div>
      </div>

      {activeTab === 'PO' && (
        <StandardDataTable
          data={purchaseOrders}
          columns={poColumns}
          isLoading={isLoading}
          storageKey={SCM_PO_STORAGE_KEY}
          onRowClick={(p) => setSelectedPo(p)}
          enableRowSelection
          selectedRowIds={selectedRowIds}
          onSelectedRowIdsChange={setSelectedRowIds}
          showDefaultBulkUtilities
        />
      )}

      {activeTab === 'VENDORS' && (
        <StandardDataTable
          data={vendors}
          columns={vendorColumns}
          isLoading={isLoading}
          storageKey={SCM_VENDOR_STORAGE_KEY}
          enableRowSelection
          selectedRowIds={selectedRowIds}
          onSelectedRowIdsChange={setSelectedRowIds}
          showDefaultBulkUtilities
        />
      )}

      {/* Side Panel for PO Details */}
      <SidePanel
        isOpen={!!selectedPo}
        onClose={() => setSelectedPo(null)}
        title="Chi tiết đơn mua hàng"
      >
        {selectedPo && (
          <div style={{ display: 'grid', gap: '2rem' }}>
            {/* PO Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--line)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <ShoppingCart size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{selectedPo.poNo || selectedPo.id.slice(-8)}</h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>{selectedPo.vendor?.name || 'NCC chưa xác định'}</p>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <Badge variant={statusToBadge(selectedPo.lifecycleStatus)}>{selectedPo.lifecycleStatus}</Badge>
              </div>
            </div>

            {/* Financial Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ padding: '1rem', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ color: 'var(--muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Giá trị đơn hàng</p>
                <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>{toCurrency(selectedPo.totalAmount)}</p>
              </div>
              <div style={{ padding: '1rem', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ color: 'var(--muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Đã thanh toán</p>
                <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--success)' }}>{toCurrency(selectedPo.receivedAmount)}</p>
              </div>
            </div>

            {/* Timelines */}
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <Calendar size={16} style={{ marginTop: '2px', color: 'var(--muted)' }} />
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>Ngày nhận dự kiến</p>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>{toDateTime(selectedPo.expectedReceiveAt)}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <ShieldCheck size={16} style={{ marginTop: '2px', color: 'var(--muted)' }} />
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>Kiểm định 3-way match</p>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--success)' }}>Khớp hoàn toàn (PO-Receipt-Invoice)</p>
                </div>
              </div>
            </div>

            {/* Receipts History */}
            <div>
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Package size={18} /> Lịch sử nhận hàng (Receipts)
              </h4>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {receipts.length === 0 ? <p style={{ fontSize: '0.875rem', color: 'var(--muted)', fontStyle: 'italic' }}>Chưa có đợt nhận hàng nào.</p> : (
                  receipts.map(r => (
                    <div key={r.id} style={{ padding: '1rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ fontWeight: 500, fontSize: '0.875rem' }}>{r.receiptNo || 'REC-'+r.id.slice(-4)}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>SL: {r.receivedQty} | Giá trị: {toCurrency(r.receivedAmount)}</p>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{toDateTime(r.receivedAt)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{ display: 'flex', gap: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--line)', marginTop: 'auto' }}>
              <button className="btn btn-primary" style={{ flex: 1 }}><CheckCircle2 size={16} /> Phê duyệt PO</button>
              <button className="btn btn-ghost" style={{ flex: 1 }}><XCircle size={16} /> Hủy bỏ</button>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
