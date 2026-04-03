import { PermissionAction, UserRole } from '@prisma/client';

export type AssistantScopeType = 'company' | 'branch' | 'department' | 'self';

export type AssistantScope = {
  type: AssistantScopeType;
  orgUnitIds: string[];
  employeeIds: string[];
  actorIds: string[];
  scopeRefIds: string[];
};

export type AssistantModuleActions = Record<string, PermissionAction[]>;

export type AssistantEffectiveAccess = {
  actor: {
    userId: string;
    email: string;
    role: UserRole;
    tenantId: string;
    employeeId: string;
    positionId: string;
  };
  scope: AssistantScope;
  allowedModules: string[];
  moduleActions: AssistantModuleActions;
  policy: {
    enforcePermissionEngine: boolean;
    denyIfNoScope: boolean;
    chatChannelScopeEnforced: boolean;
  };
};
