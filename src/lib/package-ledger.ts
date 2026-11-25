/**
 * Pure package credit math (Wave 3, D-05). Import-free at runtime (type-only imports are erased) and limited to
 * erasable TypeScript, so scripts/check-package-ledger.mjs loads it directly with Node and the UI reuses the same
 * rules. The database RPCs and the appointments trigger in 20261120_packages_rpcs.sql enforce the same rules
 * server-side; this module never decides anything the database does not re-validate.
 *
 * Session status   consumes credit   holds a slot
 * scheduled        no                yes
 * completed        yes               no
 * missed_pending   no                yes   (undecided; never consumes)
 * rolled_over      no                no
 * forfeited        yes               no
 * voided           no                no
 *
 * consumed = completed + forfeited; held = scheduled + missed_pending; remaining = total - consumed - held (>= 0).
 */
import type {
  MissedResolution,
  PackageDisplayStatus,
  PackagePaymentKind,
  PackagePaymentPlan,
  PackageSessionStatus,
  PackageStatus,
} from "@/lib/package-types";

const CONSUMING: readonly string[] = ["completed", "forfeited"];
const HOLDING: readonly string[] = ["scheduled", "missed_pending"];

export function sessionConsumesCredit(status: PackageSessionStatus): boolean {
  return CONSUMING.includes(status);
}

export function sessionHoldsSlot(status: PackageSessionStatus): boolean {
  return HOLDING.includes(status);
}

export type PackageCreditSummary = {
  total: number;
  consumed: number;
  held: number;
  remaining: number;
  scheduled: number;
  completed: number;
  missedPending: number;
  rolledOver: number;
  forfeited: number;
  voided: number;
  /** True only if the stored ledger already exceeds the total (should never happen; the RPC guards it). */
  overCapacity: boolean;
};

/** Credit summary for one package. Remaining is clamped at 0 and never negative. */
export function summarizePackageCredit(
  sessionsTotal: number,
  sessions: ReadonlyArray<{ status: PackageSessionStatus }>,
): PackageCreditSummary {
  const total = Number.isFinite(sessionsTotal) && sessionsTotal > 0 ? Math.floor(sessionsTotal) : 0;
  const counts = { scheduled: 0, completed: 0, missed_pending: 0, rolled_over: 0, forfeited: 0, voided: 0 };
  for (const session of sessions) {
    if (session.status in counts) {
      counts[session.status] += 1;
    }
  }

  const consumed = counts.completed + counts.forfeited;
  const held = counts.scheduled + counts.missed_pending;
  const raw = total - consumed - held;

  return {
    total,
    consumed,
    held,
    remaining: Math.max(0, raw),
    scheduled: counts.scheduled,
    completed: counts.completed,
    missedPending: counts.missed_pending,
    rolledOver: counts.rolled_over,
    forfeited: counts.forfeited,
    voided: counts.voided,
    overCapacity: raw < 0,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Calendar-date arithmetic in UTC so no local zone or DST shift can move the result. */
export function addDaysToIsoDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + Math.trunc(days));
  return parsed.toISOString().slice(0, 10);
}

/** valid_until for a package sold today with an optional validity in days (null = no expiry). */
export function computeValidUntil(today: string, validityDays: number | null): string | null {
  if (validityDays === null || !Number.isFinite(validityDays) || validityDays <= 0 || !isIsoDate(today)) {
    return null;
  }
  return addDaysToIsoDate(today, validityDays);
}

/** Expired = valid_until is before today (valid_until itself is still usable). Dates are ISO yyyy-mm-dd. */
export function isPackageExpired(validUntil: string | null, today: string): boolean {
  return validUntil !== null && validUntil < today;
}

/** Stored status plus derived expiry. Completed and cancelled win over expiry. */
export function derivePackageDisplayStatus(
  pkg: { status: PackageStatus; valid_until: string | null },
  today: string,
): PackageDisplayStatus {
  if (pkg.status === "cancelled" || pkg.status === "completed") {
    return pkg.status;
  }
  return isPackageExpired(pkg.valid_until, today) ? "expired" : "active";
}

export type AttachCheck =
  | { ok: true }
  | { ok: false; reason: "inactive" | "cancelled_appointment" | "expired" | "already_linked" | "no_credit" };

