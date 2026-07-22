export const LIST_PAGE_INITIAL = 12;
export const LIST_PAGE_MORE = 10;
export const LIST_PAGE_SHOW_ALL_MAX = 200;

export type ListPageParams = {
  limit: number;
  offset: number;
  search?: string;
};

export type ListPageResult<T> = {
  items: T[];
  hasMore: boolean;
  /** Exact/estimated total matching the current filters, when available. */
  totalCount: number | null;
};

export function buildListRange(offset: number, limit: number) {
  const from = Math.max(0, offset);
  const to = from + Math.max(1, limit) - 1;
  return { from, to };
}

export function sanitizeSearch(search?: string) {
  const trimmed = (search ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Build a PostgREST `or(...)` clause for case-insensitive contains matching. */
export function buildIlikeOrFilter(columns: string[], search: string) {
  const safe = search.replace(/[%_,()"]/g, " ").trim();
  if (!safe || columns.length === 0) {
    return null;
  }

  const pattern = `"%${safe}%"`;
  return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
}

export function nextPageLimit(currentCount: number, mode: "more" | "all") {
  if (mode === "all") {
    return Math.max(0, LIST_PAGE_SHOW_ALL_MAX - currentCount);
  }

  return LIST_PAGE_MORE;
}

export function canShowMore(loadedCount: number, hasMore: boolean) {
  return hasMore && loadedCount < LIST_PAGE_SHOW_ALL_MAX;
}

export function canShowAll(loadedCount: number, hasMore: boolean) {
  return hasMore && loadedCount < LIST_PAGE_SHOW_ALL_MAX;
}
