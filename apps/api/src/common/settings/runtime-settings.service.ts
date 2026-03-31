import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_SETTINGS_DOMAINS,
  RUNTIME_TOGGLABLE_ERP_MODULES,
  SETTINGS_DOMAIN_SET,
  SETTINGS_SECRET_ALLOWLIST,
  type SettingsDomain
} from '../../modules/settings/settings-policy.types';

const RUNTIME_TOGGLABLE_MODULES = new Set<string>(RUNTIME_TOGGLABLE_ERP_MODULES);
const AUDIT_MODULE_KEY = 'audit';

type CacheEntry = {
  value: Record<string, unknown>;
  loadedAt: number;
  expiresAt: number;
};

type RuntimeDomainEnvelope = {
  domain: SettingsDomain;
  data: Record<string, unknown>;
  loadedAt: string;
  fromCache: boolean;
};

type IntegrationRuntime = {
  bhtot: {
    enabled: boolean;
    baseUrl: string;
    timeoutMs: number;
    apiKeyRef: string;
    apiKey: string;
  };
  ai: {
    enabled: boolean;
    baseUrl: string;
    model: string;
    timeoutMs: number;
    apiKeyRef: string;
    apiKey: string;
  };
  zalo: {
    enabled: boolean;
    outboundUrl: string;
    apiBaseUrl: string;
    outboundTimeoutMs: number;
    accessTokenRef: string;
    webhookSecretRef: string;
    accessToken: string;
    webhookSecret: string;
  };
};

@Injectable()
export class RuntimeSettingsService {
  private readonly logger = new Logger(RuntimeSettingsService.name);
  private readonly cache = new Map<SettingsDomain, CacheEntry>();
  private readonly inFlight = new Map<SettingsDomain, Promise<CacheEntry>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  invalidate(domain?: string) {
    if (!domain) {
      this.cache.clear();
      this.inFlight.clear();
      return;
    }

    const normalized = String(domain).trim() as SettingsDomain;
    if (SETTINGS_DOMAIN_SET.has(normalized)) {
      this.cache.delete(normalized);
      this.inFlight.delete(normalized);
    }
  }

  async getDomain(domain: SettingsDomain, options: { bypassCache?: boolean } = {}) {
    const entry = await this.getCacheEntry(domain, options.bypassCache === true);
    return this.deepClone(entry.value);
  }

  async getDomainEnvelope(domain: SettingsDomain, options: { bypassCache?: boolean } = {}): Promise<RuntimeDomainEnvelope> {
    const now = Date.now();
    const cached = this.cache.get(domain);
    const shouldUseCache = !options.bypassCache && Boolean(cached) && (cached?.expiresAt ?? 0) > now;
    const entry = shouldUseCache ? (cached as CacheEntry) : await this.getCacheEntry(domain, options.bypassCache === true);

    return {
      domain,
      data: this.deepClone(entry.value),
      loadedAt: new Date(entry.loadedAt).toISOString(),
      fromCache: shouldUseCache
    };
  }

  async isModuleEnabled(moduleKeyRaw: string) {
    const moduleKey = String(moduleKeyRaw ?? '').trim().toLowerCase();
    if (!moduleKey) {
      return true;
    }
    if (moduleKey === 'auth' || moduleKey === 'health' || moduleKey === 'settings') {
      return true;
    }

    const mappedModule = this.mapApiModuleKey(moduleKey);
    const org = await this.getDomain('org_profile');
    const enabledModules = this.normalizeEnabledModules(org.enabledModules);
    if (enabledModules.length === 0) {
      return true;
    }
    return enabledModules.includes(mappedModule);
  }

  async getWebRuntime() {
    const [org, locale] = await Promise.all([
      this.getDomain('org_profile'),
      this.getDomain('locale_calendar')
    ]);

    const enabledModules = this.normalizeEnabledModules(org.enabledModules);
    const branding = this.toRecord(org.branding);
    const documentLayout = this.toRecord(org.documentLayout);

    return {
      organization: {
        companyName: this.readString(org.companyName, 'Digital Retail ERP Co.'),
        taxCode: this.readString(org.taxCode),
        address: this.readString(org.address),
        branchName: this.readString(org.branchName),
        contactEmail: this.readString(org.contactEmail),
        contactPhone: this.readString(org.contactPhone)
      },
      branding: {
        logoUrl: this.readString(branding.logoUrl),
        primaryColor: this.readString(branding.primaryColor, '#3f8f50')
      },
      documentLayout: {
        invoiceTemplate: this.readString(documentLayout.invoiceTemplate, 'standard'),
        showCompanySeal: this.toBool(documentLayout.showCompanySeal, false)
      },
      locale: {
        timezone: this.readString(locale.timezone, 'Asia/Ho_Chi_Minh'),
        dateFormat: this.readString(locale.dateFormat, 'DD/MM/YYYY'),
        numberFormat: this.readString(locale.numberFormat, 'vi-VN'),
        currency: this.readString(locale.currency, 'VND'),
        firstDayOfWeek: this.readString(locale.firstDayOfWeek, 'monday'),
        fiscalYearStartMonth: this.toInt(locale.fiscalYearStartMonth, 1, 1, 12)
      },
      enabledModules,
      generatedAt: new Date().toISOString()
    };
  }

