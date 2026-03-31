import { createHash, randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { AUTH_USER_CONTEXT_KEY, REQUEST_ID_CONTEXT_KEY } from '../../common/request/request.constants';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import {
  DEFAULT_SETTINGS_DOMAINS,
  DomainValidationResult,
  RUNTIME_TOGGLABLE_ERP_MODULES,
  SETTINGS_DOMAINS,
  SETTINGS_DOMAIN_SET,
  SETTINGS_SECRET_ALLOWLIST,
  SettingsAuditEntry,
  SettingsDomain,
  SettingsSnapshot
} from './settings-policy.types';

const DOMAIN_KEY_PREFIX = 'settings.';
const DOMAIN_KEY_SUFFIX = '.v1';
const AUDIT_KEY_PREFIX = 'settings.audit.';
const SNAPSHOT_KEY_PREFIX = 'settings.snapshot.';
const SENSITIVE_SETTINGS_DOMAINS = new Set<SettingsDomain>([
  'access_security',
  'finance_controls',
  'integrations'
]);
const RUNTIME_TOGGLABLE_MODULES = new Set<string>(RUNTIME_TOGGLABLE_ERP_MODULES);
const AUDIT_MODULE_KEY = 'audit';

type AuthContext = {
  role: string;
  userId: string;
  email: string;
  sub: string;
  hasIdentity: boolean;
};

type SettingsEditorPolicy = {
  domainRoleMap: Record<string, SettingsDomain[]>;
  userDomainMap: Record<string, SettingsDomain[]>;
};

type UpdateDomainOptions = {
  actor?: string;
  reason?: string;
  dryRun?: boolean;
  skipAudit?: boolean;
  skipAuthorization?: boolean;
  action?: SettingsAuditEntry['action'];
  meta?: Record<string, unknown>;
};

type AuditQuery = {
  domain?: string;
  actor?: string;
  limit?: number;
};

@Injectable()
export class SettingsPolicyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(SearchService) private readonly search: SearchService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  assertDomain(domainRaw: string): SettingsDomain {
    const normalized = String(domainRaw ?? '').trim() as SettingsDomain;
    if (!SETTINGS_DOMAIN_SET.has(normalized)) {
      throw new BadRequestException(`Domain không hợp lệ: ${domainRaw}`);
    }
    return normalized;
  }

  listDomains(): SettingsDomain[] {
    return [...SETTINGS_DOMAINS];
  }

  domainKey(domain: SettingsDomain): string {
    return `${DOMAIN_KEY_PREFIX}${domain}${DOMAIN_KEY_SUFFIX}`;
  }

  resolveSecretByRef(secretRef: unknown) {
    const ref = this.cleanString(secretRef);
    if (!ref) {
      return '';
    }
    if (!this.isAllowedSecretRef(ref)) {
      return '';
    }
    return this.cleanString(process.env[ref]);
  }

  async getDomain(domainRaw: string) {
    const domain = this.assertDomain(domainRaw);
    const row = await this.prisma.client.setting.findFirst({
      where: { settingKey: this.domainKey(domain) }
    });

    const normalized = this.normalizeDomain(domain, row?.settingValue);
    if (!row) {
      await this.prisma.client.setting.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          settingKey: this.domainKey(domain),
          settingValue: normalized as Prisma.InputJsonValue
        }
      });
    } else if (this.hashJson(row.settingValue) !== this.hashJson(normalized)) {
      await this.prisma.client.setting.updateMany({
        where: { id: row.id },
        data: { settingValue: normalized as Prisma.InputJsonValue }
      });
    }

    const validation = this.validateDomainPayload(domain, normalized);
    return {
      domain,
      key: this.domainKey(domain),
      data: this.redactSensitive(domain, normalized),
      validation,
      updatedAt: row?.updatedAt?.toISOString() ?? null
    };
  }

  async updateDomain(domainRaw: string, payload: Record<string, unknown>, options: UpdateDomainOptions = {}) {
    const domain = this.assertDomain(domainRaw);
    if (!options.skipAuthorization) {
      await this.assertCanEditDomain(domain);
    }
    const currentRow = await this.prisma.client.setting.findFirst({
      where: { settingKey: this.domainKey(domain) }
    });
    const currentValue = this.normalizeDomain(domain, currentRow?.settingValue);
    const mergedPayload = this.mergeRecords(currentValue, this.ensureRecord(payload));
    const nextValue = this.normalizeDomain(domain, mergedPayload);
    const changedPaths = this.collectChangedPaths(currentValue, nextValue);
    const validation = this.validateDomainPayload(domain, nextValue);

    if (options.dryRun) {
      return {
        domain,
        dryRun: true,
        changedPaths,
        validation,
        data: this.redactSensitive(domain, nextValue)
      };
    }

    if (!validation.ok) {
      throw new BadRequestException(`Domain ${domain} không hợp lệ: ${validation.errors.join('; ')}`);
    }

    if (changedPaths.length === 0) {
      return {
        domain,
        changed: false,
        changedPaths,
        validation,
        data: this.redactSensitive(domain, nextValue)
      };
    }

    if (!currentRow) {
      await this.prisma.client.setting.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          settingKey: this.domainKey(domain),
          settingValue: nextValue as Prisma.InputJsonValue
        }
      });
    } else {
      await this.prisma.client.setting.updateMany({
        where: { id: currentRow.id },
        data: {
          settingValue: nextValue as Prisma.InputJsonValue
        }
      });
    }

    this.runtimeSettings.invalidate(domain);

    if (!options.skipAudit) {
      await this.logAudit({
        domain,
        action: options.action ?? 'UPDATE',
        reason: options.reason ?? `Update ${domain}`,
        changedPaths,
        before: currentValue,
        after: nextValue,
        actor: options.actor,
        meta: options.meta
      });
    }

    return {
      domain,
      changed: true,
      changedPaths,
      validation,
      data: this.redactSensitive(domain, nextValue)
    };
  }

  async validateDomain(domainRaw: string, payload?: Record<string, unknown>) {
    const domain = this.assertDomain(domainRaw);
    await this.assertCanEditDomain(domain);
    const current = await this.getDomain(domain);
    const source = payload ? this.mergeRecords(this.ensureRecord(current.data), this.ensureRecord(payload)) : this.ensureRecord(current.data);
    const normalized = this.normalizeDomain(domain, source);
    const validation = this.validateDomainPayload(domain, normalized);

    await this.logAudit({
      domain,
      action: 'VALIDATE',
      reason: `Validate ${domain}`,
      changedPaths: [],
      before: normalized,
      after: normalized,
      meta: {
        ok: validation.ok,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length
      }
    });

    return {
      domain,
      ...validation
    };
  }

  async testConnection(domainRaw: string, payload?: Record<string, unknown>) {
    const domain = this.assertDomain(domainRaw);
    await this.assertCanEditDomain(domain);
    if (domain !== 'integrations' && domain !== 'search_performance') {
      throw new BadRequestException('Chỉ hỗ trợ test-connection cho integrations/search_performance.');
    }

    if (domain === 'search_performance') {
      const runtime = await this.search.getStatus();
      const ok = runtime.healthy;
      const status = ok ? 'HEALTHY' : 'DEGRADED';
      const now = new Date().toISOString();
      await this.updateDomain('search_performance', {
        lastHealthStatus: status,
        lastValidatedAt: now
      }, {
        action: 'TEST_CONNECTION',
        reason: 'Search connectivity probe',
        skipAuthorization: true,
        meta: { runtime }
      });

      return {
        domain,
        ok,
        status,
        checkedAt: now,
        runtime
      };
    }

    const domainData = payload
      ? this.normalizeDomain('integrations', payload)
      : this.ensureRecord((await this.getDomain('integrations')).data);

    const now = new Date().toISOString();
    const bhtot = this.ensureRecord(domainData.bhtot);
    const ai = this.ensureRecord(domainData.ai);
    const zalo = this.ensureRecord(domainData.zalo);

    const bhtotApiKey = this.resolveSecretByRef(bhtot.apiKeyRef);
    const aiApiKey = this.resolveSecretByRef(ai.apiKeyRef);
    const zaloToken = this.resolveSecretByRef(zalo.accessTokenRef);
    const zaloWebhookSecret = this.resolveSecretByRef(zalo.webhookSecretRef);

    const bhtotResult = await this.probeUrl({
      baseUrl: this.cleanString(bhtot.baseUrl),
      timeoutMs: this.toInt(bhtot.timeoutMs, 12_000, 1_000, 120_000),
      headers: bhtotApiKey ? { 'x-api-secret': bhtotApiKey, accept: 'application/json' } : undefined
    });
    const aiResult = await this.probeUrl({
      baseUrl: this.cleanString(ai.baseUrl),
      timeoutMs: this.toInt(ai.timeoutMs, 45_000, 1_000, 120_000),
      headers: aiApiKey ? { authorization: `Bearer ${aiApiKey}` } : undefined
    });
    const zaloResult = await this.probeUrl({
      baseUrl: this.cleanString(zalo.outboundUrl) || this.cleanString(zalo.apiBaseUrl),
      timeoutMs: this.toInt(zalo.outboundTimeoutMs, 20_000, 2_000, 180_000),
      headers: zaloToken ? { authorization: `Bearer ${zaloToken}` } : undefined
    });

    const nextData = this.normalizeDomain('integrations', {
      ...domainData,
      bhtot: {
        ...bhtot,
        lastValidatedAt: now,
        lastHealthStatus: bhtotResult.ok ? 'HEALTHY' : 'DEGRADED'
      },
      ai: {
        ...ai,
        lastValidatedAt: now,
        lastHealthStatus: aiResult.ok ? 'HEALTHY' : 'DEGRADED'
      },
      zalo: {
        ...zalo,
        lastValidatedAt: now,
        lastHealthStatus: zaloResult.ok ? 'HEALTHY' : 'DEGRADED'
      }
    });

    await this.updateDomain('integrations', nextData, {
      action: 'TEST_CONNECTION',
      reason: 'Integration connectivity probe',
      skipAuthorization: true,
      meta: {
        bhtot: { ok: bhtotResult.ok, message: bhtotResult.message },
        ai: { ok: aiResult.ok, message: aiResult.message },
        zalo: { ok: zaloResult.ok, message: zaloResult.message }
      }
    });

    return {
      domain,
      checkedAt: now,
      connectors: {
        bhtot: {
          ok: bhtotResult.ok,
          message: bhtotResult.message,
          isConfigured: Boolean(this.cleanString(bhtot.baseUrl) && this.cleanString(bhtot.apiKeyRef)),
          hasSecret: Boolean(bhtotApiKey)
        },
        ai: {
          ok: aiResult.ok,
          message: aiResult.message,
          isConfigured: Boolean(this.cleanString(ai.baseUrl) && this.cleanString(ai.apiKeyRef)),
          hasSecret: Boolean(aiApiKey)
        },
        zalo: {
          ok: zaloResult.ok,
          message: zaloResult.message,
          isConfigured: Boolean(this.cleanString(zalo.outboundUrl) || this.cleanString(zalo.apiBaseUrl)),
          hasSecret: Boolean(zaloToken || zaloWebhookSecret)
        }
      }
    };
  }

  async listAudit(query: AuditQuery = {}) {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const rows = await this.prisma.client.setting.findMany({
      where: {
        settingKey: { startsWith: AUDIT_KEY_PREFIX }
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(take * 3, 100)
    });

    const mapped = rows
      .map((row) => this.ensureRecord(row.settingValue))
      .filter((item) => Object.keys(item).length > 0) as Array<Record<string, unknown>>;

    const filtered = mapped.filter((item) => {
      if (query.domain && this.cleanString(item.domain) !== this.cleanString(query.domain)) {
        return false;
      }
      if (query.actor && this.cleanString(item.actor) !== this.cleanString(query.actor)) {
        return false;
      }
      return true;
    });

    return {
      items: filtered.slice(0, take),
      total: filtered.length
    };
  }

  async createSnapshot(payload: Record<string, unknown>) {
    const tenantId = this.prisma.getTenantId();
    const body = this.ensureRecord(payload);
    const requestedDomains = Array.isArray(body.domains)
      ? body.domains.map((item) => this.cleanString(item)).filter(Boolean)
      : [];

    const domains = requestedDomains.length > 0
      ? requestedDomains.map((item) => this.assertDomain(item))
      : [...SETTINGS_DOMAINS];

    for (const domain of domains) {
      await this.assertCanEditDomain(domain);
    }

    const snapshotDomains: Record<string, unknown> = {};
    for (const domain of domains) {
      const current = await this.getDomain(domain);
      snapshotDomains[domain] = current.data;
    }

    const snapshot: SettingsSnapshot = {
      id: randomUUID(),
      tenantId,
      createdAt: new Date().toISOString(),
      createdBy: this.resolveActor(this.cleanString(body.createdBy)),
      reason: this.cleanString(body.reason) || 'Manual snapshot',
      domains: snapshotDomains
    };

    await this.prisma.client.setting.create({
      data: {
        tenant_Id: tenantId,
        settingKey: `${SNAPSHOT_KEY_PREFIX}${snapshot.id}`,
        settingValue: snapshot as unknown as Prisma.InputJsonValue
      }
    });

    await this.logAudit({
      domain: 'system',
      action: 'SNAPSHOT_CREATE',
      reason: snapshot.reason,
      changedPaths: domains.map((domain) => `domains.${domain}`),
      before: {},
      after: snapshotDomains,
      actor: snapshot.createdBy,
      meta: {
        snapshotId: snapshot.id,
        domainCount: domains.length
      }
    });

    return snapshot;
  }

  async listSnapshots(limit = 20) {
    const rows = await this.prisma.client.setting.findMany({
      where: {
        settingKey: {
          startsWith: SNAPSHOT_KEY_PREFIX
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100)
    });

    return rows
      .map((row) => this.ensureRecord(row.settingValue))
      .filter((item) => Object.keys(item).length > 0);
  }

  async restoreSnapshot(snapshotId: string, payload: Record<string, unknown>) {
    const id = this.cleanString(snapshotId);
    if (!id) {
      throw new BadRequestException('snapshotId là bắt buộc.');
    }

    const row = await this.prisma.client.setting.findFirst({
      where: { settingKey: `${SNAPSHOT_KEY_PREFIX}${id}` }
    });
    if (!row) {
      throw new BadRequestException('Không tìm thấy snapshot.');
    }

    const snapshot = this.ensureRecord(row.settingValue);
    const snapshotDomains = this.ensureRecord(snapshot.domains);
    const body = this.ensureRecord(payload);
    const requestedDomains = Array.isArray(body.domains)
      ? body.domains.map((item) => this.cleanString(item)).filter(Boolean)
      : Object.keys(snapshotDomains);

    const domains = requestedDomains.map((item) => this.assertDomain(item));
    const restored: string[] = [];

    for (const domain of domains) {
      await this.assertCanEditDomain(domain);
      if (!(domain in snapshotDomains)) {
        continue;
      }

      await this.updateDomain(domain, this.ensureRecord(snapshotDomains[domain]), {
        reason: `Restore snapshot ${id}`,
        actor: this.resolveActor(this.cleanString(body.restoredBy)),
        skipAudit: true,
        skipAuthorization: true
      });
      restored.push(domain);
    }

    await this.logAudit({
      domain: 'system',
      action: 'SNAPSHOT_RESTORE',
      reason: this.cleanString(body.reason) || `Restore snapshot ${id}`,
      changedPaths: restored.map((item) => `domains.${item}`),
      before: {},
      after: { restored },
      actor: this.resolveActor(this.cleanString(body.restoredBy)),
      meta: {
        snapshotId: id,
        restored
      }
    });

    return {
      snapshotId: id,
      restored
    };
  }

  async getCenter() {
    const states = await Promise.all(
      SETTINGS_DOMAINS.map(async (domain) => {
        const details = await this.getDomain(domain);
        const validation = this.validateDomainPayload(domain, details.data);
        const runtimeEnvelope = await this.runtimeSettings.getDomainEnvelope(domain);
        return {
          domain,
          ok: validation.ok,
          errorCount: validation.errors.length,
          warningCount: validation.warnings.length,
          updatedAt: details.updatedAt,
          runtimeApplied: true,
          runtimeLoadedAt: runtimeEnvelope.loadedAt
        };
      })
    );

    const summary = {
      totalDomains: SETTINGS_DOMAINS.length,
      validDomains: states.filter((item) => item.ok).length,
      invalidDomains: states.filter((item) => !item.ok).length
    };

    const checklist = {
      org: this.isDomainHealthy(states, ['org_profile', 'locale_calendar']),
      security: this.isDomainHealthy(states, ['access_security']),
      financeControls: this.isDomainHealthy(states, ['finance_controls', 'approval_matrix']),
      integrations: this.isDomainHealthy(states, ['integrations', 'search_performance']),
      modulePolicies: this.isDomainHealthy(states, ['sales_crm_policies', 'catalog_scm_policies', 'hr_policies'])
    };

    return {
      summary,
      checklist,
      domainStates: states,
      recentAudit: (await this.listAudit({ limit: 20 })).items,
      recentSnapshots: await this.listSnapshots(10)
    };
  }

  async buildLegacySystemConfig() {
    const org = this.ensureRecord((await this.getDomain('org_profile')).data);
    const locale = this.ensureRecord((await this.getDomain('locale_calendar')).data);
    const sales = this.ensureRecord((await this.getDomain('sales_crm_policies')).data);
    const integrations = this.ensureRecord((await this.getDomain('integrations')).data);
    const bhtot = this.ensureRecord(integrations.bhtot);

    return {
      companyName: this.cleanString(org.companyName) || 'Digital Retail ERP Co.',
      taxCode: this.cleanString(org.taxCode),
      address: this.cleanString(org.address),
      currency: this.cleanString(locale.currency) || 'VND',
      dateFormat: this.cleanString(locale.dateFormat) || 'DD/MM/YYYY',
      enabledModules: this.toStringArray(org.enabledModules),
      orderSettings: this.ensureRecord(sales.orderSettings),
      bhtotSync: {
        enabled: this.toBool(bhtot.enabled, false),
        baseUrl: this.cleanString(bhtot.baseUrl),
        apiKey: '',
        apiKeyRef: this.cleanString(bhtot.apiKeyRef),
        timeoutMs: this.toInt(bhtot.timeoutMs, 12000, 1000, 120000),
        ordersStateKey: this.cleanString(bhtot.ordersStateKey) || 'bhtot_orders',
        usersStateKey: this.cleanString(bhtot.usersStateKey) || 'bhtot_users',
        syncAllUsersAsEmployees: this.toBool(bhtot.syncAllUsersAsEmployees, false),
        lastSyncAt: bhtot.lastSyncAt ? String(bhtot.lastSyncAt) : null,
        lastSyncStatus: this.cleanString(bhtot.lastSyncStatus) || 'IDLE',
        lastSyncSummary: this.ensureRecordOrNull(bhtot.lastSyncSummary)
      }
    };
  }

  async syncFromLegacySystemConfig(payload: Record<string, unknown>) {
    const config = this.ensureRecord(payload);
    const bhtotSync = this.ensureRecord(config.bhtotSync);

    let apiKeyRef = this.cleanString(bhtotSync.apiKeyRef);
    const legacyApiKey = this.cleanString(bhtotSync.apiKey);
    if (!apiKeyRef && legacyApiKey) {
      apiKeyRef = this.isAllowedSecretRef(legacyApiKey) ? legacyApiKey : 'BHTOT_API_KEY';
    }

    await this.updateDomain('org_profile', {
      companyName: config.companyName,
      taxCode: config.taxCode,
      address: config.address,
      enabledModules: config.enabledModules
    }, {
      skipAudit: true,
      skipAuthorization: true,
      reason: 'Legacy bridge: system_config -> org_profile'
    });

    await this.updateDomain('locale_calendar', {
      currency: config.currency,
      dateFormat: config.dateFormat
    }, {
      skipAudit: true,
      skipAuthorization: true,
      reason: 'Legacy bridge: system_config -> locale_calendar'
    });

    await this.updateDomain('sales_crm_policies', {
      orderSettings: this.ensureRecord(config.orderSettings)
    }, {
      skipAudit: true,
      skipAuthorization: true,
      reason: 'Legacy bridge: order_settings -> sales_crm_policies'
    });

    await this.updateDomain('integrations', {
      bhtot: {
        enabled: bhtotSync.enabled,
        baseUrl: bhtotSync.baseUrl,
        apiKeyRef,
        timeoutMs: bhtotSync.timeoutMs,
        ordersStateKey: bhtotSync.ordersStateKey,
        usersStateKey: bhtotSync.usersStateKey,
        syncAllUsersAsEmployees: bhtotSync.syncAllUsersAsEmployees,
        lastSyncAt: bhtotSync.lastSyncAt,
        lastSyncStatus: bhtotSync.lastSyncStatus,
        lastSyncSummary: bhtotSync.lastSyncSummary
      }
    }, {
      skipAudit: true,
      skipAuthorization: true,
      reason: 'Legacy bridge: bhtotSync -> integrations'
    });
  }

  async getOrderSettingsPolicy() {
    const sales = this.ensureRecord((await this.getDomain('sales_crm_policies')).data);
    const orderSettings = this.ensureRecord(sales.orderSettings);
    return {
      allowIncreaseWithoutApproval: this.toBool(orderSettings.allowIncreaseWithoutApproval, true),
      requireApprovalForDecrease: this.toBool(orderSettings.requireApprovalForDecrease, true),
      approverId: this.cleanString(orderSettings.approverId)
    };
  }

  async listFinanceLockedPeriods() {
    const finance = this.ensureRecord((await this.getDomain('finance_controls')).data);
    const postingPeriods = this.ensureRecord(finance.postingPeriods);
    return this.parseLockedPeriods(postingPeriods.lockedPeriods);
  }

  async lockFinancePeriod(period: string, closedBy?: string) {
    const normalized = this.normalizePeriod(period);
    const finance = this.ensureRecord((await this.getDomain('finance_controls')).data);
    const postingPeriods = this.ensureRecord(finance.postingPeriods);
    const current = this.parseLockedPeriods(postingPeriods.lockedPeriods);

    const periodSet = new Set(current);
    periodSet.add(normalized);
    const periods = [...periodSet].sort();

    await this.updateDomain('finance_controls', {
      postingPeriods: {
        ...postingPeriods,
        lockedPeriods: periods,
        updatedAt: new Date().toISOString(),
        updatedBy: this.cleanString(closedBy) || this.resolveActor()
      }
    }, {
      reason: `Lock finance period ${normalized}`,
      actor: this.cleanString(closedBy) || undefined
    });

    return periods;
  }

  private async assertCanEditDomain(domain: SettingsDomain) {
    const auth = this.resolveAuthContext();
    if (!auth.hasIdentity) {
      // Compatibility mode for AUTH disabled / system jobs where identity is intentionally absent.
      return;
    }

    if (auth.role === 'ADMIN') {
      return;
    }

    const policy = await this.getSettingsEditorPolicy();
    const allowedDomains = this.resolveAllowedDomainsForActor(policy, auth);
    const canEdit = allowedDomains.has(domain);

    if (!canEdit) {
      if (SENSITIVE_SETTINGS_DOMAINS.has(domain)) {
        throw new ForbiddenException(`Domain nhạy cảm ${domain} yêu cầu quyền explicit.`);
      }
      throw new ForbiddenException(`Bạn không có quyền chỉnh domain ${domain}.`);
    }
  }

  private async getSettingsEditorPolicy(): Promise<SettingsEditorPolicy> {
    const row = await this.prisma.client.setting.findFirst({
      where: { settingKey: this.domainKey('access_security') }
    });
    const normalized = this.normalizeDomain('access_security', row?.settingValue);
    const accessSecurity = this.ensureRecord(normalized);
    return this.normalizeSettingsEditorPolicy(accessSecurity.settingsEditorPolicy);
  }

  private resolveAllowedDomainsForActor(policy: SettingsEditorPolicy, auth: AuthContext) {
    const allowed = new Set<SettingsDomain>();
    const roleDomains = policy.domainRoleMap[auth.role] ?? [];
    for (const domain of roleDomains) {
      allowed.add(domain);
    }

    const lookupKeys = [auth.userId, auth.email, auth.sub]
      .map((value) => value.toLowerCase())
      .filter(Boolean);

    for (const key of lookupKeys) {
      const domains = policy.userDomainMap[key] ?? [];
      for (const domain of domains) {
        allowed.add(domain);
      }
    }

    return allowed;
  }

  private resolveAuthContext(): AuthContext {
    const authUser = this.ensureRecord(this.cls.get(AUTH_USER_CONTEXT_KEY));
    const role = this.cleanString(authUser.role).toUpperCase();
    const userId = this.cleanString(authUser.userId);
    const email = this.cleanString(authUser.email).toLowerCase();
    const sub = this.cleanString(authUser.sub).toLowerCase();
    const hasIdentity = Boolean(role || userId || email || sub);

    return {
      role,
      userId,
      email,
      sub,
      hasIdentity
    };
  }

  private normalizeSettingsEditorPolicy(value: unknown): SettingsEditorPolicy {
    const policy = this.ensureRecord(value);
    const roleMapRaw = this.ensureRecord(policy.domainRoleMap);
    const userMapRaw = this.ensureRecord(policy.userDomainMap);

    const normalizedRoleMap: Record<string, SettingsDomain[]> = {
      ADMIN: this.normalizeDomainList(roleMapRaw.ADMIN),
      MANAGER: this.normalizeDomainList(roleMapRaw.MANAGER),
      STAFF: this.normalizeDomainList(roleMapRaw.STAFF)
    };

    const normalizedUserMap: Record<string, SettingsDomain[]> = {};
    for (const [key, domains] of Object.entries(userMapRaw)) {
      const normalizedKey = this.cleanString(key).toLowerCase();
      if (!normalizedKey) {
        continue;
      }
      const normalizedDomains = this.normalizeDomainList(domains);
      if (normalizedDomains.length === 0) {
        continue;
      }
      normalizedUserMap[normalizedKey] = normalizedDomains;
    }

    return {
      domainRoleMap: normalizedRoleMap,
      userDomainMap: normalizedUserMap
    };
  }

  private normalizeDomainList(value: unknown): SettingsDomain[] {
    return this.toStringArray(value)
      .map((item) => this.cleanString(item) as SettingsDomain)
      .filter((item): item is SettingsDomain => SETTINGS_DOMAIN_SET.has(item))
      .filter((item, index, list) => list.indexOf(item) === index);
  }

  private async probeUrl(args: { baseUrl: string; timeoutMs: number; headers?: Record<string, string> }) {
    const url = this.cleanString(args.baseUrl);
    if (!url) {
      return { ok: false, message: 'missing_url' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: args.headers,
        signal: controller.signal
      });
      return {
        ok: response.ok,
        message: response.ok ? 'ok' : `status_${response.status}`
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'probe_failed'
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private isDomainHealthy(states: Array<{ domain: SettingsDomain; ok: boolean }>, domains: SettingsDomain[]) {
    return domains.every((domain) => states.some((state) => state.domain === domain && state.ok));
  }

  private async logAudit(input: {
    domain: SettingsAuditEntry['domain'];
    action: SettingsAuditEntry['action'];
    reason: string;
    changedPaths: string[];
    before: unknown;
    after: unknown;
    actor?: string;
    meta?: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    const tenantId = this.prisma.getTenantId();
    const audit: SettingsAuditEntry = {
      id: randomUUID(),
      tenantId,
      domain: input.domain,
      action: input.action,
      actor: this.resolveActor(input.actor),
      reason: input.reason,
      requestId: this.cls.get<string>(REQUEST_ID_CONTEXT_KEY) ?? null,
      changedPaths: input.changedPaths,
      beforeHash: this.hashJson(input.before),
      afterHash: this.hashJson(input.after),
      createdAt: now,
      meta: input.meta ?? {}
    };

    await this.prisma.client.setting.create({
      data: {
        tenant_Id: tenantId,
        settingKey: `${AUDIT_KEY_PREFIX}${Date.now()}.${audit.id.slice(0, 8)}`,
        settingValue: audit as unknown as Prisma.InputJsonValue
      }
    });
  }

  private normalizeDomain(domain: SettingsDomain, input: unknown) {
    const defaultValue = DEFAULT_SETTINGS_DOMAINS[domain];
    const merged = this.mergeRecords(defaultValue, this.ensureRecord(input));

    if (domain === 'org_profile') {
      const orgProfile = this.ensureRecord(merged);
      return {
        ...orgProfile,
        enabledModules: this.normalizeEnabledModules(orgProfile.enabledModules)
      };
    }

    if (domain === 'integrations') {
      const integrations = this.ensureRecord(merged);
      const bhtot = this.ensureRecord(integrations.bhtot);
      const ai = this.ensureRecord(integrations.ai);
      const zalo = this.ensureRecord(integrations.zalo);

      const {
        apiKey: _bhtotApiKey,
        apiSecret: _bhtotApiSecret,
        token: _bhtotToken,
        hasSecret: _bhtotHasSecret,
        isConfigured: _bhtotIsConfigured,
        ...bhtotSafe
      } = bhtot;
      const {
        apiKey: _aiApiKey,
        accessToken: _aiAccessToken,
        token: _aiToken,
        hasSecret: _aiHasSecret,
        isConfigured: _aiIsConfigured,
        ...aiSafe
      } = ai;
      const {
        accessToken: _zaloAccessToken,
        webhookSecret: _zaloWebhookSecret,
        apiKey: _zaloApiKey,
        token: _zaloToken,
        hasSecret: _zaloHasSecret,
        isConfigured: _zaloIsConfigured,
        ...zaloSafe
      } = zalo;

      const normalizedApiKeyRef = this.cleanString(bhtot.apiKeyRef);
      const normalizedAiKeyRef = this.cleanString(ai.apiKeyRef);
      const normalizedZaloTokenRef = this.cleanString(zalo.accessTokenRef);
      const normalizedZaloWebhookSecretRef = this.cleanString(zalo.webhookSecretRef);

      return {
        ...integrations,
        bhtot: {
          ...bhtotSafe,
          enabled: this.toBool(bhtot.enabled, false),
          apiKey: '',
          apiKeyRef: normalizedApiKeyRef,
          timeoutMs: this.toInt(bhtot.timeoutMs, 12000, 1000, 120000),
          lastSyncAt: bhtot.lastSyncAt ? String(bhtot.lastSyncAt) : null,
          lastValidatedAt: bhtot.lastValidatedAt ? String(bhtot.lastValidatedAt) : null
        },
        ai: {
          ...aiSafe,
          enabled: this.toBool(ai.enabled, false),
          apiKey: '',
          apiKeyRef: normalizedAiKeyRef,
          timeoutMs: this.toInt(ai.timeoutMs, 45000, 1000, 120000),
          lastValidatedAt: ai.lastValidatedAt ? String(ai.lastValidatedAt) : null
        },
        zalo: {
          ...zaloSafe,
          enabled: this.toBool(zalo.enabled, false),
          accessToken: '',
          accessTokenRef: normalizedZaloTokenRef,
          webhookSecretRef: normalizedZaloWebhookSecretRef,
          outboundTimeoutMs: this.toInt(zalo.outboundTimeoutMs, 20000, 2000, 180000),
          lastValidatedAt: zalo.lastValidatedAt ? String(zalo.lastValidatedAt) : null
        }
      };
    }

    if (domain === 'finance_controls') {
      const finance = this.ensureRecord(merged);
      const postingPeriods = this.ensureRecord(finance.postingPeriods);
      return {
        ...finance,
        postingPeriods: {
          ...postingPeriods,
          lockedPeriods: this.parseLockedPeriods(postingPeriods.lockedPeriods)
        },
        transactionCutoffHour: this.toInt(finance.transactionCutoffHour, 23, 0, 23)
      };
    }

    if (domain === 'access_security') {
      const security = this.ensureRecord(merged);
      const passwordPolicy = this.ensureRecord(security.passwordPolicy);
      const loginPolicy = this.ensureRecord(security.loginPolicy);
      const permissionPolicy = this.ensureRecord(security.permissionPolicy);
      const conflictPolicy = this.cleanString(permissionPolicy.conflictPolicy).toUpperCase() === 'ALLOW_OVERRIDES'
        ? 'ALLOW_OVERRIDES'
        : 'DENY_OVERRIDES';
      return {
        ...security,
        sessionTimeoutMinutes: this.toInt(security.sessionTimeoutMinutes, 480, 5, 1440),
        superAdminIds: this.toStringArray(security.superAdminIds),
        permissionPolicy: {
          enabled: this.toBool(permissionPolicy.enabled, false),
          conflictPolicy,
          superAdminIds: this.toStringArray(permissionPolicy.superAdminIds),
          superAdminEmails: this.toStringArray(permissionPolicy.superAdminEmails).map((item) => item.toLowerCase())
        },
        passwordPolicy: {
          ...passwordPolicy,
          minLength: this.toInt(passwordPolicy.minLength, 8, 6, 64),
          requireUppercase: this.toBool(passwordPolicy.requireUppercase, true),
          requireNumber: this.toBool(passwordPolicy.requireNumber, true),
          requireSpecial: this.toBool(passwordPolicy.requireSpecial, false),
          rotateDays: this.toInt(passwordPolicy.rotateDays, 90, 0, 3650)
        },
        loginPolicy: {
          ...loginPolicy,
          maxFailedAttempts: this.toInt(loginPolicy.maxFailedAttempts, 5, 1, 20),
          lockoutMinutes: this.toInt(loginPolicy.lockoutMinutes, 15, 1, 240),
          mfaRequired: this.toBool(loginPolicy.mfaRequired, false)
        },
        settingsEditorPolicy: this.normalizeSettingsEditorPolicy(security.settingsEditorPolicy)
      };
    }

    if (domain === 'search_performance') {
      const search = this.ensureRecord(merged);
      const engine = this.cleanString(search.engine).toLowerCase();
      return {
        ...search,
        engine: engine === 'meili_hybrid' ? 'meili_hybrid' : 'sql',
        timeoutMs: this.toInt(search.timeoutMs, 45000, 1000, 300000),
        indexPrefix: this.cleanString(search.indexPrefix) || 'erp',
        writeSyncEnabled: this.toBool(search.writeSyncEnabled, false),
        lastValidatedAt: search.lastValidatedAt ? String(search.lastValidatedAt) : null
      };
    }

    if (domain === 'locale_calendar') {
      const locale = this.ensureRecord(merged);
      return {
        ...locale,
        fiscalYearStartMonth: this.toInt(locale.fiscalYearStartMonth, 1, 1, 12)
      };
    }

    return merged;
  }

  private validateDomainPayload(domain: SettingsDomain, payload: unknown): DomainValidationResult {
    const value = this.ensureRecord(payload);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (domain === 'org_profile') {
      if (!this.cleanString(value.companyName)) {
        errors.push('companyName là bắt buộc.');
      }
      if (!Array.isArray(value.enabledModules)) {
        errors.push('enabledModules phải là mảng.');
      }
    }

    if (domain === 'locale_calendar') {
      if (!this.cleanString(value.timezone)) {
        errors.push('timezone là bắt buộc.');
      }
      const month = this.toInt(value.fiscalYearStartMonth, 1, 1, 12);
      if (month < 1 || month > 12) {
        errors.push('fiscalYearStartMonth phải nằm trong [1..12].');
      }
    }

    if (domain === 'access_security') {
      const timeout = this.toInt(value.sessionTimeoutMinutes, 480, 5, 1440);
      if (timeout < 5 || timeout > 1440) {
        errors.push('sessionTimeoutMinutes phải trong [5..1440].');
      }
      const permissionPolicy = this.ensureRecord(value.permissionPolicy);
      const conflictPolicy = this.cleanString(permissionPolicy.conflictPolicy).toUpperCase();
      if (conflictPolicy && conflictPolicy !== 'DENY_OVERRIDES' && conflictPolicy !== 'ALLOW_OVERRIDES') {
        errors.push('permissionPolicy.conflictPolicy chỉ nhận DENY_OVERRIDES hoặc ALLOW_OVERRIDES.');
      }
      const password = this.ensureRecord(value.passwordPolicy);
      if (this.toInt(password.minLength, 8, 6, 64) < 6) {
        errors.push('passwordPolicy.minLength phải >= 6.');
      }

      const policy = this.ensureRecord(value.settingsEditorPolicy);
      const domainRoleMap = this.ensureRecord(policy.domainRoleMap);
      const userDomainMap = this.ensureRecord(policy.userDomainMap);

      for (const role of ['ADMIN', 'MANAGER', 'STAFF']) {
        const domains = this.toStringArray(domainRoleMap[role]);
        const invalid = domains.filter((item) => !SETTINGS_DOMAIN_SET.has(item as SettingsDomain));
        if (invalid.length > 0) {
          errors.push(`settingsEditorPolicy.domainRoleMap.${role} có domain không hợp lệ: ${invalid.join(', ')}.`);
        }
      }

      for (const [rawUserKey, domainsValue] of Object.entries(userDomainMap)) {
        const userKey = this.cleanString(rawUserKey);
        if (!userKey) {
          errors.push('settingsEditorPolicy.userDomainMap chứa key rỗng.');
          continue;
        }
        const domains = this.toStringArray(domainsValue);
        const invalid = domains.filter((item) => !SETTINGS_DOMAIN_SET.has(item as SettingsDomain));
        if (invalid.length > 0) {
          errors.push(`settingsEditorPolicy.userDomainMap.${userKey} có domain không hợp lệ: ${invalid.join(', ')}.`);
        }
      }
    }

    if (domain === 'approval_matrix') {
      const rules = Array.isArray(value.rules) ? value.rules : [];
      if (rules.length === 0) {
        warnings.push('approval_matrix.rules đang rỗng.');
      }
    }

    if (domain === 'finance_controls') {
      const postingPeriods = this.ensureRecord(value.postingPeriods);
      const periods = this.parseLockedPeriods(postingPeriods.lockedPeriods);
      if (!Array.isArray(postingPeriods.lockedPeriods)) {
        warnings.push('postingPeriods.lockedPeriods nên là mảng.');
      }
      if (periods.length !== this.toStringArray(postingPeriods.lockedPeriods).length) {
        errors.push('Có kỳ khóa không đúng định dạng YYYY-MM.');
      }
    }

    if (domain === 'sales_crm_policies') {
      const orderSettings = this.ensureRecord(value.orderSettings);
      if (typeof orderSettings.allowIncreaseWithoutApproval !== 'boolean') {
        errors.push('orderSettings.allowIncreaseWithoutApproval phải là boolean.');
      }
      if (typeof orderSettings.requireApprovalForDecrease !== 'boolean') {
        errors.push('orderSettings.requireApprovalForDecrease phải là boolean.');
      }
    }

    if (domain === 'integrations') {
      const integrations = this.ensureRecord(value);
      const bhtot = this.ensureRecord(integrations.bhtot);
      const ai = this.ensureRecord(integrations.ai);
      const zalo = this.ensureRecord(integrations.zalo);

      if (this.cleanString(bhtot.apiKey)) {
        errors.push('Không được gửi integrations.bhtot.apiKey. Dùng apiKeyRef + secret store.');
      }
      if (this.cleanString(ai.apiKey)) {
        errors.push('Không được gửi integrations.ai.apiKey. Dùng apiKeyRef + secret store.');
      }
      if (this.cleanString(zalo.accessToken)) {
        errors.push('Không được gửi integrations.zalo.accessToken. Dùng accessTokenRef + secret store.');
      }
      if (this.cleanString(zalo.webhookSecret)) {
        errors.push('Không được gửi integrations.zalo.webhookSecret. Dùng webhookSecretRef + secret store.');
      }

      for (const [field, ref] of [
        ['integrations.bhtot.apiKeyRef', this.cleanString(bhtot.apiKeyRef)],
        ['integrations.ai.apiKeyRef', this.cleanString(ai.apiKeyRef)],
        ['integrations.zalo.accessTokenRef', this.cleanString(zalo.accessTokenRef)],
        ['integrations.zalo.webhookSecretRef', this.cleanString(zalo.webhookSecretRef)]
      ]) {
        if (ref && !this.isAllowedSecretRef(ref)) {
          errors.push(`${field} không nằm trong allowlist.`);
        }
      }

      if (this.toBool(bhtot.enabled, false) && !this.cleanString(bhtot.baseUrl)) {
        errors.push('BHTOT enabled nhưng thiếu baseUrl.');
      }
      if (this.toBool(bhtot.enabled, false) && !this.cleanString(bhtot.apiKeyRef)) {
        warnings.push('BHTOT enabled nhưng chưa có apiKeyRef.');
      }
      if (this.toBool(ai.enabled, false) && !this.cleanString(ai.baseUrl)) {
        errors.push('AI enabled nhưng thiếu baseUrl.');
      }
      if (this.toBool(ai.enabled, false) && !this.cleanString(ai.apiKeyRef)) {
        warnings.push('AI enabled nhưng chưa có apiKeyRef.');
      }
      if (this.toBool(zalo.enabled, false) && !this.cleanString(zalo.accessTokenRef)) {
        warnings.push('Zalo enabled nhưng chưa có accessTokenRef.');
      }
      if (this.toBool(zalo.enabled, false) && !this.cleanString(zalo.webhookSecretRef)) {
        warnings.push('Zalo enabled nhưng chưa có webhookSecretRef.');
      }
    }

    if (domain === 'search_performance') {
      const engine = this.cleanString(value.engine).toLowerCase();
      if (engine !== 'sql' && engine !== 'meili_hybrid') {
        errors.push('search_performance.engine chỉ chấp nhận sql|meili_hybrid.');
      }
      const indexPrefix = this.cleanString(value.indexPrefix);
      if (indexPrefix && !/^[a-zA-Z0-9_-]{1,50}$/.test(indexPrefix)) {
        errors.push('search_performance.indexPrefix chỉ nhận ký tự a-z, A-Z, 0-9, _, - (tối đa 50 ký tự).');
      }
    }

    if (domain === 'data_governance_backup') {
      const retentionDays = this.toInt(value.retentionDays, 365 * 7, 1, 3650);
      const auditRetentionYears = this.toInt(value.auditRetentionYears, 7, 1, 20);
      const auditHotRetentionMonths = this.toInt(value.auditHotRetentionMonths, 12, 1, 120);
      const archiveAfterDays = this.toInt(value.archiveAfterDays, 180, 1, 3650);
      if (archiveAfterDays > retentionDays) {
        warnings.push('archiveAfterDays đang lớn hơn retentionDays.');
      }
      if (auditRetentionYears * 365 > retentionDays) {
        warnings.push('auditRetentionYears đang lớn hơn retentionDays. Audit log có thể bị prune sớm hơn policy mong muốn.');
      }
      if (auditHotRetentionMonths * 30 > auditRetentionYears * 365) {
        warnings.push('auditHotRetentionMonths đang lớn hơn auditRetentionYears. Cần giảm hot window hoặc tăng retention.');
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings
    };
  }

  private redactSensitive(domain: SettingsDomain, payload: unknown) {
    const value = this.ensureRecord(payload);
    if (domain !== 'integrations') {
      return value;
    }

    const integrations = this.ensureRecord(value);
    const bhtot = this.ensureRecord(integrations.bhtot);
    const ai = this.ensureRecord(integrations.ai);
    const zalo = this.ensureRecord(integrations.zalo);

    return {
      ...integrations,
      bhtot: {
        ...bhtot,
        apiKey: '',
        isConfigured: Boolean(this.cleanString(bhtot.baseUrl) && this.cleanString(bhtot.apiKeyRef)),
        hasSecret: Boolean(this.resolveSecretByRef(bhtot.apiKeyRef))
      },
      ai: {
        ...ai,
        apiKey: '',
        isConfigured: Boolean(this.cleanString(ai.baseUrl) && this.cleanString(ai.apiKeyRef)),
        hasSecret: Boolean(this.resolveSecretByRef(ai.apiKeyRef))
      },
      zalo: {
        ...zalo,
        accessToken: '',
        isConfigured: Boolean(this.cleanString(zalo.outboundUrl) || this.cleanString(zalo.apiBaseUrl)),
        hasSecret: Boolean(this.resolveSecretByRef(zalo.accessTokenRef) || this.resolveSecretByRef(zalo.webhookSecretRef))
      }
    };
  }

  private isAllowedSecretRef(ref: string) {
    return (SETTINGS_SECRET_ALLOWLIST as readonly string[]).includes(ref);
  }

  private resolveActor(explicitActor?: string) {
    const actor = this.cleanString(explicitActor);
    if (actor) {
      return actor;
    }

    const authUser = this.ensureRecord(this.cls.get(AUTH_USER_CONTEXT_KEY));
    return this.cleanString(authUser.email) || this.cleanString(authUser.userId) || this.cleanString(authUser.sub) || 'system';
  }

  private collectChangedPaths(before: unknown, after: unknown, prefix = ''): string[] {
    if (this.hashJson(before) === this.hashJson(after)) {
      return [];
    }

    const beforeRecord = this.ensureRecord(before);
    const afterRecord = this.ensureRecord(after);
    const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
    const paths: string[] = [];

    if (keys.size === 0) {
      return [prefix || '$'];
    }

    for (const key of keys) {
      const beforeValue = beforeRecord[key];
      const afterValue = afterRecord[key];
      const path = prefix ? `${prefix}.${key}` : key;

      const beforeIsObject = this.isPlainObject(beforeValue);
      const afterIsObject = this.isPlainObject(afterValue);

      if (beforeIsObject && afterIsObject) {
        const nested = this.collectChangedPaths(beforeValue, afterValue, path);
        paths.push(...nested);
        continue;
      }

      if (this.hashJson(beforeValue) !== this.hashJson(afterValue)) {
        paths.push(path);
      }
    }

    return paths;
  }

  private parseLockedPeriods(input: unknown) {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((item) => this.cleanString(item))
      .filter((period) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period))
      .filter((period, index, arr) => arr.indexOf(period) === index)
      .sort();
  }

  private normalizePeriod(rawPeriod: string) {
    const period = this.cleanString(rawPeriod).replace('/', '-');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new BadRequestException(`Kỳ không hợp lệ: ${rawPeriod}. Định dạng đúng: YYYY-MM.`);
    }
    return period;
  }

  private ensureRecord(value: unknown): Record<string, unknown> {
    if (!this.isPlainObject(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private ensureRecordOrNull(value: unknown): Record<string, unknown> | null {
    if (!this.isPlainObject(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private mergeRecords(base: unknown, patch: unknown): Record<string, unknown> {
    const baseRecord = this.ensureRecord(base);
    const patchRecord = this.ensureRecord(patch);
    const result: Record<string, unknown> = { ...baseRecord };

    for (const key of Object.keys(patchRecord)) {
      const patchValue = patchRecord[key];
      const baseValue = baseRecord[key];
      if (this.isPlainObject(baseValue) && this.isPlainObject(patchValue)) {
        result[key] = this.mergeRecords(baseValue, patchValue);
      } else {
        result[key] = patchValue;
      }
    }

    return result;
  }

  private isPlainObject(value: unknown) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private cleanString(value: unknown) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }

  private toInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(Math.trunc(parsed), min), max);
  }

  private toBool(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => this.cleanString(item)).filter(Boolean);
  }

  private normalizeEnabledModules(value: unknown) {
    const normalized: string[] = [];

    for (const moduleKey of this.toStringArray(value)) {
      const lowered = moduleKey.toLowerCase();
      if (!RUNTIME_TOGGLABLE_MODULES.has(lowered)) {
        continue;
      }
      if (!normalized.includes(lowered)) {
        normalized.push(lowered);
      }
    }

    // Backward compatibility: keep newly introduced audit module visible for legacy org_profile rows.
    if (RUNTIME_TOGGLABLE_MODULES.has(AUDIT_MODULE_KEY) && !normalized.includes(AUDIT_MODULE_KEY)) {
      normalized.push(AUDIT_MODULE_KEY);
    }

    return normalized;
  }

  private hashJson(value: unknown) {
    return createHash('sha256').update(this.stableStringify(value)).digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`).join(',')}}`;
  }
}
