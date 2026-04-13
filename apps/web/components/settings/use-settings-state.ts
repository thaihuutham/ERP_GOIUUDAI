'use client';

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { apiRequest, normalizeListPayload } from '../../lib/api-client';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../../lib/bulk-actions';
import { useAccessPolicy } from '../access-policy-context';
import { useUserRole } from '../user-role-context';
import { ERP_MODULES } from '@erp/shared';
import {
  filterDomainTabsByRole,
  filterSectionsForTabAndMode,
  resolveActiveTab,
  resolveDefaultAdvancedMode,
  resolveDomainTabs,
  type DomainTabConfig
} from '../settings-center/view-model';
import {
  DOMAIN_ORDER, DomainKey, DOMAIN_CONFIG, CenterPayload, DomainPayload,
  PermissionActionKey, PermissionEffectValue, IamScopeMode, PermissionRuleRow, PermissionMatrix,
  FieldConfig, SalesTaxonomyType, CrmTagRegistryType, TaxonomyManagerType,
  SalesTaxonomyPayload, CrmTagRegistryPayload, EMPTY_SALES_TAXONOMY, EMPTY_CRM_TAG_REGISTRY,
  PositionSummaryItem, IamMismatchReportItem,
  type SettingsLayoutPayload,
  REASON_TEMPLATES,
  normalizeLayoutGroups, normalizeLayoutDomainTabs, resolveAdvancedModeDefaultByLayout,
  toRecord, cloneJson, toStringArray,
  buildHrAppendixFieldPickerOptions,
  normalizePositionRows, normalizeIamMismatchReport,
  createEmptyPermissionMatrix, mapRulesToMatrix, mapMatrixToRules,
  getDomainFields, getFieldValue, setFieldValue,
  buildSubmissionData, collectFieldChanges, mapFieldErrors,
  formatDateTime, toSettingsFriendlyError
} from '../settings-center/domain-config';

export type SettingsState = ReturnType<typeof useSettingsState>;

type UseSettingsStateOptions = {
  initialDomain?: DomainKey;
  initialDomainTab?: string;
};

