"use client";

type DataStateProps = {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyLabel: string;
};

export function DataState({ loading, error, empty, emptyLabel }: DataStateProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Loading data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-primary/50 bg-primary/10 p-5 text-sm text-primary">
        {error}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return null;
}