/** Mirrors attach_package_session's validation order so the UI can explain a disabled choice before calling it. */
export function checkAttach(input: {
  packageStatus: PackageStatus;
  validUntil: string | null;
  sessionsTotal: number;
  sessions: ReadonlyArray<{ status: PackageSessionStatus }>;
  appointmentDate: string | null;
  appointmentStatus: string | null;
  alreadyLinked: boolean;
}): AttachCheck {
  if (input.packageStatus !== "active") {
    return { ok: false, reason: "inactive" };
  }
  if (input.appointmentStatus === "cancelled") {
    return { ok: false, reason: "cancelled_appointment" };
  }
  if (input.validUntil !== null && (input.appointmentDate === null || input.appointmentDate > input.validUntil)) {
    return { ok: false, reason: "expired" };
  }
  if (input.alreadyLinked) {
    return { ok: false, reason: "already_linked" };
  }
  if (summarizePackageCredit(input.sessionsTotal, input.sessions).remaining <= 0) {
    return { ok: false, reason: "no_credit" };
  }
  return { ok: true };
}

/** Package status after a credit change (same rule as public.package_sync_status). */
export function nextPackageStatus(
  current: PackageStatus,
  sessionsTotal: number,
  sessions: ReadonlyArray<{ status: PackageSessionStatus }>,
): PackageStatus {
  if (current === "cancelled") {
    return current;
  }
  return summarizePackageCredit(sessionsTotal, sessions).consumed >= sessionsTotal ? "completed" : "active";
}

/**
 * Session status after a linked appointment changes (same table as the appointments trigger).
 * Returns null when the session does not change. Resolved and voided sessions never change here.
 */
export function nextSessionStatusForAppointment(
  current: PackageSessionStatus,
  fromStatus: string | null,
  toStatus: string | null,
): PackageSessionStatus | null {
  if (current === "rolled_over" || current === "forfeited" || current === "voided" || fromStatus === toStatus) {
    return null;
  }
  if (toStatus === "completed" && (current === "scheduled" || current === "missed_pending")) {
    return "completed";
  }
  if (toStatus === "cancelled" && (current === "scheduled" || current === "completed")) {
    return "missed_pending";
  }
  if ((toStatus === "booked" || toStatus === "tentative") && fromStatus === "cancelled" && current === "missed_pending") {
    return "scheduled";
  }
  if ((toStatus === "booked" || toStatus === "tentative") && fromStatus === "completed" && current === "completed") {
    return "scheduled";
  }
  return null;
}

/** Session status after the linked appointment is soft-deleted: only a scheduled link is voided. */
export function nextSessionStatusForDeletedAppointment(current: PackageSessionStatus): PackageSessionStatus | null {
  return current === "scheduled" ? "voided" : null;
}

// ---------------------------------------------------------------------------
// Missed-session decision (Task 6, D-05). Same rules as mark_session_missed / resolve_missed_session.
// ---------------------------------------------------------------------------

export function canMarkSessionMissed(status: PackageSessionStatus): boolean {
  return status === "scheduled";
}

export function canResolveSession(status: PackageSessionStatus): boolean {
  return status === "missed_pending";
}

export function canDetachSession(status: PackageSessionStatus): boolean {
  return status === "scheduled" || status === "missed_pending";
}

/** A scheduled session whose appointment date is before today (eligible for "Mark missed"). */
export function isOverdueScheduledSession(
  session: { status: PackageSessionStatus; appointmentDate: string | null },
  today: string,
): boolean {
  return session.status === "scheduled" && session.appointmentDate !== null && session.appointmentDate < today;
}

export type PackageDecisionSettings = {
  missed_default: MissedResolution;
  rollover_extends_validity_days: number;
  forfeit_charges_per_visit: boolean;
};

export type MissedDecisionOutcome = {
  status: PackageSessionStatus;
  overrodeDefault: boolean;
  /** R-15 snapshot: days added to valid_until (0 when no expiry or the setting is 0). */
  validityExtendedDays: number;
  validUntil: string | null;
  /** R-16 snapshot: set only for forfeit. */
  chargeOnForfeit: boolean | null;
};

/** What resolve_missed_session stores for a decision, given the tenant settings at decision time. */
export function resolveMissedDecision(input: {
  resolution: MissedResolution;
  settings: PackageDecisionSettings;
  validUntil: string | null;
}): MissedDecisionOutcome {
  const overrodeDefault = input.resolution !== input.settings.missed_default;

  if (input.resolution === "rollover") {
    const days = Math.min(365, Math.max(0, Math.round(input.settings.rollover_extends_validity_days || 0)));
    const extend = input.validUntil !== null && days > 0;
    return {
      status: "rolled_over",
      overrodeDefault,
      validityExtendedDays: extend ? days : 0,
      validUntil: extend && input.validUntil !== null ? addDaysToIsoDate(input.validUntil, days) : input.validUntil,
      chargeOnForfeit: null,
    };
  }

  return {
    status: "forfeited",
    overrodeDefault,
    validityExtendedDays: 0,
    validUntil: input.validUntil,
    chargeOnForfeit: input.settings.forfeit_charges_per_visit,
  };
}

