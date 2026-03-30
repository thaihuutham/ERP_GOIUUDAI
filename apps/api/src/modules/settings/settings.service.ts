import { BadRequestException, Injectable } from '@nestjs/common';
import { GenericStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type OrderSettings = {
  allowIncreaseWithoutApproval: boolean;
  requireApprovalForDecrease: boolean;
  approverId: string;
};

type BhtotSyncConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  ordersStateKey: string;
  usersStateKey: string;
  syncAllUsersAsEmployees: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: 'IDLE' | 'SUCCESS' | 'FAILED';
  lastSyncSummary: Record<string, unknown> | null;
};

type SystemConfig = {
  companyName: string;
  taxCode: string;
  address: string;
  currency: string;
  dateFormat: string;
  enabledModules: string[];
  orderSettings: OrderSettings;
  bhtotSync: BhtotSyncConfig;
};

const DEFAULT_ORDER_SETTINGS: OrderSettings = {
  allowIncreaseWithoutApproval: true,
  requireApprovalForDecrease: true,
  approverId: ''
};

const DEFAULT_BHTOT_SYNC_CONFIG: BhtotSyncConfig = {
  enabled: false,
  baseUrl: '',
  apiKey: '',
  timeoutMs: 12000,
  ordersStateKey: 'bhtot_orders',
  usersStateKey: 'bhtot_users',
  syncAllUsersAsEmployees: false,
  lastSyncAt: null,
  lastSyncStatus: 'IDLE',
  lastSyncSummary: null
};

