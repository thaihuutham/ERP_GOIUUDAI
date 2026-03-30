const safeDecodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const resolveTenantIdFromRequest = (req: { headers: Record<string, unknown>; authorization?: string }): string => {
  const headerKey = (process.env.TENANT_HEADER_KEY ?? 'x-tenant-id').toLowerCase();
  const headerValue = req.headers[headerKey];

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
  let tenantFromJwt: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = safeDecodeJwtPayload(token);
    const rawJwtTenant = payload?.tenantId ?? payload?.tenant_Id;
    if (typeof rawJwtTenant === 'string' && rawJwtTenant.trim()) {
      tenantFromJwt = rawJwtTenant.trim();
    }
  }

  // If JWT is present, it is the source of truth
  if (tenantFromJwt) {
    if (typeof headerValue === 'string' && headerValue.trim() && headerValue.trim() !== tenantFromJwt) {
      // In a real production scenario, you might want to log this as a security event
      console.warn(`[Security] Potential tenant spoofing attempt. User JWT tenant: ${tenantFromJwt}, but requested header tenant: ${headerValue}`);
    }
    return tenantFromJwt;
  }

  // Fallback to header only for non-authenticated (public) requests
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim();
  }

  return process.env.DEFAULT_TENANT_ID ?? process.env.JWT_DEFAULT_TENANT_CLAIM ?? 'tenant_demo_company';
};
