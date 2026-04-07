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
  Car,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload, normalizeObjectPayload } from '../lib/api-client';
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

type ContractProductType = 'TELECOM_PACKAGE' | 'AUTO_INSURANCE' | 'MOTO_INSURANCE' | 'DIGITAL_SERVICE';

type ContractSummary = {
  totalContracts?: number;
  activeContracts?: number;
  expiredContracts?: number;
  nextExpiringAt?: string | null;
  byProduct?: Partial<Record<ContractProductType, number>>;
};

type CrmCustomerVehicle = {
  id: string;
  plateNumber?: string | null;
  vehicleKind?: string | null;
  vehicleType?: string | null;
  ownerFullName?: string | null;
  status?: string | null;
  updatedAt?: string | null;
};

type CrmCustomerContract = {
  id: string;
  productType?: ContractProductType | string | null;
  status?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  sourceRef?: string | null;
  telecomLine?: {
    packageName?: string | null;
    servicePhone?: string | null;
    currentExpiryAt?: string | null;
  } | null;
  autoInsuranceDetail?: {
    soGCN?: string | null;
    vehicleId?: string | null;
  } | null;
  motoInsuranceDetail?: {
    soGCN?: string | null;
    vehicleId?: string | null;
  } | null;
  digitalServiceDetail?: {
    serviceName?: string | null;
    planName?: string | null;
    provider?: string | null;
    serviceAccountRef?: string | null;
  } | null;
};

