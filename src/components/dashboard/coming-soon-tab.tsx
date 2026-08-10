"use client";

import { Sparkles } from "lucide-react";

export default function ComingSoonTab({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-16 text-center">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
        <Sparkles className="h-5 w-5" />
      </div>
      <h1 className="text-2xl font-semibold text-text">{title}</h1>
      <p className="mt-2 max-w-md text-base text-muted-foreground">
        {description ?? "This area is coming soon. Navigation is ready — functionality will be added later."}
      </p>
      <span className="mt-6 inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-sm font-medium text-muted-foreground">
        Coming Soon
      </span>
    </section>
  );
}
