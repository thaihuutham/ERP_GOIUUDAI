import type { HttpMethod } from './module-ui';
import { readStoredAuthSession } from './auth-session';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const API_REQUEST_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(String(process.env.NEXT_PUBLIC_API_TIMEOUT_MS ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 15000;
})();
const WEB_ROLE_STORAGE_KEY = 'erp_web_role';
const WEB_USER_ID_STORAGE_KEY = 'erp_web_user_id';
const DEV_ROLES = new Set(['USER', 'ADMIN']);

export type ApiListPageInfo = {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  currentPage?: number;
  hasPrevPage?: boolean;
  visitedPages?: number[];
};

export type ApiListSortMeta = {
  sortBy: string;
  sortDir: 'asc' | 'desc';
  sortableFields: string[];
  consistency?: 'snapshot' | 'realtime';
};

export type ApiRequestOptions = {
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  signal?: AbortSignal;
};

type UnknownRecord = Record<string, unknown>;

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

  const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutHandle: ReturnType<typeof setTimeout> | null = abortController
    ? setTimeout(() => {
        abortController.abort();
      }, API_REQUEST_TIMEOUT_MS)
    : null;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...tenantHeaders,
        ...authHeaders,
        ...devIdentityHeaders,
        ...(options.headers ?? {})
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: options.signal ?? abortController?.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Yêu cầu API quá thời gian ${Math.ceil(API_REQUEST_TIMEOUT_MS / 1000)} giây.`);
    }
    if (error instanceof Error && error.message.trim().length > 0) {
      throw new Error(`Không thể kết nối API: ${error.message}`);
    }
    throw new Error('Không thể kết nối API.');
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }

  const text = await res.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const message = extractApiErrorMessage(payload) ?? `Request failed (${res.status})`;
    throw new Error(message);
  }

  return payload as T;
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
  );
}

function resolveDevIdentityHeaders(): Record<string, string> {
  const authEnabled = String(process.env.NEXT_PUBLIC_AUTH_ENABLED ?? 'true').trim().toLowerCase() === 'true';
  const devAuthBypassEnabled =
    String(process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  if (authEnabled || !devAuthBypassEnabled) {
    return {};
  }

  const authSession = readStoredAuthSession();
  let role = 'USER';
  if (typeof window !== 'undefined') {
    const storedRole = String(window.localStorage.getItem(WEB_ROLE_STORAGE_KEY) ?? '').trim().toUpperCase();
    if (DEV_ROLES.has(storedRole)) {
      role = storedRole;
    }
  }

  let userId = role === 'ADMIN' ? 'dev_admin' : 'dev_staff';
  if (typeof window !== 'undefined') {
    const storedUserId = String(window.localStorage.getItem(WEB_USER_ID_STORAGE_KEY) ?? '').trim();
    if (storedUserId) {
      userId = storedUserId;
    }
  }
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

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unwrapCustomFieldsEntity(value: unknown): UnknownRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const base = isRecord(value.base) ? value.base : null;
  const customFields = isRecord(value.customFields) ? value.customFields : null;

  if (!base && !customFields) {
    return value;
  }

  const normalized: UnknownRecord = {
    ...(customFields ?? {}),
    ...(base ?? {})
  };

  if (normalized.id === undefined && value.id !== undefined) {
    normalized.id = value.id;
  }

  return normalized;
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
  const normalizeRows = (rows: unknown[]) =>
    rows
      .map((item) => unwrapCustomFieldsEntity(item))
      .filter((item): item is Record<string, unknown> => item !== null);

  if (Array.isArray(payload)) {
    return normalizeRows(payload);
  }

  if (isRecord(payload)) {
    const objectPayload = payload as Record<string, unknown>;
    if (Array.isArray(objectPayload.items)) {
      return normalizeRows(objectPayload.items);
    }
  }

  return [];
}

export function normalizeObjectPayload(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }

  return unwrapCustomFieldsEntity(payload);
}

export function normalizeListMetadata(payload: unknown): {
  pageInfo: ApiListPageInfo | null;
  sortMeta: ApiListSortMeta | null;
} {
  if (!isRecord(payload)) {
    return {
      pageInfo: null,
      sortMeta: null
    };
  }

  const pageInfoRaw = isRecord(payload.pageInfo) ? payload.pageInfo : null;
  const sortMetaRaw = isRecord(payload.sortMeta) ? payload.sortMeta : null;

  const pageInfo: ApiListPageInfo | null = pageInfoRaw
    ? {
        limit: typeof pageInfoRaw.limit === 'number' && Number.isFinite(pageInfoRaw.limit) ? pageInfoRaw.limit : 25,
        hasMore: Boolean(pageInfoRaw.hasMore),
        nextCursor:
          typeof pageInfoRaw.nextCursor === 'string'
            ? pageInfoRaw.nextCursor
            : pageInfoRaw.nextCursor === null
              ? null
              : null,
        currentPage:
          typeof pageInfoRaw.currentPage === 'number' && Number.isFinite(pageInfoRaw.currentPage)
            ? pageInfoRaw.currentPage
            : undefined,
        hasPrevPage: typeof pageInfoRaw.hasPrevPage === 'boolean' ? pageInfoRaw.hasPrevPage : undefined,
        visitedPages: Array.isArray(pageInfoRaw.visitedPages)
          ? pageInfoRaw.visitedPages.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
          : undefined
      }
    : null;

  const sortMeta: ApiListSortMeta | null = sortMetaRaw
    ? {
        sortBy: typeof sortMetaRaw.sortBy === 'string' ? sortMetaRaw.sortBy : '',
        sortDir: sortMetaRaw.sortDir === 'asc' ? 'asc' : 'desc',
        sortableFields: Array.isArray(sortMetaRaw.sortableFields)
          ? sortMetaRaw.sortableFields.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : [],
        consistency:
          sortMetaRaw.consistency === 'snapshot' || sortMetaRaw.consistency === 'realtime'
            ? sortMetaRaw.consistency
            : undefined
      }
    : null;

  return {
    pageInfo,
    sortMeta
  };
}

export function normalizePagedListPayload<T = Record<string, unknown>>(payload: unknown): {
  items: T[];
  pageInfo: ApiListPageInfo | null;
  sortMeta: ApiListSortMeta | null;
} {
  const items = normalizeListPayload(payload) as T[];
  const { pageInfo, sortMeta } = normalizeListMetadata(payload);
  return {
    items,
    pageInfo,
    sortMeta
  };
}
