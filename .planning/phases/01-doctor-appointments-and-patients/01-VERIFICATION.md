---
phase: 01-doctor-appointments-and-patients
verified: 2026-11-10T08:30:00Z
status: human_needed
score: 4/6 roadmap must-haves verified (1 uncertain, 1 present-but-behavior-unverified)
covered_files:
  - ".planning/phases/01-doctor-appointments-and-patients/01-01-PLAN.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-01-SUMMARY.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-02-PLAN.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-02-SUMMARY.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-03-PLAN.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-03-SUMMARY.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-04-PLAN.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-04-SUMMARY.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-05-PLAN.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-05-SUMMARY.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-06-PLAN.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-06-SUMMARY.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-07-PLAN.md"
  - ".planning/phases/01-doctor-appointments-and-patients/01-07-SUMMARY.md"
  - "src/components/dashboard/appointments-calendar.tsx"
  - "src/components/dashboard/billing/customer-table.tsx"
  - "src/components/dashboard/patient/patient-files-panel.tsx"
  - "src/components/dashboard/patient/patient-overview-panel.tsx"
  - "src/components/dashboard/patient/patient-profile-drawer.tsx"
  - "src/components/dashboard/patient/patient-visits-panel.tsx"
  - "src/components/dashboard/tabs/appointments-tab.tsx"
  - "src/components/dashboard/tabs/customer-tab.tsx"
  - "src/hooks/use-appointments-range.ts"
  - "src/lib/appointment-queries.ts"
  - "src/lib/appointment-schedule.ts"
  - "src/lib/billing-queries.ts"
  - "src/lib/billing-types.ts"
  - "src/lib/consultation-queries.ts"
  - "supabase/migrations/20261108_phase0_tighten_rls.sql"
  - "supabase/migrations/20261110_customers_clinical_fields.sql"
covered_digest: "v3:sha256:59101f202ddf23a2348b68782b1143a301e1347406679dd58c9d4824947e210d"
behavior_unverified: 4
overrides_applied: 0
behavior_unverified_items:
  - truth: "Roadmap SC6 / SEC-01: tenant A cannot read tenant B appointments, bills, products or clients; anon cannot read them"
    test: "In Supabase SQL editor (project ltbqxyvdtrrlohdfrprf), inside a transaction ending in rollback: set local role authenticated; set request.jwt.claims sub to the doctor test client's auth user id; count appointments, bills, products rows for another client_id and clients rows other than own. Repeat with set local role anon on appointments, clients, products, bill_items."
    expected: "0 rows (or permission denied) for every table"
    why_human: "Policy and RLS-flag parity with the migration file was confirmed read-only by the orchestrator, but the row-count isolation probe was never run; static SQL parity does not prove effective isolation (own-client policies are not defined by any repo migration, see WR-13)"
  - truth: "A slow response for patient A never renders inside patient B's drawer (cancelled flag + keyed body); calendar range responses arriving out of order are dropped (request id guard)"
    test: "Doctor client: open patient A, switch to Files/Visits, click patient B quickly (throttle network in devtools). In calendar, step Next/Previous rapidly."
    expected: "Drawer and calendar only ever show data for the currently selected patient/date"
    why_human: "Cancellation/ordering invariants; code has the guards (cancelled flag in patient-visits-panel.tsx and patient-files-panel.tsx, requestIdRef in use-appointments-range.ts) but no test exercises them (repo has no test runner)"
  - truth: "Double click on Save creates exactly one appointment (isSaving guard in handleSaveAppointment)"
    test: "Doctor client: add appointment, double-click Save quickly"
    expected: "Exactly one appointment row"
    why_human: "Guard is React state read from a closure; ordering under rapid events is runtime behavior grep cannot prove"
  - truth: "Two sessions on one tenant: last write wins, no half-written row; second session sees first booking only after refresh (backstop truths from plans 01-01 and 01-04)"
    test: "Two browser sessions on the doctor tenant: book the same slot in both; update the same appointment from both"
    expected: "Both bookings save (advisory warning only); last update wins; no half-written row"
    why_human: "Plan-declared backstop (verification: backstop); needs two live sessions"
