---
phase: quick-261114-22k
plan: B
subsystem: scheduling-reminders
tags: [client_settings, reminders, timezone, appointments, my-profile]
requires:
  - client_settings table and scheduling namespace registry (Wave 1, migration 20261119_client_settings.sql)
provides:
  - reminders namespace (clinic-wide lead_minutes) in the client_settings registry
  - pure reminder window module (zoned now, horizon days, due list, lead label)
  - My Profile appointment reminder card (lead time presets and custom, clinic time zone)
  - cross-device refresh of lead time and zone (focus, same-tab event, 5 minute poll)
affects: [Wave 4 calendar sync (shares scheduling.timezone)]
tech-stack:
  added: []
  patterns: [import-free pure module with node assertion script, settings carried by ref so the scan timer never restarts]
key-files:
  created:
    - src/lib/appointment-reminder-window.ts
    - src/components/dashboard/appointment-reminder-settings-card.tsx
    - scripts/check-reminder-window.mjs
  modified:
    - src/lib/client-settings-types.ts
    - src/hooks/use-appointment-reminders.ts
    - src/contexts/order-alert-context.tsx
    - src/components/dashboard/appointment-reminders-bell.tsx
    - src/components/dashboard/tabs/summary-tab.tsx
    - scripts/check-client-settings.mjs
    - .planning/codebase/CHANGELOG.md
    - .planning/codebase/CONCERNS.md
    - .planning/codebase/INTEGRATIONS.md
    - .planning/codebase/STRUCTURE.md
decisions:
  - "No migration for Wave 2: values live in client_settings jsonb; the live namespace check pattern already accepts reminders"
  - "Fired key uses the appointment's own date (id|appointment date|start) so a tomorrow look-ahead alert does not refire once tomorrow becomes today; identical to the old key for today rows"
  - "getReminderHorizonDays takes an optional nowMinutes so a short lead near midnight (for example 23:58 plus 5 minutes) also looks at tomorrow; with the default 0 it matches the spec values 5 -> 0, 1440 -> 1, 1500 -> 2"
metrics:
  duration: "about 1 session"
  completed: 2026-11-19
status: complete
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
plan_head_before: e117498acf1afd5394ec5eb4c15f88fc06748072
plan_head_after: 693ba5265b7d53fdb6048b2bd0bc318116aafcfb
---

# Phase quick-261114-22k Plan B: Wave 2 (clinic-wide reminder lead time, time zone, look-ahead) Summary

Appointment reminder lead time is now one value per clinic (`client_settings` namespace `reminders`), editable on My Profile, and the reminder scan uses the clinic time zone (`scheduling.timezone`) and looks across midnight when the lead needs it. No migration is needed. Wave 3 and later were not started.

## Tasks

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 3 | Tracer: clinic-wide lead time saved on My Profile and used by every device | bbac9b8 | `client-settings-types.ts`, `use-appointment-reminders.ts`, `order-alert-context.tsx`, `appointment-reminder-settings-card.tsx`, `summary-tab.tsx`, `check-client-settings.mjs` |
| 4 | Time zone aware reminder window, multi-day look-ahead, cross-device refresh | 693ba52 | `appointment-reminder-window.ts`, `use-appointment-reminders.ts`, `order-alert-context.tsx`, settings card, `appointment-reminders-bell.tsx`, `check-reminder-window.mjs`, four codebase docs |

## Migration

None needed. `client_settings` is jsonb and its namespace check (`^[a-z][a-z0-9_]{0,39}$`) already accepts `reminders`. The only prerequisite is the Wave 1 file `20261119_client_settings.sql` (authored, not applied by anyone yet per the Wave 1 summary). Without that table the settings load fails and the hook falls back to defaults (5 minutes, Asia/Kolkata) with an error state, so behaviour stays as before.

## Verification

