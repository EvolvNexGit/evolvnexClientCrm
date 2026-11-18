// Assertion script for the pure client settings registry (no test runner in this repo).
// Run: node scripts/check-client-settings.mjs
import assert from "node:assert/strict";
import {
  CLIENT_SETTINGS_DEFAULTS,
  CLIENT_SETTINGS_NAMESPACES,
  DEFAULT_SCHEDULING_TIMEZONE,
  isClientSettingsNamespace,
  isValidTimeZone,
  parseClientSettings,
  parseSchedulingSettings,
  validateClientSettings,
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
assert.deepEqual([...CLIENT_SETTINGS_NAMESPACES], ["scheduling"]);
assert.equal(isClientSettingsNamespace("scheduling"), true);
for (const unknown of ["reminders", "Scheduling", "", "calendar_sync", null, 3]) {
  assert.equal(isClientSettingsNamespace(unknown), false, `unknown namespace ${JSON.stringify(unknown)}`);
}
assert.equal(validateClientSettings("not_registered", { timezone: "Asia/Kolkata" }).ok, false);

const saved = validateClientSettings("scheduling", { timezone: "Australia/Sydney" });
assert.equal(saved.ok, true);
assert.deepEqual(parseClientSettings("scheduling", JSON.parse(JSON.stringify(saved.value))), { timezone: "Australia/Sydney" });
assert.deepEqual(parseClientSettings("scheduling", null), CLIENT_SETTINGS_DEFAULTS.scheduling);

console.log("check-client-settings: all assertions passed");
