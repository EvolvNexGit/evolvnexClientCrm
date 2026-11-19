// Assertion script for the pure reminder window module (no test runner in this repo).
// Run: node scripts/check-reminder-window.mjs
import assert from "node:assert/strict";
import {
  computeReminders,
  describeWait,
  formatLeadLabel,
  getReminderHorizonDays,
  shiftIsoDate,
  zonedNow,
} from "../src/lib/appointment-reminder-window.ts";

// zonedNow: same instant, Asia/Kolkata (UTC+5:30) versus a zone behind UTC (New York, EST in January).
const instant = new Date("2026-01-15T04:30:00Z");
assert.deepEqual(zonedNow(instant, "Asia/Kolkata"), { date: "2026-01-15", minutes: 600 });
assert.deepEqual(zonedNow(instant, "America/New_York"), { date: "2026-01-14", minutes: 23 * 60 + 30 });
// Local midnight is minute 0 of the new day, never 24:00 of the old one.
assert.deepEqual(zonedNow(new Date("2026-01-14T18:30:00Z"), "Asia/Kolkata"), { date: "2026-01-15", minutes: 0 });
// An unusable zone falls back to Asia/Kolkata instead of throwing.
assert.deepEqual(zonedNow(instant, "Not/AZone"), { date: "2026-01-15", minutes: 600 });

// shiftIsoDate crosses month and year boundaries; invalid input is returned unchanged.
assert.equal(shiftIsoDate("2026-01-31", 1), "2026-02-01");
assert.equal(shiftIsoDate("2026-12-31", 2), "2027-01-02");
assert.equal(shiftIsoDate("garbage", 1), "garbage");

// Horizon: lead 5 -> 0, 1440 -> 1, 1500 -> 2.
assert.equal(getReminderHorizonDays(5), 0);
assert.equal(getReminderHorizonDays(60), 0);
assert.equal(getReminderHorizonDays(1439), 0);
assert.equal(getReminderHorizonDays(1440), 1);
assert.equal(getReminderHorizonDays(1500), 2);
assert.equal(getReminderHorizonDays(0), 0);
assert.equal(getReminderHorizonDays(Number.NaN), 0);
// A short lead close to midnight still reaches into tomorrow.
assert.equal(getReminderHorizonDays(5, 1435), 1);
assert.equal(getReminderHorizonDays(5, 1434), 0);
assert.equal(getReminderHorizonDays(1440, 600), 1);

const base = { name: "Asha", service: "Checkup", status: "booked" };
const tomorrow = { id: "t1", ...base, date: "2026-01-16", timeLabel: "09:00" };

// Tomorrow 09:00, now today 10:00: 1380 minutes away; due with lead 1440, not with lead 60.
const wide = computeReminders({ nowDate: "2026-01-15", nowMinutes: 600, rows: [tomorrow], leadMinutes: 1440 });
assert.equal(wide.length, 1);
assert.equal(wide[0].minutesUntil, 1380);
assert.equal(wide[0].dueSoon, true);
assert.equal(wide[0].dayOffset, 1);
assert.equal(wide[0].date, "2026-01-16");
const narrow = computeReminders({ nowDate: "2026-01-15", nowMinutes: 600, rows: [tomorrow], leadMinutes: 60 });
assert.equal(narrow[0].minutesUntil, 1380);
assert.equal(narrow[0].dueSoon, false);

// Today: due inside the lead window, not at exactly zero, not beyond it.
const today = (id, timeLabel, extra = {}) => ({ id, ...base, date: "2026-01-15", timeLabel, ...extra });
const todayRows = computeReminders({
  nowDate: "2026-01-15",
  nowMinutes: 600,
  leadMinutes: 15,
  rows: [today("a", "10:12"), today("b", "10:00"), today("c", "11:00"), today("d", "09:59")],
});
assert.deepEqual(
  todayRows.map((row) => [row.id, row.minutesUntil, row.dueSoon]),
  [
    ["b", 0, false],
    ["a", 12, true],
    ["c", 60, false],
  ],
);

// Cancelled and completed rows, past times and unusable rows are skipped.
const skipped = computeReminders({
  nowDate: "2026-01-15",
  nowMinutes: 600,
  leadMinutes: 60,
  rows: [
    today("x1", "10:30", { status: "cancelled" }),
    today("x2", "10:30", { status: "completed" }),
    today("x3", "09:00"),
    today("x4", "not-a-time"),
    { id: "x5", ...base, date: null, timeLabel: "10:30" },
    { id: "x6", ...base, date: "2026-13-40", timeLabel: "10:30" },
    today("ok", "10:30", { status: "tentative" }),
  ],
});
assert.deepEqual(skipped.map((row) => row.id), ["ok"]);

// Seconds in the time label are tolerated; midnight rollover counts the next day's early slot.
const rollover = computeReminders({
  nowDate: "2026-01-15",
  nowMinutes: 1438,
  leadMinutes: 5,
  rows: [{ id: "r1", ...base, date: "2026-01-16", timeLabel: "00:02:00" }],
});
assert.equal(rollover[0].minutesUntil, 4);
assert.equal(rollover[0].dueSoon, true);

// Invalid "today" yields nothing rather than throwing.
assert.deepEqual(computeReminders({ nowDate: "bad", nowMinutes: 0, rows: [tomorrow], leadMinutes: 5 }), []);

// formatLeadLabel.
assert.equal(formatLeadLabel(15), "15 minutes");
assert.equal(formatLeadLabel(1), "1 minute");
assert.equal(formatLeadLabel(60), "1 hour");
assert.equal(formatLeadLabel(120), "2 hours");
assert.equal(formatLeadLabel(90), "90 minutes");
assert.equal(formatLeadLabel(1440), "1 day");
assert.equal(formatLeadLabel(5), "5 minutes");

// describeWait.
assert.equal(describeWait(0), "Starting now");
assert.equal(describeWait(12), "in 12 min");
assert.equal(describeWait(120), "in 2 h");
assert.equal(describeWait(125), "in 2 h 5 min");

console.log("check-reminder-window: all assertions passed");
