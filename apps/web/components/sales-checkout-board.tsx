'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizePagedListPayload } from '../lib/api-client';
import { isStrictDateTimeLocal, isStrictIsoDate, parseFiniteNumber } from '../lib/form-validation';
import { formatRuntimeCurrency, formatRuntimeDateTime } from '../lib/runtime-format';
import { useAccessPolicy } from './access-policy-context';
import { useUserRole } from './user-role-context';
import { Badge, statusToBadge } from './ui';

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

type ResolvedTemplateFieldType = 'text' | 'date' | 'number' | 'tel' | 'checkbox' | 'file' | 'select';

type CheckoutConfigResponse = {
  checkoutTemplates?: Record<CheckoutOrderGroup, CheckoutTemplateConfig[]>;
  paymentPolicy?: {
    partialPaymentEnabled?: boolean;
    overrideRoles?: string[];
  };
  activationPolicy?: Record<CheckoutOrderGroup, string>;
  invoiceAutomation?: Record<CheckoutOrderGroup, { trigger?: string; requireFullPayment?: boolean }>;
};

type CheckoutOrderListItem = {
  id: string;
  orderNo?: string | null;
  orderGroup?: CheckoutOrderGroup | null;
  checkoutStatus?: string | null;
  customerName?: string | null;
  totalAmount?: number | string | null;
  createdAt?: string | null;
};

type CheckoutOrderItem = {
  id: string;
  productName?: string | null;
  quantity?: number | null;
  unitPrice?: number | string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  activationStatus?: string | null;
  activatedAt?: string | null;
  activationRef?: string | null;
};

type CheckoutOrderDetail = {
  id: string;
  orderNo?: string | null;
  orderGroup?: CheckoutOrderGroup | null;
  checkoutStatus?: string | null;
  customerName?: string | null;
  totalAmount?: number | string | null;
  createdAt?: string | null;
  items?: CheckoutOrderItem[];
  paymentIntents?: CheckoutPaymentIntent[];
  invoices?: Array<{
    id: string;
    invoiceNo?: string | null;
    status?: string | null;
    createdAt?: string | null;
  }>;
};

type CheckoutPaymentIntent = {
  id: string;
  intentCode?: string | null;
  amountLocked?: number | string | null;
  paidAmount?: number | string | null;
  remainingAmount?: number | string | null;
  status?: string | null;
  qrPayload?: string | null;
  qrActive?: boolean | null;
  updatedAt?: string | null;
  transactions?: Array<{
    id: string;
    transactionRef?: string | null;
    amount?: number | string | null;
    status?: string | null;
    source?: string | null;
    note?: string | null;
    createdAt?: string | null;
  }>;
  overrides?: Array<{
    id: string;
    overrideBy?: string | null;
    overrideRole?: string | null;
    reason?: string | null;
    reference?: string | null;
    amount?: number | string | null;
    note?: string | null;
    createdAt?: string | null;
  }>;
};

type CheckoutCreateItemForm = {
  productName: string;
  quantity: number;
  unitPrice: number;
};

type CheckoutCreateForm = {
  orderGroup: CheckoutOrderGroup;
  templateCode: string;
  templateFields: Record<string, string>;
  customerName: string;
  customerId: string;
  employeeId: string;
  createdBy: string;
  items: CheckoutCreateItemForm[];
};

type PaymentOverrideForm = {
  reason: string;
  reference: string;
  amount: string;
};

type ActivationDraft = {
  effectiveFrom: string;
  effectiveTo: string;
  activationRef: string;
};

const EMPTY_OVERRIDE_FORM: PaymentOverrideForm = {
  reason: 'Webhook timeout fallback',
  reference: '',
  amount: ''
};

function toCurrency(value: number | string | null | undefined) {
  return formatRuntimeCurrency(Number(value || 0));
}

function toDateTime(value: string | null | undefined) {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatRuntimeDateTime(parsed.toISOString());
}

function makeEmptyCreateItem(): CheckoutCreateItemForm {
  return {
    productName: '',
    quantity: 1,
    unitPrice: 0
  };
}

function makeInitialCreateForm(): CheckoutCreateForm {
  return {
    orderGroup: 'INSURANCE',
    templateCode: '',
    templateFields: {},
    customerName: '',
    customerId: '',
    employeeId: '',
    createdBy: '',
    items: [makeEmptyCreateItem()]
  };
}

