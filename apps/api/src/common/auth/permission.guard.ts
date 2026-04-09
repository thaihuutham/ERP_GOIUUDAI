import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PermissionAction, PermissionEffect } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { AUTH_USER_CONTEXT_KEY, IAM_SCOPE_CONTEXT_KEY } from '../request/request.constants';
import { TENANT_CONTEXT_KEY } from '../tenant/tenant.constants';
import { IS_PUBLIC_KEY } from './auth.constants';
import { AuthUser } from './auth-user.type';
import { resolveModuleKeyFromPath, resolvePermissionActionFromRequest } from './permission.util';
import { IamAccessService } from '../../modules/iam/iam-access.service';
import { IamShadowLogService } from '../../modules/iam/iam-shadow-log.service';
import { IamScopeService } from '../../modules/iam/iam-scope.service';

type PermissionPolicyRuntime = {
  enabled: boolean;
  conflictPolicy: string;
  superAdminIds: Set<string>;
  superAdminEmails: Set<string>;
  iamV2: {
    enabled: boolean;
    mode: 'OFF' | 'SHADOW' | 'ENFORCE';
    enforcementModules: Set<string>;
    protectAdminCore: boolean;
    denySelfElevation: boolean;
  };
};

type LegacyPermissionDecision = {
  allowed: boolean;
  reason: string;
};

type IamScopeContext = {
  enabled: boolean;
  mode: 'OFF' | 'SHADOW' | 'ENFORCE';
  companyWide: boolean;
  actorIds: string[];
  employeeIds: string[];
  orgUnitIds: string[];
};

