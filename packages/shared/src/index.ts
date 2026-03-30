export type TenantScopedEntity = {
  id: string;
  tenant_Id: string;
  createdAt: Date;
  updatedAt: Date;
};

export const ERP_MODULES = [
  'crm',
  'sales',
  'catalog',
  'hr',
  'finance',
  'scm',
  'assets',
  'projects',
  'workflows',
  'reports',
  'settings',
  'notifications'
] as const;

export type ErpModule = (typeof ERP_MODULES)[number];

export const DEFAULT_PAGE_SIZE = 50;