export function useSettingsState(options: UseSettingsStateOptions = {}) {
  const initialDomain = options.initialDomain ?? 'org_profile';
  const initialDomainTab = options.initialDomainTab ?? '';

  const { role } = useUserRole();
  const { canAction } = useAccessPolicy();

  // ── Core state ────────────────────────────────
  const [center, setCenter] = useState<CenterPayload | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<DomainKey>(initialDomain);
  const [settingsSearch, setSettingsSearch] = useState('');
  const [advancedMode, setAdvancedMode] = useState<boolean>(resolveDefaultAdvancedMode(role));
  const [advancedTouchedByUser, setAdvancedTouchedByUser] = useState(false);
  const [settingsLayout, setSettingsLayout] = useState<SettingsLayoutPayload | null>(null);
  const [activeDomainTab, setActiveDomainTab] = useState(initialDomainTab);
  const [domainResponse, setDomainResponse] = useState<DomainPayload | null>(null);
  const [draftData, setDraftData] = useState<Record<string, unknown>>({});
  const [reasonTemplate, setReasonTemplate] = useState<string>(REASON_TEMPLATES[0]);
  const [reasonNote, setReasonNote] = useState('');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');

  // ── Taxonomy state ────────────────────────────
  const [salesTaxonomy, setSalesTaxonomy] = useState<SalesTaxonomyPayload>(EMPTY_SALES_TAXONOMY);
  const [salesTaxonomyBusy, setSalesTaxonomyBusy] = useState(false);
  const [crmTagRegistry, setCrmTagRegistry] = useState<CrmTagRegistryPayload>(EMPTY_CRM_TAG_REGISTRY);
  const [crmTagRegistryBusy, setCrmTagRegistryBusy] = useState(false);

  // ── UI state ──────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [sectionCollapseState, setSectionCollapseState] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<Record<string, unknown> | null>(null);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  // ── IAM state ─────────────────────────────────
  const [iamUsers, setIamUsers] = useState<Record<string, unknown>[]>([]);
  const [selectedIamUserIds, setSelectedIamUserIds] = useState<BulkRowId[]>([]);
  const [orgItems, setOrgItems] = useState<Record<string, unknown>[]>([]);
  const [orgTree, setOrgTree] = useState<Record<string, unknown>[]>([]);
  const [positions, setPositions] = useState<PositionSummaryItem[]>([]);
  const [positionSearch, setPositionSearch] = useState('');
  const [showPositionForm, setShowPositionForm] = useState(false);
  const [positionFormMode, setPositionFormMode] = useState<'create' | 'edit'>('create');
  const [positionForm, setPositionForm] = useState({
    id: '',
    title: '',
    code: '',
    level: '',
    status: 'ACTIVE'
  });
  const [selectedOverrideUserId, setSelectedOverrideUserId] = useState('');
  const [overrideMatrix, setOverrideMatrix] = useState<PermissionMatrix>(() => createEmptyPermissionMatrix());
  const [iamScopeOverrideForm, setIamScopeOverrideForm] = useState<{
    scopeMode: IamScopeMode;
    rootOrgUnitId: string;
    reason: string;
  }>({
    scopeMode: 'SELF',
    rootOrgUnitId: '',
    reason: 'Điều chỉnh scope override theo user'
  });
  const [iamTitleScopeForm, setIamTitleScopeForm] = useState<{
    titlePattern: string;
    scopeMode: IamScopeMode;
    priority: number;
    reason: string;
  }>({
    titlePattern: '',
    scopeMode: 'SUBTREE',
    priority: 100,
    reason: 'Cập nhật title scope mapping'
  });
  const [iamMismatchFilter, setIamMismatchFilter] = useState<{
    moduleKey: string;
    action: '' | PermissionActionKey;
    limit: number;
  }>({
    moduleKey: '',
    action: '',
    limit: 30
  });
  const [iamMismatchReport, setIamMismatchReport] = useState<{
    generatedAt: string;
    totalMismatches: number;
    totalGroups: number;
    items: IamMismatchReportItem[];
  } | null>(null);
  const [iamMismatchBusy, setIamMismatchBusy] = useState(false);
  const [accountForm, setAccountForm] = useState({
    fullName: '',
    email: '',
    role: 'USER',
    positionId: '',
    orgUnitId: ''
  });
  const [orgUnitForm, setOrgUnitForm] = useState({
    name: '',
    type: 'TEAM',
    parentId: '',
    managerEmployeeId: ''
  });
  const [orgMoveForm, setOrgMoveForm] = useState({
    unitId: '',
    parentId: ''
  });
  const [orgManagerForm, setOrgManagerForm] = useState({
    unitId: '',
    managerEmployeeId: ''
  });

  // ── Derived / memos ───────────────────────────
  const domainConfig = DOMAIN_CONFIG[selectedDomain];
  const domainsections = domainConfig?.sections ?? [];
  const domaintitle = domainConfig?.title ?? '';
  const domaindescription = domainConfig?.description ?? '';
  const normalizedRole = String(role ?? '').trim().toUpperCase();

  const sidebarGroups = useMemo(() => normalizeLayoutGroups(settingsLayout), [settingsLayout]);

  const domainTabs = useMemo(() => {
    const fromLayout = normalizeLayoutDomainTabs(settingsLayout, selectedDomain);
    const baseTabs = fromLayout ?? resolveDomainTabs(selectedDomain);
    return filterDomainTabsByRole(selectedDomain, baseTabs, role);
  }, [selectedDomain, settingsLayout, role]);

  const resolvedActiveDomainTab = useMemo(
    () => resolveActiveTab(domainTabs, activeDomainTab),
    [domainTabs, activeDomainTab]
  );

  const activeTabConfig = useMemo(
    () => domainTabs.find((tab) => tab.key === resolvedActiveDomainTab) ?? domainTabs[0] ?? null,
    [domainTabs, resolvedActiveDomainTab]
  );

  const visibleSections = useMemo(
    () => filterSectionsForTabAndMode(domainsections, domainTabs, resolvedActiveDomainTab, advancedMode),
    [domainsections, domainTabs, resolvedActiveDomainTab, advancedMode]
  );

  const sectionViewModels = useMemo(
    () =>
      visibleSections.map((section, index) => ({
        section,
        sectionKey: `${selectedDomain}:${resolvedActiveDomainTab}:${section.id}`,
        defaultCollapsed: selectedDomain === 'access_security' ? index > 0 : false
      })),
    [visibleSections, selectedDomain, resolvedActiveDomainTab]
  );

  const originalData = useMemo(() => toRecord(domainResponse?.data), [domainResponse]);

  const hrAppendixFieldPickerOptions = useMemo(
    () => buildHrAppendixFieldPickerOptions(draftData),
    [draftData]
  );

  const submissionData = useMemo(
    () => buildSubmissionData(selectedDomain, originalData, draftData),
    [selectedDomain, originalData, draftData]
  );

  const fieldChanges = useMemo(
    () => collectFieldChanges(selectedDomain, originalData, submissionData),
    [selectedDomain, originalData, submissionData]
  );

  const validationErrors = useMemo(() => {
    const source = toRecord(validationResult ?? domainResponse?.validation ?? {});
    return Array.isArray(source.errors) ? source.errors.map((item) => String(item)) : [];
  }, [validationResult, domainResponse]);

  const validationWarnings = useMemo(() => {
    const source = toRecord(validationResult ?? domainResponse?.validation ?? {});
    return Array.isArray(source.warnings) ? source.warnings.map((item) => String(item)) : [];
  }, [validationResult, domainResponse]);

  const fieldErrorMap = useMemo(
    () => mapFieldErrors(getDomainFields(selectedDomain), validationErrors),
    [selectedDomain, validationErrors]
  );

  const canManagePositionCatalog = canAction('settings', 'UPDATE');
  const canManageIamAdmin = canAction('settings', 'UPDATE');

  const filteredPositions = useMemo(() => {
    const keyword = positionSearch.trim().toLowerCase();
    if (!keyword) return positions;
    return positions.filter((item) =>
      item.title.toLowerCase().includes(keyword) ||
      item.code.toLowerCase().includes(keyword) ||
      item.level.toLowerCase().includes(keyword) ||
      item.departmentName.toLowerCase().includes(keyword)
    );
  }, [positionSearch, positions]);

  const positionOptions = useMemo(() => {
    return positions
      .map((item) => ({ id: item.id, name: item.title }))
      .filter((item) => item.id && item.name);
  }, [positions]);

  const orgUnitOptions = useMemo(() => {
    return orgItems
      .map((item) => ({
        id: String(item.id ?? '').trim(),
        name: String(item.name ?? '').trim(),
        type: String(item.type ?? '').trim()
      }))
      .filter((item) => item.id && item.name);
  }, [orgItems]);

  const managerEmployeeOptions = useMemo(() => {
    return iamUsers
      .map((item) => {
        const employee = toRecord(item.employee);
        const employeeId = String(employee.id ?? '').trim();
        const fullName = String(employee.fullName ?? '').trim();
        const email = String(item.email ?? '').trim();
        const roleName = String(item.role ?? '').trim();
        if (!employeeId) return null;
        return {
          employeeId,
          label: `${fullName || employeeId}${email ? ` • ${email}` : ''}${roleName ? ` (${roleName})` : ''}`
        };
      })
      .filter((item): item is { employeeId: string; label: string } => Boolean(item?.employeeId));
  }, [iamUsers]);

  const globalValidationErrors = fieldErrorMap.__global ?? [];

  // ── Data loaders ──────────────────────────────
  const loadCenter = async () => {
    const payload = await apiRequest<CenterPayload>('/settings/center');
    setCenter(payload);
  };

  const loadLayout = async () => {
    try {
      const payload = await apiRequest<Record<string, unknown>>('/settings/layout');
      setSettingsLayout(payload as SettingsLayoutPayload);
    } catch {
      // Keep local fallback layout when endpoint is unavailable.
    }
  };

  const loadDomain = async (domain: DomainKey) => {
    const payload = await apiRequest<DomainPayload>(`/settings/domains/${domain}`);
    setDomainResponse(payload);
    setDraftData(cloneJson(toRecord(payload.data)));
    setValidationResult(payload.validation ? { ...payload.validation } : null);
    setTestResult(null);
  };

  const loadSalesTaxonomy = async () => {
    const payload = await apiRequest<Partial<SalesTaxonomyPayload>>('/settings/sales-taxonomy');
    setSalesTaxonomy({
      stages: Array.isArray(payload.stages) ? payload.stages : [],
      sources: Array.isArray(payload.sources) ? payload.sources : []
    });
  };

  const loadCrmTagRegistry = async () => {
    const payload = await apiRequest<Partial<CrmTagRegistryPayload>>('/settings/crm-tags');
    setCrmTagRegistry({
      customerTags: Array.isArray(payload.customerTags) ? payload.customerTags : [],
      interactionTags: Array.isArray(payload.interactionTags) ? payload.interactionTags : [],
      interactionResultTags: Array.isArray(payload.interactionResultTags) ? payload.interactionResultTags : []
    });
  };

  const loadIamMismatchReport = async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setIamMismatchBusy(true);
    try {
      const payload = await apiRequest<Record<string, unknown>>('/settings/permissions/iam-v2/mismatch-report', {
        query: {
          limit: iamMismatchFilter.limit,
          moduleKey: iamMismatchFilter.moduleKey || undefined,
          action: iamMismatchFilter.action || undefined
        }
      });
      setIamMismatchReport(normalizeIamMismatchReport(payload));
    } catch {
      setIamMismatchReport({ generatedAt: '', totalMismatches: 0, totalGroups: 0, items: [] });
    } finally {
      if (!options.silent) setIamMismatchBusy(false);
    }
  };

  const loadEnterpriseData = async () => {
    const [iamPayload, orgPayload, positionPayload] = await Promise.all([
      apiRequest<Record<string, unknown>>('/settings/iam/users', { query: { limit: 120 } }),
      apiRequest<Record<string, unknown>>('/settings/organization/tree'),
      apiRequest<Record<string, unknown>>('/settings/positions', { query: { limit: 300 } })
    ]);

    const iamItems = normalizeListPayload(iamPayload);
    const orgRows = normalizeListPayload(orgPayload);
    const orgRoots = Array.isArray(orgPayload.tree) ? (orgPayload.tree as Record<string, unknown>[]) : [];
    const positionItems = normalizePositionRows(positionPayload);

    setIamUsers(iamItems);
    setOrgItems(orgRows);
    setOrgTree(orgRoots);
    setPositions(positionItems);
    setSelectedOverrideUserId((current) => {
      if (current && iamItems.some((item) => String(item.id ?? '').trim() === current)) return current;
      return String(iamItems[0]?.id ?? '').trim();
    });
  };

  const reloadAll = async (domain = selectedDomain) => {
    setBusy(true);
    setError(null);
    const failures: string[] = [];
    const shouldLoadMismatch = domain === 'access_security';

    const [centerResult, domainResult, enterpriseResult, layoutResult, salesTaxonomyResult, crmTagRegistryResult, mismatchResult] =
      await Promise.allSettled([
        loadCenter(),
        loadDomain(domain),
        loadEnterpriseData(),
        loadLayout(),
        loadSalesTaxonomy(),
        loadCrmTagRegistry(),
        shouldLoadMismatch ? loadIamMismatchReport({ silent: true }) : Promise.resolve(undefined)
      ]);

    if (centerResult.status === 'rejected') failures.push(toSettingsFriendlyError(centerResult.reason, 'Không tải được tổng quan miền cấu hình.'));
    if (domainResult.status === 'rejected') failures.push(toSettingsFriendlyError(domainResult.reason, 'Không tải được cấu hình của miền đã chọn.'));
    if (enterpriseResult.status === 'rejected') failures.push(toSettingsFriendlyError(enterpriseResult.reason, 'Không tải được dữ liệu tổ chức/IAM.'));
    if (layoutResult.status === 'rejected') failures.push(toSettingsFriendlyError(layoutResult.reason, 'Không tải được metadata layout settings.'));
    if (salesTaxonomyResult.status === 'rejected') failures.push(toSettingsFriendlyError(salesTaxonomyResult.reason, 'Không tải được taxonomy CRM.'));
    if (crmTagRegistryResult.status === 'rejected') failures.push(toSettingsFriendlyError(crmTagRegistryResult.reason, 'Không tải được CRM tag registry.'));
    if (mismatchResult.status === 'rejected') failures.push(toSettingsFriendlyError(mismatchResult.reason, 'Không tải được IAM mismatch report.'));

    if (failures.length > 0) setError(failures.join(' | '));
    setBusy(false);
  };

  // ── Effects ───────────────────────────────────
  useEffect(() => { setAdvancedTouchedByUser(false); }, [role]);

  useEffect(() => {
    if (!advancedTouchedByUser) setAdvancedMode(resolveAdvancedModeDefaultByLayout(role, settingsLayout));
  }, [role, settingsLayout, advancedTouchedByUser]);

  useEffect(() => {
    setActiveDomainTab((current) => resolveActiveTab(domainTabs, current));
  }, [domainTabs]);

  useEffect(() => { void reloadAll(selectedDomain); }, [selectedDomain]);

  useEffect(() => {
    const visibleIdSet = new Set(iamUsers.slice(0, 40).map((item) => String(item.id ?? '')));
    setSelectedIamUserIds((prev) => prev.filter((id) => visibleIdSet.has(String(id))));
  }, [iamUsers]);

  useEffect(() => {
    if (!selectedOverrideUserId) { setOverrideMatrix(createEmptyPermissionMatrix()); return; }
    let mounted = true;
    const load = async () => {
      try {
        const payload = await apiRequest<Record<string, unknown>>('/settings/permissions/effective', {
          query: { userId: selectedOverrideUserId }
        });
        const rules = Array.isArray(payload.overrides) ? (payload.overrides as PermissionRuleRow[]) : [];
        if (mounted) setOverrideMatrix(mapRulesToMatrix(rules));
      } catch {
        if (mounted) setOverrideMatrix(createEmptyPermissionMatrix());
      }
    };
    void load();
    return () => { mounted = false; };
  }, [selectedOverrideUserId]);

  useEffect(() => {
    if (sectionViewModels.length === 0) return;
    setSectionCollapseState((current) => {
      let changed = false;
      const next = { ...current };
      for (const item of sectionViewModels) {
        if (item.sectionKey in next) continue;
        next[item.sectionKey] = item.defaultCollapsed;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [sectionViewModels]);

  // ── Field update ──────────────────────────────
  const updateField = (field: FieldConfig, input: unknown) => {
    setDraftData((current) => setFieldValue(field, current, input));
    setValidationResult(null);
  };

  // ── Handlers ──────────────────────────────────
  const handleValidate = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await apiRequest<Record<string, unknown>>(`/settings/domains/${selectedDomain}/validate`, {
        method: 'POST', body: submissionData
      });
      setValidationResult(result);
      setMessage('Kiểm tra thành công. Nếu có lỗi, hệ thống hiển thị ngay cạnh từng trường.');
      await loadCenter();
    } catch (validateError) {
      setError(toSettingsFriendlyError(validateError, 'Kiểm tra thất bại.'));
    } finally { setBusy(false); }
  };

  const handleSave = async () => {
    if (!reasonTemplate.trim()) { setError('Vui lòng chọn lý do thay đổi.'); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      await apiRequest(`/settings/domains/${selectedDomain}`, {
        method: 'PUT', body: { ...submissionData, reasonTemplate, reasonNote }
      });
      setMessage('Lưu cấu hình thành công.');
      setReasonNote('');
      await reloadAll(selectedDomain);
    } catch (saveError) {
      setError(toSettingsFriendlyError(saveError, 'Lưu cấu hình thất bại.'));
    } finally { setBusy(false); }
  };

  const handleTestConnection = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await apiRequest<Record<string, unknown>>(`/settings/domains/${selectedDomain}/test-connection`, {
        method: 'POST', body: submissionData
      });
      setTestResult(result);
      setMessage('Đã chạy kiểm tra kết nối.');
      await reloadAll(selectedDomain);
    } catch (probeError) {
      setError(toSettingsFriendlyError(probeError, 'Test connection thất bại.'));
    } finally { setBusy(false); }
  };

  const handleCreateSnapshot = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const snapshot = await apiRequest<Record<string, unknown>>('/settings/snapshots', {
        method: 'POST', body: { reasonTemplate, reasonNote, domains: [selectedDomain] }
      });
      const id = String(snapshot.id ?? '');
      if (id) setSelectedSnapshotId(id);
      setMessage('Đã tạo snapshot cho domain hiện tại.');
      await loadCenter();
    } catch (snapshotError) {
      setError(toSettingsFriendlyError(snapshotError, 'Tạo snapshot thất bại.'));
    } finally { setBusy(false); }
  };

  const handleRestoreSnapshot = async () => {
    if (!selectedSnapshotId) { setError('Vui lòng chọn snapshot để khôi phục.'); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      await apiRequest(`/settings/snapshots/${selectedSnapshotId}/restore`, {
        method: 'POST', body: { reasonTemplate, reasonNote, domains: [selectedDomain] }
      });
      setMessage('Khôi phục snapshot thành công.');
      await reloadAll(selectedDomain);
    } catch (restoreError) {
      setError(toSettingsFriendlyError(restoreError, 'Khôi phục snapshot thất bại.'));
    } finally { setBusy(false); }
  };

  // ── Taxonomy handlers ─────────────────────────
  const isSalesTaxonomyType = (type: TaxonomyManagerType): type is SalesTaxonomyType =>
    type === 'stages' || type === 'sources';

  const isCrmTagRegistryType = (type: TaxonomyManagerType): type is CrmTagRegistryType =>
    type === 'customerTags' || type === 'interactionTags' || type === 'interactionResultTags';

  const handleCreateSalesTaxonomy = async (type: SalesTaxonomyType, value: string) => {
    setSalesTaxonomyBusy(true); setError(null); setMessage(null);
    try {
      await apiRequest(`/settings/sales-taxonomy/${type}`, { method: 'POST', body: { value, reasonTemplate, reasonNote } });
      await Promise.all([loadSalesTaxonomy(), loadCenter(), selectedDomain === 'sales_crm_policies' ? loadDomain(selectedDomain) : Promise.resolve()]);
      setMessage('Đã thêm taxonomy CRM thành công.');
    } catch (taxonomyError) { setError(toSettingsFriendlyError(taxonomyError, 'Không thể thêm taxonomy CRM.')); }
    finally { setSalesTaxonomyBusy(false); }
  };

  const handleRenameSalesTaxonomy = async (type: SalesTaxonomyType, currentValue: string, nextValue: string) => {
    setSalesTaxonomyBusy(true); setError(null); setMessage(null);
    try {
      await apiRequest(`/settings/sales-taxonomy/${type}/${encodeURIComponent(currentValue)}`, { method: 'PATCH', body: { nextValue, reasonTemplate, reasonNote } });
      await Promise.all([loadSalesTaxonomy(), loadCenter(), selectedDomain === 'sales_crm_policies' ? loadDomain(selectedDomain) : Promise.resolve()]);
      setMessage('Đã cập nhật taxonomy CRM thành công.');
    } catch (taxonomyError) { setError(toSettingsFriendlyError(taxonomyError, 'Không thể cập nhật taxonomy CRM.')); }
    finally { setSalesTaxonomyBusy(false); }
  };

  const handleDeleteSalesTaxonomy = async (type: SalesTaxonomyType, value: string) => {
    setSalesTaxonomyBusy(true); setError(null); setMessage(null);
    try {
      await apiRequest(`/settings/sales-taxonomy/${type}/${encodeURIComponent(value)}`, { method: 'DELETE', body: { reasonTemplate, reasonNote } });
      await Promise.all([loadSalesTaxonomy(), loadCenter(), selectedDomain === 'sales_crm_policies' ? loadDomain(selectedDomain) : Promise.resolve()]);
      setMessage('Đã xóa taxonomy CRM thành công.');
    } catch (taxonomyError) { setError(toSettingsFriendlyError(taxonomyError, 'Không thể xóa taxonomy CRM.')); }
    finally { setSalesTaxonomyBusy(false); }
  };

  const handleCreateCrmTagRegistry = async (type: CrmTagRegistryType, value: string) => {
    setCrmTagRegistryBusy(true); setError(null); setMessage(null);
    try {
      await apiRequest(`/settings/crm-tags/${type}`, { method: 'POST', body: { value, reasonTemplate, reasonNote } });
      await Promise.all([loadCrmTagRegistry(), loadCenter(), selectedDomain === 'sales_crm_policies' ? loadDomain(selectedDomain) : Promise.resolve()]);
      setMessage('Đã thêm CRM tag thành công.');
    } catch (registryError) { setError(toSettingsFriendlyError(registryError, 'Không thể thêm CRM tag.')); }
    finally { setCrmTagRegistryBusy(false); }
  };

  const handleRenameCrmTagRegistry = async (type: CrmTagRegistryType, currentValue: string, nextValue: string) => {
    setCrmTagRegistryBusy(true); setError(null); setMessage(null);
    try {
      await apiRequest(`/settings/crm-tags/${type}/${encodeURIComponent(currentValue)}`, { method: 'PATCH', body: { nextValue, reasonTemplate, reasonNote } });
      await Promise.all([loadCrmTagRegistry(), loadCenter(), selectedDomain === 'sales_crm_policies' ? loadDomain(selectedDomain) : Promise.resolve()]);
      setMessage('Đã cập nhật CRM tag thành công.');
    } catch (registryError) { setError(toSettingsFriendlyError(registryError, 'Không thể cập nhật CRM tag.')); }
    finally { setCrmTagRegistryBusy(false); }
  };

  const handleDeleteCrmTagRegistry = async (type: CrmTagRegistryType, value: string) => {
    setCrmTagRegistryBusy(true); setError(null); setMessage(null);
    try {
      await apiRequest(`/settings/crm-tags/${type}/${encodeURIComponent(value)}`, { method: 'DELETE', body: { reasonTemplate, reasonNote } });
      await Promise.all([loadCrmTagRegistry(), loadCenter(), selectedDomain === 'sales_crm_policies' ? loadDomain(selectedDomain) : Promise.resolve()]);
      setMessage('Đã xóa CRM tag thành công.');
    } catch (registryError) { setError(toSettingsFriendlyError(registryError, 'Không thể xóa CRM tag.')); }
    finally { setCrmTagRegistryBusy(false); }
  };

  // ── IAM handlers ──────────────────────────────
  const updateMatrixCell = (
    setter: Dispatch<SetStateAction<PermissionMatrix>>,
    moduleKey: string,
    action: PermissionActionKey,
    effect: PermissionEffectValue
  ) => {
    setter((current) => ({
      ...current,
      [moduleKey]: {
        ...(current[moduleKey] ?? { VIEW: '', CREATE: '', UPDATE: '', DELETE: '', APPROVE: '' }),
        [action]: effect
      }
    }));
  };

  const handleCreateIamUser = async () => {
    if (!accountForm.fullName.trim() || !accountForm.email.trim()) { setError('Vui lòng nhập đầy đủ họ tên và email khi tạo tài khoản.'); return; }
    setBusy(true); setError(null);
    try {
      const payload = await apiRequest<Record<string, unknown>>('/settings/iam/users', {
        method: 'POST', body: { fullName: accountForm.fullName, email: accountForm.email, role: accountForm.role, positionId: accountForm.positionId || undefined, orgUnitId: accountForm.orgUnitId || undefined }
      });
      const temporaryPassword = String(payload.temporaryPassword ?? '');
      setMessage(temporaryPassword ? `Đã tạo tài khoản. Mật khẩu tạm one-time: ${temporaryPassword}` : 'Đã tạo tài khoản nhân viên thành công.');
      setAccountForm({ fullName: '', email: '', role: 'USER', positionId: '', orgUnitId: '' });
      await loadEnterpriseData();
    } catch (saveError) { setError(toSettingsFriendlyError(saveError, 'Tạo tài khoản nhân viên thất bại.')); }
    finally { setBusy(false); }
  };

  const handleResetIamPassword = async (userId: string) => {
    if (!userId) return;
    setBusy(true); setError(null);
    try {
      const payload = await apiRequest<Record<string, unknown>>(`/settings/iam/users/${userId}/reset-password`, { method: 'POST' });
      const temporaryPassword = String(payload.temporaryPassword ?? '');
      setMessage(temporaryPassword ? `Đã reset mật khẩu tạm: ${temporaryPassword}` : 'Đã reset mật khẩu tạm.');
      await loadEnterpriseData();
    } catch (resetError) { setError(toSettingsFriendlyError(resetError, 'Reset mật khẩu thất bại.')); }
    finally { setBusy(false); }
  };

  const handleBulkResetIamPassword = async () => {
    const ids = selectedIamUserIds.map((id) => String(id)).filter(Boolean);
    if (ids.length === 0) { setError('Vui lòng chọn ít nhất 1 tài khoản IAM.'); return; }
    if (!window.confirm(`Reset mật khẩu tạm cho ${ids.length} tài khoản đã chọn?`)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await runBulkOperation({ ids, continueOnError: true, chunkSize: 10, execute: async (userId) => { await apiRequest(`/settings/iam/users/${userId}/reset-password`, { method: 'POST' }); } });
      const normalized: BulkExecutionResult = { ...result, actionLabel: 'Reset mật khẩu IAM', message: formatBulkSummary({ ...result, actionLabel: 'Reset mật khẩu IAM' }, 'Reset mật khẩu IAM') };
      if (normalized.successCount > 0) await loadEnterpriseData();
      setMessage(normalized.message ?? null);
      if (normalized.failedCount > 0) setError('Một số tài khoản IAM reset mật khẩu thất bại.');
    } catch (bulkError) { setError(toSettingsFriendlyError(bulkError, 'Bulk reset mật khẩu thất bại.')); }
    finally { setBusy(false); }
  };

  // ── Org handlers ──────────────────────────────
  const handleCreateOrgUnit = async () => {
    if (!orgUnitForm.name.trim()) { setError('Vui lòng nhập tên node tổ chức.'); return; }
    setBusy(true); setError(null);
    try {
      await apiRequest('/settings/organization/units', { method: 'POST', body: { name: orgUnitForm.name, type: orgUnitForm.type, parentId: orgUnitForm.parentId || undefined, managerEmployeeId: orgUnitForm.managerEmployeeId || undefined } });
      setMessage('Đã tạo node tổ chức.');
      setOrgUnitForm({ name: '', type: 'TEAM', parentId: '', managerEmployeeId: '' });
      await loadEnterpriseData();
    } catch (createError) { setError(toSettingsFriendlyError(createError, 'Tạo node tổ chức thất bại.')); }
    finally { setBusy(false); }
  };

  const handleAssignOrgManager = async () => {
    if (!orgManagerForm.unitId) { setError('Vui lòng chọn org unit để gán quản lý.'); return; }
    setBusy(true); setError(null);
    try {
      await apiRequest(`/settings/organization/units/${orgManagerForm.unitId}`, { method: 'PATCH', body: { managerEmployeeId: orgManagerForm.managerEmployeeId || '' } });
      setMessage('Đã cập nhật quản lý cho org unit.');
      await loadEnterpriseData();
    } catch (assignError) { setError(toSettingsFriendlyError(assignError, 'Cập nhật manager org unit thất bại.')); }
    finally { setBusy(false); }
  };

  const handleMoveOrgUnit = async () => {
    if (!orgMoveForm.unitId || !orgMoveForm.parentId) { setError('Vui lòng chọn đầy đủ node cần chuyển và parent mới.'); return; }
    setBusy(true); setError(null);
    try {
      await apiRequest(`/settings/organization/units/${orgMoveForm.unitId}/move`, { method: 'POST', body: { parentId: orgMoveForm.parentId } });
      setMessage('Đã di chuyển node tổ chức.');
      await loadEnterpriseData();
    } catch (moveError) { setError(toSettingsFriendlyError(moveError, 'Di chuyển node thất bại.')); }
    finally { setBusy(false); }
  };

  // ── Position handlers ─────────────────────────
  const resetPositionForm = () => { setPositionForm({ id: '', title: '', code: '', level: '', status: 'ACTIVE' }); };
  const handleOpenCreatePosition = () => { setPositionFormMode('create'); resetPositionForm(); setShowPositionForm(true); };
  const handleOpenEditPosition = (item: PositionSummaryItem) => { setPositionFormMode('edit'); setPositionForm({ id: item.id, title: item.title, code: item.code, level: item.level, status: item.status || 'ACTIVE' }); setShowPositionForm(true); };
  const handleCancelPositionForm = () => { setShowPositionForm(false); resetPositionForm(); };

  const handleSubmitPositionForm = async () => {
    const title = positionForm.title.trim();
    if (!title) { setError('Tên vị trí không được để trống.'); return; }
    setBusy(true); setError(null);
    try {
      const path = positionFormMode === 'create' ? '/settings/positions' : `/settings/positions/${positionForm.id}`;
      const method = positionFormMode === 'create' ? 'POST' : 'PATCH';
      await apiRequest<Record<string, unknown>>(path, { method, body: { title, code: positionForm.code.trim() || undefined, level: positionForm.level.trim() || undefined, status: positionForm.status } });
      setMessage(positionFormMode === 'create' ? 'Đã thêm vị trí công việc.' : 'Đã cập nhật vị trí công việc.');
      setShowPositionForm(false); resetPositionForm();
      await loadEnterpriseData();
    } catch (positionError) { setError(toSettingsFriendlyError(positionError, positionFormMode === 'create' ? 'Thêm vị trí thất bại.' : 'Cập nhật vị trí thất bại.')); }
    finally { setBusy(false); }
  };

  const handleDeletePosition = async (item: PositionSummaryItem) => {
    if (!window.confirm(`Xóa vị trí '${item.title}'?`)) return;
    setBusy(true); setError(null);
    try {
      await apiRequest(`/settings/positions/${item.id}`, { method: 'DELETE' });
      setMessage('Đã xóa vị trí công việc.');
      await loadEnterpriseData();
    } catch (deleteError) { setError(toSettingsFriendlyError(deleteError, 'Xóa vị trí thất bại.')); }
    finally { setBusy(false); }
  };

  // ── Override handlers ─────────────────────────
  const handleSaveUserOverrides = async () => {
    if (!selectedOverrideUserId) { setError('Vui lòng chọn user để cấu hình override.'); return; }
    setBusy(true); setError(null);
    try {
      await apiRequest(`/settings/permissions/users/${selectedOverrideUserId}/overrides`, { method: 'PUT', body: { reason: reasonTemplate, rules: mapMatrixToRules(overrideMatrix) } });
      setMessage('Đã lưu override quyền theo user.');
      await loadEnterpriseData();
    } catch (overrideError) { setError(toSettingsFriendlyError(overrideError, 'Lưu override quyền thất bại.')); }
    finally { setBusy(false); }
  };

  const handleSaveIamScopeOverride = async () => {
    if (!selectedOverrideUserId) { setError('Vui lòng chọn user để cấu hình scope override.'); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      await apiRequest(`/settings/iam/users/${selectedOverrideUserId}/scope-override`, { method: 'PUT', body: { scopeMode: iamScopeOverrideForm.scopeMode, rootOrgUnitId: iamScopeOverrideForm.rootOrgUnitId || undefined, reason: iamScopeOverrideForm.reason.trim() || undefined } });
      setMessage('Đã cập nhật IAM scope override.');
    } catch (scopeError) { setError(toSettingsFriendlyError(scopeError, 'Cập nhật IAM scope override thất bại.')); }
    finally { setBusy(false); }
  };

  const handleUpsertIamTitleScopeMapping = async (remove = false) => {
    if (!iamTitleScopeForm.titlePattern.trim()) { setError('Vui lòng nhập title pattern.'); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      await apiRequest('/settings/iam/title-scope-mapping', { method: 'PUT', body: { titlePattern: iamTitleScopeForm.titlePattern.trim(), scopeMode: iamTitleScopeForm.scopeMode, priority: iamTitleScopeForm.priority, reason: iamTitleScopeForm.reason.trim() || undefined, remove } });
      setMessage(remove ? 'Đã xóa IAM title scope mapping.' : 'Đã cập nhật IAM title scope mapping.');
    } catch (titleScopeError) { setError(toSettingsFriendlyError(titleScopeError, remove ? 'Xóa IAM title scope mapping thất bại.' : 'Cập nhật IAM title scope mapping thất bại.')); }
    finally { setBusy(false); }
  };

  // ── Return ────────────────────────────────────
  return {
    // Role & access
    role, normalizedRole, canManagePositionCatalog, canManageIamAdmin,
    // Core state
    center, selectedDomain, setSelectedDomain, settingsSearch, setSettingsSearch,
    advancedMode, setAdvancedMode, advancedTouchedByUser, setAdvancedTouchedByUser,
    activeDomainTab, setActiveDomainTab, busy, error, message,
    // Domain config
    domainConfig, domaintitle, domaindescription, domainTabs, resolvedActiveDomainTab, activeTabConfig,
    visibleSections, sectionViewModels, sidebarGroups,
    // Data
    draftData, submissionData, originalData, fieldChanges, fieldErrorMap, globalValidationErrors,
    validationErrors, validationWarnings, validationResult, testResult,
    sectionCollapseState, setSectionCollapseState,
    // Taxonomy
    salesTaxonomy, salesTaxonomyBusy, crmTagRegistry, crmTagRegistryBusy,
    hrAppendixFieldPickerOptions, isSalesTaxonomyType, isCrmTagRegistryType,
    // Reason
    reasonTemplate, setReasonTemplate, reasonNote, setReasonNote,
    selectedSnapshotId, setSelectedSnapshotId,
    // IAM
    iamUsers, selectedIamUserIds, setSelectedIamUserIds,
    orgItems, orgTree, positions, filteredPositions, positionOptions, orgUnitOptions, managerEmployeeOptions,
    positionSearch, setPositionSearch, showPositionForm, positionFormMode, positionForm, setPositionForm,
    selectedOverrideUserId, setSelectedOverrideUserId, overrideMatrix, setOverrideMatrix,
    iamScopeOverrideForm, setIamScopeOverrideForm, iamTitleScopeForm, setIamTitleScopeForm,
    iamMismatchFilter, setIamMismatchFilter, iamMismatchReport, iamMismatchBusy,
    accountForm, setAccountForm, orgUnitForm, setOrgUnitForm, orgMoveForm, setOrgMoveForm, orgManagerForm, setOrgManagerForm,
    // Field actions
    updateField, getFieldValue: (field: FieldConfig) => getFieldValue(field, draftData),
    // Handlers
    reloadAll, handleValidate, handleSave, handleTestConnection, handleCreateSnapshot, handleRestoreSnapshot,
    handleCreateSalesTaxonomy, handleRenameSalesTaxonomy, handleDeleteSalesTaxonomy,
    handleCreateCrmTagRegistry, handleRenameCrmTagRegistry, handleDeleteCrmTagRegistry,
    handleCreateIamUser, handleResetIamPassword, handleBulkResetIamPassword,
    handleCreateOrgUnit, handleAssignOrgManager, handleMoveOrgUnit,
    handleOpenCreatePosition, handleOpenEditPosition, handleCancelPositionForm, handleSubmitPositionForm, handleDeletePosition,
    handleSaveUserOverrides, handleSaveIamScopeOverride, handleUpsertIamTitleScopeMapping,
    updateMatrixCell, loadIamMismatchReport,
  };
}
