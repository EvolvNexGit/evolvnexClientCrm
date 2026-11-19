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
// Per-visit accrual inputs (R-16). Task 7 builds payment balances on these; amounts are integer paise.
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
