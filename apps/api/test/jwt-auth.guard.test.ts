import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';

function makeContext(path: string, token?: string, method = 'GET') {
  const headers: Record<string, string> = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        url: path,
        originalUrl: path,
        headers
      })
    }),
    getHandler: () => ({}),
    getClass: () => ({})
  } as any;
}

function makeGuard() {
  const reflector = {
    getAllAndOverride: vi.fn((_key: string) => false)
  };

  const config = {
    get: vi.fn((key: string, fallback?: string) => {
      if (key === 'AUTH_ENABLED') return 'true';
      if (key === 'JWT_SECRET') return 'guard-test-secret';
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
        email: 'staff@erp.local',
        role: 'STAFF',
        tenantId: 'GOIUUDAI',
        mustChangePassword: true
      },
      'guard-test-secret',
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    const guard = makeGuard();
    await expect(guard.canActivate(makeContext('/api/v1/sales/orders', token))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(makeContext('/api/v1/auth/change-password', token, 'POST'))).resolves.toBe(true);
  });
});
