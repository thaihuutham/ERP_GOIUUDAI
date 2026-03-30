'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { canAccessModule } from '../lib/rbac';
import { useUserRole } from './user-role-context';

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
const CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY = 'erp-retail.crm.customer-column-settings.v3';
const CUSTOMER_IMPORT_MAX_ROWS = 400;
const FETCH_LIMIT = 200;

const CUSTOMER_COLUMN_DEFINITIONS: CustomerColumnDefinition[] = [
  { key: 'code', label: 'Mã KH' },
  { key: 'fullName', label: 'Khách hàng' },
  { key: 'phone', label: 'Điện thoại' },
  { key: 'email', label: 'Email' },
  { key: 'customerStage', label: 'Giai đoạn' },
  { key: 'segment', label: 'Nhóm' },
  { key: 'source', label: 'Nguồn' },
  { key: 'totalOrders', label: 'Số đơn' },
  { key: 'totalSpent', label: 'Tổng chi tiêu' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'lastContactAt', label: 'Liên hệ gần nhất' },
  { key: 'updatedAt', label: 'Cập nhật lúc' },
  { key: 'tags', label: 'Tags' }
];

const DEFAULT_CUSTOMER_COLUMN_ORDER: CustomerColumnKey[] = CUSTOMER_COLUMN_DEFINITIONS.map((item) => item.key);
const DEFAULT_HIDDEN_CUSTOMER_COLUMNS: CustomerColumnKey[] = ['segment', 'source', 'lastContactAt', 'updatedAt', 'tags'];
const CUSTOMER_COLUMN_MAP = new Map(CUSTOMER_COLUMN_DEFINITIONS.map((item) => [item.key, item]));

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

