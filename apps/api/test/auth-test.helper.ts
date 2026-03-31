import { sign } from 'jsonwebtoken';

export const TEST_TENANT_ID = 'GOIUUDAI';

type TestRole = 'ADMIN' | 'MANAGER' | 'STAFF';

export const setupSingleTenantAuthTestEnv = (jwtSecret: string) => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_ENABLED = 'true';
  process.env.TENANCY_MODE = 'single';
  process.env.DEFAULT_TENANT_ID = TEST_TENANT_ID;
  process.env.JWT_SECRET = jwtSecret;
  process.env.PRISMA_SKIP_CONNECT = 'true';
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
