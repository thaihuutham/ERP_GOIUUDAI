'use client';

import { ArrowLeft, Car, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { readStoredAuthSession } from '../lib/auth-session';
import {
  apiRequest,
  normalizeListPayload,
  normalizePagedListPayload,
  type ApiListSortMeta
} from '../lib/api-client';
import { downloadExcelTemplate } from '../lib/excel-template';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { useCursorTableState } from '../lib/use-cursor-table-state';
import { useAccessPolicy } from './access-policy-context';
import { ExcelImportBlock } from './ui/excel-import-block';
import { useUserRole } from './user-role-context';
import { Badge, statusToBadge } from './ui/badge';
import { SidePanel } from './ui/side-panel';
import { ColumnDefinition, StandardDataTable } from './ui/standard-data-table';

type VehicleKindOption = 'ALL' | 'AUTO' | 'MOTO';

type VehicleRecord = {
  id: string;
  ownerCustomerId?: string | null;
  ownerFullName?: string | null;
  ownerAddress?: string | null;
  plateNumber?: string | null;
  chassisNumber?: string | null;
  engineNumber?: string | null;
  vehicleKind?: string | null;
  vehicleType?: string | null;
  seatCount?: number | null;
  loadKg?: number | null;
  status?: string | null;
  updatedAt?: string | null;
  ownerCustomer?: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
    ownerStaffId?: string | null;
  } | null;
};

type CustomerOption = {
  id: string;
  fullName?: string | null;
  phone?: string | null;
  ownerStaffId?: string | null;
};

type VehicleFormState = {
  ownerCustomerId: string;
  ownerFullName: string;
  ownerAddress: string;
  plateNumber: string;
  chassisNumber: string;
  engineNumber: string;
  vehicleKind: 'AUTO' | 'MOTO';
  vehicleType: string;
  seatCount: string;
  loadKg: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
};

type VehicleImportRow = {
  ownerCustomerId?: string;
  ownerCustomerPhone?: string;
  ownerFullName?: string;
  ownerAddress?: string;
  plateNumber?: string;
  chassisNumber?: string;
  engineNumber?: string;
  vehicleKind?: 'AUTO' | 'MOTO';
  vehicleType?: string;
  seatCount?: number;
  loadKg?: number;
  status?: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
};

type VehicleImportError = {
  rowIndex: number;
  plateNumber?: string;
  message: string;
};

type VehicleImportResponse = {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errors: VehicleImportError[];
};

const AUTH_ENABLED = String(process.env.NEXT_PUBLIC_AUTH_ENABLED ?? 'false').trim().toLowerCase() === 'true';
const FETCH_LIMIT = 200;
const VEHICLE_TABLE_PAGE_SIZE = 25;
const VEHICLE_COLUMN_SETTINGS_STORAGE_KEY = 'erp-retail.crm.vehicles-table-settings.v1';

function toDateTime(value: string | null | undefined) {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatRuntimeDateTime(parsed.toISOString());
}

function normalizeVehicleKind(input: unknown): 'AUTO' | 'MOTO' {
  const normalized = String(input ?? '').trim().toUpperCase();
  return normalized === 'MOTO' ? 'MOTO' : 'AUTO';
}

function buildVehicleForm(vehicle: VehicleRecord | null, fallbackOwnerCustomerId = '', fallbackOwnerFullName = ''): VehicleFormState {
  const normalizedStatus = String(vehicle?.status ?? '').trim().toUpperCase();
  return {
    ownerCustomerId: String(vehicle?.ownerCustomerId ?? fallbackOwnerCustomerId ?? '').trim(),
    ownerFullName: vehicle?.ownerFullName ?? fallbackOwnerFullName ?? '',
    ownerAddress: vehicle?.ownerAddress ?? '',
    plateNumber: vehicle?.plateNumber ?? '',
    chassisNumber: vehicle?.chassisNumber ?? '',
    engineNumber: vehicle?.engineNumber ?? '',
    vehicleKind: normalizeVehicleKind(vehicle?.vehicleKind),
    vehicleType: vehicle?.vehicleType ?? '',
    seatCount: vehicle?.seatCount !== null && vehicle?.seatCount !== undefined ? String(vehicle.seatCount) : '',
    loadKg: vehicle?.loadKg !== null && vehicle?.loadKg !== undefined ? String(vehicle.loadKg) : '',
    status: normalizedStatus === 'INACTIVE' ? 'INACTIVE' : normalizedStatus === 'DRAFT' ? 'DRAFT' : 'ACTIVE'
  };
}

function normalizeHeaderKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function extractExcelHeaderValue(row: Record<string, unknown>, aliases: string[]) {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(normalizeHeaderKey(key), value);
  }

  for (const alias of aliases) {
    const value = normalized.get(alias);
    if (value === undefined || value === null || value === '') {
      continue;
    }
    return value;
  }
  return undefined;
}

function toOptionalNonNegativeInt(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.trunc(parsed);
}

function parseVehicleKindFromExcel(value: unknown): 'AUTO' | 'MOTO' | undefined {
  const normalized = normalizeHeaderKey(String(value ?? ''));
  if (!normalized) {
    return undefined;
  }
  if (['moto', 'xemay', 'motorbike', 'motorcycle'].some((keyword) => normalized.includes(keyword))) {
    return 'MOTO';
  }
  if (['auto', 'oto', 'otocar', 'car', 'xeoto'].some((keyword) => normalized.includes(keyword))) {
    return 'AUTO';
  }
  return undefined;
}

function parseStatusFromExcel(value: unknown): 'ACTIVE' | 'INACTIVE' | 'DRAFT' | undefined {
  const normalized = normalizeHeaderKey(String(value ?? ''));
  if (!normalized) {
    return undefined;
  }
  if (['inactive', 'ngung', 'dung'].includes(normalized)) {
    return 'INACTIVE';
  }
  if (['draft', 'nhap', 'tam'].includes(normalized)) {
    return 'DRAFT';
  }
  if (['active', 'hoatdong'].includes(normalized)) {
    return 'ACTIVE';
  }
  return undefined;
}

async function parseVehicleImportXlsx(file: File): Promise<VehicleImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return [];
  }
  const sheet = workbook.Sheets[firstSheet];
  const parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: true,
    defval: null
  });

  const rows = parsedRows.map((row) => {
    const ownerCustomerIdRaw = extractExcelHeaderValue(row, ['ownercustomerid', 'customerid', 'khachhangid']);
    const ownerCustomerPhoneRaw = extractExcelHeaderValue(row, [
      'ownercustomerphone',
      'customerphone',
      'ownerphone',
      'phone',
      'sodienthoai',
      'dienthoai',
      'sdt'
    ]);
    const ownerFullNameRaw = extractExcelHeaderValue(row, ['ownerfullname', 'ownername', 'chuxe', 'owner']);
    const ownerAddressRaw = extractExcelHeaderValue(row, ['owneraddress', 'diachichuxe', 'address']);
    const plateNumberRaw = extractExcelHeaderValue(row, ['platenumber', 'bienso', 'plate']);
    const chassisNumberRaw = extractExcelHeaderValue(row, ['chassisnumber', 'sokhung', 'chassis']);
    const engineNumberRaw = extractExcelHeaderValue(row, ['enginenumber', 'somay', 'engine']);
    const vehicleKindRaw = extractExcelHeaderValue(row, ['vehiclekind', 'loaixe', 'nhomxe', 'kind']);
    const vehicleTypeRaw = extractExcelHeaderValue(row, ['vehicletype', 'dongxe', 'type', 'model']);
    const seatCountRaw = extractExcelHeaderValue(row, ['seatcount', 'socho', 'seats']);
    const loadKgRaw = extractExcelHeaderValue(row, ['loadkg', 'taitrong', 'load']);
    const statusRaw = extractExcelHeaderValue(row, ['status', 'trangthai']);

    const parsed: VehicleImportRow = {
      ownerCustomerId: ownerCustomerIdRaw ? String(ownerCustomerIdRaw).trim() : undefined,
      ownerCustomerPhone: ownerCustomerPhoneRaw ? String(ownerCustomerPhoneRaw).trim() : undefined,
      ownerFullName: ownerFullNameRaw ? String(ownerFullNameRaw).trim() : undefined,
      ownerAddress: ownerAddressRaw ? String(ownerAddressRaw).trim() : undefined,
      plateNumber: plateNumberRaw ? String(plateNumberRaw).trim().toUpperCase() : undefined,
      chassisNumber: chassisNumberRaw ? String(chassisNumberRaw).trim().toUpperCase() : undefined,
      engineNumber: engineNumberRaw ? String(engineNumberRaw).trim().toUpperCase() : undefined,
      vehicleKind: parseVehicleKindFromExcel(vehicleKindRaw),
      vehicleType: vehicleTypeRaw ? String(vehicleTypeRaw).trim() : undefined,
      seatCount: toOptionalNonNegativeInt(seatCountRaw),
      loadKg: toOptionalNonNegativeInt(loadKgRaw),
      status: parseStatusFromExcel(statusRaw)
    };
    return parsed;
  });

  return rows.filter((row) => Object.values(row).some((value) => value !== undefined && String(value).trim() !== ''));
}

