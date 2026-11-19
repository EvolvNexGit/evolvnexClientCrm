// Assertion script for the pure package ledger module (no test runner in this repo).
// Run: node scripts/check-package-ledger.mjs
import assert from "node:assert/strict";
import {
  addDaysToIsoDate,
  canDetachSession,
  canMarkSessionMissed,
  canResolveSession,
  checkAttach,
  computeValidUntil,
  countChargeableVisits,
  isOverdueScheduledSession,
  perVisitAccruedPaise,
  resolveMissedDecision,
  derivePackageDisplayStatus,
  isIsoDate,
  isPackageExpired,
  nextPackageStatus,
  nextSessionStatusForAppointment,
  nextSessionStatusForDeletedAppointment,
  sessionConsumesCredit,
  sessionHoldsSlot,
  summarizePackageCredit,
} from "../src/lib/package-ledger.ts";
import {
  DEFAULT_PACKAGE_LABELS,
  PACKAGE_SESSION_STATUSES,
  formatSessionCount,
  isPackageSessionStatus,
} from "../src/lib/package-types.ts";

const s = (status) => ({ status });

// Status table: consumes = completed + forfeited; holds = scheduled + missed_pending.
assert.deepEqual([...PACKAGE_SESSION_STATUSES], ["scheduled", "completed", "missed_pending", "rolled_over", "forfeited", "voided"]);
assert.deepEqual(PACKAGE_SESSION_STATUSES.filter(sessionConsumesCredit), ["completed", "forfeited"]);
assert.deepEqual(PACKAGE_SESSION_STATUSES.filter(sessionHoldsSlot), ["scheduled", "missed_pending"]);
assert.equal(isPackageSessionStatus("missed_pending"), true);
assert.equal(isPackageSessionStatus("expired"), false);

// Tracer: sell 3, attach one (scheduled holds), complete it (consumes one) -> remaining 3 -> 2 -> 2.
assert.equal(summarizePackageCredit(3, []).remaining, 3);
assert.equal(summarizePackageCredit(3, [s("scheduled")]).remaining, 2);
const afterComplete = summarizePackageCredit(3, [s("completed")]);
assert.equal(afterComplete.remaining, 2);
assert.equal(afterComplete.consumed, 1);
assert.equal(afterComplete.held, 0);

// Voided rows are history only.
assert.equal(summarizePackageCredit(2, [s("voided"), s("voided"), s("voided")]).remaining, 2);

// Full mix.
const mix = summarizePackageCredit(10, [
  s("scheduled"), s("completed"), s("completed"), s("missed_pending"), s("rolled_over"), s("forfeited"), s("voided"),
]);
assert.deepEqual(mix, {
  total: 10, consumed: 3, held: 2, remaining: 5, scheduled: 1, completed: 2, missedPending: 1,
  rolledOver: 1, forfeited: 1, voided: 1, overCapacity: false,
});

// Remaining is clamped at 0 even for a corrupt over-capacity ledger, and flags it.
const over = summarizePackageCredit(1, [s("completed"), s("scheduled")]);
assert.equal(over.remaining, 0);
assert.equal(over.overCapacity, true);
assert.equal(summarizePackageCredit(Number.NaN, [s("scheduled")]).remaining, 0);

// Dates.
assert.equal(isIsoDate("2026-02-28"), true);
assert.equal(isIsoDate("2026-02-30"), false);
assert.equal(isIsoDate("26-02-01"), false);
assert.equal(addDaysToIsoDate("2026-12-30", 3), "2027-01-02");
assert.equal(addDaysToIsoDate("2028-02-28", 1), "2028-02-29");
assert.equal(computeValidUntil("2026-11-20", 30), "2026-12-20");
assert.equal(computeValidUntil("2026-11-20", null), null);
assert.equal(computeValidUntil("2026-11-20", 0), null);
assert.equal(computeValidUntil("bad", 10), null);

