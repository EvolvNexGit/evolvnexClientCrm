import type { ReactNode } from "react";

type LeadsTabHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
  aside?: ReactNode;
};

export function LeadsTabHeader({ title, description, action, aside }: LeadsTabHeaderProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-primary">LEADS</p>
          <h2 className="enx-page-title mt-2">{title}</h2>
          <p className="enx-helper mt-1">{description}</p>
        </div>
        {aside ?? action}
      </div>
    </section>
  );
}
