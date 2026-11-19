// Assertion script for the pure client settings registry (no test runner in this repo).
// Run: node scripts/check-client-settings.mjs
import assert from "node:assert/strict";
import {
  CLIENT_SETTINGS_DEFAULTS,
  CLIENT_SETTINGS_NAMESPACES,
  DEFAULT_PACKAGE_SETTINGS,
  DEFAULT_REMINDER_LEAD_MINUTES,
  DEFAULT_SCHEDULING_TIMEZONE,
  PACKAGE_LABEL_MAX_LENGTH,
  PACKAGE_ROLLOVER_EXTENSION_MAX_DAYS,
  isClientSettingsNamespace,
  isValidTimeZone,
  parseClientSettings,
  parsePackageSettings,
  parseReminderSettings,
  parseSchedulingSettings,
  validateClientSettings,
  validatePackageSettings,
  validateReminderSettings,
  validateSchedulingSettings,
} from "../src/lib/client-settings-types.ts";
import { DEFAULT_PACKAGE_LABELS } from "../src/lib/package-types.ts";

const defaults = { timezone: DEFAULT_SCHEDULING_TIMEZONE };

// Parser returns defaults for null, non-object, unknown keys and wrong types without throwing.
for (const raw of [null, undefined, "x", 42, true, [], ["timezone"], {}, { other: 1 }, { timezone: 5 }, { timezone: null }]) {
  assert.deepEqual(parseSchedulingSettings(raw), defaults, `defaults for ${JSON.stringify(raw)}`);
}
assert.deepEqual(parseSchedulingSettings({ timezone: "Asia/Kolkata", extra: "dropped" }), defaults);

// scheduling.timezone accepts a valid IANA zone on read.
assert.deepEqual(parseSchedulingSettings({ timezone: "America/New_York" }), { timezone: "America/New_York" });
assert.deepEqual(parseSchedulingSettings({ timezone: "  Europe/London  " }), { timezone: "Europe/London" });

// Invalid strings fall back to Asia/Kolkata on read.
for (const bad of ["", "   ", "Not/AZone", "Mars/Olympus", "x".repeat(65)]) {
  assert.deepEqual(parseSchedulingSettings({ timezone: bad }), defaults, `fallback for ${JSON.stringify(bad)}`);
  assert.equal(isValidTimeZone(bad), false);
}

// Strict save rejects an invalid zone, unknown keys and non-objects; accepts a valid zone.
assert.equal(validateSchedulingSettings({ timezone: "Not/AZone" }).ok, false);
assert.equal(validateSchedulingSettings({ timezone: 7 }).ok, false);
assert.equal(validateSchedulingSettings({}).ok, false);
assert.equal(validateSchedulingSettings({ timezone: "Asia/Kolkata", extra: 1 }).ok, false);
for (const bad of [null, undefined, "x", [], 3]) {
  assert.equal(validateSchedulingSettings(bad).ok, false);
}
assert.deepEqual(validateSchedulingSettings({ timezone: "Asia/Tokyo" }), {
  ok: true,
  value: { timezone: "Asia/Tokyo" },
});

// Registry: unknown namespace is rejected, a well-formed registry namespace round-trips.
assert.deepEqual([...CLIENT_SETTINGS_NAMESPACES], ["scheduling", "reminders", "packages"]);
assert.equal(isClientSettingsNamespace("scheduling"), true);
assert.equal(isClientSettingsNamespace("reminders"), true);
assert.equal(isClientSettingsNamespace("packages"), true);
for (const unknown of ["Reminders", "Scheduling", "Packages", "", "calendar_sync", "package", null, 3]) {
  assert.equal(isClientSettingsNamespace(unknown), false, `unknown namespace ${JSON.stringify(unknown)}`);
}
assert.equal(validateClientSettings("not_registered", { timezone: "Asia/Kolkata" }).ok, false);

const saved = validateClientSettings("scheduling", { timezone: "Australia/Sydney" });
assert.equal(saved.ok, true);
assert.deepEqual(parseClientSettings("scheduling", JSON.parse(JSON.stringify(saved.value))), { timezone: "Australia/Sydney" });
assert.deepEqual(parseClientSettings("scheduling", null), CLIENT_SETTINGS_DEFAULTS.scheduling);

