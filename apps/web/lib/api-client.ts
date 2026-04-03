import type { HttpMethod } from './module-ui';
import { readStoredAuthSession } from './auth-session';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const WEB_ROLE_STORAGE_KEY = 'erp_web_role';
const DEV_ROLES = new Set(['STAFF', 'MANAGER', 'ADMIN']);

export type ApiRequestOptions = {
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
};

function buildUrl(path: string, query?: ApiRequestOptions['query']) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${normalizedPath}`);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

export async function apiRequest<T = unknown>(path: string, options: ApiRequestOptions = {}) {
  const method = options.method ?? 'GET';

  // Always send x-tenant-id for API compatibility across local/dev environments.
  // If a custom header key is configured, send it in parallel.
  const tenantHeaderKey = (process.env.NEXT_PUBLIC_TENANT_HEADER_KEY ?? 'x-tenant-id').trim();
  const tenantId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ?? 'GOIUUDAI';

  const tenantHeaders: Record<string, string> = {
    'x-tenant-id': tenantId
  };
  if (tenantHeaderKey && tenantHeaderKey.toLowerCase() !== 'x-tenant-id') {
    tenantHeaders[tenantHeaderKey] = tenantId;
  }

  const authHeaders: Record<string, string> = {};
  if (!options.skipAuth) {
    const authSession = readStoredAuthSession();
    const token = String(authSession?.accessToken ?? '').trim();
    if (token) {
      authHeaders.authorization = `Bearer ${token}`;
    }
  }

  const devIdentityHeaders = resolveDevIdentityHeaders();

  const res = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...tenantHeaders,
      ...authHeaders,
      ...devIdentityHeaders,
      ...(options.headers ?? {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  });

  const text = await res.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const message = extractApiErrorMessage(payload) ?? `Request failed (${res.status})`;
    throw new Error(message);
  }

  return payload as T;
}

function resolveDevIdentityHeaders(): Record<string, string> {
  const authEnabled = String(process.env.NEXT_PUBLIC_AUTH_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  if (authEnabled) {
    return {};
  }

  const authSession = readStoredAuthSession();
  let role = 'MANAGER';
  if (typeof window !== 'undefined') {
    const storedRole = String(window.localStorage.getItem(WEB_ROLE_STORAGE_KEY) ?? '').trim().toUpperCase();
    if (DEV_ROLES.has(storedRole)) {
      role = storedRole;
    }
  }

  const userId = `dev_${role.toLowerCase()}`;
  const employeeId = String(authSession?.user?.employeeId ?? '').trim() || userId;
  return {
    'x-erp-dev-role': role,
    'x-erp-dev-user-id': userId,
    'x-erp-dev-email': `${role.toLowerCase()}@local.erp`,
    'x-erp-dev-employee-id': employeeId
  };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractApiErrorMessage(payload: unknown): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message;
  }

  const errorRecord =
    record.error && typeof record.error === 'object' && !Array.isArray(record.error)
      ? (record.error as Record<string, unknown>)
      : null;
  if (!errorRecord) {
    return null;
  }

  if (typeof errorRecord.message === 'string' && errorRecord.message.trim()) {
    return errorRecord.message;
  }

  const detailRecord =
    errorRecord.details && typeof errorRecord.details === 'object' && !Array.isArray(errorRecord.details)
      ? (errorRecord.details as Record<string, unknown>)
      : null;
  if (detailRecord && typeof detailRecord.message === 'string' && detailRecord.message.trim()) {
    return detailRecord.message;
  }

  return null;
}

export function normalizeListPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload as Record<string, unknown>[];
  }

  if (payload && typeof payload === 'object') {
    const objectPayload = payload as Record<string, unknown>;
    if (Array.isArray(objectPayload.items)) {
      return objectPayload.items as Record<string, unknown>[];
    }
  }

  return [];
}

export function normalizeObjectPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
}