- `npx tsc --noEmit`: exit 0 after each task and at the end.
- `node scripts/check-client-settings.mjs`: all assertions passed (now also covers `reminders`: defaults for null, non-object, unknown keys and wrong types; rounding and clamping to 1..1440; strict save rejects 0, 1441, fractions, strings and extra keys; unknown namespaces still rejected).
- `node scripts/check-reminder-window.mjs`: all assertions passed (zonedNow for Asia/Kolkata and America/New_York for the same instant, midnight as minute 0, invalid zone fallback; horizon 5 -> 0, 1440 -> 1, 1500 -> 2; tomorrow 09:00 with now 10:00 is 1380 minutes away, due at lead 1440 and not at 60; cancelled, completed, past and unparseable rows skipped; midnight rollover; formatLeadLabel 15 minutes, 1 hour, 1 day). Node prints a harmless MODULE_TYPELESS_PACKAGE_JSON warning.
- `npm run build`: exit 0 (compiled successfully, 5/5 static pages), run after Task 4 code and before the docs edit.
- NOT verified (no browser, no live DB, no migration applied): the settings card on My Profile at 320px and desktop, saving and reading `client_settings` rows, two-device propagation, a real alert firing, a doctor tenant versus a tenant without `doctor-summary` (the card hides through `remindersApplicable`; code-reviewed only), the time zone select contents in real browsers.

## Deviations from Plan

**1. [Rule 1 - Bug avoided] Fired key uses the appointment date, not today's date.** The old key was `id|today|start`. With a multi-day look-ahead, a tomorrow row that alerted today would refire tomorrow under a new date. The key is now `id|appointment date|start`; for today's rows it is byte-identical to the old key, so no existing fired entry re-alerts. Commit 693ba52.

**2. [Rule 2 - Missing critical] Horizon also accounts for the clock near midnight.** The spec formula (lead < 1440 gives 0) misses a 5 minute lead at 23:58 for a 00:02 appointment. `getReminderHorizonDays(lead, nowMinutes = 0)` adds that case; the spec values are unchanged. Commit 693ba52.

**3. [Scope note] Bell copy changed in Task 4 only.** Between commits bbac9b8 and 693ba52 the bell toggle text still reads "5 min" even if a different lead is saved, because the plan lists the bell under Task 4. Both commits are in this run.

**4. [Scope note] STRUCTURE.md and INTEGRATIONS.md also touched.** The plan lists only CHANGELOG and CONCERNS for Task 4; new files and the new namespace are recorded in STRUCTURE and INTEGRATIONS per convention C-8.

No Rule 4 items. No auth gates. `public.employees`, `public.people`, HRM keys 023-026 and Wave 1 migrations not touched.

## Known Stubs

None.

## Needs user action (nothing below has been done)

1. No migration to apply for Wave 2. Make sure the Wave 1 migrations are applied first (`20261119_staff_members.sql`, `20261119_client_settings.sql`, then deploy, then `20261119_staff_tab_access.sql` last).
2. Human checks after deploy: set lead 15 on device one, confirm device two (alerts On) alerts for an appointment 12 minutes away within about 5 minutes of the change; set a non-IST zone and lead 1 day and confirm a tomorrow-morning appointment alerts once at the right local time and the bell lists it as "Tomorrow"; confirm a tenant without `doctor-summary` never shows the card or scans; check the card at 320px.
3. Known limits recorded in CONCERNS: other screens still use IST, reminders work only while the tab is open, gate not widened (OQ-2).

## Threat Flags

None. No new endpoints, secrets or tables; settings writes go through the existing own-client RLS table with strict client-side validation and `client_id` taken from `useApp()`.

## Self-Check: PASSED

- Files exist: appointment-reminder-window.ts, appointment-reminder-settings-card.tsx, check-reminder-window.mjs and all modified files are in commits bbac9b8 and 693ba52.
- Commits exist on HEAD: bbac9b8, 693ba52 (`git rev-list --count e117498..HEAD` = 2).
