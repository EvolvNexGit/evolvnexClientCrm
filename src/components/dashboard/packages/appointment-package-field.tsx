"use client";

import { Loader2, Ticket, X } from "lucide-react";
import { usePackages } from "@/hooks/use-packages";
import { checkAttach, summarizePackageCredit } from "@/lib/package-ledger";
import type { PackageWithSessions } from "@/lib/package-queries";
import { formatSessionCount, type PackageLabels, type PackageSessionRecord } from "@/lib/package-types";

export type AppointmentPackageLink = { session: PackageSessionRecord; pkg: PackageWithSessions };

/**
 * "Use package" control for the appointment form. Lists the picked customer's active packages that can take this
 * appointment (credit left, not expired on its date). When the appointment is already linked it shows a chip with
 * the package and its remaining credit plus a Remove action. Renders nothing when there is nothing to offer, so the
 * form is unchanged for customers (and tenants) without packages.
 */
export function AppointmentPackageField({
  clientId,
  customerId,
  appointmentDate,
  appointmentStatus,
  value,
  onChange,
  link,
  linkLoading,
  removing,
  onRemoveLink,
  labels,
}: {
  clientId: string;
  /** customers.id picked in the form; empty when the name was typed freely. */
  customerId: string;
  appointmentDate: string;
  appointmentStatus: string;
  value: string;
  onChange: (packageId: string) => void;
  link: AppointmentPackageLink | null;
  linkLoading: boolean;
  removing: boolean;
  onRemoveLink: () => void;
  labels: PackageLabels;
}) {
  const { packages, loading } = usePackages(clientId, {
    statuses: ["active"],
    customerId,
    enabled: Boolean(clientId && customerId && !link),
  });

  if (linkLoading) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking {labels.package.toLowerCase()}...
      </p>
    );
  }

  if (link) {
    const credit = summarizePackageCredit(link.pkg.sessions_total, link.pkg.sessions);
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-text sm:col-span-2">
        <span className="inline-flex min-w-0 items-center gap-2">
          <Ticket className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">
            {link.pkg.name_snapshot} · {formatSessionCount(labels, credit.remaining)} left of {credit.total}
          </span>
        </span>
        {link.session.status === "scheduled" || link.session.status === "missed_pending" ? (
          <button
            type="button"
            onClick={onRemoveLink}
            disabled={removing}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-muted-foreground hover:bg-muted hover:text-text disabled:opacity-60 xl:min-h-8"
            aria-label={`Remove ${labels.package.toLowerCase()} from this appointment`}
          >
            {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Remove
          </button>
        ) : null}
      </div>
    );
  }

  if (!customerId) {
    return null;
  }

  const options = packages
    .map((pkg) => ({
      pkg,
      credit: summarizePackageCredit(pkg.sessions_total, pkg.sessions),
      check: checkAttach({
        packageStatus: pkg.status,
        validUntil: pkg.valid_until,
        sessionsTotal: pkg.sessions_total,
        sessions: pkg.sessions,
        appointmentDate: appointmentDate || null,
        appointmentStatus,
        alreadyLinked: false,
      }),
    }))
    .filter((option) => option.check.ok || option.check.reason === "cancelled_appointment");

  if (!loading && options.length === 0 && !value) {
    return null;
  }

  return (
    <label className="space-y-1 text-sm text-muted-foreground sm:col-span-2">
      <span>Use {labels.package.toLowerCase()}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading && options.length === 0}
        className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:text-sm"
      >
        <option value="">{loading && options.length === 0 ? "Loading..." : `No ${labels.package.toLowerCase()}`}</option>
        {options.map(({ pkg, credit }) => (
          <option key={pkg.id} value={pkg.id}>
            {pkg.name_snapshot} ({formatSessionCount(labels, credit.remaining)} left
            {pkg.valid_until ? `, until ${pkg.valid_until}` : ""})
          </option>
        ))}
      </select>
      {appointmentStatus === "cancelled" && value ? (
        <span className="block text-xs text-amber-600">A cancelled appointment cannot use a {labels.package.toLowerCase()}.</span>
      ) : null}
    </label>
  );
}
