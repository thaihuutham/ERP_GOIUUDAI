import { UserRole } from '@prisma/client';
import { AssistantEffectiveAccess, AssistantScopeType } from './assistant.types';

export type AssistantAclResource = {
  scopeType?: string | null;
  scopeRefIds?: unknown;
  allowedRoles?: unknown;
};

export function normalizeScopeType(value: unknown, fallback: AssistantScopeType = 'company'): AssistantScopeType {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'company' || normalized === 'branch' || normalized === 'department' || normalized === 'self') {
    return normalized;
  }
  return fallback;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

export function uniqueStringArray(value: unknown): string[] {
  return Array.from(new Set(toStringArray(value)));
}

export function resolveAccessReferenceIds(access: AssistantEffectiveAccess): string[] {
  return Array.from(
    new Set([
      ...access.scope.scopeRefIds,
      ...access.scope.actorIds,
      ...access.scope.employeeIds,
      ...access.scope.orgUnitIds
    ].map((item) => String(item ?? '').trim()).filter(Boolean))
  );
}

export function canAccessAclResource(access: AssistantEffectiveAccess, resource: AssistantAclResource): boolean {
  const allowedRoles = uniqueStringArray(resource.allowedRoles).map((item) => item.toUpperCase());
  if (allowedRoles.length > 0 && !allowedRoles.includes(access.actor.role.toUpperCase())) {
    return false;
  }

  if (access.actor.role === UserRole.ADMIN || access.scope.type === 'company') {
    return true;
  }

  const resourceScopeType = normalizeScopeType(resource.scopeType, 'company');
  const resourceRefs = uniqueStringArray(resource.scopeRefIds);

  if (resourceScopeType === 'company') {
    return true;
  }

  if (resourceScopeType === 'self') {
    const actorRefs = Array.from(new Set([
      ...access.scope.actorIds,
      ...access.scope.employeeIds
    ].map((item) => String(item ?? '').trim()).filter(Boolean)));
    if (actorRefs.length === 0 || resourceRefs.length === 0) {
      return false;
    }
    return resourceRefs.some((ref) => actorRefs.includes(ref));
  }

  if (resourceRefs.length === 0) {
    return false;
  }

  const accessRefs = resolveAccessReferenceIds(access);
  if (accessRefs.length === 0) {
    return false;
  }

  return resourceRefs.some((ref) => accessRefs.includes(ref));
}

export function isArtifactScopeWithinChannelScope(input: {
  artifactScopeType: string | null | undefined;
  artifactScopeRefIds: unknown;
  channelScopeType: string | null | undefined;
  channelScopeRefIds: unknown;
}): boolean {
  const artifactType = normalizeScopeType(input.artifactScopeType, 'company');
  const channelType = normalizeScopeType(input.channelScopeType, 'company');

  const artifactRefs = uniqueStringArray(input.artifactScopeRefIds);
  const channelRefs = uniqueStringArray(input.channelScopeRefIds);

  if (channelType === 'company') {
    return true;
  }

  if (artifactType === 'company') {
    return false;
  }

  if (channelType === 'self') {
    if (artifactType !== 'self') {
      return false;
    }
    if (artifactRefs.length === 0 || channelRefs.length === 0) {
      return false;
    }
    return artifactRefs.every((ref) => channelRefs.includes(ref));
  }

  if ((channelType === 'branch' || channelType === 'department') && artifactType === 'self') {
    if (artifactRefs.length === 0 || channelRefs.length === 0) {
      return false;
    }
    return artifactRefs.some((ref) => channelRefs.includes(ref));
  }

  if (channelType !== artifactType) {
    return false;
  }

  if (artifactRefs.length === 0 || channelRefs.length === 0) {
    return false;
  }

  return artifactRefs.every((ref) => channelRefs.includes(ref));
}
