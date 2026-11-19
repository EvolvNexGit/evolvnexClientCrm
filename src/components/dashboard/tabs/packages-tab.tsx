"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Plus, Search } from "lucide-react";
import { DataState } from "@/components/dashboard/billing/data-state";
import {
  MissedSessionDialog,
  type MissedSessionTarget,
} from "@/components/dashboard/packages/missed-session-dialog";
import {
  PACKAGE_STATUS_LABEL,
  PackageDetailDrawer,
} from "@/components/dashboard/packages/package-detail-drawer";
import { PackageSettingsSection } from "@/components/dashboard/packages/package-settings-section";
import { SellPackageModal } from "@/components/dashboard/packages/sell-package-modal";
import { useClientSettings } from "@/hooks/use-client-settings";
import { usePackageDecisionActions, usePackages, usePendingDecisions } from "@/hooks/use-packages";
import { zonedNow } from "@/lib/appointment-reminder-window";
import { derivePackageDisplayStatus, summarizePackageCredit } from "@/lib/package-ledger";
import {
  PACKAGE_LIMITS,
  formatPackageMoney,
  type PackageSessionRecord,
  type PendingDecisionRecord,
} from "@/lib/package-types";
import { formatSupabaseError } from "@/lib/supabase";
import { formatAppointmentTimeRange } from "@/lib/time-utils";
import { cn } from "@/lib/utils";

type PackageFilter = "active" | "needs-decision" | "completed" | "all";

function toTarget(
  session: PackageSessionRecord,
  packageName: string,
  customerName: string | null,
  reason: MissedSessionTarget["reason"] = session.missed_reason,
): MissedSessionTarget {
  return {
    sessionId: session.id,
    packageName,
    customerName,
    appointmentDate: session.appointmentDate,
    reason,
  };
}

