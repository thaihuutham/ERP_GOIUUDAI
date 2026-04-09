import { createHash, randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { AUTH_USER_CONTEXT_KEY, REQUEST_ID_CONTEXT_KEY } from '../../common/request/request.constants';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import {
  decryptSettingsSecret,
  encryptSettingsSecret,
  getSettingsSecretEncryptionEnvKey,
  isEncryptedSettingsSecret,
  SettingsSecretCryptoError
} from '../../common/settings/settings-secret-crypto.util';
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
import { buildSettingsLayoutMetadata } from './settings-layout.metadata';

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
const ASSISTANT_MODULE_KEY = 'assistant';
const HR_APPENDIX_FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;
const HR_APPENDIX_AGGREGATORS = ['none', 'count', 'sum', 'avg', 'min', 'max'] as const;
const HR_APPENDIX_FIELD_STATUS = ['ACTIVE', 'DRAFT', 'INACTIVE', 'ARCHIVED'] as const;
const SETTINGS_USER_ID_PATTERN = /^[A-Za-z0-9._-]{2,80}$/;
const SETTINGS_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SETTINGS_FINANCE_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const IAM_V2_ALL_MODULE_TOKENS = new Set(['*', 'all']);

type HrAppendixFieldType = (typeof HR_APPENDIX_FIELD_TYPES)[number];
type HrAppendixFieldAggregator = (typeof HR_APPENDIX_AGGREGATORS)[number];
type HrAppendixFieldStatus = (typeof HR_APPENDIX_FIELD_STATUS)[number];

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

type AuditViewPolicy = {
  enabled: boolean;
  groups: {
    DIRECTOR: { enabled: boolean };
    BRANCH_MANAGER: { enabled: boolean };
    DEPARTMENT_MANAGER: { enabled: boolean };
  };
  denyIfUngroupedManager: boolean;
};

type AssistantScopeType = 'company' | 'branch' | 'department' | 'self';

type AssistantAccessPolicy = {
  enabled: boolean;
  roleScopeDefaults: {
    ADMIN: AssistantScopeType;
    USER: AssistantScopeType;
  };
  enforcePermissionEngine: boolean;
  denyIfNoScope: boolean;
  allowedModules: string[];
  chatChannelScopeEnforced: boolean;
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

  resolveSecretValue(secretValue: unknown, secretRef: unknown, envFallbackKey = '') {
    const directValue = this.readDecryptedSecret(secretValue, 'integrations.secret', { strict: false });
    if (directValue) {
      return directValue;
    }

    const resolvedByRef = this.resolveSecretByRef(secretRef);
    if (resolvedByRef) {
      return resolvedByRef;
    }

    if (!envFallbackKey) {
      return '';
    }
    return this.cleanString(process.env[envFallbackKey]);
  }

  async getDomain(domainRaw: string) {
    const domain = this.assertDomain(domainRaw);
    const row = await this.prisma.client.setting.findFirst({
      where: { settingKey: this.domainKey(domain) }
    });

    const normalized = this.normalizeDomain(domain, row?.settingValue);
    const persistedValue = this.serializeDomainForStorage(domain, normalized, row?.settingValue);
    if (!row) {
      await this.prisma.client.setting.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          settingKey: this.domainKey(domain),
          settingValue: persistedValue as Prisma.InputJsonValue
        }
      });
    } else if (this.hashJson(row.settingValue) !== this.hashJson(persistedValue)) {
      await this.prisma.client.setting.updateMany({
        where: { id: row.id },
        data: { settingValue: persistedValue as Prisma.InputJsonValue }
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

    if (domain === 'sales_crm_policies') {
      await this.assertSalesTaxonomyRemovalAllowed(currentValue, nextValue);
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

    const persistedValue = this.serializeDomainForStorage(domain, nextValue, currentRow?.settingValue);

    if (!currentRow) {
      await this.prisma.client.setting.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          settingKey: this.domainKey(domain),
          settingValue: persistedValue as Prisma.InputJsonValue
        }
      });
    } else {
      await this.prisma.client.setting.updateMany({
        where: { id: currentRow.id },
        data: {
          settingValue: persistedValue as Prisma.InputJsonValue
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

    const bhtotApiKey = this.resolveSecretValue(bhtot.apiKey, bhtot.apiKeyRef, 'BHTOT_API_KEY');
    const aiApiKey = this.resolveSecretValue(ai.apiKey, ai.apiKeyRef, 'AI_OPENAI_COMPAT_API_KEY');
    const zaloToken = this.resolveSecretValue(zalo.accessToken, zalo.accessTokenRef, 'ZALO_OA_ACCESS_TOKEN');
    const zaloWebhookSecret = this.resolveSecretValue(zalo.webhookSecret, zalo.webhookSecretRef, 'ZALO_OA_WEBHOOK_SECRET');

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
          isConfigured: Boolean(this.cleanString(bhtot.baseUrl) && (this.cleanString(bhtot.apiKey) || this.cleanString(bhtot.apiKeyRef))),
          hasSecret: Boolean(bhtotApiKey)
        },
        ai: {
          ok: aiResult.ok,
          message: aiResult.message,
          isConfigured: Boolean(this.cleanString(ai.baseUrl) && (this.cleanString(ai.apiKey) || this.cleanString(ai.apiKeyRef))),
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
      const normalizedCurrent = this.normalizeDomain(domain, current.data);
      snapshotDomains[domain] = this.serializeDomainForStorage(domain, normalizedCurrent);
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

  getLayoutMetadata() {
    return buildSettingsLayoutMetadata();
  }

  async buildLegacySystemConfig() {
    const org = this.ensureRecord((await this.getDomain('org_profile')).data);
    const locale = this.ensureRecord((await this.getDomain('locale_calendar')).data);
    const sales = this.ensureRecord((await this.getDomain('sales_crm_policies')).data);
    const integrations = this.ensureRecord((await this.getDomain('integrations')).data);
    const bhtot = this.ensureRecord(integrations.bhtot);

    return {
      companyName: this.cleanString(org.companyName) || 'GOIUUDAI',
      taxCode: this.cleanString(org.taxCode),
      address: this.cleanString(org.address),
      currency: this.cleanString(locale.currency) || 'VND',
      dateFormat: this.cleanString(locale.dateFormat) || 'DD/MM/YYYY',
      enabledModules: this.toStringArray(org.enabledModules),
      orderSettings: this.ensureRecord(sales.orderSettings),
      bhtotSync: {
        enabled: this.toBool(bhtot.enabled, false),
        baseUrl: this.cleanString(bhtot.baseUrl),
        apiKey: this.cleanString(bhtot.apiKey),
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
    const legacyApiKey = this.readDecryptedSecret(bhtotSync.apiKey, 'legacy.bhtotSync.apiKey', { strict: false });
    if (!apiKeyRef && legacyApiKey) {
      apiKeyRef = this.isAllowedSecretRef(legacyApiKey) ? legacyApiKey : '';
    }
    const apiKey = legacyApiKey && !this.isAllowedSecretRef(legacyApiKey) ? legacyApiKey : '';

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
        apiKey,
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
    const role = this.normalizeAccessRole(authUser.role);
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
      USER: this.normalizeDomainList(roleMapRaw.USER)
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

  private normalizeAuditViewPolicy(value: unknown): AuditViewPolicy {
    const policy = this.ensureRecord(value);
    const groups = this.ensureRecord(policy.groups);
    const director = this.ensureRecord(groups.DIRECTOR);
    const branchManager = this.ensureRecord(groups.BRANCH_MANAGER);
    const departmentManager = this.ensureRecord(groups.DEPARTMENT_MANAGER);

    return {
      enabled: this.toBool(policy.enabled, true),
      groups: {
        DIRECTOR: {
          enabled: this.toBool(director.enabled, true)
        },
        BRANCH_MANAGER: {
          enabled: this.toBool(branchManager.enabled, true)
        },
        DEPARTMENT_MANAGER: {
          enabled: this.toBool(departmentManager.enabled, true)
        }
      },
      denyIfUngroupedManager: this.toBool(policy.denyIfUngroupedManager, true)
    };
  }

  private normalizeAssistantAccessPolicy(value: unknown): AssistantAccessPolicy {
    const policy = this.ensureRecord(value);
    const roleScopeDefaults = this.ensureRecord(policy.roleScopeDefaults);

    return {
      enabled: this.toBool(policy.enabled, false),
      roleScopeDefaults: {
        ADMIN: this.normalizeAssistantScope(roleScopeDefaults.ADMIN, 'company'),
        USER: this.normalizeAssistantScope(roleScopeDefaults.USER, 'department')
      },
      enforcePermissionEngine: this.toBool(policy.enforcePermissionEngine, true),
      denyIfNoScope: this.toBool(policy.denyIfNoScope, true),
      allowedModules: this.normalizeEnabledModules(policy.allowedModules, { includeAuditFallback: false }),
      chatChannelScopeEnforced: this.toBool(policy.chatChannelScopeEnforced, true)
    };
  }

  private normalizeAssistantScope(value: unknown, fallback: AssistantScopeType): AssistantScopeType {
    const normalized = this.cleanString(value).toLowerCase();
    if (normalized === 'company' || normalized === 'branch' || normalized === 'department' || normalized === 'self') {
      return normalized;
    }
    return fallback;
  }

  private normalizeDomainList(value: unknown): SettingsDomain[] {
    return this.toStringArray(value)
      .map((item) => this.cleanString(item) as SettingsDomain)
      .filter((item): item is SettingsDomain => SETTINGS_DOMAIN_SET.has(item))
      .filter((item, index, list) => list.indexOf(item) === index);
  }

  private normalizeHrAppendixFieldType(value: unknown, fallback: HrAppendixFieldType = 'text'): HrAppendixFieldType {
    const normalized = this.cleanString(value).toLowerCase();
    return (HR_APPENDIX_FIELD_TYPES as readonly string[]).includes(normalized)
      ? (normalized as HrAppendixFieldType)
      : fallback;
  }

  private normalizeHrAppendixAggregator(value: unknown, fallback: HrAppendixFieldAggregator = 'none'): HrAppendixFieldAggregator {
    const normalized = this.cleanString(value).toLowerCase();
    return (HR_APPENDIX_AGGREGATORS as readonly string[]).includes(normalized)
      ? (normalized as HrAppendixFieldAggregator)
      : fallback;
  }

  private normalizeHrAppendixFieldStatus(value: unknown, fallback: HrAppendixFieldStatus = 'ACTIVE'): HrAppendixFieldStatus {
    const normalized = this.cleanString(value).toUpperCase();
    return (HR_APPENDIX_FIELD_STATUS as readonly string[]).includes(normalized)
      ? (normalized as HrAppendixFieldStatus)
      : fallback;
  }

  private slugifyAppendixFieldKey(value: unknown, fallback = '') {
    const normalized = this.cleanString(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    if (normalized) {
      return normalized;
    }
    return this.cleanString(fallback)
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  private resolveFieldKeyFromCatalog(raw: unknown, fieldCatalog: Record<string, unknown>) {
    const candidate = this.cleanString(raw);
    if (!candidate) {
      return '';
    }
    const slug = this.slugifyAppendixFieldKey(candidate);
    const direct = Object.keys(fieldCatalog).find((key) => this.cleanString(key).toLowerCase() === candidate.toLowerCase());
    if (direct) {
      return direct;
    }
    for (const [key, rawField] of Object.entries(fieldCatalog)) {
      const field = this.ensureRecord(rawField);
      const fieldKey = this.cleanString(field.key || key);
      const fieldId = this.cleanString(field.id);
      const label = this.cleanString(field.label);
      if (!fieldKey && !fieldId && !label) {
        continue;
      }
      const candidates = [
        fieldKey.toLowerCase(),
        fieldId.toLowerCase(),
        this.slugifyAppendixFieldKey(label)
      ];
      if (candidates.includes(candidate.toLowerCase()) || candidates.includes(slug)) {
        return key;
      }
    }
    return '';
  }

  private normalizeHrAppendixOptions(value: unknown) {
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const raw of this.toStringArray(value)) {
      const option = raw.replace(/\s+/g, ' ').trim();
      if (!option) {
        continue;
      }
      const dedupeKey = option.toLowerCase();
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      normalized.push(option);
    }

    return normalized;
  }

  private normalizeHrAppendixFieldCatalog(value: unknown, defaults?: unknown) {
    const inputCatalog = this.ensureRecord(value);
    const defaultCatalog = this.ensureRecord(defaults);

    const rawKeys = Array.from(
      new Set([...Object.keys(defaultCatalog), ...Object.keys(inputCatalog)])
    ).map((item) => this.cleanString(item)).filter(Boolean);

    const catalog: Record<string, unknown> = {};
    for (const rawKey of rawKeys) {
      const defaultItem = this.ensureRecord(defaultCatalog[rawKey]);
      const inputItem = this.ensureRecord(inputCatalog[rawKey]);
      const merged = this.ensureRecord(this.mergeRecords(defaultItem, inputItem));
      const key = this.slugifyAppendixFieldKey(merged.key ?? rawKey, rawKey);
      if (!key) {
        continue;
      }
      const type = this.normalizeHrAppendixFieldType(merged.type, this.normalizeHrAppendixFieldType(defaultItem.type, 'text'));
      const options = type === 'select' ? this.normalizeHrAppendixOptions(merged.options) : [];
      const analyticsEnabled = this.toBool(merged.analyticsEnabled, this.toBool(defaultItem.analyticsEnabled, false));
      const aggregator = this.normalizeHrAppendixAggregator(
        merged.aggregator,
        this.normalizeHrAppendixAggregator(defaultItem.aggregator, analyticsEnabled ? 'count' : 'none')
      );
      const validation = this.ensureRecord(merged.validation);
      const normalizedValidation: Record<string, unknown> = {};
      if (validation.required !== undefined) {
        normalizedValidation.required = this.toBool(validation.required, false);
      }
      if (validation.min !== undefined) {
        normalizedValidation.min = this.toNumber(validation.min) ?? 0;
      }
      if (validation.max !== undefined) {
        normalizedValidation.max = this.toNumber(validation.max) ?? 0;
      }
      if (validation.minLength !== undefined) {
        normalizedValidation.minLength = this.toInt(validation.minLength, 0, 0, 20_000);
      }
      if (validation.maxLength !== undefined) {
        normalizedValidation.maxLength = this.toInt(validation.maxLength, 0, 0, 20_000);
      }
      if (validation.pattern !== undefined) {
        const pattern = this.cleanString(validation.pattern);
        if (pattern) {
          normalizedValidation.pattern = pattern;
        }
      }

      catalog[key] = {
        id: this.cleanString(merged.id) || key,
        key,
        label: this.cleanString(merged.label) || key,
        description: this.cleanString(merged.description),
        type,
        options,
        validation: normalizedValidation,
        analyticsEnabled,
        aggregator: analyticsEnabled ? aggregator : 'none',
        status: this.normalizeHrAppendixFieldStatus(merged.status, this.normalizeHrAppendixFieldStatus(defaultItem.status, 'ACTIVE')),
        version: this.toInt(merged.version, this.toInt(defaultItem.version, 1, 1, 1000), 1, 1000)
      };
    }

    return catalog;
  }

  private normalizeHrAppendixTemplateFields(value: unknown, fieldCatalog: Record<string, unknown>, code: string) {
    const rows = Array.isArray(value) ? value : [];
    const fields: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();

    for (const row of rows) {
      let fieldKey = '';
      const raw = this.ensureRecord(row);
      if (typeof row === 'string') {
        fieldKey = this.resolveFieldKeyFromCatalog(row, fieldCatalog) || this.slugifyAppendixFieldKey(row);
      } else {
        fieldKey = this.resolveFieldKeyFromCatalog(raw.fieldKey ?? raw.key ?? raw.fieldId, fieldCatalog);
        if (!fieldKey) {
          fieldKey = this.slugifyAppendixFieldKey(raw.fieldKey ?? raw.key ?? raw.fieldId);
        }
      }

      if (!fieldKey) {
        continue;
      }
      if (seen.has(fieldKey)) {
        continue;
      }
      seen.add(fieldKey);

      fields.push({
        fieldKey,
        required: this.toBool(raw.required, false),
        placeholder: this.cleanString(raw.placeholder),
        defaultValue: raw.defaultValue ?? null,
        helpText: this.cleanString(raw.helpText),
        visibility: this.cleanString(raw.visibility).toLowerCase() === 'hidden' ? 'hidden' : 'visible',
        kpiAlias: this.cleanString(raw.kpiAlias)
      });
    }

    return fields;
  }

  private normalizeHrAppendixTemplates(value: unknown, defaults: unknown, fieldCatalog: Record<string, unknown>) {
    const inputTemplates = this.ensureRecord(value);
    const defaultTemplates = this.ensureRecord(defaults);
    const codes = Array.from(
      new Set([...Object.keys(defaultTemplates), ...Object.keys(inputTemplates)].map((item) => this.cleanString(item).toUpperCase()))
    ).filter((item) => /^PL\d{2}$/.test(item));

    const templates: Record<string, unknown> = {};
    for (const code of codes) {
      const defaultItem = this.ensureRecord(defaultTemplates[code]);
      const inputItem = this.ensureRecord(inputTemplates[code]);
      const merged = this.ensureRecord(this.mergeRecords(defaultItem, inputItem));
      const normalizedFields = this.normalizeHrAppendixTemplateFields(
        merged.fields ?? merged.fieldRefs,
        fieldCatalog,
        code
      );
      templates[code] = {
        name: this.cleanString(merged.name) || code,
        description: this.cleanString(merged.description),
        fields: normalizedFields
      };
    }
    return templates;
  }

  private buildLegacyHrAppendixCatalog(
    templates: Record<string, unknown>,
    fieldCatalog: Record<string, unknown>,
    defaults?: unknown
  ) {
    const defaultCatalog = this.ensureRecord(defaults);
    const output: Record<string, unknown> = {};
    for (const [code, rawTemplate] of Object.entries(templates)) {
      const template = this.ensureRecord(rawTemplate);
      const fields = Array.isArray(template.fields) ? template.fields : [];
      const fieldKeys = fields
        .map((item) => this.ensureRecord(item))
        .map((item) => this.cleanString(item.fieldKey))
        .filter(Boolean)
        .filter((item, index, list) => list.indexOf(item) === index);
      const fallback = this.ensureRecord(defaultCatalog[code]);
      output[code] = {
        name: this.cleanString(template.name) || this.cleanString(fallback.name) || code,
        description: this.cleanString(template.description) || this.cleanString(fallback.description),
        fields: fieldKeys.length > 0 ? fieldKeys : this.toStringArray(fallback.fields)
      };
    }
    return output;
  }

  private normalizeHrAppendixCatalog(value: unknown, defaults?: unknown) {
    const inputCatalog = this.ensureRecord(value);
    const defaultCatalog = this.ensureRecord(defaults);
    const codes = Array.from(
      new Set([...Object.keys(defaultCatalog), ...Object.keys(inputCatalog)].map((item) => this.cleanString(item).toUpperCase()))
    ).filter((item) => item.startsWith('PL'));

    const catalog: Record<string, unknown> = {};
    for (const code of codes) {
      const merged = this.mergeRecords(
        this.ensureRecord(defaultCatalog[code]),
        this.ensureRecord(inputCatalog[code])
      );
      const item = this.ensureRecord(merged);
      catalog[code] = {
        name: this.cleanString(item.name) || code,
        description: this.cleanString(item.description),
        fields: this.toStringArray(item.fields)
      };
    }

    return catalog;
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
        enabledModules: this.normalizeEnabledModules(orgProfile.enabledModules, { includeAuditFallback: true })
      };
    }

    if (domain === 'integrations') {
      const integrations = this.ensureRecord(merged);
      const bhtot = this.ensureRecord(integrations.bhtot);
      const ai = this.ensureRecord(integrations.ai);
      const zalo = this.ensureRecord(integrations.zalo);
      const payments = this.ensureRecord(integrations.payments);

      const {
        apiSecret: _bhtotApiSecret,
        token: _bhtotToken,
        hasSecret: _bhtotHasSecret,
        isConfigured: _bhtotIsConfigured,
        ...bhtotSafe
      } = bhtot;
      const {
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
      const {
        token: _paymentsToken,
        hasSecret: _paymentsHasSecret,
        isConfigured: _paymentsIsConfigured,
        ...paymentsSafe
      } = payments;

      const normalizedApiKeyRef = this.cleanString(bhtot.apiKeyRef);
      const normalizedApiKey = this.readDecryptedSecret(bhtot.apiKey, 'integrations.bhtot.apiKey', { strict: false });
      const normalizedAiKeyRef = this.cleanString(ai.apiKeyRef);
      const normalizedAiApiKey = this.readDecryptedSecret(ai.apiKey, 'integrations.ai.apiKey', { strict: false });
      const normalizedZaloTokenRef = this.cleanString(zalo.accessTokenRef);
      const normalizedZaloAccessToken = this.readDecryptedSecret(zalo.accessToken, 'integrations.zalo.accessToken', { strict: false });
      const normalizedZaloWebhookSecretRef = this.cleanString(zalo.webhookSecretRef);
      const normalizedZaloWebhookSecret = this.readDecryptedSecret(zalo.webhookSecret, 'integrations.zalo.webhookSecret', { strict: false });
      const normalizedPaymentsSecretRef = this.cleanString(payments.bankWebhookSecretRef);

      return {
        ...integrations,
        bhtot: {
          ...bhtotSafe,
          enabled: this.toBool(bhtot.enabled, false),
          apiKey: normalizedApiKey,
          apiKeyRef: normalizedApiKeyRef,
          timeoutMs: this.toInt(bhtot.timeoutMs, 12000, 1000, 120000),
          lastSyncAt: bhtot.lastSyncAt ? String(bhtot.lastSyncAt) : null,
          lastValidatedAt: bhtot.lastValidatedAt ? String(bhtot.lastValidatedAt) : null
        },
        ai: {
          ...aiSafe,
          enabled: this.toBool(ai.enabled, false),
          apiKey: normalizedAiApiKey,
          apiKeyRef: normalizedAiKeyRef,
          timeoutMs: this.toInt(ai.timeoutMs, 45000, 1000, 120000),
          lastValidatedAt: ai.lastValidatedAt ? String(ai.lastValidatedAt) : null
        },
        zalo: {
          ...zaloSafe,
          enabled: this.toBool(zalo.enabled, false),
          accessToken: normalizedZaloAccessToken,
          accessTokenRef: normalizedZaloTokenRef,
          webhookSecret: normalizedZaloWebhookSecret,
          webhookSecretRef: normalizedZaloWebhookSecretRef,
          outboundTimeoutMs: this.toInt(zalo.outboundTimeoutMs, 20000, 2000, 180000),
          lastValidatedAt: zalo.lastValidatedAt ? String(zalo.lastValidatedAt) : null
        },
        payments: {
          ...paymentsSafe,
          enabled: this.toBool(payments.enabled, true),
          bankWebhookSecretRef: normalizedPaymentsSecretRef,
          callbackSkewSeconds: this.toInt(payments.callbackSkewSeconds, 300, 10, 86_400),
          reconcileEnabled: this.toBool(payments.reconcileEnabled, true)
        }
      };
    }

    if (domain === 'finance_controls') {
      const finance = this.ensureRecord(merged);
      const postingPeriods = this.ensureRecord(finance.postingPeriods);
      const recordIdentity = this.ensureRecord(finance.recordIdentity);
      const normalizeRecordIdentityMode = (value: unknown): 'technical' | 'compact' | 'sequence' => {
        const mode = this.cleanString(value).toLowerCase();
        if (mode === 'technical' || mode === 'compact' || mode === 'sequence') {
          return mode;
        }
        return 'compact';
      };
      const normalizeForeignKeyMode = (value: unknown): 'technical' | 'compact' => {
        const mode = this.cleanString(value).toLowerCase();
        if (mode === 'technical' || mode === 'compact') {
          return mode;
        }
        return 'compact';
      };
      return {
        ...finance,
        postingPeriods: {
          ...postingPeriods,
          lockedPeriods: this.parseLockedPeriods(postingPeriods.lockedPeriods)
        },
        recordIdentity: {
          mode: normalizeRecordIdentityMode(recordIdentity.mode),
          foreignKeyMode: normalizeForeignKeyMode(recordIdentity.foreignKeyMode),
          prefix: this.cleanString(recordIdentity.prefix).toUpperCase() || 'ID',
          sequencePadding: this.toInt(recordIdentity.sequencePadding, 5, 2, 10),
          compactLength: this.toInt(recordIdentity.compactLength, 8, 4, 20)
        },
        transactionCutoffHour: this.toInt(finance.transactionCutoffHour, 23, 0, 23)
      };
    }

    if (domain === 'sales_crm_policies') {
      const sales = this.ensureRecord(merged);
      const orderSettings = this.ensureRecord(sales.orderSettings);
      const paymentPolicy = this.ensureRecord(sales.paymentPolicy);
      const customerTaxonomy = this.ensureRecord(sales.customerTaxonomy);
      const tagRegistry = this.ensureRecord(sales.tagRegistry);
      const renewalReminder = this.ensureRecord(sales.renewalReminder);
      const productLeadDays = this.ensureRecord(renewalReminder.productLeadDays);
      const normalizedOverrideRoles = this.toStringArray(paymentPolicy.overrideRoles)
        .map((item) => this.cleanString(item).toUpperCase())
        .filter((item) => item === 'ADMIN')
        .filter((item, index, list) => list.indexOf(item) === index);
      const overrideRoles = normalizedOverrideRoles.length > 0 ? normalizedOverrideRoles : ['ADMIN'];
      return {
        ...sales,
        orderSettings: {
          allowIncreaseWithoutApproval: this.toBool(orderSettings.allowIncreaseWithoutApproval, true),
          requireApprovalForDecrease: this.toBool(orderSettings.requireApprovalForDecrease, true),
          approverId: this.cleanString(orderSettings.approverId)
        },
        paymentPolicy: {
          ...paymentPolicy,
          partialPaymentEnabled: this.toBool(paymentPolicy.partialPaymentEnabled, true),
          overrideRoles,
          callbackTolerance: this.toInt(paymentPolicy.callbackTolerance, 300, 10, 86_400),
          reconcileSchedule: this.cleanString(paymentPolicy.reconcileSchedule) || '0 */2 * * *'
        },
        customerTaxonomy: {
          stages: this.normalizeSalesTaxonomyValues(customerTaxonomy.stages),
          sources: this.normalizeSalesTaxonomyValues(customerTaxonomy.sources)
        },
        tagRegistry: {
          customerTags: this.normalizeSalesTagRegistryValues(tagRegistry.customerTags),
          interactionTags: this.normalizeSalesTagRegistryValues(tagRegistry.interactionTags),
          interactionResultTags: this.normalizeSalesTagRegistryValues(tagRegistry.interactionResultTags)
        },
        renewalReminder: {
          globalLeadDays: this.toInt(renewalReminder.globalLeadDays, 30, 1, 365),
          productLeadDays: {
            TELECOM_PACKAGE: this.readOptionalPositiveInt(productLeadDays.TELECOM_PACKAGE, 1, 365),
            AUTO_INSURANCE: this.readOptionalPositiveInt(productLeadDays.AUTO_INSURANCE, 1, 365),
            MOTO_INSURANCE: this.readOptionalPositiveInt(productLeadDays.MOTO_INSURANCE, 1, 365),
            DIGITAL_SERVICE: this.readOptionalPositiveInt(productLeadDays.DIGITAL_SERVICE, 1, 365)
          }
        }
      };
    }

    if (domain === 'hr_policies') {
      const hr = this.ensureRecord(merged);
      const leave = this.ensureRecord(hr.leave);
      const payroll = this.ensureRecord(hr.payroll);
      const approverChain = this.ensureRecord(hr.approverChain);
      const defaultHr = this.ensureRecord(DEFAULT_SETTINGS_DOMAINS.hr_policies);
      const appendixFieldCatalog = this.normalizeHrAppendixFieldCatalog(
        hr.appendixFieldCatalog,
        defaultHr.appendixFieldCatalog
      );
      const appendixTemplates = this.normalizeHrAppendixTemplates(
        hr.appendixTemplates ?? hr.appendixCatalog,
        defaultHr.appendixTemplates ?? defaultHr.appendixCatalog,
        appendixFieldCatalog
      );
      const appendixCatalog = this.buildLegacyHrAppendixCatalog(
        appendixTemplates,
        appendixFieldCatalog,
        defaultHr.appendixCatalog
      );
      return {
        ...hr,
        leave: {
          annualDefaultDays: this.toInt(leave.annualDefaultDays, 12, 0, 366),
          maxCarryOverDays: this.toInt(leave.maxCarryOverDays, 5, 0, 120)
        },
        payroll: {
          cycle: this.cleanString(payroll.cycle) || 'monthly',
          cutoffDay: this.toInt(payroll.cutoffDay, 25, 1, 31)
        },
        approverChain: {
          leaveApproverRole: this.cleanString(approverChain.leaveApproverRole).toUpperCase() || 'USER',
          payrollApproverRole: this.cleanString(approverChain.payrollApproverRole).toUpperCase() || 'ADMIN'
        },
        appendixFieldCatalog,
        appendixTemplates,
        appendixCatalog
      };
    }

    if (domain === 'access_security') {
      const security = this.ensureRecord(merged);
      const passwordPolicy = this.ensureRecord(security.passwordPolicy);
      const loginPolicy = this.ensureRecord(security.loginPolicy);
      const permissionPolicy = this.ensureRecord(security.permissionPolicy);
      const iamV2 = this.ensureRecord(security.iamV2);
      const auditViewPolicy = this.normalizeAuditViewPolicy(security.auditViewPolicy);
      const conflictPolicy = this.cleanString(permissionPolicy.conflictPolicy).toUpperCase() === 'ALLOW_OVERRIDES'
        ? 'ALLOW_OVERRIDES'
        : 'DENY_OVERRIDES';
      const iamV2Mode = this.cleanString(iamV2.mode).toUpperCase() === 'OFF'
        ? 'OFF'
        : this.cleanString(iamV2.mode).toUpperCase() === 'ENFORCE'
          ? 'ENFORCE'
          : 'SHADOW';
      return {
        ...security,
        sessionTimeoutMinutes: this.toInt(security.sessionTimeoutMinutes, 480, 5, 1440),
        superAdminIds: this.normalizeUserIdList(security.superAdminIds),
        permissionPolicy: {
          enabled: this.toBool(permissionPolicy.enabled, false),
          conflictPolicy,
          superAdminIds: this.normalizeUserIdList(permissionPolicy.superAdminIds),
          superAdminEmails: this.normalizeEmailList(permissionPolicy.superAdminEmails)
        },
        iamV2: {
          enabled: this.toBool(iamV2.enabled, false),
          mode: iamV2Mode,
          enforcementModules: this.normalizeIamV2EnforcementModules(iamV2.enforcementModules),
          protectAdminCore: this.toBool(iamV2.protectAdminCore, true),
          denySelfElevation: this.toBool(iamV2.denySelfElevation, true)
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
        auditViewPolicy,
        assistantAccessPolicy: this.normalizeAssistantAccessPolicy(security.assistantAccessPolicy),
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

  private serializeDomainForStorage(domain: SettingsDomain, payload: Record<string, unknown>, existingPayload?: unknown) {
    if (domain !== 'integrations') {
      return payload;
    }

    const integrations = this.ensureRecord(payload);
    const existing = this.ensureRecord(existingPayload);
    const bhtot = this.ensureRecord(integrations.bhtot);
    const existingBhtot = this.ensureRecord(existing.bhtot);
    const ai = this.ensureRecord(integrations.ai);
    const existingAi = this.ensureRecord(existing.ai);
    const zalo = this.ensureRecord(integrations.zalo);
    const existingZalo = this.ensureRecord(existing.zalo);

    return {
      ...integrations,
      bhtot: {
        ...bhtot,
        apiKey: this.encryptSecretForStorage(
          bhtot.apiKey,
          'integrations.bhtot.apiKey',
          existingBhtot.apiKey
        )
      },
      ai: {
        ...ai,
        apiKey: this.encryptSecretForStorage(
          ai.apiKey,
          'integrations.ai.apiKey',
          existingAi.apiKey
        )
      },
      zalo: {
        ...zalo,
        accessToken: this.encryptSecretForStorage(
          zalo.accessToken,
          'integrations.zalo.accessToken',
          existingZalo.accessToken
        ),
        webhookSecret: this.encryptSecretForStorage(
          zalo.webhookSecret,
          'integrations.zalo.webhookSecret',
          existingZalo.webhookSecret
        )
      }
    };
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
      const iamV2 = this.ensureRecord(value.iamV2);
      const conflictPolicy = this.cleanString(permissionPolicy.conflictPolicy).toUpperCase();
      if (conflictPolicy && conflictPolicy !== 'DENY_OVERRIDES' && conflictPolicy !== 'ALLOW_OVERRIDES') {
        errors.push('permissionPolicy.conflictPolicy chỉ nhận DENY_OVERRIDES hoặc ALLOW_OVERRIDES.');
      }
      const iamV2Mode = this.cleanString(iamV2.mode).toUpperCase();
      if (iamV2Mode && iamV2Mode !== 'OFF' && iamV2Mode !== 'SHADOW' && iamV2Mode !== 'ENFORCE') {
        errors.push('iamV2.mode chỉ nhận OFF hoặc SHADOW hoặc ENFORCE.');
      }
      const iamV2EnforcementModules = this.toStringArray(iamV2.enforcementModules);
      const iamV2AllModules = iamV2EnforcementModules.some((item) => this.isIamV2AllModulesToken(item));
      const invalidIamV2Modules = iamV2EnforcementModules
        .map((item) => item.toLowerCase())
        .filter((item) => !this.isIamV2AllModulesToken(item))
        .filter((item) => !RUNTIME_TOGGLABLE_MODULES.has(item));
      if (invalidIamV2Modules.length > 0) {
        errors.push(`iamV2.enforcementModules có module không hợp lệ: ${invalidIamV2Modules.join(', ')}.`);
      }
      if (iamV2AllModules && iamV2EnforcementModules.length > 1) {
        warnings.push('iamV2.enforcementModules chứa token ALL, các module cụ thể sẽ bị bỏ qua.');
      }
      if (this.toBool(iamV2.enabled, false) && iamV2Mode === 'OFF') {
        warnings.push('iamV2.enabled=true nhưng iamV2.mode=OFF, enforcement sẽ không chạy.');
      }
      const invalidLegacySuperAdminIds = this.collectInvalidUserIds(value.superAdminIds);
      if (invalidLegacySuperAdminIds.length > 0) {
        errors.push(`superAdminIds chứa ID không hợp lệ: ${invalidLegacySuperAdminIds.join(', ')}.`);
      }
      const invalidPolicySuperAdminIds = this.collectInvalidUserIds(permissionPolicy.superAdminIds);
      if (invalidPolicySuperAdminIds.length > 0) {
        errors.push(`permissionPolicy.superAdminIds chứa ID không hợp lệ: ${invalidPolicySuperAdminIds.join(', ')}.`);
      }
      const invalidPolicySuperAdminEmails = this.collectInvalidEmails(permissionPolicy.superAdminEmails);
      if (invalidPolicySuperAdminEmails.length > 0) {
        errors.push(`permissionPolicy.superAdminEmails chứa email không hợp lệ: ${invalidPolicySuperAdminEmails.join(', ')}.`);
      }
      const password = this.ensureRecord(value.passwordPolicy);
      if (this.toInt(password.minLength, 8, 6, 64) < 6) {
        errors.push('passwordPolicy.minLength phải >= 6.');
      }
      const auditViewPolicy = this.ensureRecord(value.auditViewPolicy);
      const groups = this.ensureRecord(auditViewPolicy.groups);
      for (const groupKey of ['DIRECTOR', 'BRANCH_MANAGER', 'DEPARTMENT_MANAGER']) {
        const group = this.ensureRecord(groups[groupKey]);
        if (group.enabled === undefined) {
          errors.push(`auditViewPolicy.groups.${groupKey}.enabled là bắt buộc.`);
        }
      }
      if (auditViewPolicy.denyIfUngroupedManager === undefined) {
        errors.push('auditViewPolicy.denyIfUngroupedManager là bắt buộc.');
      }

      const assistantAccessPolicy = this.ensureRecord(value.assistantAccessPolicy);
      const roleScopeDefaults = this.ensureRecord(assistantAccessPolicy.roleScopeDefaults);
      for (const role of ['ADMIN', 'USER']) {
        const rawScope = roleScopeDefaults[role];
        const scope = this.cleanString(rawScope).toLowerCase();
        if (!scope || !['company', 'branch', 'department', 'self'].includes(scope)) {
          errors.push(`assistantAccessPolicy.roleScopeDefaults.${role} phải là company|branch|department|self.`);
        }
      }

      const assistantModules = this.toStringArray(assistantAccessPolicy.allowedModules);
      const invalidModules = assistantModules
        .map((item) => item.toLowerCase())
        .filter((item) => !RUNTIME_TOGGLABLE_MODULES.has(item));
      if (invalidModules.length > 0) {
        errors.push(`assistantAccessPolicy.allowedModules có module không hợp lệ: ${invalidModules.join(', ')}.`);
      }

      if (this.toBool(assistantAccessPolicy.enabled, false) && assistantModules.length === 0) {
        warnings.push('assistantAccessPolicy.enabled=true nhưng allowedModules đang rỗng.');
      }

      const policy = this.ensureRecord(value.settingsEditorPolicy);
      const domainRoleMap = this.ensureRecord(policy.domainRoleMap);
      const userDomainMap = this.ensureRecord(policy.userDomainMap);

      for (const role of ['ADMIN', 'USER']) {
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
      const invalidPeriods = this.collectInvalidLockedPeriods(postingPeriods.lockedPeriods);
      if (invalidPeriods.length > 0) {
        errors.push(`postingPeriods.lockedPeriods có kỳ không đúng định dạng YYYY-MM: ${invalidPeriods.join(', ')}.`);
      }
      const rawPeriods = this.toStringArray(postingPeriods.lockedPeriods).map((item) => this.normalizePeriodToken(item));
      const dedupedPeriodCount = new Set(rawPeriods).size;
      if (rawPeriods.length > dedupedPeriodCount) {
        warnings.push('postingPeriods.lockedPeriods có giá trị trùng lặp; hệ thống sẽ tự gộp.');
      }
      if (Array.isArray(postingPeriods.lockedPeriods) && periods.length === 0 && rawPeriods.length > 0) {
        warnings.push('postingPeriods.lockedPeriods hiện chưa có kỳ hợp lệ sau chuẩn hóa.');
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

      const tagRegistry = this.ensureRecord(value.tagRegistry);
      const customerTags = this.normalizeSalesTagRegistryValues(tagRegistry.customerTags);
      const interactionTags = this.normalizeSalesTagRegistryValues(tagRegistry.interactionTags);
      const interactionResultTags = this.normalizeSalesTagRegistryValues(tagRegistry.interactionResultTags);

      if (customerTags.length === 0) {
        warnings.push('sales_crm_policies.tagRegistry.customerTags đang rỗng.');
      }
      if (interactionTags.length === 0) {
        warnings.push('sales_crm_policies.tagRegistry.interactionTags đang rỗng.');
      }
      if (interactionResultTags.length === 0) {
        warnings.push('sales_crm_policies.tagRegistry.interactionResultTags đang rỗng.');
      }

      const renewalReminder = this.ensureRecord(value.renewalReminder);
      const productLeadDays = this.ensureRecord(renewalReminder.productLeadDays);
      const globalLeadDays = this.readOptionalPositiveInt(renewalReminder.globalLeadDays, 1, 365);
      if (globalLeadDays === null) {
        errors.push('sales_crm_policies.renewalReminder.globalLeadDays phải là số nguyên trong khoảng 1..365.');
      }
      for (const key of ['TELECOM_PACKAGE', 'AUTO_INSURANCE', 'MOTO_INSURANCE', 'DIGITAL_SERVICE'] as const) {
        const overrideValue = productLeadDays[key];
        if (overrideValue === undefined || overrideValue === null || overrideValue === '') {
          continue;
        }
        const parsed = this.readOptionalPositiveInt(overrideValue, 1, 365);
        if (parsed === null) {
          errors.push(`sales_crm_policies.renewalReminder.productLeadDays.${key} phải là số nguyên trong khoảng 1..365 hoặc để trống.`);
        }
      }
    }

    if (domain === 'hr_policies') {
      const appendixFieldCatalog = this.ensureRecord(value.appendixFieldCatalog);
      const fieldKeys = Object.keys(appendixFieldCatalog);
      if (fieldKeys.length === 0) {
        warnings.push('hr_policies.appendixFieldCatalog đang rỗng.');
      }

      for (const fieldKeyRaw of fieldKeys) {
        const fieldKey = this.cleanString(fieldKeyRaw);
        const field = this.ensureRecord(appendixFieldCatalog[fieldKeyRaw]);
        if (!fieldKey) {
          errors.push('appendixFieldCatalog chứa key rỗng.');
          continue;
        }
        if (!this.cleanString(field.label)) {
          errors.push(`appendixFieldCatalog.${fieldKeyRaw}.label là bắt buộc.`);
        }
        const type = this.cleanString(field.type).toLowerCase();
        if (type && !(HR_APPENDIX_FIELD_TYPES as readonly string[]).includes(type)) {
          errors.push(`appendixFieldCatalog.${fieldKeyRaw}.type không hợp lệ.`);
        }
        const aggregator = this.cleanString(field.aggregator).toLowerCase();
        if (aggregator && !(HR_APPENDIX_AGGREGATORS as readonly string[]).includes(aggregator)) {
          errors.push(`appendixFieldCatalog.${fieldKeyRaw}.aggregator không hợp lệ.`);
        }

        const options = this.normalizeHrAppendixOptions(field.options);
        if (type === 'select' && options.length === 0) {
          warnings.push(`appendixFieldCatalog.${fieldKeyRaw}.options đang rỗng cho field type=select.`);
        }
      }

      const appendixTemplates = this.ensureRecord(value.appendixTemplates);
      const appendixCatalog = this.ensureRecord(value.appendixCatalog);
      const templateSource = Object.keys(appendixTemplates).length > 0 ? appendixTemplates : appendixCatalog;
      const codes = Object.keys(templateSource);
      if (codes.length === 0) {
        warnings.push('hr_policies.appendixTemplates đang rỗng.');
      }

      for (const codeRaw of codes) {
        const code = this.cleanString(codeRaw).toUpperCase();
        const item = this.ensureRecord(templateSource[codeRaw]);
        if (!/^PL\d{2}$/.test(code)) {
          errors.push(`appendixTemplates.${codeRaw} không đúng định dạng mã phụ lục (PLxx).`);
        }
        if (!this.cleanString(item.name)) {
          errors.push(`appendixTemplates.${codeRaw}.name là bắt buộc.`);
        }

        const fieldRows = Array.isArray(item.fields) ? item.fields : [];
        if (fieldRows.length === 0) {
          warnings.push(`appendixTemplates.${codeRaw}.fields đang rỗng.`);
        }
        const seenTemplateFieldKeys = new Set<string>();
        for (let index = 0; index < fieldRows.length; index += 1) {
          const row = fieldRows[index];
          const rawFieldKey = typeof row === 'string'
            ? row
            : this.ensureRecord(row).fieldKey ?? this.ensureRecord(row).key ?? this.ensureRecord(row).fieldId;
          const resolvedFieldKey = this.resolveFieldKeyFromCatalog(rawFieldKey, appendixFieldCatalog);
          const fieldKey = resolvedFieldKey || this.cleanString(rawFieldKey);
          if (!fieldKey) {
            errors.push(`appendixTemplates.${codeRaw}.fields.${index}.fieldKey là bắt buộc.`);
            continue;
          }

          const dedupeKey = fieldKey.toLowerCase();
          if (seenTemplateFieldKeys.has(dedupeKey)) {
            warnings.push(`appendixTemplates.${codeRaw}.fields có field trùng lặp: ${fieldKey}.`);
            continue;
          }
          seenTemplateFieldKeys.add(dedupeKey);

          const existsInCatalog = Boolean(appendixFieldCatalog[fieldKey]);
          if (!existsInCatalog && !fieldKey.toLowerCase().startsWith(`${code.toLowerCase()}_`)) {
            errors.push(`appendixTemplates.${codeRaw}.fields.${index}.fieldKey (${fieldKey}) không tồn tại trong appendixFieldCatalog hoặc không đúng namespace ${code}_*.`);
          }
        }
      }
    }

    if (domain === 'integrations') {
      const integrations = this.ensureRecord(value);
      const bhtot = this.ensureRecord(integrations.bhtot);
      const ai = this.ensureRecord(integrations.ai);
      const zalo = this.ensureRecord(integrations.zalo);
      const payments = this.ensureRecord(integrations.payments);

      for (const [field, ref] of [
        ['integrations.bhtot.apiKeyRef', this.cleanString(bhtot.apiKeyRef)],
        ['integrations.ai.apiKeyRef', this.cleanString(ai.apiKeyRef)],
        ['integrations.zalo.accessTokenRef', this.cleanString(zalo.accessTokenRef)],
        ['integrations.zalo.webhookSecretRef', this.cleanString(zalo.webhookSecretRef)],
        ['integrations.payments.bankWebhookSecretRef', this.cleanString(payments.bankWebhookSecretRef)]
      ]) {
        if (ref && !this.isAllowedSecretRef(ref)) {
          errors.push(`${field} không nằm trong allowlist.`);
        }
      }

      if (this.toBool(bhtot.enabled, false) && !this.cleanString(bhtot.baseUrl)) {
        errors.push('BHTOT enabled nhưng thiếu baseUrl.');
      }
      if (this.toBool(bhtot.enabled, false) && !this.cleanString(bhtot.apiKey) && !this.cleanString(bhtot.apiKeyRef)) {
        warnings.push('BHTOT enabled nhưng chưa có apiKey hoặc apiKeyRef.');
      }
      if (this.toBool(ai.enabled, false) && !this.cleanString(ai.baseUrl)) {
        errors.push('AI enabled nhưng thiếu baseUrl.');
      }
      if (this.toBool(ai.enabled, false) && !this.cleanString(ai.apiKey) && !this.cleanString(ai.apiKeyRef)) {
        warnings.push('AI enabled nhưng chưa có apiKey hoặc apiKeyRef.');
      }
      if (this.toBool(zalo.enabled, false) && !this.cleanString(zalo.accessToken) && !this.cleanString(zalo.accessTokenRef)) {
        warnings.push('Zalo enabled nhưng chưa có accessToken hoặc accessTokenRef.');
      }
      if (this.toBool(zalo.enabled, false) && !this.cleanString(zalo.webhookSecret) && !this.cleanString(zalo.webhookSecretRef)) {
        warnings.push('Zalo enabled nhưng chưa có webhookSecret hoặc webhookSecretRef.');
      }
      if (this.toBool(payments.enabled, true) && !this.cleanString(payments.bankWebhookSecretRef)) {
        warnings.push('Payments callback enabled nhưng chưa có bankWebhookSecretRef.');
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
    const payments = this.ensureRecord(integrations.payments);
    const bhtotSecret = this.resolveSecretValue(bhtot.apiKey, bhtot.apiKeyRef, 'BHTOT_API_KEY');
    const aiSecret = this.resolveSecretValue(ai.apiKey, ai.apiKeyRef, 'AI_OPENAI_COMPAT_API_KEY');
    const zaloToken = this.resolveSecretValue(zalo.accessToken, zalo.accessTokenRef, 'ZALO_OA_ACCESS_TOKEN');
    const zaloWebhookSecret = this.resolveSecretValue(zalo.webhookSecret, zalo.webhookSecretRef, 'ZALO_OA_WEBHOOK_SECRET');
    const paymentsSecret = this.resolveSecretValue('', payments.bankWebhookSecretRef, 'PAYMENTS_BANK_WEBHOOK_SECRET');

    return {
      ...integrations,
      bhtot: {
        ...bhtot,
        isConfigured: Boolean(this.cleanString(bhtot.baseUrl) && (this.cleanString(bhtot.apiKey) || this.cleanString(bhtot.apiKeyRef))),
        hasSecret: Boolean(bhtotSecret)
      },
      ai: {
        ...ai,
        isConfigured: Boolean(this.cleanString(ai.baseUrl) && (this.cleanString(ai.apiKey) || this.cleanString(ai.apiKeyRef))),
        hasSecret: Boolean(aiSecret)
      },
      zalo: {
        ...zalo,
        isConfigured: Boolean(this.cleanString(zalo.outboundUrl) || this.cleanString(zalo.apiBaseUrl)),
        hasSecret: Boolean(zaloToken || zaloWebhookSecret)
      },
      payments: {
        ...payments,
        isConfigured: this.toBool(payments.enabled, true),
        hasSecret: Boolean(paymentsSecret)
      }
    };
  }

  private isAllowedSecretRef(ref: string) {
    return (SETTINGS_SECRET_ALLOWLIST as readonly string[]).includes(ref);
  }

  private readDecryptedSecret(secretValue: unknown, fieldPath: string, options: { strict: boolean }) {
    const raw = this.cleanString(secretValue);
    if (!raw) {
      return '';
    }
    try {
      return this.cleanString(decryptSettingsSecret(raw));
    } catch (error) {
      if (options.strict) {
        const message = error instanceof SettingsSecretCryptoError
          ? error.message
          : 'Không thể giải mã secret.';
        throw new BadRequestException(`${fieldPath}: ${message}`);
      }
      return '';
    }
  }

  private encryptSecretForStorage(secretValue: unknown, fieldPath: string, existingCipher?: unknown) {
    const plain = this.cleanString(secretValue);
    if (!plain) {
      return '';
    }
    const existingRaw = this.cleanString(existingCipher);
    if (existingRaw && isEncryptedSettingsSecret(existingRaw)) {
      const existingPlain = this.readDecryptedSecret(existingRaw, fieldPath, { strict: false });
      if (existingPlain && existingPlain === plain) {
        return existingRaw;
      }
    }
    try {
      return this.cleanString(encryptSettingsSecret(plain));
    } catch (error) {
      const baseMessage = error instanceof SettingsSecretCryptoError
        ? error.message
        : 'Không thể mã hóa secret.';
      throw new BadRequestException(
        `${fieldPath}: ${baseMessage} (env: ${getSettingsSecretEncryptionEnvKey()})`
      );
    }
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
      .map((item) => this.normalizePeriodToken(this.cleanString(item)))
      .filter((period) => SETTINGS_FINANCE_PERIOD_PATTERN.test(period))
      .filter((period, index, arr) => arr.indexOf(period) === index)
      .sort();
  }

  private normalizePeriod(rawPeriod: string) {
    const period = this.normalizePeriodToken(rawPeriod);
    if (!SETTINGS_FINANCE_PERIOD_PATTERN.test(period)) {
      throw new BadRequestException(`Kỳ không hợp lệ: ${rawPeriod}. Định dạng đúng: YYYY-MM.`);
    }
    return period;
  }

  private normalizePeriodToken(rawPeriod: unknown) {
    return this.cleanString(rawPeriod).replace('/', '-');
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

  private normalizeAccessRole(value: unknown) {
    const normalized = this.cleanString(value).toUpperCase();
    if (normalized === 'ADMIN') {
      return 'ADMIN';
    }
    if (normalized === 'USER') {
      return 'USER';
    }
    return '';
  }

  private readOptionalPositiveInt(value: unknown, min: number, max: number): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      return null;
    }
    return parsed;
  }

  private toInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(Math.trunc(parsed), min), max);
  }

  private toNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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

  private normalizeUserIdList(value: unknown) {
    const result: string[] = [];
    for (const item of this.toStringArray(value)) {
      if (!result.includes(item)) {
        result.push(item);
      }
    }
    return result;
  }

  private normalizeEmailList(value: unknown) {
    const result: string[] = [];
    for (const item of this.toStringArray(value).map((entry) => entry.toLowerCase())) {
      if (!result.includes(item)) {
        result.push(item);
      }
    }
    return result;
  }

  private collectInvalidUserIds(value: unknown) {
    return this.normalizeUserIdList(value).filter((item) => !SETTINGS_USER_ID_PATTERN.test(item));
  }

  private collectInvalidEmails(value: unknown) {
    return this.normalizeEmailList(value).filter((item) => !SETTINGS_EMAIL_PATTERN.test(item));
  }

  private collectInvalidLockedPeriods(value: unknown) {
    return this.toStringArray(value)
      .map((item) => this.normalizePeriodToken(item))
      .filter((item) => !SETTINGS_FINANCE_PERIOD_PATTERN.test(item));
  }

  private normalizeSalesTaxonomyValues(value: unknown) {
    return Array.from(
      new Set(
        this.toStringArray(value)
          .map((item) => this.cleanString(item))
          .filter(Boolean)
      )
    );
  }

  private normalizeSalesTagRegistryValues(value: unknown) {
    return Array.from(
      new Set(
        this.toStringArray(value)
          .map((item) => this.cleanString(item).toLowerCase())
          .filter(Boolean)
      )
    );
  }

  private async assertSalesTaxonomyRemovalAllowed(
    currentValueRaw: Record<string, unknown>,
    nextValueRaw: Record<string, unknown>
  ) {
    const currentTaxonomy = this.ensureRecord(currentValueRaw.customerTaxonomy);
    const nextTaxonomy = this.ensureRecord(nextValueRaw.customerTaxonomy);
    const currentTagRegistry = this.ensureRecord(currentValueRaw.tagRegistry);
    const nextTagRegistry = this.ensureRecord(nextValueRaw.tagRegistry);

    const currentStages = this.normalizeSalesTaxonomyValues(currentTaxonomy.stages);
    const nextStages = this.normalizeSalesTaxonomyValues(nextTaxonomy.stages);
    const removedStages = currentStages.filter((value) => !nextStages.includes(value));

    const currentSources = this.normalizeSalesTaxonomyValues(currentTaxonomy.sources);
    const nextSources = this.normalizeSalesTaxonomyValues(nextTaxonomy.sources);
    const removedSources = currentSources.filter((value) => !nextSources.includes(value));

    const currentCustomerTags = this.normalizeSalesTagRegistryValues(currentTagRegistry.customerTags);
    const nextCustomerTags = this.normalizeSalesTagRegistryValues(nextTagRegistry.customerTags);
    const removedCustomerTags = currentCustomerTags.filter((value) => !nextCustomerTags.includes(value));

    const currentInteractionTags = this.normalizeSalesTagRegistryValues(currentTagRegistry.interactionTags);
    const nextInteractionTags = this.normalizeSalesTagRegistryValues(nextTagRegistry.interactionTags);
    const removedInteractionTags = currentInteractionTags.filter((value) => !nextInteractionTags.includes(value));

    const currentInteractionResultTags = this.normalizeSalesTagRegistryValues(currentTagRegistry.interactionResultTags);
    const nextInteractionResultTags = this.normalizeSalesTagRegistryValues(nextTagRegistry.interactionResultTags);
    const removedInteractionResultTags = currentInteractionResultTags.filter((value) => !nextInteractionResultTags.includes(value));

    if (
      removedStages.length === 0
      && removedSources.length === 0
      && removedCustomerTags.length === 0
      && removedInteractionTags.length === 0
      && removedInteractionResultTags.length === 0
    ) {
      return;
    }

    const blockedMessages: string[] = [];

    if (removedStages.length > 0) {
      const stageUsageRows = await this.prisma.client.customer.groupBy({
        by: ['customerStage'],
        where: {
          customerStage: {
            in: removedStages
          }
        },
        _count: {
          _all: true
        }
      });

      const usedStages = stageUsageRows
        .map((row) => ({
          value: this.cleanString(row.customerStage),
          count: Number(row._count?._all ?? 0)
        }))
        .filter((row) => row.value && row.count > 0);

      if (usedStages.length > 0) {
        blockedMessages.push(`stages: ${usedStages.map((row) => `${row.value}(${row.count})`).join(', ')}`);
      }
    }

    if (removedSources.length > 0) {
      const sourceUsageRows = await this.prisma.client.customer.groupBy({
        by: ['source'],
        where: {
          source: {
            in: removedSources
          }
        },
        _count: {
          _all: true
        }
      });

      const usedSources = sourceUsageRows
        .map((row) => ({
          value: this.cleanString(row.source),
          count: Number(row._count?._all ?? 0)
        }))
        .filter((row) => row.value && row.count > 0);

      if (usedSources.length > 0) {
        blockedMessages.push(`sources: ${usedSources.map((row) => `${row.value}(${row.count})`).join(', ')}`);
      }
    }

    if (removedCustomerTags.length > 0) {
      const usedCustomerTags: Array<{ value: string; count: number }> = [];
      for (const tag of removedCustomerTags) {
        const usageCount = await this.prisma.client.customer.count({
          where: {
            tags: {
              has: tag
            }
          }
        });
        if (usageCount > 0) {
          usedCustomerTags.push({ value: tag, count: usageCount });
        }
      }
      if (usedCustomerTags.length > 0) {
        blockedMessages.push(`customerTags: ${usedCustomerTags.map((row) => `${row.value}(${row.count})`).join(', ')}`);
      }
    }

    if (removedInteractionTags.length > 0) {
      const usedInteractionTags: Array<{ value: string; count: number }> = [];
      for (const tag of removedInteractionTags) {
        const usageCount = await this.prisma.client.customer.count({
          where: {
            tags: {
              has: tag
            }
          }
        });
        if (usageCount > 0) {
          usedInteractionTags.push({ value: tag, count: usageCount });
        }
      }
      if (usedInteractionTags.length > 0) {
        blockedMessages.push(`interactionTags: ${usedInteractionTags.map((row) => `${row.value}(${row.count})`).join(', ')}`);
      }
    }

    if (removedInteractionResultTags.length > 0) {
      const usedResultTags: Array<{ value: string; interactionCount: number; customerTagCount: number }> = [];
      for (const tag of removedInteractionResultTags) {
        const [interactionCount, customerTagCount] = await Promise.all([
          this.prisma.client.customerInteraction.count({
            where: {
              resultTag: tag
            }
          }),
          this.prisma.client.customer.count({
            where: {
              tags: {
                has: tag
              }
            }
          })
        ]);

        if (interactionCount > 0 || customerTagCount > 0) {
          usedResultTags.push({
            value: tag,
            interactionCount,
            customerTagCount
          });
        }
      }
      if (usedResultTags.length > 0) {
        blockedMessages.push(
          `interactionResultTags: ${usedResultTags.map((row) => `${row.value}(interaction:${row.interactionCount}, customerTag:${row.customerTagCount})`).join(', ')}`
        );
      }
    }

    if (blockedMessages.length > 0) {
      throw new BadRequestException(
        `Không thể xóa taxonomy/tag đang được sử dụng (${blockedMessages.join(' | ')}).`
      );
    }
  }

  private normalizeEnabledModules(
    value: unknown,
    options: {
      includeAuditFallback?: boolean;
    } = {}
  ) {
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

    // Backward compatibility: keep newly introduced audit/assistant module visible for legacy org_profile rows.
    if (options.includeAuditFallback && RUNTIME_TOGGLABLE_MODULES.has(AUDIT_MODULE_KEY) && !normalized.includes(AUDIT_MODULE_KEY)) {
      normalized.push(AUDIT_MODULE_KEY);
    }
    if (options.includeAuditFallback && RUNTIME_TOGGLABLE_MODULES.has(ASSISTANT_MODULE_KEY) && !normalized.includes(ASSISTANT_MODULE_KEY)) {
      normalized.push(ASSISTANT_MODULE_KEY);
    }

    return normalized;
  }

  private normalizeIamV2EnforcementModules(value: unknown) {
    const requested = this.toStringArray(value).map((item) => item.toLowerCase());
    if (requested.some((item) => this.isIamV2AllModulesToken(item))) {
      return [] as string[];
    }
    return this.normalizeEnabledModules(requested, { includeAuditFallback: false });
  }

  private isIamV2AllModulesToken(value: string) {
    return IAM_V2_ALL_MODULE_TOKENS.has(String(value ?? '').trim().toLowerCase());
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
