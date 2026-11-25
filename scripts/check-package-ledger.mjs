// Assertion script for the pure package ledger module (no test runner in this repo).
// Run: node scripts/check-package-ledger.mjs
import assert from "node:assert/strict";
import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  allocateInstallments,
  buildInstallmentRows,
  canDetachSession,
  checkPayment,
  isChargeableSession,
  formatPaiseInput,
  moneyToPaise,
  paiseToMoney,
  parseMoneyPaise,
  perVisitOutstanding,
  splitPaiseEvenly,
  suggestedPaymentPaise,
  summarizePackageMoney,
  validateInstallmentSchedule,
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
  PACKAGE_LIMITS,
  PACKAGE_PAYMENT_KINDS,
  PACKAGE_PAYMENT_METHODS,
  PACKAGE_SESSION_STATUSES,
  PAYMENT_KIND_FOR_PLAN,
  formatSessionCount,
  isPackagePaymentKind,
  isPackagePaymentMethod,
  isPackageSessionStatus,
} from "../src/lib/package-types.ts";
import { zonedNow } from "../src/lib/appointment-reminder-window.ts";
import { CLINIC_PAYMENT_MODES, parseMoneyInput, toPaise } from "../src/lib/clinic-billing-types.ts";

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

// ---------------------------------------------------------------------------
// Task 7: payments. Pure money math, parity with the clinic billing helpers, schedule rules, plan balances, overdue
// in the clinic time zone, per-visit accrual with charge_on_forfeit, overpayment, and a seeded random walk.
// ---------------------------------------------------------------------------

// Parity with the clinic billing vocabulary and paise helper (reuse is by equality, since the ledger is import-free).
assert.deepEqual([...PACKAGE_PAYMENT_METHODS], [...CLINIC_PAYMENT_MODES]);
for (const amount of [0, 0.01, 0.1, 0.29, 1, 19.99, 250.5, 1234.56, 99999999.99]) {
  assert.equal(moneyToPaise(amount), toPaise(amount), `paise parity for ${amount}`);
}
assert.equal(moneyToPaise(Number.NaN), 0);
assert.equal(moneyToPaise(Number.POSITIVE_INFINITY), 0);
assert.equal(parseMoneyInput("250.5"), 25050);
for (const raw of ["0", "0.1", "12", "12.5", "12.50", "250.5", "99999999.99", " 7.25 "]) {
  assert.equal(parseMoneyPaise(raw), parseMoneyInput(raw), `parse parity for ${raw}`);
}
for (const raw of ["", "abc", "1.234", "-5", "1,000", "100000000", "1e3", ".5", "5."]) {
  assert.equal(parseMoneyPaise(raw), null, `rejected: ${raw}`);
}
assert.equal(formatPaiseInput(25050), "250.50");
assert.equal(formatPaiseInput(5), "0.05");
assert.equal(formatPaiseInput(-3), "0.00");
assert.equal(paiseToMoney(25050), 250.5);
assert.deepEqual(
  PACKAGE_PAYMENT_KINDS.map((kind) => kind),
  ["upfront", "installment", "per_visit"],
);
assert.deepEqual(PAYMENT_KIND_FOR_PLAN, { upfront: "upfront", installments: "installment", per_visit: "per_visit" });
assert.equal(isPackagePaymentMethod("UPI"), true);
assert.equal(isPackagePaymentMethod("BTC"), false);
assert.equal(isPackagePaymentKind("refund"), false);
assert.equal(PACKAGE_LIMITS.installmentsMin, 1);
assert.equal(PACKAGE_LIMITS.installmentsMax, 120);
assert.equal(PACKAGE_LIMITS.installmentDaysBack, 366);
assert.equal(PACKAGE_LIMITS.installmentDaysAhead, 3660);
assert.equal(PACKAGE_LIMITS.idempotencyKeyMax, 100);
assert.equal(Math.round(PACKAGE_LIMITS.priceMax * 100), 9_999_999_999);

