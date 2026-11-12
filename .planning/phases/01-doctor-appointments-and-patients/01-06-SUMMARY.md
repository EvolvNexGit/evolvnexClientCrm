---
phase: 01-doctor-appointments-and-patients
plan: 06
subsystem: ui
tags: [react, nextjs, typescript, appointments, scheduling]

requires:
  - phase: 01-doctor-appointments-and-patients
    provides: "appointment-schedule.ts interval helpers, useAppointmentsRange hook, calendar (plans 01-01, 01-04)"
provides:
  - "findAppointmentConflicts and getConflictingIds pure functions"
  - "Advisory amber double-booking banner in the add/edit/reschedule modal"
  - "Amber ring, Overlap badge and legend on overlapping calendar cards"
affects: [01-07 UAT]

actuals:
  tokens: 6000
  tasks: 2
  commits: 2

plan_head_before: cff523f62afd1d78a92963de9a06cf1495e39eb8
plan_head_after: e533812caa0ce2f5204cad311697226801fc2e92
commits: 2

tech-stack:
  added: []
  patterns:
    - "Advisory client-side checks reuse a pure import-free module testable with node directly"

key-files:
  created: []
  modified:
    - src/lib/appointment-schedule.ts
    - src/components/dashboard/tabs/appointments-tab.tsx
    - src/components/dashboard/appointments-calendar.tsx

key-decisions:
  - "Conflict check is advisory only (D-04): handleSaveAppointment and Save button never read slotConflicts"
  - "Modal loads its own date's appointments via a second useAppointmentsRange instance so List view and date edits are covered"
  - "getConflictingIds reuses findAppointmentConflicts so the overlap rule exists once"

patterns-established:
  - "Half-open interval overlap: touching bookings never conflict"

requirements-completed: [APPT-02]

status: complete
---

# Phase 01 Plan 06: Double-booking warning Summary

Advisory (never blocking) overlap warning for same-staff, same-date bookings: amber banner in the appointment modal and amber ring on overlapping calendar cards.

## Accomplishments

- `findAppointmentConflicts(candidate, existing)`: same trimmed staff, same date, half-open overlap, ignores cancelled (either side) and the edited id, null end counts as one 10-minute step, sorted by start/end/id, no input mutation.
- Modal banner (`role="status"`, amber) lists up to 3 clashes plus "+N more" and "You can still save."; Save handler and button untouched.
- `getConflictingIds` drives an amber `ring-2 ring-amber-500`, "Overlap" badge, aria-label suffix and a legend line on Day/Week calendar.

## Task Commits

1. Task 1 (tracer): conflict function + modal banner - `4eaa504`
2. Task 2: calendar highlight - `e533812`

## Verification

- TS gate (excluding known web-push-server baseline): 0 errors
- node assertions: `conflict-ok`, `ids-ok`
- Static check: save handler region does not reference `slotConflicts`
- appointment-schedule.ts has no runtime imports; package.json / package-lock.json unchanged

## Deviations from Plan

Minor wording: calendar aria-label suffix reads "overlaps another booking for staff NAME" instead of "NAME's staff" (the possessive read incorrectly). No rule-based deviations otherwise.

## Known Stubs

None.

## Deferred / Human Check

Live browser check (plan Task 2 human-check) is deferred to the end-of-phase UAT (plan 01-07): touching vs overlapping bookings, banner on add and move, saving still works, cancel removes outline.

## Threat Flags

None.

## Self-Check: PASSED

Files exist, commits 4eaa504 and e533812 present in HEAD ancestry.