// ---------------------------------------------------------------------------
// Per-visit accrual inputs (R-16). The payment summary below builds on these; amounts are integer paise.
// ---------------------------------------------------------------------------

/**
 * Visits owed on a per-visit plan: every completed session, plus forfeited sessions whose snapshot says the
 * forfeit is charged (charge_on_forfeit true). Rolled over, scheduled, undecided and voided sessions are not owed.
 */
export function countChargeableVisits(
  sessions: ReadonlyArray<{ status: PackageSessionStatus; charge_on_forfeit?: boolean | null }>,
): number {
  let count = 0;
  for (const session of sessions) {
    if (session.status === "completed" || (session.status === "forfeited" && session.charge_on_forfeit === true)) {
      count += 1;
    }
  }
  return count;
}

/** Per-visit accrued amount in integer paise: price per session x chargeable visits. */
export function perVisitAccruedPaise(
  pricePerSessionPaise: number,
  sessions: ReadonlyArray<{ status: PackageSessionStatus; charge_on_forfeit?: boolean | null }>,
): number {
  const price = Number.isFinite(pricePerSessionPaise) ? Math.max(0, Math.round(pricePerSessionPaise)) : 0;
  return price * countChargeableVisits(sessions);
}

// ---------------------------------------------------------------------------
// Payments (Task 7, D-06). All comparisons are in integer paise; the database (numeric(12,2)) re-validates every
// rule in 20261120_packages_payment_rpcs.sql, so this module only explains and previews, it never decides alone.
// ---------------------------------------------------------------------------

/** Mirrors PACKAGE_LIMITS (package-types.ts, a runtime import is not allowed here); the check script asserts equality. */
const MAX_AMOUNT_PAISE = 9_999_999_999;
const INSTALLMENTS_MIN = 1;
const INSTALLMENTS_MAX = 120;
const INSTALLMENT_DAYS_BACK = 366;
const INSTALLMENT_DAYS_AHEAD = 3660;

const PAYMENT_KIND_BY_PLAN: Record<PackagePaymentPlan, PackagePaymentKind> = {
  upfront: "upfront",
  installments: "installment",
  per_visit: "per_visit",
};