// Remainder-on-last split always adds up exactly.
assert.deepEqual(splitPaiseEvenly(100000, 3), [33333, 33333, 33334]);
assert.deepEqual(splitPaiseEvenly(90000, 3), [30000, 30000, 30000]);
assert.deepEqual(splitPaiseEvenly(1, 3), [0, 0, 1]);
assert.deepEqual(splitPaiseEvenly(500, 1), [500]);
assert.deepEqual(splitPaiseEvenly(10, 0), []);
assert.deepEqual(splitPaiseEvenly(-1, 2), []);
assert.deepEqual(splitPaiseEvenly(1.5, 2), []);
for (let total = 0; total <= 400; total += 7) {
  for (let count = 1; count <= 13; count += 1) {
    const rows = splitPaiseEvenly(total, count);
    assert.equal(rows.length, count);
    assert.equal(rows.reduce((sum, value) => sum + value, 0), total, `split ${total}/${count} adds up`);
    assert.ok(rows.every((value) => value >= 0));
  }
}

// Month arithmetic clamps to month end and is anchored on the first date (no drift).
assert.equal(addMonthsToIsoDate("2026-01-31", 1), "2026-02-28");
assert.equal(addMonthsToIsoDate("2028-01-31", 1), "2028-02-29");
assert.equal(addMonthsToIsoDate("2026-11-30", 3), "2027-02-28");
assert.equal(addMonthsToIsoDate("2026-12-15", 1), "2027-01-15");
assert.equal(addMonthsToIsoDate("2026-12-15", 12), "2027-12-15");
assert.deepEqual(
  buildInstallmentRows({ totalPaise: 90000, count: 3, firstDueOn: "2026-01-31" }).map((row) => row.dueOn),
  ["2026-01-31", "2026-02-28", "2026-03-31"],
);
assert.deepEqual(buildInstallmentRows({ totalPaise: 90000, count: 3, firstDueOn: "bad" }), []);
assert.deepEqual(
  buildInstallmentRows({ totalPaise: 10000, count: 2, firstDueOn: "2026-11-20", intervalMonths: 3 }),
  [{ dueOn: "2026-11-20", amountPaise: 5000 }, { dueOn: "2027-02-20", amountPaise: 5000 }],
);

// Schedule validation mirrors sell_package (same reasons, same bounds).
const TODAY = "2026-11-20";
const row = (dueOn, amountPaise) => ({ dueOn, amountPaise });
const generated = buildInstallmentRows({ totalPaise: 100000, count: 3, firstDueOn: TODAY });
assert.deepEqual(validateInstallmentSchedule(generated, 100000, TODAY), { ok: true, sumPaise: 100000 });
assert.equal(validateInstallmentSchedule(generated, 100001, TODAY).reason, "sum");
assert.equal(validateInstallmentSchedule(generated, 99999, TODAY).reason, "sum");
assert.equal(validateInstallmentSchedule(generated, 0, TODAY).reason, "total");
assert.equal(validateInstallmentSchedule([], 100, TODAY).reason, "count");
assert.equal(validateInstallmentSchedule(Array.from({ length: 121 }, () => row(TODAY, 1)), 121, TODAY).reason, "count");
assert.deepEqual(validateInstallmentSchedule(Array.from({ length: 120 }, () => row(TODAY, 1)), 120, TODAY), { ok: true, sumPaise: 120 });
assert.equal(validateInstallmentSchedule([row(TODAY, 0), row(TODAY, 100)], 100, TODAY).reason, "amount");
assert.equal(validateInstallmentSchedule([row(TODAY, -5), row(TODAY, 105)], 100, TODAY).reason, "amount");
assert.equal(validateInstallmentSchedule([row(TODAY, 10.5)], 10, TODAY).reason, "amount");
assert.equal(validateInstallmentSchedule([row(TODAY, 10_000_000_000)], 10_000_000_000, TODAY).reason, "total");
assert.equal(validateInstallmentSchedule([row("2026-02-30", 100)], 100, TODAY).reason, "date");
assert.equal(validateInstallmentSchedule([row("tomorrow", 100)], 100, TODAY).reason, "date");
assert.equal(validateInstallmentSchedule([row("2026-11-21", 50), row("2026-11-20", 50)], 100, TODAY).reason, "order");
assert.deepEqual(validateInstallmentSchedule([row("2026-11-20", 50), row("2026-11-20", 50)], 100, TODAY), { ok: true, sumPaise: 100 });
assert.equal(validateInstallmentSchedule([row(addDaysToIsoDate(TODAY, -366), 100)], 100, TODAY).ok, true);
assert.equal(validateInstallmentSchedule([row(addDaysToIsoDate(TODAY, -367), 100)], 100, TODAY).reason, "range");
assert.equal(validateInstallmentSchedule([row(addDaysToIsoDate(TODAY, 3660), 100)], 100, TODAY).ok, true);
assert.equal(validateInstallmentSchedule([row(addDaysToIsoDate(TODAY, 3661), 100)], 100, TODAY).reason, "range");

