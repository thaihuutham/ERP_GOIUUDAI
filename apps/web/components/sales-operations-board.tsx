'use client';

import {
  ShoppingCart,
  Receipt,
  CheckCircle2,
  Plus,
  Search,
  RefreshCw,
  Package,
  TrendingUp,
  History,
  AlertCircle,
  FileText,
  XCircle,
  Trash2
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  apiRequest,
  normalizeListPayload,
  normalizePagedListPayload,
  type ApiListSortMeta
} from '../lib/api-client';
import { formatRuntimeCurrency, formatRuntimeDateTime } from '../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../lib/bulk-actions';
import { useCursorTableState } from '../lib/use-cursor-table-state';
import { useAccessPolicy } from './access-policy-context';
import { StandardDataTable, ColumnDefinition, type StandardTableBulkAction } from './ui/standard-data-table';
import { SidePanel } from './ui/side-panel';
import { Badge, statusToBadge } from './ui';

type SalesOrderItem = {
  id?: string;
  productId?: string | null;
  productName?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
};

type SalesInvoiceRef = {
  id: string;
  invoiceNo?: string | null;
  status?: string | null;
  createdAt?: string | null;
};

type SalesOrder = {
  id: string;
  orderNo?: string | null;
  customerName?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  totalAmount?: number | null;
  status?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  items?: SalesOrderItem[];
  invoices?: SalesInvoiceRef[];
};

type ApprovalRecord = {
  id: string;
  targetId?: string | null;
  status?: string | null;
  requesterId?: string | null;
  approverId?: string | null;
  decisionNote?: string | null;
  decidedAt?: string | null;
  createdAt?: string | null;
};

type CheckoutOrderGroup = 'INSURANCE' | 'TELECOM' | 'DIGITAL';

type FieldConfigItem = {
  type?: 'text' | 'select' | 'date' | 'tel' | 'number' | 'checkbox' | 'file';
  label?: string;
  options?: string[];
};

type CheckoutTemplateConfig = {
  code: string;
  label: string;
  requiredFields: string[];
  fieldConfig?: Record<string, FieldConfigItem>;
};

type CheckoutConfigResponse = {
  checkoutTemplates?: Record<CheckoutOrderGroup, CheckoutTemplateConfig[]>;
};

type CreateCheckoutItemForm = {
  productName: string;
  quantity: number;
  unitPrice: number;
};

type CreateCheckoutFormState = {
  orderGroup: CheckoutOrderGroup;
  templateCode: string;
  templateFields: Record<string, string>;
  customerName: string;
  customerId: string;
  employeeId: string;
  createdBy: string;
  items: CreateCheckoutItemForm[];
};

const SALES_COLUMN_SETTINGS_KEY = 'erp-retail.sales.order-table-settings.v3';
const SALES_TABLE_PAGE_SIZE = 25;

function toCurrency(value: number | null | undefined) {
  return formatRuntimeCurrency(Number(value || 0));
}

function toDateTime(value: string | null | undefined) {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatRuntimeDateTime(parsed.toISOString());
}

function getStatusClass(status: string | null | undefined) {
  const normalized = (status || '').toUpperCase();
  if (['APPROVED', 'ACTIVE', 'PAID', 'DELIVERED'].includes(normalized)) {
    return 'finance-status-pill finance-status-pill-success';
  }
  if (['PENDING', 'DRAFT'].includes(normalized)) {
    return 'finance-status-pill finance-status-pill-warning';
  }
  if (['REJECTED', 'CANCELLED', 'ARCHIVED'].includes(normalized)) {
    return 'finance-status-pill finance-status-pill-danger';
  }
  return 'finance-status-pill finance-status-pill-neutral';
}

function buildAuditObjectHref(entityType: string, entityId: string) {
  const params = new URLSearchParams({
    entityType,
    entityId
  });
  return `/modules/audit?${params.toString()}`;
}

function makeEmptyCheckoutItem(): CreateCheckoutItemForm {
  return {
    productName: '',
    quantity: 1,
    unitPrice: 0
  };
}

function makeInitialCreateCheckoutForm(): CreateCheckoutFormState {
  return {
    orderGroup: 'INSURANCE',
    templateCode: '',
    templateFields: {},
    customerName: '',
    customerId: '',
    employeeId: '',
    createdBy: '',
    items: [makeEmptyCheckoutItem()]
  };
}

function formatTemplateFieldLabel(key: string) {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function detectTemplateFieldInputType(key: string): 'text' | 'date' | 'number' | 'tel' {
  const lower = key.toLowerCase();
  if (lower.includes('phone') || lower.includes('mobile')) {
    return 'tel';
  }
  if (lower.includes('date') || lower.endsWith('at') || lower.includes('time')) {
    return 'date';
  }
  if (
    lower.includes('day')
    || lower.includes('term')
    || lower.includes('amount')
    || lower.includes('price')
    || lower.includes('qty')
    || lower.includes('quantity')
    || lower.includes('limit')
    || lower.includes('count')
  ) {
    return 'number';
  }
  return 'text';
}

function parseTemplateFieldValue(key: string, value: string): string | number {
  const normalized = value.trim();
  if (detectTemplateFieldInputType(key) !== 'number') {
    return normalized;
  }
  const asNumber = Number(normalized);
  return Number.isFinite(asNumber) ? asNumber : normalized;
}

function areTemplateFieldMapsEqual(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => (left[key] ?? '') === (right[key] ?? ''));
}

