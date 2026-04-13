'use client';

import {
  Download,
  Upload,
  Plus,
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
  Filter,
  Save,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  apiRequest,
  normalizeListPayload,
  normalizeObjectPayload,
  normalizePagedListPayload,
  type ApiListSortMeta
} from '../lib/api-client';
import { isStrictIsoDate, parseFiniteNumber } from '../lib/form-validation';
import { formatRuntimeCurrency, formatRuntimeDateTime } from '../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../lib/bulk-actions';
import { useCursorTableState } from '../lib/use-cursor-table-state';
import { useAccessPolicy } from './access-policy-context';
import { useUserRole } from './user-role-context';
import { StandardDataTable, ColumnDefinition, type StandardTableBulkModalRenderContext } from './ui/standard-data-table';
import { SidePanel } from './ui/side-panel';
import { Modal } from './ui/modal';
import { Badge, statusToBadge, type BadgeVariant } from './ui/badge';
import { CreateEntityDialog } from './ui/create-entity-dialog';
import { CrmCustomersFilterModal } from './crm-customers/crm-customers-filter-modal';

import { CrmCustomersDetailPanel } from './crm-customers/crm-customers-detail-panel';

import { CrmCustomersCreatePanel } from './crm-customers/crm-customers-create-panel';


import {
  CUSTOMER_STATUS_OPTIONS,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_ZALO_NICK_TYPE_OPTIONS,
  CUSTOMER_ZALO_NICK_TYPE_LABELS,
  CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY,
  CUSTOMER_DEFAULT_VISIBLE_COLUMN_KEYS,
  CUSTOMER_TABLE_PAGE_SIZE,
  CUSTOMER_FILTER_OPERATOR_LABELS,
  CONTRACT_PRODUCT_TYPE_OPTIONS,
  VEHICLE_KIND_OPTIONS,
  FALLBACK_FILTER_FIELD_CONFIG,
  type Customer,
  type CustomerCareStatus,
  type CustomerZaloNickType,
  type ContractProductType,
  type ContractSummary,
  type CrmCustomerVehicle,
  type CrmCustomerContract,
  type CustomerDetailPayload,
  type CustomerTaxonomyPayload,
  type CreateCustomerFormState,
  type DetailCustomerFormState,
  type VehicleFormState,
  type CustomerBulkTagMode,
  type CustomerBulkFormState,
  type CustomerFilterLogic,
  type CustomerFilterFieldKey,
  type CustomerFilterOperator,
  type CustomerFilterInputType,
  type CustomerFilterCondition,
  type CustomerFilterDraft,
  type CustomerSavedFilter,
  type CustomerSavedFiltersPayload,
  type CustomerFilterFieldConfig,
  type CustomerStatusFilter
} from './crm-customers/types';

import {
  toNumber,
  toCurrency,
  toDateTime,
  isRecord,
  formatTaxonomyLabel,
  customerStatusLabel,
  customerStatusBadge,
  customerZaloNickTypeLabel,
  customerZaloNickTypeBadge,
  formatContractProductLabel,
  formatContractProductList,
  formatContractReference,
  buildAuditObjectHref,
  buildDetailForm,
  normalizeVehicleKind,
  buildVehicleFormState,
  resolveCurrentActorIdentity,
  readSelectedTags,
  readBulkTags,
  createCustomerFilterConditionId,
  buildCustomerFilterFieldConfigs,
  createDefaultFilterCondition,
  toCustomerFilterDraft,
  toCustomerFilterQueryPayload
} from './crm-customers/utils';