  async getAccessSecurityRuntime() {
    const domain = await this.getDomain('access_security');
    const passwordPolicy = this.toRecord(domain.passwordPolicy);
    const loginPolicy = this.toRecord(domain.loginPolicy);
    const permissionPolicy = this.toRecord(domain.permissionPolicy);
    const settingsEditorPolicy = this.toRecord(domain.settingsEditorPolicy);

    return {
      sessionTimeoutMinutes: this.toInt(domain.sessionTimeoutMinutes, 480, 5, 1440),
      passwordPolicy: {
        minLength: this.toInt(passwordPolicy.minLength, 8, 6, 64),
        requireUppercase: this.toBool(passwordPolicy.requireUppercase, true),
        requireNumber: this.toBool(passwordPolicy.requireNumber, true),
        requireSpecial: this.toBool(passwordPolicy.requireSpecial, false),
        rotateDays: this.toInt(passwordPolicy.rotateDays, 90, 0, 3650)
      },
      loginPolicy: {
        maxFailedAttempts: this.toInt(loginPolicy.maxFailedAttempts, 5, 1, 20),
        lockoutMinutes: this.toInt(loginPolicy.lockoutMinutes, 15, 1, 240),
        mfaRequired: this.toBool(loginPolicy.mfaRequired, false)
      },
      permissionPolicy: {
        enabled: this.toBool(permissionPolicy.enabled, false),
        conflictPolicy: this.readString(permissionPolicy.conflictPolicy, 'DENY_OVERRIDES').toUpperCase(),
        superAdminIds: this.toStringArray(permissionPolicy.superAdminIds),
        superAdminEmails: this.toStringArray(permissionPolicy.superAdminEmails).map((item) => item.toLowerCase())
      },
      settingsEditorPolicy
    };
  }

  async getApprovalMatrixRuntime() {
    const domain = await this.getDomain('approval_matrix');
    const escalation = this.toRecord(domain.escalation);
    const delegation = this.toRecord(domain.delegation);
    const rulesRaw = Array.isArray(domain.rules) ? domain.rules : [];

    const rules = rulesRaw
      .map((item) => this.toRecord(item))
      .filter((rule) => this.readString(rule.module))
      .map((rule) => ({
        module: this.readString(rule.module).toLowerCase(),
        minAmount: this.toNumber(rule.minAmount, 0),
        approverRole: this.readString(rule.approverRole, 'MANAGER').toUpperCase(),
        approverDepartment: this.readString(rule.approverDepartment)
      }))
      .sort((left, right) => left.minAmount - right.minAmount);

    return {
      rules,
      escalation: {
        enabled: this.toBool(escalation.enabled, true),
        slaHours: this.toInt(escalation.slaHours, 24, 1, 24 * 30),
        escalateToRole: this.readString(escalation.escalateToRole, 'ADMIN').toUpperCase()
      },
      delegation: {
        enabled: this.toBool(delegation.enabled, true),
        maxDays: this.toInt(delegation.maxDays, 14, 1, 90)
      }
    };
  }

  async getFinanceControlsRuntime() {
    const domain = await this.getDomain('finance_controls');
    const postingPeriods = this.toRecord(domain.postingPeriods);
    const documentNumbering = this.toRecord(domain.documentNumbering);
    return {
      postingPeriods: {
        lockedPeriods: this.toStringArray(postingPeriods.lockedPeriods),
        allowBackdateDays: this.toInt(postingPeriods.allowBackdateDays, 0, 0, 3650)
      },
      documentNumbering: {
        invoicePrefix: this.readString(documentNumbering.invoicePrefix, 'INV'),
        orderPrefix: this.readString(documentNumbering.orderPrefix, 'SO'),
        autoNumber: this.toBool(documentNumbering.autoNumber, true)
      },
      transactionCutoffHour: this.toInt(domain.transactionCutoffHour, 23, 0, 23)
    };
  }