/** Same rounding as toPaise in clinic-billing-types.ts (the check script asserts they agree). Non-finite becomes 0. */
export function moneyToPaise(amount: number): number {
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function paiseToMoney(paise: number): number {
  return Number.isFinite(paise) ? Math.round(paise) / 100 : 0;
}

/** Integer paise from up to eight digits with at most two decimals (the largest allowed price), otherwise null. */
export function parseMoneyPaise(raw: string): number | null {
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!match) {
    return null;
  }
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** Two-decimal text for a form field from integer paise (25050 -> "250.50"). */
export function formatPaiseInput(paise: number): string {
  return (Math.max(0, Math.round(paise)) / 100).toFixed(2);
}

function isValidPaise(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_AMOUNT_PAISE;
}

/** Equal split in paise with the remainder on the LAST row, so the rows always add up to the total exactly. */
export function splitPaiseEvenly(totalPaise: number, count: number): number[] {
  if (!Number.isInteger(totalPaise) || totalPaise < 0 || !Number.isInteger(count) || count < 1) {
    return [];
  }
  const base = Math.floor(totalPaise / count);
  const rows = Array.from({ length: count }, () => base);
  rows[count - 1] = totalPaise - base * (count - 1);
  return rows;
}

/** Calendar-month arithmetic in UTC; the day clamps to the end of a shorter month (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsToIsoDate(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + Math.trunc(months), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export type ScheduleInputRow = { dueOn: string; amountPaise: number };

/** Default schedule: equal amounts with the remainder on the last row, due every intervalMonths from firstDueOn. */
export function buildInstallmentRows(input: {
  totalPaise: number;
  count: number;
  firstDueOn: string;
  intervalMonths?: number;
}): ScheduleInputRow[] {
  if (!isIsoDate(input.firstDueOn)) {
    return [];
  }
  const interval = Math.max(1, Math.trunc(input.intervalMonths ?? 1));
  return splitPaiseEvenly(input.totalPaise, input.count).map((amountPaise, index) => ({
    dueOn: addMonthsToIsoDate(input.firstDueOn, index * interval),
    amountPaise,
  }));
}

export type ScheduleFailure = "total" | "count" | "amount" | "date" | "range" | "order" | "sum";

export type ScheduleCheck = { ok: true; sumPaise: number } | { ok: false; reason: ScheduleFailure; sumPaise: number };

/** Mirrors the installment validation in sell_package (same order of checks) so the editor can explain a problem. */
export function validateInstallmentSchedule(
  rows: ReadonlyArray<ScheduleInputRow>,
  totalPaise: number,
  today: string,
): ScheduleCheck {
  let sumPaise = 0;
  for (const row of rows) {
    if (isValidPaise(row.amountPaise)) {
      sumPaise += row.amountPaise;
    }
  }
  const fail = (reason: ScheduleFailure): ScheduleCheck => ({ ok: false, reason, sumPaise });

  if (!isValidPaise(totalPaise)) {
    return fail("total");
  }
  if (rows.length < INSTALLMENTS_MIN || rows.length > INSTALLMENTS_MAX) {
    return fail("count");
  }

  const earliest = addDaysToIsoDate(today, -INSTALLMENT_DAYS_BACK);
  const latest = addDaysToIsoDate(today, INSTALLMENT_DAYS_AHEAD);
  let previous: string | null = null;
  for (const row of rows) {
    if (!isValidPaise(row.amountPaise)) {
      return fail("amount");
    }
    if (!isIsoDate(row.dueOn)) {
      return fail("date");
    }
    if (row.dueOn < earliest || row.dueOn > latest) {
      return fail("range");
    }
    if (previous !== null && row.dueOn < previous) {
      return fail("order");
    }
    previous = row.dueOn;
  }

  return sumPaise === totalPaise ? { ok: true, sumPaise } : fail("sum");
}

export type PackageMoneySummary = {
  plan: PackagePaymentPlan;
  /** Upfront and installments: price_total. Per visit: accrued so far (price per session x chargeable visits). */
  owedPaise: number;
  paidPaise: number;
  /** owed - paid, never negative. */
  balancePaise: number;
  /** Installments: scheduled amounts due on or before today (clinic zone). Upfront: owed. Per visit: accrued. */
  dueToDatePaise: number;
  /** Installments only: max(0, due to date - paid). Always 0 for the other plans. */
  overduePaise: number;
  /** paid - owed when positive; the database makes this impossible, so a non-zero value flags corrupt data. */
  overpaidPaise: number;
};

/** One pure summary for every plan; the Packages drawer and the assertions both use it. */
export function summarizePackageMoney(input: {
  plan: PackagePaymentPlan;
  priceTotal: number | null;
  pricePerSession: number | null;
  installments: ReadonlyArray<{ due_on: string; amount: number }>;
  payments: ReadonlyArray<{ amount: number }>;
  sessions: ReadonlyArray<{ status: PackageSessionStatus; charge_on_forfeit?: boolean | null }>;
  /** Today in the clinic time zone (yyyy-mm-dd). */
  today: string;
}): PackageMoneySummary {
  const paidPaise = input.payments.reduce((sum, payment) => sum + moneyToPaise(payment.amount), 0);

  let owedPaise: number;
  let dueToDatePaise: number;
  let overduePaise = 0;

  if (input.plan === "per_visit") {
    owedPaise = perVisitAccruedPaise(moneyToPaise(input.pricePerSession ?? 0), input.sessions);
    dueToDatePaise = owedPaise;
  } else {
    owedPaise = moneyToPaise(input.priceTotal ?? 0);
    if (input.plan === "installments") {
      dueToDatePaise = input.installments
        .filter((row) => row.due_on <= input.today)
        .reduce((sum, row) => sum + moneyToPaise(row.amount), 0);
      overduePaise = Math.max(0, dueToDatePaise - paidPaise);
    } else {
      dueToDatePaise = owedPaise;
    }
  }

  return {
    plan: input.plan,
    owedPaise,
    paidPaise,
    balancePaise: Math.max(0, owedPaise - paidPaise),
    dueToDatePaise,
    overduePaise,
    overpaidPaise: Math.max(0, paidPaise - owedPaise),
  };
}

export type InstallmentState = "paid" | "overdue" | "due" | "upcoming";

export type InstallmentStatusRow = {
  seq: number;
  due_on: string;
  amountPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  /** paid: nothing left; overdue: unpaid part and due before today; due: unpaid part due today; upcoming: due later. */
  state: InstallmentState;
};

/**
 * Applies the total paid to the schedule oldest first (payments are not pinned to one installment). Because due dates
 * never decrease with seq, the outstanding amount of the rows due on or before today equals the plan's overdue amount.
 */
export function allocateInstallments(
  installments: ReadonlyArray<{ seq: number; due_on: string; amount: number }>,
  paidPaise: number,
  today: string,
): InstallmentStatusRow[] {
  let remaining = Math.max(0, Math.round(paidPaise));
  return [...installments]
    .sort((a, b) => a.seq - b.seq)
    .map((row) => {
      const amountPaise = moneyToPaise(row.amount);
      const applied = Math.min(remaining, amountPaise);
      remaining -= applied;
      const outstandingPaise = amountPaise - applied;
      const state: InstallmentState =
        outstandingPaise === 0 ? "paid" : row.due_on < today ? "overdue" : row.due_on === today ? "due" : "upcoming";
      return { seq: row.seq, due_on: row.due_on, amountPaise, paidPaise: applied, outstandingPaise, state };
    });
}

/** A per-visit session is owed when it is completed, or forfeited with the charge snapshot true. */
export function isChargeableSession(session: { status: PackageSessionStatus; charge_on_forfeit?: boolean | null }): boolean {
  return session.status === "completed" || (session.status === "forfeited" && session.charge_on_forfeit === true);
}

export type SessionOutstanding = { sessionId: string; paidPaise: number; outstandingPaise: number };

/** Chargeable sessions that still owe something, in the given order (the sessions a per-visit payment can settle). */
export function perVisitOutstanding(
  sessions: ReadonlyArray<{ id: string; status: PackageSessionStatus; charge_on_forfeit?: boolean | null }>,
  payments: ReadonlyArray<{ session_id: string | null; amount: number }>,
  pricePerSessionPaise: number,
): SessionOutstanding[] {
  const price = Math.max(0, Math.round(pricePerSessionPaise));
  const rows: SessionOutstanding[] = [];
  for (const session of sessions) {
    if (!isChargeableSession(session)) {
      continue;
    }
    const paidPaise = payments
      .filter((payment) => payment.session_id === session.id)
      .reduce((sum, payment) => sum + moneyToPaise(payment.amount), 0);
    const outstandingPaise = Math.max(0, price - paidPaise);
    if (outstandingPaise > 0) {
      rows.push({ sessionId: session.id, paidPaise, outstandingPaise });
    }
  }
  return rows;
}

export type PaymentFailure =
  | "invalid_amount"
  | "cancelled"
  | "kind_mismatch"
  | "session_required"
  | "session_not_allowed"
  | "session_not_found"
  | "session_not_chargeable"
  | "exceeds";

export type PaymentCheck = { ok: true } | { ok: false; reason: PaymentFailure };

/**
 * Mirrors record_package_payment's validation order. Per visit the cap is per session (price per session minus what
 * is already paid against that session), which keeps paid <= accrued even after a completed visit is corrected.
 */
export function checkPayment(input: {
  plan: PackagePaymentPlan;
  packageStatus: PackageStatus;
  kind: PackagePaymentKind;
  amountPaise: number;
  priceTotalPaise: number;
  pricePerSessionPaise: number;
  paidPaise: number;
  sessionId: string | null;
  /** The pinned session of this package, or null when it does not exist; ignored when sessionId is null. */
  session: { status: PackageSessionStatus; charge_on_forfeit?: boolean | null; paidPaise: number } | null;
}): PaymentCheck {
  if (!isValidPaise(input.amountPaise)) {
    return { ok: false, reason: "invalid_amount" };
  }
  if (input.packageStatus === "cancelled" && input.plan !== "per_visit") {
    return { ok: false, reason: "cancelled" };
  }
  if (input.kind !== PAYMENT_KIND_BY_PLAN[input.plan]) {
    return { ok: false, reason: "kind_mismatch" };
  }

  if (input.plan === "per_visit") {
    if (input.sessionId === null) {
      return { ok: false, reason: "session_required" };
    }
    if (input.session === null) {
      return { ok: false, reason: "session_not_found" };
    }
    if (!isChargeableSession(input.session)) {
      return { ok: false, reason: "session_not_chargeable" };
    }
    return input.session.paidPaise + input.amountPaise > input.pricePerSessionPaise
      ? { ok: false, reason: "exceeds" }
      : { ok: true };
  }

  if (input.sessionId !== null) {
    return { ok: false, reason: "session_not_allowed" };
  }
  return input.paidPaise + input.amountPaise > input.priceTotalPaise ? { ok: false, reason: "exceeds" } : { ok: true };
}

/** Amount the record form pre-fills: the whole balance, or one session's outstanding amount for per visit. */
export function suggestedPaymentPaise(input: {
  plan: PackagePaymentPlan;
  balancePaise: number;
  sessionOutstandingPaise: number | null;
}): number {
  if (input.plan === "per_visit") {
    return Math.max(0, input.sessionOutstandingPaise ?? 0);
  }
  return Math.max(0, input.balancePaise);
}
