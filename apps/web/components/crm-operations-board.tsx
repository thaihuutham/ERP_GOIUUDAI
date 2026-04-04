'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { canAccessModule } from '../lib/rbac';
import { formatRuntimeDateTime, formatRuntimeNumber } from '../lib/runtime-format';
import { useUserRole } from './user-role-context';
import { Badge, statusToBadge } from './ui';

type GenericStatus = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

type Customer = {
  id: string;
  code?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  customerStage?: string | null;
  ownerStaffId?: string | null;
  consentStatus?: string | null;
  segment?: string | null;
  source?: string | null;
  totalOrders?: number | null;
  totalSpent?: number | string | null;
  lastOrderAt?: string | null;
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

type Interaction = {
  id: string;
  customerId?: string | null;
  interactionType?: string | null;
  channel?: string | null;
  content?: string | null;
  resultTag?: string | null;
  staffName?: string | null;
  staffCode?: string | null;
  interactionAt?: string | null;
  nextActionAt?: string | null;
  customer?: {
    id?: string;
    fullName?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
};

type PaymentRequest = {
  id: string;
  customerId?: string | null;
  invoiceId?: string | null;
  invoiceNo?: string | null;
  orderNo?: string | null;
  channel?: string | null;
  recipient?: string | null;
  qrCodeUrl?: string | null;
  amount?: number | string | null;
  status?: string | null;
  sentAt?: string | null;
  paidAt?: string | null;
  note?: string | null;
  customer?: {
    id?: string;
    fullName?: string | null;
    phone?: string | null;
  } | null;
};

type DedupCandidate = {
  dedupKey?: string;
  rule?: string;
  customers?: Customer[];
};

type CreateCustomerForm = {
  code: string;
  fullName: string;
  phone: string;
  email: string;
  customerStage: string;
  ownerStaffId: string;
  consentStatus: string;
  segment: string;
  source: string;
  status: Exclude<GenericStatus, 'ALL'>;
  tags: string[];
};

type UpdateCustomerForm = {
  fullName: string;
  phone: string;
  email: string;
  customerStage: string;
  ownerStaffId: string;
  consentStatus: string;
  segment: string;
  source: string;
  status: Exclude<GenericStatus, 'ALL'>;
  tags: string[];
  totalOrders: string;
  totalSpent: string;
};

type CreateInteractionForm = {
  customerId: string;
  customerPhone: string;
  customerEmail: string;
  interactionType: string;
  channel: string;
  content: string;
  resultTag: string;
  tags: string[];
  staffName: string;
  staffCode: string;
  interactionAt: string;
  nextActionAt: string;
  customerStage: string;
};

type CreatePaymentRequestForm = {
  customerId: string;
  customerPhone: string;
  customerEmail: string;
  invoiceNo: string;
  orderNo: string;
  channel: string;
  recipient: string;
  qrCodeUrl: string;
  amount: string;
  status: string;
  sentAt: string;
  note: string;
};

type MergeCustomersForm = {
  primaryCustomerId: string;
  mergedCustomerId: string;
  mergedBy: string;
  note: string;
};

type CustomerColumnKey =
  | 'code'
  | 'fullName'
  | 'phone'
  | 'email'
  | 'customerStage'
  | 'segment'
  | 'source'
  | 'totalOrders'
  | 'totalSpent'
  | 'status'
  | 'lastContactAt'
  | 'updatedAt'
  | 'tags';

type CustomerColumnDefinition = {
  key: CustomerColumnKey;
  label: string;
};

const STATUS_OPTIONS: GenericStatus[] = ['ALL', 'ACTIVE', 'INACTIVE', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED'];
const PAYMENT_STATUS_OPTIONS = ['ALL', 'DA_GUI', 'DA_THANH_TOAN', 'HUY'] as const;
const CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY = 'erp-retail.crm.customer-column-settings.v1';
const CUSTOMER_IMPORT_MAX_ROWS = 400;
const DEFAULT_STAGE_OPTIONS = ['MOI', 'TIEP_CAN', 'DANG_CHAM_SOC', 'CHOT_DON'];
const DEFAULT_SOURCE_OPTIONS = ['ONLINE', 'OFFLINE', 'CTV', 'REFERRAL'];
const DEFAULT_CUSTOMER_TAG_OPTIONS = ['vip', 'khach_moi', 'da_mua'];
const DEFAULT_INTERACTION_TAG_OPTIONS = ['quan_tam', 'can_cham_soc', 'da_dat_lich'];
const DEFAULT_INTERACTION_RESULT_TAG_OPTIONS = ['quan_tam', 'da_mua', 'khong_phan_hoi'];

const CUSTOMER_COLUMN_DEFINITIONS: CustomerColumnDefinition[] = [
  { key: 'code', label: 'Mã KH' },
  { key: 'fullName', label: 'Khách hàng' },
  { key: 'phone', label: 'Điện thoại' },
  { key: 'email', label: 'Email' },
  { key: 'customerStage', label: 'Giai đoạn' },
  { key: 'segment', label: 'Nhóm' },
  { key: 'source', label: 'Nguồn' },
  { key: 'totalOrders', label: 'Đơn hàng' },
  { key: 'totalSpent', label: 'Chi tiêu' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'lastContactAt', label: 'Liên hệ gần nhất' },
  { key: 'updatedAt', label: 'Cập nhật lúc' },
  { key: 'tags', label: 'Tags' }
];

const DEFAULT_CUSTOMER_COLUMN_ORDER: CustomerColumnKey[] = CUSTOMER_COLUMN_DEFINITIONS.map((item) => item.key);
const DEFAULT_HIDDEN_CUSTOMER_COLUMNS: CustomerColumnKey[] = ['code', 'segment', 'source', 'totalOrders', 'lastContactAt', 'tags'];
const CUSTOMER_COLUMN_MAP = new Map(CUSTOMER_COLUMN_DEFINITIONS.map((item) => [item.key, item]));

function normalizeStatus(status: string | null | undefined) {
  return (status || '').toUpperCase();
}

function normalizeHeaderName(input: string) {
  return input
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseCsvRows(raw: string, delimiter: ',' | ';') {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (char === '"') {
      if (inQuotes && raw[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(value.trim());
      value = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && raw[index + 1] === '\n') {
        index += 1;
      }
      row.push(value.trim());
      value = '';
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function detectCsvRows(raw: string) {
  const commaRows = parseCsvRows(raw, ',');
  if (commaRows.length === 0) {
    return [] as string[][];
  }
  if (commaRows[0].length > 1) {
    return commaRows;
  }
  const semicolonRows = parseCsvRows(raw, ';');
  return semicolonRows.length > 0 ? semicolonRows : commaRows;
}

function csvEscape(value: string) {
  if (/["\n,;]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function triggerCsvDownload(filename: string, headers: string[], rows: string[][]) {
  const csvContent = [headers, ...rows]
    .map((line) => line.map((cell) => csvEscape(cell)).join(','))
    .join('\n');

  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isUpdatedToday(value: string | null | undefined) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function renderCustomerCell(customer: Customer, key: CustomerColumnKey) {
  switch (key) {
    case 'code':
      return customer.code || customer.id.slice(0, 8);
    case 'fullName':
      return customer.fullName || '--';
    case 'phone':
      return customer.phone || '--';
    case 'email':
      return customer.email || '--';
    case 'customerStage':
      return customer.customerStage || '--';
    case 'segment':
      return customer.segment || '--';
    case 'source':
      return customer.source || '--';
    case 'totalOrders':
      return formatRuntimeNumber(toNumber(customer.totalOrders));
    case 'totalSpent':
      return toCurrency(customer.totalSpent);
    case 'status':
      return <Badge variant={statusToBadge(customer.status)}>{customer.status || '--'}</Badge>;
    case 'lastContactAt':
      return toDateTime(customer.lastContactAt);
    case 'updatedAt':
      return toDateTime(customer.updatedAt);
    case 'tags':
      return customer.tags?.join(', ') || '--';
    default:
      return '--';
  }
}

function customerCellToCsv(customer: Customer, key: CustomerColumnKey) {
  switch (key) {
    case 'code':
      return customer.code || customer.id;
    case 'fullName':
      return customer.fullName || '';
    case 'phone':
      return customer.phone || '';
    case 'email':
      return customer.email || '';
    case 'customerStage':
      return customer.customerStage || '';
    case 'segment':
      return customer.segment || '';
    case 'source':
      return customer.source || '';
    case 'totalOrders':
      return String(toNumber(customer.totalOrders));
    case 'totalSpent':
      return String(toNumber(customer.totalSpent));
    case 'status':
      return customer.status || '';
    case 'lastContactAt':
      return customer.lastContactAt || '';
    case 'updatedAt':
      return customer.updatedAt || '';
    case 'tags':
      return customer.tags?.join('; ') || '';
    default:
      return '';
  }
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function toCurrency(value: number | string | null | undefined) {
  return formatRuntimeNumber(toNumber(value));
}

function toDateTime(value: string | null | undefined) {
  if (!value) {
    return '--';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return formatRuntimeDateTime(parsed.toISOString());
}

function formatTaxonomyLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function parseTagsInput(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[;,]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function normalizeTagArray(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((item) => String(item ?? '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function readSelectedOptions(event: ChangeEvent<HTMLSelectElement>) {
  return normalizeTagArray(Array.from(event.target.selectedOptions).map((option) => option.value));
}


export function CrmOperationsBoard() {
  const { role } = useUserRole();
  const canView = canAccessModule(role, 'crm');
  const canMutate = role === 'MANAGER' || role === 'ADMIN';

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatus, setCustomerStatus] = useState<GenericStatus>('ALL');
  const [customerStageFilter, setCustomerStageFilter] = useState('');
  const [customerTagFilter, setCustomerTagFilter] = useState('');
  const [customerSegmentFilter, setCustomerSegmentFilter] = useState('');
  const [customerSourceFilter, setCustomerSourceFilter] = useState('');
  const [showCustomerFilters, setShowCustomerFilters] = useState(true);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentCustomerPage, setCurrentCustomerPage] = useState(1);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [customerBulkAction, setCustomerBulkAction] = useState<'NONE' | 'ACTIVE' | 'INACTIVE'>('NONE');
  const [isApplyingBulkAction, setIsApplyingBulkAction] = useState(false);
  const [isImportingCustomers, setIsImportingCustomers] = useState(false);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [customerColumnOrder, setCustomerColumnOrder] = useState<CustomerColumnKey[]>(DEFAULT_CUSTOMER_COLUMN_ORDER);
  const [hiddenCustomerColumns, setHiddenCustomerColumns] = useState<CustomerColumnKey[]>(DEFAULT_HIDDEN_CUSTOMER_COLUMNS);
  const [interactionSearch, setInteractionSearch] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<(typeof PAYMENT_STATUS_OPTIONS)[number]>('ALL');
  const customerFetchLimit = 200;

  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [dedupCandidates, setDedupCandidates] = useState<DedupCandidate[]>([]);
  const [stageOptions, setStageOptions] = useState<string[]>(DEFAULT_STAGE_OPTIONS);
  const [sourceOptions, setSourceOptions] = useState<string[]>(DEFAULT_SOURCE_OPTIONS);
  const [customerTagOptions, setCustomerTagOptions] = useState<string[]>(DEFAULT_CUSTOMER_TAG_OPTIONS);
  const [interactionTagOptions, setInteractionTagOptions] = useState<string[]>(DEFAULT_INTERACTION_TAG_OPTIONS);
  const [interactionResultTagOptions, setInteractionResultTagOptions] = useState<string[]>(DEFAULT_INTERACTION_RESULT_TAG_OPTIONS);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedPaymentRequestId, setSelectedPaymentRequestId] = useState('');

  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isLoadingInteractions, setIsLoadingInteractions] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [isLoadingDedup, setIsLoadingDedup] = useState(false);

  const [createCustomerForm, setCreateCustomerForm] = useState<CreateCustomerForm>({
    code: '',
    fullName: '',
    phone: '',
    email: '',
    customerStage: DEFAULT_STAGE_OPTIONS[0] ?? 'MOI',
    ownerStaffId: '',
    consentStatus: '',
    segment: '',
    source: DEFAULT_SOURCE_OPTIONS[0] ?? '',
    status: 'ACTIVE',
    tags: []
  });

  const [updateCustomerForm, setUpdateCustomerForm] = useState<UpdateCustomerForm>({
    fullName: '',
    phone: '',
    email: '',
    customerStage: '',
    ownerStaffId: '',
    consentStatus: '',
    segment: '',
    source: '',
    status: 'ACTIVE',
    tags: [],
    totalOrders: '',
    totalSpent: ''
  });

  const [createInteractionForm, setCreateInteractionForm] = useState<CreateInteractionForm>({
    customerId: '',
    customerPhone: '',
    customerEmail: '',
    interactionType: 'TU_VAN',
    channel: 'ZALO',
    content: '',
    resultTag: '',
    tags: [],
    staffName: '',
    staffCode: '',
    interactionAt: '',
    nextActionAt: '',
    customerStage: ''
  });

  const [createPaymentRequestForm, setCreatePaymentRequestForm] = useState<CreatePaymentRequestForm>({
    customerId: '',
    customerPhone: '',
    customerEmail: '',
    invoiceNo: '',
    orderNo: '',
    channel: 'ZALO',
    recipient: '',
    qrCodeUrl: '',
    amount: '',
    status: 'DA_GUI',
    sentAt: '',
    note: ''
  });

  const [mergeForm, setMergeForm] = useState<MergeCustomersForm>({
    primaryCustomerId: '',
    mergedCustomerId: '',
    mergedBy: '',
    note: ''
  });

  const selectedCustomer = useMemo(() => customers.find((row) => row.id === selectedCustomerId) ?? null, [customers, selectedCustomerId]);
  const selectedPaymentRequest = useMemo(
    () => paymentRequests.find((row) => row.id === selectedPaymentRequestId) ?? null,
    [paymentRequests, selectedPaymentRequestId]
  );

  const orderedCustomerColumns = useMemo(
    () => customerColumnOrder.map((key) => CUSTOMER_COLUMN_MAP.get(key)).filter(Boolean) as CustomerColumnDefinition[],
    [customerColumnOrder]
  );
  const visibleCustomerColumns = useMemo(
    () => orderedCustomerColumns.filter((column) => !hiddenCustomerColumns.includes(column.key)),
    [hiddenCustomerColumns, orderedCustomerColumns]
  );

  const filteredCustomers = useMemo(() => {
    const segmentKeyword = customerSegmentFilter.trim().toLowerCase();
    const sourceKeyword = customerSourceFilter.trim().toLowerCase();

    return customers.filter((customer) => {
      if (segmentKeyword && !(customer.segment || '').toLowerCase().includes(segmentKeyword)) {
        return false;
      }
      if (sourceKeyword && !(customer.source || '').toLowerCase().includes(sourceKeyword)) {
        return false;
      }
      return true;
    });
  }, [customerSegmentFilter, customerSourceFilter, customers]);

  const customerStats = useMemo(() => {
    const activeCount = filteredCustomers.filter((item) => {
      const normalized = normalizeStatus(item.status);
      return normalized === 'ACTIVE' || normalized === 'APPROVED';
    }).length;
    const inactiveCount = filteredCustomers.filter((item) => {
      const normalized = normalizeStatus(item.status);
      return normalized === 'INACTIVE' || normalized === 'ARCHIVED' || normalized === 'REJECTED';
    }).length;
    const hasContactCount = filteredCustomers.filter((item) => Boolean(item.phone || item.email)).length;
    const highValueCount = filteredCustomers.filter((item) => toNumber(item.totalSpent) >= 10_000_000).length;
    const updatedTodayCount = filteredCustomers.filter((item) => isUpdatedToday(item.updatedAt)).length;

    return [
      { label: 'Tổng khách hàng', value: filteredCustomers.length, tone: 'neutral' },
      { label: 'Khách hàng đang hoạt động', value: activeCount, tone: 'success' },
      { label: 'Khách hàng không hoạt động', value: inactiveCount, tone: 'danger' },
      { label: 'Có thông tin liên hệ', value: hasContactCount, tone: 'success' },
      { label: 'Khách hàng giá trị cao', value: highValueCount, tone: 'warning' },
      { label: 'Cập nhật hôm nay', value: updatedTodayCount, tone: 'neutral' }
    ] as const;
  }, [filteredCustomers]);

  const totalCustomerPages = useMemo(
    () => Math.max(1, Math.ceil(filteredCustomers.length / Math.max(rowsPerPage, 1))),
    [filteredCustomers.length, rowsPerPage]
  );
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentCustomerPage - 1) * rowsPerPage;
    return filteredCustomers.slice(startIndex, startIndex + rowsPerPage);
  }, [currentCustomerPage, filteredCustomers, rowsPerPage]);
  const customerRange = useMemo(() => {
    if (filteredCustomers.length === 0) {
      return { from: 0, to: 0 };
    }
    const from = (currentCustomerPage - 1) * rowsPerPage + 1;
    const to = Math.min(currentCustomerPage * rowsPerPage, filteredCustomers.length);
    return { from, to };
  }, [currentCustomerPage, filteredCustomers.length, rowsPerPage]);
  const allRowsOnPageSelected = paginatedCustomers.length > 0
    && paginatedCustomers.every((item) => selectedCustomerIds.includes(item.id));

  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
      return;
    }
    if (selectedCustomerId && customers.length > 0 && !customers.some((row) => row.id === selectedCustomerId)) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    if (!selectedPaymentRequestId && paymentRequests.length > 0) {
      setSelectedPaymentRequestId(paymentRequests[0].id);
      return;
    }
    if (selectedPaymentRequestId && paymentRequests.length > 0 && !paymentRequests.some((row) => row.id === selectedPaymentRequestId)) {
      setSelectedPaymentRequestId(paymentRequests[0].id);
    }
  }, [paymentRequests, selectedPaymentRequestId]);

  useEffect(() => {
    if (!selectedCustomerId) {
      return;
    }
    setMergeForm((prev) => (prev.primaryCustomerId ? prev : { ...prev, primaryCustomerId: selectedCustomerId }));
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomer) {
      setUpdateCustomerForm({
        fullName: '',
        phone: '',
        email: '',
        customerStage: '',
        ownerStaffId: '',
        consentStatus: '',
        segment: '',
        source: '',
        status: 'ACTIVE',
        tags: [],
        totalOrders: '',
        totalSpent: ''
      });
      return;
    }

    setUpdateCustomerForm({
      fullName: selectedCustomer.fullName || '',
      phone: selectedCustomer.phone || '',
      email: selectedCustomer.email || '',
      customerStage: selectedCustomer.customerStage || '',
      ownerStaffId: selectedCustomer.ownerStaffId || '',
      consentStatus: selectedCustomer.consentStatus || '',
      segment: selectedCustomer.segment || '',
      source: selectedCustomer.source || '',
      status: (selectedCustomer.status as Exclude<GenericStatus, 'ALL'> | undefined) || 'ACTIVE',
      tags: normalizeTagArray((selectedCustomer.tags ?? []).map((item) => String(item ?? ''))),
      totalOrders: selectedCustomer.totalOrders !== null && selectedCustomer.totalOrders !== undefined ? String(selectedCustomer.totalOrders) : '',
      totalSpent: selectedCustomer.totalSpent !== null && selectedCustomer.totalSpent !== undefined ? String(selectedCustomer.totalSpent) : ''
    });
  }, [selectedCustomer]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        order?: string[];
        hidden?: string[];
      };

      const validOrder = (parsed.order || [])
        .map((item) => String(item))
        .filter((item): item is CustomerColumnKey => CUSTOMER_COLUMN_MAP.has(item as CustomerColumnKey));
      const validHidden = (parsed.hidden || [])
        .map((item) => String(item))
        .filter((item): item is CustomerColumnKey => CUSTOMER_COLUMN_MAP.has(item as CustomerColumnKey));
      const uniqueHidden = Array.from(new Set(validHidden));

      if (validOrder.length > 0) {
        const mergedOrder = [
          ...validOrder,
          ...DEFAULT_CUSTOMER_COLUMN_ORDER.filter((item) => !validOrder.includes(item))
        ];
        setCustomerColumnOrder(mergedOrder);
      }
      if (uniqueHidden.length < DEFAULT_CUSTOMER_COLUMN_ORDER.length) {
        setHiddenCustomerColumns(uniqueHidden);
      }
    } catch {
      // Ignore invalid local storage state.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        order: customerColumnOrder,
        hidden: hiddenCustomerColumns
      })
    );
  }, [customerColumnOrder, hiddenCustomerColumns]);

  useEffect(() => {
    setCurrentCustomerPage(1);
  }, [rowsPerPage, customerSearch, customerStatus, customerStageFilter, customerTagFilter, customerSegmentFilter, customerSourceFilter]);

  useEffect(() => {
    if (currentCustomerPage > totalCustomerPages) {
      setCurrentCustomerPage(totalCustomerPages);
    }
  }, [currentCustomerPage, totalCustomerPages]);

  useEffect(() => {
    setSelectedCustomerIds((previous) => previous.filter((id) => customers.some((item) => item.id === id)));
  }, [customers]);

  const loadCustomers = async () => {
    if (!canView) return;

    setIsLoadingCustomers(true);
    try {
      const payload = await apiRequest<unknown>('/crm/customers', {
        query: {
          q: customerSearch,
          status: customerStatus,
          stage: customerStageFilter || undefined,
          tag: customerTagFilter || undefined,
          limit: customerFetchLimit
        }
      });
      setCustomers(normalizeArray<Customer>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách khách hàng.');
      setCustomers([]);
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  const loadTaxonomy = async () => {
    if (!canView) return;

    try {
      const payload = await apiRequest<CustomerTaxonomyPayload>('/crm/taxonomy');
      const stages = payload.customerTaxonomy?.stages?.filter(Boolean) ?? [];
      const sources = payload.customerTaxonomy?.sources?.filter(Boolean) ?? [];
      const customerTags = payload.tagRegistry?.customerTags?.filter(Boolean) ?? [];
      const interactionTags = payload.tagRegistry?.interactionTags?.filter(Boolean) ?? [];
      const interactionResultTags = payload.tagRegistry?.interactionResultTags?.filter(Boolean) ?? [];
      const nextStages = stages.length > 0 ? stages : DEFAULT_STAGE_OPTIONS;
      const nextSources = sources.length > 0 ? sources : DEFAULT_SOURCE_OPTIONS;
      const nextCustomerTags = customerTags.length > 0 ? customerTags : DEFAULT_CUSTOMER_TAG_OPTIONS;
      const nextInteractionTags = interactionTags.length > 0 ? interactionTags : DEFAULT_INTERACTION_TAG_OPTIONS;
      const nextInteractionResultTags = interactionResultTags.length > 0
        ? interactionResultTags
        : DEFAULT_INTERACTION_RESULT_TAG_OPTIONS;

      setStageOptions(nextStages);
      setSourceOptions(nextSources);
      setCustomerTagOptions(nextCustomerTags);
      setInteractionTagOptions(nextInteractionTags);
      setInteractionResultTagOptions(nextInteractionResultTags);

      setCreateCustomerForm((prev) => ({
        ...prev,
        tags: prev.tags.filter((tag) => nextCustomerTags.includes(tag))
      }));
      setUpdateCustomerForm((prev) => ({
        ...prev,
        tags: prev.tags.filter((tag) => nextCustomerTags.includes(tag))
      }));
      setCreateInteractionForm((prev) => ({
        ...prev,
        tags: prev.tags.filter((tag) => nextInteractionTags.includes(tag)),
        resultTag: prev.resultTag && !nextInteractionResultTags.includes(prev.resultTag)
          ? ''
          : prev.resultTag
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được taxonomy CRM.');
      setStageOptions(DEFAULT_STAGE_OPTIONS);
      setSourceOptions(DEFAULT_SOURCE_OPTIONS);
      setCustomerTagOptions(DEFAULT_CUSTOMER_TAG_OPTIONS);
      setInteractionTagOptions(DEFAULT_INTERACTION_TAG_OPTIONS);
      setInteractionResultTagOptions(DEFAULT_INTERACTION_RESULT_TAG_OPTIONS);
    }
  };

  const loadInteractions = async () => {
    if (!canView) return;

    setIsLoadingInteractions(true);
    try {
      const payload = await apiRequest<unknown>('/crm/interactions', {
        query: {
          q: interactionSearch,
          customerId: selectedCustomerId || undefined,
          limit: 50
        }
      });
      setInteractions(normalizeArray<Interaction>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được lịch sử tương tác.');
      setInteractions([]);
    } finally {
      setIsLoadingInteractions(false);
    }
  };

  const loadPaymentRequests = async () => {
    if (!canView) return;

    setIsLoadingPayments(true);
    try {
      const payload = await apiRequest<unknown>('/crm/payment-requests', {
        query: {
          q: paymentSearch,
          status: paymentStatus,
          limit: 50
        }
      });
      setPaymentRequests(normalizeArray<PaymentRequest>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được payment requests.');
      setPaymentRequests([]);
    } finally {
      setIsLoadingPayments(false);
    }
  };

  const loadDedupCandidates = async () => {
    if (!canView) return;

    setIsLoadingDedup(true);
    try {
      const payload = await apiRequest<unknown>('/crm/dedup-candidates');
      setDedupCandidates(normalizeArray<DedupCandidate>(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được dedup candidates.');
      setDedupCandidates([]);
    } finally {
      setIsLoadingDedup(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, customerSearch, customerStatus, customerStageFilter, customerTagFilter]);

  useEffect(() => {
    void loadInteractions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, selectedCustomerId, interactionSearch]);

  useEffect(() => {
    void loadPaymentRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, paymentSearch, paymentStatus]);

  useEffect(() => {
    void loadDedupCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  useEffect(() => {
    void loadTaxonomy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  useEffect(() => {
    setCreateCustomerForm((prev) => ({
      ...prev,
      customerStage: stageOptions.includes(prev.customerStage) ? prev.customerStage : (stageOptions[0] ?? ''),
      source: sourceOptions.includes(prev.source) ? prev.source : (sourceOptions[0] ?? ''),
      tags: prev.tags.filter((tag) => customerTagOptions.includes(tag))
    }));
    setUpdateCustomerForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => customerTagOptions.includes(tag))
    }));
    setCreateInteractionForm((prev) => ({
      ...prev,
      customerStage: prev.customerStage && !stageOptions.includes(prev.customerStage) ? '' : prev.customerStage,
      tags: prev.tags.filter((tag) => interactionTagOptions.includes(tag)),
      resultTag: prev.resultTag && !interactionResultTagOptions.includes(prev.resultTag)
        ? ''
        : prev.resultTag
    }));
    setCustomerStageFilter((prev) => (prev && !stageOptions.includes(prev) ? '' : prev));
    setCustomerSourceFilter((prev) => (prev && !sourceOptions.includes(prev) ? '' : prev));
    setCustomerTagFilter((prev) => (prev && !customerTagOptions.includes(prev) ? '' : prev));
  }, [customerTagOptions, interactionResultTagOptions, interactionTagOptions, sourceOptions, stageOptions]);

  const refreshAll = async () => {
    await Promise.all([loadCustomers(), loadInteractions(), loadPaymentRequests(), loadDedupCandidates(), loadTaxonomy()]);
  };

  const onCreateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      if (!createCustomerForm.fullName.trim()) {
        throw new Error('Họ tên khách hàng là bắt buộc.');
      }

      await apiRequest('/crm/customers', {
        method: 'POST',
        body: {
          code: createCustomerForm.code || undefined,
          fullName: createCustomerForm.fullName,
          phone: createCustomerForm.phone || undefined,
          email: createCustomerForm.email || undefined,
          customerStage: createCustomerForm.customerStage || undefined,
          ownerStaffId: createCustomerForm.ownerStaffId || undefined,
          consentStatus: createCustomerForm.consentStatus || undefined,
          segment: createCustomerForm.segment || undefined,
          source: createCustomerForm.source || undefined,
          status: createCustomerForm.status,
          tags: createCustomerForm.tags
        }
      });

      setResultMessage('Đã tạo/gộp hồ sơ khách hàng thành công.');
      setCreateCustomerForm((prev) => ({
        ...prev,
        code: '',
        fullName: '',
        phone: '',
        email: '',
        customerStage: stageOptions[0] ?? '',
        ownerStaffId: '',
        consentStatus: '',
        segment: '',
        source: sourceOptions[0] ?? '',
        tags: []
      }));
      await Promise.all([loadCustomers(), loadDedupCandidates()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo khách hàng.');
    }
  };

  const onUpdateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate || !selectedCustomer) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      await apiRequest(`/crm/customers/${selectedCustomer.id}`, {
        method: 'PATCH',
        body: {
          fullName: updateCustomerForm.fullName || undefined,
          phone: updateCustomerForm.phone || undefined,
          email: updateCustomerForm.email || undefined,
          customerStage: updateCustomerForm.customerStage || undefined,
          ownerStaffId: updateCustomerForm.ownerStaffId || undefined,
          consentStatus: updateCustomerForm.consentStatus || undefined,
          segment: updateCustomerForm.segment || undefined,
          source: updateCustomerForm.source || undefined,
          status: updateCustomerForm.status || undefined,
          tags: updateCustomerForm.tags,
          totalOrders: updateCustomerForm.totalOrders !== '' ? Number(updateCustomerForm.totalOrders) : undefined,
          totalSpent: updateCustomerForm.totalSpent !== '' ? Number(updateCustomerForm.totalSpent) : undefined
        }
      });

      setResultMessage('Đã cập nhật hồ sơ khách hàng.');
      await Promise.all([loadCustomers(), loadDedupCandidates()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật khách hàng.');
    }
  };

  const onCreateInteraction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      const resolvedCustomerId = createInteractionForm.customerId || selectedCustomerId || undefined;
      if (!createInteractionForm.content.trim()) {
        throw new Error('Nội dung tương tác là bắt buộc.');
      }
      if (!resolvedCustomerId && !createInteractionForm.customerPhone.trim() && !createInteractionForm.customerEmail.trim()) {
        throw new Error('Cần cung cấp customerId hoặc số điện thoại/email khách hàng để định danh tương tác.');
      }

      await apiRequest('/crm/interactions', {
        method: 'POST',
        body: {
          customerId: resolvedCustomerId,
          customerPhone: createInteractionForm.customerPhone || undefined,
          customerEmail: createInteractionForm.customerEmail || undefined,
          interactionType: createInteractionForm.interactionType || undefined,
          channel: createInteractionForm.channel || undefined,
          content: createInteractionForm.content,
          resultTag: createInteractionForm.resultTag || undefined,
          tags: createInteractionForm.tags,
          staffName: createInteractionForm.staffName || undefined,
          staffCode: createInteractionForm.staffCode || undefined,
          interactionAt: createInteractionForm.interactionAt || undefined,
          nextActionAt: createInteractionForm.nextActionAt || undefined,
          customerStage: createInteractionForm.customerStage || undefined
        }
      });

      setResultMessage('Đã ghi nhận tương tác khách hàng.');
      setCreateInteractionForm((prev) => ({
        ...prev,
        content: '',
        resultTag: '',
        tags: [],
        interactionAt: '',
        nextActionAt: ''
      }));
      await Promise.all([loadInteractions(), loadCustomers()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo interaction.');
    }
  };

  const onCreatePaymentRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      const resolvedCustomerId = createPaymentRequestForm.customerId || selectedCustomerId || undefined;
      if (
        !resolvedCustomerId
        && !createPaymentRequestForm.customerPhone.trim()
        && !createPaymentRequestForm.customerEmail.trim()
        && !createPaymentRequestForm.invoiceNo.trim()
        && !createPaymentRequestForm.orderNo.trim()
      ) {
        throw new Error('Cần tối thiểu một định danh: customerId, phone, email, invoiceNo hoặc orderNo.');
      }
      if (createPaymentRequestForm.amount !== '' && toNumber(createPaymentRequestForm.amount) <= 0) {
        throw new Error('Amount phải lớn hơn 0.');
      }

      await apiRequest('/crm/payment-requests', {
        method: 'POST',
        body: {
          customerId: resolvedCustomerId,
          customerPhone: createPaymentRequestForm.customerPhone || undefined,
          customerEmail: createPaymentRequestForm.customerEmail || undefined,
          invoiceNo: createPaymentRequestForm.invoiceNo || undefined,
          orderNo: createPaymentRequestForm.orderNo || undefined,
          channel: createPaymentRequestForm.channel || undefined,
          recipient: createPaymentRequestForm.recipient || undefined,
          qrCodeUrl: createPaymentRequestForm.qrCodeUrl || undefined,
          amount: createPaymentRequestForm.amount !== '' ? Number(createPaymentRequestForm.amount) : undefined,
          status: createPaymentRequestForm.status || undefined,
          sentAt: createPaymentRequestForm.sentAt || undefined,
          note: createPaymentRequestForm.note || undefined
        }
      });

      setResultMessage('Đã tạo payment request.');
      setCreatePaymentRequestForm((prev) => ({
        ...prev,
        invoiceNo: '',
        orderNo: '',
        recipient: '',
        qrCodeUrl: '',
        amount: '',
        sentAt: '',
        note: ''
      }));
      await loadPaymentRequests();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo payment request.');
    }
  };

  const onMarkPaid = async (paymentRequestId: string) => {
    if (!canMutate) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      await apiRequest(`/crm/payment-requests/${paymentRequestId}/mark-paid`, {
        method: 'POST'
      });
      setResultMessage('Đã ghi nhận thanh toán thành công.');
      await Promise.all([loadPaymentRequests(), loadCustomers()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể mark paid cho payment request.');
    }
  };

  const onMergeCustomers = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate) return;

    setErrorMessage(null);
    setResultMessage(null);
    try {
      if (!mergeForm.primaryCustomerId || !mergeForm.mergedCustomerId) {
        throw new Error('Cần nhập đủ primaryCustomerId và mergedCustomerId.');
      }
      if (mergeForm.primaryCustomerId === mergeForm.mergedCustomerId) {
        throw new Error('Primary và merged customer không được trùng nhau.');
      }

      await apiRequest('/crm/merge-customers', {
        method: 'POST',
        body: {
          primaryCustomerId: mergeForm.primaryCustomerId,
          mergedCustomerId: mergeForm.mergedCustomerId,
          mergedBy: mergeForm.mergedBy || undefined,
          note: mergeForm.note || undefined
        }
      });

      setResultMessage('Đã gộp khách hàng thành công.');
      setMergeForm((prev) => ({ ...prev, mergedCustomerId: '', note: '' }));
      await Promise.all([loadCustomers(), loadDedupCandidates(), loadInteractions(), loadPaymentRequests()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể gộp khách hàng.');
    }
  };

  const onMoveColumn = (key: CustomerColumnKey, direction: 'UP' | 'DOWN') => {
    setCustomerColumnOrder((previous) => {
      const currentIndex = previous.indexOf(key);
      if (currentIndex < 0) {
        return previous;
      }
      const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= previous.length) {
        return previous;
      }
      const next = [...previous];
      const [item] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const onToggleColumnVisibility = (key: CustomerColumnKey) => {
    setHiddenCustomerColumns((previous) => {
      if (previous.includes(key)) {
        return previous.filter((item) => item !== key);
      }
      const visibleCount = customerColumnOrder.length - previous.length;
      if (visibleCount <= 1) {
        return previous;
      }
      return [...previous, key];
    });
  };

  const onSelectCustomer = (customerId: string, checked: boolean) => {
    setSelectedCustomerIds((previous) => {
      if (checked) {
        if (previous.includes(customerId)) {
          return previous;
        }
        return [...previous, customerId];
      }
      return previous.filter((item) => item !== customerId);
    });
  };

  const onSelectAllCustomersOnPage = (checked: boolean) => {
    const pageIds = paginatedCustomers.map((item) => item.id);
    setSelectedCustomerIds((previous) => {
      if (checked) {
        return Array.from(new Set([...previous, ...pageIds]));
      }
      return previous.filter((item) => !pageIds.includes(item));
    });
  };

  const onApplyCustomerBulkAction = async () => {
    if (!canMutate || customerBulkAction === 'NONE' || selectedCustomerIds.length === 0) {
      return;
    }

    setErrorMessage(null);
    setResultMessage(null);
    setIsApplyingBulkAction(true);
    try {
      await Promise.all(
        selectedCustomerIds.map((customerId) => apiRequest(`/crm/customers/${customerId}`, {
          method: 'PATCH',
          body: {
            status: customerBulkAction
          }
        }))
      );

      setResultMessage(`Đã cập nhật ${selectedCustomerIds.length} khách hàng sang trạng thái ${customerBulkAction}.`);
      setSelectedCustomerIds([]);
      setCustomerBulkAction('NONE');
      await Promise.all([loadCustomers(), loadDedupCandidates()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể chạy bulk action.');
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  const onExportCustomers = () => {
    if (filteredCustomers.length === 0) {
      setErrorMessage('Không có dữ liệu khách hàng để xuất.');
      return;
    }
    if (visibleCustomerColumns.length === 0) {
      setErrorMessage('Cần bật ít nhất một cột trước khi xuất dữ liệu.');
      return;
    }

    const headers = visibleCustomerColumns.map((item) => item.label);
    const rows = filteredCustomers.map((customer) => visibleCustomerColumns.map((column) => customerCellToCsv(customer, column.key)));
    const stamp = new Date().toISOString().slice(0, 10);
    triggerCsvDownload(`khach-hang-${stamp}.csv`, headers, rows);
    setResultMessage(`Đã xuất ${filteredCustomers.length} khách hàng ra file CSV (mở được bằng Excel).`);
  };

  const onImportCustomers = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setErrorMessage('Hiện tại chỉ hỗ trợ import CSV. Bạn có thể xuất Excel dạng CSV rồi nhập lại.');
      return;
    }

    setErrorMessage(null);
    setResultMessage(null);
    setIsImportingCustomers(true);
    try {
      const content = await file.text();
      const rows = detectCsvRows(content);
      if (rows.length <= 1) {
        throw new Error('File CSV không có dữ liệu hợp lệ.');
      }

      const [headerRow, ...dataRows] = rows;
      const normalizedHeaders = headerRow.map((item) => normalizeHeaderName(item));
      const resolveIndex = (...aliases: string[]) => normalizedHeaders.findIndex((item) => aliases.includes(item));

      const fullNameIndex = resolveIndex('fullname', 'hoten', 'tenkhachhang', 'customername', 'name');
      const phoneIndex = resolveIndex('phone', 'phonenumber', 'sdt', 'dienthoai', 'sodienthoai');
      const emailIndex = resolveIndex('email', 'mail');
      const stageIndex = resolveIndex('stage', 'customerstage', 'giaidoan');
      const statusIndex = resolveIndex('status', 'trangthai');
      const tagsIndex = resolveIndex('tags', 'tag');
      const segmentIndex = resolveIndex('segment', 'nhom');
      const sourceIndex = resolveIndex('source', 'nguon');
      const codeIndex = resolveIndex('code', 'makhachhang', 'ma');

      if (fullNameIndex < 0) {
        throw new Error('Thiếu cột tên khách hàng (ví dụ: fullName hoặc customerName).');
      }

      const importRows = dataRows.slice(0, CUSTOMER_IMPORT_MAX_ROWS);
      let importedCount = 0;
      const failedRows: number[] = [];

      for (let index = 0; index < importRows.length; index += 1) {
        const row = importRows[index];
        const fullName = row[fullNameIndex]?.trim() || '';
        if (!fullName) {
          failedRows.push(index + 2);
          continue;
        }

        try {
          await apiRequest('/crm/customers', {
            method: 'POST',
            body: {
              code: codeIndex >= 0 ? row[codeIndex]?.trim() || undefined : undefined,
              fullName,
              phone: phoneIndex >= 0 ? row[phoneIndex]?.trim() || undefined : undefined,
              email: emailIndex >= 0 ? row[emailIndex]?.trim() || undefined : undefined,
              customerStage: stageIndex >= 0 ? row[stageIndex]?.trim() || undefined : undefined,
              status: statusIndex >= 0 ? row[statusIndex]?.trim().toUpperCase() || undefined : undefined,
              tags: tagsIndex >= 0
                ? parseTagsInput(row[tagsIndex] || '')
                : undefined,
              segment: segmentIndex >= 0 ? row[segmentIndex]?.trim() || undefined : undefined,
              source: sourceIndex >= 0 ? row[sourceIndex]?.trim() || undefined : undefined
            }
          });
          importedCount += 1;
        } catch {
          failedRows.push(index + 2);
        }
      }

      await Promise.all([loadCustomers(), loadDedupCandidates()]);

      if (failedRows.length === 0) {
        setResultMessage(`Import thành công ${importedCount} khách hàng từ file CSV.`);
      } else {
        setResultMessage(
          `Đã import ${importedCount} dòng. Bỏ qua ${failedRows.length} dòng lỗi: ${failedRows.slice(0, 8).join(', ')}${failedRows.length > 8 ? '...' : ''}.`
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể import dữ liệu khách hàng.');
    } finally {
      setIsImportingCustomers(false);
    }
  };

  if (!canView) {
    return (
      <article className="module-workbench">
        <header className="module-header">
          <div>
            <h1>CRM Operations Board</h1>
            <p>Bạn không có quyền truy cập phân hệ CRM với vai trò hiện tại.</p>
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
          <h1>CRM Operations Board</h1>
          <p>Luồng CRM thực chiến: customer 360, lịch sử tương tác, yêu cầu thanh toán và dedup hồ sơ khách hàng.</p>
          <div className="action-buttons" style={{ marginTop: '0.6rem' }}>
            <Link className="btn btn-ghost" href="/modules/crm/conversations">
              Mở CRM Conversations Inbox
            </Link>
          </div>
        </div>
        <ul>
          <li>Customer master + segment/stage/tag</li>
          <li>Interaction timeline theo khách hàng đang chọn</li>
          <li>Payment request flow và xử lý dedup/merge</li>
        </ul>
      </header>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}
      {!canMutate ? <p className="banner banner-warning">Vai trò `{role}` chỉ có quyền xem trong module này.</p> : null}

      <section className="crm-grid">
        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Khách hàng</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
              Tải lại
            </button>
          </div>

          <div className="crm-customer-toolbar">
            <div className="action-buttons">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canMutate}
                onClick={() => {
                  const target = document.getElementById('crm-create-name');
                  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  target?.focus();
                }}
              >
                + Khách hàng mới
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!canMutate || isImportingCustomers}
                onClick={() => importFileInputRef.current?.click()}
              >
                {isImportingCustomers ? 'Đang nhập...' : 'Nhập khách hàng'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowCustomerFilters((previous) => !previous)}
              >
                {showCustomerFilters ? 'Ẩn Filters' : 'Filters'}
              </button>
            </div>

            <div className="crm-customer-toolbar-right">
              <input
                id="crm-customer-search"
                className="crm-customer-search-input"
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Tên, SĐT, email"
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsColumnSettingsOpen((previous) => !previous)}
              >
                Column settings
              </button>
            </div>
          </div>

          <input
            ref={importFileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={onImportCustomers}
          />

          <div className="crm-customer-stats-grid">
            {customerStats.map((item) => (
              <article key={item.label} className={`crm-customer-stat-card crm-customer-stat-${item.tone}`}>
                <p>{item.label}</p>
                <strong>{formatRuntimeNumber(item.value)}</strong>
              </article>
            ))}
          </div>

          {showCustomerFilters ? (
            <div className="filter-grid crm-customer-filter-grid">
              <div className="field">
                <label htmlFor="crm-customer-status">Trạng thái</label>
                <select id="crm-customer-status" value={customerStatus} onChange={(event) => setCustomerStatus(event.target.value as GenericStatus)}>
                  {STATUS_OPTIONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="crm-customer-stage">Giai đoạn</label>
                <select id="crm-customer-stage" value={customerStageFilter} onChange={(event) => setCustomerStageFilter(event.target.value)}>
                  <option value="">Tất cả giai đoạn</option>
                  {stageOptions.map((stage) => (
                    <option key={`customer-filter-stage-${stage}`} value={stage}>
                      {formatTaxonomyLabel(stage)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="crm-customer-tag">Tag</label>
                <select id="crm-customer-tag" value={customerTagFilter} onChange={(event) => setCustomerTagFilter(event.target.value)}>
                  <option value="">Tất cả tag</option>
                  {customerTagOptions.map((tag) => (
                    <option key={`customer-filter-tag-${tag}`} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="crm-customer-segment">Nhóm khách</label>
                <input id="crm-customer-segment" value={customerSegmentFilter} onChange={(event) => setCustomerSegmentFilter(event.target.value)} placeholder="VIP / B2B / Retail..." />
              </div>
              <div className="field">
                <label htmlFor="crm-customer-source">Nguồn</label>
                <select id="crm-customer-source" value={customerSourceFilter} onChange={(event) => setCustomerSourceFilter(event.target.value)}>
                  <option value="">Tất cả nguồn</option>
                  {sourceOptions.map((source) => (
                    <option key={`customer-filter-source-${source}`} value={source}>
                      {formatTaxonomyLabel(source)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          <div className="crm-customer-bulk-row">
            <div className="action-buttons">
              <select value={String(rowsPerPage)} onChange={(event) => setRowsPerPage(Number(event.target.value))}>
                <option value="10">10 / trang</option>
                <option value="20">20 / trang</option>
                <option value="50">50 / trang</option>
                <option value="100">100 / trang</option>
              </select>
              <select value={customerBulkAction} onChange={(event) => setCustomerBulkAction(event.target.value as 'NONE' | 'ACTIVE' | 'INACTIVE')}>
                <option value="NONE">Bulk Actions</option>
                <option value="ACTIVE">Đặt ACTIVE</option>
                <option value="INACTIVE">Đặt INACTIVE</option>
              </select>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!canMutate || customerBulkAction === 'NONE' || selectedCustomerIds.length === 0 || isApplyingBulkAction}
                onClick={() => void onApplyCustomerBulkAction()}
              >
                {isApplyingBulkAction ? 'Đang xử lý...' : 'Áp dụng'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onExportCustomers}>
                Xuất Excel
              </button>
            </div>
            <p className="muted">Đã chọn: {selectedCustomerIds.length} khách hàng</p>
          </div>

          {isColumnSettingsOpen ? (
            <section className="crm-column-settings-panel">
              <h3>Column settings</h3>
              <p className="muted">Ẩn/hiện cột và đổi vị trí hiển thị trong bảng khách hàng.</p>
              <div className="crm-column-settings-list">
                {orderedCustomerColumns.map((column, index) => {
                  const isHidden = hiddenCustomerColumns.includes(column.key);
                  return (
                    <div key={column.key} className="crm-column-setting-item">
                      <label className="checkbox-wrap">
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={() => onToggleColumnVisibility(column.key)}
                        />
                        <span>{column.label}</span>
                      </label>
                      <div className="action-buttons">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={index === 0}
                          onClick={() => onMoveColumn(column.key, 'UP')}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={index === orderedCustomerColumns.length - 1}
                          onClick={() => onMoveColumn(column.key, 'DOWN')}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {isLoadingCustomers ? <p className="muted">Đang tải danh sách khách hàng...</p> : null}
          {!isLoadingCustomers && filteredCustomers.length === 0 ? <p className="muted">Không có khách hàng phù hợp với bộ lọc hiện tại.</p> : null}

          {filteredCustomers.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allRowsOnPageSelected}
                        onChange={(event) => onSelectAllCustomersOnPage(event.target.checked)}
                        aria-label="Chọn tất cả khách hàng trên trang hiện tại"
                      />
                    </th>
                    <th>#</th>
                    {visibleCustomerColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedCustomers.map((customer, index) => (
                    <tr key={customer.id} className={selectedCustomerId === customer.id ? 'table-row-selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedCustomerIds.includes(customer.id)}
                          onChange={(event) => onSelectCustomer(customer.id, event.target.checked)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Chọn khách hàng ${customer.fullName || customer.id}`}
                        />
                      </td>
                      <td>{(currentCustomerPage - 1) * rowsPerPage + index + 1}</td>
                      {visibleCustomerColumns.map((column) => {
                        const value = renderCustomerCell(customer, column.key);
                        if (column.key === 'fullName') {
                          return (
                            <td key={`${customer.id}-${column.key}`}>
                              <button
                                type="button"
                                className="record-link row-select-trigger"
                                onClick={() => setSelectedCustomerId(customer.id)}
                              >
                                {value}
                                <span>Xem</span>
                              </button>
                            </td>
                          );
                        }

                        return <td key={`${customer.id}-${column.key}`}>{value}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="pagination-row">
            <div className="pagination-left">
              <span>
                Hiển thị {customerRange.from}-{customerRange.to} / {filteredCustomers.length} khách hàng
              </span>
            </div>
            <div className="pagination-right">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={currentCustomerPage <= 1}
                onClick={() => setCurrentCustomerPage((previous) => Math.max(1, previous - 1))}
              >
                Trang trước
              </button>
              <span>Trang {currentCustomerPage}/{totalCustomerPages}</span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={currentCustomerPage >= totalCustomerPages}
                onClick={() => setCurrentCustomerPage((previous) => Math.min(totalCustomerPages, previous + 1))}
              >
                Trang sau
              </button>
            </div>
          </div>

          <form className="form-grid" onSubmit={onCreateCustomer}>
            <h3>Tạo khách hàng</h3>
            <div className="field">
              <label htmlFor="crm-create-code">Code</label>
              <input id="crm-create-code" value={createCustomerForm.code} onChange={(event) => setCreateCustomerForm((prev) => ({ ...prev, code: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-create-name">Họ tên</label>
              <input id="crm-create-name" required value={createCustomerForm.fullName} onChange={(event) => setCreateCustomerForm((prev) => ({ ...prev, fullName: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-create-phone">SĐT</label>
              <input id="crm-create-phone" value={createCustomerForm.phone} onChange={(event) => setCreateCustomerForm((prev) => ({ ...prev, phone: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-create-email">Email</label>
              <input id="crm-create-email" value={createCustomerForm.email} onChange={(event) => setCreateCustomerForm((prev) => ({ ...prev, email: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-create-stage">Stage</label>
              <select id="crm-create-stage" value={createCustomerForm.customerStage} onChange={(event) => setCreateCustomerForm((prev) => ({ ...prev, customerStage: event.target.value }))}>
                {stageOptions.map((stage) => (
                  <option key={`create-stage-${stage}`} value={stage}>
                    {formatTaxonomyLabel(stage)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="crm-create-status">Status</label>
              <select id="crm-create-status" value={createCustomerForm.status} onChange={(event) => setCreateCustomerForm((prev) => ({ ...prev, status: event.target.value as Exclude<GenericStatus, 'ALL'> }))}>
                {STATUS_OPTIONS.filter((item) => item !== 'ALL').map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="crm-create-segment">Segment</label>
              <input id="crm-create-segment" value={createCustomerForm.segment} onChange={(event) => setCreateCustomerForm((prev) => ({ ...prev, segment: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-create-source">Source</label>
              <select id="crm-create-source" value={createCustomerForm.source} onChange={(event) => setCreateCustomerForm((prev) => ({ ...prev, source: event.target.value }))}>
                {sourceOptions.map((source) => (
                  <option key={`create-source-${source}`} value={source}>
                    {formatTaxonomyLabel(source)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="crm-create-owner">Owner Staff ID</label>
              <input id="crm-create-owner" value={createCustomerForm.ownerStaffId} onChange={(event) => setCreateCustomerForm((prev) => ({ ...prev, ownerStaffId: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-create-consent">Consent status</label>
              <input id="crm-create-consent" value={createCustomerForm.consentStatus} onChange={(event) => setCreateCustomerForm((prev) => ({ ...prev, consentStatus: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-create-tags">Tags</label>
              <select
                id="crm-create-tags"
                multiple
                value={createCustomerForm.tags}
                onChange={(event) => setCreateCustomerForm((prev) => ({ ...prev, tags: readSelectedOptions(event) }))}
                size={Math.min(Math.max(customerTagOptions.length, 3), 8)}
              >
                {customerTagOptions.map((tag) => (
                  <option key={`create-customer-tag-${tag}`} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canMutate}>Tạo khách hàng</button>
            </div>
          </form>

          <form className="form-grid" onSubmit={onUpdateCustomer}>
            <h3>Cập nhật khách hàng đang chọn</h3>
            <p className="muted">Customer ID: {selectedCustomer ? selectedCustomer.id : '--'}</p>
            <div className="field">
              <label htmlFor="crm-update-name">Họ tên</label>
              <input id="crm-update-name" value={updateCustomerForm.fullName} onChange={(event) => setUpdateCustomerForm((prev) => ({ ...prev, fullName: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-update-phone">SĐT</label>
              <input id="crm-update-phone" value={updateCustomerForm.phone} onChange={(event) => setUpdateCustomerForm((prev) => ({ ...prev, phone: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-update-email">Email</label>
              <input id="crm-update-email" value={updateCustomerForm.email} onChange={(event) => setUpdateCustomerForm((prev) => ({ ...prev, email: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-update-stage">Stage</label>
              <select id="crm-update-stage" value={updateCustomerForm.customerStage} onChange={(event) => setUpdateCustomerForm((prev) => ({ ...prev, customerStage: event.target.value }))}>
                <option value="">-- Không đổi --</option>
                {updateCustomerForm.customerStage && !stageOptions.includes(updateCustomerForm.customerStage) ? (
                  <option value={updateCustomerForm.customerStage}>{updateCustomerForm.customerStage}</option>
                ) : null}
                {stageOptions.map((stage) => (
                  <option key={`update-stage-${stage}`} value={stage}>
                    {formatTaxonomyLabel(stage)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="crm-update-status">Status</label>
              <select id="crm-update-status" value={updateCustomerForm.status} onChange={(event) => setUpdateCustomerForm((prev) => ({ ...prev, status: event.target.value as Exclude<GenericStatus, 'ALL'> }))}>
                {STATUS_OPTIONS.filter((item) => item !== 'ALL').map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="crm-update-owner">Owner Staff ID</label>
              <input id="crm-update-owner" value={updateCustomerForm.ownerStaffId} onChange={(event) => setUpdateCustomerForm((prev) => ({ ...prev, ownerStaffId: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-update-consent">Consent status</label>
              <input id="crm-update-consent" value={updateCustomerForm.consentStatus} onChange={(event) => setUpdateCustomerForm((prev) => ({ ...prev, consentStatus: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-update-segment">Segment</label>
              <input id="crm-update-segment" value={updateCustomerForm.segment} onChange={(event) => setUpdateCustomerForm((prev) => ({ ...prev, segment: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-update-source">Source</label>
              <select id="crm-update-source" value={updateCustomerForm.source} onChange={(event) => setUpdateCustomerForm((prev) => ({ ...prev, source: event.target.value }))}>
                <option value="">-- Không đổi --</option>
                {updateCustomerForm.source && !sourceOptions.includes(updateCustomerForm.source) ? (
                  <option value={updateCustomerForm.source}>{updateCustomerForm.source}</option>
                ) : null}
                {sourceOptions.map((source) => (
                  <option key={`update-source-${source}`} value={source}>
                    {formatTaxonomyLabel(source)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="crm-update-total-orders">Total orders</label>
              <input id="crm-update-total-orders" type="number" min={0} value={updateCustomerForm.totalOrders} onChange={(event) => setUpdateCustomerForm((prev) => ({ ...prev, totalOrders: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-update-total-spent">Total spent</label>
              <input id="crm-update-total-spent" type="number" min={0} step="0.01" value={updateCustomerForm.totalSpent} onChange={(event) => setUpdateCustomerForm((prev) => ({ ...prev, totalSpent: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-update-tags">Tags</label>
              <select
                id="crm-update-tags"
                multiple
                value={updateCustomerForm.tags}
                onChange={(event) => setUpdateCustomerForm((prev) => ({ ...prev, tags: readSelectedOptions(event) }))}
                size={Math.min(Math.max(customerTagOptions.length, 3), 8)}
              >
                {customerTagOptions.map((tag) => (
                  <option key={`update-customer-tag-${tag}`} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canMutate || !selectedCustomer}>Cập nhật khách hàng</button>
            </div>
          </form>
        </section>

        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Interactions</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void loadInteractions()}>
              Tải lại interactions
            </button>
          </div>

          <p className="muted">Khách đang chọn: {selectedCustomer ? `${selectedCustomer.fullName || '--'} (${selectedCustomer.id})` : '--'}</p>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="crm-interaction-search">Từ khóa interaction</label>
              <input id="crm-interaction-search" value={interactionSearch} onChange={(event) => setInteractionSearch(event.target.value)} placeholder="Nội dung, kênh, staff..." />
            </div>
          </div>

          <form className="form-grid" onSubmit={onCreateInteraction}>
            <h3>Tạo interaction</h3>
            <div className="field">
              <label htmlFor="crm-interaction-customer-id">Customer ID</label>
              <input id="crm-interaction-customer-id" value={createInteractionForm.customerId} onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, customerId: event.target.value }))} placeholder={selectedCustomerId || 'Để trống = selected customer'} />
            </div>
            <div className="field">
              <label htmlFor="crm-interaction-customer-phone">Customer phone</label>
              <input id="crm-interaction-customer-phone" value={createInteractionForm.customerPhone} onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, customerPhone: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-interaction-customer-email">Customer email</label>
              <input id="crm-interaction-customer-email" value={createInteractionForm.customerEmail} onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, customerEmail: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-interaction-type">Interaction type</label>
              <input id="crm-interaction-type" value={createInteractionForm.interactionType} onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, interactionType: event.target.value }))} placeholder="TU_VAN / CHAM_SOC" />
            </div>
            <div className="field">
              <label htmlFor="crm-interaction-channel">Channel</label>
              <input id="crm-interaction-channel" value={createInteractionForm.channel} onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, channel: event.target.value }))} placeholder="ZALO / CALL / FB" />
            </div>
            <div className="field">
              <label htmlFor="crm-interaction-result-tag">Result tag</label>
              <select
                id="crm-interaction-result-tag"
                value={createInteractionForm.resultTag}
                onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, resultTag: event.target.value }))}
              >
                <option value="">-- Không gán resultTag --</option>
                {interactionResultTagOptions.map((tag) => (
                  <option key={`interaction-result-tag-${tag}`} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="crm-interaction-tags">Interaction tags</label>
              <select
                id="crm-interaction-tags"
                multiple
                value={createInteractionForm.tags}
                onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, tags: readSelectedOptions(event) }))}
                size={Math.min(Math.max(interactionTagOptions.length, 3), 8)}
              >
                {interactionTagOptions.map((tag) => (
                  <option key={`interaction-tag-${tag}`} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="crm-interaction-staff-name">Staff name</label>
              <input id="crm-interaction-staff-name" value={createInteractionForm.staffName} onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, staffName: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-interaction-staff-code">Staff code</label>
              <input id="crm-interaction-staff-code" value={createInteractionForm.staffCode} onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, staffCode: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-interaction-at">Interaction at</label>
              <input id="crm-interaction-at" type="datetime-local" value={createInteractionForm.interactionAt} onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, interactionAt: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-next-action-at">Next action at</label>
              <input id="crm-next-action-at" type="datetime-local" value={createInteractionForm.nextActionAt} onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, nextActionAt: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="crm-interaction-customer-stage">Update customer stage</label>
              <select
                id="crm-interaction-customer-stage"
                value={createInteractionForm.customerStage}
                onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, customerStage: event.target.value }))}
              >
                <option value="">-- Không cập nhật --</option>
                {stageOptions.map((stage) => (
                  <option key={`interaction-stage-${stage}`} value={stage}>
                    {formatTaxonomyLabel(stage)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="crm-interaction-content">Content</label>
              <textarea id="crm-interaction-content" required value={createInteractionForm.content} onChange={(event) => setCreateInteractionForm((prev) => ({ ...prev, content: event.target.value }))} />
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canMutate}>Tạo interaction</button>
            </div>
          </form>

          {isLoadingInteractions ? <p className="muted">Đang tải interactions...</p> : null}
          {!isLoadingInteractions && interactions.length === 0 ? <p className="muted">Chưa có interaction phù hợp.</p> : null}

          {interactions.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Khách hàng</th>
                    <th>Type</th>
                    <th>Channel</th>
                    <th>Kết quả</th>
                    <th>Staff</th>
                    <th>Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {interactions.map((item) => (
                    <tr key={item.id}>
                      <td>{toDateTime(item.interactionAt)}</td>
                      <td>{item.customer?.fullName || item.customerId || '--'}</td>
                      <td>{item.interactionType || '--'}</td>
                      <td>{item.channel || '--'}</td>
                      <td>{item.resultTag || '--'}</td>
                      <td>{item.staffName || item.staffCode || '--'}</td>
                      <td>{toDateTime(item.nextActionAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Payment Requests & Dedup</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void Promise.all([loadPaymentRequests(), loadDedupCandidates()])}>
              Tải lại
            </button>
          </div>

          <section className="panel-surface">
            <h3>Payment requests</h3>
            <div className="filter-grid">
              <div className="field">
                <label htmlFor="crm-payment-search">Từ khóa payment</label>
                <input id="crm-payment-search" value={paymentSearch} onChange={(event) => setPaymentSearch(event.target.value)} placeholder="invoiceNo, orderNo, recipient..." />
              </div>
              <div className="field">
                <label htmlFor="crm-payment-status">Status</label>
                <select id="crm-payment-status" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as (typeof PAYMENT_STATUS_OPTIONS)[number])}>
                  {PAYMENT_STATUS_OPTIONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>

            {isLoadingPayments ? <p className="muted">Đang tải payment requests...</p> : null}
            {!isLoadingPayments && paymentRequests.length === 0 ? <p className="muted">Không có payment request phù hợp.</p> : null}

            {paymentRequests.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice/Order</th>
                      <th>Khách hàng</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Sent</th>
                      <th>Paid</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRequests.map((item) => (
                      <tr key={item.id} className={selectedPaymentRequestId === item.id ? 'table-row-selected' : ''}>
                        <td>
                          <button
                            type="button"
                            className="record-link row-select-trigger"
                            onClick={() => setSelectedPaymentRequestId(item.id)}
                          >
                            {item.invoiceNo || item.orderNo || '--'}
                            <span>Xem</span>
                          </button>
                        </td>
                        <td>{item.customer?.fullName || item.customerId || '--'}</td>
                        <td>{toCurrency(item.amount)}</td>
                        <td><Badge variant={statusToBadge(item.status)}>{item.status || '--'}</Badge></td>
                        <td>{toDateTime(item.sentAt)}</td>
                        <td>{toDateTime(item.paidAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={!canMutate || item.status === 'DA_THANH_TOAN'}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onMarkPaid(item.id);
                            }}
                          >
                            Mark paid
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <form className="form-grid" onSubmit={onCreatePaymentRequest}>
              <h3>Tạo payment request</h3>
              <p className="muted">Payment đang chọn: {selectedPaymentRequest ? selectedPaymentRequest.id : '--'}</p>
              <div className="field">
                <label htmlFor="crm-payment-customer-id">Customer ID</label>
                <input id="crm-payment-customer-id" value={createPaymentRequestForm.customerId} onChange={(event) => setCreatePaymentRequestForm((prev) => ({ ...prev, customerId: event.target.value }))} placeholder={selectedCustomerId || 'Để trống = selected customer'} />
              </div>
              <div className="field">
                <label htmlFor="crm-payment-customer-phone">Customer phone</label>
                <input id="crm-payment-customer-phone" value={createPaymentRequestForm.customerPhone} onChange={(event) => setCreatePaymentRequestForm((prev) => ({ ...prev, customerPhone: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-payment-customer-email">Customer email</label>
                <input id="crm-payment-customer-email" value={createPaymentRequestForm.customerEmail} onChange={(event) => setCreatePaymentRequestForm((prev) => ({ ...prev, customerEmail: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-payment-invoice-no">Invoice No</label>
                <input id="crm-payment-invoice-no" value={createPaymentRequestForm.invoiceNo} onChange={(event) => setCreatePaymentRequestForm((prev) => ({ ...prev, invoiceNo: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-payment-order-no">Order No</label>
                <input id="crm-payment-order-no" value={createPaymentRequestForm.orderNo} onChange={(event) => setCreatePaymentRequestForm((prev) => ({ ...prev, orderNo: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-payment-channel">Channel</label>
                <input id="crm-payment-channel" value={createPaymentRequestForm.channel} onChange={(event) => setCreatePaymentRequestForm((prev) => ({ ...prev, channel: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-payment-recipient">Recipient</label>
                <input id="crm-payment-recipient" value={createPaymentRequestForm.recipient} onChange={(event) => setCreatePaymentRequestForm((prev) => ({ ...prev, recipient: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-payment-qr">QR code URL</label>
                <input id="crm-payment-qr" value={createPaymentRequestForm.qrCodeUrl} onChange={(event) => setCreatePaymentRequestForm((prev) => ({ ...prev, qrCodeUrl: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-payment-amount">Amount</label>
                <input id="crm-payment-amount" type="number" min={0} step="0.01" value={createPaymentRequestForm.amount} onChange={(event) => setCreatePaymentRequestForm((prev) => ({ ...prev, amount: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-payment-status-create">Status</label>
                <input id="crm-payment-status-create" value={createPaymentRequestForm.status} onChange={(event) => setCreatePaymentRequestForm((prev) => ({ ...prev, status: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-payment-sent-at">Sent at</label>
                <input id="crm-payment-sent-at" type="datetime-local" value={createPaymentRequestForm.sentAt} onChange={(event) => setCreatePaymentRequestForm((prev) => ({ ...prev, sentAt: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-payment-note">Note</label>
                <textarea id="crm-payment-note" value={createPaymentRequestForm.note} onChange={(event) => setCreatePaymentRequestForm((prev) => ({ ...prev, note: event.target.value }))} />
              </div>
              <div className="action-buttons">
                <button type="submit" className="btn btn-primary" disabled={!canMutate}>Tạo payment request</button>
              </div>
            </form>
          </section>

          <section className="panel-surface">
            <div className="crm-panel-head">
              <h3>Dedup candidates</h3>
              <button type="button" className="btn btn-ghost" onClick={() => void loadDedupCandidates()}>
                Tải lại dedup
              </button>
            </div>
            {isLoadingDedup ? <p className="muted">Đang tải dedup candidates...</p> : null}
            {!isLoadingDedup && dedupCandidates.length === 0 ? <p className="muted">Không có candidate trùng dữ liệu.</p> : null}

            {dedupCandidates.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Dedup key</th>
                      <th>Rule</th>
                      <th>Số hồ sơ</th>
                      <th>Customer IDs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dedupCandidates.map((candidate, index) => (
                      <tr key={`${candidate.dedupKey || 'dedup'}-${index}`}>
                        <td>{candidate.dedupKey || '--'}</td>
                        <td>{candidate.rule || '--'}</td>
                        <td>{candidate.customers?.length ?? 0}</td>
                        <td>{candidate.customers?.map((item) => item.id).join(', ') || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <form className="form-grid" onSubmit={onMergeCustomers}>
              <h3>Merge customers</h3>
              <div className="field">
                <label htmlFor="crm-merge-primary">Primary customer ID</label>
                <input id="crm-merge-primary" required value={mergeForm.primaryCustomerId} onChange={(event) => setMergeForm((prev) => ({ ...prev, primaryCustomerId: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-merge-secondary">Merged customer ID</label>
                <input id="crm-merge-secondary" required value={mergeForm.mergedCustomerId} onChange={(event) => setMergeForm((prev) => ({ ...prev, mergedCustomerId: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-merge-by">Merged by</label>
                <input id="crm-merge-by" value={mergeForm.mergedBy} onChange={(event) => setMergeForm((prev) => ({ ...prev, mergedBy: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="crm-merge-note">Note</label>
                <textarea id="crm-merge-note" value={mergeForm.note} onChange={(event) => setMergeForm((prev) => ({ ...prev, note: event.target.value }))} />
              </div>
              <div className="action-buttons">
                <button type="submit" className="btn btn-primary" disabled={!canMutate}>Gộp khách hàng</button>
              </div>
            </form>
          </section>
        </section>
      </section>
    </article>
  );
}