// Expiry is derived: valid_until itself is still usable.
assert.equal(isPackageExpired("2026-11-20", "2026-11-20"), false);
assert.equal(isPackageExpired("2026-11-19", "2026-11-20"), true);
assert.equal(isPackageExpired(null, "2030-01-01"), false);
assert.equal(derivePackageDisplayStatus({ status: "active", valid_until: "2026-11-19" }, "2026-11-20"), "expired");
assert.equal(derivePackageDisplayStatus({ status: "active", valid_until: null }, "2026-11-20"), "active");
assert.equal(derivePackageDisplayStatus({ status: "completed", valid_until: "2020-01-01" }, "2026-11-20"), "completed");
assert.equal(derivePackageDisplayStatus({ status: "cancelled", valid_until: "2020-01-01" }, "2026-11-20"), "cancelled");

// Attach rules mirror attach_package_session.
const attachBase = {
  packageStatus: "active", validUntil: "2026-12-31", sessionsTotal: 2, sessions: [s("completed")],
  appointmentDate: "2026-12-01", appointmentStatus: "booked", alreadyLinked: false,
};
assert.deepEqual(checkAttach(attachBase), { ok: true });
assert.deepEqual(checkAttach({ ...attachBase, packageStatus: "completed" }), { ok: false, reason: "inactive" });
assert.deepEqual(checkAttach({ ...attachBase, appointmentStatus: "cancelled" }), { ok: false, reason: "cancelled_appointment" });
assert.deepEqual(checkAttach({ ...attachBase, appointmentDate: "2027-01-01" }), { ok: false, reason: "expired" });
assert.deepEqual(checkAttach({ ...attachBase, appointmentDate: "2026-12-31" }), { ok: true });
assert.deepEqual(checkAttach({ ...attachBase, appointmentDate: null }), { ok: false, reason: "expired" });
assert.deepEqual(checkAttach({ ...attachBase, validUntil: null, appointmentDate: null }), { ok: true });
assert.deepEqual(checkAttach({ ...attachBase, alreadyLinked: true }), { ok: false, reason: "already_linked" });
assert.deepEqual(checkAttach({ ...attachBase, sessions: [s("completed"), s("scheduled")] }), { ok: false, reason: "no_credit" });
assert.deepEqual(checkAttach({ ...attachBase, sessions: [s("completed"), s("missed_pending")] }), { ok: false, reason: "no_credit" });
assert.deepEqual(checkAttach({ ...attachBase, sessions: [s("completed"), s("rolled_over")] }), { ok: true });

// Package status follows consumed credit; cancelled is sticky.
assert.equal(nextPackageStatus("active", 2, [s("completed"), s("forfeited")]), "completed");
assert.equal(nextPackageStatus("active", 2, [s("completed"), s("scheduled")]), "active");
assert.equal(nextPackageStatus("completed", 2, [s("completed"), s("scheduled")]), "active");
assert.equal(nextPackageStatus("cancelled", 1, [s("completed")]), "cancelled");

// Appointment trigger table.
const t = nextSessionStatusForAppointment;
assert.equal(t("scheduled", "booked", "completed"), "completed");
assert.equal(t("missed_pending", "booked", "completed"), "completed");
assert.equal(t("scheduled", "booked", "cancelled"), "missed_pending");
assert.equal(t("completed", "completed", "cancelled"), "missed_pending");
assert.equal(t("missed_pending", "cancelled", "booked"), "scheduled");
assert.equal(t("missed_pending", "cancelled", "tentative"), "scheduled");
assert.equal(t("completed", "completed", "booked"), "scheduled");
assert.equal(t("missed_pending", "booked", "tentative"), null);
assert.equal(t("scheduled", "tentative", "booked"), null);
assert.equal(t("scheduled", "booked", "booked"), null);
for (const resolved of ["rolled_over", "forfeited", "voided"]) {
  for (const [from, to] of [["cancelled", "booked"], ["booked", "completed"], ["booked", "cancelled"]]) {
    assert.equal(t(resolved, from, to), null, `${resolved} never changes on ${from}->${to}`);
  }
}
assert.equal(nextSessionStatusForDeletedAppointment("scheduled"), "voided");
assert.equal(nextSessionStatusForDeletedAppointment("completed"), null);
assert.equal(nextSessionStatusForDeletedAppointment("missed_pending"), null);

