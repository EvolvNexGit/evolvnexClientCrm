import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const XL_COLS: Record<2 | 3 | 4 | 5, string> = {
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
};

/** 2-up on mobile, 3-up on tablet, desktop column count preserved. */
export function ResponsiveKpiGrid({
  children,
  desktopCols = 4,
  className,
}: {
  children: ReactNode;
  desktopCols?: 2 | 3 | 4 | 5;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4", XL_COLS[desktopCols], className)}>
      {children}
    </div>
  );
}

/** Cards below xl; desktop table from xl. */
export function ResponsiveRecordList({
  cards,
  table,
}: {
  cards: ReactNode;
  table: ReactNode;
}) {
  return (
    <>
      <div className="min-w-0 space-y-3 xl:hidden">{cards}</div>
      <div className="hidden min-w-0 xl:block">{table}</div>
    </>
  );
}

/** Horizontal scroll stays inside this box — never the page. */
export function ResponsiveTableScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-border", className)}>
      {children}
    </div>
  );
}

export function ResponsivePageToolbar({
  search,
  actions,
  filters,
}: {
  search?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {search ? <div className="min-w-0 w-full">{search}</div> : null}
      {filters ? <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap">{filters}</div> : null}
      {actions ? (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}

export function RecordCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={cn("min-w-0 rounded-2xl border border-border bg-background p-4", className)}>
      {children}
    </article>
  );
}