export function CrmCustomersBoard() {
  const { canModule, canAction } = useAccessPolicy();
  const { role } = useUserRole();
  const canView = canModule('crm');
  const canCreate = canAction('crm', 'CREATE');
  const canUpdate = canAction('crm', 'UPDATE');
  const canDelete = canAction('crm', 'DELETE');
  const actorIdentity = useMemo(() => resolveCurrentActorIdentity(role), [role]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stageOptions, setStageOptions] = useState<string[]>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [customerTagOptions, setCustomerTagOptions] = useState<string[]>([]);
  const [customerStatusOptions, setCustomerStatusOptions] = useState<CustomerCareStatus[]>(CUSTOMER_STATUS_OPTIONS);
  const [customerStatusLabels, setCustomerStatusLabels] = useState<Record<CustomerCareStatus, string>>(CUSTOMER_STATUS_LABELS);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatusFilter>('ALL');
  const [tableSortBy, setTableSortBy] = useState('updatedAt');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');
  const [tableSortMeta, setTableSortMeta] = useState<ApiListSortMeta | null>(null);
  const [initialCustomerId, setInitialCustomerId] = useState('');
  const [hasAppliedInitialCustomerId, setHasAppliedInitialCustomerId] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCustomerPermissionSnapshot, setSelectedCustomerPermissionSnapshot] = useState({
    canUpdate: false,
    canDelete: false
  });
  const [customerDetail, setCustomerDetail] = useState<CustomerDetailPayload | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<BulkRowId[]>([]);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [isSavingDetail, setIsSavingDetail] = useState(false);
  const [isSoftSkippingCustomer, setIsSoftSkippingCustomer] = useState(false);
  const [detailForm, setDetailForm] = useState<DetailCustomerFormState>(buildDetailForm(null));
  const [isVehicleEditorOpen, setIsVehicleEditorOpen] = useState(false);
  const [vehicleEditorMode, setVehicleEditorMode] = useState<'create' | 'edit'>('create');
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState<VehicleFormState>(buildVehicleFormState(null));
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);
  const [archivingVehicleId, setArchivingVehicleId] = useState<string | null>(null);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createValidationErrors, setCreateValidationErrors] = useState<string[]>([]);
  const [isApplyingCustomerBulk, setIsApplyingCustomerBulk] = useState(false);
  const [customerBulkForm, setCustomerBulkForm] = useState<CustomerBulkFormState>({
    softSkip: false,
    status: '',
    source: '',
    lastContactDate: '',
    tagsInput: '',
    tagMode: 'APPEND',
  });
  const [customerBulkError, setCustomerBulkError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateCustomerFormState>({
    fullName: '',
    phone: '',
    email: '',
    customerStage: '',
    source: '',
    segment: '',
    tags: []
  });
  const customerFilterFieldConfigs = useMemo(
    () => buildCustomerFilterFieldConfigs(stageOptions, sourceOptions, customerTagOptions, customerStatusOptions),
    [customerTagOptions, customerStatusOptions, sourceOptions, stageOptions]
  );
  const [savedCustomerFilters, setSavedCustomerFilters] = useState<CustomerSavedFilter[]>([]);
  const [defaultCustomerFilterId, setDefaultCustomerFilterId] = useState<string | null>(null);
  const [selectedSavedFilterId, setSelectedSavedFilterId] = useState('');
  const [appliedSavedFilterId, setAppliedSavedFilterId] = useState('');
  const [appliedCustomFilter, setAppliedCustomFilter] = useState<CustomerFilterDraft | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isLoadingCustomerFilters, setIsLoadingCustomerFilters] = useState(false);
  const [isSavingCustomerFilter, setIsSavingCustomerFilter] = useState(false);
  const [filterMessage, setFilterMessage] = useState<string | null>(null);
  const [filterErrorMessage, setFilterErrorMessage] = useState<string | null>(null);
  const [customerFilterDraft, setCustomerFilterDraft] = useState<CustomerFilterDraft>({
    name: '',
    logic: 'AND',
    isDefault: false,
    conditions: [createDefaultFilterCondition(customerFilterFieldConfigs)],
  });
  const [hasInitializedDefaultFilter, setHasInitializedDefaultFilter] = useState(false);

  const selectCustomer = useCallback(
    (customer: Customer | null) => {
      setSelectedCustomer(customer);
      setSelectedCustomerPermissionSnapshot({
        canUpdate: Boolean(customer) && canCreate && canUpdate,
        canDelete: Boolean(customer) && canDelete
      });
    },
    [canCreate, canDelete, canUpdate]
  );
  const appliedSavedFilter = useMemo(
    () => savedCustomerFilters.find((item) => item.id === appliedSavedFilterId) ?? null,
    [appliedSavedFilterId, savedCustomerFilters]
  );
  const normalizedAppliedFilterDraft = useMemo(() => {
    if (appliedSavedFilter) {
      return toCustomerFilterDraft(appliedSavedFilter, customerFilterFieldConfigs);
    }
    if (appliedCustomFilter) {
      return {
        ...appliedCustomFilter,
        conditions: appliedCustomFilter.conditions.map((condition) => ({ ...condition })),
      };
    }
    return null;
  }, [appliedCustomFilter, appliedSavedFilter, customerFilterFieldConfigs]);
  const activeCustomerFilterPayload = useMemo(
    () => toCustomerFilterQueryPayload(normalizedAppliedFilterDraft),
    [normalizedAppliedFilterDraft]
  );
  const activeCustomerFilterFingerprint = useMemo(
    () => (activeCustomerFilterPayload ? JSON.stringify(activeCustomerFilterPayload) : ''),
    [activeCustomerFilterPayload]
  );
  const customerTableFingerprint = useMemo(
    () =>
      JSON.stringify({
        q: search.trim(),
        status,
        sortBy: tableSortBy,
        sortDir: tableSortDir,
        limit: CUSTOMER_TABLE_PAGE_SIZE,
        filter: activeCustomerFilterFingerprint
      }),
    [activeCustomerFilterFingerprint, search, status, tableSortBy, tableSortDir]
  );
  const customerTablePager = useCursorTableState(customerTableFingerprint);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    setSearch(searchParams.get('q') ?? '');
    setInitialCustomerId(String(searchParams.get('customerId') ?? '').trim());
  }, []);

  useEffect(() => {
    loadTaxonomy();
  }, [canView]);

  useEffect(() => {
    void loadCustomerSavedFilters();
  }, [canView]);

  useEffect(() => {
    setCustomerFilterDraft((prev) => {
      const nextConditions = prev.conditions
        .map((condition) => {
          const fieldConfig = customerFilterFieldConfigs.find((item) => item.value === condition.field);
          if (!fieldConfig) {
            return createDefaultFilterCondition(customerFilterFieldConfigs);
          }
          const nextOperator = fieldConfig.operators.includes(condition.operator)
            ? condition.operator
            : fieldConfig.operators[0];
          return {
            ...condition,
            operator: nextOperator,
          };
        });
      return {
        ...prev,
        conditions: nextConditions.length > 0
          ? nextConditions
          : [createDefaultFilterCondition(customerFilterFieldConfigs)],
      };
    });
  }, [customerFilterFieldConfigs]);

  useEffect(() => {
    setIsDetailEditing(false);
    setDetailForm(buildDetailForm(selectedCustomer, customerStatusOptions));
    setIsVehicleEditorOpen(false);
    setVehicleEditorMode('create');
    setEditingVehicleId(null);
    setVehicleForm(buildVehicleFormState(null, selectedCustomer?.fullName ?? null));
  }, [selectedCustomer, customerStatusOptions]);

  useEffect(() => {
    if (isDetailEditing) {
      return;
    }
    if (customerDetail?.customer) {
      setDetailForm(buildDetailForm(customerDetail.customer, customerStatusOptions));
    }
  }, [customerDetail, isDetailEditing, customerStatusOptions]);

  const loadCustomers = async () => {
    if (!canView) return;
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>('/crm/customers', {
        query: {
          q: search,
          status: status !== 'ALL' ? status : undefined,
          limit: CUSTOMER_TABLE_PAGE_SIZE,
          cursor: customerTablePager.cursor ?? undefined,
          sortBy: tableSortBy,
          sortDir: tableSortDir,
          customFilter: activeCustomerFilterPayload ? JSON.stringify(activeCustomerFilterPayload) : undefined,
        }
      });
      const normalizedCustomers = normalizePagedListPayload<Customer>(payload);
      setCustomers(normalizedCustomers.items);
      customerTablePager.syncFromPageInfo(normalizedCustomers.pageInfo);
      setTableSortMeta(normalizedCustomers.sortMeta);
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
      const rawStatusOptions = Array.isArray(payload.customerStatusRegistry?.options)
        ? payload.customerStatusRegistry?.options
        : [];
      const statusRegistryLabels = isRecord(payload.customerStatusRegistry?.labels)
        ? payload.customerStatusRegistry?.labels
        : {};
      const nextStatusOptions = Array.from(
        new Set(
          rawStatusOptions
            .map((item) => String(item ?? '').trim().toUpperCase())
            .filter((item): item is CustomerCareStatus => CUSTOMER_STATUS_OPTIONS.includes(item as CustomerCareStatus))
        )
      );
      const nextStages = stages;
      const nextSources = sources;
      const nextCustomerTags = customerTags;
      const normalizedStatusOptions = nextStatusOptions.length > 0
        ? nextStatusOptions
        : [...CUSTOMER_STATUS_OPTIONS];
      const nextStatusLabels = CUSTOMER_STATUS_OPTIONS.reduce((result, statusCode) => {
        const fallbackLabel = CUSTOMER_STATUS_LABELS[statusCode];
        const overrideLabel = String(statusRegistryLabels[statusCode] ?? '').trim();
        result[statusCode] = overrideLabel || fallbackLabel;
        return result;
      }, {} as Record<CustomerCareStatus, string>);
      setStageOptions(nextStages);
      setSourceOptions(nextSources);
      setCustomerTagOptions(nextCustomerTags);
      setCustomerStatusOptions(normalizedStatusOptions);
      setCustomerStatusLabels(nextStatusLabels);
      setStatus((prev) => (
        prev === 'ALL' || normalizedStatusOptions.includes(prev)
          ? prev
          : 'ALL'
      ));
      setCustomerBulkForm((prev) => ({
        ...prev,
        status: prev.status && normalizedStatusOptions.includes(prev.status as CustomerCareStatus)
          ? prev.status
          : ''
      }));
      setCreateForm((prev) => ({
        ...prev,
        customerStage: nextStages.includes(prev.customerStage) ? prev.customerStage : (nextStages[0] || ''),
        source: nextSources.includes(prev.source) ? prev.source : (nextSources[0] || ''),
        tags: prev.tags.filter((tag) => nextCustomerTags.includes(tag))
      }));
      setDetailForm((prev) => ({
        ...prev,
        status: normalizedStatusOptions.includes(prev.status) || CUSTOMER_STATUS_OPTIONS.includes(prev.status)
          ? prev.status
          : (normalizedStatusOptions[0] || 'MOI_CHUA_TU_VAN'),
        tags: prev.tags.filter((tag) => nextCustomerTags.includes(tag))
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi tải taxonomy CRM');
      setStageOptions([]);
      setSourceOptions([]);
      setCustomerTagOptions([]);
      setCustomerStatusOptions([...CUSTOMER_STATUS_OPTIONS]);
      setCustomerStatusLabels(CUSTOMER_STATUS_LABELS);
    }
  };

  const normalizeSavedFiltersPayload = (
    payload: CustomerSavedFiltersPayload
  ): { items: CustomerSavedFilter[]; defaultFilterId: string | null } => {
    const list = Array.isArray(payload.items) ? payload.items : [];
    const normalized: CustomerSavedFilter[] = list
      .map((item): CustomerSavedFilter => {
        const logic: CustomerFilterLogic = item.logic === 'OR' ? 'OR' : 'AND';
        return {
          id: String(item.id ?? '').trim(),
          name: String(item.name ?? '').trim(),
          logic,
          conditions: Array.isArray(item.conditions) ? item.conditions : [],
          isDefault: Boolean(item.isDefault),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
      })
      .filter((item) => item.id.length > 0 && item.name.length > 0);
    const defaultId = String(payload.defaultFilterId ?? '').trim() || null;
    return {
      items: normalized,
      defaultFilterId: normalized.some((item) => item.id === defaultId) ? defaultId : null,
    };
  };

  const loadCustomerSavedFilters = async () => {
    if (!canView) return;
    setIsLoadingCustomerFilters(true);
    try {
      const payload = await apiRequest<CustomerSavedFiltersPayload>('/crm/customers/filters');
      const normalized = normalizeSavedFiltersPayload(payload);
      setSavedCustomerFilters(normalized.items);
      setDefaultCustomerFilterId(normalized.defaultFilterId);
      if (!hasInitializedDefaultFilter) {
        if (normalized.defaultFilterId) {
          setSelectedSavedFilterId(normalized.defaultFilterId);
          setAppliedSavedFilterId(normalized.defaultFilterId);
          setAppliedCustomFilter(null);
          const defaultFilter = normalized.items.find((item) => item.id === normalized.defaultFilterId);
          if (defaultFilter) {
            setCustomerFilterDraft(toCustomerFilterDraft(defaultFilter, customerFilterFieldConfigs));
          }
        }
        setHasInitializedDefaultFilter(true);
      }
      setFilterErrorMessage(null);
    } catch (error) {
      setFilterErrorMessage(error instanceof Error ? error.message : 'Lỗi tải bộ lọc khách hàng');
    } finally {
      setIsLoadingCustomerFilters(false);
    }
  };

  const validateFilterDraft = (draft: CustomerFilterDraft) => {
    if (!Array.isArray(draft.conditions) || draft.conditions.length === 0) {
      return 'Vui lòng thêm ít nhất 1 điều kiện.';
    }
    for (const [index, condition] of draft.conditions.entries()) {
      const fieldConfig = customerFilterFieldConfigs.find((item) => item.value === condition.field);
      if (!fieldConfig) {
        return `Điều kiện #${index + 1} có field không hợp lệ.`;
      }
      if (!fieldConfig.operators.includes(condition.operator)) {
        return `Điều kiện #${index + 1} có toán tử không hợp lệ.`;
      }
      if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
        continue;
      }
      if (!condition.value.trim()) {
        return `Điều kiện #${index + 1} đang thiếu giá trị.`;
      }
      if (condition.operator === 'between' && !condition.valueTo.trim()) {
        return `Điều kiện #${index + 1} cần thêm giá trị cuối khoảng ngày.`;
      }
    }
    return null;
  };

  const resetFilterDraft = () => {
    setCustomerFilterDraft({
      name: '',
      logic: 'AND',
      isDefault: false,
      conditions: [createDefaultFilterCondition(customerFilterFieldConfigs)],
    });
  };

  const openFilterModal = () => {
    if (!isFilterModalOpen) {
      const pickedSavedFilter = savedCustomerFilters.find((item) => item.id === selectedSavedFilterId)
        ?? savedCustomerFilters.find((item) => item.id === appliedSavedFilterId)
        ?? null;
      if (pickedSavedFilter) {
        setCustomerFilterDraft(toCustomerFilterDraft(pickedSavedFilter, customerFilterFieldConfigs));
      } else if (appliedCustomFilter) {
        setCustomerFilterDraft({
          ...appliedCustomFilter,
          conditions: appliedCustomFilter.conditions.map((condition) => ({ ...condition })),
        });
      } else {
        resetFilterDraft();
      }
    }
    setFilterMessage(null);
    setFilterErrorMessage(null);
    setIsFilterModalOpen(true);
  };

  const applyCurrentFilterDraft = () => {
    const validationError = validateFilterDraft(customerFilterDraft);
    if (validationError) {
      setFilterErrorMessage(validationError);
      return;
    }
    setAppliedSavedFilterId('');
    setAppliedCustomFilter({
      ...customerFilterDraft,
      id: undefined,
      isDefault: false,
      conditions: customerFilterDraft.conditions.map((condition) => ({ ...condition })),
    });
    setFilterMessage('Đã áp dụng bộ lọc tạm thời.');
    setErrorMessage(null);
    setIsFilterModalOpen(false);
  };

  const applySelectedSavedFilter = () => {
    if (!selectedSavedFilterId) {
      setFilterErrorMessage('Vui lòng chọn bộ lọc đã lưu để áp dụng.');
      return;
    }
    setAppliedSavedFilterId(selectedSavedFilterId);
    setAppliedCustomFilter(null);
    setFilterMessage('Đã áp dụng bộ lọc đã lưu.');
    setErrorMessage(null);
    setIsFilterModalOpen(false);
  };

  const clearAppliedCustomerFilter = () => {
    setAppliedSavedFilterId('');
    setAppliedCustomFilter(null);
    setSelectedSavedFilterId('');
    setFilterMessage('Đã xóa bộ lọc đang áp dụng.');
    setErrorMessage(null);
  };

  const saveCustomerFilterDraft = async () => {
    const validationError = validateFilterDraft(customerFilterDraft);
    if (validationError) {
      setFilterErrorMessage(validationError);
      return;
    }
    if (!customerFilterDraft.name.trim()) {
      setFilterErrorMessage('Vui lòng nhập tên bộ lọc trước khi lưu.');
      return;
    }
    setIsSavingCustomerFilter(true);
    try {
      const payload = await apiRequest<CustomerSavedFiltersPayload & { item?: CustomerSavedFilter }>('/crm/customers/filters', {
        method: 'POST',
        body: {
          id: customerFilterDraft.id,
          name: customerFilterDraft.name.trim(),
          logic: customerFilterDraft.logic,
          isDefault: customerFilterDraft.isDefault,
          conditions: customerFilterDraft.conditions.map((condition) => ({
            field: condition.field,
            operator: condition.operator,
            value: condition.value.trim() || undefined,
            valueTo: condition.valueTo.trim() || undefined,
          })),
        },
      });
      const normalized = normalizeSavedFiltersPayload(payload);
      setSavedCustomerFilters(normalized.items);
      setDefaultCustomerFilterId(normalized.defaultFilterId);
      const savedItem = payload.item && payload.item.id
        ? normalized.items.find((item) => item.id === payload.item?.id) ?? null
        : null;
      const nextSelectedId = savedItem?.id
        ?? normalized.defaultFilterId
        ?? customerFilterDraft.id
        ?? '';
      setSelectedSavedFilterId(nextSelectedId);
      if (nextSelectedId) {
        setAppliedSavedFilterId(nextSelectedId);
        setAppliedCustomFilter(null);
      }
      if (savedItem) {
        setCustomerFilterDraft(toCustomerFilterDraft(savedItem, customerFilterFieldConfigs));
      }
      setFilterErrorMessage(null);
      setFilterMessage('Đã lưu bộ lọc CRM.');
      setIsFilterModalOpen(false);
    } catch (error) {
      setFilterErrorMessage(error instanceof Error ? error.message : 'Không thể lưu bộ lọc CRM.');
    } finally {
      setIsSavingCustomerFilter(false);
    }
  };

  const deleteSelectedSavedFilter = async () => {
    if (!selectedSavedFilterId) {
      setFilterErrorMessage('Vui lòng chọn bộ lọc đã lưu để xóa.');
      return;
    }
    const selected = savedCustomerFilters.find((item) => item.id === selectedSavedFilterId);
    if (!selected) {
      setFilterErrorMessage('Không tìm thấy bộ lọc đã chọn.');
      return;
    }
    if (!window.confirm(`Xóa bộ lọc "${selected.name}"?`)) {
      return;
    }

    setIsSavingCustomerFilter(true);
    try {
      const payload = await apiRequest<CustomerSavedFiltersPayload>(`/crm/customers/filters/${selectedSavedFilterId}`, {
        method: 'DELETE',
      });
      const normalized = normalizeSavedFiltersPayload(payload);
      setSavedCustomerFilters(normalized.items);
      setDefaultCustomerFilterId(normalized.defaultFilterId);
      if (appliedSavedFilterId === selectedSavedFilterId) {
        setAppliedSavedFilterId('');
      }
      setSelectedSavedFilterId('');
      setFilterMessage('Đã xóa bộ lọc CRM.');
      setFilterErrorMessage(null);
      resetFilterDraft();
    } catch (error) {
      setFilterErrorMessage(error instanceof Error ? error.message : 'Không thể xóa bộ lọc CRM.');
    } finally {
      setIsSavingCustomerFilter(false);
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
      customerStage: stageOptions[0] ?? '',
      source: sourceOptions[0] ?? '',
      segment: '',
      tags: []
    });
  };

  const submitCreateCustomer = async (options: { keepOpen?: boolean } = {}) => {
    if (!canCreate) return;

    const validationErrors: string[] = [];
    if (!createForm.fullName.trim()) {
      validationErrors.push('Họ tên khách hàng là bắt buộc.');
    }
    if (validationErrors.length > 0) {
      setCreateValidationErrors(validationErrors);
      return;
    }

    setCreateValidationErrors([]);
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
      if (options.keepOpen) {
        resetCreateForm();
      } else {
        setIsCreatePanelOpen(false);
        resetCreateForm();
      }
      await loadCustomers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi tạo khách hàng');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nativeEvent = event.nativeEvent;
    const submitter = nativeEvent instanceof SubmitEvent ? nativeEvent.submitter : null;
    const keepOpen =
      submitter instanceof HTMLButtonElement && submitter.dataset.action === 'save-add-another';
    await submitCreateCustomer({ keepOpen });
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
          zaloNickType: detailForm.zaloNickType || undefined,
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
              zaloNickType: detailForm.zaloNickType || null,
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

  const handleSoftSkipCustomer = async () => {
    if (!selectedCustomer || !canDelete || isSoftSkippingCustomer) return;
    if (!window.confirm(`Đánh dấu "BỎ QUA/Xóa" cho khách hàng ${selectedCustomer.fullName || selectedCustomer.id}?`)) {
      return;
    }

    setIsSoftSkippingCustomer(true);
    try {
      await apiRequest(`/crm/customers/${selectedCustomer.id}`, {
        method: 'DELETE'
      });
      setResultMessage(`Đã chuyển khách hàng ${selectedCustomer.fullName || selectedCustomer.id} sang trạng thái BỎ QUA/Xóa.`);
      setErrorMessage(null);
      selectCustomer(null);
      setCustomerDetail(null);
      setIsDetailEditing(false);
      setDetailForm(buildDetailForm(null, customerStatusOptions));
      await loadCustomers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi cập nhật trạng thái BỎ QUA/Xóa');
    } finally {
      setIsSoftSkippingCustomer(false);
    }
  };

  const openCreateVehicleEditor = () => {
    if (!selectedCustomer || !canManageSelectedCustomerVehicles) {
      return;
    }
    setVehicleEditorMode('create');
    setEditingVehicleId(null);
    setVehicleForm(buildVehicleFormState(null, detailCustomer?.fullName ?? selectedCustomer.fullName ?? null));
    setIsVehicleEditorOpen(true);
  };

  const openEditVehicleEditor = (vehicle: CrmCustomerVehicle) => {
    if (!canManageSelectedCustomerVehicles) {
      return;
    }
    setVehicleEditorMode('edit');
    setEditingVehicleId(vehicle.id);
    setVehicleForm(buildVehicleFormState(vehicle, detailCustomer?.fullName ?? selectedCustomer?.fullName ?? null));
    setIsVehicleEditorOpen(true);
  };

  const handleSaveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCustomer || !canManageSelectedCustomerVehicles) {
      return;
    }
    setIsSavingVehicle(true);
    try {
      const seatCountParsed = vehicleForm.seatCount.trim() ? parseFiniteNumber(vehicleForm.seatCount) : undefined;
      if (seatCountParsed === null || (typeof seatCountParsed === 'number' && seatCountParsed < 0)) {
        throw new Error('Số chỗ ngồi phải là số nguyên >= 0.');
      }
      const loadKgParsed = vehicleForm.loadKg.trim() ? parseFiniteNumber(vehicleForm.loadKg) : undefined;
      if (loadKgParsed === null || (typeof loadKgParsed === 'number' && loadKgParsed < 0)) {
        throw new Error('Tải trọng phải là số >= 0.');
      }

      const payload = {
        ownerCustomerId: selectedCustomer.id,
        ownerFullName: vehicleForm.ownerFullName,
        ownerAddress: vehicleForm.ownerAddress || undefined,
        plateNumber: vehicleForm.plateNumber,
        chassisNumber: vehicleForm.chassisNumber,
        engineNumber: vehicleForm.engineNumber,
        vehicleKind: vehicleForm.vehicleKind,
        vehicleType: vehicleForm.vehicleType,
        seatCount: typeof seatCountParsed === 'number' ? Math.trunc(seatCountParsed) : undefined,
        loadKg: typeof loadKgParsed === 'number' ? loadKgParsed : undefined,
        status: vehicleForm.status
      };

      if (vehicleEditorMode === 'edit' && editingVehicleId) {
        await apiRequest(`/crm/vehicles/${editingVehicleId}`, {
          method: 'PATCH',
          body: payload
        });
        setResultMessage(`Đã cập nhật xe ${vehicleForm.plateNumber}.`);
      } else {
        await apiRequest('/crm/vehicles', {
          method: 'POST',
          body: payload
        });
        setResultMessage(`Đã thêm xe ${vehicleForm.plateNumber}.`);
      }

      setErrorMessage(null);
      setIsVehicleEditorOpen(false);
      setEditingVehicleId(null);
      setVehicleEditorMode('create');
      setVehicleForm(buildVehicleFormState(null, detailCustomer?.fullName ?? selectedCustomer.fullName ?? null));
      await loadCustomerDetail(selectedCustomer.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi lưu thông tin xe');
    } finally {
      setIsSavingVehicle(false);
    }
  };

  const handleArchiveVehicle = async (vehicle: CrmCustomerVehicle) => {
    if (!canArchiveSelectedCustomerVehicles) {
      return;
    }
    if (!window.confirm(`Xóa xe ${vehicle.plateNumber || vehicle.id}?`)) {
      return;
    }

    setArchivingVehicleId(vehicle.id);
    try {
      await apiRequest(`/crm/vehicles/${vehicle.id}`, {
        method: 'DELETE'
      });
      setResultMessage(`Đã xóa xe ${vehicle.plateNumber || vehicle.id}.`);
      setErrorMessage(null);
      if (editingVehicleId === vehicle.id) {
        setIsVehicleEditorOpen(false);
        setEditingVehicleId(null);
        setVehicleEditorMode('create');
      }
      if (selectedCustomer) {
        await loadCustomerDetail(selectedCustomer.id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi xóa xe');
    } finally {
      setArchivingVehicleId(null);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadCustomers, 300);
    return () => clearTimeout(timer);
  }, [
    activeCustomerFilterFingerprint,
    canView,
    customerTablePager.currentPage,
    search,
    status,
    tableSortBy,
    tableSortDir
  ]);

  useEffect(() => {
    if (!initialCustomerId || hasAppliedInitialCustomerId) {
      return;
    }

    const matchedRow = customers.find((item) => item.id === initialCustomerId);
    if (matchedRow) {
      selectCustomer(matchedRow);
      setHasAppliedInitialCustomerId(true);
      return;
    }

    let cancelled = false;
    const loadCustomerDirectly = async () => {
      try {
        const payload = await apiRequest<CustomerDetailPayload>(`/crm/customers/${initialCustomerId}`);
        if (cancelled) {
          return;
        }
        const normalizedCustomer = normalizeObjectPayload(payload.customer) as Customer | null;
        if (normalizedCustomer) {
          selectCustomer(normalizedCustomer);
        }
      } catch {
        // ignore invalid customerId in URL to avoid breaking normal page flow
      } finally {
        if (!cancelled) {
          setHasAppliedInitialCustomerId(true);
        }
      }
    };

    void loadCustomerDirectly();
    return () => {
      cancelled = true;
    };
  }, [customers, hasAppliedInitialCustomerId, initialCustomerId]);

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
  const detailStageOptions = useMemo(() => {
    const current = String(detailForm.customerStage ?? '').trim();
    if (current && !stageOptions.includes(current)) {
      return [current, ...stageOptions];
    }
    return stageOptions;
  }, [detailForm.customerStage, stageOptions]);
  const detailSourceOptions = useMemo(() => {
    const current = String(detailForm.source ?? '').trim();
    if (current && !sourceOptions.includes(current)) {
      return [current, ...sourceOptions];
    }
    return sourceOptions;
  }, [detailForm.source, sourceOptions]);
  const detailStatusOptions = useMemo(() => {
    const current = String(detailForm.status ?? '').trim().toUpperCase() as CustomerCareStatus;
    if (
      current
      && !customerStatusOptions.includes(current)
      && CUSTOMER_STATUS_OPTIONS.includes(current)
    ) {
      return [current, ...customerStatusOptions];
    }
    return customerStatusOptions;
  }, [customerStatusOptions, detailForm.status]);
  const contractSummary = customerDetail?.contractSummary ?? null;
  const recentContracts = customerDetail?.recentContracts ?? [];
  const customerVehicles = customerDetail?.vehicles ?? [];
  const selectedOwnerStaffId = String(detailCustomer?.ownerStaffId ?? '').trim();
  const canManageSelectedCustomerVehicles = canUpdate && (
    actorIdentity.isAdmin
      || (Boolean(actorIdentity.userId) && Boolean(selectedOwnerStaffId) && actorIdentity.userId === selectedOwnerStaffId)
  );
  const canArchiveSelectedCustomerVehicles = canDelete && (
    actorIdentity.isAdmin
      || (Boolean(actorIdentity.userId) && Boolean(selectedOwnerStaffId) && actorIdentity.userId === selectedOwnerStaffId)
  );
  const vehicleMap = useMemo(
    () => new Map(customerVehicles.map((item) => [item.id, item] as const)),
    [customerVehicles]
  );

  const customerTagSelectOptions = useMemo(() => {
    const selectedTags =
      detailCustomer?.tags?.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean) ?? [];
    return Array.from(new Set([...customerTagOptions, ...selectedTags]));
  }, [customerTagOptions, detailCustomer]);
  const appliedFilterLabel = appliedSavedFilter
    ? appliedSavedFilter.name
    : normalizedAppliedFilterDraft
      ? 'Bộ lọc tạm'
      : null;
  const appliedFilterConditionCount = normalizedAppliedFilterDraft?.conditions.length ?? 0;

  const columns: ColumnDefinition<Customer>[] = [
    { key: 'code', label: 'Mã KH', group: 'Thông tin khách hàng' },
    { 
      key: 'fullName', 
      label: 'Khách hàng', 
      group: 'Thông tin khách hàng',
      isLink: true,
      type: 'text'
    },
    { key: 'phone', label: 'Điện thoại', group: 'Thông tin khách hàng', type: 'text' },
    { key: 'email', label: 'Email', group: 'Thông tin khách hàng', type: 'text' },
    { 
      key: 'customerStage', 
      label: 'Giai đoạn',
      group: 'Thông tin khách hàng',
      type: 'select',
      options: customerStageColumnOptions
    },
    { 
      key: 'totalSpent', 
      label: 'Chi tiêu',
      group: 'Thông tin khách hàng',
      render: (c) => toCurrency(c.totalSpent)
    },
    { 
      key: 'status', 
      label: 'Trạng thái',
      group: 'Thông tin khách hàng',
      type: 'select',
      options: customerStatusOptions.map((value) => ({
        label: customerStatusLabel(value, customerStatusLabels),
        value,
      })),
      render: (c) => (
        <Badge variant={customerStatusBadge(c.status)}>
          {customerStatusLabel(c.status, customerStatusLabels)}
        </Badge>
      )
    },
    {
      key: 'zaloNickType',
      label: 'Loại nick Zalo',
      group: 'Thông tin khách hàng',
      type: 'select',
      options: CUSTOMER_ZALO_NICK_TYPE_OPTIONS.map((value) => ({
        label: CUSTOMER_ZALO_NICK_TYPE_LABELS[value],
        value,
      })),
      render: (c) => (
        <Badge variant={customerZaloNickTypeBadge(c.zaloNickType)}>
          {customerZaloNickTypeLabel(c.zaloNickType)}
        </Badge>
      )
    },
    {
      key: 'contractCount',
      label: 'Số hợp đồng',
      group: 'Hợp đồng',
      description: 'Tổng số hợp đồng của khách hàng',
      render: (c) => toNumber(c.contractCount)
    },
    {
      key: 'activeContractCount',
      label: 'Hợp đồng active',
      group: 'Hợp đồng',
      description: 'Số hợp đồng còn hiệu lực',
      render: (c) => toNumber(c.activeContractCount)
    },
    {
      key: 'nextContractExpiryAt',
      label: 'HĐ hết hạn gần nhất',
      group: 'Hợp đồng',
      description: 'Ngày hết hạn hợp đồng active gần nhất',
      render: (c) => toDateTime(c.nextContractExpiryAt)
    },
    {
      key: 'contractPackageNames',
      label: 'Gói cước',
      group: 'Hợp đồng',
      description: 'Gộp tất cả gói cước liên quan khách hàng'
    },
    {
      key: 'contractServicePhones',
      label: 'SĐT dịch vụ',
      group: 'Hợp đồng',
      description: 'Gộp các số điện thoại dịch vụ'
    },
    {
      key: 'contractProductTypes',
      label: 'Loại hợp đồng',
      group: 'Hợp đồng',
      description: 'Gộp các loại sản phẩm hợp đồng',
      render: (c) => formatContractProductList(c.contractProductTypes)
    },
    {
      key: 'contractExpiryDates',
      label: 'Ngày hết hạn HĐ',
      group: 'Hợp đồng',
      description: 'Gộp ngày hết hạn từ các hợp đồng'
    },
    {
      key: 'telecomExpiryDates',
      label: 'Ngày hết hạn gói cước',
      group: 'Hợp đồng',
      description: 'Gộp ngày hết hạn thuê bao viễn thông'
    },
    {
      key: 'digitalServiceNames',
      label: 'Dịch vụ số',
      group: 'Hợp đồng',
      description: 'Gộp service/plan/provider của dịch vụ số'
    },
    {
      key: 'vehicleCount',
      label: 'Số xe',
      group: 'Xe',
      description: 'Số phương tiện đang active',
      render: (c) => toNumber(c.vehicleCount)
    },
    {
      key: 'vehicleTypes',
      label: 'Loại xe',
      group: 'Xe',
      description: 'Gộp tất cả loại xe theo hồ sơ khách'
    },
    {
      key: 'vehicleKinds',
      label: 'Nhóm xe',
      group: 'Xe',
      description: 'Ô tô / xe máy...'
    },
    {
      key: 'vehiclePlateNumbers',
      label: 'Biển số xe',
      group: 'Xe',
      description: 'Gộp biển số các xe của khách'
    },
    {
      key: 'insuranceExpiryDates',
      label: 'Ngày hết hạn bảo hiểm',
      group: 'Bảo hiểm',
      description: 'Gộp ngày hết hạn bảo hiểm ô tô + xe máy'
    },
    {
      key: 'autoInsuranceExpiryDates',
      label: 'Hết hạn BH ô tô',
      group: 'Bảo hiểm',
      description: 'Gộp ngày hết hạn riêng bảo hiểm ô tô'
    },
    {
      key: 'motoInsuranceExpiryDates',
      label: 'Hết hạn BH xe máy',
      group: 'Bảo hiểm',
      description: 'Gộp ngày hết hạn riêng bảo hiểm xe máy'
    },
    {
      key: 'insurancePolicyNumbers',
      label: 'Số GCN bảo hiểm',
      group: 'Bảo hiểm',
      description: 'Gộp số giấy chứng nhận bảo hiểm'
    },
    { 
      key: 'updatedAt', 
      label: 'Cập nhật',
      group: 'Thông tin khách hàng',
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

  const runCustomerBulkModalAction = async (context: StandardTableBulkModalRenderContext<Customer>) => {
    const selectedRows = context.selectedRows;
    if (selectedRows.length === 0) {
      setCustomerBulkError('Vui lòng chọn ít nhất 1 khách hàng.');
      return;
    }

    const source = customerBulkForm.source.trim();
    const statusValue = customerBulkForm.status;
    const tags = readBulkTags(customerBulkForm.tagsInput);
    const shouldPatch = Boolean(statusValue || source || customerBulkForm.lastContactDate || tags.length > 0);
    const shouldSoftSkip = customerBulkForm.softSkip;

    if (!shouldPatch && !shouldSoftSkip) {
      setCustomerBulkError('Vui lòng chọn ít nhất một thay đổi để áp dụng.');
      return;
    }
    if (shouldPatch && !canUpdate) {
      setCustomerBulkError('Bạn không có quyền cập nhật hàng loạt khách hàng.');
      return;
    }
    if (shouldSoftSkip && !canDelete) {
      setCustomerBulkError('Bạn không có quyền BỎ QUA/Xóa hàng loạt khách hàng.');
      return;
    }

    setIsApplyingCustomerBulk(true);
    setCustomerBulkError(null);
    const actionLabel = shouldPatch && shouldSoftSkip
      ? 'Cập nhật + BỎ QUA/Xóa khách hàng'
      : shouldSoftSkip
        ? 'BỎ QUA/Xóa khách hàng'
        : 'Cập nhật khách hàng hàng loạt';

    try {
      const result = await runCustomerBulkAction(actionLabel, selectedRows, async (customer) => {
        if (shouldPatch) {
          const patchBody: Record<string, unknown> = {};
          if (statusValue) {
            patchBody.status = statusValue;
          }
          if (source) {
            patchBody.source = source;
          }
          if (customerBulkForm.lastContactDate) {
            if (!isStrictIsoDate(customerBulkForm.lastContactDate)) {
              throw new Error('Ngày lần liên hệ cuối không hợp lệ.');
            }
            patchBody.lastContactAt = `${customerBulkForm.lastContactDate}T00:00:00.000Z`;
          }
          if (tags.length > 0) {
            if (customerBulkForm.tagMode === 'REPLACE') {
              patchBody.tags = tags;
            } else {
              const existingTags = Array.isArray(customer.tags)
                ? customer.tags.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean)
                : [];
              patchBody.tags = Array.from(new Set([...existingTags, ...tags]));
            }
          }

          if (Object.keys(patchBody).length > 0) {
            await apiRequest(`/crm/customers/${customer.id}`, {
              method: 'PATCH',
              body: patchBody,
            });
          }
        }

        if (shouldSoftSkip) {
          await apiRequest(`/crm/customers/${customer.id}`, {
            method: 'DELETE',
          });
        }
      });

      if (result.failedCount === 0) {
        setCustomerBulkForm({
          softSkip: false,
          status: '',
          source: '',
          lastContactDate: '',
          tagsInput: '',
          tagMode: 'APPEND',
        });
        context.clearSelection();
        context.closeBulkModal();
      } else {
        setCustomerBulkError('Một số khách hàng xử lý lỗi. Vui lòng kiểm tra kết quả rồi thử lại.');
      }
    } finally {
      setIsApplyingCustomerBulk(false);
    }
  };

  const renderCustomerBulkModalContent = (context: StandardTableBulkModalRenderContext<Customer>) => (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.86rem' }}>
        Đã chọn <strong>{context.selectedRows.length}</strong> / {context.totalLoadedRows} dòng đang tải.
      </p>
      {customerBulkError ? (
        <div className="finance-alert finance-alert-danger" style={{ margin: 0 }}>
          {customerBulkError}
        </div>
      ) : null}
      {canDelete ? (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={customerBulkForm.softSkip}
            onChange={(event) =>
              setCustomerBulkForm((prev) => ({ ...prev, softSkip: event.target.checked }))
            }
          />
          <span>BỎ QUA/Xóa</span>
        </label>
      ) : null}
      {canUpdate ? (
        <div className="field">
          <label>Thay đổi trạng thái</label>
          <select
            value={customerBulkForm.status}
            onChange={(event) =>
              setCustomerBulkForm((prev) => ({ ...prev, status: event.target.value as CustomerCareStatus | '' }))
            }
          >
            <option value="">Không cập nhật</option>
            {customerStatusOptions.map((value) => (
              <option key={`bulk-status-${value}`} value={value}>
                {customerStatusLabel(value, customerStatusLabels)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {canUpdate ? (
        <div className="field">
          <label>Nguồn</label>
          <input
            list="crm-customer-source-options"
            value={customerBulkForm.source}
            onChange={(event) =>
              setCustomerBulkForm((prev) => ({ ...prev, source: event.target.value }))
            }
            placeholder="Nhập theo source taxonomy trong Settings Center"
          />
          <datalist id="crm-customer-source-options">
            {sourceOptions.map((value) => (
              <option key={`bulk-source-${value}`} value={value} />
            ))}
          </datalist>
        </div>
      ) : null}
      {canUpdate ? (
        <div className="field">
          <label>Lần liên hệ cuối</label>
          <input
            type="date"
            value={customerBulkForm.lastContactDate}
            onChange={(event) =>
              setCustomerBulkForm((prev) => ({ ...prev, lastContactDate: event.target.value }))
            }
          />
        </div>
      ) : null}
      {canUpdate ? (
        <div className="field">
          <label>Tags (phân tách bằng dấu phẩy hoặc chấm phẩy)</label>
          <input
            value={customerBulkForm.tagsInput}
            onChange={(event) =>
              setCustomerBulkForm((prev) => ({ ...prev, tagsInput: event.target.value }))
            }
            placeholder="Nhập theo customer tags trong Settings Center"
          />
        </div>
      ) : null}
      {canUpdate ? (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <input
              type="radio"
              name="crm-customer-bulk-tag-mode"
              checked={customerBulkForm.tagMode === 'APPEND'}
              onChange={() => setCustomerBulkForm((prev) => ({ ...prev, tagMode: 'APPEND' }))}
            />
            <span>Append tags</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <input
              type="radio"
              name="crm-customer-bulk-tag-mode"
              checked={customerBulkForm.tagMode === 'REPLACE'}
              onChange={() => setCustomerBulkForm((prev) => ({ ...prev, tagMode: 'REPLACE' }))}
            />
            <span>Replace tags</span>
          </label>
        </div>
      ) : null}
    </div>
  );

  const renderCustomerBulkModalFooter = (context: StandardTableBulkModalRenderContext<Customer>) => (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={context.closeBulkModal}
        disabled={isApplyingCustomerBulk}
      >
        Đóng
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void runCustomerBulkModalAction(context)}
        disabled={isApplyingCustomerBulk || context.selectedRows.length === 0}
      >
        {isApplyingCustomerBulk ? 'Đang xử lý...' : 'Xác nhận'}
      </button>
    </>
  );

  const upsertFilterDraftCondition = (
    conditionId: string,
    updater: (current: CustomerFilterCondition) => CustomerFilterCondition
  ) => {
    setCustomerFilterDraft((prev) => ({
      ...prev,
      conditions: prev.conditions.map((condition) => (
        condition.id === conditionId ? updater(condition) : condition
      )),
    }));
  };

  const changeFilterConditionField = (conditionId: string, field: CustomerFilterFieldKey) => {
    const fieldConfig = customerFilterFieldConfigs.find((item) => item.value === field)
      ?? customerFilterFieldConfigs[0]
      ?? FALLBACK_FILTER_FIELD_CONFIG;
    upsertFilterDraftCondition(conditionId, (current) => ({
      ...current,
      field: fieldConfig.value,
      operator: fieldConfig.operators[0] ?? current.operator,
      value: '',
      valueTo: '',
    }));
  };

  const changeFilterConditionOperator = (conditionId: string, operator: CustomerFilterOperator) => {
    upsertFilterDraftCondition(conditionId, (current) => ({
      ...current,
      operator,
      ...(operator !== 'between' ? { valueTo: '' } : {}),
    }));
  };

  const addFilterDraftCondition = () => {
    setCustomerFilterDraft((prev) => ({
      ...prev,
      conditions: [...prev.conditions, createDefaultFilterCondition(customerFilterFieldConfigs)],
    }));
  };

  const removeFilterDraftCondition = (conditionId: string) => {
    setCustomerFilterDraft((prev) => {
      const next = prev.conditions.filter((condition) => condition.id !== conditionId);
      return {
        ...prev,
        conditions: next.length > 0 ? next : [createDefaultFilterCondition(customerFilterFieldConfigs)],
      };
    });
  };

  const loadSelectedSavedFilterIntoDraft = () => {
    if (!selectedSavedFilterId) {
      setFilterErrorMessage('Vui lòng chọn bộ lọc đã lưu.');
      return;
    }
    const selected = savedCustomerFilters.find((item) => item.id === selectedSavedFilterId);
    if (!selected) {
      setFilterErrorMessage('Không tìm thấy bộ lọc đã lưu.');
      return;
    }
    setCustomerFilterDraft(toCustomerFilterDraft(selected, customerFilterFieldConfigs));
    setFilterErrorMessage(null);
  };

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

      {/* Table Data */}
      <StandardDataTable
        data={customers}
        columns={columns}
        storageKey={CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY}
        defaultVisibleColumnKeys={CUSTOMER_DEFAULT_VISIBLE_COLUMN_KEYS}
        toolbarLeftContent={(
          <>
            <div className="field" style={{ width: '180px' }}>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as CustomerStatusFilter)}
              >
                <option value="ALL">Tất cả trạng thái CSKH</option>
                {customerStatusOptions.map((value) => (
                  <option key={value} value={value}>
                    {customerStatusLabel(value, customerStatusLabels)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={`btn ${appliedFilterLabel ? 'btn-primary' : 'btn-ghost'}`}
              onClick={openFilterModal}
            >
              <Filter size={14} />
              Bộ lọc
              {appliedFilterConditionCount > 0 ? ` (${appliedFilterConditionCount})` : ''}
            </button>
            {appliedFilterLabel ? (
              <>
                <span
                  className="finance-status-pill finance-status-pill-info"
                  style={{ margin: 0 }}
                >
                  {appliedFilterLabel}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={clearAppliedCustomerFilter}
                >
                  Xóa lọc
                </button>
              </>
            ) : null}
          </>
        )}
        toolbarRightContent={(
          <>
            <button className="btn btn-ghost">
              <Download size={16} /> Export
            </button>
            <a className="btn btn-ghost" href="/modules/crm/customers/import">
              <Upload size={16} /> Import
            </a>
            <a className="btn btn-ghost" href="/modules/crm/vehicles">
              <Car size={16} /> Quản lý xe
            </a>
            <a className="btn btn-ghost" href="/modules/crm/distribution">
              <Target size={16} /> Chia khách
            </a>
            {canCreate && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setCreateValidationErrors([]);
                  setIsCreatePanelOpen(true);
                }}
              >
                <Plus size={16} /> Thêm dữ liệu
              </button>
            )}
          </>
        )}
        isLoading={isLoading}
        pageInfo={{
          currentPage: customerTablePager.currentPage,
          hasPrevPage: customerTablePager.hasPrevPage,
          hasNextPage: customerTablePager.hasNextPage,
          visitedPages: customerTablePager.visitedPages
        }}
        sortMeta={
          tableSortMeta ?? {
            sortBy: tableSortBy,
            sortDir: tableSortDir,
            sortableFields: []
          }
        }
        onPageNext={customerTablePager.goNextPage}
        onPagePrev={customerTablePager.goPrevPage}
        onJumpVisitedPage={customerTablePager.jumpVisitedPage}
        onSortChange={(sortBy, sortDir) => {
          setTableSortBy(sortBy);
          setTableSortDir(sortDir);
        }}
        onRowClick={(c) => selectCustomer(c)}
        editableKeys={canUpdate ? ['fullName', 'phone', 'email', 'customerStage', 'status', 'zaloNickType'] : []}
        onSaveRow={handleSaveCustomer}
        enableRowSelection
        selectedRowIds={selectedRowIds}
        onSelectedRowIdsChange={setSelectedRowIds}
        bulkActions={[]}
        bulkModalTitle="Bulk Actions"
        renderBulkModalContent={renderCustomerBulkModalContent}
        renderBulkModalFooter={renderCustomerBulkModalFooter}
      />

      <CrmCustomersFilterModal
        isFilterModalOpen={isFilterModalOpen}
        setIsFilterModalOpen={setIsFilterModalOpen}
        isSavingCustomerFilter={isSavingCustomerFilter}
        applyCurrentFilterDraft={applyCurrentFilterDraft}
        saveCustomerFilterDraft={saveCustomerFilterDraft as any}
        filterErrorMessage={filterErrorMessage}
        filterMessage={filterMessage}
        isLoadingCustomerFilters={isLoadingCustomerFilters}
        selectedSavedFilterId={selectedSavedFilterId}
        setSelectedSavedFilterId={setSelectedSavedFilterId}
        savedCustomerFilters={savedCustomerFilters}
        applySelectedSavedFilter={applySelectedSavedFilter}
        loadSelectedSavedFilterIntoDraft={loadSelectedSavedFilterIntoDraft}
        deleteSelectedSavedFilter={deleteSelectedSavedFilter as any}
        customerFilterDraft={customerFilterDraft}
        setCustomerFilterDraft={setCustomerFilterDraft as any}
        customerFilterFieldConfigs={customerFilterFieldConfigs}
        changeFilterConditionField={changeFilterConditionField}
        changeFilterConditionOperator={changeFilterConditionOperator}
        upsertFilterDraftCondition={upsertFilterDraftCondition}
        removeFilterDraftCondition={removeFilterDraftCondition}
        addFilterDraftCondition={addFilterDraftCondition}
        customerTagOptions={customerTagOptions}
        defaultCustomerFilterId={defaultCustomerFilterId}
        clearAppliedCustomerFilter={clearAppliedCustomerFilter}
      />

      {/* Detail Side Panel */}
      <CrmCustomersDetailPanel
        selectedCustomer={selectedCustomer}
        selectCustomer={selectCustomer}
        canUpdate={canUpdate}
        canDelete={canDelete}
        customerDetail={customerDetail}
        isDetailLoading={isDetailLoading}
        detailForm={detailForm}
        setDetailForm={setDetailForm as any}
        isDetailEditing={isDetailEditing}
        setIsDetailEditing={setIsDetailEditing}
        isSavingDetail={isSavingDetail}
        handleSaveDetailProfile={handleSaveDetailProfile as any}
        handleSoftSkipCustomer={handleSoftSkipCustomer}
        isSoftSkippingCustomer={isSoftSkippingCustomer}
        detailStageOptions={detailStageOptions}
        detailSourceOptions={detailSourceOptions}
        customerStatusOptions={detailStatusOptions}
        customerStatusLabels={customerStatusLabels}
        customerTagSelectOptions={customerTagSelectOptions}
        customerVehicles={customerVehicles}
        canManageSelectedCustomerVehicles={canManageSelectedCustomerVehicles}
        canArchiveSelectedCustomerVehicles={canArchiveSelectedCustomerVehicles}
        isVehicleEditorOpen={isVehicleEditorOpen}
        setIsVehicleEditorOpen={setIsVehicleEditorOpen}
        openCreateVehicleEditor={openCreateVehicleEditor}
        openEditVehicleEditor={openEditVehicleEditor as any}
        handleArchiveVehicle={handleArchiveVehicle as any}
        vehicleMap={vehicleMap}
        vehicleForm={vehicleForm as any}
        setVehicleForm={setVehicleForm as any}
        isSavingVehicle={isSavingVehicle}
        handleSaveVehicle={handleSaveVehicle as any}
        vehicleEditorMode={vehicleEditorMode as any}
        vehicleValidationErrors={[]}
        archivingVehicleId={archivingVehicleId}
        recentContracts={recentContracts}
        contractSummary={contractSummary}
        setCustomerDetail={setCustomerDetail}
        setEditingVehicleId={setEditingVehicleId}
        setVehicleEditorMode={setVehicleEditorMode as any}
        selectedCustomerPermissionSnapshot={selectedCustomerPermissionSnapshot}
        buildDetailForm={(customer) => buildDetailForm(customer, customerStatusOptions)}
        buildVehicleFormState={buildVehicleFormState}
      />

      <CrmCustomersCreatePanel
        open={isCreatePanelOpen}
        onClose={() => setIsCreatePanelOpen(false)}
        createForm={createForm}
        setCreateForm={setCreateForm}
        handleCreateCustomer={handleCreateCustomer}
        isCreating={isCreating}
        createValidationErrors={createValidationErrors}
        stageOptions={stageOptions}
        sourceOptions={sourceOptions}
        customerTagSelectOptions={customerTagSelectOptions}
        resetCreateForm={resetCreateForm}
      />
    </div>
  );
}