// Labels.
assert.deepEqual(DEFAULT_PACKAGE_LABELS, { package: "Package", packages: "Packages", session: "Session", sessions: "Sessions" });
assert.equal(formatSessionCount(DEFAULT_PACKAGE_LABELS, 1), "1 Session");
assert.equal(formatSessionCount({ ...DEFAULT_PACKAGE_LABELS, session: "Visit", sessions: "Visits" }, 3), "3 Visits");

// ---------------------------------------------------------------------------
// Task 6: missed-session decision rules.
// ---------------------------------------------------------------------------

// missed_pending holds a slot but never consumes credit.
const pending = summarizePackageCredit(3, [s("missed_pending")]);
assert.equal(pending.consumed, 0);
assert.equal(pending.held, 1);
assert.equal(pending.remaining, 2);

// rolled_over frees the slot and does not consume; forfeited consumes.
assert.deepEqual(
  [summarizePackageCredit(3, [s("rolled_over")]).remaining, summarizePackageCredit(3, [s("rolled_over")]).consumed],
  [3, 0],
);
assert.deepEqual(
  [summarizePackageCredit(3, [s("forfeited")]).remaining, summarizePackageCredit(3, [s("forfeited")]).consumed],
  [2, 1],
);

assert.equal(canMarkSessionMissed("scheduled"), true);
for (const other of ["completed", "missed_pending", "rolled_over", "forfeited", "voided"]) {
  assert.equal(canMarkSessionMissed(other), false);
}
assert.deepEqual(PACKAGE_SESSION_STATUSES.filter(canResolveSession), ["missed_pending"]);
assert.deepEqual(PACKAGE_SESSION_STATUSES.filter(canDetachSession), ["scheduled", "missed_pending"]);
assert.equal(isOverdueScheduledSession({ status: "scheduled", appointmentDate: "2026-11-19" }, "2026-11-20"), true);
assert.equal(isOverdueScheduledSession({ status: "scheduled", appointmentDate: "2026-11-20" }, "2026-11-20"), false);
assert.equal(isOverdueScheduledSession({ status: "missed_pending", appointmentDate: "2026-11-01" }, "2026-11-20"), false);
assert.equal(isOverdueScheduledSession({ status: "scheduled", appointmentDate: null }, "2026-11-20"), false);

// Overrode-default flag is relative to the tenant default.
const tenantRollover = { missed_default: "rollover", rollover_extends_validity_days: 0, forfeit_charges_per_visit: true };
const tenantForfeit = { ...tenantRollover, missed_default: "forfeit" };
assert.equal(resolveMissedDecision({ resolution: "rollover", settings: tenantRollover, validUntil: null }).overrodeDefault, false);
assert.equal(resolveMissedDecision({ resolution: "forfeit", settings: tenantRollover, validUntil: null }).overrodeDefault, true);
assert.equal(resolveMissedDecision({ resolution: "forfeit", settings: tenantForfeit, validUntil: null }).overrodeDefault, false);
assert.equal(resolveMissedDecision({ resolution: "rollover", settings: tenantForfeit, validUntil: null }).overrodeDefault, true);

// R-15: rollover extends valid_until by N only when the package has an expiry and N > 0; snapshot the days.
assert.deepEqual(resolveMissedDecision({ resolution: "rollover", settings: tenantRollover, validUntil: "2026-12-31" }), {
  status: "rolled_over", overrodeDefault: false, validityExtendedDays: 0, validUntil: "2026-12-31", chargeOnForfeit: null,
});
const extend7 = { ...tenantRollover, rollover_extends_validity_days: 7 };
assert.deepEqual(resolveMissedDecision({ resolution: "rollover", settings: extend7, validUntil: "2026-12-28" }), {
  status: "rolled_over", overrodeDefault: false, validityExtendedDays: 7, validUntil: "2027-01-04", chargeOnForfeit: null,
});
assert.deepEqual(resolveMissedDecision({ resolution: "rollover", settings: extend7, validUntil: null }), {
  status: "rolled_over", overrodeDefault: false, validityExtendedDays: 0, validUntil: null, chargeOnForfeit: null,
});
// Forfeit never extends, even with N > 0.
assert.equal(resolveMissedDecision({ resolution: "forfeit", settings: extend7, validUntil: "2026-12-28" }).validityExtendedDays, 0);
assert.equal(resolveMissedDecision({ resolution: "forfeit", settings: extend7, validUntil: "2026-12-28" }).validUntil, "2026-12-28");

