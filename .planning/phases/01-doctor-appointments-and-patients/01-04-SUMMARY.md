---
phase: 01-doctor-appointments-and-patients
plan: 04
subsystem: ui
tags: [appointments, calendar, scheduling, react, typescript]
status: complete

requires:
  - phase: 01-doctor-appointments-and-patients
    provides: "fetchAppointmentsRange and APPOINTMENT_RANGE_MAX (plan 01-01)"
provides:
  - "Pure scheduling module src/lib/appointment-schedule.ts (slots, staff columns, lane layout, week dates)"
  - "useAppointmentsRange hook with stale-response guard"
  - "AppointmentsCalendar Day and Week grid, getAppointmentStatusTone shared pill function"
  - "List | Day | Week toggle in the appointments tab with click-to-book and click-to-edit via the existing modal"
affects: [01-06 conflict warning, 01-07 UAT]

actuals:
  tokens: 13500
  tasks: 3
  commits: 3
plan_head_before: 5689779b7329d55821b59071e84a037a8b8c898c
plan_head_after: 740e94e2ea53dbf8495d43aa52924d1223b9ab75

tech-stack:
  added: []
  patterns:
    - "Import-free pure module loadable by Node type stripping for assertion checks without a test runner"
    - "Half-open interval lane layout, deterministic ordering by start, end, id"
    - "Calendar renders columns from a GridColumn abstraction shared by Day (staff) and Week (dates)"

key-files:
  created:
    - src/lib/appointment-schedule.ts
    - src/hooks/use-appointments-range.ts
    - src/components/dashboard/appointments-calendar.tsx
  modified:
    - src/components/dashboard/tabs/appointments-tab.tsx

key-decisions:
  - "Week view uses seven day columns plus an All staff chip row (design note in plan), not staff sub-columns per day"
  - "In Day/Week mode the list-only early returns (list loading/error) are gated on viewMode === list so a list failure never blocks the calendar"
  - "Rows whose date is outside the visible dates are filtered in the calendar, which also hides the previous window while a new one loads (hook keeps rows on refresh)"

patterns-established:
  - "getAppointmentStatusTone in appointments-calendar.tsx is the single source of status pill classes"

requirements-completed: [APPT-01]

coverage:
  - id: D1
    description: "Day and Week calendar with staff columns, 10-minute slots, click empty slot to book (prefilled add modal), click card to edit"
    requirement: APPT-01
    verification:
      - kind: other
        ref: "tsc gate (0 errors outside web-push-server.ts) + grep gates for all 3 tasks"
        status: pass
      - kind: other
        ref: "node assertions schedule-ok, layout-ok, week-ok on appointment-schedule.ts"
        status: pass
      - kind: manual_procedural
        ref: "Task 2 and Task 3 human-checks (browser, phone width, offline Retry)"
        status: unknown
  - id: D2
    description: "No non-deleted appointment in the visible range is silently omitted (unscheduled strip, Unassigned column, widened hours, default pill)"
    requirement: APPT-01
    verification:
      - kind: other
        ref: "splitScheduled / getVisibleRange / buildStaffColumns node assertions"
        status: pass
  - id: D3
    description: "Concurrency edge: second user's changes appear only after next refresh (accepted backstop)"
    requirement: APPT-01
    verification:
      - kind: manual_procedural
        ref: "Two browser sessions on the same tenant"
        status: unknown
---

# Phase 1 Plan 04: Day and Week appointments calendar Summary

Appointments tab gains a List | Day | Week toggle: Day shows staff columns, Week shows Monday to Sunday with an All staff chip filter, 10-minute slots, click an empty slot to open the existing add modal prefilled, click a card to open the existing edit modal; List remains the default and unchanged.

## Accomplishments

