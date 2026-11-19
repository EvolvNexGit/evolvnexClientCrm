"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { DataState } from "@/components/dashboard/billing/data-state";
import {
  PACKAGE_STATUS_LABEL,
  PackageDetailDrawer,
} from "@/components/dashboard/packages/package-detail-drawer";
import { SellPackageModal } from "@/components/dashboard/packages/sell-package-modal";
import { useClientSettings } from "@/hooks/use-client-settings";
import { usePackages } from "@/hooks/use-packages";
import { zonedNow } from "@/lib/appointment-reminder-window";
import { derivePackageDisplayStatus, summarizePackageCredit } from "@/lib/package-ledger";
import { DEFAULT_PACKAGE_LABELS, PACKAGE_LIMITS, formatPackageMoney } from "@/lib/package-types";
import { cn } from "@/lib/utils";

type PackageFilter = "active" | "completed" | "all";

const FILTERS: Array<{ key: PackageFilter; label: string }> = [
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
];

/** Packages tab: list sold packages with remaining credit, sell a package, open one package's sessions. */
export default function PackagesTab({ clientId }: { clientId: string }) {
  const labels = DEFAULT_PACKAGE_LABELS;
  const scheduling = useClientSettings(clientId, "scheduling", { enabled: Boolean(clientId) });
  const today = zonedNow(new Date(), scheduling.value.timezone).date;
  const packagesState = usePackages(clientId, { enabled: Boolean(clientId) });
  const [filter, setFilter] = useState<PackageFilter>("active");
  const [search, setSearch] = useState("");
  const [sellOpen, setSellOpen] = useState(false);
  const [openPackageId, setOpenPackageId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      packagesState.packages.map((pkg) => ({
        pkg,
        credit: summarizePackageCredit(pkg.sessions_total, pkg.sessions),
        displayStatus: derivePackageDisplayStatus(pkg, today),
      })),
    [packagesState.packages, today],
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(({ pkg, displayStatus }) => {
      if (filter === "active" && displayStatus !== "active" && displayStatus !== "expired") {
        return false;
      }
      if (filter === "completed" && displayStatus !== "completed") {
        return false;
      }
      if (!query) {
        return true;
      }
      return `${pkg.customerName ?? ""} ${pkg.customerPhone ?? ""} ${pkg.name_snapshot}`.toLowerCase().includes(query);
    });
  }, [filter, rows, search]);

  const capReached = packagesState.packages.length >= PACKAGE_LIMITS.listMax;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 text-text sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">{labels.packages}</h2>
          <p className="text-sm text-muted-foreground">
            Sell {labels.packages.toLowerCase()} of {labels.sessions.toLowerCase()}, link them to appointments, and track
            what is left.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSellOpen(true)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Sell {labels.package.toLowerCase()}
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div role="group" aria-label="Filter" className="inline-flex overflow-hidden rounded-2xl border border-border bg-background">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
              className={cn(
                "min-h-11 flex-1 px-4 text-sm font-semibold transition sm:flex-none",
                filter === option.key ? "bg-primary/10 text-text" : "text-muted-foreground hover:bg-muted hover:text-text",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={`Search ${labels.packages.toLowerCase()}`}
            placeholder="Search by customer, phone or name"
            className="min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-muted-foreground sm:text-sm"
          />
        </div>
      </div>

      <DataState
        loading={packagesState.loading && packagesState.packages.length === 0}
        error={packagesState.error}
        empty={visibleRows.length === 0}
        emptyLabel={
          packagesState.packages.length === 0
            ? `No ${labels.packages.toLowerCase()} sold yet. Use "Sell ${labels.package.toLowerCase()}" to add the first one.`
            : `No ${labels.packages.toLowerCase()} match this filter.`
        }
      />

      {visibleRows.length > 0 && !packagesState.error && (
        <ul className="grid gap-3 md:grid-cols-2">
          {visibleRows.map(({ pkg, credit, displayStatus }) => (
            <li key={pkg.id}>
              <button
                type="button"
                onClick={() => setOpenPackageId(pkg.id)}
                className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-background p-4 text-left transition hover:border-primary/40"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-text">{pkg.customerName ?? "Customer"}</div>
                    <div className="truncate text-sm text-muted-foreground">{pkg.name_snapshot}</div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                      displayStatus === "active" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
                      displayStatus === "expired" && "border-amber-500/40 bg-amber-500/10 text-amber-600",
                      (displayStatus === "completed" || displayStatus === "cancelled") &&
                        "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {PACKAGE_STATUS_LABEL[displayStatus]}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    <span className="font-semibold text-text">{credit.remaining}</span> of {credit.total}{" "}
                    {labels.sessions.toLowerCase()} left
                  </span>
                  {credit.held > 0 ? <span>{credit.held} booked</span> : null}
                  <span>{pkg.valid_until ? `Valid until ${pkg.valid_until}` : "No expiry"}</span>
                  <span>{formatPackageMoney(pkg.price_total)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${credit.total > 0 ? Math.min(100, (credit.consumed / credit.total) * 100) : 0}%` }}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {capReached && (
        <p className="text-xs text-muted-foreground">
          Showing the newest {PACKAGE_LIMITS.listMax} {labels.packages.toLowerCase()}.
        </p>
      )}

      <SellPackageModal
        open={sellOpen}
        clientId={clientId}
        labels={labels}
        today={today}
        saving={packagesState.saving}
        onClose={() => setSellOpen(false)}
        onSell={packagesState.sell}
      />

      <PackageDetailDrawer
        clientId={clientId}
        packageId={openPackageId}
        labels={labels}
        today={today}
        onClose={() => setOpenPackageId(null)}
      />
    </section>
  );
}
