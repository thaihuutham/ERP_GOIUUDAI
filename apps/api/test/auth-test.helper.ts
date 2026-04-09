import { sign } from 'jsonwebtoken';

export const TEST_TENANT_ID = 'GOIUUDAI';

type TestRole = 'ADMIN' | 'USER';

export const setupSingleTenantAuthTestEnv = (jwtSecret: string) => {
  const ensure = (key: string, value: string) => {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  };

  process.env.NODE_ENV = 'test';
  ensure('AUTH_ENABLED', 'true');
  ensure('NEXT_PUBLIC_AUTH_ENABLED', 'true');
  ensure('DEV_AUTH_BYPASS_ENABLED', 'false');
  ensure('TENANCY_MODE', 'single');
  ensure('DEFAULT_TENANT_ID', TEST_TENANT_ID);
  ensure('JWT_SECRET', jwtSecret);
  ensure('PRISMA_SKIP_CONNECT', 'true');
};

type MakeTokenOptions = {
  tenantId?: string;
  expiresIn?: string;
};

export const makeAuthToken = (role: TestRole, options: MakeTokenOptions = {}) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required before generating test token.');
  }

  return sign(
    {
      sub: `test_${role.toLowerCase()}`,
      userId: `test_${role.toLowerCase()}`,
      email: `${role.toLowerCase()}@example.com`,
      role,
      tenantId: options.tenantId ?? TEST_TENANT_ID
    },
    jwtSecret,
    { algorithm: 'HS256', expiresIn: options.expiresIn ?? '1h' }
  );
};
