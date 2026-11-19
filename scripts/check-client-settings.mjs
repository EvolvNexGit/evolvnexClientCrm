// Assertion script for the pure client settings registry (no test runner in this repo).
// Run: node scripts/check-client-settings.mjs
import assert from "node:assert/strict";
import {
  CLIENT_SETTINGS_DEFAULTS,
  CLIENT_SETTINGS_NAMESPACES,
  DEFAULT_REMINDER_LEAD_MINUTES,
  DEFAULT_SCHEDULING_TIMEZONE,
  isClientSettingsNamespace,
  isValidTimeZone,
  parseClientSettings,
  parseReminderSettings,
  parseSchedulingSettings,
  validateClientSettings,
  validateReminderSettings,
  validateSchedulingSettings,
} from "../src/lib/client-settings-types.ts";

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
assert.deepEqual([...CLIENT_SETTINGS_NAMESPACES], ["scheduling", "reminders"]);
assert.equal(isClientSettingsNamespace("scheduling"), true);
assert.equal(isClientSettingsNamespace("reminders"), true);
for (const unknown of ["Reminders", "Scheduling", "", "calendar_sync", "packages", null, 3]) {
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

console.log("check-client-settings: all assertions passed");