// R-16: forfeit snapshots the tenant setting at decision time.
assert.equal(resolveMissedDecision({ resolution: "forfeit", settings: tenantRollover, validUntil: null }).chargeOnForfeit, true);
assert.equal(
  resolveMissedDecision({ resolution: "forfeit", settings: { ...tenantRollover, forfeit_charges_per_visit: false }, validUntil: null })
    .chargeOnForfeit,
  false,
);

// R-16 accrual inputs: completed always owed; forfeited only when its snapshot says so; rolled over never.
const visits = [
  { status: "completed" }, { status: "completed", charge_on_forfeit: null },
  { status: "forfeited", charge_on_forfeit: true }, { status: "forfeited", charge_on_forfeit: false },
  { status: "forfeited", charge_on_forfeit: null }, { status: "rolled_over" }, { status: "scheduled" },
  { status: "missed_pending" }, { status: "voided" },
];
assert.equal(countChargeableVisits(visits), 3);
assert.equal(perVisitAccruedPaise(50000, visits), 150000);
assert.equal(perVisitAccruedPaise(-5, visits), 0);
assert.equal(perVisitAccruedPaise(Number.NaN, visits), 0);
assert.equal(countChargeableVisits([]), 0);

// Un-cancel reverts an unresolved missed_pending; a resolved decision is never reverted.
assert.equal(nextSessionStatusForAppointment("missed_pending", "cancelled", "booked"), "scheduled");
assert.equal(nextSessionStatusForAppointment("rolled_over", "cancelled", "booked"), null);
assert.equal(nextSessionStatusForAppointment("forfeited", "cancelled", "tentative"), null);

// Remaining never goes below zero for any sequence of transitions (seeded pseudo-random walk over the same rules
// the database enforces: attach guarded by capacity, trigger table, mark missed, resolve, detach, soft delete).
let seed = 20261120;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const appointmentStatuses = ["tentative", "booked", "completed", "cancelled"];
for (let run = 0; run < 400; run += 1) {
  const total = 1 + Math.floor(random() * 5);
  const ledger = []; // { status, appointmentStatus }
  for (let step = 0; step < 40; step += 1) {
    const action = Math.floor(random() * 6);
    const live = ledger.filter((item) => !["voided", "rolled_over", "forfeited"].includes(item.status));
    const pick = live.length > 0 ? live[Math.floor(random() * live.length)] : null;
    if (action === 0) {
      const appointmentStatus = appointmentStatuses[Math.floor(random() * 3)];
      const check = checkAttach({
        packageStatus: nextPackageStatus("active", total, ledger), validUntil: null, sessionsTotal: total,
        sessions: ledger, appointmentDate: null, appointmentStatus, alreadyLinked: false,
      });
      if (check.ok) {
        ledger.push({ status: appointmentStatus === "completed" ? "completed" : "scheduled", appointmentStatus });
      }
    } else if (action === 1 && pick) {
      const to = appointmentStatuses[Math.floor(random() * 4)];
      const next = nextSessionStatusForAppointment(pick.status, pick.appointmentStatus, to);
      pick.appointmentStatus = to;
      if (next) pick.status = next;
    } else if (action === 2 && pick && canMarkSessionMissed(pick.status)) {
      pick.status = "missed_pending";
    } else if (action === 3 && pick && canResolveSession(pick.status)) {
      pick.status = resolveMissedDecision({ resolution: random() < 0.5 ? "rollover" : "forfeit", settings: tenantRollover, validUntil: null }).status;
    } else if (action === 4 && pick && canDetachSession(pick.status)) {
      pick.status = "voided";
    } else if (action === 5 && pick) {
      const next = nextSessionStatusForDeletedAppointment(pick.status);
      if (next) pick.status = next;
    }
    const credit = summarizePackageCredit(total, ledger);
    assert.ok(credit.remaining >= 0, "remaining never below zero");
    assert.equal(credit.overCapacity, false, `consumed + held never exceeds total (run ${run}, step ${step})`);
    assert.ok(credit.consumed + credit.held <= total);
  }
}

console.log("check-package-ledger: all assertions passed");