// Upfront: balance = price_total - paid.
const upfront = (paid) =>
  summarizePackageMoney({
    plan: "upfront", priceTotal: 1000, pricePerSession: null, installments: [],
    payments: paid.map((amount) => ({ amount })), sessions: [], today: TODAY,
  });
assert.deepEqual(upfront([]), {
  plan: "upfront", owedPaise: 100000, paidPaise: 0, balancePaise: 100000, dueToDatePaise: 100000, overduePaise: 0, overpaidPaise: 0,
});
assert.equal(upfront([400]).balancePaise, 60000);
assert.equal(upfront([400, 600]).balancePaise, 0);
assert.equal(upfront([400, 599.99]).balancePaise, 1);
assert.equal(upfront([0.1, 0.2]).paidPaise, 30, "no float drift: 0.1 + 0.2 is exactly 30 paise");
assert.equal(upfront([1100]).balancePaise, 0, "balance is never negative");
assert.equal(upfront([1100]).overpaidPaise, 10000, "an impossible overpayment is flagged, not hidden");
assert.equal(upfront([]).overduePaise, 0);

// Installments: due to date counts only rows due on or before today; overdue = max(0, due to date - paid).
const schedule = [
  { seq: 1, due_on: "2026-11-01", amount: 300 },
  { seq: 2, due_on: "2026-11-20", amount: 300 },
  { seq: 3, due_on: "2026-12-20", amount: 300 },
];
const installments = (paid, today = TODAY) =>
  summarizePackageMoney({
    plan: "installments", priceTotal: 900, pricePerSession: null, installments: schedule,
    payments: paid.map((amount) => ({ amount })), sessions: [], today,
  });
assert.equal(installments([]).dueToDatePaise, 60000, "due today counts as due");
assert.equal(installments([]).overduePaise, 60000);
assert.equal(installments([]).balancePaise, 90000);
assert.equal(installments([300]).overduePaise, 30000);
assert.equal(installments([600]).overduePaise, 0);
assert.equal(installments([600]).balancePaise, 30000);
assert.equal(installments([900]).balancePaise, 0);
assert.equal(installments([], "2026-10-31").dueToDatePaise, 0, "nothing due before the first date");
assert.equal(installments([], "2026-10-31").overduePaise, 0);
assert.equal(installments([], "2026-11-19").dueToDatePaise, 30000);
assert.equal(installments([], "2027-01-01").dueToDatePaise, 90000);
assert.equal(installments([1000]).overduePaise, 0, "overdue is never negative");

// Overdue is judged in the CLINIC time zone: the same instant is a different calendar day in IST and UTC.
const instant = new Date("2026-11-20T20:00:00Z");
const todayIst = zonedNow(instant, "Asia/Kolkata").date;
const todayUtc = zonedNow(instant, "UTC").date;
assert.equal(todayIst, "2026-11-21");
assert.equal(todayUtc, "2026-11-20");
const scheduleTz = [{ seq: 1, due_on: "2026-11-21", amount: 100 }];
const overdueIn = (today) =>
  summarizePackageMoney({
    plan: "installments", priceTotal: 100, pricePerSession: null, installments: scheduleTz, payments: [], sessions: [], today,
  }).overduePaise;
assert.equal(overdueIn(todayIst), 10000, "due on 21 Nov is due for a clinic in IST at 20:00 UTC on 20 Nov");
assert.equal(overdueIn(todayUtc), 0, "but not yet due for a UTC clinic");

// Row states: oldest first allocation; rows due on or before today add up to the overdue amount.
const states = allocateInstallments(schedule, 450 * 100, TODAY);
assert.deepEqual(states.map((item) => [item.seq, item.paidPaise, item.outstandingPaise, item.state]), [
  [1, 30000, 0, "paid"],
  [2, 15000, 15000, "due"],
  [3, 0, 30000, "upcoming"],
]);
assert.equal(allocateInstallments(schedule, 0, TODAY)[0].state, "overdue");
assert.equal(allocateInstallments(schedule, 0, TODAY)[1].state, "due");
assert.deepEqual(allocateInstallments([...schedule].reverse(), 30000, TODAY).map((item) => item.seq), [1, 2, 3]);