function resolveCurrentActorIdentity(role: string) {
  const roleUpper = String(role ?? '').trim().toUpperCase();
  const normalizedRole = roleUpper === 'ADMIN' ? 'ADMIN' : roleUpper === 'STAFF' ? 'STAFF' : 'MANAGER';
  if (!AUTH_ENABLED) {
    return {
      role: normalizedRole,
      userId: `dev_${normalizedRole.toLowerCase()}`,
      isAdmin: normalizedRole === 'ADMIN'
    };
  }

  const session = readStoredAuthSession();
  return {
    role: normalizedRole,
    userId: String(session?.user?.id ?? '').trim(),
    isAdmin: normalizedRole === 'ADMIN'
  };
}

export function CrmVehiclesBoard() {
  const { canModule, canAction } = useAccessPolicy();
  const { role } = useUserRole();
  const actorIdentity = useMemo(() => resolveCurrentActorIdentity(role), [role]);
  const canView = canModule('crm');
  const canCreate = canAction('crm', 'CREATE');
  const canUpdate = canAction('crm', 'UPDATE');
  const canDelete = canAction('crm', 'DELETE');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [ownerCustomerFilter, setOwnerCustomerFilter] = useState('');
  const [vehicleKindFilter, setVehicleKindFilter] = useState<VehicleKindOption>('ALL');
  const [tableSortBy, setTableSortBy] = useState('updatedAt');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');
  const [tableSortMeta, setTableSortMeta] = useState<ApiListSortMeta | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleRecord | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState<VehicleFormState>(buildVehicleForm(null));
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);
  const [archivingVehicleId, setArchivingVehicleId] = useState<string | null>(null);
  const [isImportingFile, setIsImportingFile] = useState(false);
  const [importSummary, setImportSummary] = useState<VehicleImportResponse | null>(null);
  const vehicleTableFingerprint = useMemo(
    () =>
      JSON.stringify({
        q: search.trim(),
        ownerCustomerId: ownerCustomerFilter,
        vehicleKind: vehicleKindFilter,
        sortBy: tableSortBy,
        sortDir: tableSortDir,
        limit: VEHICLE_TABLE_PAGE_SIZE
      }),
    [ownerCustomerFilter, search, tableSortBy, tableSortDir, vehicleKindFilter]
  );
  const vehicleTablePager = useCursorTableState(vehicleTableFingerprint);

  const manageableCustomers = useMemo(() => {
    if (actorIdentity.isAdmin) {
      return customers;
    }
    return customers.filter((customer) => {
      const ownerStaffId = String(customer.ownerStaffId ?? '').trim();
      return ownerStaffId && actorIdentity.userId && ownerStaffId === actorIdentity.userId;
    });
  }, [actorIdentity.isAdmin, actorIdentity.userId, customers]);

  const canCreateVehicle = canCreate && (actorIdentity.isAdmin || manageableCustomers.length > 0);

  const canManageVehicle = (vehicle: VehicleRecord | null) => {
    if (!vehicle || !canUpdate) {
      return false;
    }
    if (actorIdentity.isAdmin) {
      return true;
    }
    const ownerStaffId = String(vehicle.ownerCustomer?.ownerStaffId ?? '').trim();
    return Boolean(ownerStaffId) && Boolean(actorIdentity.userId) && ownerStaffId === actorIdentity.userId;
  };

  const canArchiveVehicle = (vehicle: VehicleRecord | null) => {
    if (!vehicle || !canDelete) {
      return false;
    }
    if (actorIdentity.isAdmin) {
      return true;
    }
    const ownerStaffId = String(vehicle.ownerCustomer?.ownerStaffId ?? '').trim();
    return Boolean(ownerStaffId) && Boolean(actorIdentity.userId) && ownerStaffId === actorIdentity.userId;
  };

  const loadVehicles = async () => {
    if (!canView) {
      return;
    }
    setIsLoading(true);
    try {
      const payload = await apiRequest<unknown>('/crm/vehicles', {
        query: {
          q: search || undefined,
          ownerCustomerId: ownerCustomerFilter || undefined,
          vehicleKind: vehicleKindFilter !== 'ALL' ? vehicleKindFilter : undefined,
          limit: VEHICLE_TABLE_PAGE_SIZE,
          cursor: vehicleTablePager.cursor ?? undefined,
          sortBy: tableSortBy,
          sortDir: tableSortDir
        }
      });
      const normalizedVehicles = normalizePagedListPayload<VehicleRecord>(payload);
      const rows = normalizedVehicles.items;
      setVehicles(rows);
      vehicleTablePager.syncFromPageInfo(normalizedVehicles.pageInfo);
      setTableSortMeta(normalizedVehicles.sortMeta);
      setErrorMessage(null);
      setSelectedVehicle((prev) => {
        if (!prev) return prev;
        return rows.find((item) => item.id === prev.id) ?? null;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi tải danh sách xe');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCustomers = async () => {
    if (!canView) {
      return;
    }
    try {
      const payload = await apiRequest<unknown>('/crm/customers', {
        query: {
          limit: FETCH_LIMIT
        }
      });
      const rows = normalizeListPayload(payload) as CustomerOption[];
      setCustomers(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi tải danh sách khách hàng');
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, [canView]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadVehicles();
    }, 250);
    return () => clearTimeout(timer);
  }, [
    canView,
    ownerCustomerFilter,
    search,
    tableSortBy,
    tableSortDir,
    vehicleKindFilter,
    vehicleTablePager.currentPage
  ]);

  useEffect(() => {
    if (actorIdentity.isAdmin) {
      return;
    }
    if (!ownerCustomerFilter && manageableCustomers.length > 0) {
      setOwnerCustomerFilter(manageableCustomers[0]?.id ?? '');
    }
  }, [actorIdentity.isAdmin, manageableCustomers, ownerCustomerFilter]);

  const resolveCustomerOwnerStaffId = (customerId: string) => {
    const customer = customers.find((item) => item.id === customerId);
    return String(customer?.ownerStaffId ?? '').trim();
  };

  const resolveCustomerName = (customerId: string) => {
    const customer = customers.find((item) => item.id === customerId);
    return String(customer?.fullName ?? '').trim();
  };

  const openCreateEditor = () => {
    if (!canCreateVehicle) {
      return;
    }
    const defaultCustomerId = actorIdentity.isAdmin
      ? (ownerCustomerFilter || customers[0]?.id || '')
      : (manageableCustomers[0]?.id || '');
    const defaultOwnerName = resolveCustomerName(defaultCustomerId);
    setEditorMode('create');
    setEditingVehicleId(null);
    setVehicleForm(buildVehicleForm(null, defaultCustomerId, defaultOwnerName));
    setIsEditorOpen(true);
  };

  const openEditEditor = (vehicle: VehicleRecord) => {
    if (!canManageVehicle(vehicle)) {
      return;
    }
    setEditorMode('edit');
    setEditingVehicleId(vehicle.id);
    setVehicleForm(buildVehicleForm(vehicle));
    setIsEditorOpen(true);
  };

  const handleOwnerCustomerChange = (customerId: string) => {
    const ownerName = resolveCustomerName(customerId);
    setVehicleForm((prev) => ({
      ...prev,
      ownerCustomerId: customerId,
      ownerFullName: ownerName || prev.ownerFullName
    }));
  };

  const handleSaveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateVehicle && editorMode === 'create') {
      return;
    }

    const ownerCustomerId = String(vehicleForm.ownerCustomerId || '').trim();
    if (!ownerCustomerId) {
      setErrorMessage('Vui lòng chọn khách hàng sở hữu xe.');
      return;
    }

    if (!actorIdentity.isAdmin) {
      const ownerStaffId = resolveCustomerOwnerStaffId(ownerCustomerId);
      if (!ownerStaffId || ownerStaffId !== actorIdentity.userId) {
        setErrorMessage('Bạn chỉ được tạo/cập nhật xe cho khách hàng mình phụ trách.');
        return;
      }
    }

    setIsSavingVehicle(true);
    try {
      const payload = {
        ownerCustomerId,
        ownerFullName: vehicleForm.ownerFullName,
        ownerAddress: vehicleForm.ownerAddress || undefined,
        plateNumber: vehicleForm.plateNumber,
        chassisNumber: vehicleForm.chassisNumber,
        engineNumber: vehicleForm.engineNumber,
        vehicleKind: vehicleForm.vehicleKind,
        vehicleType: vehicleForm.vehicleType,
        seatCount: vehicleForm.seatCount === '' ? undefined : Number(vehicleForm.seatCount),
        loadKg: vehicleForm.loadKg === '' ? undefined : Number(vehicleForm.loadKg),
        status: vehicleForm.status
      };

      if (editorMode === 'edit' && editingVehicleId) {
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
      setIsEditorOpen(false);
      setEditingVehicleId(null);
      setEditorMode('create');
      await loadVehicles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi lưu thông tin xe');
    } finally {
      setIsSavingVehicle(false);
    }
  };

  const handleArchiveVehicle = async (vehicle: VehicleRecord) => {
    if (!canArchiveVehicle(vehicle)) {
      return;
    }
    if (!window.confirm(`Lưu trữ xe ${vehicle.plateNumber || vehicle.id}?`)) {
      return;
    }

    setArchivingVehicleId(vehicle.id);
    try {
      await apiRequest(`/crm/vehicles/${vehicle.id}`, {
        method: 'DELETE'
      });
      setResultMessage(`Đã lưu trữ xe ${vehicle.plateNumber || vehicle.id}.`);
      setErrorMessage(null);
      if (selectedVehicle?.id === vehicle.id) {
        setSelectedVehicle(null);
      }
      if (editingVehicleId === vehicle.id) {
        setIsEditorOpen(false);
        setEditingVehicleId(null);
      }
      await loadVehicles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi lưu trữ xe');
    } finally {
      setArchivingVehicleId(null);
    }
  };

  const handleImportVehicleFile = async (file: File) => {
    if (!file) {
      return;
    }

    if (!actorIdentity.isAdmin) {
      setErrorMessage('Chỉ admin được import dữ liệu xe bằng Excel.');
      return;
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      setErrorMessage('Chỉ hỗ trợ file Excel định dạng .xlsx hoặc .xls.');
      return;
    }

    setIsImportingFile(true);
    setImportSummary(null);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      const rows = await parseVehicleImportXlsx(file);
      if (rows.length === 0) {
        throw new Error('File Excel không có dữ liệu hợp lệ để import.');
      }

      const summary = await apiRequest<VehicleImportResponse>('/crm/vehicles/import', {
        method: 'POST',
        body: {
          fileName: file.name,
          rows
        }
      });

      setImportSummary(summary);
      if (summary.skippedCount === 0) {
        setResultMessage(`Đã import thành công ${summary.importedCount}/${summary.totalRows} dòng xe.`);
      } else {
        setResultMessage(`Đã import ${summary.importedCount}/${summary.totalRows} dòng xe, bỏ qua ${summary.skippedCount} dòng lỗi.`);
      }
      await loadVehicles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể import dữ liệu xe từ Excel.');
    } finally {
      setIsImportingFile(false);
    }
  };

  const handleDownloadVehicleTemplate = () => {
    downloadExcelTemplate('vehicle-import-template.xlsx', 'Vehicles', [
      {
        ownerCustomerId: 'cus_123',
        ownerCustomerPhone: '',
        ownerFullName: 'Nguyen Van A',
        ownerAddress: '123 Le Loi, Q1, HCM',
        plateNumber: '30A-12345',
        chassisNumber: 'CS-001',
        engineNumber: 'EN-001',
        vehicleKind: 'AUTO',
        vehicleType: 'Sedan',
        seatCount: 5,
        loadKg: '',
        status: 'ACTIVE'
      },
      {
        ownerCustomerId: '',
        ownerCustomerPhone: '0901234567',
        ownerFullName: 'Tran Thi B',
        ownerAddress: '45 Nguyen Trai, Q5, HCM',
        plateNumber: '59M1-56789',
        chassisNumber: 'CS-002',
        engineNumber: 'EN-002',
        vehicleKind: 'MOTO',
        vehicleType: 'Xe tay ga',
        seatCount: '',
        loadKg: '',
        status: 'ACTIVE'
      }
    ]);
  };

  const columns: ColumnDefinition<VehicleRecord>[] = [
    {
      key: 'plateNumber',
      label: 'Biển số',
      sortKey: 'plateNumber',
      isLink: true
    },
    {
      key: 'ownerFullName',
      label: 'Chủ xe',
      sortKey: 'ownerFullName'
    },
    {
      key: 'ownerCustomer',
      label: 'Khách hàng',
      sortable: false,
      sortDisabledTooltip: 'Sắp xếp theo khách hàng liên kết chưa hỗ trợ ở đợt này.',
      render: (row) => row.ownerCustomer?.fullName || '--'
    },
    {
      key: 'vehicleKind',
      label: 'Nhóm xe',
      sortKey: 'vehicleKind'
    },
    {
      key: 'vehicleType',
      label: 'Dòng xe',
      sortKey: 'vehicleType'
    },
    {
      key: 'status',
      label: 'Trạng thái',
      sortKey: 'status',
      render: (row) => <Badge variant={statusToBadge(row.status)}>{row.status || '--'}</Badge>
    },
    {
      key: 'updatedAt',
      label: 'Cập nhật',
      sortKey: 'updatedAt',
      render: (row) => toDateTime(row.updatedAt)
    }
  ];

  if (!canView) {
    return null;
  }

  return (
    <div className="crm-board">
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

      {actorIdentity.isAdmin && canCreateVehicle ? (
        <ExcelImportBlock<VehicleImportError>
          cardStyle={{ marginBottom: '1rem' }}
          title="Import xe bằng Excel (.xlsx)"
          description="Chỉ admin được import. Hệ thống xử lý từng dòng và trả chi tiết dòng lỗi để sửa file."
          fileLabel="File import xe"
          onDownloadTemplate={handleDownloadVehicleTemplate}
          onFileSelected={handleImportVehicleFile}
          isLoading={isImportingFile}
          loadingText="Đang parse và import file xe..."
          helperText="Cột hỗ trợ: ownerCustomerId hoặc ownerCustomerPhone, ownerFullName, ownerAddress, plateNumber, chassisNumber, engineNumber, vehicleKind, vehicleType, seatCount, loadKg, status."
          summary={importSummary}
          formatError={(error) => `Dòng ${error.rowIndex}${error.plateNumber ? ` (${error.plateNumber})` : ''}: ${error.message}`}
        />
      ) : null}

      <div className="main-toolbar" style={{ borderBottom: 'none', marginBottom: '1rem', paddingBottom: 0 }}>
        <div className="toolbar-left" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: '220px' }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm biển số / chủ xe / số khung..."
            />
          </div>
          <div className="field" style={{ minWidth: '220px' }}>
            <select value={ownerCustomerFilter} onChange={(event) => setOwnerCustomerFilter(event.target.value)}>
              <option value="">Tất cả khách hàng</option>
              {(actorIdentity.isAdmin ? customers : manageableCustomers).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.fullName || customer.id}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: '160px' }}>
            <select value={vehicleKindFilter} onChange={(event) => setVehicleKindFilter(event.target.value as VehicleKindOption)}>
              <option value="ALL">Tất cả nhóm xe</option>
              <option value="AUTO">Ô tô</option>
              <option value="MOTO">Xe máy</option>
            </select>
          </div>
        </div>
        <div className="toolbar-right">
          <a className="btn btn-ghost" href="/modules/crm">
            <ArrowLeft size={16} /> Về CRM
          </a>
          {canCreateVehicle && (
            <button className="btn btn-primary" onClick={openCreateEditor}>
              <Plus size={16} /> Thêm xe
            </button>
          )}
        </div>
      </div>

      <StandardDataTable
        data={vehicles}
        columns={columns}
        storageKey={VEHICLE_COLUMN_SETTINGS_STORAGE_KEY}
        isLoading={isLoading}
        pageInfo={{
          currentPage: vehicleTablePager.currentPage,
          hasPrevPage: vehicleTablePager.hasPrevPage,
          hasNextPage: vehicleTablePager.hasNextPage,
          visitedPages: vehicleTablePager.visitedPages
        }}
        sortMeta={
          tableSortMeta ?? {
            sortBy: tableSortBy,
            sortDir: tableSortDir,
            sortableFields: []
          }
        }
        onPageNext={vehicleTablePager.goNextPage}
        onPagePrev={vehicleTablePager.goPrevPage}
        onJumpVisitedPage={vehicleTablePager.jumpVisitedPage}
        onSortChange={(sortBy, sortDir) => {
          setTableSortBy(sortBy);
          setTableSortDir(sortDir);
        }}
        onRowClick={(vehicle) => setSelectedVehicle(vehicle)}
      />

      <SidePanel
        isOpen={Boolean(selectedVehicle)}
        onClose={() => setSelectedVehicle(null)}
        title="Chi tiết xe"
      >
        {selectedVehicle && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--line)', paddingBottom: '1rem' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <Car size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{selectedVehicle.plateNumber || 'Biển số N/A'}</h3>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>{selectedVehicle.vehicleKind || '--'} · {selectedVehicle.vehicleType || '--'}</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
              <div className="field">
                <label>Chủ xe</label>
                <p style={{ margin: 0 }}>{selectedVehicle.ownerFullName || '--'}</p>
              </div>
              <div className="field">
                <label>Khách hàng</label>
                <p style={{ margin: 0 }}>{selectedVehicle.ownerCustomer?.fullName || '--'}</p>
              </div>
              <div className="field">
                <label>Số khung</label>
                <p style={{ margin: 0 }}>{selectedVehicle.chassisNumber || '--'}</p>
              </div>
              <div className="field">
                <label>Số máy</label>
                <p style={{ margin: 0 }}>{selectedVehicle.engineNumber || '--'}</p>
              </div>
              <div className="field">
                <label>Số chỗ</label>
                <p style={{ margin: 0 }}>{selectedVehicle.seatCount ?? '--'}</p>
              </div>
              <div className="field">
                <label>Tải trọng (kg)</label>
                <p style={{ margin: 0 }}>{selectedVehicle.loadKg ?? '--'}</p>
              </div>
              <div className="field">
                <label>Trạng thái</label>
                <p style={{ margin: 0 }}><Badge variant={statusToBadge(selectedVehicle.status)}>{selectedVehicle.status || '--'}</Badge></p>
              </div>
              <div className="field">
                <label>Cập nhật cuối</label>
                <p style={{ margin: 0 }}>{toDateTime(selectedVehicle.updatedAt)}</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
              {canManageVehicle(selectedVehicle) && (
                <button className="btn btn-primary" onClick={() => openEditEditor(selectedVehicle)}>
                  Chỉnh sửa xe
                </button>
              )}
              {canArchiveVehicle(selectedVehicle) && String(selectedVehicle.status ?? '').toUpperCase() !== 'ARCHIVED' && (
                <button
                  className="btn btn-danger"
                  onClick={() => handleArchiveVehicle(selectedVehicle)}
                  disabled={archivingVehicleId === selectedVehicle.id}
                >
                  <Trash2 size={16} /> {archivingVehicleId === selectedVehicle.id ? 'Đang lưu trữ...' : 'Lưu trữ'}
                </button>
              )}
            </div>
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingVehicleId(null);
          setEditorMode('create');
        }}
        title={editorMode === 'create' ? 'Thêm xe mới' : 'Cập nhật thông tin xe'}
      >
        <form onSubmit={handleSaveVehicle} style={{ display: 'grid', gap: '0.8rem' }}>
          <div className="field">
            <label>Khách hàng sở hữu *</label>
            <select
              required
              value={vehicleForm.ownerCustomerId}
              onChange={(event) => handleOwnerCustomerChange(event.target.value)}
            >
              <option value="">-- Chọn khách hàng --</option>
              {(actorIdentity.isAdmin ? customers : manageableCustomers).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.fullName || customer.id}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Chủ xe *</label>
            <input
              required
              value={vehicleForm.ownerFullName}
              onChange={(event) => setVehicleForm((prev) => ({ ...prev, ownerFullName: event.target.value }))}
              placeholder="Nguyễn Văn A"
            />
          </div>
          <div className="field">
            <label>Địa chỉ chủ xe</label>
            <input
              value={vehicleForm.ownerAddress}
              onChange={(event) => setVehicleForm((prev) => ({ ...prev, ownerAddress: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>Biển số *</label>
            <input
              required
              value={vehicleForm.plateNumber}
              onChange={(event) => setVehicleForm((prev) => ({ ...prev, plateNumber: event.target.value.toUpperCase() }))}
              placeholder="30A-12345"
            />
          </div>
          <div className="field">
            <label>Số khung *</label>
            <input
              required
              value={vehicleForm.chassisNumber}
              onChange={(event) => setVehicleForm((prev) => ({ ...prev, chassisNumber: event.target.value.toUpperCase() }))}
            />
          </div>
          <div className="field">
            <label>Số máy *</label>
            <input
              required
              value={vehicleForm.engineNumber}
              onChange={(event) => setVehicleForm((prev) => ({ ...prev, engineNumber: event.target.value.toUpperCase() }))}
            />
          </div>
          <div className="field">
            <label>Nhóm xe *</label>
            <select
              value={vehicleForm.vehicleKind}
              onChange={(event) => setVehicleForm((prev) => ({ ...prev, vehicleKind: normalizeVehicleKind(event.target.value) }))}
            >
              <option value="AUTO">Ô tô</option>
              <option value="MOTO">Xe máy</option>
            </select>
          </div>
          <div className="field">
            <label>Dòng xe *</label>
            <input
              required
              value={vehicleForm.vehicleType}
              onChange={(event) => setVehicleForm((prev) => ({ ...prev, vehicleType: event.target.value }))}
              placeholder="Sedan / SUV / Tay ga..."
            />
          </div>
          <div className="field">
            <label>Số chỗ</label>
            <input
              type="number"
              min={0}
              value={vehicleForm.seatCount}
              onChange={(event) => setVehicleForm((prev) => ({ ...prev, seatCount: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>Tải trọng (kg)</label>
            <input
              type="number"
              min={0}
              value={vehicleForm.loadKg}
              onChange={(event) => setVehicleForm((prev) => ({ ...prev, loadKg: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>Trạng thái</label>
            <select
              value={vehicleForm.status}
              onChange={(event) => setVehicleForm((prev) => ({ ...prev, status: event.target.value as VehicleFormState['status'] }))}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="DRAFT">DRAFT</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.2rem' }}>
            <button className="btn btn-primary" type="submit" disabled={isSavingVehicle}>
              {isSavingVehicle ? 'Đang lưu...' : editorMode === 'create' ? 'Tạo xe' : 'Lưu cập nhật'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setIsEditorOpen(false);
                setEditingVehicleId(null);
                setEditorMode('create');
              }}
              disabled={isSavingVehicle}
            >
              Hủy
            </button>
          </div>
        </form>
      </SidePanel>
    </div>
  );
}