// reminders.lead_minutes: default 5, rounded and clamped to 1..1440 on read, never throws.
assert.equal(DEFAULT_REMINDER_LEAD_MINUTES, 5);
const reminderDefaults = { lead_minutes: 5 };
for (const raw of [null, undefined, "x", 42, [], {}, { other: 1 }, { lead_minutes: "15" }, { lead_minutes: null }, { lead_minutes: NaN }, { lead_minutes: Infinity }]) {
  assert.deepEqual(parseReminderSettings(raw), reminderDefaults, `reminder defaults for ${String(JSON.stringify(raw))}`);
}
assert.deepEqual(parseReminderSettings({ lead_minutes: 15, extra: "dropped" }), { lead_minutes: 15 });
assert.deepEqual(parseReminderSettings({ lead_minutes: 0 }), { lead_minutes: 1 });
assert.deepEqual(parseReminderSettings({ lead_minutes: -30 }), { lead_minutes: 1 });
assert.deepEqual(parseReminderSettings({ lead_minutes: 99999 }), { lead_minutes: 1440 });
assert.deepEqual(parseReminderSettings({ lead_minutes: 1440 }), { lead_minutes: 1440 });
assert.deepEqual(parseReminderSettings({ lead_minutes: 7.6 }), { lead_minutes: 8 });
assert.deepEqual(parseClientSettings("reminders", null), CLIENT_SETTINGS_DEFAULTS.reminders);

// Strict save: integer 1..1440 only, no unknown keys.
for (const bad of [{}, { lead_minutes: 0 }, { lead_minutes: 1441 }, { lead_minutes: 2.5 }, { lead_minutes: "15" }, { lead_minutes: 15, extra: 1 }, null, [], "x"]) {
  assert.equal(validateReminderSettings(bad).ok, false, `reminder save rejects ${String(JSON.stringify(bad))}`);
}
assert.deepEqual(validateReminderSettings({ lead_minutes: 1 }), { ok: true, value: { lead_minutes: 1 } });
assert.deepEqual(validateClientSettings("reminders", { lead_minutes: 1440 }), { ok: true, value: { lead_minutes: 1440 } });
const savedReminder = validateClientSettings("reminders", { lead_minutes: 30 });
assert.deepEqual(parseClientSettings("reminders", JSON.parse(JSON.stringify(savedReminder.value))), { lead_minutes: 30 });

// packages (Wave 3): missed_default, R-15 rollover_extends_validity_days, R-16 forfeit_charges_per_visit, labels.
const packageDefaults = {
  missed_default: "rollover",
  rollover_extends_validity_days: 0,
  forfeit_charges_per_visit: true,
  labels: { package: "Package", packages: "Packages", session: "Session", sessions: "Sessions" },
};
assert.deepEqual(DEFAULT_PACKAGE_SETTINGS, packageDefaults);
assert.deepEqual(CLIENT_SETTINGS_DEFAULTS.packages, packageDefaults);
assert.equal(PACKAGE_ROLLOVER_EXTENSION_MAX_DAYS, 365);
assert.equal(PACKAGE_LABEL_MAX_LENGTH, 30);
// The registry labels default must match the UI default vocabulary.
assert.deepEqual(DEFAULT_PACKAGE_SETTINGS.labels, DEFAULT_PACKAGE_LABELS);

// Reader never throws; defaults for null, non-object, unknown keys and wrong types.
for (const raw of [null, undefined, "x", 42, true, [], {}, { other: 1 }, { missed_default: "ROLLOVER" },
  { missed_default: 1 }, { rollover_extends_validity_days: "7" }, { rollover_extends_validity_days: null },
  { rollover_extends_validity_days: NaN }, { rollover_extends_validity_days: Infinity },
  { forfeit_charges_per_visit: "false" }, { forfeit_charges_per_visit: 0 }, { labels: "x" }, { labels: [] }]) {
  assert.deepEqual(parsePackageSettings(raw), packageDefaults, `package defaults for ${String(JSON.stringify(raw))}`);
}
assert.deepEqual(parseClientSettings("packages", null), packageDefaults);

