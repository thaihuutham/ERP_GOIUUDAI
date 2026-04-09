import { UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../src/common/auth/password.util';
import { AuthService } from '../src/modules/auth/auth.service';

describe('AuthService', () => {
  it('keeps mustChangePassword=true on login and clears it after first password change', async () => {
    const hashedTempPassword = await hashPassword('TempPass123');
    const userState = {
      id: 'user_1',
      tenant_Id: 'GOIUUDAI',
      email: 'staff@erp.local',
      passwordHash: hashedTempPassword,
      role: UserRole.USER,
      employeeId: null,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: null,
      passwordChangedAt: null,
      passwordResetAt: null
    };

    const prisma = {
      getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
      client: {
        user: {
          findFirst: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
            const where = args?.where ?? {};
            if (where.id && String(where.id) !== userState.id) {
              return null;
            }
            if (where.email && String(where.email) !== userState.email) {
              return null;
            }
            return { ...userState };
          }),
          updateMany: vi.fn(async (args: { where: { id?: string }; data: Record<string, unknown> }) => {
            if (!args.where?.id || args.where.id === userState.id) {
              if (typeof args.data.passwordHash === 'string') {
                userState.passwordHash = args.data.passwordHash;
              }
              if (typeof args.data.mustChangePassword === 'boolean') {
                userState.mustChangePassword = args.data.mustChangePassword;
              }
              if (args.data.passwordChangedAt instanceof Date) {
                userState.passwordChangedAt = args.data.passwordChangedAt;
              }
              if (args.data.lastLoginAt instanceof Date) {
                userState.lastLoginAt = args.data.lastLoginAt;
              }
            }
            return { count: 1 };
          }),
          create: vi.fn()
        },
        employee: {
          findFirst: vi.fn().mockResolvedValue(null)
        }
      }
    };

    const config = {
      get: vi.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'auth-test-secret';
        if (key === 'JWT_ACCESS_EXPIRES_IN') return '8h';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
        return undefined;
      })
    };

    const settingsPolicy = {
      getDomain: vi.fn().mockResolvedValue({
        data: {
          passwordPolicy: {
            minLength: 8,
            requireUppercase: true,
            requireNumber: true,
            requireSpecial: false
          }
        }
      })
    };

    const service = new AuthService(prisma as any, config as any, settingsPolicy as any);

    const loginResult = await service.login({
      email: 'staff@erp.local',
      password: 'TempPass123'
    });
    expect(loginResult.mustChangePassword).toBe(true);
    expect(typeof loginResult.accessToken).toBe('string');
    expect(typeof loginResult.refreshToken).toBe('string');

    const changedResult = await service.changePassword(
      {
        userId: userState.id,
        sub: userState.id
      },
      {
        newPassword: 'NewSecure123'
      }
    );

    expect(changedResult.message).toContain('Đổi mật khẩu thành công');
    expect(userState.mustChangePassword).toBe(false);
    expect(userState.passwordChangedAt).toBeInstanceOf(Date);
  });
});

