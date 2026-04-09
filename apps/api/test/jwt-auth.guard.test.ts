import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';

function makeContext(path: string, options?: { token?: string; method?: string; headers?: Record<string, string> }) {
  const headers: Record<string, string> = {
    ...(options?.headers ?? {})
  };
  if (options?.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: options?.method ?? 'GET',
        url: path,
        originalUrl: path,
        headers
      })
    }),
    getHandler: () => ({}),
    getClass: () => ({})
  } as any;
}

function makeGuard(options?: { authEnabled?: boolean; devAuthBypassEnabled?: boolean; requiredRoles?: UserRole[] }) {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => {
      if (key === 'roles') {
        return options?.requiredRoles ?? false;
      }
      return false;
    })
  };

  const config = {
    get: vi.fn((key: string, fallback?: string) => {
      if (key === 'AUTH_ENABLED') return options?.authEnabled === false ? 'false' : 'true';
      if (key === 'DEV_AUTH_BYPASS_ENABLED') return options?.devAuthBypassEnabled === true ? 'true' : 'false';
      if (key === 'JWT_SECRET') return 'guard-test-secret';
      if (key === 'NODE_ENV') return 'test';
      return fallback;
    })
  };

  const cls = {
    set: vi.fn()
  };

  const runtimeSettings = {
    getAccessSecurityRuntime: vi.fn().mockResolvedValue({
      sessionTimeoutMinutes: 480
    })
  };

  return new JwtAuthGuard(reflector as any, config as any, cls as any, runtimeSettings as any);
}

describe('JwtAuthGuard', () => {
  it('rejects missing bearer token when auth is enabled', async () => {
    process.env.TENANCY_MODE = 'single';
    process.env.DEFAULT_TENANT_ID = 'GOIUUDAI';

    const guard = makeGuard();
    await expect(guard.canActivate(makeContext('/api/v1/crm/customers'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires password change before accessing other routes', async () => {
    process.env.TENANCY_MODE = 'single';
    process.env.DEFAULT_TENANT_ID = 'GOIUUDAI';

    const token = jwt.sign(
      {
        sub: 'user_1',
        userId: 'user_1',
        email: 'user@erp.local',
        role: 'USER',
        tenantId: 'GOIUUDAI',
        mustChangePassword: true
      },
      'guard-test-secret',
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    const guard = makeGuard();
    await expect(guard.canActivate(makeContext('/api/v1/sales/orders', { token }))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(makeContext('/api/v1/auth/change-password', { token, method: 'POST' }))).resolves.toBe(true);
  });

  it('injects dev auth context when auth is disabled', async () => {
    process.env.TENANCY_MODE = 'single';
    process.env.DEFAULT_TENANT_ID = 'GOIUUDAI';

    const guard = makeGuard({ authEnabled: false, devAuthBypassEnabled: true });
    await expect(
      guard.canActivate(
        makeContext('/api/v1/assistant/access/me', {
          headers: {
            'x-tenant-id': 'GOIUUDAI',
            'x-erp-dev-role': 'ADMIN',
            'x-erp-dev-user-id': 'dev_admin'
          }
        })
      )
    ).resolves.toBe(true);
  });

  it('rejects auth disabled mode when dev bypass flag is not enabled', async () => {
    process.env.TENANCY_MODE = 'single';
    process.env.DEFAULT_TENANT_ID = 'GOIUUDAI';

    const guard = makeGuard({ authEnabled: false, devAuthBypassEnabled: false });
    await expect(guard.canActivate(makeContext('/api/v1/crm/customers'))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('enforces @Roles in auth disabled mode from dev role header', async () => {
    process.env.TENANCY_MODE = 'single';
    process.env.DEFAULT_TENANT_ID = 'GOIUUDAI';

    const guard = makeGuard({
      authEnabled: false,
      devAuthBypassEnabled: true,
      requiredRoles: [UserRole.ADMIN]
    });
    await expect(
      guard.canActivate(
        makeContext('/api/v1/assistant/channels', {
          headers: {
            'x-tenant-id': 'GOIUUDAI',
            'x-erp-dev-role': 'USER',
            'x-erp-dev-user-id': 'dev_user'
          }
        })
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
