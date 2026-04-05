'use client';

import {
  Download,
  Plus,
  Upload,
  User,
  Mail,
  Phone,
  Tag,
  Calendar,
  CreditCard,
  Target,
  Globe,
  History,
  Trash2,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { formatRuntimeCurrency, formatRuntimeDateTime } from '../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../lib/bulk-actions';
import { useAccessPolicy } from './access-policy-context';
import { StandardDataTable, ColumnDefinition, type StandardTableBulkAction } from './ui/standard-data-table';
import { SidePanel } from './ui/side-panel';
import { Badge, statusToBadge } from './ui/badge';

type GenericStatus = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

type Customer = {
  id: string;
  code?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  customerStage?: string | null;
  segment?: string | null;
  source?: string | null;
  totalOrders?: number | null;
  totalSpent?: number | string | null;
  lastContactAt?: string | null;
  status?: string | null;
  updatedAt?: string | null;
};

type CustomerTaxonomyPayload = {
  customerTaxonomy?: {
    stages?: string[];
    sources?: string[];
  };
  tagRegistry?: {
    customerTags?: string[];
    interactionTags?: string[];
    interactionResultTags?: string[];
  };
};

type CreateCustomerFormState = {
  fullName: string;
  phone: string;
  email: string;
  customerStage: string;
  source: string;
  segment: string;
  tags: string[];
};

type DetailCustomerFormState = {
  fullName: string;
  phone: string;
  email: string;
  customerStage: string;
  source: string;
  segment: string;
  status: string;
  tags: string[];
};

const STATUS_OPTIONS: GenericStatus[] = ['ALL', 'ACTIVE', 'INACTIVE', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED'];
const CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY = 'erp-retail.crm.customer-table-settings.v4';
const FETCH_LIMIT = 200;
const DEFAULT_STAGE_OPTIONS = ['MOI', 'TIEP_CAN', 'DANG_CHAM_SOC', 'CHOT_DON'];
const DEFAULT_SOURCE_OPTIONS = ['ONLINE', 'OFFLINE', 'CTV', 'REFERRAL'];
const DEFAULT_CUSTOMER_TAG_OPTIONS = ['vip', 'khach_moi', 'da_mua'];

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function toCurrency(value: number | string | null | undefined) {
  return formatRuntimeCurrency(toNumber(value));
}

function toDateTime(value: string | null | undefined) {
  if (!value) return '--';
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? value : formatRuntimeDateTime(parsed.toISOString());
}


function formatTaxonomyLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildAuditObjectHref(entityType: string, entityId: string) {
  const params = new URLSearchParams({
    entityType,
    entityId
  });
  return `/modules/audit?${params.toString()}`;
}

function buildDetailForm(customer: Customer | null): DetailCustomerFormState {
  const tags = Array.isArray(customer?.tags)
    ? Array.from(new Set(customer!.tags!.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean)))
    : [];
  return {
    fullName: customer?.fullName ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    customerStage: customer?.customerStage ?? '',
    source: customer?.source ?? '',
    segment: customer?.segment ?? '',
    status: customer?.status ?? 'ACTIVE',
    tags
  };
}

function readSelectedTags(event: ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.target.selectedOptions)
    .map((option) => option.value.trim().toLowerCase())
    .filter(Boolean);
}