coincidental_reliance_items: []
human_verification:
  - test: "Week view staff columns decision (APPT-01 literal reading)"
    expected: "Roadmap SC1 and REQUIREMENTS APPT-01 say 'day and week calendar with staff columns'. Day view has staff columns. Week view has seven date columns plus an 'All staff' / per-staff chip filter (plan 01-04 design note), not staff sub-columns. Owner decides: accept as satisfying SC1 (then add an override to this file) or request staff sub-columns in Week."
    why_human: "Roadmap wording vs implemented design; a judgment on intent, not something code inspection can settle"
  - test: "A-01 list vs calendar time comparison (WR-03)"
    expected: "Live appointments.start_time/end_time are `time without time zone` (orchestrator, 2026-11-10). calendar reads HH:MM:SS as wall clock; the list view (time-utils.ts parseAppointmentDateTime) appends Z to time-only values and then formats in IST, so a stored 10:00:00 would show as 15:30 in the list and 10:00 in Day view. Open the same live appointment in List and in Day view and compare; confirm which one matches the booked time, and decide the follow-up."
    why_human: "Needs real data in a browser; decides whether SC1 'existing list view still works' and calendar position agree for real rows"
  - test: "Calendar UX as doctor client eafea940-a6d1-4aa2-95e2-339f614502ea"
    expected: "List default; Day then Week; empty slot click opens prefilled add modal (date, start, +30 min end, staff) and saves; card click opens edit modal; cancel via status modal; overlapping same-staff booking shows amber banner in modal and amber ring on card, touching booking shows neither, save never blocked; empty day shows 'No appointments today' with Add appointment; offline shows error with Retry"
    why_human: "Visual and interaction behavior; no browser automation in repo"
  - test: "Patient drawer and clinical fields as doctor client, then as a cafe client"
    expected: "Add patient with all four clinical fields, values persist, cleared allergies shows blank in form and 'Not recorded' in drawer; row click opens drawer (Overview with red allergy pills, Visits, Files); Edit click opens edit modal not drawer. Cafe client: Customers tab unchanged, no clinical inputs, no drawer."
    why_human: "Rendering and consultation-tab gating at runtime; flagged prohibitions below depend on it"
  - test: "Mobile width (390px) and page overflow"
    expected: "Appointments Day/Week and the drawer: no page-level horizontal scrollbar (only the calendar grid scrolls inside its box); drawer full width"
    why_human: "Layout"
  - test: "Regression for the live hardening"
    expected: "Summary tab loads tasks for a client with tasks; creating a new client still generates a client code (generate_client_code now SECURITY DEFINER; counters have RLS on)"
    why_human: "Needs running app against live"
  - test: "Read the final 20261108_phase0_tighten_rls.sql once"
    expected: "Reviewer agrees it contains no RLS-off, always-true policy or anon/public grant, and matches intent. (Verifier grep found none; flagged 'unclassified - review manually' by plan 01-02.)"
    why_human: "Plan-flagged human review of a security artifact"
  - test: "Unverified prohibitions (human review recommended)"
    expected: "unverified-prohibition items, none auto-failed: (1) 01-02 test-tier: no RLS-off / always-true / anon grants in the migration - verifier static grep found none, but no wired test enforces it. (2) 01-03 test-tier: no clinical fields for clients without the consultation tab - gating by hasClinicalFields observed in code, no test. (3) 01-04 test-tier: no non-deleted appointment silently omitted - visible-range filter, Unscheduled strip and Unassigned column observed in code, no test. (4) 01-06 test-tier: overlap never blocks or alters a booking - slotConflicts is not referenced by handleSaveAppointment or the Save button (verified by grep), no test. (5) judgment-tier 01-03 / 01-05: unrecorded allergies never shown as 'None' - grep for 'None' and 'No known' in patient/ and customer-table.tsx finds nothing; reads 'Not recorded'. (6) judgment-tier 01-02 / 01-07: no executor DDL/DML against live - summaries state none; the orchestrator applied the clinical migration itself with explicit user authorization (consistent). Non-authoritative verdict."
    why_human: "ADR-550 D4: test-tier prohibitions without wired enforcement fail closed to unverified; judgment-tier are non-authoritative LLM judge verdicts"
---

# Phase 1: Doctor appointments and patients Verification Report

**Phase Goal:** Receptionists book and move appointments on a day/week calendar, and staff see a patient profile with clinical basics, without changing the appointment-to-patient matching (phone) or adding tables beyond nullable columns.
**Verified:** 2026-11-10
**Status:** human_needed
**Re-verification:** No - initial verification

