import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PermissionAction, PermissionEffect } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { AUTH_USER_CONTEXT_KEY } from '../request/request.constants';
import { TENANT_CONTEXT_KEY } from '../tenant/tenant.constants';
import { resolveTenantRuntimeConfig } from '../tenant/tenant-context.util';
import { IS_PUBLIC_KEY } from './auth.constants';
import { AuthUser } from './auth-user.type';
import { resolveModuleKeyFromPath, resolvePermissionActionFromRequest } from './permission.util';

type PermissionPolicyRuntime = {
  enabled: boolean;
  conflictPolicy: string;
  superAdminIds: Set<string>;
  superAdminEmails: Set<string>;
};

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly policyCache = new Map<string, { expiresAt: number; value: PermissionPolicyRuntime }>();
  private readonly cacheTtlMs = 30_000;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const runtime = resolveTenantRuntimeConfig();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const defaultAuthEnabled = runtime.singleTenantMode ? 'false' : 'true';
    const authEnabled = this.config.get<string>('AUTH_ENABLED', defaultAuthEnabled).toLowerCase() === 'true';
    if (!authEnabled) {
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
      return true;
    }

    const authUser = this.ensureRecord(this.cls.get(AUTH_USER_CONTEXT_KEY)) as AuthUser;
    const userId = this.cleanString(authUser.userId ?? authUser.sub);
    const email = this.cleanString(authUser.email).toLowerCase();
    const role = this.cleanString(authUser.role).toUpperCase();
    if (!userId) {
      // JwtAuthGuard + @Roles will handle authorization fallback.
      return true;
    }
    if (role === 'ADMIN') {
      return true;
    }

    const tenantId = this.cleanString(this.cls.get(TENANT_CONTEXT_KEY)) || this.prisma.getTenantId();
    const policy = await this.getPermissionPolicy(tenantId);
    if (!policy.enabled) {
      return true;
    }

    if (policy.superAdminIds.has(userId) || (email && policy.superAdminEmails.has(email))) {
      return true;
    }

    const action = resolvePermissionActionFromRequest(request.method, path);
    const positionId = await this.resolvePositionId(authUser);

    const [positionRules, userOverrides] = await Promise.all([
      positionId
        ? this.prisma.client.positionPermissionRule.findMany({
            where: {
              positionId,
              moduleKey,
              action
            }
          })
        : Promise.resolve([]),
      this.prisma.client.userPermissionOverride.findMany({
        where: {
          userId,
          moduleKey,
          action
        }
      })
    ]);

    const effectiveRules = [...positionRules, ...userOverrides];
    if (effectiveRules.length === 0) {
      // No explicit granular policy => fallback to existing @Roles behavior.
      return true;
    }

    const hasDeny = effectiveRules.some((rule) => rule.effect === PermissionEffect.DENY);
    if (hasDeny) {
      throw new ForbiddenException(`Bạn không có quyền ${action} cho module ${moduleKey}.`);
    }

    const hasAllow = effectiveRules.some((rule) => rule.effect === PermissionEffect.ALLOW);
    if (hasAllow) {
      return true;
    }

    throw new ForbiddenException(`Bạn không có quyền ${action} cho module ${moduleKey}.`);
  }

  private async resolvePositionId(authUser: AuthUser) {
    const fromToken = this.cleanString(authUser.positionId);
    if (fromToken) {
      return fromToken;
    }

    const employeeId = this.cleanString(authUser.employeeId);
    if (!employeeId) {
      return '';
    }

    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId }
    });
    return this.cleanString(employee?.positionId);
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
    const legacySuperAdminIds = this.toStringArray(payload.superAdminIds);
    const policySuperAdminIds = this.toStringArray(permissionPolicy.superAdminIds);
    const policySuperAdminEmails = this.toStringArray(permissionPolicy.superAdminEmails).map((item) => item.toLowerCase());

    const enabledFromEnv = this.config.get<string>('PERMISSION_ENGINE_ENABLED');
    const enabled = enabledFromEnv
      ? this.toBool(enabledFromEnv, false)
      : this.toBool(permissionPolicy.enabled, false);

    const value: PermissionPolicyRuntime = {
      enabled,
      conflictPolicy: this.cleanString(permissionPolicy.conflictPolicy).toUpperCase() || 'DENY_OVERRIDES',
      superAdminIds: new Set([...legacySuperAdminIds, ...policySuperAdminIds].map((item) => item.trim()).filter(Boolean)),
      superAdminEmails: new Set(policySuperAdminEmails.filter(Boolean))
    };

    this.policyCache.set(tenantId, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs
    });

    return value;
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

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
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
}
