"use client";

import { type FormEvent, useRef, useState } from "react";
import { CLINIC_PAYMENT_MODES } from "@/lib/clinic-billing-types";
import {
  checkPayment,
  formatPaiseInput,
  parseMoneyPaise,
  type PaymentFailure,
  type SessionOutstanding,
} from "@/lib/package-ledger";
import {
  PACKAGE_LIMITS,
  PAYMENT_KIND_FOR_PLAN,
  formatPackageMoney,
  isPackagePaymentMethod,
  type PackageLabels,
  type PackagePaymentMethod,
  type PackagePaymentPlan,
  type PackageSessionRecord,
  type PackageStatus,
  type RecordPaymentPayload,
} from "@/lib/package-types";
import { newIdempotencyKey } from "@/lib/package-queries";
import { formatSupabaseError } from "@/lib/supabase";

const inputClass =
  "w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text placeholder:text-muted-foreground sm:text-sm";

const FAILURE_TEXT: Record<PaymentFailure, string> = {
  invalid_amount: "Enter an amount above zero (up to two decimals).",
  cancelled: "This package is cancelled and no longer takes payments.",
  kind_mismatch: "This payment type does not match the plan.",
  session_required: "Choose which visit this payment is for.",
  session_not_allowed: "This plan does not take payments against a visit.",
  session_not_found: "That visit was not found.",
  session_not_chargeable: "That visit is not owed.",
  exceeds: "That amount is more than the balance.",
};

/**
 * Record a payment against one package. Upfront and installments take any amount up to the balance; per visit takes
 * an amount up to what one owed visit still costs. Pre-checks use the same rules as the database (package-ledger),
 * which re-validates everything and has the final say.
 */
export function RecordPaymentForm({
  plan,
  packageStatus,
  priceTotalPaise,
  pricePerSessionPaise,
  paidPaise,
  balancePaise,
  outstanding,
  sessions,
  labels,
  saving,
  onRecord,
}: {
  plan: PackagePaymentPlan;
  packageStatus: PackageStatus;
  priceTotalPaise: number;
  pricePerSessionPaise: number;
  paidPaise: number;
  balancePaise: number;
  /** Per visit: owed sessions that still have something to pay. */
  outstanding: SessionOutstanding[];
  sessions: PackageSessionRecord[];
  labels: PackageLabels;
  saving: boolean;
  onRecord: (payload: Omit<RecordPaymentPayload, "packageId">) => Promise<unknown>;
}) {
  const perVisit = plan === "per_visit";
  const [sessionId, setSessionId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PackagePaymentMethod>("CASH");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const attemptRef = useRef<{ signature: string; key: string } | null>(null);

  const selected = perVisit ? (outstanding.find((row) => row.sessionId === sessionId) ?? outstanding[0] ?? null) : null;
  const selectedId = selected?.sessionId ?? "";
  const suggested = perVisit ? (selected?.outstandingPaise ?? 0) : balancePaise;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    const amountPaise = parseMoneyPaise(amount.trim() === "" ? formatPaiseInput(suggested) : amount);
    if (amountPaise === null) {
      setError(FAILURE_TEXT.invalid_amount);
      return;
    }
    if (!isPackagePaymentMethod(method)) {
      setError("Choose how the payment was made.");
      return;
    }
    if (note.trim().length > PACKAGE_LIMITS.noteMax) {
      setError(`Notes must be ${PACKAGE_LIMITS.noteMax} characters or fewer.`);
      return;
    }

    const session = perVisit && selected ? sessions.find((item) => item.id === selected.sessionId) : undefined;
    const verdict = checkPayment({
      plan,
      packageStatus,
      kind: PAYMENT_KIND_FOR_PLAN[plan],
      amountPaise,
      priceTotalPaise,
      pricePerSessionPaise,
      paidPaise,
      sessionId: perVisit ? selectedId || null : null,
      session:
        perVisit && selected && session
          ? { status: session.status, charge_on_forfeit: session.charge_on_forfeit, paidPaise: selected.paidPaise }
          : null,
    });
    if (!verdict.ok) {
      setError(FAILURE_TEXT[verdict.reason]);
      return;
    }

    const payload = {
      kind: PAYMENT_KIND_FOR_PLAN[plan],
      amountPaise,
      method,
      sessionId: perVisit ? selectedId : null,
      note: note.trim() || null,
    };
    const signature = JSON.stringify(payload);
    if (attemptRef.current?.signature !== signature) {
      attemptRef.current = { signature, key: newIdempotencyKey() };
    }

    try {
      setError(null);
      setDone(null);
      await onRecord({ ...payload, idempotencyKey: attemptRef.current.key });
      attemptRef.current = null;
      setAmount("");
      setNote("");
      setDone(`Recorded ${formatPackageMoney(amountPaise / 100)}.`);
    } catch (recordError) {
      setError(formatSupabaseError(recordError, "Unable to record the payment."));
    }
  }

  if (perVisit && outstanding.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
        Nothing is owed yet. A {labels.session.toLowerCase()} becomes owed once it is completed, or forfeited when
        forfeits are charged.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3 rounded-xl border border-border bg-background p-3">
      <h5 className="text-sm font-semibold text-text">Record payment</h5>

      {perVisit && (
        <label className="block space-y-1 text-sm text-muted-foreground">
          <span>{labels.session} being paid for</span>
          <select
            value={selectedId}
            onChange={(event) => {
              setSessionId(event.target.value);
              setAmount("");
            }}
            className={inputClass}
          >
            {outstanding.map((row) => {
              const session = sessions.find((item) => item.id === row.sessionId);
              return (
                <option key={row.sessionId} value={row.sessionId}>
                  {session?.appointmentDate ?? "No date"}
                  {session?.status === "forfeited" ? " (forfeited)" : ""} - owes {formatPackageMoney(row.outstandingPaise / 100)}
                </option>
              );
            })}
          </select>
        </label>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Amount (balance {formatPackageMoney(suggested / 100)})</span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder={formatPaiseInput(suggested)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Method</span>
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as PackagePaymentMethod)}
            className={inputClass}
          >
            {CLINIC_PAYMENT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1 text-sm text-muted-foreground">
        <span>Note</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={PACKAGE_LIMITS.noteMax}
          className={inputClass}
        />
      </label>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {done && !error && <p className="text-sm text-emerald-600">{done}</p>}

      <button
        type="submit"
        disabled={saving || suggested <= 0}
        className="min-h-11 w-full rounded-xl border border-border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {saving ? "Saving..." : "Record payment"}
      </button>
    </form>
  );
}
