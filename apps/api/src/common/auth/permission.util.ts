import { PermissionAction } from '@prisma/client';

const APPROVAL_PATH_MARKERS = ['/approve', '/reject', '/submit', '/escalate', '/delegate', '/restore', '/reindex', '/pay'];

export const SUPPORTED_PERMISSION_ACTIONS: PermissionAction[] = [
  PermissionAction.VIEW,
  PermissionAction.CREATE,
  PermissionAction.UPDATE,
  PermissionAction.DELETE,
  PermissionAction.APPROVE
];

export function resolveModuleKeyFromPath(path: string) {
  const raw = String(path ?? '').split('?')[0];
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  const withoutPrefix = normalized.replace(/^\/api\/v1\//i, '');
  const [moduleKey] = withoutPrefix.split('/').filter(Boolean);
  return moduleKey ? moduleKey.toLowerCase() : '';
}

export function resolvePermissionActionFromRequest(methodRaw: string, pathRaw: string): PermissionAction {
  const method = String(methodRaw ?? '').trim().toUpperCase();
  const path = String(pathRaw ?? '').toLowerCase();

  if (APPROVAL_PATH_MARKERS.some((marker) => path.includes(marker))) {
    return PermissionAction.APPROVE;
  }

  if (method === 'GET' || method === 'HEAD') {
    return PermissionAction.VIEW;
  }
  if (method === 'POST') {
    return PermissionAction.CREATE;
  }
  if (method === 'PUT' || method === 'PATCH') {
    return PermissionAction.UPDATE;
  }
  if (method === 'DELETE') {
    return PermissionAction.DELETE;
  }
  return PermissionAction.VIEW;
}