No code gap was found: every artifact exists, is substantive, wired and data-flowing, and the TypeScript gate is clean. The phase cannot be marked `passed` because several must-haves can only be confirmed in a browser or by a live cross-tenant probe, and one roadmap wording (week "staff columns") needs an owner decision.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Appointments tab offers a day and week calendar with staff columns; clicking an empty slot opens the add form prefilled; the existing list view still works | ? UNCERTAIN (human decision) | Exists and wired: `appointments-calendar.tsx` (438 lines), `use-appointments-range.ts`, tab renders `<AppointmentsCalendar>` when `viewMode !== "list"`, default `list`. Day columns = `buildStaffColumns` (staff options + row staff + Unassigned). `openAddModalFromSlot` sets date, start_time, end_time, staff_name into the single existing form/modal. List branches are gated `viewMode === "list"`. Open items: Week view has date columns with a staff chip filter, not staff columns (roadmap wording); list vs calendar time display may disagree for time-only values (A-01). See Human Verification. |
| 2 | Booking or moving an appointment onto an overlapping slot for the same staff shows a conflict warning | VERIFIED | `findAppointmentConflicts` in `appointment-schedule.ts`: same trimmed staff, same date, half-open overlap, ignores cancelled and own id. I ran node assertions myself (adjacent bookings do not clash, overlap does, cancelled/other staff/self ignored, 09:30:00 parses to 570) - all passed. Wired: `slotConflicts` memo in `appointments-tab.tsx` (line 518) over `useAppointmentsRange` for the modal date, amber `role="status"` banner (line 1444); `slotConflicts` is not referenced in `handleSaveAppointment` or the Save button (advisory only). Calendar cards get `getConflictingIds` ring. Browser display listed for UAT. |
| 3 | Appointment create, update and status changes go through `appointment-queries.ts` (no direct Supabase writes left in the tab) | VERIFIED | `createAppointment`, `updateAppointment`, `setAppointmentStatus`, `fetchAppointmentsRange` exported; writes filter `.eq("client_id", clientId)` (+ `.eq("id")`, zero-row "Appointment not found." check); create writes `client_id` after payload spread. Tab: grep for `getSupabaseClient`, `.from("appointments")`, `.update(`, `.insert(` returns 0 hits; handlers call the query functions (lines 669, 671, 706). Existing `softDeleteAppointment` still scoped by client_id. |
| 4 | A patient has gender, blood group, allergies and chronic conditions; allergies show prominently on the patient profile | VERIFIED | Migration `20261110_customers_clinical_fields.sql` adds four nullable text columns (`add column if not exists`, no defaults, no RLS change); live has them (orchestrator, read-only, 2026-11-10). `CustomerRecord`/`CustomerPayload` carry them; `CUSTOMER_SELECT`, create returning select, `mapCustomer` all include them; create/update use trim-or-null, update skips undefined keys. Modal inputs gated by `hasClinicalFields` (`tabs.some(key === "consultation")`). `patient-overview-panel.tsx`: allergies first, red pills with AlertTriangle icon, "Not recorded" when empty. |
| 5 | Patient profile shows Overview, Visits (consult history) and Files for one patient from the customer list | VERIFIED | `patient-profile-drawer.tsx` has the three tabs; mounted from `customer-table.tsx` only under `hasClinicalFields`; row click sets `profilePatient` (plain `useState`, never persisted), Actions cell `stopPropagation`. Visits calls `fetchPatientConsultationHistory(clientId, patientId)`; Files calls new `fetchPatientAttachments` (client_id + patient_id scoped consultation ids, then attachments `.in` those ids and `client_id`). `consultations.patient_id` refers to customers rows (`findOrCreatePatientForAppointment` uses `customers`). Links http(s) only with `noopener noreferrer`. Panels use cancelled-flag effects (runtime ordering is behavior-unverified, see below). |
| 6 | `supabase/migrations/20261108_phase0_tighten_rls.sql` in git matches what is live; tenant A cannot read tenant B appointments, bills, products or clients | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | File exists with 4 RLS enables, 20 `drop policy if exists` (16 open/legacy drops + 4 tasks pre-drops), 4 tasks policies via `crm_can_access_client`, function revokes/grants and `search_path` pins; `generate_client_code()` made definer before RLS on its counter. Parity with live is from the ORCHESTRATOR's read-only checks (policies, RLS flags, function privileges) after one fix (`f095a5c`, service_role grant on `generate_order_id` removed); I have no Supabase access and did not re-run them. The cross-tenant/anon row-count probe was never run (pending). Not replayable on a fresh DB (own-client policies on bills/bill_items/clients/appointments are created by no repo migration; WR-13, accepted drift). |

