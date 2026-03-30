import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import { AUTH_USER_CONTEXT_KEY } from '../request/request.constants';
import { TENANT_CONTEXT_KEY } from '../tenant/tenant.constants';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.constants';

const { verify } = jwt;

type AuthUser = {
  sub?: string;
  userId?: string;
  email?: string;
  role?: UserRole;
  tenantId?: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ClsService) private readonly cls: ClsService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const authEnabled = this.config.get<string>('AUTH_ENABLED', 'true').toLowerCase() === 'true';
    if (!authEnabled) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined>; user?: AuthUser }>();
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
    const role = (Object.values(UserRole) as string[]).includes(roleRaw) ? (roleRaw as UserRole) : undefined;

    const authUser: AuthUser = {
      sub: typeof payload.sub === 'string' ? payload.sub : undefined,
      userId: typeof payload.userId === 'string' ? payload.userId : typeof payload.sub === 'string' ? payload.sub : undefined,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      role,
      tenantId:
        typeof payload.tenantId === 'string'
          ? payload.tenantId
          : typeof payload.tenant_Id === 'string'
            ? payload.tenant_Id
            : undefined
    };

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
      if (!authUser.role || !requiredRoles.includes(authUser.role)) {
        throw new ForbiddenException('Bạn không có quyền truy cập tài nguyên này.');
      }
    }

    return true;
  }
}
