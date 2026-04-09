import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import { AuthUser } from './auth-user.type';
import { RuntimeSettingsService } from '../settings/runtime-settings.service';
import { AUTH_USER_CONTEXT_KEY } from '../request/request.constants';
import { TENANT_CONTEXT_KEY } from '../tenant/tenant.constants';
import { resolveTenantRuntimeConfig } from '../tenant/tenant-context.util';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.constants';

const { verify } = jwt;
const USER_ACCESS_ROLE = UserRole.USER;
const ADMIN_ACCESS_ROLE = UserRole.ADMIN;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
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
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined>; user?: AuthUser; url?: string; originalUrl?: string }>();
    if (!authEnabled) {
      const authUser = this.resolveDevAuthUser(request.headers, runtime.singleTenantMode ? runtime.tenantId : undefined);
      request.user = authUser;
      this.cls.set(AUTH_USER_CONTEXT_KEY, authUser);
      if (authUser.tenantId) {
        this.cls.set(TENANT_CONTEXT_KEY, authUser.tenantId);
      }

      const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass()
      ]);
      if (requiredRoles && requiredRoles.length > 0) {
        const requiredRoleSet = this.normalizeRequiredRoleSet(requiredRoles);
        if (!authUser.role || !requiredRoleSet.has(authUser.role)) {
          throw new ForbiddenException('Bạn không có quyền truy cập tài nguyên này.');
        }
      }
      return true;
    }

    const authorization = request.headers.authorization;
    if (!authorization || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu hoặc sai định dạng Authorization Bearer token.');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Token rỗng.');
    }

    const jwtSecret = this.config.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new UnauthorizedException('Thiếu cấu hình JWT_SECRET.');
    }

    let payload: JwtPayload;
    try {
      payload = verify(token, jwtSecret, {
        algorithms: ['HS256']
      }) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn.');
    }

    const roleRaw = typeof payload.role === 'string' ? payload.role.toUpperCase() : '';
    const role = this.normalizeAccessRole(roleRaw);
    const tokenTenantId =
      typeof payload.tenantId === 'string'
        ? payload.tenantId
        : typeof payload.tenant_Id === 'string'
          ? payload.tenant_Id
          : undefined;
    const mustChangePassword = payload.mustChangePassword === true;
    const isActive = payload.isActive !== false;
    const issuedAt = typeof payload.iat === 'number' ? payload.iat : null;

    if (runtime.singleTenantMode && tokenTenantId && tokenTenantId !== runtime.tenantId) {
      throw new UnauthorizedException(`Token tenant không hợp lệ cho chế độ single-tenant (${runtime.tenantId}).`);
    }
    if (!isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khóa.');
    }

    const sessionTimeoutMinutes = await this.getSessionTimeoutMinutes();
    if (issuedAt && sessionTimeoutMinutes > 0) {
      const sessionAgeMs = Date.now() - issuedAt * 1000;
      if (sessionAgeMs > sessionTimeoutMinutes * 60 * 1000) {
        throw new UnauthorizedException('Phiên đăng nhập đã hết hạn theo chính sách bảo mật.');
      }
    }

    const authUser: AuthUser = {
      sub: typeof payload.sub === 'string' ? payload.sub : undefined,
      userId: typeof payload.userId === 'string' ? payload.userId : typeof payload.sub === 'string' ? payload.sub : undefined,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      role,
      tenantId: runtime.singleTenantMode ? runtime.tenantId : tokenTenantId,
      employeeId: typeof payload.employeeId === 'string' ? payload.employeeId : undefined,
      positionId: typeof payload.positionId === 'string' ? payload.positionId : undefined,
      mustChangePassword,
      isActive
    };

    const requestPath = String((request as any).originalUrl ?? (request as any).url ?? '').toLowerCase();
    const isPasswordChangePath = requestPath.includes('/api/v1/auth/change-password');
    const isLogoutPath = requestPath.includes('/api/v1/auth/logout');
    if (authUser.mustChangePassword && !isPasswordChangePath && !isLogoutPath) {
      throw new ForbiddenException('Bạn cần đổi mật khẩu tạm trước khi tiếp tục sử dụng hệ thống.');
    }

    request.user = authUser;
    this.cls.set(AUTH_USER_CONTEXT_KEY, authUser);
    if (authUser.tenantId) {
      this.cls.set(TENANT_CONTEXT_KEY, authUser.tenantId);
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (requiredRoles && requiredRoles.length > 0) {
      const requiredRoleSet = this.normalizeRequiredRoleSet(requiredRoles);
      if (!authUser.role || !requiredRoleSet.has(authUser.role)) {
        throw new ForbiddenException('Bạn không có quyền truy cập tài nguyên này.');
      }
    }

    return true;
  }

  private resolveDevAuthUser(
    headers: Record<string, string | string[] | undefined>,
    fallbackTenantId?: string
  ): AuthUser {
    const roleRaw = this.readHeader(headers, 'x-erp-dev-role').toUpperCase();
    const role = this.normalizeAccessRole(roleRaw) ?? USER_ACCESS_ROLE;
    const userId = this.readHeader(headers, 'x-erp-dev-user-id') || `dev_${role.toLowerCase()}`;
    const email = this.readHeader(headers, 'x-erp-dev-email') || `${role.toLowerCase()}@local.erp`;
    const tenantId = this.readHeader(headers, 'x-tenant-id') || fallbackTenantId;
    const employeeId = this.readHeader(headers, 'x-erp-dev-employee-id') || undefined;
    const positionId = this.readHeader(headers, 'x-erp-dev-position-id') || undefined;

    return {
      sub: userId,
      userId,
      email,
      role,
      tenantId,
      employeeId,
      positionId,
      mustChangePassword: false,
      isActive: true
    };
  }

  private readHeader(headers: Record<string, string | string[] | undefined>, key: string) {
    const value = headers[key];
    if (Array.isArray(value)) {
      return this.cleanString(value[0]);
    }
    return this.cleanString(value);
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeAccessRole(roleRaw: unknown): UserRole {
    const normalized = this.cleanString(roleRaw).toUpperCase();
    if (normalized === 'ADMIN') {
      return ADMIN_ACCESS_ROLE;
    }
    if (normalized === 'USER') {
      return USER_ACCESS_ROLE;
    }
    return USER_ACCESS_ROLE;
  }

  private normalizeRequiredRoleSet(requiredRoles: UserRole[]) {
    const normalized = new Set<UserRole>();
    for (const role of requiredRoles) {
      normalized.add(this.normalizeAccessRole(role));
    }
    return normalized;
  }

  private async getSessionTimeoutMinutes() {
    try {
      const runtime = await this.runtimeSettings.getAccessSecurityRuntime();
      const value = Number(runtime.sessionTimeoutMinutes);
      if (Number.isFinite(value) && value >= 5 && value <= 1440) {
        return Math.trunc(value);
      }
    } catch {
      // ignore and fallback to env/default
    }

    const fallback = Number(this.config.get<string>('JWT_SESSION_TIMEOUT_MINUTES'));
    if (Number.isFinite(fallback) && fallback >= 5 && fallback <= 1440) {
      return Math.trunc(fallback);
    }
    return 480;
  }
}
