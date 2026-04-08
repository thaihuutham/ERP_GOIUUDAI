import { BadRequestException } from '@nestjs/common';
import { PaginationQueryDto, SORT_DIRECTIONS, type SortDirection } from '../dto/pagination-query.dto';

export type ConsistencyMode = 'snapshot' | 'realtime';

export type CursorPageInfo = {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type ListSortMeta = {
  sortBy: string;
  sortDir: SortDirection;
  sortableFields: string[];
  consistency: ConsistencyMode;
};

export type CursorListResponse<T> = {
  items: T[];
  nextCursor: string | null;
  limit: number;
  pageInfo: CursorPageInfo;
  sortMeta: ListSortMeta;
};

export function resolvePageLimit(limit: number | undefined, defaultLimit = 25, maxLimit = 100) {
  if (!Number.isFinite(limit) || !limit || limit <= 0) {
    return defaultLimit;
  }
  return Math.min(Math.max(Math.round(limit), 1), maxLimit);
}

export function resolveSortQuery(
  query: PaginationQueryDto,
  options: {
    sortableFields: readonly string[];
    defaultSortBy: string;
    defaultSortDir?: SortDirection;
    errorLabel?: string;
  }
): { sortBy: string; sortDir: SortDirection; sortableFields: string[] } {
  const sortableFields = Array.from(new Set(options.sortableFields.map((field) => String(field).trim()).filter(Boolean)));
  if (sortableFields.length === 0) {
    throw new BadRequestException('sortableFields must not be empty.');
  }

  const defaultSortBy = String(options.defaultSortBy || '').trim();
  if (!defaultSortBy || !sortableFields.includes(defaultSortBy)) {
    throw new BadRequestException('defaultSortBy must exist in sortableFields.');
  }

  const requestedSortBy = String(query.sortBy ?? '').trim();
  const sortBy = requestedSortBy || defaultSortBy;
  if (!sortableFields.includes(sortBy)) {
    const label = options.errorLabel ? `${options.errorLabel}: ` : '';
    throw new BadRequestException(
      `${label}sortBy '${sortBy}' không hợp lệ. Chỉ hỗ trợ: ${sortableFields.join(', ')}`
    );
  }

  const normalizedSortDir = String(query.sortDir ?? options.defaultSortDir ?? 'desc').toLowerCase();
  if (!SORT_DIRECTIONS.includes(normalizedSortDir as SortDirection)) {
    throw new BadRequestException(`sortDir '${normalizedSortDir}' không hợp lệ. Chỉ hỗ trợ: asc, desc`);
  }

  return {
    sortBy,
    sortDir: normalizedSortDir as SortDirection,
    sortableFields
  };
}

export function sliceCursorItems<T extends { id?: string | number }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last && last.id !== undefined && last.id !== null
    ? String(last.id)
    : null;

  return {
    items,
    hasMore,
    nextCursor
  };
}

export function buildCursorListResponse<T>(
  items: T[],
  options: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
    sortBy: string;
    sortDir: SortDirection;
    sortableFields: string[];
    consistency?: ConsistencyMode;
  }
): CursorListResponse<T> {
  const limit = resolvePageLimit(options.limit);
  const consistency = options.consistency ?? 'realtime';

  return {
    items,
    nextCursor: options.nextCursor,
    limit,
    pageInfo: {
      limit,
      hasMore: options.hasMore,
      nextCursor: options.nextCursor
    },
    sortMeta: {
      sortBy: options.sortBy,
      sortDir: options.sortDir,
      sortableFields: options.sortableFields,
      consistency
    }
  };
}