// Per visit: accrued = price x (completed + forfeited where charge_on_forfeit); balance = accrued - paid.
const pv = (sessions, paid, price = 500) =>
  summarizePackageMoney({
    plan: "per_visit", priceTotal: null, pricePerSession: price, installments: [],
    payments: paid.map((amount) => ({ amount })), sessions, today: TODAY,
  });
const pvSessions = [
  { status: "completed" },
  { status: "forfeited", charge_on_forfeit: true },
  { status: "forfeited", charge_on_forfeit: false },
  { status: "rolled_over" },
  { status: "scheduled" },
  { status: "missed_pending" },
  { status: "voided" },
];
assert.equal(pv(pvSessions, []).owedPaise, 100000, "completed + charged forfeit accrue; the rest do not");
assert.equal(pv(pvSessions, [500]).balancePaise, 50000);
assert.equal(pv(pvSessions, [1000]).balancePaise, 0);
assert.equal(pv([], []).owedPaise, 0);
assert.equal(pv([{ status: "forfeited", charge_on_forfeit: false }], []).owedPaise, 0, "forfeit without charge accrues nothing");
assert.equal(pv([{ status: "forfeited", charge_on_forfeit: null }], []).owedPaise, 0);
assert.equal(pv([{ status: "forfeited", charge_on_forfeit: true }], []).owedPaise, 50000);
assert.equal(pv(pvSessions, []).overduePaise, 0);
assert.equal(pv(pvSessions, [], 0.1).owedPaise, 20, "per-visit price in paise, no float drift");

// Chargeable sessions and per-session outstanding.
assert.equal(isChargeableSession({ status: "completed" }), true);
assert.equal(isChargeableSession({ status: "forfeited", charge_on_forfeit: true }), true);
assert.equal(isChargeableSession({ status: "forfeited", charge_on_forfeit: false }), false);
assert.equal(isChargeableSession({ status: "rolled_over" }), false);
const outstanding = perVisitOutstanding(
  [{ id: "a", status: "completed" }, { id: "b", status: "forfeited", charge_on_forfeit: true }, { id: "c", status: "forfeited", charge_on_forfeit: false }, { id: "d", status: "scheduled" }],
  [{ session_id: "a", amount: 500 }, { session_id: "b", amount: 200 }],
  50000,
);
assert.deepEqual(outstanding, [{ sessionId: "b", paidPaise: 20000, outstandingPaise: 30000 }]);
assert.equal(suggestedPaymentPaise({ plan: "upfront", balancePaise: 60000, sessionOutstandingPaise: null }), 60000);
assert.equal(suggestedPaymentPaise({ plan: "per_visit", balancePaise: 90000, sessionOutstandingPaise: 30000 }), 30000);
assert.equal(suggestedPaymentPaise({ plan: "per_visit", balancePaise: 90000, sessionOutstandingPaise: null }), 0);

// Payment rules mirror record_package_payment.
const payBase = {
  plan: "upfront", packageStatus: "active", kind: "upfront", amountPaise: 10000, priceTotalPaise: 100000,
  pricePerSessionPaise: 0, paidPaise: 0, sessionId: null, session: null,
};
assert.deepEqual(checkPayment(payBase), { ok: true });
assert.deepEqual(checkPayment({ ...payBase, amountPaise: 100000 }), { ok: true });
assert.deepEqual(checkPayment({ ...payBase, amountPaise: 100001 }), { ok: false, reason: "exceeds" });
assert.deepEqual(checkPayment({ ...payBase, paidPaise: 99999, amountPaise: 2 }), { ok: false, reason: "exceeds" });
assert.deepEqual(checkPayment({ ...payBase, amountPaise: 0 }), { ok: false, reason: "invalid_amount" });
assert.deepEqual(checkPayment({ ...payBase, amountPaise: -1 }), { ok: false, reason: "invalid_amount" });
assert.deepEqual(checkPayment({ ...payBase, amountPaise: 10.5 }), { ok: false, reason: "invalid_amount" });
assert.deepEqual(checkPayment({ ...payBase, amountPaise: Number.NaN }), { ok: false, reason: "invalid_amount" });
assert.deepEqual(checkPayment({ ...payBase, kind: "installment" }), { ok: false, reason: "kind_mismatch" });
assert.deepEqual(checkPayment({ ...payBase, kind: "per_visit" }), { ok: false, reason: "kind_mismatch" });
assert.deepEqual(checkPayment({ ...payBase, sessionId: "s" }), { ok: false, reason: "session_not_allowed" });
assert.deepEqual(checkPayment({ ...payBase, packageStatus: "cancelled" }), { ok: false, reason: "cancelled" });
assert.deepEqual(checkPayment({ ...payBase, packageStatus: "completed" }), { ok: true }, "a completed package still takes its balance");
assert.deepEqual(checkPayment({ ...payBase, plan: "installments", kind: "installment" }), { ok: true });
assert.deepEqual(checkPayment({ ...payBase, plan: "installments", kind: "upfront" }), { ok: false, reason: "kind_mismatch" });