// Each key independently: valid values kept, bad ones defaulted.
assert.equal(parsePackageSettings({ missed_default: "forfeit" }).missed_default, "forfeit");
assert.equal(parsePackageSettings({ forfeit_charges_per_visit: false }).forfeit_charges_per_visit, false);
assert.equal(parsePackageSettings({ forfeit_charges_per_visit: true }).forfeit_charges_per_visit, true);
// Extension bounds: rounded and clamped to 0..365 (same rule as public.package_settings_for).
for (const [raw, expected] of [[0, 0], [7, 7], [7.4, 7], [7.5, 8], [365, 365], [366, 365], [100000, 365], [-1, 0], [-0.4, 0], [1e300, 365]]) {
  assert.equal(parsePackageSettings({ rollover_extends_validity_days: raw }).rollover_extends_validity_days, expected, `extension ${raw}`);
}
// Labels: trimmed, 1..30 chars, per-key fallback, unknown label keys dropped.
assert.deepEqual(
  parsePackageSettings({ labels: { package: "  Course ", packages: "", session: "x".repeat(31), sessions: "Visits", extra: "y" } }).labels,
  { package: "Course", packages: "Packages", session: "Session", sessions: "Visits" },
);
assert.deepEqual(parsePackageSettings({ labels: { package: "x".repeat(30) } }).labels.package, "x".repeat(30));

// Strict save.
const goodPackages = {
  missed_default: "forfeit",
  rollover_extends_validity_days: 14,
  forfeit_charges_per_visit: false,
  labels: { package: " Membership ", packages: "Memberships", session: "Visit", sessions: "Visits" },
};
assert.deepEqual(validatePackageSettings(goodPackages), {
  ok: true,
  value: { ...goodPackages, labels: { ...goodPackages.labels, package: "Membership" } },
});
assert.equal(validateClientSettings("packages", packageDefaults).ok, true);
for (const [label, bad] of [
  ["not object", null],
  ["array", []],
  ["missing key", { missed_default: "rollover", rollover_extends_validity_days: 0, labels: packageDefaults.labels }],
  ["unknown key", { ...packageDefaults, extra: 1 }],
  ["bad default", { ...packageDefaults, missed_default: "keep" }],
  ["extension -1", { ...packageDefaults, rollover_extends_validity_days: -1 }],
  ["extension 366", { ...packageDefaults, rollover_extends_validity_days: 366 }],
  ["extension fraction", { ...packageDefaults, rollover_extends_validity_days: 1.5 }],
  ["extension string", { ...packageDefaults, rollover_extends_validity_days: "7" }],
  ["charge string", { ...packageDefaults, forfeit_charges_per_visit: "true" }],
  ["charge missing", { missed_default: "rollover", rollover_extends_validity_days: 0, labels: packageDefaults.labels }],
  ["labels missing key", { ...packageDefaults, labels: { package: "A", packages: "B", session: "C" } }],
  ["labels unknown key", { ...packageDefaults, labels: { ...packageDefaults.labels, other: "x" } }],
  ["label blank", { ...packageDefaults, labels: { ...packageDefaults.labels, session: "   " } }],
  ["label too long", { ...packageDefaults, labels: { ...packageDefaults.labels, session: "x".repeat(31) } }],
  ["label number", { ...packageDefaults, labels: { ...packageDefaults.labels, session: 5 } }],
]) {
  assert.equal(validatePackageSettings(bad).ok, false, `package save rejects ${label}`);
}
assert.equal(validatePackageSettings({ ...packageDefaults, rollover_extends_validity_days: 365 }).ok, true);
assert.equal(validatePackageSettings({ ...packageDefaults, rollover_extends_validity_days: 0 }).ok, true);
// Round trip through JSON as stored in client_settings.
const savedPackages = validateClientSettings("packages", goodPackages);
assert.deepEqual(parseClientSettings("packages", JSON.parse(JSON.stringify(savedPackages.value))), savedPackages.value);

console.log("check-client-settings: all assertions passed");