export function SalesOperationsBoard() {
  const { canModule, canAction } = useAccessPolicy();
  const canView = canModule('sales');
  const canCreate = canAction('sales', 'CREATE');
  const canApprove = canAction('sales', 'APPROVE');
  const canDelete = canAction('sales', 'DELETE');

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [tableSortBy, setTableSortBy] = useState('createdAt');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');
  const [tableSortMeta, setTableSortMeta] = useState<ApiListSortMeta | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<BulkRowId[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isLoadingCheckoutConfig, setIsLoadingCheckoutConfig] = useState(false);
  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfigResponse | null>(null);
  const [createOrderForm, setCreateOrderForm] = useState<CreateCheckoutFormState>(makeInitialCreateCheckoutForm());

  const [decisionNote, setDecisionNote] = useState('');
  const [isHandlingDecision, setIsHandlingDecision] = useState(false);
  const [isExportingInvoice, setIsExportingInvoice] = useState(false);
  const [isArchivingOrder, setIsArchivingOrder] = useState(false);
  const salesTableFingerprint = useMemo(
    () =>
      JSON.stringify({
        q: search.trim(),
        sortBy: tableSortBy,
        sortDir: tableSortDir,
        limit: SALES_TABLE_PAGE_SIZE
      }),
    [search, tableSortBy, tableSortDir]
  );
  const salesTablePager = useCursorTableState(salesTableFingerprint);

  const currentGroupTemplates = useMemo(
    () => checkoutConfig?.checkoutTemplates?.[createOrderForm.orderGroup] ?? [],
    [checkoutConfig, createOrderForm.orderGroup]
  );

  const selectedTemplate = useMemo(() => {
    if (currentGroupTemplates.length === 0) {
      return null;
    }
    return currentGroupTemplates.find((item) => item.code === createOrderForm.templateCode) ?? currentGroupTemplates[0] ?? null;
  }, [currentGroupTemplates, createOrderForm.templateCode]);

  const ensureTemplateSelection = (
    orderGroup: CheckoutOrderGroup,
    currentCode: string,
    currentFields: Record<string, string>
  ) => {
    const templates = checkoutConfig?.checkoutTemplates?.[orderGroup] ?? [];
    const matched = templates.find((item) => item.code === currentCode) ?? templates[0] ?? null;
    const nextCode = matched?.code ?? '';
    const nextFields: Record<string, string> = {};
    for (const fieldKey of matched?.requiredFields ?? []) {
      nextFields[fieldKey] = currentFields[fieldKey] ?? '';
    }
    return {
      nextCode,
      nextFields
    };
  };

  const loadData = async () => {
    if (!canView) return;
    setIsLoading(true);
    try {
      const [ordersPayload, approvalsPayload] = await Promise.all([
        apiRequest<any>('/sales/orders', {
          query: {
            q: search,
            limit: SALES_TABLE_PAGE_SIZE,
            cursor: salesTablePager.cursor ?? undefined,
            sortBy: tableSortBy,
            sortDir: tableSortDir
          }
        }),
        apiRequest<any>('/sales/approvals')
      ]);
      const normalizedOrders = normalizePagedListPayload<SalesOrder>(ordersPayload);
      setOrders(normalizedOrders.items);
      salesTablePager.syncFromPageInfo(normalizedOrders.pageInfo);
      setTableSortMeta(normalizedOrders.sortMeta);
      setApprovals(normalizeListPayload(approvalsPayload) as ApprovalRecord[]);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu đơn hàng');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCheckoutConfig = async () => {
    if (!canCreate || isLoadingCheckoutConfig) return;
    setIsLoadingCheckoutConfig(true);
    try {
      const payload = await apiRequest<CheckoutConfigResponse>('/sales/checkout/config');
      setCheckoutConfig(payload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `Không thể tải cấu hình Sale Checkout v1: ${error.message}`
          : 'Không thể tải cấu hình Sale Checkout v1.'
      );
    } finally {
      setIsLoadingCheckoutConfig(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 250);
    return () => clearTimeout(timer);
  }, [canView, salesTablePager.currentPage, search, tableSortBy, tableSortDir]);

  useEffect(() => {
    if (!selectedOrder) return;
    const refreshed = orders.find((order) => order.id === selectedOrder.id);
    if (refreshed) {
      setSelectedOrder(refreshed);
    }
  }, [orders, selectedOrder]);

  useEffect(() => {
    if (!isCreatePanelOpen || !canCreate || checkoutConfig) return;
    void loadCheckoutConfig();
  }, [isCreatePanelOpen, canCreate, checkoutConfig]);

  useEffect(() => {
    if (!checkoutConfig) return;
    setCreateOrderForm((prev) => {
      const { nextCode, nextFields } = ensureTemplateSelection(prev.orderGroup, prev.templateCode, prev.templateFields);
      if (prev.templateCode === nextCode && areTemplateFieldMapsEqual(prev.templateFields, nextFields)) {
        return prev;
      }
      return {
        ...prev,
        templateCode: nextCode,
        templateFields: nextFields
      };
    });
  }, [checkoutConfig, createOrderForm.orderGroup]);

  const selectedOrderApprovals = useMemo(() => {
    if (!selectedOrder) return [];
    return approvals
      .filter((approval) => approval.targetId === selectedOrder.id)
      .sort((left, right) => {
        const leftAt = new Date(left.createdAt || 0).getTime();
        const rightAt = new Date(right.createdAt || 0).getTime();
        return rightAt - leftAt;
      });
  }, [approvals, selectedOrder]);

  const totalRevenue = useMemo(
    () => orders.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0),
    [orders]
  );
  const pendingOrders = useMemo(
    () => orders.filter((order) => String(order.status || '').toUpperCase() === 'PENDING').length,
    [orders]
  );

  const columns: ColumnDefinition<SalesOrder>[] = [
    {
      key: 'orderNo',
      label: 'Số đơn hàng',
      sortKey: 'orderNo',
      isLink: true,
      render: (order) => order.orderNo || order.id.slice(-8)
    },
    { key: 'customerName', label: 'Khách hàng', sortKey: 'customerName' },
    {
      key: 'totalAmount',
      label: 'Tổng tiền',
      sortKey: 'totalAmount',
      render: (order) => toCurrency(order.totalAmount ?? 0)
    },
    {
      key: 'status',
      label: 'Trạng thái',
      sortKey: 'status',
      render: (order) => <Badge variant={statusToBadge(order.status)}>{order.status || '--'}</Badge>
    },
    {
      key: 'invoices',
      label: 'Hóa đơn liên kết',
      sortable: false,
      sortDisabledTooltip: 'Sắp xếp theo hóa đơn liên kết chưa hỗ trợ ở đợt này.',
      render: (order) => order.invoices?.[0]?.invoiceNo ?? '--'
    },
    {
      key: 'createdBy',
      label: 'Người tạo',
      sortable: false,
      sortDisabledTooltip: 'Sắp xếp theo người tạo chưa hỗ trợ ở đợt này.'
    },
    {
      key: 'createdAt',
      label: 'Ngày tạo',
      sortKey: 'createdAt',
      render: (order) => toDateTime(order.createdAt)
    }
  ];

  const runSalesBulkAction = async (
    actionLabel: string,
    selectedRows: SalesOrder[],
    execute: (order: SalesOrder) => Promise<void>
  ): Promise<BulkExecutionResult> => {
    if (selectedRows.length === 0) {
      return {
        total: 0,
        successCount: 0,
        failedCount: 0,
        failedIds: [],
        failures: [],
        actionLabel,
        message: `${actionLabel}: không có đơn hàng được chọn.`
      };
    }

    const rowsById = new Map<string, SalesOrder>();
    selectedRows.forEach((row) => rowsById.set(String(row.id), row));
    const ids = selectedRows.map((row) => String(row.id));

    const result = await runBulkOperation({
      ids,
      continueOnError: true,
      chunkSize: 10,
      execute: async (orderId) => {
        const row = rowsById.get(String(orderId));
        if (!row) {
          throw new Error(`Không tìm thấy đơn hàng ${orderId}.`);
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
      await loadData();
    }
    setResultMessage(normalized.message ?? null);
    if (normalized.failedCount > 0) {
      setErrorMessage(`Một số đơn hàng lỗi khi chạy "${actionLabel}".`);
    } else {
      setErrorMessage(null);
    }
    return normalized;
  };

  const bulkActions = useMemo<StandardTableBulkAction<SalesOrder>[]>(() => {
    const actions: StandardTableBulkAction<SalesOrder>[] = [];

    if (canApprove) {
      actions.push({
        key: 'bulk-approve-orders',
        label: 'Approve',
        tone: 'primary',
        execute: async (selectedRows) =>
          runSalesBulkAction('Duyệt đơn hàng', selectedRows, async (order) => {
            if (String(order.status || '').toUpperCase() !== 'PENDING') {
              throw new Error(`Đơn ${order.orderNo || order.id.slice(-8)} không ở trạng thái PENDING.`);
            }
            await apiRequest(`/sales/orders/${order.id}/approve`, {
              method: 'POST',
              body: { note: 'Bulk approve từ Operations Board' }
            });
          })
      });
      actions.push({
        key: 'bulk-reject-orders',
        label: 'Reject',
        tone: 'danger',
        confirmMessage: (rows) => `Từ chối ${rows.length} đơn hàng đã chọn?`,
        execute: async (selectedRows) =>
          runSalesBulkAction('Từ chối đơn hàng', selectedRows, async (order) => {
            if (String(order.status || '').toUpperCase() !== 'PENDING') {
              throw new Error(`Đơn ${order.orderNo || order.id.slice(-8)} không ở trạng thái PENDING.`);
            }
            await apiRequest(`/sales/orders/${order.id}/reject`, {
              method: 'POST',
              body: { note: 'Bulk reject từ Operations Board' }
            });
          })
      });
    }

    if (canCreate) {
      actions.push({
        key: 'bulk-create-invoice',
        label: 'Create invoice',
        tone: 'ghost',
        execute: async (selectedRows) =>
          runSalesBulkAction('Xuất hóa đơn từ đơn hàng', selectedRows, async (order) => {
            const isApproved = String(order.status || '').toUpperCase() === 'APPROVED';
            const hasInvoice = Boolean(order.invoices?.[0]);
            if (!isApproved || hasInvoice) {
              throw new Error(`Đơn ${order.orderNo || order.id.slice(-8)} chưa hợp lệ để tạo invoice.`);
            }
            await apiRequest('/finance/invoices/from-order', {
              method: 'POST',
              body: { orderId: order.id }
            });
          })
      });
    }

    if (canDelete) {
      actions.push({
        key: 'bulk-archive-orders',
        label: 'Archive',
        tone: 'danger',
        confirmMessage: (rows) => `Lưu trữ ${rows.length} đơn hàng đã chọn?`,
        execute: async (selectedRows) =>
          runSalesBulkAction('Lưu trữ đơn hàng', selectedRows, async (order) => {
            await apiRequest(`/sales/orders/${order.id}`, {
              method: 'DELETE'
            });
          })
      });
    }

    return actions;
  }, [canApprove, canCreate, canDelete]);

  if (!canView) {
    return null;
  }

  const selectedInvoiceRef = selectedOrder?.invoices?.[0] ?? null;
  const canApproveOrReject = canApprove && String(selectedOrder?.status || '').toUpperCase() === 'PENDING';
  const canExportInvoice =
    canCreate
    && String(selectedOrder?.status || '').toUpperCase() === 'APPROVED'
    && !selectedInvoiceRef;

  const handleCreateOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate || isCreatingOrder) return;

    const normalizedItems = createOrderForm.items
      .map((item) => ({
        productName: item.productName.trim(),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice)
      }))
      .filter((item) => item.productName && item.quantity > 0 && item.unitPrice > 0);

    if (!selectedTemplate) {
      setErrorMessage(`Tạo checkout thất bại: chưa cấu hình template cho nhóm ${createOrderForm.orderGroup}.`);
      return;
    }
    if (!createOrderForm.customerName.trim()) {
      setErrorMessage('Tạo checkout thất bại: cần nhập customer name.');
      return;
    }
    if (normalizedItems.length === 0) {
      setErrorMessage('Tạo checkout thất bại: cần tối thiểu 1 dòng dịch vụ hợp lệ.');
      return;
    }

    const templatePayload: Record<string, unknown> = {};
    for (const fieldKey of selectedTemplate.requiredFields) {
      const rawValue = (createOrderForm.templateFields[fieldKey] ?? '').trim();
      if (!rawValue) {
        setErrorMessage(`Tạo checkout thất bại: thiếu field bắt buộc ${fieldKey}.`);
        return;
      }
      templatePayload[fieldKey] = parseTemplateFieldValue(fieldKey, rawValue);
    }

    setErrorMessage(null);
    setResultMessage(null);
    setIsCreatingOrder(true);
    try {
      const createdOrder = await apiRequest<{ id: string; orderNo?: string | null }>('/sales/checkout/orders', {
        method: 'POST',
        body: {
          orderGroup: createOrderForm.orderGroup,
          templateCode: selectedTemplate.code,
          templateFields: templatePayload,
          customerName: createOrderForm.customerName || undefined,
          customerId: createOrderForm.customerId || undefined,
          employeeId: createOrderForm.employeeId || undefined,
          createdBy: createOrderForm.createdBy || undefined,
          items: normalizedItems
        }
      });
      setResultMessage(`Đã tạo đơn nháp ${createdOrder.orderNo || createdOrder.id.slice(-8)}. Bấm "Gửi đơn" để chuyển sang chờ thanh toán.`);
      setIsCreatePanelOpen(false);
      setCreateOrderForm(makeInitialCreateCheckoutForm());
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? `Tạo checkout thất bại: ${error.message}` : 'Tạo checkout thất bại.');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handleOrderGroupChange = (group: CheckoutOrderGroup) => {
    setCreateOrderForm((prev) => {
      const { nextCode, nextFields } = ensureTemplateSelection(group, '', {});
      return {
        ...prev,
        orderGroup: group,
        templateCode: nextCode,
        templateFields: nextFields
      };
    });
  };

  const handleTemplateCodeChange = (templateCode: string) => {
    setCreateOrderForm((prev) => {
      const { nextCode, nextFields } = ensureTemplateSelection(prev.orderGroup, templateCode, prev.templateFields);
      return {
        ...prev,
        templateCode: nextCode,
        templateFields: nextFields
      };
    });
  };

  const handleTemplateFieldChange = (fieldKey: string, value: string) => {
    setCreateOrderForm((prev) => {
      const nextFields = {
        ...prev.templateFields,
        [fieldKey]: value
      };

      // Auto-compute effectiveTo when termDays or startDate/requestedEffectiveDate changes
      const termDaysKeys = ['termDays'];
      const startDateKeys = ['startDate', 'requestedEffectiveDate'];
      const isTermUpdate = termDaysKeys.includes(fieldKey);
      const isStartUpdate = startDateKeys.includes(fieldKey);

      if (isTermUpdate || isStartUpdate) {
        const termDaysValue = isTermUpdate ? value : (nextFields.termDays ?? '');
        const startDateValue = isStartUpdate
          ? value
          : (nextFields.startDate ?? nextFields.requestedEffectiveDate ?? '');

        if (termDaysValue && startDateValue) {
          const days = Number(termDaysValue);
          const start = new Date(startDateValue);
          if (Number.isFinite(days) && days > 0 && !Number.isNaN(start.getTime())) {
            const end = new Date(start);
            end.setDate(end.getDate() + days);
            nextFields.effectiveTo = end.toISOString().slice(0, 10);
          }
        }
      }

      return {
        ...prev,
        templateFields: nextFields
      };
    });
  };

  const handleFileUpload = async (fieldKey: string, file: File) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const result = await fetch('/api/v1/sales/checkout/files/upload', {
        method: 'POST',
        body: formData
      });
      if (!result.ok) {
        const err = await result.json().catch(() => ({}));
        throw new Error((err as Record<string, string>).message || 'Upload thất bại');
      }
      const data = await result.json() as { fileId: string; fileName: string; url: string };
      handleTemplateFieldChange(fieldKey, data.fileId);
      setResultMessage(`Đã upload file: ${file.name}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? `Upload thất bại: ${error.message}` : 'Upload thất bại.');
    }
  };

  const handleUpdateItem = (index: number, key: keyof CreateCheckoutItemForm, value: string) => {
    setCreateOrderForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (key === 'quantity' || key === 'unitPrice') {
          return {
            ...item,
            [key]: Number(value)
          };
        }
        return {
          ...item,
          [key]: value
        };
      })
    }));
  };

  const handleAddItem = () => {
    setCreateOrderForm((prev) => ({
      ...prev,
      items: [...prev.items, makeEmptyCheckoutItem()]
    }));
  };

  const handleRemoveItem = (index: number) => {
    setCreateOrderForm((prev) => {
      const nextItems = prev.items.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...prev,
        items: nextItems.length > 0 ? nextItems : [makeEmptyCheckoutItem()]
      };
    });
  };

  const handleOrderDecision = async (action: 'approve' | 'reject') => {
    if (!selectedOrder || !canApproveOrReject) return;
    setIsHandlingDecision(true);
    try {
      await apiRequest(`/sales/orders/${selectedOrder.id}/${action}`, {
        method: 'POST',
        body: {
          note: decisionNote || undefined
        }
      });
      setResultMessage(
        action === 'approve'
          ? `Đơn hàng ${selectedOrder.orderNo || selectedOrder.id.slice(-8)} đã được phê duyệt.`
          : `Đơn hàng ${selectedOrder.orderNo || selectedOrder.id.slice(-8)} đã bị từ chối.`
      );
      setErrorMessage(null);
      setDecisionNote('');
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể xử lý duyệt đơn');
    } finally {
      setIsHandlingDecision(false);
    }
  };

  const handleExportInvoice = async () => {
    if (!selectedOrder || !canExportInvoice) return;
    setIsExportingInvoice(true);
    try {
      const payload = await apiRequest<any>('/finance/invoices/from-order', {
        method: 'POST',
        body: {
          orderId: selectedOrder.id
        }
      });
      setResultMessage(
        `Đã xuất hóa đơn ${payload?.invoiceNo || payload?.id || ''} từ đơn ${selectedOrder.orderNo || selectedOrder.id.slice(-8)}.`
      );
      setErrorMessage(null);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể xuất hóa đơn từ đơn hàng');
    } finally {
      setIsExportingInvoice(false);
    }
  };

  const handleArchiveOrder = async () => {
    if (!selectedOrder || !canDelete || isArchivingOrder) return;
    if (!window.confirm(`Lưu trữ đơn hàng ${selectedOrder.orderNo || selectedOrder.id.slice(-8)}?`)) {
      return;
    }

    setIsArchivingOrder(true);
    try {
      await apiRequest(`/sales/orders/${selectedOrder.id}`, {
        method: 'DELETE'
      });
      setResultMessage(`Đã lưu trữ đơn hàng ${selectedOrder.orderNo || selectedOrder.id.slice(-8)}.`);
      setErrorMessage(null);
      setSelectedOrder(null);
      setDecisionNote('');
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể lưu trữ đơn hàng');
    } finally {
      setIsArchivingOrder(false);
    }
  };

  return (
    <div className="sales-board">
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

      <div className="metrics-grid" style={{ marginBottom: '2rem', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <h4 className="finance-status-title"><TrendingUp size={16} /> Doanh thu đơn hàng</h4>
          <p className="finance-status-value">{toCurrency(totalRevenue)}</p>
        </div>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--warning)' }}>
          <h4 className="finance-status-title"><AlertCircle size={16} /> Đơn chờ duyệt</h4>
          <p className="finance-status-value finance-status-value-warning">{pendingOrders}</p>
        </div>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--success)' }}>
          <h4 className="finance-status-title"><CheckCircle2 size={16} /> Đơn đã duyệt</h4>
          <p className="finance-status-value finance-status-value-success">
            {orders.filter((order) => String(order.status || '').toUpperCase() === 'APPROVED').length}
          </p>
        </div>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--line)' }}>
          <h4 className="finance-status-title"><ShoppingCart size={16} /> Tổng số đơn</h4>
          <p className="finance-status-value">{orders.length}</p>
        </div>
      </div>

      <StandardDataTable
        data={orders}
        columns={columns}
        isLoading={isLoading}
        storageKey={SALES_COLUMN_SETTINGS_KEY}
        toolbarLeftContent={(
          <div className="field" style={{ width: '320px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                placeholder="Tìm mã đơn, khách hàng..."
                style={{ paddingLeft: '36px' }}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        )}
        toolbarRightContent={(
          <>
            <button className="btn btn-ghost" onClick={loadData}>
              <RefreshCw size={16} /> Refresh
            </button>
            {canCreate && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setIsCreatePanelOpen(true);
                  if (!checkoutConfig) {
                    void loadCheckoutConfig();
                  }
                }}
              >
                <Plus size={16} /> Tạo đơn hàng
              </button>
            )}
          </>
        )}
        pageInfo={{
          currentPage: salesTablePager.currentPage,
          hasPrevPage: salesTablePager.hasPrevPage,
          hasNextPage: salesTablePager.hasNextPage,
          visitedPages: salesTablePager.visitedPages
        }}
        sortMeta={
          tableSortMeta ?? {
            sortBy: tableSortBy,
            sortDir: tableSortDir,
            sortableFields: []
          }
        }
        onPageNext={salesTablePager.goNextPage}
        onPagePrev={salesTablePager.goPrevPage}
        onJumpVisitedPage={salesTablePager.jumpVisitedPage}
        onSortChange={(sortBy, sortDir) => {
          setTableSortBy(sortBy);
          setTableSortDir(sortDir);
        }}
        onRowClick={(order) => setSelectedOrder(order)}
        enableRowSelection
        selectedRowIds={selectedRowIds}
        onSelectedRowIdsChange={setSelectedRowIds}
        bulkActions={bulkActions}
        showDefaultBulkUtilities
      />

      <SidePanel
        isOpen={Boolean(selectedOrder)}
        onClose={() => {
          setSelectedOrder(null);
          setDecisionNote('');
        }}
        title="Chi tiết đơn bán hàng"
      >
        {selectedOrder && (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingBottom: '1rem', borderBottom: '1px solid var(--line)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <Receipt size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{selectedOrder.orderNo || selectedOrder.id.slice(-8)}</h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Khách hàng: {selectedOrder.customerName || '--'}</p>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <Badge variant={statusToBadge(selectedOrder.status)}>{selectedOrder.status || '--'}</Badge>
              </div>
            </div>

            <div style={{ padding: '1rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius-lg)' }}>
              <p style={{ color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Tổng giá trị đơn</p>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--primary)' }}>{toCurrency(selectedOrder.totalAmount ?? 0)}</h2>
            </div>

            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Package size={16} /> Danh sách sản phẩm
              </h4>
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {(!selectedOrder.items || selectedOrder.items.length === 0) ? (
                  <p style={{ padding: '1rem', color: 'var(--muted)', fontStyle: 'italic' }}>Không có chi tiết sản phẩm.</p>
                ) : (
                  selectedOrder.items.map((item, index) => (
                    <div
                      key={`${item.id || index}`}
                      style={{
                        padding: '0.85rem 1rem',
                        borderBottom: index === selectedOrder.items!.length - 1 ? 'none' : '1px solid var(--line)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <p style={{ fontWeight: 500, fontSize: '0.875rem' }}>{item.productName || '--'}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                          SL: {Number(item.quantity || 0)} x {toCurrency(Number(item.unitPrice || 0))}
                        </p>
                      </div>
                      <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                        {toCurrency(Number(item.quantity || 0) * Number(item.unitPrice || 0))}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Người tạo</span>
                <span style={{ fontWeight: 500 }}>{selectedOrder.createdBy || '--'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Thời gian tạo</span>
                <span style={{ fontWeight: 500 }}>{toDateTime(selectedOrder.createdAt)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Hóa đơn liên kết</span>
                <span style={{ fontWeight: 500 }}>{selectedInvoiceRef?.invoiceNo || '--'}</span>
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History size={16} /> Lịch sử phê duyệt chỉnh sửa
              </h4>
              {selectedOrderApprovals.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>Chưa có yêu cầu chỉnh sửa cần duyệt.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {selectedOrderApprovals.map((approval) => (
                    <div key={approval.id} style={{ padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <Badge variant={statusToBadge(approval.status)}>{approval.status || '--'}</Badge>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{toDateTime(approval.createdAt)}</span>
                      </div>
                      <p style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Note: {approval.decisionNote || '--'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="field">
              <label>Ghi chú phê duyệt / từ chối</label>
              <textarea
                value={decisionNote}
                onChange={(event) => setDecisionNote(event.target.value)}
                placeholder="Nhập lý do hoặc ghi chú nghiệp vụ..."
                style={{ minHeight: '90px' }}
              />
            </div>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <button
                className="btn btn-primary"
                disabled={!canApproveOrReject || isHandlingDecision}
                onClick={() => handleOrderDecision('approve')}
              >
                <CheckCircle2 size={16} /> {isHandlingDecision ? 'Đang xử lý...' : 'Phê duyệt đơn'}
              </button>
              <button
                className="btn btn-ghost"
                disabled={!canApproveOrReject || isHandlingDecision}
                onClick={() => handleOrderDecision('reject')}
              >
                <XCircle size={16} /> Từ chối đơn
              </button>
              <button
                className="btn btn-ghost"
                disabled={!canExportInvoice || isExportingInvoice}
                onClick={handleExportInvoice}
              >
                <FileText size={16} />
                {selectedInvoiceRef
                  ? `Đã có hóa đơn ${selectedInvoiceRef.invoiceNo || selectedInvoiceRef.id}`
                  : isExportingInvoice
                    ? 'Đang xuất hóa đơn...'
                    : 'Xuất hóa đơn'}
              </button>
              <a className="btn btn-ghost" href={buildAuditObjectHref('Order', selectedOrder.id)}>
                <History size={16} /> Xem audit log
              </a>
              {canDelete && String(selectedOrder.status || '').toUpperCase() !== 'ARCHIVED' && (
                <button
                  className="btn btn-danger"
                  disabled={isArchivingOrder}
                  onClick={handleArchiveOrder}
                >
                  <Trash2 size={16} /> {isArchivingOrder ? 'Đang lưu trữ...' : 'Lưu trữ đơn hàng'}
                </button>
              )}
            </div>
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isCreatePanelOpen}
        onClose={() => {
          if (isCreatingOrder) return;
          setIsCreatePanelOpen(false);
          setCreateOrderForm(makeInitialCreateCheckoutForm());
        }}
        title="Tạo đơn bán hàng"
      >
        <form onSubmit={handleCreateOrder} style={{ display: 'grid', gap: '1rem' }}>
          <div className="field">
            <label>Nhóm sản phẩm</label>
            <select value={createOrderForm.orderGroup} onChange={(event) => handleOrderGroupChange(event.target.value as CheckoutOrderGroup)}>
              <option value="INSURANCE">INSURANCE</option>
              <option value="TELECOM">TELECOM</option>
              <option value="DIGITAL">DIGITAL</option>
            </select>
          </div>

          <div className="field">
            <label>Template checkout</label>
            <select
              value={selectedTemplate?.code || ''}
              onChange={(event) => handleTemplateCodeChange(event.target.value)}
              disabled={isLoadingCheckoutConfig || currentGroupTemplates.length === 0}
            >
              {currentGroupTemplates.length === 0 ? <option value="">Chưa có template</option> : null}
              {currentGroupTemplates.map((template) => (
                <option key={template.code} value={template.code}>
                  {template.code} - {template.label}
                </option>
              ))}
            </select>
            {isLoadingCheckoutConfig ? <small className="muted">Đang tải template từ policy...</small> : null}
          </div>

          {selectedTemplate ? (
            <div style={{ border: '1px solid var(--line)', borderRadius: '8px', padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
              <strong style={{ fontSize: '0.95rem' }}>Field bắt buộc theo template</strong>
              {selectedTemplate.requiredFields.length === 0 ? <p className="muted" style={{ margin: 0 }}>Template không có field bắt buộc.</p> : null}
              {selectedTemplate.requiredFields.map((fieldKey) => {
                const fc = selectedTemplate.fieldConfig?.[fieldKey];
                const fieldLabel = fc?.label || formatTemplateFieldLabel(fieldKey);
                const fieldType = fc?.type || detectTemplateFieldInputType(fieldKey);
                const fieldOptions = fc?.options;

                if (fieldType === 'select' && fieldOptions && fieldOptions.length > 0) {
                  return (
                    <div className="field" key={fieldKey} style={{ marginBottom: 0 }}>
                      <label>{fieldLabel} *</label>
                      <select
                        required
                        value={createOrderForm.templateFields[fieldKey] ?? ''}
                        onChange={(event) => handleTemplateFieldChange(fieldKey, event.target.value)}
                      >
                        <option value="">-- Chọn --</option>
                        {fieldOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                if (fieldType === 'checkbox') {
                  return (
                    <div className="field" key={fieldKey} style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id={`ops-tpl-${fieldKey}`}
                        checked={createOrderForm.templateFields[fieldKey] === 'true'}
                        onChange={(event) => handleTemplateFieldChange(fieldKey, event.target.checked ? 'true' : 'false')}
                        style={{ width: 'auto' }}
                      />
                      <label htmlFor={`ops-tpl-${fieldKey}`} style={{ margin: 0 }}>{fieldLabel}</label>
                    </div>
                  );
                }

                if (fieldType === 'file') {
                  return (
                    <div className="field" key={fieldKey} style={{ marginBottom: 0 }}>
                      <label>{fieldLabel} *</label>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleFileUpload(fieldKey, file);
                        }}
                      />
                      {createOrderForm.templateFields[fieldKey] ? (
                        <small className="muted">✅ File ID: {createOrderForm.templateFields[fieldKey]}</small>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <div className="field" key={fieldKey} style={{ marginBottom: 0 }}>
                    <label>{fieldLabel} *</label>
                    <input
                      type={fieldType}
                      required
                      value={createOrderForm.templateFields[fieldKey] ?? ''}
                      onChange={(event) => handleTemplateFieldChange(fieldKey, event.target.value)}
                      placeholder={fieldKey}
                    />
                  </div>
                );
              })}

              {/* Render optional non-required fields from fieldConfig */}
              {Object.entries(selectedTemplate.fieldConfig ?? {}).filter(([key]) => !selectedTemplate.requiredFields.includes(key)).map(([fieldKey, fc]) => {
                const fieldLabel = fc?.label || formatTemplateFieldLabel(fieldKey);
                const fieldType = fc?.type || 'text';

                if (fieldType === 'checkbox') {
                  return (
                    <div className="field" key={fieldKey} style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id={`ops-tpl-${fieldKey}`}
                        checked={createOrderForm.templateFields[fieldKey] === 'true'}
                        onChange={(event) => handleTemplateFieldChange(fieldKey, event.target.checked ? 'true' : 'false')}
                        style={{ width: 'auto' }}
                      />
                      <label htmlFor={`ops-tpl-${fieldKey}`} style={{ margin: 0 }}>{fieldLabel}</label>
                    </div>
                  );
                }

                if (fieldType === 'file') {
                  return (
                    <div className="field" key={fieldKey} style={{ marginBottom: 0 }}>
                      <label>{fieldLabel}</label>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleFileUpload(fieldKey, file);
                        }}
                      />
                      {createOrderForm.templateFields[fieldKey] ? (
                        <small className="muted">✅ File ID: {createOrderForm.templateFields[fieldKey]}</small>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <div className="field" key={fieldKey} style={{ marginBottom: 0 }}>
                    <label>{fieldLabel}</label>
                    <input
                      type={fieldType}
                      value={createOrderForm.templateFields[fieldKey] ?? ''}
                      onChange={(event) => handleTemplateFieldChange(fieldKey, event.target.value)}
                      placeholder={fieldKey}
                    />
                  </div>
                );
              })}

              {/* Auto-computed effectiveTo */}
              {createOrderForm.templateFields.effectiveTo ? (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Ngày hết hiệu lực (tự tính, cho phép sửa)</label>
                  <input
                    type="date"
                    value={createOrderForm.templateFields.effectiveTo ?? ''}
                    onChange={(event) => handleTemplateFieldChange('effectiveTo', event.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="field">
            <label>Customer name *</label>
            <input
              required
              value={createOrderForm.customerName}
              onChange={(event) => setCreateOrderForm((prev) => ({ ...prev, customerName: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>Customer ID</label>
            <input
              value={createOrderForm.customerId}
              onChange={(event) => setCreateOrderForm((prev) => ({ ...prev, customerId: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>Employee ID</label>
            <input
              value={createOrderForm.employeeId}
              onChange={(event) => setCreateOrderForm((prev) => ({ ...prev, employeeId: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>Created By</label>
            <input
              value={createOrderForm.createdBy}
              onChange={(event) => setCreateOrderForm((prev) => ({ ...prev, createdBy: event.target.value }))}
            />
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Dòng dịch vụ / sản phẩm</h4>
              <button type="button" className="btn btn-ghost" onClick={handleAddItem}><Plus size={14} /> Thêm dòng</button>
            </div>
            {createOrderForm.items.map((item, index) => (
              <div key={`item-${index}`} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                <div className="field">
                  <label>Product name</label>
                  <input
                    value={item.productName}
                    onChange={(event) => handleUpdateItem(index, 'productName', event.target.value)}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Quantity</label>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) => handleUpdateItem(index, 'quantity', event.target.value)}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Unit Price</label>
                    <input
                      type="number"
                      min={0}
                      value={item.unitPrice}
                      onChange={(event) => handleUpdateItem(index, 'unitPrice', event.target.value)}
                    />
                  </div>
                  <button type="button" className="btn btn-ghost" style={{ alignSelf: 'end' }} onClick={() => handleRemoveItem(index)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={isCreatingOrder} style={{ flex: 1 }}>
              {isCreatingOrder ? 'Đang tạo...' : 'Tạo đơn nháp (DRAFT)'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => {
                if (isCreatingOrder) return;
                setIsCreatePanelOpen(false);
                setCreateOrderForm(makeInitialCreateCheckoutForm());
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
