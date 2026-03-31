import jwt from 'jsonwebtoken';

const { verify } = jwt;

type TenantRuntimeConfig = {
  singleTenantMode: boolean;
  tenantId: string;
};

const DEFAULT_SINGLE_TENANT_ID = 'GOIUUDAI';

export const resolveTenantRuntimeConfig = (): TenantRuntimeConfig => {
  const mode = (process.env.TENANCY_MODE ?? 'single').trim().toLowerCase();
  const tenantId = (process.env.DEFAULT_TENANT_ID ?? DEFAULT_SINGLE_TENANT_ID).trim() || DEFAULT_SINGLE_TENANT_ID;
  return {
    singleTenantMode: mode !== 'multi',
    tenantId
  };
};

const safeVerifyJwtPayload = (token: string): Record<string, unknown> | null => {
  const secret = (process.env.JWT_SECRET ?? '').trim();
  if (!secret) {
    return null;
  }

  try {
    return verify(token, secret, { algorithms: ['HS256'] }) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const resolveHeaderTenant = (headers: Record<string, unknown>) => {
  const configuredHeaderKey = (process.env.TENANT_HEADER_KEY ?? 'x-tenant-id').toLowerCase();
  const headerKeys = Array.from(new Set([configuredHeaderKey, 'x-tenant-id', 'tenant-id']));

  for (const key of headerKeys) {
    const rawValue = headers[key];
    if (typeof rawValue === 'string' && rawValue.trim()) {
      return rawValue.trim();
    }
  }

  return undefined;
};

export const resolveTenantIdFromRequest = (req: { headers: Record<string, unknown>; authorization?: string }): string => {
  const runtime = resolveTenantRuntimeConfig();
  if (runtime.singleTenantMode) {
    return runtime.tenantId;
  }

  const headerTenant = resolveHeaderTenant(req.headers);

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
  let tenantFromJwt: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = safeVerifyJwtPayload(token);
    const rawJwtTenant = payload?.tenantId ?? payload?.tenant_Id;
    if (typeof rawJwtTenant === 'string' && rawJwtTenant.trim()) {
      tenantFromJwt = rawJwtTenant.trim();
    }
  }

  // If JWT is present, it is the source of truth
  if (tenantFromJwt) {
    if (headerTenant && headerTenant !== tenantFromJwt) {
      // In a real production scenario, you might want to log this as a security event
      console.warn(
        `[Security] Potential tenant spoofing attempt. User JWT tenant: ${tenantFromJwt}, but requested header tenant: ${headerTenant}`
      );
    }
    return tenantFromJwt;
  }

  // Fallback to header only for non-authenticated (public) requests
  if (headerTenant) {
    return headerTenant;
  }

  return runtime.tenantId;
};
