import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptSettingsSecret, SettingsSecretCryptoError } from './settings-secret-crypto.util';
import {
  DEFAULT_SETTINGS_DOMAINS,
  RUNTIME_TOGGLABLE_ERP_MODULES,
  SETTINGS_DOMAIN_SET,
  SETTINGS_SECRET_ALLOWLIST,
  type SettingsDomain
} from '../../modules/settings/settings-policy.types';

const RUNTIME_TOGGLABLE_MODULES = new Set<string>(RUNTIME_TOGGLABLE_ERP_MODULES);
const AUDIT_MODULE_KEY = 'audit';
const ASSISTANT_MODULE_KEY = 'assistant';
const HR_APPENDIX_FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;
const HR_APPENDIX_AGGREGATORS = ['none', 'count', 'sum', 'avg', 'min', 'max'] as const;
const HR_APPENDIX_FIELD_STATUS = ['ACTIVE', 'DRAFT', 'INACTIVE', 'ARCHIVED'] as const;
const IAM_V2_ALL_MODULE_TOKENS = new Set(['*', 'all']);

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

type HrAppendixCatalogItemRuntime = {
  code: string;
  name: string;
  description: string;
  fields: HrAppendixTemplateFieldRuntime[];
};

type HrAppendixFieldCatalogItemRuntime = {
  id: string;
  key: string;
  label: string;
  description: string;
  type: (typeof HR_APPENDIX_FIELD_TYPES)[number];
  options: string[];
  validation: Record<string, unknown>;
  analyticsEnabled: boolean;
  aggregator: (typeof HR_APPENDIX_AGGREGATORS)[number];
  status: (typeof HR_APPENDIX_FIELD_STATUS)[number];
  version: number;
};

type HrAppendixTemplateFieldRuntime = HrAppendixFieldCatalogItemRuntime & {
  required: boolean;
  placeholder: string;
  defaultValue: unknown;
  helpText: string;
  visibility: 'visible' | 'hidden';
  kpiAlias: string;
  source: 'global' | 'appendix-local';
};