const DEFAULT_CONFIG: SystemConfig = {
  companyName: 'Digital Retail ERP Co.',
  taxCode: '',
  address: '',
  currency: 'VND',
  dateFormat: 'DD/MM/YYYY',
  enabledModules: ['crm', 'sales', 'hr', 'finance', 'scm', 'projects', 'assets', 'workflows'],
  orderSettings: DEFAULT_ORDER_SETTINGS,
  bhtotSync: DEFAULT_BHTOT_SYNC_CONFIG
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    const tenantId = this.prisma.getTenantId();

    const row = await this.prisma.client.setting.findFirst({
      where: { settingKey: 'system_config' }
    });

    if (!row) {
      const createdConfig = this.normalizeSystemConfig(DEFAULT_CONFIG);
      const created = await this.prisma.client.setting.create({
        data: {
          tenant_Id: tenantId,
          settingKey: 'system_config',
          settingValue: createdConfig as any
        }
      });
      await this.syncOrderSettingsFromConfig(createdConfig.orderSettings);
      return created;
    }

    const normalized = this.normalizeSystemConfig(row.settingValue);
    if (JSON.stringify(row.settingValue ?? null) !== JSON.stringify(normalized)) {
      await this.prisma.client.setting.updateMany({
        where: { id: row.id },
        data: { settingValue: normalized as any }
      });
    }

    await this.syncOrderSettingsFromConfig(normalized.orderSettings);
    return {
      ...row,
      settingValue: normalized
    };
  }

  async saveConfig(payload: Record<string, unknown>) {
    const current = await this.getSystemConfigObject();
    const body = this.ensureRecord(payload);
    const merged = this.normalizeSystemConfig({
      ...current,
      ...body,
      orderSettings: {
        ...current.orderSettings,
        ...this.ensureRecord(body.orderSettings)
      },
      bhtotSync: {
        ...current.bhtotSync,
        ...this.ensureRecord(body.bhtotSync)
      }
    });

    await this.saveSystemConfigObject(merged);
    await this.syncOrderSettingsFromConfig(merged.orderSettings);
    return this.getConfig();
  }

  async listRawSettings() {
    return this.prisma.client.setting.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  async upsertSetting(payload: Record<string, unknown>) {
    const tenantId = this.prisma.getTenantId();

    const settingKey = String(payload.settingKey ?? payload.key ?? '');
    if (!settingKey) {
      throw new BadRequestException('settingKey is required');
    }

    const settingValue = payload.settingValue ?? payload.value ?? null;
    const existing = await this.prisma.client.setting.findFirst({
      where: { settingKey }
    });

    if (existing) {
      await this.prisma.client.setting.updateMany({
        where: { id: existing.id },
        data: { settingValue: settingValue as any }
      });
      return this.prisma.client.setting.findFirst({ where: { id: existing.id } });
    }

    return this.prisma.client.setting.create({
      data: {
        tenant_Id: tenantId,
        settingKey,
        settingValue: settingValue as any
      }
    });
  }

  async getBhtotSyncConfig() {
    const config = await this.getSystemConfigObject();
    return config.bhtotSync;
  }

  async saveBhtotSyncConfig(payload: Record<string, unknown>) {
    const current = await this.getSystemConfigObject();
    const nextBhtotSync = this.normalizeBhtotSyncConfig({
      ...current.bhtotSync,
      ...this.ensureRecord(payload)
    });
    const nextConfig = this.normalizeSystemConfig({
      ...current,
      bhtotSync: nextBhtotSync
    });

    await this.saveSystemConfigObject(nextConfig);
    return {
      message: 'Đã lưu cấu hình đồng bộ BHTOT_CTV.',
      config: nextConfig.bhtotSync
    };
  }

  async getBhtotSyncStatus() {
    const config = await this.getSystemConfigObject();
    const latest = await this.prisma.client.setting.findFirst({
      where: { settingKey: 'bhtot_sync_last_result' }
    });

    return {
      config: config.bhtotSync,
      latestResult: latest?.settingValue ?? null
    };
  }

  async runBhtotOneWaySync() {
    const tenantId = this.prisma.getTenantId();
    const config = await this.getSystemConfigObject();
    const sync = this.normalizeBhtotSyncConfig(config.bhtotSync);

    if (!sync.baseUrl) {
      throw new BadRequestException('Thiếu baseUrl trong cấu hình đồng bộ BHTOT_CTV.');
    }
    if (!sync.apiKey) {
      throw new BadRequestException('Thiếu apiKey trong cấu hình đồng bộ BHTOT_CTV.');
    }

    try {
      const [ordersPayload, usersPayload] = await Promise.all([
        this.fetchBhtotState(sync, sync.ordersStateKey),
        this.fetchBhtotState(sync, sync.usersStateKey)
      ]);

      const orderRows = this.normalizeArrayPayload(ordersPayload);
      const userRows = this.normalizeArrayPayload(usersPayload);

      const userSummary = await this.syncUsersFromBhtot(userRows);
      const orderSummary = await this.syncOrdersFromBhtot(orderRows);
      const vehicleSummary = await this.syncVehiclesFromBhtotOrders(orderRows);

      const summary = {
        tenantId,
        syncedAt: new Date().toISOString(),
        fetched: {
          orders: orderRows.length,
          users: userRows.length
        },
        imported: {
          customers: userSummary.customers,
          employees: userSummary.employees,
          orders: orderSummary.orders,
          vehicles: vehicleSummary.vehicles
        }
      };

      const nextConfig = this.normalizeSystemConfig({
        ...config,
        bhtotSync: {
          ...sync,
          lastSyncAt: summary.syncedAt,
          lastSyncStatus: 'SUCCESS',
          lastSyncSummary: summary
        }
      });
      await this.saveSystemConfigObject(nextConfig);
      await this.upsertSettingByKey('bhtot_sync_last_result', summary);

      return {
        message: 'Đồng bộ dữ liệu BHTOT_CTV thành công.',
        summary
      };
    } catch (error) {
      const failedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : 'Unknown sync error';
      const failedSummary = {
        tenantId,
        syncedAt: failedAt,
        status: 'FAILED',
        message
      };

      const nextConfig = this.normalizeSystemConfig({
        ...config,
        bhtotSync: {
          ...sync,
          lastSyncAt: failedAt,
          lastSyncStatus: 'FAILED',
          lastSyncSummary: failedSummary
        }
      });
      await this.saveSystemConfigObject(nextConfig);
      await this.upsertSettingByKey('bhtot_sync_last_result', failedSummary);
      throw new BadRequestException(`Đồng bộ BHTOT_CTV thất bại: ${message}`);
    }
  }

  private async syncOrderSettingsFromConfig(orderSettings: unknown) {
    const tenantId = this.prisma.getTenantId();
    const settings = this.normalizeOrderSettings(orderSettings);
    const existing = await this.prisma.client.setting.findFirst({
      where: { settingKey: 'order_settings' }
    });

    if (existing) {
      await this.prisma.client.setting.updateMany({
        where: { id: existing.id },
        data: { settingValue: settings as any }
      });
      return;
    }

    await this.prisma.client.setting.create({
      data: {
        tenant_Id: tenantId,
        settingKey: 'order_settings',
        settingValue: settings as any
      }
    });
  }

  private async getSystemConfigObject(): Promise<SystemConfig> {
    const tenantId = this.prisma.getTenantId();
    const row = await this.prisma.client.setting.findFirst({
      where: { settingKey: 'system_config' }
    });

    if (!row) {
      const initial = this.normalizeSystemConfig(DEFAULT_CONFIG);
      await this.prisma.client.setting.create({
        data: {
          tenant_Id: tenantId,
          settingKey: 'system_config',
          settingValue: initial as any
        }
      });
      return initial;
    }

    return this.normalizeSystemConfig(row.settingValue);
  }

  private async saveSystemConfigObject(config: SystemConfig) {
    const tenantId = this.prisma.getTenantId();
    const normalized = this.normalizeSystemConfig(config);
    const existing = await this.prisma.client.setting.findFirst({
      where: { settingKey: 'system_config' }
    });

    if (existing) {
      await this.prisma.client.setting.updateMany({
        where: { id: existing.id },
        data: { settingValue: normalized as any }
      });
      return;
    }

    await this.prisma.client.setting.create({
      data: {
        tenant_Id: tenantId,
        settingKey: 'system_config',
        settingValue: normalized as any
      }
    });
  }

  private async upsertSettingByKey(settingKey: string, value: unknown) {
    const tenantId = this.prisma.getTenantId();
    const existing = await this.prisma.client.setting.findFirst({
      where: { settingKey }
    });

    if (existing) {
      await this.prisma.client.setting.updateMany({
        where: { id: existing.id },
        data: { settingValue: value as any }
      });
      return;
    }

    await this.prisma.client.setting.create({
      data: {
        tenant_Id: tenantId,
        settingKey,
        settingValue: value as any
      }
    });
  }

  private normalizeSystemConfig(input: unknown): SystemConfig {
    const payload = this.ensureRecord(input);
    const enabledModulesRaw = Array.isArray(payload.enabledModules) ? payload.enabledModules : DEFAULT_CONFIG.enabledModules;
    const enabledModules = enabledModulesRaw.map((item) => String(item)).filter(Boolean);

    return {
      companyName: String(payload.companyName ?? DEFAULT_CONFIG.companyName),
      taxCode: String(payload.taxCode ?? DEFAULT_CONFIG.taxCode),
      address: String(payload.address ?? DEFAULT_CONFIG.address),
      currency: String(payload.currency ?? DEFAULT_CONFIG.currency),
      dateFormat: String(payload.dateFormat ?? DEFAULT_CONFIG.dateFormat),
      enabledModules: enabledModules.length > 0 ? enabledModules : DEFAULT_CONFIG.enabledModules,
      orderSettings: this.normalizeOrderSettings(payload.orderSettings),
      bhtotSync: this.normalizeBhtotSyncConfig(payload.bhtotSync)
    };
  }

  private normalizeOrderSettings(input: unknown): OrderSettings {
    const payload = this.ensureRecord(input);
    return {
      allowIncreaseWithoutApproval:
        typeof payload.allowIncreaseWithoutApproval === 'boolean'
          ? payload.allowIncreaseWithoutApproval
          : DEFAULT_ORDER_SETTINGS.allowIncreaseWithoutApproval,
      requireApprovalForDecrease:
        typeof payload.requireApprovalForDecrease === 'boolean'
          ? payload.requireApprovalForDecrease
          : DEFAULT_ORDER_SETTINGS.requireApprovalForDecrease,
      approverId: String(payload.approverId ?? DEFAULT_ORDER_SETTINGS.approverId)
    };
  }

  private normalizeBhtotSyncConfig(input: unknown): BhtotSyncConfig {
    const payload = this.ensureRecord(input);
    const timeoutNumber = Number(payload.timeoutMs);
    const timeoutMs = Number.isFinite(timeoutNumber)
      ? Math.min(Math.max(Math.trunc(timeoutNumber), 1000), 120000)
      : DEFAULT_BHTOT_SYNC_CONFIG.timeoutMs;

    const lastStatusRaw = String(payload.lastSyncStatus ?? DEFAULT_BHTOT_SYNC_CONFIG.lastSyncStatus).toUpperCase();
    const lastSyncStatus: BhtotSyncConfig['lastSyncStatus'] =
      lastStatusRaw === 'SUCCESS' || lastStatusRaw === 'FAILED' || lastStatusRaw === 'IDLE'
        ? (lastStatusRaw as BhtotSyncConfig['lastSyncStatus'])
        : DEFAULT_BHTOT_SYNC_CONFIG.lastSyncStatus;

    return {
      enabled: typeof payload.enabled === 'boolean' ? payload.enabled : DEFAULT_BHTOT_SYNC_CONFIG.enabled,
      baseUrl: String(payload.baseUrl ?? DEFAULT_BHTOT_SYNC_CONFIG.baseUrl),
      apiKey: String(payload.apiKey ?? DEFAULT_BHTOT_SYNC_CONFIG.apiKey),
      timeoutMs,
      ordersStateKey: String(payload.ordersStateKey ?? DEFAULT_BHTOT_SYNC_CONFIG.ordersStateKey),
      usersStateKey: String(payload.usersStateKey ?? DEFAULT_BHTOT_SYNC_CONFIG.usersStateKey),
      syncAllUsersAsEmployees:
        typeof payload.syncAllUsersAsEmployees === 'boolean'
          ? payload.syncAllUsersAsEmployees
          : DEFAULT_BHTOT_SYNC_CONFIG.syncAllUsersAsEmployees,
      lastSyncAt: payload.lastSyncAt ? String(payload.lastSyncAt) : DEFAULT_BHTOT_SYNC_CONFIG.lastSyncAt,
      lastSyncStatus,
      lastSyncSummary: payload.lastSyncSummary && typeof payload.lastSyncSummary === 'object'
        ? (payload.lastSyncSummary as Record<string, unknown>)
        : null
    };
  }

  private async fetchBhtotState(config: BhtotSyncConfig, stateKey: string) {
    const url = this.buildBhtotApiUrl(config.baseUrl, `/state/${encodeURIComponent(stateKey)}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-api-secret': config.apiKey
        },
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`BHTOT response ${response.status}: ${text || 'Unknown error'}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildBhtotApiUrl(baseUrl: string, path: string) {
    const normalized = baseUrl.replace(/\/+$/, '');
    const apiRoot = /\/api\/v1$/i.test(normalized) ? normalized : `${normalized}/api/v1`;
    return `${apiRoot}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private normalizeArrayPayload(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload as Record<string, unknown>[];
    }

    const root = this.ensureRecord(payload);
    if (Array.isArray(root.value)) {
      return root.value as Record<string, unknown>[];
    }
    if (Array.isArray(root.items)) {
      return root.items as Record<string, unknown>[];
    }
    if (Array.isArray(root.data)) {
      return root.data as Record<string, unknown>[];
    }

    return [];
  }

  private async syncUsersFromBhtot(users: Record<string, unknown>[]) {
    const tenantId = this.prisma.getTenantId();
    let customers = 0;
    let employees = 0;

    for (const user of users) {
      const externalId = this.cleanString(user.id ?? user.userId ?? user.code);
      if (!externalId) {
        continue;
      }

      const fullName = this.cleanString(user.name ?? user.fullName) || `CTV ${externalId}`;
      const phone = this.cleanString(user.phone);
      const email = this.cleanString(user.email);
      const level = this.cleanString(user.level);
      const customerCode = `BHTOT_CTV_${externalId}`;

      await this.prisma.client.customer.upsert({
        where: {
          tenant_Id_code: {
            tenant_Id: tenantId,
            code: customerCode
          }
        },
        create: {
          tenant_Id: tenantId,
          code: customerCode,
          fullName,
          phone,
          email,
          segment: level || 'CTV',
          source: 'BHTOT_CTV',
          status: this.mapUserStatus(user.status)
        },
        update: {
          fullName,
          phone,
          email,
          segment: level || 'CTV',
          source: 'BHTOT_CTV',
          status: this.mapUserStatus(user.status)
        }
      });
      customers += 1;

      if (this.shouldMapAsEmployee(user)) {
        const employeeCode = `BHTOT_EMP_${externalId}`;
        await this.prisma.client.employee.upsert({
          where: {
            tenant_Id_code: {
              tenant_Id: tenantId,
              code: employeeCode
            }
          },
          create: {
            tenant_Id: tenantId,
            code: employeeCode,
            fullName,
            email,
            phone,
            department: 'BHTOT',
            position: this.cleanString(user.role) || 'Staff',
            status: this.mapUserStatus(user.status)
          },
          update: {
            fullName,
            email,
            phone,
            department: 'BHTOT',
            position: this.cleanString(user.role) || 'Staff',
            status: this.mapUserStatus(user.status)
          }
        });
        employees += 1;
      }
    }

    return { customers, employees };
  }

  private async syncOrdersFromBhtot(orders: Record<string, unknown>[]) {
    const tenantId = this.prisma.getTenantId();
    let orderCount = 0;

    for (const order of orders) {
      const orderNo = this.cleanString(order.id ?? order.orderId ?? order.orderNo);
      if (!orderNo) {
        continue;
      }

      const customerName = this.cleanString(order.customerName ?? order.customer);
      const createdBy = this.cleanString(order.ownerUserId ?? order.createdBy);
      const totalAmount = this.toNumber(order.amount ?? order.totalAmount) ?? 0;
      const status = this.mapOrderStatus(order.status);
      const orderDate = this.toDate(order.date ?? order.createdAt ?? order.updatedAt);

      const existing = await this.prisma.client.order.findFirst({
        where: { orderNo }
      });

      if (existing) {
        await this.prisma.client.order.updateMany({
          where: { id: existing.id },
          data: {
            customerName: customerName || existing.customerName,
            totalAmount,
            createdBy: createdBy || existing.createdBy,
            status
          }
        });
      } else {
        await this.prisma.client.order.create({
          data: {
            tenant_Id: tenantId,
            orderNo,
            customerName,
            totalAmount,
            status,
            createdBy,
            ...(orderDate ? { createdAt: orderDate } : {})
          }
        });
      }

      orderCount += 1;
    }

    return { orders: orderCount };
  }

  private async syncVehiclesFromBhtotOrders(orders: Record<string, unknown>[]) {
    const tenantId = this.prisma.getTenantId();
    let vehicles = 0;

    for (const order of orders) {
      const vehicle = this.extractVehiclePayload(order);
      if (!vehicle) {
        continue;
      }

      const orderNo = this.cleanString(order.id ?? order.orderId ?? order.orderNo);
      const plateRaw = this.cleanString(vehicle.licensePlate ?? vehicle.plateNumber ?? vehicle.bienSo);
      const plateCode = (plateRaw || orderNo || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (!plateCode) {
        continue;
      }

      const assetCode = `BHTOT_VEH_${plateCode.slice(0, 40)}`;
      const brand = this.cleanString(vehicle.vehicleBrand ?? vehicle.brand);
      const model = this.cleanString(vehicle.vehicleModel ?? vehicle.model);
      const type = this.cleanString(vehicle.vehicleType ?? vehicle.type);
      const name = [brand, model, type].filter(Boolean).join(' ').trim() || `Vehicle ${orderNo ?? plateCode}`;
      const value = this.toNumber(vehicle.estimatedVehicleValue ?? vehicle.value ?? order.amount);
      const purchaseAt = this.toDate(order.date ?? order.createdAt ?? vehicle.firstRegistrationDate);

      const existing = await this.prisma.client.asset.findFirst({
        where: {
          tenant_Id: tenantId,
          assetCode
        }
      });

      if (existing) {
        await this.prisma.client.asset.updateMany({
          where: { id: existing.id },
          data: {
            name,
            category: 'Vehicle',
            value: value ?? undefined,
            purchaseAt: purchaseAt ?? undefined,
            status: GenericStatus.ACTIVE
          }
        });
      } else {
        await this.prisma.client.asset.create({
          data: {
            tenant_Id: tenantId,
            assetCode,
            name,
            category: 'Vehicle',
            value: value ?? undefined,
            purchaseAt: purchaseAt ?? undefined,
            status: GenericStatus.ACTIVE
          }
        });
      }

      vehicles += 1;
    }

    return { vehicles };
  }

  private shouldMapAsEmployee(user: Record<string, unknown>) {
    if (user.isAdmin === true) {
      return true;
    }

    const role = this.cleanString(user.role).toLowerCase();
    const level = this.cleanString(user.level).toLowerCase();
    if (role.includes('employee') || role.includes('staff') || role.includes('admin')) {
      return true;
    }
    return level.includes('nhân viên') || level.includes('employee');
  }

  private mapUserStatus(input: unknown): GenericStatus {
    const normalized = this.cleanString(input).toLowerCase();
    if (normalized.includes('block') || normalized.includes('inactive') || normalized.includes('disabled')) {
      return GenericStatus.INACTIVE;
    }
    if (normalized.includes('pending')) {
      return GenericStatus.PENDING;
    }
    return GenericStatus.ACTIVE;
  }

  private mapOrderStatus(input: unknown): GenericStatus {
    const normalized = this.cleanString(input).toLowerCase();
    if (!normalized) {
      return GenericStatus.PENDING;
    }
    if (
      normalized.includes('hoàn thành')
      || normalized.includes('complete')
      || normalized.includes('success')
      || normalized.includes('approved')
    ) {
      return GenericStatus.APPROVED;
    }
    if (normalized.includes('hủy') || normalized.includes('cancel') || normalized.includes('reject')) {
      return GenericStatus.REJECTED;
    }
    if (normalized.includes('draft')) {
      return GenericStatus.DRAFT;
    }
    return GenericStatus.PENDING;
  }

  private extractVehiclePayload(order: Record<string, unknown>) {
    const directVehicle = this.ensureRecord(order.vehicleDetails);
    if (Object.keys(directVehicle).length > 0) {
      return directVehicle;
    }
    const fallbackVehicle = this.ensureRecord(order.vehicle);
    if (Object.keys(fallbackVehicle).length > 0) {
      return fallbackVehicle;
    }
    return null;
  }

  private ensureRecord(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {};
    }
    return input as Record<string, unknown>;
  }

  private cleanString(input: unknown) {
    if (input === null || input === undefined) {
      return '';
    }
    return String(input).trim();
  }

  private toNumber(input: unknown): number | null {
    if (input === null || input === undefined || input === '') {
      return null;
    }
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toDate(input: unknown): Date | null {
    if (!input) {
      return null;
    }
    const date = new Date(String(input));
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
