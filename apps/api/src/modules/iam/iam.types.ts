import { PermissionAction } from '@prisma/client';

export type IamActorContext = {
  tenantId: string;
  userId: string;
  role?: string;
  email?: string;
  employeeId?: string;
  positionId?: string;
  orgUnitId?: string;
};

export type IamScopeMode = 'SELF' | 'SUBTREE' | 'UNIT_FULL';

export type IamScopeResolutionSource = 'override' | 'title' | 'default';

export type IamEffectiveScope = {
  mode: IamScopeMode;
  rootOrgUnitId: string | null;
  source: IamScopeResolutionSource;
};

export type IamScopeAccess = {
  mode: IamScopeMode;
  source: IamScopeResolutionSource;
  companyWide: boolean;
  actorIds: string[];
  employeeIds: string[];
  orgUnitIds: string[];
};

export type IamActionDecisionReason = 'ADMIN_BYPASS' | 'DENY_OVERRIDE' | 'ALLOW_MATCH' | 'NO_MATCH';

export type IamActionDecision = {
  allowed: boolean;
  reason: IamActionDecisionReason;
  moduleKey: string;
  action: PermissionAction;
  matchedEffects: Array<'ALLOW' | 'DENY'>;
};