  async getSalesCrmPolicyRuntime() {
    const domain = await this.getDomain('sales_crm_policies');
    const orderSettings = this.toRecord(domain.orderSettings);
    const discountPolicy = this.toRecord(domain.discountPolicy);
    const creditPolicy = this.toRecord(domain.creditPolicy);
    const customerTaxonomy = this.toRecord(domain.customerTaxonomy);

    return {
      orderSettings: {
        allowIncreaseWithoutApproval: this.toBool(orderSettings.allowIncreaseWithoutApproval, true),
        requireApprovalForDecrease: this.toBool(orderSettings.requireApprovalForDecrease, true),
        approverId: this.readString(orderSettings.approverId)
      },
      discountPolicy: {
        maxDiscountPercent: this.toNumber(discountPolicy.maxDiscountPercent, 15),
        requireApprovalAbovePercent: this.toNumber(discountPolicy.requireApprovalAbovePercent, 10)
      },
      creditPolicy: {
        allowNegativeBalance: this.toBool(creditPolicy.allowNegativeBalance, false),
        maxCreditLimit: this.toNumber(creditPolicy.maxCreditLimit, 0)
      },
      customerTaxonomy: {
        stages: this.toStringArray(customerTaxonomy.stages).map((item) => item.toUpperCase()),
        sources: this.toStringArray(customerTaxonomy.sources).map((item) => item.toUpperCase())
      }
    };
  }

  async getCatalogScmPolicyRuntime() {
    const domain = await this.getDomain('catalog_scm_policies');
    const replenishment = this.toRecord(domain.replenishment);
    const receiving = this.toRecord(domain.receiving);
    return {
      uomDefault: this.readString(domain.uomDefault, 'PCS'),
      priceListDefault: this.readString(domain.priceListDefault, 'STANDARD'),
      warehouseDefault: this.readString(domain.warehouseDefault, 'MAIN'),
      replenishment: {
        enabled: this.toBool(replenishment.enabled, true),
        minStockThreshold: this.toInt(replenishment.minStockThreshold, 10, 0, 1_000_000)
      },
      receiving: {
        allowOverReceivePercent: this.toNumber(receiving.allowOverReceivePercent, 5)
      }
    };
  }

  async getHrPolicyRuntime() {
    const domain = await this.getDomain('hr_policies');
    const leave = this.toRecord(domain.leave);
    const payroll = this.toRecord(domain.payroll);
    const approverChain = this.toRecord(domain.approverChain);
    return {
      shiftDefault: this.readString(domain.shiftDefault, 'HC'),
      leave: {
        annualDefaultDays: this.toNumber(leave.annualDefaultDays, 12),
        maxCarryOverDays: this.toNumber(leave.maxCarryOverDays, 5)
      },
      payroll: {
        cycle: this.readString(payroll.cycle, 'monthly'),
        cutoffDay: this.toInt(payroll.cutoffDay, 25, 1, 31)
      },
      approverChain: {
        leaveApproverRole: this.readString(approverChain.leaveApproverRole, 'MANAGER').toUpperCase(),
        payrollApproverRole: this.readString(approverChain.payrollApproverRole, 'ADMIN').toUpperCase()
      }
    };
  }

