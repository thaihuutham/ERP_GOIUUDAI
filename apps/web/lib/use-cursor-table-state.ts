import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiListPageInfo } from './api-client';

type CursorTableState = {
  currentPage: number;
  pageCursors: Record<number, string | null>;
  hasMoreByPage: Record<number, boolean>;
  nextCursorByPage: Record<number, string | null>;
};

function createInitialCursorTableState(): CursorTableState {
  return {
    currentPage: 1,
    pageCursors: {
      1: null
    },
    hasMoreByPage: {},
    nextCursorByPage: {}
  };
}

function normalizePageNumber(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.round(value));
}

function normalizeVisitedPages(pageCursors: Record<number, string | null>) {
  return Object.keys(pageCursors)
    .map((key) => Number(key))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value))
    .sort((left, right) => left - right);
}

export function useCursorTableState(fingerprint: string) {
  const [statesByFingerprint, setStatesByFingerprint] = useState<Record<string, CursorTableState>>({});

  useEffect(() => {
    setStatesByFingerprint((previous) => {
      if (previous[fingerprint]) {
        return previous;
      }
      return {
        ...previous,
        [fingerprint]: createInitialCursorTableState()
      };
    });
  }, [fingerprint]);

  const currentState = statesByFingerprint[fingerprint] ?? createInitialCursorTableState();

  const setCurrentState = useCallback(
    (updater: (previous: CursorTableState) => CursorTableState) => {
      setStatesByFingerprint((previous) => {
        const base = previous[fingerprint] ?? createInitialCursorTableState();
        const next = updater(base);
        if (next === base) {
          return previous;
        }
        return {
          ...previous,
          [fingerprint]: next
        };
      });
    },
    [fingerprint]
  );

  const visitedPages = useMemo(() => normalizeVisitedPages(currentState.pageCursors), [currentState.pageCursors]);
  const currentPage = normalizePageNumber(currentState.currentPage);
  const hasPrevPage = currentPage > 1;
  const hasNextPage = Boolean(
    currentState.hasMoreByPage[currentPage] && currentState.nextCursorByPage[currentPage]
  );
  const cursor = currentState.pageCursors[currentPage] ?? null;

  const syncFromPageInfo = useCallback(
    (pageInfo: ApiListPageInfo | null | undefined) => {
      setCurrentState((previous) => {
        const page = normalizePageNumber(previous.currentPage);
        return {
          ...previous,
          hasMoreByPage: {
            ...previous.hasMoreByPage,
            [page]: Boolean(pageInfo?.hasMore)
          },
          nextCursorByPage: {
            ...previous.nextCursorByPage,
            [page]: typeof pageInfo?.nextCursor === 'string' ? pageInfo.nextCursor : null
          }
        };
      });
    },
    [setCurrentState]
  );

  const goNextPage = useCallback(() => {
    setCurrentState((previous) => {
      const current = normalizePageNumber(previous.currentPage);
      const hasMore = Boolean(previous.hasMoreByPage[current]);
      const nextCursor = previous.nextCursorByPage[current];
      if (!hasMore || !nextCursor) {
        return previous;
      }
      const nextPage = current + 1;
      return {
        ...previous,
        currentPage: nextPage,
        pageCursors:
          previous.pageCursors[nextPage] === undefined
            ? {
                ...previous.pageCursors,
                [nextPage]: nextCursor
              }
            : previous.pageCursors
      };
    });
  }, [setCurrentState]);

  const goPrevPage = useCallback(() => {
    setCurrentState((previous) => {
      const current = normalizePageNumber(previous.currentPage);
      if (current <= 1) {
        return previous;
      }
      return {
        ...previous,
        currentPage: current - 1
      };
    });
  }, [setCurrentState]);

  const jumpVisitedPage = useCallback(
    (page: number) => {
      const normalizedPage = normalizePageNumber(page);
      setCurrentState((previous) => {
        if (previous.pageCursors[normalizedPage] === undefined) {
          return previous;
        }
        return {
          ...previous,
          currentPage: normalizedPage
        };
      });
    },
    [setCurrentState]
  );

  const resetCurrent = useCallback(() => {
    setCurrentState(() => createInitialCursorTableState());
  }, [setCurrentState]);

  return {
    currentPage,
    cursor,
    hasPrevPage,
    hasNextPage,
    visitedPages,
    syncFromPageInfo,
    goNextPage,
    goPrevPage,
    jumpVisitedPage,
    resetCurrent
  };
}
