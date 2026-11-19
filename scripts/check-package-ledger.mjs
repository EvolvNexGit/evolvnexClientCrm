// Assertion script for the pure package ledger module (no test runner in this repo).
// Run: node scripts/check-package-ledger.mjs
import assert from "node:assert/strict";
import {
  addDaysToIsoDate,
  checkAttach,
  computeValidUntil,
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

console.log("check-package-ledger: all assertions passed");