type HrAppendixTemplateRuntime = {
  code: string;
  name: string;
  description: string;
  fields: Array<Record<string, unknown>>;
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
    if (moduleKey === 'auth' || moduleKey === 'health' || moduleKey === 'settings' || moduleKey === 'custom-fields') {
      return true;
    }

    const mappedModule = this.mapApiModuleKey(moduleKey);
    const org = await this.getDomain('org_profile');
    const enabledModules = this.normalizeEnabledModules(org.enabledModules, { includeAuditFallback: true });
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

    const enabledModules = this.normalizeEnabledModules(org.enabledModules, { includeAuditFallback: true });
    const branding = this.toRecord(org.branding);
    const documentLayout = this.toRecord(org.documentLayout);

    return {
      organization: {
        companyName: this.readString(org.companyName, 'GOIUUDAI'),
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
    const iamV2 = this.toRecord(domain.iamV2);
    const auditViewPolicy = this.toRecord(domain.auditViewPolicy);
    const auditGroups = this.toRecord(auditViewPolicy.groups);
    const directorGroup = this.toRecord(auditGroups.DIRECTOR);
    const branchManagerGroup = this.toRecord(auditGroups.BRANCH_MANAGER);
    const departmentManagerGroup = this.toRecord(auditGroups.DEPARTMENT_MANAGER);
    const assistantAccessPolicy = this.toRecord(domain.assistantAccessPolicy);
    const roleScopeDefaults = this.toRecord(assistantAccessPolicy.roleScopeDefaults);
    const settingsEditorPolicy = this.toRecord(domain.settingsEditorPolicy);

    const normalizeAssistantScope = (value: unknown, fallback: 'company' | 'branch' | 'department' | 'self') => {
      const normalized = this.readString(value, fallback).toLowerCase();
      if (normalized === 'company' || normalized === 'branch' || normalized === 'department' || normalized === 'self') {
        return normalized;
      }
      return fallback;
    };

    const normalizeIamV2Mode = (value: unknown): 'OFF' | 'SHADOW' | 'ENFORCE' => {
      const mode = this.readString(value, 'SHADOW').toUpperCase();
      if (mode === 'OFF' || mode === 'SHADOW' || mode === 'ENFORCE') {
        return mode;
      }
      return 'SHADOW';
    };

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
      iamV2: {
        enabled: this.toBool(iamV2.enabled, false),
        mode: normalizeIamV2Mode(iamV2.mode),
        enforcementModules: this.normalizeEnabledModules(iamV2.enforcementModules, {
          includeAuditFallback: false,
          allowAllToken: true
        }),
        protectAdminCore: this.toBool(iamV2.protectAdminCore, true),
        denySelfElevation: this.toBool(iamV2.denySelfElevation, true)
      },
      auditViewPolicy: {
        enabled: this.toBool(auditViewPolicy.enabled, true),
        groups: {
          DIRECTOR: {
            enabled: this.toBool(directorGroup.enabled, true)
          },
          BRANCH_MANAGER: {
            enabled: this.toBool(branchManagerGroup.enabled, true)
          },
          DEPARTMENT_MANAGER: {
            enabled: this.toBool(departmentManagerGroup.enabled, true)
          }
        },
        denyIfUngroupedManager: this.toBool(auditViewPolicy.denyIfUngroupedManager, true)
      },
      assistantAccessPolicy: {
        enabled: this.toBool(assistantAccessPolicy.enabled, false),
        roleScopeDefaults: {
          ADMIN: normalizeAssistantScope(roleScopeDefaults.ADMIN, 'company'),
          MANAGER: normalizeAssistantScope(roleScopeDefaults.MANAGER, 'department'),
          STAFF: normalizeAssistantScope(roleScopeDefaults.STAFF, 'self')
        },
        enforcePermissionEngine: this.toBool(assistantAccessPolicy.enforcePermissionEngine, true),
        denyIfNoScope: this.toBool(assistantAccessPolicy.denyIfNoScope, true),
        allowedModules: this.toStringArray(assistantAccessPolicy.allowedModules).map((item) => item.toLowerCase()),
        chatChannelScopeEnforced: this.toBool(assistantAccessPolicy.chatChannelScopeEnforced, true)
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
    const tagRegistry = this.toRecord(domain.tagRegistry);
    const renewalReminder = this.toRecord(domain.renewalReminder);
    const productLeadDays = this.toRecord(renewalReminder.productLeadDays);
    const readOptionalLeadDays = (value: unknown) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
        return null;
      }
      return parsed;
    };

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
        stages: this.toStringArray(customerTaxonomy.stages),
        sources: this.toStringArray(customerTaxonomy.sources)
      },
      tagRegistry: {
        customerTags: this.toStringArray(tagRegistry.customerTags).map((item) => item.toLowerCase()),
        interactionTags: this.toStringArray(tagRegistry.interactionTags).map((item) => item.toLowerCase()),
        interactionResultTags: this.toStringArray(tagRegistry.interactionResultTags).map((item) => item.toLowerCase())
      },
      renewalReminder: {
        globalLeadDays: this.toInt(renewalReminder.globalLeadDays, 30, 1, 365),
        productLeadDays: {
          TELECOM_PACKAGE: readOptionalLeadDays(productLeadDays.TELECOM_PACKAGE),
          AUTO_INSURANCE: readOptionalLeadDays(productLeadDays.AUTO_INSURANCE),
          MOTO_INSURANCE: readOptionalLeadDays(productLeadDays.MOTO_INSURANCE),
          DIGITAL_SERVICE: readOptionalLeadDays(productLeadDays.DIGITAL_SERVICE)
        }
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
    const appendixFieldCatalog = this.normalizeHrAppendixFieldCatalog(domain.appendixFieldCatalog);
    const appendixTemplates = this.normalizeHrAppendixTemplates(
      domain.appendixTemplates ?? domain.appendixCatalog,
      appendixFieldCatalog
    );
    const appendixCatalog = this.resolveHrAppendixCatalog(appendixTemplates, appendixFieldCatalog);
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
      },
      appendixFieldCatalog,
      appendixTemplates,
      appendixCatalog
    };
  }

  async getIntegrationRuntime(): Promise<IntegrationRuntime> {
    const domain = await this.getDomain('integrations');
    const bhtot = this.toRecord(domain.bhtot);
    const ai = this.toRecord(domain.ai);
    const zalo = this.toRecord(domain.zalo);

    const bhtotApiKey = this.readIntegrationSecret(bhtot.apiKey, 'integrations.bhtot.apiKey');
    const aiApiKey = this.readIntegrationSecret(ai.apiKey, 'integrations.ai.apiKey');
    const zaloAccessToken = this.readIntegrationSecret(zalo.accessToken, 'integrations.zalo.accessToken');
    const zaloWebhookSecret = this.readIntegrationSecret(zalo.webhookSecret, 'integrations.zalo.webhookSecret');

    const bhtotRef = this.readString(bhtot.apiKeyRef);
    const aiRef = this.readString(ai.apiKeyRef);
    const zaloRef = this.readString(zalo.accessTokenRef);
    const zaloWebhookRef = this.readString(zalo.webhookSecretRef);

    const fallbackBhtotApiKey = this.readString(this.config.get<string>('BHTOT_API_KEY'));
    const fallbackAiApiKey = this.readString(this.config.get<string>('AI_OPENAI_COMPAT_API_KEY'));
    const fallbackZaloToken = this.readString(this.config.get<string>('ZALO_OA_ACCESS_TOKEN'));
    const fallbackZaloWebhookSecret = this.readString(this.config.get<string>('ZALO_OA_WEBHOOK_SECRET'));

    return {
      bhtot: {
        enabled: this.toBool(bhtot.enabled, false),
        baseUrl: this.readString(bhtot.baseUrl, this.readString(this.config.get<string>('BHTOT_BASE_URL'))),
        timeoutMs: this.toInt(bhtot.timeoutMs, 12_000, 1_000, 120_000),
        apiKeyRef: bhtotRef,
        apiKey: bhtotApiKey || this.resolveSecretByRef(bhtotRef) || fallbackBhtotApiKey
      },
      ai: {
        enabled: this.toBool(ai.enabled, false),
        baseUrl: this.readString(ai.baseUrl, this.readString(this.config.get<string>('AI_OPENAI_COMPAT_BASE_URL'))),
        model: this.readString(ai.model, this.readString(this.config.get<string>('AI_OPENAI_COMPAT_MODEL'), 'gpt-4o-mini')),
        timeoutMs: this.toInt(ai.timeoutMs, 45_000, 1_000, 300_000),
        apiKeyRef: aiRef,
        apiKey: aiApiKey || this.resolveSecretByRef(aiRef) || fallbackAiApiKey
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
        accessToken: zaloAccessToken || this.resolveSecretByRef(zaloRef) || fallbackZaloToken,
        webhookSecret: zaloWebhookSecret || this.resolveSecretByRef(zaloWebhookRef) || fallbackZaloWebhookSecret
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
    if (normalized === 'custom-fields') {
      return 'settings';
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

  private readIntegrationSecret(value: unknown, fieldPath: string) {
    const raw = this.readString(value);
    if (!raw) {
      return '';
    }

    try {
      return this.readString(decryptSettingsSecret(raw));
    } catch (error) {
      const reason = error instanceof SettingsSecretCryptoError
        ? error.message
        : 'unknown decryption failure';
      this.logger.warn(`Cannot decrypt ${fieldPath}: ${reason}`);
      return '';
    }
  }

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }

  private normalizeEnabledModules(
    value: unknown,
    options: {
      includeAuditFallback?: boolean;
      allowAllToken?: boolean;
    } = {}
  ) {
    const includeAuditFallback = options.includeAuditFallback === true;
    const allowAllToken = options.allowAllToken === true;
    const requested = this.toStringArray(value).map((item) => item.toLowerCase());
    if (allowAllToken && requested.some((item) => IAM_V2_ALL_MODULE_TOKENS.has(item))) {
      return [] as string[];
    }
    const normalized: string[] = [];
    for (const lowered of requested) {
      if (!RUNTIME_TOGGLABLE_MODULES.has(lowered)) {
        continue;
      }
      if (!normalized.includes(lowered)) {
        normalized.push(lowered);
      }
    }
    if (includeAuditFallback && RUNTIME_TOGGLABLE_MODULES.has(AUDIT_MODULE_KEY) && !normalized.includes(AUDIT_MODULE_KEY)) {
      normalized.push(AUDIT_MODULE_KEY);
    }
    if (includeAuditFallback && RUNTIME_TOGGLABLE_MODULES.has(ASSISTANT_MODULE_KEY) && !normalized.includes(ASSISTANT_MODULE_KEY)) {
      normalized.push(ASSISTANT_MODULE_KEY);
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

  private normalizeHrAppendixFieldType(value: unknown, fallback: (typeof HR_APPENDIX_FIELD_TYPES)[number] = 'text') {
    const normalized = this.readString(value).toLowerCase();
    return (HR_APPENDIX_FIELD_TYPES as readonly string[]).includes(normalized)
      ? (normalized as (typeof HR_APPENDIX_FIELD_TYPES)[number])
      : fallback;
  }

  private normalizeHrAppendixAggregator(value: unknown, fallback: (typeof HR_APPENDIX_AGGREGATORS)[number] = 'none') {
    const normalized = this.readString(value).toLowerCase();
    return (HR_APPENDIX_AGGREGATORS as readonly string[]).includes(normalized)
      ? (normalized as (typeof HR_APPENDIX_AGGREGATORS)[number])
      : fallback;
  }

  private normalizeHrAppendixStatus(value: unknown, fallback: (typeof HR_APPENDIX_FIELD_STATUS)[number] = 'ACTIVE') {
    const normalized = this.readString(value).toUpperCase();
    return (HR_APPENDIX_FIELD_STATUS as readonly string[]).includes(normalized)
      ? (normalized as (typeof HR_APPENDIX_FIELD_STATUS)[number])
      : fallback;
  }

  private normalizeAppendixFieldKey(value: unknown, fallback = '') {
    const normalized = this.readString(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    if (normalized) {
      return normalized;
    }
    return this.readString(fallback)
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  private normalizeHrAppendixFieldCatalog(raw: unknown): HrAppendixFieldCatalogItemRuntime[] {
    const defaultsDomain = this.toRecord(DEFAULT_SETTINGS_DOMAINS.hr_policies);
    const defaultCatalogRaw = this.toRecord(defaultsDomain.appendixFieldCatalog);
    const inputCatalog = this.toRecord(raw);
    const keys = Array.from(new Set([...Object.keys(defaultCatalogRaw), ...Object.keys(inputCatalog)]))
      .map((item) => this.normalizeAppendixFieldKey(item))
      .filter(Boolean);

    const catalog: HrAppendixFieldCatalogItemRuntime[] = [];
    for (const key of keys) {
      const defaultItem = this.toRecord(defaultCatalogRaw[key]);
      const inputItem = this.toRecord(inputCatalog[key]);
      const mergedItem = this.toRecord(this.mergeRecords(defaultItem, inputItem));
      const analyticsEnabled = this.toBool(mergedItem.analyticsEnabled, this.toBool(defaultItem.analyticsEnabled, false));
      catalog.push({
        id: this.readString(mergedItem.id, key),
        key: this.normalizeAppendixFieldKey(mergedItem.key, key),
        label: this.readString(mergedItem.label, key),
        description: this.readString(mergedItem.description),
        type: this.normalizeHrAppendixFieldType(mergedItem.type, this.normalizeHrAppendixFieldType(defaultItem.type, 'text')),
        options: this.toStringArray(mergedItem.options),
        validation: this.toRecord(mergedItem.validation),
        analyticsEnabled,
        aggregator: analyticsEnabled
          ? this.normalizeHrAppendixAggregator(mergedItem.aggregator, this.normalizeHrAppendixAggregator(defaultItem.aggregator, 'count'))
          : 'none',
        status: this.normalizeHrAppendixStatus(mergedItem.status, this.normalizeHrAppendixStatus(defaultItem.status, 'ACTIVE')),
        version: this.toInt(mergedItem.version, this.toInt(defaultItem.version, 1, 1, 1000), 1, 1000)
      });
    }

    return catalog.sort((left, right) => left.key.localeCompare(right.key));
  }

  private resolveAppendixFieldKeyFromCatalog(raw: unknown, fieldCatalogMap: Map<string, HrAppendixFieldCatalogItemRuntime>) {
    const candidate = this.readString(raw);
    if (!candidate) {
      return '';
    }
    const direct = fieldCatalogMap.get(candidate) ?? fieldCatalogMap.get(candidate.toLowerCase());
    if (direct) {
      return direct.key;
    }

    const slug = this.normalizeAppendixFieldKey(candidate);
    for (const field of fieldCatalogMap.values()) {
      const byId = this.normalizeAppendixFieldKey(field.id);
      const byLabel = this.normalizeAppendixFieldKey(field.label);
      if (field.key === candidate || field.key === slug || byId === slug || byLabel === slug) {
        return field.key;
      }
    }
    return '';
  }

  private normalizeHrAppendixTemplates(raw: unknown, fieldCatalog: HrAppendixFieldCatalogItemRuntime[]): HrAppendixTemplateRuntime[] {
    const defaultsDomain = this.toRecord(DEFAULT_SETTINGS_DOMAINS.hr_policies);
    const defaultTemplatesRaw = this.toRecord(defaultsDomain.appendixTemplates);
    const legacyTemplatesRaw = this.toRecord(defaultsDomain.appendixCatalog);
    const inputTemplates = this.toRecord(raw);
    const templateSource = Object.keys(inputTemplates).length > 0 ? inputTemplates : legacyTemplatesRaw;
    const codes = Array.from(new Set([...Object.keys(defaultTemplatesRaw), ...Object.keys(templateSource)]))
      .map((item) => item.trim().toUpperCase())
      .filter((item) => /^PL\d{2}$/.test(item));

    const fieldCatalogMap = new Map<string, HrAppendixFieldCatalogItemRuntime>(
      fieldCatalog.map((field) => [field.key, field])
    );

    const templates: HrAppendixTemplateRuntime[] = [];
    for (const code of codes) {
      const defaultItem = this.toRecord(defaultTemplatesRaw[code]);
      const fallbackItem = this.toRecord(legacyTemplatesRaw[code]);
      const inputItem = this.toRecord(templateSource[code]);
      const mergedItem = this.toRecord(this.mergeRecords(this.mergeRecords(fallbackItem, defaultItem), inputItem));
      const rawFields = Array.isArray(mergedItem.fields) ? mergedItem.fields : [];
      const fields: Array<Record<string, unknown>> = [];
      const seen = new Set<string>();

      for (const row of rawFields) {
        const rowRecord = this.toRecord(row);
        let fieldKey = '';
        if (typeof row === 'string') {
          fieldKey = this.resolveAppendixFieldKeyFromCatalog(row, fieldCatalogMap) || this.normalizeAppendixFieldKey(row);
        } else {
          fieldKey = this.resolveAppendixFieldKeyFromCatalog(
            rowRecord.fieldKey ?? rowRecord.key ?? rowRecord.fieldId,
            fieldCatalogMap
          );
          if (!fieldKey) {
            fieldKey = this.normalizeAppendixFieldKey(rowRecord.fieldKey ?? rowRecord.key ?? rowRecord.fieldId);
          }
        }

        if (!fieldKey || seen.has(fieldKey)) {
          continue;
        }
        seen.add(fieldKey);
        fields.push({
          fieldKey,
          required: this.toBool(rowRecord.required, false),
          placeholder: this.readString(rowRecord.placeholder),
          defaultValue: rowRecord.defaultValue ?? null,
          helpText: this.readString(rowRecord.helpText),
          visibility: this.readString(rowRecord.visibility).toLowerCase() === 'hidden' ? 'hidden' : 'visible',
          kpiAlias: this.readString(rowRecord.kpiAlias)
        });
      }

      templates.push({
        code,
        name: this.readString(mergedItem.name, code),
        description: this.readString(mergedItem.description),
        fields
      });
    }

    return templates.sort((left, right) => left.code.localeCompare(right.code));
  }

  private resolveHrAppendixCatalog(
    templates: HrAppendixTemplateRuntime[],
    fieldCatalog: HrAppendixFieldCatalogItemRuntime[]
  ): HrAppendixCatalogItemRuntime[] {
    const catalogMap = new Map(fieldCatalog.map((field) => [field.key, field]));

    return templates.map((template) => {
      const fields: HrAppendixTemplateFieldRuntime[] = template.fields.map((rawField) => {
        const fieldRef = this.toRecord(rawField);
        const fieldKey = this.readString(fieldRef.fieldKey);
        const globalField = catalogMap.get(fieldKey);
        if (!globalField) {
          return {
            id: fieldKey,
            key: fieldKey,
            label: fieldKey,
            description: '',
            type: 'text',
            options: [],
            validation: {},
            analyticsEnabled: false,
            aggregator: 'none',
            status: 'ACTIVE',
            version: 1,
            required: this.toBool(fieldRef.required, false),
            placeholder: this.readString(fieldRef.placeholder),
            defaultValue: fieldRef.defaultValue ?? null,
            helpText: this.readString(fieldRef.helpText),
            visibility: this.readString(fieldRef.visibility).toLowerCase() === 'hidden' ? 'hidden' : 'visible',
            kpiAlias: this.readString(fieldRef.kpiAlias),
            source: fieldKey.toLowerCase().startsWith(`${template.code.toLowerCase()}_`) ? 'appendix-local' : 'global'
          };
        }
        return {
          ...globalField,
          required: this.toBool(fieldRef.required, false),
          placeholder: this.readString(fieldRef.placeholder),
          defaultValue: fieldRef.defaultValue ?? null,
          helpText: this.readString(fieldRef.helpText),
          visibility: this.readString(fieldRef.visibility).toLowerCase() === 'hidden' ? 'hidden' : 'visible',
          kpiAlias: this.readString(fieldRef.kpiAlias),
          source: 'global'
        };
      });

      return {
        code: template.code,
        name: template.name,
        description: template.description,
        fields
      };
    });
  }
}