const pvPay = {
  plan: "per_visit", packageStatus: "active", kind: "per_visit", amountPaise: 50000, priceTotalPaise: 0,
  pricePerSessionPaise: 50000, paidPaise: 0, sessionId: "s1", session: { status: "completed", paidPaise: 0 },
};
assert.deepEqual(checkPayment(pvPay), { ok: true });
assert.deepEqual(checkPayment({ ...pvPay, amountPaise: 50001 }), { ok: false, reason: "exceeds" });
assert.deepEqual(checkPayment({ ...pvPay, session: { status: "completed", paidPaise: 1 } }), { ok: false, reason: "exceeds" });
assert.deepEqual(checkPayment({ ...pvPay, session: { status: "forfeited", charge_on_forfeit: true, paidPaise: 20000 }, amountPaise: 30000 }), { ok: true });
assert.deepEqual(checkPayment({ ...pvPay, sessionId: null }), { ok: false, reason: "session_required" });
assert.deepEqual(checkPayment({ ...pvPay, session: null }), { ok: false, reason: "session_not_found" });
for (const status of ["rolled_over", "scheduled", "missed_pending", "voided"]) {
  assert.deepEqual(checkPayment({ ...pvPay, session: { status, paidPaise: 0 } }), { ok: false, reason: "session_not_chargeable" }, status);
}
assert.deepEqual(
  checkPayment({ ...pvPay, session: { status: "forfeited", charge_on_forfeit: false, paidPaise: 0 } }),
  { ok: false, reason: "session_not_chargeable" },
  "forfeit without charge accrues nothing and cannot be paid against",
);
assert.deepEqual(checkPayment({ ...pvPay, kind: "upfront" }), { ok: false, reason: "kind_mismatch" });
assert.deepEqual(checkPayment({ ...pvPay, packageStatus: "cancelled" }), { ok: true }, "per-visit visits already delivered can settle after a cancel");

