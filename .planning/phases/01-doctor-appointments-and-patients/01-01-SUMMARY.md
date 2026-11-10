---
phase: 01-doctor-appointments-and-patients
plan: 01
subsystem: database
tags: [supabase, appointments, query-layer, tenancy, typescript]
status: complete

requires: []
provides:
  - "createAppointment, updateAppointment, setAppointmentStatus in src/lib/appointment-queries.ts, all scoped by client_id"
  - "fetchAppointmentsRange + APPOINTMENT_RANGE_MAX for the calendar plans"
  - "AppointmentStatus and AppointmentPayload exported types"
affects: [01-04 calendar, 01-06 conflict warning]

actuals:
  tokens: 4500
  tasks: 2
  commits: 2
plan_head_before: 902e829ab9b1f16775bf8218660670be4e5cf41c
plan_head_after: 2c5c90722594e520c8e9c66bdd2110a0e4e75670

tech-stack:
  added: []
  patterns:
    - "Zero-row write check: update(...).eq(client_id).eq(id).select('id') then throw 'Appointment not found.'"
    - "client_id written after payload spread so payload cannot override tenant"

key-files:
  created: []
  modified:
    - src/lib/appointment-queries.ts
    - src/components/dashboard/tabs/appointments-tab.tsx

key-decisions:
  - "Kept throw-error style in appointment-queries.ts (no raise()); UI maps errors with formatSupabaseError"
  - "No DB constraint on status and no patient_id column (D-07, D-08)"

requirements-completed: [APPT-03]

coverage:
  - id: D1
    description: "All appointment writes (create, update, status) live in the query layer scoped by client_id; tab has no direct Supabase table calls"
    requirement: APPT-03
    verification:
      - kind: other
        ref: "tsc gate (0 errors outside web-push-server.ts) + grep gates from plan Task 2"
        status: pass
      - kind: manual_procedural
        ref: "Task 2 human-check: add/edit/cancel/delete as doctor client; confirm client_id=eq in PATCH URLs"
        status: unknown
  - id: D2
    description: "fetchAppointmentsRange returns capped, validated, tenant-scoped rows for the calendar"
    requirement: APPT-03
    verification:
      - kind: other
        ref: "grep gate: APPOINTMENT_RANGE_MAX, Invalid date range."
        status: pass
---

# Phase 1 Plan 01: Appointment writes into the query layer Summary

Appointment create, update and status writes now go through tenant-scoped functions in `appointment-queries.ts` (with a zero-row "Appointment not found." failure), plus a capped `fetchAppointmentsRange` read for the upcoming calendar.

## Accomplishments

- Task 1 (tracer): `createAppointment` inserts `{ ...payload, client_id: clientId }`; the tab calls it, ignores re-submit while `isSaving`, types its payload as `AppointmentPayload`, and shows real Supabase errors via `formatSupabaseError`.
- Task 2: `updateAppointment` and `setAppointmentStatus` filter by `client_id` AND `id` (previously unscoped by client) and throw on zero rows; `fetchAppointmentsRange` validates ISO dates / ordering, caps at 1000 rows, orders by date then start_time. The browser Supabase client import and null checks were removed from the tab.
- List view refresh logic, filters, groups and delete flow untouched.

## Task Commits

1. Task 1: `1c80430` feat(01-01): route appointment create through query layer
2. Task 2: `2c5c907` feat(01-01): move appointment update/status writes to query layer, add range fetch

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit | grep "error TS" | grep -v web-push-server.ts | wc -l` printed 0 after each task.
- Grep gates from both tasks pass (6 `.eq("client_id", clientId)` in query file; no `getSupabaseClient`/`.from("appointments")`/`.update(`/`.insert(` in tab).
- `git diff --name-only -- package.json package-lock.json` empty (no dependency changes).
- Tracer gate: interactive mode, `human_verify_mode=end-of-phase`, automated-only verify re-run end-to-end and passed before Task 2.

## Pending Human Verification

Task 2 human-check (no browser automation in repo): as the doctor test client, add, edit, cancel via confirm modal, delete an appointment; confirm PATCH requests to `appointments` carry `client_id=eq.eafea940-a6d1-4aa2-95e2-339f614502ea` alongside `id=eq.`. Also the concurrency truth (two sessions, last write wins) is a human backstop check.

## Known Stubs

None.

## Threat Flags

None. Mitigations T-01-01 (client_id + id filters, zero-row check), T-01-02 (client_id after spread), T-01-03 (range cap and date validation) implemented.

## Self-Check: PASSED

- FOUND: src/lib/appointment-queries.ts, src/components/dashboard/tabs/appointments-tab.tsx
- FOUND commits: 1c80430, 2c5c907