**Score:** 4/6 roadmap truths verified; 1 uncertain (truth 1), 1 present-but-behavior-unverified (truth 6). 4 behavior-unverified items are listed in frontmatter (includes plan-level backstop and ordering invariants).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/appointment-queries.ts` | create/update/status/range, tenant-scoped | VERIFIED | 6 `client_id` filters; range capped at 1000 and date-validated |
| `src/lib/appointment-schedule.ts` | pure scheduling + conflicts | VERIFIED | 363 lines, import-free; behavior spot-checked by me |
| `src/hooks/use-appointments-range.ts` | range hook with stale guard | VERIFIED (guard behavior unverified) | `requestIdRef` guard present |
| `src/components/dashboard/appointments-calendar.tsx` | Day/Week grid | VERIFIED | Imported and rendered by tab; empty/error/loading states via `DataState`, Retry, Add appointment |
| `src/components/dashboard/patient/*` (4 files) | drawer, Overview, Visits, Files | VERIFIED | Imported by `customer-table.tsx`; real queries |
| `supabase/migrations/20261110_customers_clinical_fields.sql` | 4 nullable columns | VERIFIED | Live confirmed by orchestrator |
| `supabase/migrations/20261108_phase0_tighten_rls.sql` | SEC-01 record | VERIFIED (file) / behavior unverified (isolation) | See truth 6 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| appointments-tab.tsx | appointment-queries.ts | create/update/setStatus imports and calls | WIRED | lines 29-34, 669, 671, 706 |
| use-appointments-range.ts | fetchAppointmentsRange | import + call | WIRED | |
| appointments-tab.tsx | appointments-calendar.tsx | `onSlotClick`, `onCardClick`, `onAddClick`, `onRetry` | WIRED | slot -> `openAddModalFromSlot`, card -> `openEditModal` |
| appointments-tab.tsx | appointment-schedule.ts | `findAppointmentConflicts` over modal day rows | WIRED | line 518 |
| customer-table.tsx | patient-profile-drawer.tsx | row click -> `profilePatient` | WIRED | gated by `hasClinicalFields` |
| patient-files-panel.tsx | consultation-queries.ts | `fetchPatientAttachments` | WIRED | |
| customer-table.tsx | billing-queries.ts | payload with clinical keys | WIRED | conditional spread |
| billing-queries.ts | clinical migration | `CUSTOMER_SELECT` needs live columns | WIRED | columns live (orchestrator); deploy-order rule recorded in CHANGELOG |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| appointments-calendar.tsx | `appointments` | `useAppointmentsRange` -> `fetchAppointmentsRange` -> PostgREST `appointments` | Yes | FLOWING |
| appointments-tab.tsx banner | `slotConflicts` | `modalDayAppointments` (range query for form.date) | Yes | FLOWING |
| patient-overview-panel.tsx | `patient.allergies` etc. | `CUSTOMER_SELECT` -> `mapCustomer` -> table row | Yes | FLOWING |
| patient-visits-panel.tsx | `visits` | `fetchPatientConsultationHistory` | Yes | FLOWING |
| patient-files-panel.tsx | `files` | `fetchPatientAttachments` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Adjacent same-staff bookings do not conflict; overlap does; cancelled/other staff/self ignored | node (type stripping) assertions on `appointment-schedule.ts` | all conflict assertions passed | PASS |
| Lane layout: adjacent items laneCount 1; overlapping laneCount 2; `getWeekDates("2026-11-10")` Mon 2026-11-09 to Sun 2026-11-15 | same script | passed | PASS |
| `getConflictingIds` marks only overlapping ids | same script | My own expected value was wrong (3 overlaps 2 at 10:30 < 10:40, so ids 1,2,3 is correct); function result is right | PASS (assertion error was mine) |
| TypeScript health | `npx tsc --noEmit` excluding `src/lib/web-push-server.ts` | 0 errors | PASS |
| No dependency changes | `git diff --name-only 902e829..HEAD -- package.json package-lock.json` | empty | PASS |

### Probe Execution

Step 7c: SKIPPED. No `probe-*.sh` declared or present for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| APPT-01 | 01-04, 01-07 | Day/week calendar with staff columns, create/edit from slot or card, list remains | NEEDS HUMAN | Implemented; Week uses staff filter not staff columns; A-01 time display; UX unrun |
| APPT-02 | 01-06, 01-07 | Overlap warning for same staff | SATISFIED | Logic verified by node run; advisory banner wired |
| APPT-03 | 01-01, 01-07 | Writes in `appointment-queries.ts`, scoped by `client_id` | SATISFIED | Truth 3 |
| PAT-01 | 01-03, 01-07 | Four nullable clinical fields | SATISFIED | Truth 4; live columns confirmed by orchestrator |
| PAT-02 | 01-05, 01-07 | Profile with Overview/Visits/Files, allergies prominent | SATISFIED (UX unrun) | Truth 5; browser UAT pending |
| SEC-01 | 01-02, 01-07 | RLS hardening exists as a migration in `supabase/migrations/` | SATISFIED (as written: file in git, parity per orchestrator) | Isolation probe pending (truth 6) |

All six IDs appear in PLAN frontmatter and in REQUIREMENTS.md (all marked Complete under Phase 1). No orphaned requirements: REQUIREMENTS.md maps exactly APPT-01..03, PAT-01..02, SEC-01 to Phase 1, all claimed by plans. Note REQUIREMENTS.md already marks APPT-01 `[x]`/Complete although it is human-pending; consider reverting until the human checks pass.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| phase files | - | TBD/FIXME/XXX/TODO | none | No debt markers in any phase-modified implementation or migration file |
| `appointment-queries.ts` | updateAppointment / setAppointmentStatus / softDeleteAppointment | no `deleted_at` filter, no zero-row check on delete (WR-10) | Warning | Advisory; edits to a soft-deleted row would succeed |
| `appointments-tab.tsx` | handleSaveAppointment | post-save refresh failure shown as "Unable to save" with modal open (WR-01) | Warning | Retry could duplicate a booking; advisory, does not defeat a must-have (double-click guard exists) |
| `appointments-tab.tsx` | confirmDelete | refreshes list only, not calendar range | Info | Delete is a list-view action; calendar shows the row until next refresh |
| `customer-table.tsx` | editing record via `usePersistentState` | allergy/condition data in localStorage, not tenant-scoped (WR-02) | Warning | Privacy, pre-existing pattern extended to new fields; open |
| `appointment-schedule.ts` | staff compare | case-sensitive (WR-09) | Info | Minor false negatives in conflicts |

Review findings WR-01..WR-13 and IN-01..06 are advisory per instructions and are not treated as blockers; none defeats a must-have except as noted in the human items (WR-03 relates to truth 1).

### Human Verification Required

See `human_verification` and `behavior_unverified_items` in the frontmatter. Summary:

1. Decide Week-view staff columns vs staff filter chip (roadmap SC1 wording). If acceptable, record an override.
2. Compare one live appointment in List vs Day view (A-01/WR-03; list adds +5:30 to time-only values per `time-utils.ts`).
3. Calendar UX, overlap banner/ring, empty/error states as the doctor client.
4. Patient drawer and clinical fields as doctor client, and unchanged Customers tab as a cafe client.
5. 390px width: no page-level horizontal scroll; drawer full width.
6. Cross-tenant and anon row-count isolation probe (SEC-01 / SC6) and regression of tasks + client code generation.
7. A human reads `20261108_phase0_tighten_rls.sql` once; review flagged unverified prohibitions (listed in frontmatter).
8. Two-session concurrency (backstop), double-click Save, rapid patient/date switching.

### Gaps Summary

No FAILED must-have and no missing, stub or orphaned artifact. Live-DB facts (four customers columns present; RLS flags, policies and function privileges matching the migration; `time without time zone` columns) are taken from the orchestrator's 2026-11-10 read-only checks, not re-verified here. Status is `human_needed` because truth 6's isolation behavior, truth 1's week-staff-column interpretation and list/calendar time agreement, and the browser-only UX checks cannot be confirmed by an agent. Run the checks above, then either re-verify or add overrides and mark the phase complete.

---

_Verified: 2026-11-10T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
