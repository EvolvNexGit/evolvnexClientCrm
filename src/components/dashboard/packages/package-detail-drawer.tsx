"use client";

import { useState } from "react";
import { Link2, Loader2, Unlink } from "lucide-react";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { CancelPackageControl } from "@/components/dashboard/packages/cancel-package-control";
import { PackagePaymentsSection } from "@/components/dashboard/packages/package-payments-section";
import { usePackageDetail } from "@/hooks/use-packages";
import { derivePackageDisplayStatus, summarizePackageCredit } from "@/lib/package-ledger";
import { fetchLinkableAppointments } from "@/lib/package-queries";
import {
  PACKAGE_PLAN_LABEL,
  formatPackageMoney,
  formatSessionCount,
  type PackageDisplayStatus,
  type PackageLabels,
  type PackageSessionRecord,
  type PackageSessionStatus,
} from "@/lib/package-types";
import { formatSupabaseError } from "@/lib/supabase";
import { formatAppointmentTimeRange } from "@/lib/time-utils";
import { cn } from "@/lib/utils";

export const SESSION_STATUS_LABEL: Record<PackageSessionStatus, string> = {
  scheduled: "Booked",
  completed: "Used",
  missed_pending: "Needs decision",
  rolled_over: "Rolled over",
  forfeited: "Forfeited",
  voided: "Removed",
};

export const SESSION_STATUS_TONE: Record<PackageSessionStatus, string> = {
  scheduled: "border-blue-500/30 bg-blue-500/10 text-blue-600",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  missed_pending: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  rolled_over: "border-border bg-muted text-muted-foreground",
  forfeited: "border-rose-500/30 bg-rose-500/10 text-rose-600",
  voided: "border-border bg-background text-muted-foreground",
};

