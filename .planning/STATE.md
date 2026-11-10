---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 01
current_phase_name: Doctor appointments and patients
status: verifying
stopped_at: Completed 03-03-PLAN.md
last_updated: "2026-11-10T19:58:32.012Z"
last_activity: 2026-11-10
last_activity_desc: Phase 01 execution started
state_head: 73c63219ae166cdbcb6104d41250e2c0529c2e8e
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 20
  completed_plans: 16
milestone_name: milestone
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-10)

**Core value:** A tenant's people and records live in one isolated system — each client sees only the tabs and workflows it needs — without mixing tenants or leaking secrets.
**Current focus:** Phase 01 — Doctor appointments and patients

## Current Position

Phase: 01 (Doctor appointments and patients) — EXECUTING
Plan: 7 of 7
Status: Phase complete — ready for verification
Last activity: 2026-11-10 — Phase 01 execution started

Progress: ░░░░░░░░░░ 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 10min | 2 tasks | 2 files |
| Phase 01 P02 | 6min | 2 tasks | 1 files |
| Phase 01 P03 | 15min | 2 tasks | 4 files |
| Phase 01 P04 | 30min | 3 tasks | 4 files |
| Phase 01 P05 | 10min | 2 tasks | 7 files |
| Phase 01 P06 | 15min | 2 tasks | 3 files |
| Phase 01 P07 | 15min | 3 tasks | 4 files |
| Phase 02 P06 | 15min | 2 tasks | 5 files |
| Phase 03 P03 | 25min | 3 tasks | 10 files |

## Accumulated Context

### Roadmap Evolution

- 2026-11-10: WhatsApp inbox phases 1-6 and `01-conversation-model` context removed (recoverable from git history); existing WhatsApp code in `src/` untouched
- 2026-11-10: Added Phase 1 (Doctor appointments and patients), Phase 2 (Consultation and print), Phase 3 (Doctor billing)

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Current slice = doctor/clinic workflow on existing tabs; clinic features enabled per client via `client_tab_access`
- Doctor billing = new tab key 015 on existing `bills` tables; own `SECURITY INVOKER` function; cafe RPC untouched
- Print = body-only on pre-printed letterhead, margins in mm per client
- Appointment-to-patient matching stays by phone (no `patient_id`)
- Live Supabase project `ltbqxyvdtrrlohdfrprf`; RLS hardening applied 2026-11-08 (products, counters, clients, appointments, bill_items, tasks, function grants)
- [Phase 01]: 01-01: appointment writes live in appointment-queries.ts; update/status throw 'Appointment not found.' on zero rows; client_id written after payload spread
- [Phase 01]: 01-02: RLS migration records live hand-applied state; no begin/commit wrapper, statements individually idempotent; crm_can_access_client reused not redefined
- [Phase 01]: [01-03] Clinical fields gated on consultation tab; clinical payload keys added by conditional spread, update skips undefined keys; empty stored as null
- [Phase 01]: 01-04: Week view uses seven day columns with an All staff chip filter (not staff sub-columns per day)
- [Phase 01]: 01-04: List-only loading/error early returns in appointments tab gated on viewMode so calendar is never blocked by list failures
- [Phase 01]: 01-05: patient profile drawer body keyed by patient id with cancelled-flag panel effects; file links limited to http(s)
- [Phase 01]: 01-06: Double-booking warning is advisory only (D-04); modal loads its own date via second useAppointmentsRange; getConflictingIds reuses findAppointmentConflicts
- [Phase 01]: 01-07: phase0 RLS migration file aligned to live (no service_role grant on generate_order_id); verified read-only 2026-11-10
- [Phase 01]: 01-07: Assumption A-01 resolved - live appointments start_time/end_time are time without time zone; list view converts via IST, calendar renders raw clock time (UAT compare)

### Pending Todos

- Sync live RLS hardening into `supabase/migrations/20261108_phase0_tighten_rls.sql` (Phase 1, SEC-01)
- Decide on `people_insert_authenticated` (any signed-in user can insert `people`)
- Enable leaked-password protection in Supabase Auth settings (dashboard toggle)

### Blockers/Concerns

- Numbered architecture specs live outside this repo — stop if a change needs them
- Repo migrations and live DB tracker have drifted (repo files for WhatsApp/customer/soft-delete are not in the live tracker); new migrations must record what is actually live
- `create_order_with_inventory` ignores `p_order_source` / `p_order_type` and does not validate customer/product ownership; separate hardening ticket, not in this roadmap
- `tasks` and `client_code_counters` now rely on new RLS; verify Summary tab and client creation after any related change

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Communication | WhatsApp inbox, webhook hardening, reminders | Paused | 2026-11-10 |

## Quick Tasks Completed

| ID | Title | Date | Summary |
|----|-------|------|---------|
| 260826-4tb | LEADS Templates tab CRUD for prefilled messages | 2026-08-26 | `.planning/quick/260826-4tb-leads-templates-tab-crud-for-prefilled-m/260826-4tb-SUMMARY.md` |
| 260826-56h | Templates tab centered list + slide editor | 2026-08-26 | `.planning/quick/260826-56h-templates-tab-ui-centered-list-as-defaul/260826-56h-SUMMARY.md` |
| 260826-59z | Auto Replies tab strip credentials and extras | 2026-08-26 | `.planning/quick/260826-59z-remove-whatsapp-cloud-api-credentials-se/260826-59z-SUMMARY.md` |
| 260826-5fh | LEADS WhatsApp Settings credentials sub-tab | 2026-08-26 | `.planning/quick/260826-5fh-leads-whatsapp-settings-sub-tab-single-p/260826-5fh-SUMMARY.md` |
| 260826-5p8 | Merge develop into feature/consultation-tab | 2026-08-26 | `.planning/quick/260826-5p8-pull-latest-develop-into-feature-consult/260826-5p8-SUMMARY.md` |

## Session Continuity

Last session: 2026-11-10T19:58:31.917Z
Stopped at: Completed 03-03-PLAN.md
Resume file: None
