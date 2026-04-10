import { CustomerCareStatus, GenericStatus } from '@prisma/client';

export const SEARCH_ENTITIES = ['customers', 'orders', 'products', 'invoices'] as const;
export const FEDERATED_SEARCH_ENTITIES = [
  'customers',
  'orders',
  'invoices',
  'products',
  'employees',
  'projects',
  'purchaseOrders',
  'workflowTasks',
  'reports'
] as const;

export type SearchEntity = (typeof SEARCH_ENTITIES)[number];
export type FederatedSearchEntity = (typeof FEDERATED_SEARCH_ENTITIES)[number];
export type SearchReindexEntity = SearchEntity | 'all';

export type SearchCustomersFilters = {
  status?: CustomerCareStatus;
  stage?: string;
  tag?: string;
};

export type SearchInvoicesFilters = {
  status?: GenericStatus;
};

export type SearchOrdersFilters = {
  status?: GenericStatus;
};

export type SearchProductsFilters = {
  status?: GenericStatus;
  includeArchived?: boolean;
};

export type SearchIndexStats = {
  numberOfDocuments: number;
  isIndexing: boolean;
};

export type SearchStatusResponse = {
  engine: string;
  hybridEnabled: boolean;
  writeSyncEnabled: boolean;
  meiliConfigured: boolean;
  meiliHost: string | null;
  indexPrefix: string;
  timeoutMs: number;
  healthy: boolean;
  error?: string;
  checkedAt: string;
  indexes: Partial<Record<SearchEntity, SearchIndexStats>>;
};

export type SearchReindexItemResult = {
  entity: SearchEntity;
  indexedCount: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

export type SearchReindexResult = {
  entity: SearchReindexEntity;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  results: SearchReindexItemResult[];
};

export type FederatedSearchResultItem = {
  id: string;
  title: string;
  snippet: string;
  status?: string | null;
  meta?: string | null;
  target: string;
};

export type FederatedSearchResultGroup = {
  entity: FederatedSearchEntity;
  label: string;
  icon: string;
  count: number;
  items: FederatedSearchResultItem[];
};

export type FederatedSearchResponse = {
  query: string;
  total: number;
  limitPerGroup: number;
  generatedAt: string;
  groups: FederatedSearchResultGroup[];
};