// Seeded random walk over a model of the database: balance never negative, paid never above the plan total (or the
// accrued amount per visit), overdue equals the outstanding of the rows already due, rows add up to the total.
const walkToday = "2026-11-20";
let accepted = 0;
let rejected = 0;
for (let run = 0; run < 300; run += 1) {
  const plan = ["upfront", "installments", "per_visit"][Math.floor(random() * 3)];
  const pricePaise = (1 + Math.floor(random() * 500)) * 100 + Math.floor(random() * 100);
  const perSessionPaise = (1 + Math.floor(random() * 50)) * 100;
  const count = 1 + Math.floor(random() * 6);
  const rows =
    plan === "installments"
      ? buildInstallmentRows({
          totalPaise: pricePaise,
          count,
          firstDueOn: addDaysToIsoDate(walkToday, Math.floor(random() * 90) - 60),
        })
      : [];
  if (plan === "installments") {
    assert.equal(validateInstallmentSchedule(rows, pricePaise, walkToday).ok, true, "generated schedules always validate");
  }
  const model = { status: "active", sessions: [], payments: [], nextId: 1 };
  const money = () =>
    summarizePackageMoney({
      plan,
      priceTotal: plan === "per_visit" ? null : paiseToMoney(pricePaise),
      pricePerSession: plan === "per_visit" ? paiseToMoney(perSessionPaise) : null,
      installments: rows.map((item, index) => ({ seq: index + 1, due_on: item.dueOn, amount: paiseToMoney(item.amountPaise) })),
      payments: model.payments.map((payment) => ({ amount: paiseToMoney(payment.amountPaise) })),
      sessions: model.sessions,
      today: walkToday,
    });

  for (let step = 0; step < 40; step += 1) {
    const action = Math.floor(random() * 6);
    if (action === 0 && plan === "per_visit" && model.status === "active") {
      const status = ["completed", "completed", "forfeited", "forfeited", "rolled_over", "scheduled"][Math.floor(random() * 6)];
      model.sessions.push({ id: `s${model.nextId++}`, status, charge_on_forfeit: status === "forfeited" ? random() < 0.5 : null });
    } else if (action === 1 && model.sessions.length > 0) {
      // Status correction of a visit: allowed only while no payment is pinned to it (the C1 appointments trigger).
      const session = model.sessions[Math.floor(random() * model.sessions.length)];
      const pinned = model.payments.some((payment) => payment.sessionId === session.id);
      if (session.status === "completed" && !pinned) session.status = "scheduled";
      else if (session.status === "scheduled") session.status = "completed";
    } else if (action === 2 && model.status === "active" && random() < 0.15) {
      model.status = "cancelled";
      for (const session of model.sessions) {
        if (session.status === "scheduled" || session.status === "missed_pending") session.status = "voided";
      }
    } else {
      const session = model.sessions.length > 0 && random() < 0.85 ? model.sessions[Math.floor(random() * model.sessions.length)] : null;
      const kind = random() < 0.9 ? PAYMENT_KIND_FOR_PLAN[plan] : PACKAGE_PAYMENT_KINDS[Math.floor(random() * 3)];
      const amountPaise = 1 + Math.floor(random() * (plan === "per_visit" ? perSessionPaise : pricePaise) * 1.3);
      const sessionId = plan === "per_visit" ? (session ? session.id : null) : random() < 0.05 && session ? session.id : null;
      const sessionPaid = session
        ? model.payments.filter((payment) => payment.sessionId === session.id).reduce((sum, payment) => sum + payment.amountPaise, 0)
        : 0;
      const verdict = checkPayment({
        plan, packageStatus: model.status, kind, amountPaise,
        priceTotalPaise: plan === "per_visit" ? 0 : pricePaise, pricePerSessionPaise: plan === "per_visit" ? perSessionPaise : 0,
        paidPaise: money().paidPaise, sessionId,
        session: sessionId !== null && session ? { status: session.status, charge_on_forfeit: session.charge_on_forfeit, paidPaise: sessionPaid } : null,
      });
      if (verdict.ok) {
        model.payments.push({ amountPaise, sessionId });
        accepted += 1;
      } else {
        rejected += 1;
      }
    }

    const summary = money();
    assert.ok(summary.balancePaise >= 0, "balance never negative");
    assert.equal(summary.overpaidPaise, 0, `paid never exceeds owed (run ${run}, step ${step}, ${plan})`);
    assert.ok(summary.overduePaise >= 0);
    if (plan === "installments") {
      assert.ok(summary.paidPaise <= pricePaise, "paid never exceeds the total");
      const allocated = allocateInstallments(
        rows.map((item, index) => ({ seq: index + 1, due_on: item.dueOn, amount: paiseToMoney(item.amountPaise) })),
        summary.paidPaise,
        walkToday,
      );
      const dueOutstanding = allocated.filter((item) => item.due_on <= walkToday).reduce((sum, item) => sum + item.outstandingPaise, 0);
      assert.equal(dueOutstanding, summary.overduePaise, "outstanding of the rows already due equals the overdue amount");
      assert.equal(allocated.reduce((sum, item) => sum + item.paidPaise, 0), summary.paidPaise);
      assert.equal(rows.reduce((sum, item) => sum + item.amountPaise, 0), pricePaise);
    }
    if (plan === "per_visit") {
      assert.ok(summary.paidPaise <= summary.owedPaise, "paid never exceeds accrued");
      for (const session of model.sessions) {
        const paid = model.payments.filter((payment) => payment.sessionId === session.id).reduce((sum, payment) => sum + payment.amountPaise, 0);
        assert.ok(paid <= perSessionPaise, "no session is paid above its price");
        if (paid > 0) assert.equal(isChargeableSession(session), true, "payments only ever pin chargeable visits");
      }
    }
  }
}
assert.ok(accepted > 500 && rejected > 500, `random walk exercised both outcomes (accepted ${accepted}, rejected ${rejected})`);

console.log("check-package-ledger: all assertions passed");