export const PACKAGE_STATUS_LABEL: Record<PackageDisplayStatus, string> = {
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

type LinkableAppointment = Awaited<ReturnType<typeof fetchLinkableAppointments>>[number];

export function PackageDetailDrawer({
  clientId,
  packageId,
  labels,
  today,
  onClose,
  onDecide,
  onMarkMissed,
}: {
  clientId: string;
  packageId: string | null;
  labels: PackageLabels;
  today: string;
  onClose: () => void;
  /** Opens the missed-session decision dialog for an undecided session. */
  onDecide?: (session: PackageSessionRecord, packageName: string, customerName: string | null) => void;
  /** Marks an overdue scheduled session as missed (opens the decision afterwards). */
  onMarkMissed?: (session: PackageSessionRecord, packageName: string, customerName: string | null) => void;
}) {
  const detail = usePackageDetail(clientId, packageId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [linkable, setLinkable] = useState<LinkableAppointment[] | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  const pkg = detail.pkg;
  const credit = pkg ? summarizePackageCredit(pkg.sessions_total, pkg.sessions) : null;
  const displayStatus = pkg ? derivePackageDisplayStatus(pkg, today) : null;
  const linkedAppointmentIds = new Set(
    (pkg?.sessions ?? []).filter((session) => session.status !== "voided").map((session) => session.appointment_id),
  );
  const canLink = Boolean(pkg && displayStatus === "active" && credit && credit.remaining > 0);

  async function runSessionAction(sessionId: string, action: () => Promise<unknown>) {
    if (busySessionId) {
      return;
    }
    try {
      setBusySessionId(sessionId);
      setActionError(null);
      await action();
    } catch (failure) {
      setActionError(formatSupabaseError(failure, "Unable to update the session."));
    } finally {
      setBusySessionId(null);
    }
  }

  async function loadLinkable() {
    if (!pkg) {
      return;
    }
    try {
      setLinkLoading(true);
      setActionError(null);
      setLinkable(await fetchLinkableAppointments(clientId, pkg.customerPhone));
    } catch (loadError) {
      setActionError(formatSupabaseError(loadError, "Unable to load appointments."));
    } finally {
      setLinkLoading(false);
    }
  }

  function handleClose() {
    setLinkable(null);
    setActionError(null);
    onClose();
  }

  return (
    <EntityModal
      open={Boolean(packageId)}
      title={pkg ? pkg.name_snapshot : labels.package}
      onClose={handleClose}
      contentClassName="sm:max-w-2xl"
    >
      <div className="space-y-4">
        <DataState
          loading={detail.loading && !pkg}
          error={pkg ? null : detail.error}
          empty={false}
          emptyLabel=""
        />

        {pkg && credit && displayStatus && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-text">{pkg.customerName ?? "Customer"}</span>
              {pkg.customerPhone ? <span>{pkg.customerPhone}</span> : null}
              <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                {PACKAGE_STATUS_LABEL[displayStatus]}
              </span>
              <span>{pkg.valid_until ? `Valid until ${pkg.valid_until}` : "No expiry"}</span>
              <span>
                {PACKAGE_PLAN_LABEL[pkg.payment_plan]}{" "}
                {pkg.payment_plan === "per_visit"
                  ? `${formatPackageMoney(pkg.price_per_session)} per ${labels.session.toLowerCase()}`
                  : formatPackageMoney(pkg.price_total)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Total", value: credit.total },
                { label: "Used", value: credit.consumed },
                { label: "Booked", value: credit.held },
                { label: "Left", value: pkg.status === "cancelled" ? 0 : credit.remaining },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-border bg-background p-3">
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="text-lg font-semibold text-text">{item.value}</div>
                </div>
              ))}
            </div>

            {actionError && <p className="text-sm text-rose-400">{actionError}</p>}

            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-text">{labels.sessions}</h4>
              {pkg.sessions.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                  No {labels.sessions.toLowerCase()} yet. Book an appointment and choose this {labels.package.toLowerCase()},
                  or link an existing appointment below.
                </p>
              ) : (
                <ul className="space-y-2">
                  {pkg.sessions.map((session) => {
                    const overdue =
                      session.status === "scheduled" && session.appointmentDate !== null && session.appointmentDate < today;
                    const busy = busySessionId === session.id;
                    return (
                      <li
                        key={session.id}
                        className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 space-y-1 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-xs font-medium",
                                SESSION_STATUS_TONE[session.status],
                              )}
                            >
                              {SESSION_STATUS_LABEL[session.status]}
                            </span>
                            <span className="text-text">
                              {session.appointmentDate ?? "No appointment"}{" "}
                              {session.appointmentStartTime
                                ? formatAppointmentTimeRange(session.appointmentDate, session.appointmentStartTime)
                                : ""}
                            </span>
                            {overdue ? <span className="text-xs text-amber-600">Overdue</span> : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {session.appointmentService ?? ""}
                            {session.missed_reason === "no_show" ? " · Marked missed" : ""}
                            {session.missed_reason === "cancelled" && session.status !== "scheduled" ? " · Cancelled" : ""}
                            {session.resolution_overrode_default ? " · Overrode default" : ""}
                            {session.validity_extended_days > 0
                              ? ` · Expiry extended ${session.validity_extended_days} days`
                              : ""}
                            {session.note ? ` · ${session.note}` : ""}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {session.status === "missed_pending" && onDecide ? (
                            <button
                              type="button"
                              disabled={busy || detail.saving}
                              onClick={() => onDecide(session, pkg.name_snapshot, pkg.customerName)}
                              className="min-h-11 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 text-sm font-medium text-amber-700 hover:bg-amber-500/20 disabled:opacity-60 xl:min-h-9"
                            >
                              Decide
                            </button>
                          ) : null}
                          {overdue && onMarkMissed ? (
                            <button
                              type="button"
                              disabled={busy || detail.saving}
                              onClick={() => onMarkMissed(session, pkg.name_snapshot, pkg.customerName)}
                              className="min-h-11 rounded-xl border border-border px-3 text-sm text-text hover:bg-muted disabled:opacity-60 xl:min-h-9"
                            >
                              Mark missed
                            </button>
                          ) : null}
                          {session.status === "scheduled" || session.status === "missed_pending" ? (
                            <button
                              type="button"
                              disabled={busy || detail.saving}
                              onClick={() => void runSessionAction(session.id, () => detail.detach(session.id))}
                              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-text disabled:opacity-60 xl:min-h-9"
                              aria-label="Remove link to this appointment"
                            >
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {canLink && (
              <section className="space-y-2">
                {linkable === null ? (
                  <button
                    type="button"
                    onClick={() => void loadLinkable()}
                    disabled={linkLoading}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm text-text hover:bg-muted disabled:opacity-60"
                  >
                    {linkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Link an existing appointment
                  </button>
                ) : (
                  <>
                    <h4 className="text-sm font-semibold text-text">Appointments for {pkg.customerPhone ?? "this customer"}</h4>
                    {linkable.filter((item) => !linkedAppointmentIds.has(item.id)).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No unlinked appointments match this customer&apos;s phone number.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {linkable
                          .filter((item) => !linkedAppointmentIds.has(item.id))
                          .map((item) => (
                            <li
                              key={item.id}
                              className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                            >
                              <span className="text-text">
                                {item.date ?? "-"} {item.start_time ? formatAppointmentTimeRange(item.date, item.start_time) : ""}
                                <span className="ml-2 text-muted-foreground">
                                  {item.service ?? ""} {item.status ? `· ${item.status}` : ""}
                                </span>
                              </span>
                              <button
                                type="button"
                                disabled={busySessionId !== null || detail.saving}
                                onClick={() =>
                                  void runSessionAction(item.id, async () => {
                                    await detail.attach(item.id);
                                    setLinkable((current) => (current ? current.filter((row) => row.id !== item.id) : current));
                                  })
                                }
                                className="min-h-11 rounded-xl border border-border bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 xl:min-h-9"
                              >
                                {busySessionId === item.id ? "Linking..." : "Link"}
                              </button>
                            </li>
                          ))}
                      </ul>
                    )}
                  </>
                )}
              </section>
            )}

            <PackagePaymentsSection
              pkg={pkg}
              today={today}
              labels={labels}
              saving={detail.saving}
              onRecord={detail.recordPayment}
            />

            <p className="text-xs text-muted-foreground">
              {pkg.status === "cancelled"
                ? `This ${labels.package.toLowerCase()} was cancelled; no ${labels.sessions.toLowerCase()} are left to use.`
                : `${formatSessionCount(labels, credit.remaining)} left of ${credit.total}. Completing a linked appointment uses one; cancelling it asks whether to roll over or forfeit.`}
            </p>

            {pkg.status === "active" && (
              <CancelPackageControl labels={labels} saving={detail.saving} onCancel={detail.cancel} />
            )}
          </>
        )}
      </div>
    </EntityModal>
  );
}
