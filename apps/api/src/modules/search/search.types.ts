import { CustomerCareStatus, GenericStatus } from '@prisma/client';

export const SEARCH_ENTITIES = ['customers', 'orders', 'products'] as const;

export type SearchEntity = (typeof SEARCH_ENTITIES)[number];
export type SearchReindexEntity = SearchEntity | 'all';

export type SearchCustomersFilters = {
  status?: CustomerCareStatus;
  stage?: string;
  tag?: string;
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