  async getIntegrationRuntime(): Promise<IntegrationRuntime> {
    const domain = await this.getDomain('integrations');
    const bhtot = this.toRecord(domain.bhtot);
    const ai = this.toRecord(domain.ai);
    const zalo = this.toRecord(domain.zalo);

    const bhtotRef = this.readString(bhtot.apiKeyRef);
    const aiRef = this.readString(ai.apiKeyRef);
    const zaloRef = this.readString(zalo.accessTokenRef);
    const zaloWebhookRef = this.readString(zalo.webhookSecretRef);

    const fallbackAiApiKey = this.readString(this.config.get<string>('AI_OPENAI_COMPAT_API_KEY'));
    const fallbackZaloToken = this.readString(this.config.get<string>('ZALO_OA_ACCESS_TOKEN'));
    const fallbackZaloWebhookSecret = this.readString(this.config.get<string>('ZALO_OA_WEBHOOK_SECRET'));

    return {
      bhtot: {
        enabled: this.toBool(bhtot.enabled, false),
        baseUrl: this.readString(bhtot.baseUrl, this.readString(this.config.get<string>('BHTOT_BASE_URL'))),
        timeoutMs: this.toInt(bhtot.timeoutMs, 12_000, 1_000, 120_000),
        apiKeyRef: bhtotRef,
        apiKey: this.resolveSecretByRef(bhtotRef)
      },
      ai: {
        enabled: this.toBool(ai.enabled, false),
        baseUrl: this.readString(ai.baseUrl, this.readString(this.config.get<string>('AI_OPENAI_COMPAT_BASE_URL'))),
        model: this.readString(ai.model, this.readString(this.config.get<string>('AI_OPENAI_COMPAT_MODEL'), 'gpt-4o-mini')),
        timeoutMs: this.toInt(ai.timeoutMs, 45_000, 1_000, 300_000),
        apiKeyRef: aiRef,
        apiKey: this.resolveSecretByRef(aiRef) || fallbackAiApiKey
      },
      zalo: {
        enabled: this.toBool(zalo.enabled, false),
        outboundUrl: this.readString(zalo.outboundUrl, this.readString(this.config.get<string>('ZALO_OA_OUTBOUND_URL'))),
        apiBaseUrl: this.readString(zalo.apiBaseUrl, this.readString(this.config.get<string>('ZALO_OA_API_BASE_URL'), 'https://openapi.zalo.me/v3.0/oa')),
        outboundTimeoutMs: this.toInt(
          zalo.outboundTimeoutMs,
          this.toInt(this.config.get<string>('ZALO_OA_OUTBOUND_TIMEOUT_MS'), 20_000, 2_000, 180_000),
          2_000,
          180_000
        ),
        accessTokenRef: zaloRef,
        webhookSecretRef: zaloWebhookRef,
        accessToken: this.resolveSecretByRef(zaloRef) || fallbackZaloToken,
        webhookSecret: this.resolveSecretByRef(zaloWebhookRef)
          || this.readString(zalo.webhookSecret)
          || fallbackZaloWebhookSecret
      }
    };
  }

  async getNotificationsTemplateRuntime() {
    const domain = await this.getDomain('notifications_templates');
    const channelPolicy = this.toRecord(domain.channelPolicy);
    const retry = this.toRecord(domain.retry);
    return {
      templatesVersion: this.readString(domain.templatesVersion, 'v1'),
      channelPolicy: {
        email: this.toBool(channelPolicy.email, true),
        sms: this.toBool(channelPolicy.sms, false),
        zalo: this.toBool(channelPolicy.zalo, true),
        inApp: this.toBool(channelPolicy.inApp, true)
      },
      retry: {
        maxAttempts: this.toInt(retry.maxAttempts, 3, 1, 20),
        backoffSeconds: this.toInt(retry.backoffSeconds, 30, 1, 3600)
      }
    };
  }

  async getSearchPerformanceRuntime() {
    const domain = await this.getDomain('search_performance');
    const reindexPolicy = this.toRecord(domain.reindexPolicy);

    const settingEngine = this.readString(domain.engine).toLowerCase();
    const envEngine = this.readString(this.config.get<string>('SEARCH_ENGINE'), 'sql').toLowerCase();
    const engine = settingEngine || envEngine;
    const settingWriteSync = domain.writeSyncEnabled;
    const envWriteSync = this.config.get<string>('MEILI_ENABLE_WRITE_SYNC');
    const writeSyncEnabled = settingWriteSync === undefined
      ? this.toBool(envWriteSync, false)
      : this.toBool(settingWriteSync, false);
    const indexPrefix = this.readString(domain.indexPrefix, this.readString(this.config.get<string>('MEILI_INDEX_PREFIX'), 'erp')).toLowerCase();

    return {
      engine: engine === 'meili_hybrid' ? 'meili_hybrid' : 'sql',
      timeoutMs: this.toInt(domain.timeoutMs, this.toInt(this.config.get<string>('MEILI_TIMEOUT_MS'), 45_000, 1_000, 300_000), 1_000, 300_000),
      indexPrefix,
      writeSyncEnabled,
      reindexPolicy: {
        autoAfterDeploy: this.toBool(reindexPolicy.autoAfterDeploy, false),
        allowEntity: this.toStringArray(reindexPolicy.allowEntity).map((item) => item.toLowerCase())
      }
    };
  }