/** Packages tab: sold packages with remaining credit, Needs decision queue, sell, detail and clinic settings. */
export default function PackagesTab({ clientId }: { clientId: string }) {
  const scheduling = useClientSettings(clientId, "scheduling", { enabled: Boolean(clientId) });
  const packageSettings = useClientSettings(clientId, "packages", { enabled: Boolean(clientId) });
  const labels = packageSettings.value.labels;
  const today = zonedNow(new Date(), scheduling.value.timezone).date;

  const packagesState = usePackages(clientId, { enabled: Boolean(clientId) });
  const pendingState = usePendingDecisions(clientId, { enabled: Boolean(clientId) });
  const decisions = usePackageDecisionActions(clientId);

  const [filter, setFilter] = useState<PackageFilter>("active");
  const [search, setSearch] = useState("");
  const [sellOpen, setSellOpen] = useState(false);
  const [openPackageId, setOpenPackageId] = useState<string | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<MissedSessionTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      packagesState.packages.map((pkg) => ({
        pkg,
        credit: summarizePackageCredit(pkg.sessions_total, pkg.sessions),
        displayStatus: derivePackageDisplayStatus(pkg, today),
      })),
    [packagesState.packages, today],
  );

  const query = search.trim().toLowerCase();

  const visibleRows = useMemo(
    () =>
      rows.filter(({ pkg, displayStatus }) => {
        if (filter === "active" && displayStatus !== "active" && displayStatus !== "expired") {
          return false;
        }
        if (filter === "completed" && displayStatus !== "completed") {
          return false;
        }
        return !query || `${pkg.customerName ?? ""} ${pkg.customerPhone ?? ""} ${pkg.name_snapshot}`.toLowerCase().includes(query);
      }),
    [filter, query, rows],
  );

  const visiblePending = useMemo(
    () =>
      pendingState.pending.filter(
        (item) => !query || `${item.customerName ?? ""} ${item.packageName}`.toLowerCase().includes(query),
      ),
    [pendingState.pending, query],
  );

  const capReached = packagesState.packages.length >= PACKAGE_LIMITS.listMax;
  const filters: Array<{ key: PackageFilter; label: string; count?: number }> = [
    { key: "active", label: "Active" },
    { key: "needs-decision", label: "Needs decision", count: pendingState.count },
    { key: "completed", label: "Completed" },
    { key: "all", label: "All" },
  ];

  async function handleMarkMissed(session: PackageSessionRecord, packageName: string, customerName: string | null) {
    try {
      setActionError(null);
      await decisions.markMissed(session.id);
      // Prompted every time: the decision follows immediately; dismissing leaves it under Needs decision.
      setDecisionTarget(toTarget(session, packageName, customerName, "no_show"));
    } catch (markError) {
      setActionError(formatSupabaseError(markError, "Unable to mark the session missed."));
    }
  }

  async function handleResolve(sessionId: string, resolution: "rollover" | "forfeit", note: string | null) {
    await decisions.resolve(sessionId, resolution, note);
    setDecisionTarget(null);
  }

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

      {pendingState.count > 0 && filter !== "needs-decision" && (
        <button
          type="button"
          onClick={() => setFilter("needs-decision")}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {pendingState.count} missed {pendingState.count === 1 ? labels.session.toLowerCase() : labels.sessions.toLowerCase()}{" "}
          need a decision.
        </button>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div role="group" aria-label="Filter" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-background sm:inline-flex">
          {filters.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold transition",
                filter === option.key ? "bg-primary/10 text-text" : "text-muted-foreground hover:bg-muted hover:text-text",
              )}
            >
              {option.label}
              {option.count ? (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">{option.count}</span>
              ) : null}
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

      {actionError && <p className="text-sm text-rose-400">{actionError}</p>}

      {filter === "needs-decision" ? (
        <>
          <DataState
            loading={pendingState.loading && pendingState.pending.length === 0}
            error={pendingState.error}
            empty={visiblePending.length === 0}
            emptyLabel={`No missed ${labels.sessions.toLowerCase()} waiting for a decision.`}
          />
          {visiblePending.length > 0 && !pendingState.error && (
            <ul className="space-y-2">
              {visiblePending.map((item: PendingDecisionRecord) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 text-sm">
                    <div className="truncate font-semibold text-text">{item.customerName ?? "Customer"}</div>
                    <div className="text-muted-foreground">
                      {item.packageName} · {item.appointmentDate ?? "No date"}{" "}
                      {item.appointmentStartTime ? formatAppointmentTimeRange(item.appointmentDate, item.appointmentStartTime) : ""}
                      {" · "}
                      {item.missed_reason === "no_show" ? "Marked missed" : "Cancelled"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenPackageId(item.package_id)}
                      className="min-h-11 flex-1 rounded-xl border border-border px-3 text-sm text-text hover:bg-muted sm:flex-none"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecisionTarget(toTarget(item, item.packageName, item.customerName))}
                      className="min-h-11 flex-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 text-sm font-medium text-amber-700 hover:bg-amber-500/20 sm:flex-none"
                    >
                      Decide
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
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
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs font-medium",
                            displayStatus === "active" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
                            displayStatus === "expired" && "border-amber-500/40 bg-amber-500/10 text-amber-600",
                            (displayStatus === "completed" || displayStatus === "cancelled") &&
                              "border-border bg-muted text-muted-foreground",
                          )}
                        >
                          {PACKAGE_STATUS_LABEL[displayStatus]}
                        </span>
                        {credit.missedPending > 0 ? (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Needs decision
                          </span>
                        ) : null}
                      </div>
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
        </>
      )}

      <PackageSettingsSection
        value={packageSettings.value}
        loading={packageSettings.loading}
        saving={packageSettings.saving}
        loadError={packageSettings.error}
        onSave={packageSettings.save}
      />

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
        onDecide={(session, packageName, customerName) => setDecisionTarget(toTarget(session, packageName, customerName))}
        onMarkMissed={(session, packageName, customerName) => void handleMarkMissed(session, packageName, customerName)}
      />

      <MissedSessionDialog
        target={decisionTarget}
        settings={packageSettings.value}
        saving={decisions.saving}
        onResolve={handleResolve}
        onDismiss={() => setDecisionTarget(null)}
      />
    </section>
  );
}