- Task 1 (tracer, Day view): `appointment-schedule.ts` (import-free, constants plus `snapTimeToStep`, `clockToMinutes`, `getAppointmentInterval`, `getVisibleRange`, `buildSlotStarts`, `buildStaffColumns`, `splitScheduled`, `layoutColumnAppointments`), `useAppointmentsRange` (request id guard, ISO date validation, keeps rows on refresh), `AppointmentsCalendar` (sticky gutter and headers, own scroll container, Unscheduled strip), tab wiring (`viewMode`, `calendarDate`, `openAddModalFromSlot`, range refresh after save and status change). Private time-step constants removed from the tab.
- Task 2 (Week): `addDays` and `getWeekDates` (UTC arithmetic), `mode` prop, Previous/Next/Today stepping by 1 or 7 days, All staff chip filter, per-day columns with staff shown on cards when All staff, slot click prefills the column date and the selected staff; tab derives the range from `getWeekDates(calendarDate)`.
- Task 3 (states): empty state text plus Add appointment (`onAddClick`, opens add modal with the visible date), error state with Retry (`onRetry`), cancelled cards muted (opacity-60, line-through) but visible, list status pill now calls `getAppointmentStatusTone`, aria-labels on slots and cards, mobile layout (wrapping header, full-width segmented control, grid scrolls inside its box).

## Task Commits

1. Task 1: `93b7d61` feat(01-04): add Day calendar view to appointments tab
2. Task 2: `1168c80` feat(01-04): add Week view and date navigation to appointments calendar
3. Task 3: `740e94e` feat(01-04): calendar empty/error states, shared status pill, cancelled styling

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking/UX] Gated the list-only loading and error early returns on viewMode**
- **Found during:** Task 1
- **Issue:** The tab returns a "Fetching appointments" screen or an error box whenever the paged list is loading or failed. In Day/Week mode that would replace the whole calendar (and hide the view toggle) for a failure unrelated to the calendar.
- **Fix:** `if (viewMode === "list" && ...)` on both early returns. List mode behaves exactly as before.
- **Files modified:** src/components/dashboard/tabs/appointments-tab.tsx
- **Commit:** 93b7d61

Otherwise the plan was executed as written. Some Task 3 items (aria-labels, week column min width, the date-outside-window filter) were implemented in earlier commits because they were part of the same component rewrite; Task 3 verified them.

## Assumption A-01 (time storage) - live probe not run

The optional read-only live SELECT (pg_typeof(start_time), samples) was NOT run: no Supabase MCP SQL tool was available to this executor. `clockToMinutes` supports both shapes (time-only wall-clock and ISO timestamps converted to IST) regardless, and the list view's IST formatting in `time-utils.ts` was left untouched, so a human should compare one live appointment's list time against its calendar position during UAT (plan 01-07). If live values are time-only, list and calendar could show different clock times; deciding a follow-up is open.

## Verification

- `npx tsc --noEmit | grep "error TS" | grep -v web-push-server.ts | wc -l` printed 0 after each task.
- Node assertion commands printed `schedule-ok`, `layout-ok` (Task 1) and `week-ok` (Task 2); `appointment-schedule.ts` has no runtime imports.
- Grep gates for all three tasks pass; `git diff --name-only -- package.json package-lock.json` is empty (no dependency changes).
- Tracer gate: interactive mode, `human_verify_mode=end-of-phase`, automated-only verify re-run end-to-end and passed before Task 2.
- The tab still has exactly one add/edit `EntityModal` (the other two are the existing confirm modals).

## Pending Human Verification

- Task 2 human-check: as the doctor test client, choose Week, step Next/Previous, pick a staff chip, click an empty Wednesday slot; the add modal must prefill Wednesday's date, slot time, +30 minutes end time and the chosen staff.
- Task 3 human-check: phone width (about 390px) and desktop, empty and populated dates in Day and Week, offline error and Retry; page must not gain a horizontal scrollbar.
- Concurrency backstop (two sessions on the same tenant): second user's booking shows only after refresh.
- Compare one live appointment's list time and calendar position (assumption A-01).

## Known Stubs

None.

## Threat Flags

None. Mitigations implemented: T-01-17 (hook skips fetch unless both dates match the ISO pattern; query validates again), T-01-19 (slot click only prefills the existing modal whose validation is unchanged), T-01-20 (request id guard keyed on clientId, fromDate, toDate plus visible-date filter), T-01-22 (React text children only, no dangerouslySetInnerHTML), T-01-SC (no package changes).

## Self-Check: PASSED

- FOUND: src/lib/appointment-schedule.ts, src/hooks/use-appointments-range.ts, src/components/dashboard/appointments-calendar.tsx, src/components/dashboard/tabs/appointments-tab.tsx
- FOUND commits: 93b7d61, 1168c80, 740e94e