function toDateTimeLocalInput(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalInput(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (!isStrictDateTimeLocal(normalized)) return undefined;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function formatTemplateFieldLabel(key: string) {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const FIELD_TYPE_MAP: Record<string, 'text' | 'date' | 'number' | 'tel' | 'checkbox' | 'file' | 'select'> = {
  // Insurance
  certificateFileId: 'file',
  certificateLink: 'text',
  requestedEffectiveDate: 'date',
  // Telecom
  billingCycle: 'select',
  effectiveFrom: 'date',
  effectiveTo: 'date',
  servicePhone: 'tel',
  differentServicePhone: 'checkbox',
  startDate: 'date',
  // Digital
  planCode: 'text',
  termDays: 'number',
  // Common
  packageCode: 'text',
};

function detectTemplateFieldInputType(key: string): 'text' | 'date' | 'number' | 'tel' | 'checkbox' | 'file' {
  // 1) Check static map first
  const mapped = FIELD_TYPE_MAP[key];
  if (mapped && mapped !== 'select') return mapped;

  // 2) Pattern-based fallback
  const lower = key.toLowerCase();
  if (lower.includes('phone') || lower.includes('mobile')) return 'tel';
  if (lower.includes('date') || lower.endsWith('at') || lower.includes('time')) return 'date';
  if (lower.endsWith('fileid') || lower.endsWith('file')) return 'file';
  if (
    lower.includes('day') || lower.includes('term') || lower.includes('amount')
    || lower.includes('price') || lower.includes('qty') || lower.includes('quantity')
    || lower.includes('limit') || lower.includes('count') || lower.includes('seat')
  ) return 'number';
  return 'text';
}

function addDaysToIsoDate(dateValue: string, days: number) {
  const [yearRaw, monthRaw, dayRaw] = dateValue.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function resolveTemplateFieldType(fieldKey: string, template: CheckoutTemplateConfig | null): ResolvedTemplateFieldType {
  const configuredType = template?.fieldConfig?.[fieldKey]?.type;
  if (configuredType) {
    return configuredType;
  }
  return detectTemplateFieldInputType(fieldKey);
}

function validateTemplateFieldInput(fieldLabel: string, fieldType: ResolvedTemplateFieldType, value: string) {
  if (fieldType === 'number') {
    return parseFiniteNumber(value) === null ? `${fieldLabel}: giá trị số không hợp lệ.` : null;
  }
  if (fieldType === 'date') {
    return isStrictIsoDate(value) ? null : `${fieldLabel}: ngày không hợp lệ (YYYY-MM-DD).`;
  }
  return null;
}

function parseTemplateFieldValue(fieldType: ResolvedTemplateFieldType, value: string): string | number {
  const normalized = value.trim();
  if (fieldType === 'number') {
    const parsed = parseFiniteNumber(normalized);
    if (parsed !== null) {
      return parsed;
    }
  }
  return normalized;
}

function areTemplateFieldMapsEqual(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => (left[key] ?? '') === (right[key] ?? ''));
}

export function SalesCheckoutBoard() {
  const { canModule, canAction } = useAccessPolicy();
  const { role } = useUserRole();
  const canView = canModule('sales');
  const canCreate = canAction('sales', 'CREATE');
  const canOverridePayment = role === 'ADMIN';

  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfigResponse | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  const [orders, setOrders] = useState<CheckoutOrderListItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<CheckoutOrderDetail | null>(null);
  const [selectedIntent, setSelectedIntent] = useState<CheckoutPaymentIntent | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [isApplyingAction, setIsApplyingAction] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CheckoutCreateForm>(makeInitialCreateForm());
  const [overrideForm, setOverrideForm] = useState<PaymentOverrideForm>(EMPTY_OVERRIDE_FORM);
  const [activationDrafts, setActivationDrafts] = useState<Record<string, ActivationDraft>>({});

  const activeIntent = selectedIntent || selectedOrder?.paymentIntents?.[0] || null;
  const pendingActivationLines = useMemo(
    () => (selectedOrder?.items ?? []).filter((item) => String(item.activationStatus || '').toUpperCase() !== 'COMPLETED'),
    [selectedOrder]
  );
  const activeIntentTransactions = activeIntent?.transactions ?? [];
  const activeIntentOverrides = activeIntent?.overrides ?? [];
  const transactionStats = useMemo(() => {
    const total = activeIntentTransactions.length;
    const applied = activeIntentTransactions.filter((item) => String(item.status || '').toUpperCase() === 'APPLIED').length;
    const duplicate = activeIntentTransactions.filter((item) => String(item.status || '').toUpperCase() === 'DUPLICATE').length;
    const rejected = activeIntentTransactions.filter((item) => String(item.status || '').toUpperCase() === 'REJECTED').length;
    const latestAnomaly = activeIntentTransactions.find((item) => {
      const status = String(item.status || '').toUpperCase();
      return status === 'REJECTED' || status === 'DUPLICATE';
    });
    return {
      total,
      applied,
      duplicate,
      rejected,
      latestAnomalyReason: latestAnomaly?.note || null
    };
  }, [activeIntentTransactions]);

  const currentGroupTemplates = useMemo(
    () => checkoutConfig?.checkoutTemplates?.[createForm.orderGroup] ?? [],
    [checkoutConfig, createForm.orderGroup]
  );

  const selectedTemplate = useMemo(() => {
    if (currentGroupTemplates.length === 0) {
      return null;
    }
    return currentGroupTemplates.find((item) => item.code === createForm.templateCode) ?? currentGroupTemplates[0] ?? null;
  }, [currentGroupTemplates, createForm.templateCode]);

  const ensureTemplateSelection = (orderGroup: CheckoutOrderGroup, currentCode: string, currentFields: Record<string, string>) => {
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

  const loadCheckoutConfig = async () => {
    if (!canView) return;
    setIsLoadingConfig(true);
    try {
      const payload = await apiRequest<CheckoutConfigResponse>('/sales/checkout/config');
      setCheckoutConfig(payload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? `Tải cấu hình checkout thất bại: ${error.message}` : 'Tải cấu hình checkout thất bại.');
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const loadCheckoutOrders = async () => {
    if (!canView) return;
    setIsLoadingOrders(true);
    try {
      const payload = await apiRequest<unknown>('/sales/orders', {
        query: {
          limit: 80,
          sortBy: 'createdAt',
          sortDir: 'desc'
        }
      });
      const normalized = normalizePagedListPayload<CheckoutOrderListItem>(payload);
      const checkoutRows = normalized.items.filter((item) => Boolean(item.orderGroup));
      setOrders(checkoutRows);
      if (!selectedOrderId && checkoutRows.length > 0) {
        setSelectedOrderId(checkoutRows[0].id);
      }
      if (selectedOrderId && !checkoutRows.some((row) => row.id === selectedOrderId)) {
        setSelectedOrderId(checkoutRows[0]?.id ?? null);
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? `Tải danh sách checkout thất bại: ${error.message}` : 'Tải danh sách checkout thất bại.');
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const loadCheckoutDetail = async (orderId: string) => {
    setIsLoadingDetail(true);
    try {
      const [orderPayload, intentPayload] = await Promise.all([
        apiRequest<CheckoutOrderDetail>(`/sales/checkout/orders/${orderId}`),
        apiRequest<CheckoutPaymentIntent>(`/sales/checkout/orders/${orderId}/payment-intent`)
      ]);
      setSelectedOrder(orderPayload);
      setSelectedIntent(intentPayload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? `Tải chi tiết checkout thất bại: ${error.message}` : 'Tải chi tiết checkout thất bại.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  useEffect(() => {
    void loadCheckoutConfig();
    void loadCheckoutOrders();
  }, [canView]);

  useEffect(() => {
    if (!checkoutConfig) return;
    setCreateForm((prev) => {
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
  }, [checkoutConfig, createForm.orderGroup]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrder(null);
      setSelectedIntent(null);
      return;
    }
    setActivationDrafts({});
    void loadCheckoutDetail(selectedOrderId);
  }, [selectedOrderId]);

  useEffect(() => {
    if (!selectedOrderId) return;
    const timer = window.setInterval(() => {
      void loadCheckoutDetail(selectedOrderId);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [selectedOrderId]);

  if (!canView) {
    return null;
  }

  const handleCreateCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate || isSubmittingCreate) return;

    const normalizedItems = createForm.items
      .map((item) => ({
        productName: item.productName.trim(),
        quantity: parseFiniteNumber(String(item.quantity)) ?? 0,
        unitPrice: parseFiniteNumber(String(item.unitPrice)) ?? 0
      }))
      .filter((item) => item.productName && item.quantity > 0 && item.unitPrice > 0);

    if (!selectedTemplate) {
      setErrorMessage(`Tạo checkout thất bại: chưa cấu hình template cho nhóm ${createForm.orderGroup}.`);
      return;
    }

    if (!createForm.customerName.trim()) {
      setErrorMessage('Tạo checkout thất bại: cần nhập customer name.');
      return;
    }
    if (normalizedItems.length === 0) {
      setErrorMessage('Tạo checkout thất bại: cần tối thiểu 1 dòng dịch vụ hợp lệ.');
      return;
    }

    const templatePayload: Record<string, unknown> = {};
    for (const fieldKey of selectedTemplate.requiredFields) {
      const rawValue = (createForm.templateFields[fieldKey] ?? '').trim();
      if (!rawValue) {
        setErrorMessage(`Tạo checkout thất bại: thiếu field bắt buộc ${fieldKey}.`);
        return;
      }
      const fieldLabel = selectedTemplate.fieldConfig?.[fieldKey]?.label || formatTemplateFieldLabel(fieldKey);
      const fieldType = resolveTemplateFieldType(fieldKey, selectedTemplate);
      const validationError = validateTemplateFieldInput(fieldLabel, fieldType, rawValue);
      if (validationError) {
        setErrorMessage(`Tạo checkout thất bại: ${validationError}`);
        return;
      }
      templatePayload[fieldKey] = parseTemplateFieldValue(fieldType, rawValue);
    }

    setIsSubmittingCreate(true);
    setErrorMessage(null);
    setResultMessage(null);
    try {
      const created = await apiRequest<CheckoutOrderDetail>('/sales/checkout/orders', {
        method: 'POST',
        body: {
          orderGroup: createForm.orderGroup,
          templateCode: selectedTemplate.code,
          templateFields: templatePayload,
          customerName: createForm.customerName || undefined,
          customerId: createForm.customerId || undefined,
          employeeId: createForm.employeeId || undefined,
          createdBy: createForm.createdBy || undefined,
          items: normalizedItems
        }
      });

      setResultMessage(`Đã tạo đơn nháp ${created.orderNo || created.id.slice(-8)}. Bấm "Gửi đơn" để chuyển sang chờ thanh toán.`);
      setCreateForm(makeInitialCreateForm());
      await loadCheckoutOrders();
      setSelectedOrderId(created.id);
      await loadCheckoutDetail(created.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? `Tạo checkout thất bại: ${error.message}` : 'Tạo checkout thất bại.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleUpdateCreateItem = (index: number, key: keyof CheckoutCreateItemForm, value: string) => {
    setCreateForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (key === 'quantity') {
          const parsed = parseFiniteNumber(value);
          return {
            ...item,
            quantity: parsed === null ? 0 : Math.max(0, Math.trunc(parsed))
          };
        }
        if (key === 'unitPrice') {
          const parsed = parseFiniteNumber(value);
          return {
            ...item,
            unitPrice: parsed === null ? 0 : Math.max(0, parsed)
          };
        }
        return {
          ...item,
          [key]: value
        };
      })
    }));
  };

  const handleAddCreateItem = () => {
    setCreateForm((prev) => ({
      ...prev,
      items: [...prev.items, makeEmptyCreateItem()]
    }));
  };

  const handleRemoveCreateItem = (index: number) => {
    setCreateForm((prev) => {
      const nextItems = prev.items.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...prev,
        items: nextItems.length > 0 ? nextItems : [makeEmptyCreateItem()]
      };
    });
  };

  const handleTemplateFieldChange = (fieldKey: string, value: string) => {
    setCreateForm((prev) => {
      const nextFields = {
        ...prev.templateFields,
        [fieldKey]: value
      };

      // Auto-compute effectiveTo from duration + start date
      // Supports: termDays+startDate (Digital), termDays+requestedEffectiveDate (legacy), billingCycle+effectiveFrom (Telecom)
      const durationKeys = ['termDays', 'billingCycle'];
      const startDateKeys = ['startDate', 'requestedEffectiveDate', 'effectiveFrom'];
      const isDurationUpdate = durationKeys.includes(fieldKey);
      const isStartUpdate = startDateKeys.includes(fieldKey);

      if (isDurationUpdate || isStartUpdate) {
        const durationValue = isDurationUpdate
          ? value
          : (nextFields.billingCycle ?? nextFields.termDays ?? '');
        const startDateValue = isStartUpdate
          ? value
          : (nextFields.effectiveFrom ?? nextFields.startDate ?? nextFields.requestedEffectiveDate ?? '');

        const parsedDays = parseFiniteNumber(durationValue);
        if (
          parsedDays !== null
          && Number.isInteger(parsedDays)
          && parsedDays > 0
          && isStrictIsoDate(startDateValue)
        ) {
          nextFields.effectiveTo = addDaysToIsoDate(startDateValue, parsedDays);
        } else if (isDurationUpdate || isStartUpdate) {
          delete nextFields.effectiveTo;
        }
      }

      return {
        ...prev,
        templateFields: nextFields
      };
    });
  };

  const handleOrderGroupChange = (group: CheckoutOrderGroup) => {
    setCreateForm((prev) => {
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
    setCreateForm((prev) => {
      const { nextCode, nextFields } = ensureTemplateSelection(prev.orderGroup, templateCode, prev.templateFields);
      return {
        ...prev,
        templateCode: nextCode,
        templateFields: nextFields
      };
    });
  };

  const handlePaymentOverride = async () => {
    if (!canOverridePayment || !selectedOrderId || isApplyingAction) return;
    const reason = overrideForm.reason.trim();
    const reference = overrideForm.reference.trim();
    const amountRaw = overrideForm.amount.trim();
    const amount = amountRaw ? parseFiniteNumber(amountRaw) : null;

    if (!reason) {
      setErrorMessage('Override thanh toán thất bại: thiếu reason.');
      return;
    }
    if (!reference) {
      setErrorMessage('Override thanh toán thất bại: thiếu reference.');
      return;
    }
    if (amountRaw && (amount === null || amount <= 0)) {
      setErrorMessage('Override thanh toán thất bại: số tiền không hợp lệ.');
      return;
    }

    setIsApplyingAction(true);
    setErrorMessage(null);
    setResultMessage(null);
    try {
      await apiRequest(`/sales/checkout/orders/${selectedOrderId}/payment-overrides`, {
        method: 'POST',
        body: {
          reason,
          reference,
          amount: amount ?? undefined
        }
      });
      setResultMessage('Đã áp dụng payment override.');
      setOverrideForm(EMPTY_OVERRIDE_FORM);
      await loadCheckoutDetail(selectedOrderId);
      await loadCheckoutOrders();
    } catch (error) {
      setErrorMessage(error instanceof Error ? `Override thanh toán thất bại: ${error.message}` : 'Override thanh toán thất bại.');
    } finally {
      setIsApplyingAction(false);
    }
  };

  const getActivationDraft = (line: CheckoutOrderItem): ActivationDraft => {
    return activationDrafts[line.id] ?? {
      effectiveFrom: toDateTimeLocalInput(line.effectiveFrom),
      effectiveTo: toDateTimeLocalInput(line.effectiveTo),
      activationRef: line.activationRef || ''
    };
  };

  const handleActivationDraftChange = (lineId: string, key: keyof ActivationDraft, value: string) => {
    setActivationDrafts((prev) => {
      const existing = prev[lineId] ?? {
        effectiveFrom: '',
        effectiveTo: '',
        activationRef: ''
      };
      return {
        ...prev,
        [lineId]: {
          ...existing,
          [key]: value
        }
      };
    });
  };

  const handleActivationComplete = async (line: CheckoutOrderItem) => {
    if (!selectedOrderId || isApplyingAction) return;

    const draft = getActivationDraft(line);
    const effectiveFrom = fromDateTimeLocalInput(draft.effectiveFrom);
    const effectiveTo = fromDateTimeLocalInput(draft.effectiveTo);

    if (draft.effectiveFrom && !effectiveFrom) {
      setErrorMessage('Complete activation thất bại: effectiveFrom không hợp lệ.');
      return;
    }
    if (draft.effectiveTo && !effectiveTo) {
      setErrorMessage('Complete activation thất bại: effectiveTo không hợp lệ.');
      return;
    }

    setIsApplyingAction(true);
    setErrorMessage(null);
    setResultMessage(null);
    try {
      await apiRequest(`/sales/checkout/orders/${selectedOrderId}/activation-lines/${line.id}/complete`, {
        method: 'POST',
        body: {
          effectiveFrom,
          effectiveTo,
          activationRef: draft.activationRef.trim() || undefined
        }
      });
      setResultMessage('Đã hoàn tất activation line.');
      await loadCheckoutDetail(selectedOrderId);
      await loadCheckoutOrders();
    } catch (error) {
      setErrorMessage(error instanceof Error ? `Complete activation thất bại: ${error.message}` : 'Complete activation thất bại.');
    } finally {
      setIsApplyingAction(false);
    }
  };

  const handleReEvaluateInvoice = async () => {
    if (!selectedOrderId || isApplyingAction) return;
    setIsApplyingAction(true);
    setErrorMessage(null);
    setResultMessage(null);
    try {
      await apiRequest(`/sales/checkout/orders/${selectedOrderId}/invoice-actions/re-evaluate`, {
        method: 'POST',
        body: {
          force: true,
          reason: 'manual_recheck_from_ui'
        }
      });
      setResultMessage('Đã chạy re-evaluate hóa đơn.');
      await loadCheckoutDetail(selectedOrderId);
      await loadCheckoutOrders();
    } catch (error) {
      setErrorMessage(error instanceof Error ? `Re-evaluate hóa đơn thất bại: ${error.message}` : 'Re-evaluate hóa đơn thất bại.');
    } finally {
      setIsApplyingAction(false);
    }
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

  const handleSubmitDraft = async () => {
    if (!selectedOrderId || isApplyingAction) return;
    setIsApplyingAction(true);
    setErrorMessage(null);
    setResultMessage(null);
    try {
      const result = await apiRequest<CheckoutOrderDetail>(`/sales/checkout/orders/${selectedOrderId}/submit`, {
        method: 'POST',
        body: {}
      });
      setResultMessage(`Đã gửi đơn ${result.orderNo || result.id.slice(-8)}. Trạng thái: PENDING_PAYMENT.`);
      await loadCheckoutDetail(selectedOrderId);
      await loadCheckoutOrders();
    } catch (error) {
      setErrorMessage(error instanceof Error ? `Gửi đơn thất bại: ${error.message}` : 'Gửi đơn thất bại.');
    } finally {
      setIsApplyingAction(false);
    }
  };

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div className="finance-status-card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Sale Checkout v1</h3>
        <p className="muted" style={{ marginTop: '0.35rem' }}>
          Luồng chung cho INSURANCE/TELECOM/DIGITAL: tạo order checkout, theo dõi intent, override có kiểm soát, activation line và invoice re-evaluate.
        </p>
      </div>

      {errorMessage ? (
        <div className="finance-alert finance-alert-danger" style={{ marginBottom: '0.8rem' }}>
          <strong>Lỗi:</strong> {errorMessage}
        </div>
      ) : null}
      {resultMessage ? (
        <div className="finance-alert finance-alert-success" style={{ marginBottom: '0.8rem' }}>
          <strong>Thành công:</strong> {resultMessage}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1.1fr 1fr' }}>
        <form onSubmit={handleCreateCheckout} className="finance-status-card" style={{ display: 'grid', gap: '0.65rem' }}>
          <h4 style={{ margin: 0 }}>1) Tạo Sale Checkout</h4>
          <div className="field">
            <label>Nhóm sản phẩm</label>
            <select value={createForm.orderGroup} onChange={(event) => handleOrderGroupChange(event.target.value as CheckoutOrderGroup)}>
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
              disabled={isLoadingConfig || currentGroupTemplates.length === 0}
            >
              {currentGroupTemplates.length === 0 ? <option value="">Chưa có template</option> : null}
              {currentGroupTemplates.map((template) => (
                <option key={template.code} value={template.code}>
                  {template.code} - {template.label}
                </option>
              ))}
            </select>
            {isLoadingConfig ? <small className="muted">Đang tải template từ policy...</small> : null}
          </div>

          {selectedTemplate ? (
            <div style={{ border: '1px solid var(--line)', borderRadius: '8px', padding: '0.6rem', display: 'grid', gap: '0.45rem' }}>
              <strong style={{ fontSize: '0.95rem' }}>Thông tin bắt buộc</strong>
              {selectedTemplate.requiredFields.length === 0 ? <p className="muted" style={{ margin: 0 }}>Template không có field bắt buộc.</p> : null}
              {selectedTemplate.requiredFields.map((fieldKey) => {
                const fc = selectedTemplate.fieldConfig?.[fieldKey];
                const fieldLabel = fc?.label || formatTemplateFieldLabel(fieldKey);
                const fieldType = fc?.type || detectTemplateFieldInputType(fieldKey);
                const fieldOptions = fc?.options;

                // Always render select if options are available (regardless of declared type)
                if (fieldOptions && fieldOptions.length > 0) {
                  return (
                    <div className="field" key={fieldKey} style={{ marginBottom: 0 }}>
                      <label>{fieldLabel} *</label>
                      <select
                        required
                        value={createForm.templateFields[fieldKey] ?? ''}
                        onChange={(event) => handleTemplateFieldChange(fieldKey, event.target.value)}
                      >
                        <option value="">-- Chọn --</option>
                        {fieldOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt} ngày</option>
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
                        id={`tpl-${fieldKey}`}
                        checked={createForm.templateFields[fieldKey] === 'true'}
                        onChange={(event) => handleTemplateFieldChange(fieldKey, event.target.checked ? 'true' : 'false')}
                        style={{ width: 'auto' }}
                      />
                      <label htmlFor={`tpl-${fieldKey}`} style={{ margin: 0 }}>{fieldLabel}</label>
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
                      {createForm.templateFields[fieldKey] ? (
                        <small className="muted">✅ File ID: {createForm.templateFields[fieldKey]}</small>
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
                      value={createForm.templateFields[fieldKey] ?? ''}
                      onChange={(event) => handleTemplateFieldChange(fieldKey, event.target.value)}
                      placeholder={fieldLabel}
                    />
                  </div>
                );
              })}

              {/* Render optional non-required fields from fieldConfig with conditional visibility */}
              {Object.entries(selectedTemplate.fieldConfig ?? {}).filter(([key]) => !selectedTemplate.requiredFields.includes(key)).map(([fieldKey, fc]) => {
                const fieldLabel = fc?.label || formatTemplateFieldLabel(fieldKey);
                const fieldType = fc?.type || detectTemplateFieldInputType(fieldKey);
                const fieldOptions = fc?.options;

                // Conditional visibility: servicePhone only shown when differentServicePhone is checked
                if (fieldKey === 'servicePhone' && createForm.templateFields.differentServicePhone !== 'true') {
                  return null;
                }

                if (fieldType === 'checkbox') {
                  return (
                    <div className="field" key={fieldKey} style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id={`tpl-${fieldKey}`}
                        checked={createForm.templateFields[fieldKey] === 'true'}
                        onChange={(event) => handleTemplateFieldChange(fieldKey, event.target.checked ? 'true' : 'false')}
                        style={{ width: 'auto' }}
                      />
                      <label htmlFor={`tpl-${fieldKey}`} style={{ margin: 0 }}>{fieldLabel}</label>
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
                      {createForm.templateFields[fieldKey] ? (
                        <small className="muted">✅ File ID: {createForm.templateFields[fieldKey]}</small>
                      ) : null}
                    </div>
                  );
                }

                // Render select if options exist
                if (fieldOptions && fieldOptions.length > 0) {
                  return (
                    <div className="field" key={fieldKey} style={{ marginBottom: 0 }}>
                      <label>{fieldLabel}</label>
                      <select
                        value={createForm.templateFields[fieldKey] ?? ''}
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

                return (
                  <div className="field" key={fieldKey} style={{ marginBottom: 0 }}>
                    <label>{fieldLabel}</label>
                    <input
                      type={fieldType}
                      value={createForm.templateFields[fieldKey] ?? ''}
                      onChange={(event) => handleTemplateFieldChange(fieldKey, event.target.value)}
                      placeholder={fieldLabel}
                    />
                  </div>
                );
              })}

              {/* Auto-computed effectiveTo (from billingCycle+effectiveFrom or termDays+startDate) */}
              {createForm.templateFields.effectiveTo ? (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>📅 Hiệu lực đến (tự tính từ chu kỳ, cho phép sửa)</label>
                  <input
                    type="date"
                    value={createForm.templateFields.effectiveTo ?? ''}
                    onChange={(event) => handleTemplateFieldChange('effectiveTo', event.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="field">
            <label>Customer name *</label>
            <input required value={createForm.customerName} onChange={(event) => setCreateForm((prev) => ({ ...prev, customerName: event.target.value }))} />
          </div>
          <div className="field">
            <label>Customer ID</label>
            <input value={createForm.customerId} onChange={(event) => setCreateForm((prev) => ({ ...prev, customerId: event.target.value }))} />
          </div>
          <div className="field">
            <label>Employee ID</label>
            <input value={createForm.employeeId} onChange={(event) => setCreateForm((prev) => ({ ...prev, employeeId: event.target.value }))} />
          </div>
          <div className="field">
            <label>Created By</label>
            <input value={createForm.createdBy} onChange={(event) => setCreateForm((prev) => ({ ...prev, createdBy: event.target.value }))} />
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.6rem', display: 'grid', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Dòng dịch vụ</strong>
              <button type="button" className="btn btn-ghost" onClick={handleAddCreateItem}>+ Thêm dòng</button>
            </div>
            {createForm.items.map((item, index) => (
              <div key={`checkout-item-${index}`} style={{ display: 'grid', gap: '0.45rem', border: '1px solid var(--line)', borderRadius: '8px', padding: '0.5rem' }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Tên dịch vụ</label>
                  <input value={item.productName} onChange={(event) => handleUpdateCreateItem(index, 'productName', event.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Số lượng</label>
                    <input type="number" min={1} value={item.quantity} onChange={(event) => handleUpdateCreateItem(index, 'quantity', event.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Đơn giá</label>
                    <input type="number" min={0} value={item.unitPrice} onChange={(event) => handleUpdateCreateItem(index, 'unitPrice', event.target.value)} />
                  </div>
                  <button type="button" className="btn btn-ghost" style={{ alignSelf: 'end' }} onClick={() => handleRemoveCreateItem(index)}>
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button type="submit" className="btn btn-primary" disabled={!canCreate || isSubmittingCreate || !selectedTemplate}>
            {isSubmittingCreate ? 'Đang tạo...' : 'Tạo đơn nháp (DRAFT)'}
          </button>
        </form>

        <div className="finance-status-card" style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>2) Theo dõi thanh toán & activation</h4>
            <button type="button" className="btn btn-ghost" onClick={() => void loadCheckoutOrders()}>
              Refresh
            </button>
          </div>
          {isLoadingOrders ? <p className="muted">Đang tải checkout orders...</p> : null}
          {!isLoadingOrders && orders.length === 0 ? <p className="muted">Chưa có checkout order.</p> : null}
          {orders.length > 0 ? (
            <div className="table-wrap" style={{ maxHeight: '280px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Group</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((row) => (
                    <tr
                      key={row.id}
                      className={selectedOrderId === row.id ? 'table-row-selected' : ''}
                      onClick={() => setSelectedOrderId(row.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{row.orderNo || row.id.slice(-8)}</td>
                      <td>{row.orderGroup || '--'}</td>
                      <td><Badge variant={statusToBadge(row.checkoutStatus)}>{row.checkoutStatus || '--'}</Badge></td>
                      <td>{toCurrency(row.totalAmount)}</td>
                      <td>{toDateTime(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      {selectedOrder ? (
        <div className="finance-status-card" style={{ marginTop: '1rem', display: 'grid', gap: '0.7rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>
              Checkout detail: {selectedOrder.orderNo || selectedOrder.id.slice(-8)}
            </h4>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Badge variant={statusToBadge(selectedOrder.checkoutStatus)}>{selectedOrder.checkoutStatus || '--'}</Badge>
              {selectedOrder.checkoutStatus === 'DRAFT' ? (
                <button type="button" className="btn btn-primary" disabled={isApplyingAction} onClick={handleSubmitDraft} style={{ fontSize: '0.85rem', padding: '0.3rem 0.8rem' }}>
                  {isApplyingAction ? 'Đang gửi...' : '📤 Gửi đơn'}
                </button>
              ) : null}
            </div>
          </div>
          {isLoadingDetail ? <p className="muted">Đang đồng bộ trạng thái realtime...</p> : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.75rem' }}>
            <div>
              <p className="muted" style={{ marginBottom: '0.25rem' }}>Khách hàng</p>
              <p style={{ margin: 0 }}>{selectedOrder.customerName || '--'}</p>
            </div>
            <div>
              <p className="muted" style={{ marginBottom: '0.25rem' }}>Tổng tiền</p>
              <p style={{ margin: 0 }}>{toCurrency(selectedOrder.totalAmount)}</p>
            </div>
            <div>
              <p className="muted" style={{ marginBottom: '0.25rem' }}>Nhóm</p>
              <p style={{ margin: 0 }}>{selectedOrder.orderGroup || '--'}</p>
            </div>
          </div>

          {activeIntent ? (
            <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.7rem', display: 'grid', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                <strong>Payment intent: {activeIntent.intentCode || '--'}</strong>
                <Badge variant={statusToBadge(activeIntent.status)}>{activeIntent.status || '--'}</Badge>
              </div>
              <p style={{ margin: 0 }}>Locked: {toCurrency(activeIntent.amountLocked)} | Paid: {toCurrency(activeIntent.paidAmount)} | Remaining: {toCurrency(activeIntent.remainingAmount)}</p>
              <p style={{ margin: 0 }}>
                QR/Link:{' '}
                {activeIntent.qrPayload ? (
                  <a href={activeIntent.qrPayload} target="_blank" rel="noreferrer">{activeIntent.qrPayload}</a>
                ) : '--'}
                {activeIntent.qrActive === false ? ' (inactive)' : ''}
              </p>
              <p className="muted" style={{ margin: 0 }}>Cập nhật: {toDateTime(activeIntent.updatedAt)}</p>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.6rem', display: 'grid', gap: '0.5rem' }}>
                <strong style={{ fontSize: '0.95rem' }}>Checkout observability</strong>
                <p style={{ margin: 0 }}>
                  Txn tổng: {transactionStats.total}
                  {' · '}
                  APPLIED: {transactionStats.applied}
                  {' · '}
                  DUPLICATE: {transactionStats.duplicate}
                  {' · '}
                  REJECTED: {transactionStats.rejected}
                </p>
                {transactionStats.latestAnomalyReason ? (
                  <p className="muted" style={{ margin: 0 }}>
                    Lý do reject/duplicate gần nhất: {transactionStats.latestAnomalyReason}
                  </p>
                ) : null}
                {activeIntentTransactions.length > 0 ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Thời gian</th>
                          <th>Transaction ref</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Reason/Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeIntentTransactions.slice(0, 8).map((txn) => (
                          <tr key={txn.id}>
                            <td>{toDateTime(txn.createdAt)}</td>
                            <td>{txn.transactionRef || '--'}</td>
                            <td>{toCurrency(txn.amount)}</td>
                            <td><Badge variant={statusToBadge(txn.status)}>{txn.status || '--'}</Badge></td>
                            <td>{txn.note || '--'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>Chưa có payment transaction callback.</p>
                )}
                {activeIntentOverrides.length > 0 ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Thời gian</th>
                          <th>By</th>
                          <th>Role</th>
                          <th>Amount</th>
                          <th>Reason</th>
                          <th>Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeIntentOverrides.slice(0, 8).map((override) => (
                          <tr key={override.id}>
                            <td>{toDateTime(override.createdAt)}</td>
                            <td>{override.overrideBy || '--'}</td>
                            <td>{override.overrideRole || '--'}</td>
                            <td>{toCurrency(override.amount)}</td>
                            <td>{override.reason || '--'}</td>
                            <td>{override.reference || '--'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>Chưa có override log.</p>
                )}
              </div>

              {canOverridePayment ? (
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.6rem', display: 'grid', gap: '0.45rem' }}>
                  <strong style={{ fontSize: '0.95rem' }}>Payment override</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem' }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Reason *</label>
                      <input
                        required
                        value={overrideForm.reason}
                        onChange={(event) => setOverrideForm((prev) => ({ ...prev, reason: event.target.value }))}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Reference *</label>
                      <input
                        required
                        value={overrideForm.reference}
                        onChange={(event) => setOverrideForm((prev) => ({ ...prev, reference: event.target.value }))}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Amount (optional)</label>
                      <input
                        type="number"
                        min={0}
                        value={overrideForm.amount}
                        onChange={(event) => setOverrideForm((prev) => ({ ...prev, amount: event.target.value }))}
                        placeholder="Để trống = phần còn thiếu"
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-ghost" disabled={isApplyingAction} onClick={handlePaymentOverride}>
                      Payment override
                    </button>
                    <button type="button" className="btn btn-ghost" disabled={isApplyingAction} onClick={handleReEvaluateInvoice}>
                      Re-evaluate invoice
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-ghost" disabled={isApplyingAction} onClick={handleReEvaluateInvoice}>
                    Re-evaluate invoice
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="muted">Chưa có payment intent.</p>
          )}

          <div>
            <h5 style={{ marginBottom: '0.45rem' }}>Ops activation queue</h5>
            {pendingActivationLines.length === 0 ? (
              <p className="muted">Không còn line chờ activation.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Dịch vụ</th>
                      <th>Qty</th>
                      <th>Unit price</th>
                      <th>Activation</th>
                      <th>Effective hiện tại</th>
                      <th>Cập nhật hiệu lực</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingActivationLines.map((line) => {
                      const draft = getActivationDraft(line);
                      return (
                        <tr key={line.id}>
                          <td>{line.productName || '--'}</td>
                          <td>{Number(line.quantity || 0)}</td>
                          <td>{toCurrency(line.unitPrice)}</td>
                          <td><Badge variant={statusToBadge(line.activationStatus)}>{line.activationStatus || '--'}</Badge></td>
                          <td>{toDateTime(line.effectiveFrom)} - {toDateTime(line.effectiveTo)}</td>
                          <td>
                            <div style={{ display: 'grid', gap: '0.35rem', minWidth: '220px' }}>
                              <input
                                type="datetime-local"
                                value={draft.effectiveFrom}
                                onChange={(event) => handleActivationDraftChange(line.id, 'effectiveFrom', event.target.value)}
                                placeholder="effectiveFrom"
                              />
                              <input
                                type="datetime-local"
                                value={draft.effectiveTo}
                                onChange={(event) => handleActivationDraftChange(line.id, 'effectiveTo', event.target.value)}
                                placeholder="effectiveTo"
                              />
                              <input
                                value={draft.activationRef}
                                onChange={(event) => handleActivationDraftChange(line.id, 'activationRef', event.target.value)}
                                placeholder="activationRef (optional)"
                              />
                            </div>
                          </td>
                          <td>
                            <button type="button" className="btn btn-ghost" disabled={isApplyingAction} onClick={() => handleActivationComplete(line)}>
                              Complete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
