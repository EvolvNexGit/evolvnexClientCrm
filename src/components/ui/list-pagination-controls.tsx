"use client";

import { ChevronDown, Loader2, Rows3 } from "lucide-react";
import { LIST_PAGE_MORE, LIST_PAGE_SHOW_ALL_MAX } from "@/lib/list-pagination";

type ListPaginationControlsProps = {
  loadedCount: number;
  totalCount?: number | null;
  hasMore: boolean;
  loading?: boolean;
  onShowMore: () => void;
  onShowAll: () => void;
  itemLabel?: string;
};

export function ListPaginationControls({
  loadedCount,
  totalCount = null,
  hasMore,
  loading = false,
  onShowMore,
  onShowAll,
  itemLabel = "items",
}: ListPaginationControlsProps) {
  if (loadedCount <= 0 && !loading) {
    return null;
  }

  const capped = loadedCount >= LIST_PAGE_SHOW_ALL_MAX;
  const remainingKnown =
    totalCount != null ? Math.max(0, Math.min(totalCount, LIST_PAGE_SHOW_ALL_MAX) - loadedCount) : null;
  const showMoreVisible = hasMore && !capped;
  const showAllVisible = hasMore && !capped;

  if (!showMoreVisible && !showAllVisible && !capped && totalCount == null) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-gradient-to-br from-card to-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        Showing{" "}
        <span className="font-medium text-text">{loadedCount}</span>
        {totalCount != null && (
          <>
            {" "}
            of <span className="font-medium text-text">{Math.min(totalCount, LIST_PAGE_SHOW_ALL_MAX)}</span>
            {totalCount > LIST_PAGE_SHOW_ALL_MAX ? "+" : ""}
          </>
        )}{" "}
        {itemLabel}
        {capped && hasMore && (
          <span className="ml-1 text-xs text-amber-300">(capped at {LIST_PAGE_SHOW_ALL_MAX})</span>
        )}
      </div>

      {(showMoreVisible || showAllVisible) && (
        <div className="flex flex-wrap items-center gap-2">
          {showMoreVisible && (
            <button
              type="button"
              onClick={onShowMore}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-text transition hover:border-primary/40 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
              Show more
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                +{remainingKnown != null ? Math.min(LIST_PAGE_MORE, remainingKnown) : LIST_PAGE_MORE}
              </span>
            </button>
          )}

          {showAllVisible && (
            <button
              type="button"
              onClick={onShowAll}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rows3 className="h-4 w-4" />}
              Show all
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
                max {LIST_PAGE_SHOW_ALL_MAX}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