function statusClass(status: string | null | undefined) {
  switch (status) {
    case 'ACTIVE':
    case 'APPROVED':
    case 'DA_THANH_TOAN':
      return 'finance-status-pill finance-status-pill-success';
    case 'PENDING':
    case 'DRAFT':
      return 'finance-status-pill finance-status-pill-warning';
    case 'INACTIVE':
    case 'REJECTED':
    case 'ARCHIVED':
      return 'finance-status-pill finance-status-pill-danger';
    default:
      return 'finance-status-pill finance-status-pill-neutral';
  }
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
      return toNumber(customer.totalOrders).toLocaleString('vi-VN');
    case 'totalSpent':
      return toCurrency(customer.totalSpent);
    case 'status':
      return <span className={statusClass(customer.status)}>{customer.status || '--'}</span>;
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

export function CrmCustomersBoard() {
  const { role } = useUserRole();
  const canView = canAccessModule(role, 'crm');
  const canMutate = role === 'MANAGER' || role === 'ADMIN';

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isImportingCustomers, setIsImportingCustomers] = useState(false);
  const [isApplyingBulkAction, setIsApplyingBulkAction] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
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

  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [customerColumnOrder, setCustomerColumnOrder] = useState<CustomerColumnKey[]>(DEFAULT_CUSTOMER_COLUMN_ORDER);
  const [hiddenCustomerColumns, setHiddenCustomerColumns] = useState<CustomerColumnKey[]>(DEFAULT_HIDDEN_CUSTOMER_COLUMNS);

  const importFileInputRef = useRef<HTMLInputElement | null>(null);

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
      { label: 'Tổng số khách hàng', value: filteredCustomers.length, tone: 'neutral' },
      { label: 'Khách hàng đang hoạt động', value: activeCount, tone: 'success' },
      { label: 'Khách hàng không hoạt động', value: inactiveCount, tone: 'danger' },
      { label: 'Liên hệ đang hoạt động', value: hasContactCount, tone: 'success' },
      { label: 'Liên hệ ít hoạt động', value: highValueCount, tone: 'warning' },
      { label: 'Các liên hệ đã nhập hôm nay', value: updatedTodayCount, tone: 'neutral' }
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
          limit: FETCH_LIMIT
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

  useEffect(() => {
    void loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, customerSearch, customerStatus, customerStageFilter, customerTagFilter]);

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

      if (validOrder.length > 0) {
        const mergedOrder = [
          ...validOrder,
          ...DEFAULT_CUSTOMER_COLUMN_ORDER.filter((item) => !validOrder.includes(item))
        ];
        setCustomerColumnOrder(mergedOrder);
      }
      if (validHidden.length < DEFAULT_CUSTOMER_COLUMN_ORDER.length) {
        setHiddenCustomerColumns(Array.from(new Set(validHidden)));
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
      await loadCustomers();
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

      await loadCustomers();

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

  const onCreateCustomer = async () => {
    if (!canMutate) {
      return;
    }

    const fullName = window.prompt('Nhập họ tên khách hàng mới:');
    if (!fullName || !fullName.trim()) {
      return;
    }
    const phone = window.prompt('Số điện thoại (tuỳ chọn):') || '';
    const email = window.prompt('Email (tuỳ chọn):') || '';

    setErrorMessage(null);
    setResultMessage(null);
    setIsCreatingCustomer(true);
    try {
      await apiRequest('/crm/customers', {
        method: 'POST',
        body: {
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined
        }
      });
      setResultMessage('Đã tạo khách hàng mới.');
      await loadCustomers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo khách hàng.');
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  if (!canView) {
    return (
      <article className="module-workbench">
        <header className="module-header">
          <div>
            <h1>Khách hàng</h1>
            <p>Bạn không có quyền truy cập phân hệ CRM với vai trò hiện tại.</p>
          </div>
        </header>
      </article>
    );
  }

  return (
    <article className="crm-customer-page">
      <header className="crm-customer-page-header">
        <h1>Khách hàng</h1>
        <p>Liên hệ</p>
      </header>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}
      {!canMutate ? <p className="banner banner-warning">Vai trò `{role}` chỉ có quyền xem dữ liệu.</p> : null}

      <section className="panel-surface crm-customer-main-panel">
        <div className="crm-customer-toolbar">
          <div className="action-buttons">
            <button type="button" className="btn btn-primary" disabled={!canMutate || isCreatingCustomer} onClick={() => void onCreateCustomer()}>
              {isCreatingCustomer ? 'Đang tạo...' : '+ Khách hàng mới'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!canMutate || isImportingCustomers}
              onClick={() => importFileInputRef.current?.click()}
            >
              {isImportingCustomers ? 'Đang nhập...' : 'Nhập khách hàng'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowCustomerFilters((previous) => !previous)}>
              {showCustomerFilters ? 'Ẩn Filters' : 'Filters'}
            </button>
          </div>

          <div className="crm-customer-toolbar-right">
            <input
              id="crm-customer-search"
              className="crm-customer-search-input"
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="Tìm kiếm..."
            />
            <button type="button" className="btn btn-ghost" onClick={() => setIsColumnSettingsOpen((previous) => !previous)}>
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
              <strong>{item.value.toLocaleString('vi-VN')}</strong>
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
              <input id="crm-customer-stage" value={customerStageFilter} onChange={(event) => setCustomerStageFilter(event.target.value)} placeholder="MOI / DA_MUA..." />
            </div>
            <div className="field">
              <label htmlFor="crm-customer-tag">Tag</label>
              <input id="crm-customer-tag" value={customerTagFilter} onChange={(event) => setCustomerTagFilter(event.target.value)} placeholder="vip / da_mua / ..." />
            </div>
            <div className="field">
              <label htmlFor="crm-customer-segment">Nhóm khách</label>
              <input id="crm-customer-segment" value={customerSegmentFilter} onChange={(event) => setCustomerSegmentFilter(event.target.value)} placeholder="VIP / B2B / Retail..." />
            </div>
            <div className="field">
              <label htmlFor="crm-customer-source">Nguồn</label>
              <input id="crm-customer-source" value={customerSourceFilter} onChange={(event) => setCustomerSourceFilter(event.target.value)} placeholder="Facebook / Zalo / Store..." />
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
                  <tr key={customer.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedCustomerIds.includes(customer.id)}
                        onChange={(event) => onSelectCustomer(customer.id, event.target.checked)}
                        aria-label={`Chọn khách hàng ${customer.fullName || customer.id}`}
                      />
                    </td>
                    <td>{(currentCustomerPage - 1) * rowsPerPage + index + 1}</td>
                    {visibleCustomerColumns.map((column) => (
                      <td key={`${customer.id}-${column.key}`}>{renderCustomerCell(customer, column.key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Không có khách hàng phù hợp với bộ lọc hiện tại.</p>
        )}

        <div className="pagination-row">
          <div className="pagination-left">
            <span>Hiển thị {customerRange.from}-{customerRange.to} / {filteredCustomers.length} khách hàng</span>
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
      </section>
    </article>
  );
}
