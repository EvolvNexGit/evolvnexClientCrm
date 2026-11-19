"use client";

import { RecordPaymentForm } from "@/components/dashboard/packages/record-payment-form";
import {
  allocateInstallments,
  moneyToPaise,
  perVisitOutstanding,
  summarizePackageMoney,
  type InstallmentState,
} from "@/lib/package-ledger";
import type { PackageDetailRecord } from "@/lib/package-queries";
import {
  PACKAGE_PLAN_LABEL,
  formatPackageMoney,
  type PackageLabels,
  type PackagePaymentKind,
  type RecordPaymentPayload,
} from "@/lib/package-types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<PackagePaymentKind, string> = {
  upfront: "Upfront",
  installment: "Installment",
  per_visit: "Per visit",
};

const INSTALLMENT_TONE: Record<InstallmentState, string> = {
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  overdue: "border-rose-500/40 bg-rose-500/10 text-rose-600",
  due: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  upcoming: "border-border bg-muted text-muted-foreground",
};

const INSTALLMENT_LABEL: Record<InstallmentState, string> = {
  paid: "Paid",
  overdue: "Overdue",
  due: "Due today",
  upcoming: "Upcoming",
};

function formatPaidAt(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Money of one package: summary, installment schedule with overdue highlighting, per-visit amount owed, the payments
 * list and the record form. Everything is computed by the pure ledger module from rows the database already stores.
 */
export function PackagePaymentsSection({
  pkg,
  today,
  labels,
  saving,
  onRecord,
}: {
  pkg: PackageDetailRecord;
  today: string;
  labels: PackageLabels;
  saving: boolean;
  onRecord: (payload: Omit<RecordPaymentPayload, "packageId">) => Promise<unknown>;
}) {
  const money = summarizePackageMoney({
    plan: pkg.payment_plan,
    priceTotal: pkg.price_total,
    pricePerSession: pkg.price_per_session,
    installments: pkg.installments,
    payments: pkg.payments,
    sessions: pkg.sessions,
    today,
  });
  const schedule = pkg.payment_plan === "installments" ? allocateInstallments(pkg.installments, money.paidPaise, today) : [];
  const owedSessions =
    pkg.payment_plan === "per_visit"
      ? perVisitOutstanding(pkg.sessions, pkg.payments, moneyToPaise(pkg.price_per_session ?? 0))
      : [];
  const canRecord =
    pkg.payment_plan === "per_visit"
      ? true
      : pkg.status !== "cancelled" && money.balancePaise > 0;

  const tiles: Array<{ label: string; value: string; tone?: string }> = [
    {
      label: pkg.payment_plan === "per_visit" ? "Owed so far" : "Total",
      value: formatPackageMoney(money.owedPaise / 100),
    },
    { label: "Paid", value: formatPackageMoney(money.paidPaise / 100) },
    { label: "Balance", value: formatPackageMoney(money.balancePaise / 100) },
  ];
  if (pkg.payment_plan === "installments") {
    tiles.push({
      label: "Overdue",
      value: formatPackageMoney(money.overduePaise / 100),
      tone: money.overduePaise > 0 ? "border-rose-500/40 bg-rose-500/10" : undefined,
    });
  }

  return (
    <section className="space-y-3" aria-label="Payments">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-text">Payments</h4>
        <span className="text-xs text-muted-foreground">
          {PACKAGE_PLAN_LABEL[pkg.payment_plan]}
          {pkg.payment_plan === "per_visit" && pkg.price_per_session !== null
            ? ` - ${formatPackageMoney(pkg.price_per_session)} per ${labels.session.toLowerCase()}`
            : ""}
        </span>
      </div>

      <div className={cn("grid gap-2", tiles.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
        {tiles.map((tile) => (
          <div key={tile.label} className={cn("rounded-xl border border-border bg-background p-3", tile.tone)}>
            <div className="text-xs text-muted-foreground">{tile.label}</div>
            <div className="text-base font-semibold text-text">{tile.value}</div>
          </div>
        ))}
      </div>

      {money.overpaidPaise > 0 && (
        <p className="text-sm text-rose-400">
          Payments exceed what is owed by {formatPackageMoney(money.overpaidPaise / 100)}. Please report this.
        </p>
      )}

      {schedule.length > 0 && (
        <ul className="space-y-2">
          {schedule.map((row) => (
            <li
              key={row.seq}
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl border bg-background p-3 text-sm",
                row.state === "overdue" ? "border-rose-500/40" : "border-border",
              )}
            >
              <div className="min-w-0">
                <span className="font-medium text-text">
                  {row.seq}. {row.due_on}
                </span>
                <span className="ml-2 text-muted-foreground">{formatPackageMoney(row.amountPaise / 100)}</span>
                {row.paidPaise > 0 && row.outstandingPaise > 0 ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatPackageMoney(row.paidPaise / 100)} paid, {formatPackageMoney(row.outstandingPaise / 100)} left
                  </span>
                ) : null}
              </div>
              <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium", INSTALLMENT_TONE[row.state])}>
                {INSTALLMENT_LABEL[row.state]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pkg.payments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">No payments yet.</p>
      ) : (
        <ul className="space-y-2">
          {pkg.payments.map((payment) => {
            const session = payment.session_id ? pkg.sessions.find((item) => item.id === payment.session_id) : undefined;
            return (
              <li
                key={payment.id}
                className="flex flex-col gap-1 rounded-xl border border-border bg-background p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-text">{formatPackageMoney(payment.amount)}</span>
                  <span className="ml-2 text-muted-foreground">
                    {KIND_LABEL[payment.kind]} - {payment.method}
                    {session?.appointmentDate ? ` - ${session.appointmentDate}` : ""}
                  </span>
                  {payment.note ? <div className="text-xs text-muted-foreground">{payment.note}</div> : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatPaidAt(payment.paid_at)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {canRecord && (
        <RecordPaymentForm
          plan={pkg.payment_plan}
          packageStatus={pkg.status}
          priceTotalPaise={moneyToPaise(pkg.price_total ?? 0)}
          pricePerSessionPaise={moneyToPaise(pkg.price_per_session ?? 0)}
          paidPaise={money.paidPaise}
          balancePaise={money.balancePaise}
          outstanding={owedSessions}
          sessions={pkg.sessions}
          labels={labels}
          saving={saving}
          onRecord={onRecord}
        />
      )}
      {!canRecord && pkg.status === "cancelled" && (
        <p className="text-xs text-muted-foreground">This package is cancelled. Payments already recorded are kept.</p>
      )}
    </section>
  );
}