export function CrmCustomersBoard() {
  const { canModule, canAction } = useAccessPolicy();
  const canView = canModule('crm');
  const canCreate = canAction('crm', 'CREATE');
  const canUpdate = canAction('crm', 'UPDATE');
  const canDelete = canAction('crm', 'DELETE');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stageOptions, setStageOptions] = useState<string[]>(DEFAULT_STAGE_OPTIONS);
  const [sourceOptions, setSourceOptions] = useState<string[]>(DEFAULT_SOURCE_OPTIONS);
  const [customerTagOptions, setCustomerTagOptions] = useState<string[]>(DEFAULT_CUSTOMER_TAG_OPTIONS);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<GenericStatus>('ALL');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<BulkRowId[]>([]);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [isSavingDetail, setIsSavingDetail] = useState(false);
  const [isArchivingCustomer, setIsArchivingCustomer] = useState(false);
  const [detailForm, setDetailForm] = useState<DetailCustomerFormState>(buildDetailForm(null));
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateCustomerFormState>({
    fullName: '',
    phone: '',
    email: '',
    customerStage: DEFAULT_STAGE_OPTIONS[0],
    source: DEFAULT_SOURCE_OPTIONS[0],
    segment: '',
    tags: []
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSearch(new URLSearchParams(window.location.search).get('q') ?? '');
  }, []);

  useEffect(() => {
    loadTaxonomy();
  }, [canView]);

  useEffect(() => {
    setIsDetailEditing(false);
    setDetailForm(buildDetailForm(selectedCustomer));
  }, [selectedCustomer]);

  const loadCustomers = async () => {
    if (!canView) return;
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>('/crm/customers', {
        query: { q: search, status: status !== 'ALL' ? status : undefined, limit: FETCH_LIMIT }
      });
      setCustomers(normalizeListPayload(payload) as Customer[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTaxonomy = async () => {
    if (!canView) return;
    try {
      const payload = await apiRequest<CustomerTaxonomyPayload>('/crm/taxonomy');
      const stages = payload.customerTaxonomy?.stages?.filter(Boolean) ?? [];
      const sources = payload.customerTaxonomy?.sources?.filter(Boolean) ?? [];
      const customerTags = payload.tagRegistry?.customerTags?.filter(Boolean) ?? [];
      const nextStages = stages.length > 0 ? stages : DEFAULT_STAGE_OPTIONS;
      const nextSources = sources.length > 0 ? sources : DEFAULT_SOURCE_OPTIONS;
      const nextCustomerTags = customerTags.length > 0 ? customerTags : DEFAULT_CUSTOMER_TAG_OPTIONS;
      setStageOptions(nextStages);
      setSourceOptions(nextSources);
      setCustomerTagOptions(nextCustomerTags);
      setCreateForm((prev) => ({
        ...prev,
        customerStage: nextStages.includes(prev.customerStage) ? prev.customerStage : (nextStages[0] || ''),
        source: nextSources.includes(prev.source) ? prev.source : (nextSources[0] || ''),
        tags: prev.tags.filter((tag) => nextCustomerTags.includes(tag))
      }));
      setDetailForm((prev) => ({
        ...prev,
        tags: prev.tags.filter((tag) => nextCustomerTags.includes(tag))
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi tải taxonomy CRM');
      setCustomerTagOptions(DEFAULT_CUSTOMER_TAG_OPTIONS);
    }
  };

  const resetCreateForm = () => {
    setCreateForm({
      fullName: '',
      phone: '',
      email: '',
      customerStage: stageOptions[0] ?? DEFAULT_STAGE_OPTIONS[0] ?? '',
      source: sourceOptions[0] ?? DEFAULT_SOURCE_OPTIONS[0] ?? '',
      segment: '',
      tags: []
    });
  };

  const handleCreateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate) return;
    setIsCreating(true);
    try {
      await apiRequest('/crm/customers', {
        method: 'POST',
        body: {
          fullName: createForm.fullName,
          phone: createForm.phone || undefined,
          email: createForm.email || undefined,
          customerStage: createForm.customerStage || undefined,
          source: createForm.source || undefined,
          segment: createForm.segment || undefined,
          tags: createForm.tags
        }
      });
      setResultMessage('Đã tạo khách hàng thành công.');
      setErrorMessage(null);
      setIsCreatePanelOpen(false);
      resetCreateForm();
      await loadCustomers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi tạo khách hàng');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveCustomer = async (id: string | number, values: Partial<Customer>) => {
    if (!canUpdate) return;
    try {
      await apiRequest(`/crm/customers/${id}`, {
        method: 'PATCH',
        body: values
      });
      setResultMessage(`Cập nhật khách hàng #${id} thành công.`);
      loadCustomers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi lưu dữ liệu');
      throw error;
    }
  };

  const handleSaveDetailProfile = async () => {
    if (!selectedCustomer || !canUpdate) return;
    setIsSavingDetail(true);
    try {
      await apiRequest(`/crm/customers/${selectedCustomer.id}`, {
        method: 'PATCH',
        body: {
          fullName: detailForm.fullName || undefined,
          phone: detailForm.phone || undefined,
          email: detailForm.email || undefined,
          customerStage: detailForm.customerStage || undefined,
          source: detailForm.source || undefined,
          segment: detailForm.segment || undefined,
          status: detailForm.status || undefined,
          tags: detailForm.tags
        }
      });
      setResultMessage(`Cập nhật hồ sơ ${detailForm.fullName || selectedCustomer.id} thành công.`);
      setErrorMessage(null);
      setIsDetailEditing(false);
      await loadCustomers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi cập nhật hồ sơ khách hàng');
    } finally {
      setIsSavingDetail(false);
    }
  };

  const handleArchiveCustomer = async () => {
    if (!selectedCustomer || !canDelete || isArchivingCustomer) return;
    if (!window.confirm(`Lưu trữ khách hàng ${selectedCustomer.fullName || selectedCustomer.id}?`)) {
      return;
    }

    setIsArchivingCustomer(true);
    try {
      await apiRequest(`/crm/customers/${selectedCustomer.id}`, {
        method: 'DELETE'
      });
      setResultMessage(`Đã lưu trữ khách hàng ${selectedCustomer.fullName || selectedCustomer.id}.`);
      setErrorMessage(null);
      setSelectedCustomer(null);
      setIsDetailEditing(false);
      setDetailForm(buildDetailForm(null));
      await loadCustomers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi lưu trữ khách hàng');
    } finally {
      setIsArchivingCustomer(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadCustomers, 300);
    return () => clearTimeout(timer);
  }, [search, status]);

  const customerStageColumnOptions = useMemo(
    () =>
      stageOptions.map((stage) => ({
        label: formatTaxonomyLabel(stage),
        value: stage
      })),
    [stageOptions]
  );
  const customerTagSelectOptions = useMemo(() => {
    const selectedTags = selectedCustomer?.tags?.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean) ?? [];
    return Array.from(new Set([...customerTagOptions, ...selectedTags]));
  }, [customerTagOptions, selectedCustomer]);

  const columns: ColumnDefinition<Customer>[] = [
    { key: 'code', label: 'Mã KH' },
    { 
      key: 'fullName', 
      label: 'Khách hàng', 
      isLink: true,
      type: 'text'
    },
    { key: 'phone', label: 'Điện thoại', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { 
      key: 'customerStage', 
      label: 'Giai đoạn',
      type: 'select',
      options: customerStageColumnOptions
    },
    { 
      key: 'totalSpent', 
      label: 'Chi tiêu',
      render: (c) => toCurrency(c.totalSpent)
    },
    { 
      key: 'status', 
      label: 'Trạng thái',
      type: 'select',
      options: [
        { label: 'Đang hoạt động', value: 'ACTIVE' },
        { label: 'Ngừng hoạt động', value: 'INACTIVE' },
        { label: 'Nháp', value: 'DRAFT' }
      ],
      render: (c) => <Badge variant={statusToBadge(c.status)}>{c.status || 'N/A'}</Badge>
    },
    { 
      key: 'updatedAt', 
      label: 'Cập nhật',
      render: (c) => toDateTime(c.updatedAt)
    }
  ];

  const runCustomerBulkAction = async (
    actionLabel: string,
    execute: (customerId: string) => Promise<void>
  ): Promise<BulkExecutionResult> => {
    const selectedIds = selectedRowIds.map((id) => String(id)).filter(Boolean);
    if (selectedIds.length === 0) {
      return {
        total: 0,
        successCount: 0,
        failedCount: 0,
        failedIds: [],
        failures: [],
        actionLabel,
        message: `${actionLabel}: không có bản ghi được chọn.`
      };
    }

    const result = await runBulkOperation({
      ids: selectedIds,
      continueOnError: true,
      chunkSize: 10,
      execute: async (customerId) => {
        await execute(String(customerId));
      }
    });

    const normalized: BulkExecutionResult = {
      ...result,
      actionLabel,
      message: formatBulkSummary(
        {
          ...result,
          actionLabel
        },
        actionLabel
      )
    };

    if (normalized.successCount > 0) {
      await loadCustomers();
    }
    setResultMessage(normalized.message ?? null);
    if (normalized.failedCount > 0) {
      setErrorMessage(`Một số khách hàng lỗi khi chạy "${actionLabel}".`);
    } else {
      setErrorMessage(null);
    }
    return normalized;
  };

  const bulkActions = useMemo<StandardTableBulkAction<Customer>[]>(() => {
    const actions: StandardTableBulkAction<Customer>[] = [];

    if (canUpdate) {
      actions.push({
        key: 'bulk-status-active',
        label: 'Set ACTIVE',
        tone: 'primary',
        execute: async () =>
          runCustomerBulkAction('Set trạng thái ACTIVE', async (customerId) => {
            await apiRequest(`/crm/customers/${customerId}`, {
              method: 'PATCH',
              body: { status: 'ACTIVE' }
            });
          })
      });
      actions.push({
        key: 'bulk-status-inactive',
        label: 'Set INACTIVE',
        tone: 'ghost',
        execute: async () =>
          runCustomerBulkAction('Set trạng thái INACTIVE', async (customerId) => {
            await apiRequest(`/crm/customers/${customerId}`, {
              method: 'PATCH',
              body: { status: 'INACTIVE' }
            });
          })
      });
      actions.push({
        key: 'bulk-status-draft',
        label: 'Set DRAFT',
        tone: 'ghost',
        execute: async () =>
          runCustomerBulkAction('Set trạng thái DRAFT', async (customerId) => {
            await apiRequest(`/crm/customers/${customerId}`, {
              method: 'PATCH',
              body: { status: 'DRAFT' }
            });
          })
      });
    }

    if (canDelete) {
      actions.push({
        key: 'bulk-archive-customers',
        label: 'Archive',
        tone: 'danger',
        confirmMessage: (rows) => `Lưu trữ ${rows.length} khách hàng đã chọn?`,
        execute: async () =>
          runCustomerBulkAction('Lưu trữ khách hàng', async (customerId) => {
            await apiRequest(`/crm/customers/${customerId}`, {
              method: 'DELETE'
            });
          })
      });
    }

    return actions;
  }, [canUpdate, canDelete]);

  if (!canView) {
    return null;
  }

  return (
    <div className="crm-board">
      {/* Messages */}
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

      {/* Header Actions */}
      <div className="main-toolbar" style={{ borderBottom: 'none', marginBottom: '1rem', paddingBottom: '0' }}>
        <div className="toolbar-left">
          <div className="field" style={{ width: '160px' }}>
            <select 
              value={status}
              onChange={(e) => setStatus(e.target.value as GenericStatus)}
            >
              {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt === 'ALL' ? 'Tất cả trạng thái' : opt}</option>)}
            </select>
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-ghost">
            <Download size={16} /> Export
          </button>
          <button className="btn btn-ghost">
            <Upload size={16} /> Import
          </button>
          {canCreate && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setIsCreatePanelOpen(true);
              }}
            >
              <Plus size={16} /> Khách hàng
            </button>
          )}
        </div>
      </div>

      {/* Table Data */}
      <StandardDataTable
        data={customers}
        columns={columns}
        storageKey={CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY}
        isLoading={isLoading}
        onRowClick={(c) => setSelectedCustomer(c)}
        editableKeys={canUpdate ? ['fullName', 'phone', 'email', 'customerStage', 'status'] : []}
        onSaveRow={handleSaveCustomer}
        enableRowSelection
        selectedRowIds={selectedRowIds}
        onSelectedRowIdsChange={setSelectedRowIds}
        bulkActions={bulkActions}
        showDefaultBulkUtilities
      />

      {/* Detail Side Panel */}
      <SidePanel
        isOpen={!!selectedCustomer}
        onClose={() => {
          setSelectedCustomer(null);
          setIsDetailEditing(false);
          setDetailForm(buildDetailForm(null));
        }}
        title="Chi tiết khách hàng"
      >
        {selectedCustomer && (
          <div style={{ display: 'grid', gap: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--line)' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '12px', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <User size={32} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                  {isDetailEditing ? (detailForm.fullName || '(Chưa nhập tên)') : selectedCustomer.fullName}
                </h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>{selectedCustomer.code || 'Mã: (Chưa có)'}</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Mail size={14} /> Email</label>
                {isDetailEditing ? (
                  <input
                    value={detailForm.email}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="customer@example.com"
                  />
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{selectedCustomer.email || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Phone size={14} /> Điện thoại</label>
                {isDetailEditing ? (
                  <input
                    value={detailForm.phone}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="09xxxxxxxx"
                  />
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{selectedCustomer.phone || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Target size={14} /> Giai đoạn</label>
                {isDetailEditing ? (
                  <select
                    value={detailForm.customerStage}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, customerStage: event.target.value }))}
                  >
                    {stageOptions.map((stage) => (
                      <option key={stage} value={stage}>
                        {formatTaxonomyLabel(stage)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{selectedCustomer.customerStage || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><CreditCard size={14} /> Tổng chi tiêu</label>
                <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--primary)' }}>{toCurrency(selectedCustomer.totalSpent)}</p>
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Globe size={14} /> Nguồn</label>
                {isDetailEditing ? (
                  <select
                    value={detailForm.source}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, source: event.target.value }))}
                  >
                    {sourceOptions.map((source) => (
                      <option key={source} value={source}>
                        {formatTaxonomyLabel(source)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{selectedCustomer.source || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ marginBottom: '4px' }}>Trạng thái</label>
                {isDetailEditing ? (
                  <select
                    value={detailForm.status}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, status: event.target.value }))}
                  >
                    <option value="ACTIVE">Đang hoạt động</option>
                    <option value="INACTIVE">Ngừng hoạt động</option>
                    <option value="DRAFT">Nháp</option>
                  </select>
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>
                    <Badge variant={statusToBadge(selectedCustomer.status)}>{selectedCustomer.status || '--'}</Badge>
                  </p>
                )}
              </div>
              <div className="field">
                <label>Phân khúc</label>
                {isDetailEditing ? (
                  <input
                    value={detailForm.segment}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, segment: event.target.value }))}
                    placeholder="VIP / Retail / B2B..."
                  />
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{selectedCustomer.segment || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Calendar size={14} /> Cập nhật cuối</label>
                <p style={{ fontSize: '0.9375rem' }}>{toDateTime(selectedCustomer.updatedAt)}</p>
              </div>
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}><Tag size={14} /> Thẻ (Tags)</label>
              {isDetailEditing ? (
                <select
                  multiple
                  value={detailForm.tags}
                  onChange={(event) => setDetailForm((prev) => ({ ...prev, tags: readSelectedTags(event) }))}
                  size={Math.min(Math.max(customerTagSelectOptions.length, 3), 8)}
                >
                  {customerTagSelectOptions.map((tag) => (
                    <option key={`detail-tag-${tag}`} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {selectedCustomer.tags?.length ? selectedCustomer.tags.map((t) => (
                    <span key={t} className="finance-status-pill finance-status-pill-neutral">{t}</span>
                  )) : <span style={{ color: 'var(--muted)', fontSize: '0.875rem italic' }}>--</span>}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--line)' }}>
              {isDetailEditing ? (
                <>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={handleSaveDetailProfile}
                    disabled={isSavingDetail}
                  >
                    {isSavingDetail ? 'Đang lưu...' : 'Lưu hồ sơ'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setIsDetailEditing(false);
                      setDetailForm(buildDetailForm(selectedCustomer));
                    }}
                    disabled={isSavingDetail}
                  >
                    Hủy chỉnh sửa
                  </button>
                </>
              ) : (
                <>
                  {canUpdate && (
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setDetailForm(buildDetailForm(selectedCustomer));
                        setIsDetailEditing(true);
                      }}
                    >
                      Chỉnh sửa hồ sơ
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ flex: 1 }} disabled>
                    Gửi thông báo
                  </button>
                  {canDelete && String(selectedCustomer.status || '').toUpperCase() !== 'ARCHIVED' && (
                    <button
                      className="btn btn-danger"
                      style={{ flex: 1 }}
                      onClick={handleArchiveCustomer}
                      disabled={isArchivingCustomer}
                    >
                      <Trash2 size={16} /> {isArchivingCustomer ? 'Đang lưu trữ...' : 'Lưu trữ'}
                    </button>
                  )}
                </>
              )}
              <a
                className="btn btn-ghost"
                style={{ flex: 1, justifyContent: 'center' }}
                href={buildAuditObjectHref('Customer', selectedCustomer.id)}
              >
                <History size={16} /> Lịch sử audit
              </a>
            </div>
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isCreatePanelOpen}
        onClose={() => {
          setIsCreatePanelOpen(false);
          if (!isCreating) {
            resetCreateForm();
          }
        }}
        title="Tạo khách hàng mới"
      >
        <form onSubmit={handleCreateCustomer} style={{ display: 'grid', gap: '1rem' }}>
          <div className="field">
            <label>Họ tên khách hàng *</label>
            <input
              required
              value={createForm.fullName}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, fullName: event.target.value }))}
              placeholder="Nguyễn Văn A"
            />
          </div>
          <div className="field">
            <label>Số điện thoại</label>
            <input
              value={createForm.phone}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="09xxxxxxxx"
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={createForm.email}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="customer@example.com"
            />
          </div>
          <div className="field">
            <label>Giai đoạn</label>
            <select
              value={createForm.customerStage}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, customerStage: event.target.value }))}
            >
              {stageOptions.map((stage) => (
                <option key={stage} value={stage}>
                  {formatTaxonomyLabel(stage)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Nguồn</label>
            <select
              value={createForm.source}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, source: event.target.value }))}
            >
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {formatTaxonomyLabel(source)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Phân khúc</label>
            <input
              value={createForm.segment}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, segment: event.target.value }))}
              placeholder="VIP / Retail / B2B..."
            />
          </div>
          <div className="field">
            <label>Tags</label>
            <select
              multiple
              value={createForm.tags}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, tags: readSelectedTags(event) }))}
              size={Math.min(Math.max(customerTagSelectOptions.length, 3), 8)}
            >
              {customerTagSelectOptions.map((tag) => (
                <option key={`create-tag-${tag}`} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={isCreating} style={{ flex: 1 }}>
              {isCreating ? 'Đang tạo...' : 'Tạo khách hàng'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => {
                if (isCreating) return;
                setIsCreatePanelOpen(false);
                resetCreateForm();
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
