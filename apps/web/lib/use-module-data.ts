import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  apiRequest,
  normalizePagedListPayload,
  type ApiListPageInfo,
  type ApiListSortMeta
} from './api-client';
import { useCursorTableState } from './use-cursor-table-state';

/**
 * Shared hook for module-level data operations: load, search, filter, paginate, sort.
 * 
 * This replaces the duplicated pattern across all board components where each one
 * independently manages rows/loading/error/search/filter/sort/pagination states.
 *
 * Usage:
 *   const data = useModuleData({ endpoint: '/customers', pageSize: 25 });
 *   data.setSearch('keyword');
 *   data.loadData();
 */

export type FilterSpec = {
  key: string;
  queryParam?: string;
  defaultValue?: string | number | boolean;
  includeInQuery?: boolean;
};

export type UseModuleDataOptions = {
  /** API endpoint to fetch data from */
  endpoint: string | null;
  /** Filters configuration */
  filters?: FilterSpec[];
  /** Page size for pagination */
  pageSize?: number;
  /** Whether to auto-load data on mount */
  autoLoad?: boolean;
};

export type UseModuleDataReturn = {
  rows: Record<string, unknown>[];
  isLoading: boolean;
  errorMessage: string | null;
  search: string;
  setSearch: (value: string) => void;
  filterValues: Record<string, string | number | boolean>;
  setFilterValue: (key: string, value: string | number | boolean) => void;
  resetFilters: () => void;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  setSortBy: (key: string) => void;
  setSortDir: (dir: 'asc' | 'desc') => void;
  pageInfo: ApiListPageInfo | null;
  sortMeta: ApiListSortMeta | null;
  pager: ReturnType<typeof useCursorTableState>;
  loadData: () => Promise<void>;
  reload: () => Promise<void>;
};

function createDefaultFilterValues(filters: FilterSpec[]): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const filter of filters) {
    result[filter.key] = filter.defaultValue ?? '';
  }
  return result;
}

export function useModuleData({
  endpoint,
  filters = [],
  pageSize = 25,
  autoLoad = true,
}: UseModuleDataOptions): UseModuleDataReturn {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string | number | boolean>>(
    () => createDefaultFilterValues(filters)
  );
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pageInfo, setPageInfo] = useState<ApiListPageInfo | null>(null);
  const [sortMeta, setSortMeta] = useState<ApiListSortMeta | null>(null);

  const tableFingerprint = useMemo(
    () =>
      JSON.stringify({
        endpoint,
        search: search.trim(),
        filters: filterValues,
        sortBy,
        sortDir,
        limit: pageSize,
      }),
    [endpoint, filterValues, search, pageSize, sortBy, sortDir]
  );

  const pager = useCursorTableState(tableFingerprint);

  const loadData = useCallback(async () => {
    if (!endpoint) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const query: Record<string, string | number | boolean> = {};
      const keyword = search.trim();
      if (keyword) {
        query.q = keyword;
      }

      for (const filter of filters) {
        const value = filterValues[filter.key];
        if (value === undefined || value === null || value === '') continue;
        if (typeof value === 'boolean' && value === false && !filter.includeInQuery) continue;
        const queryKey = filter.queryParam ?? filter.key;
        query[queryKey] = value;
      }

      query.limit = pageSize;
      if (pager.cursor) {
        query.cursor = pager.cursor;
      }
      if (sortBy) {
        query.sortBy = sortBy;
        query.sortDir = sortDir;
      }

      const payload = await apiRequest(endpoint, { query });
      const normalized = normalizePagedListPayload(payload);
      setRows(normalized.items);
      setPageInfo(normalized.pageInfo);
      setSortMeta(normalized.sortMeta);
      pager.syncFromPageInfo(normalized.pageInfo);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, filters, filterValues, pageSize, pager, search, sortBy, sortDir]);

  const reload = useCallback(async () => {
    pager.resetCurrent();
    await loadData();
  }, [loadData, pager]);

  const setFilterValue = useCallback(
    (key: string, value: string | number | boolean) => {
      setFilterValues((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const resetFilters = useCallback(() => {
    setSearch('');
    setFilterValues(createDefaultFilterValues(filters));
  }, [filters]);

  // Auto-load on mount if configured
  useEffect(() => {
    if (autoLoad && endpoint) {
      void loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, autoLoad]);

  return {
    rows,
    isLoading,
    errorMessage,
    search,
    setSearch,
    filterValues,
    setFilterValue,
    resetFilters,
    sortBy,
    sortDir,
    setSortBy,
    setSortDir,
    pageInfo,
    sortMeta,
    pager,
    loadData,
    reload,
  };
}