  async getDataGovernanceRuntime() {
    const domain = await this.getDomain('data_governance_backup');
    const exportPolicy = this.toRecord(domain.exportPolicy);
    return {
      retentionDays: this.toInt(domain.retentionDays, 365 * 7, 1, 3650),
      auditRetentionYears: this.toInt(domain.auditRetentionYears, 7, 1, 20),
      auditHotRetentionMonths: this.toInt(domain.auditHotRetentionMonths, 12, 1, 120),
      archiveAfterDays: this.toInt(domain.archiveAfterDays, 180, 1, 3650),
      backupCadence: this.readString(domain.backupCadence, 'daily').toLowerCase(),
      lastBackupAt: this.readString(domain.lastBackupAt) || null,
      exportPolicy: {
        allowPiiExport: this.toBool(exportPolicy.allowPiiExport, false),
        requireAdminApproval: this.toBool(exportPolicy.requireAdminApproval, true)
      }
    };
  }

  private async getCacheEntry(domain: SettingsDomain, bypassCache: boolean) {
    const now = Date.now();
    const cached = this.cache.get(domain);
    if (!bypassCache && cached && cached.expiresAt > now) {
      return cached;
    }

    const currentInFlight = this.inFlight.get(domain);
    if (currentInFlight) {
      return currentInFlight;
    }

    const next = this.loadDomain(domain)
      .then((value) => {
        this.cache.set(domain, value);
        this.inFlight.delete(domain);
        return value;
      })
      .catch((error) => {
        this.inFlight.delete(domain);
        this.logger.warn(`Failed to load runtime settings domain=${domain}: ${error instanceof Error ? error.message : String(error)}`);
        const fallback = this.createCacheEntry(DEFAULT_SETTINGS_DOMAINS[domain]);
        this.cache.set(domain, fallback);
        return fallback;
      });

    this.inFlight.set(domain, next);
    return next;
  }

  private async loadDomain(domain: SettingsDomain): Promise<CacheEntry> {
    const row = await this.prisma.client.setting.findFirst({
      where: {
        settingKey: `settings.${domain}.v1`
      }
    });

    const defaults = this.toRecord(DEFAULT_SETTINGS_DOMAINS[domain]);
    const fromDb = this.toRecord(row?.settingValue);
    const merged = this.mergeRecords(defaults, fromDb);
    return this.createCacheEntry(merged);
  }

  private createCacheEntry(data: Record<string, unknown>): CacheEntry {
    const now = Date.now();
    return {
      value: data,
      loadedAt: now,
      expiresAt: now + this.getCacheTtlMs()
    };
  }

  private getCacheTtlMs() {
    return this.toInt(this.config.get<string>('SETTINGS_RUNTIME_CACHE_TTL_MS'), 20_000, 1_000, 300_000);
  }

  private mapApiModuleKey(moduleKey: string) {
    const normalized = moduleKey.toLowerCase();
    if (normalized === 'conversations' || normalized === 'zalo' || normalized === 'conversation-quality') {
      return 'crm';
    }
    return normalized;
  }

  private resolveSecretByRef(refRaw: string) {
    const ref = this.readString(refRaw);
    if (!ref) {
      return '';
    }
    if (!(SETTINGS_SECRET_ALLOWLIST as readonly string[]).includes(ref)) {
      return '';
    }
    return this.readString(this.config.get<string>(ref));
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private mergeRecords(base: unknown, patch: unknown): Record<string, unknown> {
    const left = this.toRecord(base);
    const right = this.toRecord(patch);
    const output: Record<string, unknown> = { ...left };

    for (const key of Object.keys(right)) {
      const leftValue = left[key];
      const rightValue = right[key];
      if (this.isPlainObject(leftValue) && this.isPlainObject(rightValue)) {
        output[key] = this.mergeRecords(leftValue, rightValue);
      } else {
        output[key] = rightValue;
      }
    }

    return output;
  }

  private deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private isPlainObject(value: unknown) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private readString(value: unknown, fallback = '') {
    if (value === null || value === undefined) {
      return fallback;
    }
    const normalized = String(value).trim();
    return normalized || fallback;
  }

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
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
    // Backward compatibility: org_profile.enabledModules created before audit module rollout.
    if (RUNTIME_TOGGLABLE_MODULES.has(AUDIT_MODULE_KEY) && !normalized.includes(AUDIT_MODULE_KEY)) {
      normalized.push(AUDIT_MODULE_KEY);
    }
    return normalized;
  }

  private toBool(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return fallback;
  }

  private toInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }

  private toNumber(value: unknown, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return parsed;
  }
}