type CustomerDetailPayload = {
  customer?: Customer;
  contractSummary?: ContractSummary | null;
  recentContracts?: CrmCustomerContract[];
  vehicles?: CrmCustomerVehicle[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatTaxonomyLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatContractProductLabel(productType: string | null | undefined) {
  const normalized = String(productType ?? '').trim().toUpperCase();
  switch (normalized) {
    case 'TELECOM_PACKAGE':
      return 'Gói cước viễn thông';
    case 'AUTO_INSURANCE':
      return 'Bảo hiểm ô tô';
    case 'MOTO_INSURANCE':
      return 'Bảo hiểm xe máy';
    case 'DIGITAL_SERVICE':
      return 'Dịch vụ số';
    default:
      return normalized || 'Khác';
  }
}

function formatContractReference(contract: CrmCustomerContract, vehicleMap: Map<string, CrmCustomerVehicle>) {
  const productType = String(contract.productType ?? '').toUpperCase();

  if (productType === 'TELECOM_PACKAGE') {
    const packageName = contract.telecomLine?.packageName || 'N/A';
    const servicePhone = contract.telecomLine?.servicePhone || 'N/A';
    return `${packageName} · SĐT dịch vụ: ${servicePhone}`;
  }

  if (productType === 'AUTO_INSURANCE') {
    const soGCN = contract.autoInsuranceDetail?.soGCN || 'N/A';
    const vehicle = vehicleMap.get(String(contract.autoInsuranceDetail?.vehicleId ?? ''));
    return `Số GCN: ${soGCN} · Biển số: ${vehicle?.plateNumber || 'N/A'}`;
  }

  if (productType === 'MOTO_INSURANCE') {
    const soGCN = contract.motoInsuranceDetail?.soGCN || 'N/A';
    const vehicle = vehicleMap.get(String(contract.motoInsuranceDetail?.vehicleId ?? ''));
    return `Số GCN: ${soGCN} · Biển số: ${vehicle?.plateNumber || 'N/A'}`;
  }

  if (productType === 'DIGITAL_SERVICE') {
    const serviceName = contract.digitalServiceDetail?.serviceName || 'N/A';
    const planName = contract.digitalServiceDetail?.planName || 'N/A';
    return `${serviceName} · Gói: ${planName}`;
  }

  return contract.sourceRef || 'N/A';
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
  const [customerDetail, setCustomerDetail] = useState<CustomerDetailPayload | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
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

  useEffect(() => {
    if (isDetailEditing) {
      return;
    }
    if (customerDetail?.customer) {
      setDetailForm(buildDetailForm(customerDetail.customer));
    }
  }, [customerDetail, isDetailEditing]);

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

  const loadCustomerDetail = async (customerId: string) => {
    const id = String(customerId || '').trim();
    if (!id) {
      setCustomerDetail(null);
      return;
    }

    setIsDetailLoading(true);
    try {
      const payload = await apiRequest<CustomerDetailPayload>(`/crm/customers/${id}`);
      const normalizedCustomer = normalizeObjectPayload(payload.customer);

      setCustomerDetail({
        customer: normalizedCustomer ? (normalizedCustomer as Customer) : undefined,
        contractSummary: isRecord(payload.contractSummary) ? (payload.contractSummary as ContractSummary) : null,
        recentContracts: Array.isArray(payload.recentContracts) ? (payload.recentContracts as CrmCustomerContract[]) : [],
        vehicles: Array.isArray(payload.vehicles) ? (payload.vehicles as CrmCustomerVehicle[]) : []
      });
      setErrorMessage(null);
    } catch (error) {
      setCustomerDetail(null);
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi tải chi tiết khách hàng');
    } finally {
      setIsDetailLoading(false);
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
      setSelectedCustomer((prev) => (
        prev
          ? {
              ...prev,
              fullName: detailForm.fullName || prev.fullName,
              phone: detailForm.phone || null,
              email: detailForm.email || null,
              customerStage: detailForm.customerStage || null,
              source: detailForm.source || null,
              segment: detailForm.segment || null,
              status: detailForm.status || null,
              tags: detailForm.tags
            }
          : prev
      ));
      await Promise.all([loadCustomers(), loadCustomerDetail(selectedCustomer.id)]);
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
      setCustomerDetail(null);
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

  useEffect(() => {
    if (!selectedCustomer?.id) {
      setCustomerDetail(null);
      setIsDetailLoading(false);
      return;
    }
    void loadCustomerDetail(selectedCustomer.id);
  }, [selectedCustomer?.id]);

  const customerStageColumnOptions = useMemo(
    () =>
      stageOptions.map((stage) => ({
        label: formatTaxonomyLabel(stage),
        value: stage
      })),
    [stageOptions]
  );

  const detailCustomer = customerDetail?.customer ?? selectedCustomer;
  const contractSummary = customerDetail?.contractSummary ?? null;
  const recentContracts = customerDetail?.recentContracts ?? [];
  const customerVehicles = customerDetail?.vehicles ?? [];
  const vehicleMap = useMemo(
    () => new Map(customerVehicles.map((item) => [item.id, item] as const)),
    [customerVehicles]
  );

  const customerTagSelectOptions = useMemo(() => {
    const selectedTags =
      detailCustomer?.tags?.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean) ?? [];
    return Array.from(new Set([...customerTagOptions, ...selectedTags]));
  }, [customerTagOptions, detailCustomer]);

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
    selectedRows: Customer[],
    execute: (customer: Customer) => Promise<void>
  ): Promise<BulkExecutionResult> => {
    if (selectedRows.length === 0) {
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

    const rowsById = new Map<string, Customer>();
    selectedRows.forEach((row) => rowsById.set(String(row.id), row));
    const selectedIds = selectedRows.map((row) => String(row.id));

    const result = await runBulkOperation({
      ids: selectedIds,
      continueOnError: true,
      chunkSize: 10,
      execute: async (customerId) => {
        const row = rowsById.get(String(customerId));
        if (!row) {
          throw new Error(`Không tìm thấy khách hàng ${customerId}.`);
        }
        await execute(row);
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
        execute: async (selectedRows) =>
          runCustomerBulkAction('Set trạng thái ACTIVE', selectedRows, async (customer) => {
            await apiRequest(`/crm/customers/${customer.id}`, {
              method: 'PATCH',
              body: { status: 'ACTIVE' }
            });
          })
      });
      actions.push({
        key: 'bulk-status-inactive',
        label: 'Set INACTIVE',
        tone: 'ghost',
        execute: async (selectedRows) =>
          runCustomerBulkAction('Set trạng thái INACTIVE', selectedRows, async (customer) => {
            await apiRequest(`/crm/customers/${customer.id}`, {
              method: 'PATCH',
              body: { status: 'INACTIVE' }
            });
          })
      });
      actions.push({
        key: 'bulk-status-draft',
        label: 'Set DRAFT',
        tone: 'ghost',
        execute: async (selectedRows) =>
          runCustomerBulkAction('Set trạng thái DRAFT', selectedRows, async (customer) => {
            await apiRequest(`/crm/customers/${customer.id}`, {
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
        execute: async (selectedRows) =>
          runCustomerBulkAction('Lưu trữ khách hàng', selectedRows, async (customer) => {
            await apiRequest(`/crm/customers/${customer.id}`, {
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
          setCustomerDetail(null);
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
                  {isDetailEditing ? (detailForm.fullName || '(Chưa nhập tên)') : detailCustomer?.fullName}
                </h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>{detailCustomer?.code || 'Mã: (Chưa có)'}</p>
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
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.email || '--'}</p>
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
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.phone || '--'}</p>
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
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.customerStage || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><CreditCard size={14} /> Tổng chi tiêu</label>
                <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--primary)' }}>{toCurrency(detailCustomer?.totalSpent)}</p>
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
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.source || '--'}</p>
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
                    <Badge variant={statusToBadge(detailCustomer?.status)}>{detailCustomer?.status || '--'}</Badge>
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
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.segment || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Calendar size={14} /> Cập nhật cuối</label>
                <p style={{ fontSize: '0.9375rem' }}>{toDateTime(detailCustomer?.updatedAt)}</p>
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
                  {detailCustomer?.tags?.length ? detailCustomer.tags.map((t) => (
                    <span key={t} className="finance-status-pill finance-status-pill-neutral">{t}</span>
                  )) : <span style={{ color: 'var(--muted)', fontSize: '0.875rem italic' }}>--</span>}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Gia hạn CRM & gói cước</h4>
              {isDetailLoading ? (
                <p style={{ margin: 0, color: 'var(--muted)' }}>Đang tải thông tin hợp đồng...</p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.6rem' }}>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Tổng hợp đồng</p>
                      <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{contractSummary?.totalContracts ?? 0}</p>
                    </div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Đang active</p>
                      <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{contractSummary?.activeContracts ?? 0}</p>
                    </div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Đã hết hạn</p>
                      <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{contractSummary?.expiredContracts ?? 0}</p>
                    </div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Hết hạn gần nhất</p>
                      <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: 600 }}>{toDateTime(contractSummary?.nextExpiringAt)}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {(['TELECOM_PACKAGE', 'AUTO_INSURANCE', 'MOTO_INSURANCE', 'DIGITAL_SERVICE'] as ContractProductType[]).map((productType) => (
                      <span key={`product-summary-${productType}`} className="finance-status-pill finance-status-pill-neutral">
                        {formatContractProductLabel(productType)}: {contractSummary?.byProduct?.[productType] ?? 0}
                      </span>
                    ))}
                  </div>

                  {recentContracts.length > 0 ? (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {recentContracts.slice(0, 5).map((contract) => (
                        <div key={contract.id} style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.65rem 0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                            <strong style={{ fontSize: '0.88rem' }}>{formatContractProductLabel(contract.productType)}</strong>
                            <Badge variant={statusToBadge(contract.status)}>{contract.status || '--'}</Badge>
                          </div>
                          <p style={{ margin: '0.35rem 0 0', fontSize: '0.84rem', color: 'var(--muted)' }}>
                            {formatContractReference(contract, vehicleMap)}
                          </p>
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                            Hiệu lực: {toDateTime(contract.startsAt)} → {toDateTime(contract.endsAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)' }}>Khách hàng chưa có hợp đồng CRM.</p>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'grid', gap: '0.65rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Car size={16} /> Thông tin xe
              </h4>
              {isDetailLoading ? (
                <p style={{ margin: 0, color: 'var(--muted)' }}>Đang tải danh sách xe...</p>
              ) : customerVehicles.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  {customerVehicles.slice(0, 8).map((vehicle) => (
                    <div key={vehicle.id} style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.9rem' }}>{vehicle.plateNumber || 'Biển số N/A'}</strong>
                        <Badge variant={statusToBadge(vehicle.status)}>{vehicle.status || '--'}</Badge>
                      </div>
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.83rem', color: 'var(--muted)' }}>
                        Loại xe: {vehicle.vehicleKind || '--'} · Dòng xe: {vehicle.vehicleType || '--'}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Chủ xe: {vehicle.ownerFullName || '--'} · Cập nhật: {toDateTime(vehicle.updatedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)' }}>Chưa có thông tin xe cho khách hàng này.</p>
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
                      setDetailForm(buildDetailForm(detailCustomer ?? selectedCustomer));
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
                        setDetailForm(buildDetailForm(detailCustomer ?? selectedCustomer));
                        setIsDetailEditing(true);
                      }}
                    >
                      Chỉnh sửa hồ sơ
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ flex: 1 }} disabled>
                    Gửi thông báo
                  </button>
                  {canDelete && String(detailCustomer?.status || '').toUpperCase() !== 'ARCHIVED' && (
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