const IAM_V2_ALL_MODULE_TOKENS = new Set(['*', 'all']);

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly policyCache = new Map<string, { expiresAt: number; value: PermissionPolicyRuntime }>();
  private readonly cacheTtlMs = 30_000;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IamAccessService) private readonly iamAccess: IamAccessService,
    @Inject(IamShadowLogService) private readonly iamShadowLog: IamShadowLogService,
    @Inject(IamScopeService) private readonly iamScopeService: IamScopeService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authEnabled = this.toBool(this.config.get<string>('AUTH_ENABLED'), true);
    const devAuthBypassEnabled = this.toBool(this.config.get<string>('DEV_AUTH_BYPASS_ENABLED'), false);
    const isProduction = this.cleanString(this.config.get<string>('NODE_ENV')).toLowerCase() === 'production';
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      this.setIamScopeContext(null);
      return true;
    }

    if (!authEnabled) {
      if (isProduction) {
        this.setIamScopeContext(null);
        throw new ForbiddenException('AUTH_ENABLED=false is not allowed in production.');
      }
      if (!devAuthBypassEnabled) {
        this.setIamScopeContext(null);
        throw new ForbiddenException(
          'AUTH_ENABLED=false requires DEV_AUTH_BYPASS_ENABLED=true for explicit dev-only bypass.'
        );
      }
      this.setIamScopeContext(null);
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      method: string;
      url?: string;
      originalUrl?: string;
    }>();

    const path = String(request.originalUrl ?? request.url ?? '');
    const moduleKey = resolveModuleKeyFromPath(path);
    if (!moduleKey || moduleKey === 'auth' || moduleKey === 'health') {
      this.setIamScopeContext(null);
      return true;
    }

    const authUser = this.ensureRecord(this.cls.get(AUTH_USER_CONTEXT_KEY)) as AuthUser;
    const userId = this.cleanString(authUser.userId ?? authUser.sub);
    const email = this.cleanString(authUser.email).toLowerCase();
    const role = this.normalizeAccessRole(authUser.role);
    if (!userId) {
      // JwtAuthGuard + @Roles will handle authorization fallback.
      this.setIamScopeContext(null);
      return true;
    }
    if (role === 'ADMIN') {
      this.setIamScopeContext({
        enabled: true,
        mode: 'ENFORCE',
        companyWide: true,
        actorIds: [userId],
        employeeIds: [],
        orgUnitIds: []
      });
      return true;
    }

    const tenantId = this.cleanString(this.cls.get(TENANT_CONTEXT_KEY)) || this.prisma.getTenantId();
    const policy = await this.getPermissionPolicy(tenantId);

    if (policy.superAdminIds.has(userId) || (email && policy.superAdminEmails.has(email))) {
      this.setIamScopeContext({
        enabled: true,
        mode: 'ENFORCE',
        companyWide: true,
        actorIds: [userId],
        employeeIds: [],
        orgUnitIds: []
      });
      return true;
    }

    const action = resolvePermissionActionFromRequest(request.method, path);
    const { primaryPositionId, positionIds } = await this.resolvePositionContext(authUser);
    const legacyDecision = await this.resolveLegacyDecision({
      policy,
      userId,
      positionIds,
      moduleKey,
      action
    });

    const shouldApplyIamV2 = this.shouldApplyIamV2ForModule(policy, moduleKey);
    if (shouldApplyIamV2) {
      const iamDecision = await this.iamAccess.resolveActionDecision(
        {
          tenantId,
          userId,
          role,
          email,
          employeeId: this.cleanString(authUser.employeeId),
          positionId: primaryPositionId,
          positionIds
        },
        moduleKey,
        action
      );

      if (policy.iamV2.mode === 'ENFORCE') {
        if (!iamDecision.allowed) {
          this.setIamScopeContext(null);
          throw new ForbiddenException(`Bạn không có quyền ${action} cho module ${moduleKey}.`);
        }
        const scopeAccess = await this.iamScopeService.resolveScopeAccess({
          tenantId,
          userId,
          role,
          email,
          employeeId: this.cleanString(authUser.employeeId),
          positionId: primaryPositionId,
          positionIds
        });
        this.setIamScopeContext({
          enabled: true,
          mode: 'ENFORCE',
          companyWide: scopeAccess.companyWide,
          actorIds: scopeAccess.actorIds,
          employeeIds: scopeAccess.employeeIds,
          orgUnitIds: scopeAccess.orgUnitIds
        });
        return true;
      }

      this.iamShadowLog.logLegacyVsIam({
        tenantId,
        userId,
        moduleKey,
        action,
        path,
        legacyAllowed: legacyDecision.allowed,
        iamAllowed: iamDecision.allowed,
        mode: 'SHADOW',
        reasonLegacy: legacyDecision.reason,
        reasonIam: iamDecision.reason
      });
      this.setIamScopeContext(null);
    }

    if (!legacyDecision.allowed) {
      this.setIamScopeContext(null);
      throw new ForbiddenException(`Bạn không có quyền ${action} cho module ${moduleKey}.`);
    }
    this.setIamScopeContext(null);
    return true;
  }

  private async resolvePositionContext(authUser: AuthUser) {
    const userId = this.cleanString(authUser.userId ?? authUser.sub);
    const fromToken = this.cleanString(authUser.positionId);
    const fromAssignments = await this.resolveUserPositionAssignments(userId);

    const employeeId = this.cleanString(authUser.employeeId);
    const fromEmployee = employeeId
      ? this.cleanString(
          (
            await this.prisma.client.employee.findFirst({
              where: { id: employeeId },
              select: { positionId: true }
            })
          )?.positionId
        )
      : '';

    const positionIds = this.uniqueStrings([fromToken, ...fromAssignments, fromEmployee]);
    return {
      primaryPositionId: positionIds[0] ?? '',
      positionIds
    };
  }

  private async resolveUserPositionAssignments(userId: string) {
    if (!userId) {
      return [];
    }
    const now = new Date();
    const rows = await this.prisma.client.userPositionAssignment.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        AND: [
          {
            OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }]
          },
          {
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }]
          }
        ]
      },
      select: {
        positionId: true,
        isPrimary: true,
        createdAt: true
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }]
    });
    return rows.map((row) => this.cleanString(row.positionId)).filter(Boolean);
  }

  private async getPermissionPolicy(tenantId: string): Promise<PermissionPolicyRuntime> {
    const cached = this.policyCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const row = await this.prisma.client.setting.findFirst({
      where: {
        settingKey: 'settings.access_security.v1'
      }
    });

    const payload = this.ensureRecord(row?.settingValue);
    const permissionPolicy = this.ensureRecord(payload.permissionPolicy);
    const iamV2Policy = this.ensureRecord(payload.iamV2);
    const legacySuperAdminIds = this.toStringArray(payload.superAdminIds);
    const policySuperAdminIds = this.toStringArray(permissionPolicy.superAdminIds);
    const policySuperAdminEmails = this.toStringArray(permissionPolicy.superAdminEmails).map((item) => item.toLowerCase());

    const enabledFromEnv = this.config.get<string>('PERMISSION_ENGINE_ENABLED');
    const enabled = enabledFromEnv
      ? this.toBool(enabledFromEnv, false)
      : this.toBool(permissionPolicy.enabled, false);
    const iamV2ModeRaw = this.cleanString(iamV2Policy.mode).toUpperCase();
    const iamV2Mode = iamV2ModeRaw === 'OFF'
      ? 'OFF'
      : iamV2ModeRaw === 'ENFORCE'
        ? 'ENFORCE'
        : 'SHADOW';
    const iamV2EnabledFromEnv = this.config.get<string>('IAM_V2_ENABLED');
    const iamV2Enabled = iamV2EnabledFromEnv
      ? this.toBool(iamV2EnabledFromEnv, false)
      : this.toBool(iamV2Policy.enabled, false);
    const enforcementModuleList = this.toStringArray(iamV2Policy.enforcementModules).map((item) => item.toLowerCase());
    const enforcementModules = enforcementModuleList.some((item) => IAM_V2_ALL_MODULE_TOKENS.has(item))
      ? new Set<string>()
      : new Set(enforcementModuleList);

    const value: PermissionPolicyRuntime = {
      enabled,
      conflictPolicy: this.cleanString(permissionPolicy.conflictPolicy).toUpperCase() || 'DENY_OVERRIDES',
      superAdminIds: new Set([...legacySuperAdminIds, ...policySuperAdminIds].map((item) => item.trim()).filter(Boolean)),
      superAdminEmails: new Set(policySuperAdminEmails.filter(Boolean)),
      iamV2: {
        enabled: iamV2Enabled,
        mode: iamV2Mode,
        enforcementModules,
        protectAdminCore: this.toBool(iamV2Policy.protectAdminCore, true),
        denySelfElevation: this.toBool(iamV2Policy.denySelfElevation, true)
      }
    };

    this.policyCache.set(tenantId, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs
    });

    return value;
  }

  private shouldApplyIamV2ForModule(policy: PermissionPolicyRuntime, moduleKey: string) {
    if (!policy.iamV2.enabled || policy.iamV2.mode === 'OFF') {
      return false;
    }
    if (policy.iamV2.enforcementModules.size === 0) {
      return true;
    }
    return policy.iamV2.enforcementModules.has(moduleKey.toLowerCase());
  }

  private async resolveLegacyDecision(params: {
    policy: PermissionPolicyRuntime;
    userId: string;
    positionIds: string[];
    moduleKey: string;
    action: PermissionAction;
  }): Promise<LegacyPermissionDecision> {
    if (!params.policy.enabled) {
      return {
        allowed: true,
        reason: 'POLICY_DISABLED'
      };
    }

    const [positionRules, userOverrides] = await Promise.all([
      params.positionIds.length > 0
        ? this.prisma.client.positionPermissionRule.findMany({
            where: {
              positionId: {
                in: params.positionIds
              },
              moduleKey: params.moduleKey,
              action: params.action
            }
          })
        : Promise.resolve([]),
      this.prisma.client.userPermissionOverride.findMany({
        where: {
          userId: params.userId,
          moduleKey: params.moduleKey,
          action: params.action
        }
      })
    ]);

    const effectiveRules = [...positionRules, ...userOverrides];
    if (effectiveRules.length === 0) {
      return {
        allowed: true,
        reason: 'NO_RULES'
      };
    }

    const hasAllow = effectiveRules.some((rule) => rule.effect === PermissionEffect.ALLOW);
    const hasDeny = effectiveRules.some((rule) => rule.effect === PermissionEffect.DENY);

    if (hasAllow && hasDeny) {
      if (params.policy.conflictPolicy === 'ALLOW_OVERRIDES') {
        return {
          allowed: true,
          reason: 'ALLOW_OVERRIDES'
        };
      }
      return {
        allowed: false,
        reason: 'DENY_OVERRIDES'
      };
    }

    if (hasDeny) {
      return {
        allowed: false,
        reason: 'DENY_RULE'
      };
    }

    if (hasAllow) {
      return {
        allowed: true,
        reason: 'ALLOW_RULE'
      };
    }

    return {
      allowed: false,
      reason: 'NO_ALLOW'
    };
  }

  private ensureRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeAccessRole(value: unknown): 'ADMIN' | 'USER' {
    const normalized = this.cleanString(value).toUpperCase();
    if (normalized === 'ADMIN') {
      return 'ADMIN';
    }
    if (normalized === 'USER') {
      return 'USER';
    }
    // Keep runtime role model strict: only ADMIN/USER are valid decision roles.
    return 'USER';
  }

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }

  private uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((item) => this.cleanString(item)).filter(Boolean)));
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

  private setIamScopeContext(value: IamScopeContext | null) {
    this.cls.set(IAM_SCOPE_CONTEXT_KEY, value);
  }
}
