"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LIST_PAGE_INITIAL,
  LIST_PAGE_MORE,
  LIST_PAGE_SHOW_ALL_MAX,
  type ListPageResult,
} from "@/lib/list-pagination";

type FetchPageArgs = {
  limit: number;
  offset: number;
};

type UsePagedListOptions<T> = {
  /** Re-run from page 1 when this key changes (search/filters). */
  resetKey: string;
  fetchPage: (args: FetchPageArgs) => Promise<ListPageResult<T>>;
  enabled?: boolean;
};

/**
 * Paginated list loader. `fetchPage` may be an inline lambda — it is stored in a ref so
 * identity changes do not retrigger loads (that previously caused infinite flicker).
 */
export function usePagedList<T>({ resetKey, fetchPage, enabled = true }: UsePagedListOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const requestIdRef = useRef(0);
  const fetchPageRef = useRef(fetchPage);
  const enabledRef = useRef(enabled);
  const resetKeyRef = useRef(resetKey);
  const itemsLengthRef = useRef(0);
  const loadedKeyRef = useRef<string | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);

  fetchPageRef.current = fetchPage;
  enabledRef.current = enabled;
  resetKeyRef.current = resetKey;
  itemsLengthRef.current = items.length;

  const loadInitial = useCallback(async (options?: { force?: boolean }) => {
    const key = resetKeyRef.current;
    const isEnabled = enabledRef.current;

    if (!isEnabled) {
      requestIdRef.current += 1;
      inFlightKeyRef.current = null;
      loadedKeyRef.current = key;
      setItems([]);
      setHasMore(false);
      setTotalCount(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Skip duplicate loads for the same filter key (stops re-render loops).
    if (!options?.force) {
      if (inFlightKeyRef.current === key) {
        return;
      }
      if (loadedKeyRef.current === key && itemsLengthRef.current > 0) {
        setLoading(false);
        return;
      }
    }

    const requestId = ++requestIdRef.current;
    inFlightKeyRef.current = key;

    // Only blank the UI on the first load for a key — never hide existing rows on refresh.
    if (itemsLengthRef.current === 0) {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await fetchPageRef.current({ limit: LIST_PAGE_INITIAL, offset: 0 });
      if (requestId !== requestIdRef.current) {
        return;
      }

      setItems(result.items);
      setHasMore(result.hasMore && result.items.length < LIST_PAGE_SHOW_ALL_MAX);
      setTotalCount(result.totalCount);
      loadedKeyRef.current = key;
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setItems([]);
      setHasMore(false);
      setTotalCount(null);
      setError(loadError instanceof Error ? loadError.message : "Unable to load list.");
      loadedKeyRef.current = key;
    } finally {
      if (inFlightKeyRef.current === key) {
        inFlightKeyRef.current = null;
      }
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial, resetKey, enabled]);

  const showMore = useCallback(async () => {
    if (!enabledRef.current || loadingMore || !hasMore) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoadingMore(true);
    setError(null);

    try {
      const remaining = LIST_PAGE_SHOW_ALL_MAX - itemsLengthRef.current;
      const limit = Math.min(LIST_PAGE_MORE, remaining);
      if (limit <= 0) {
        setHasMore(false);
        return;
      }

      const offset = itemsLengthRef.current;
      const result = await fetchPageRef.current({ limit, offset });
      if (requestId !== requestIdRef.current) {
        return;
      }

      setItems((current) => {
        const merged = [...current, ...result.items];
        setHasMore(result.hasMore && merged.length < LIST_PAGE_SHOW_ALL_MAX);
        return merged.slice(0, LIST_PAGE_SHOW_ALL_MAX);
      });
      setTotalCount(result.totalCount);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : "Unable to load more.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingMore(false);
      }
    }
  }, [hasMore, loadingMore]);

  const showAll = useCallback(async () => {
    if (!enabledRef.current || loadingMore || !hasMore) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoadingMore(true);
    setError(null);

    try {
      const remaining = LIST_PAGE_SHOW_ALL_MAX - itemsLengthRef.current;
      if (remaining <= 0) {
        setHasMore(false);
        return;
      }

      const offset = itemsLengthRef.current;
      const result = await fetchPageRef.current({ limit: remaining, offset });
      if (requestId !== requestIdRef.current) {
        return;
      }

      setItems((current) => {
        const merged = [...current, ...result.items];
        setHasMore(result.hasMore && merged.length < LIST_PAGE_SHOW_ALL_MAX);
        return merged.slice(0, LIST_PAGE_SHOW_ALL_MAX);
      });
      setTotalCount(result.totalCount);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : "Unable to load all items.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingMore(false);
      }
    }
  }, [hasMore, loadingMore]);

  const refresh = useCallback(async () => {
    await loadInitial({ force: true });
  }, [loadInitial]);

  return {
    items,
    setItems,
    loading,
    loadingMore,
    error,
    setError,
    hasMore,
    totalCount,
    refresh,
    showMore,
    showAll,
  };
}
