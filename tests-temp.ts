export interface PositionForm {
  title: string;
  code: string;
  level: string;
  status: string;
}

export interface IamScopeOverrideForm {
  scopeMode: string;
  rootOrgUnitId: string;
  reason: string;
}

export interface IamTitleScopeForm {
  titlePattern: string;
  scopeMode: string;
  priority: number;
  reason: string;
}

export interface IamMismatchFilter {
  moduleKey: string;
  action: string;
  limit: number;
}
