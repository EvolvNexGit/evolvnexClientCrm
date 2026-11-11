---
phase: 01-doctor-appointments-and-patients
plan: 07
subsystem: database
tags: [supabase, rls, migration, docs, phase-gate, tenancy]
status: complete
requires:
  - "01-01..01-06 (all phase 1 implementation plans)"
provides:
  - "Live customers table carries gender, blood_group, allergies, chronic_conditions (applied by orchestrator)"
  - "SEC-01 migration file reconciled against live (one discrepancy fixed in file)"
  - "Codebase docs updated: CHANGELOG, STRUCTURE, CONCERNS"
  - "Green automated phase gates"
affects: [phase-1 UAT, /gsd-verify-work]
actuals:
  tokens: 6500
  tasks: 3
  commits: 2
plan_head_before: d5fd5e3f04985cbef771b88f21b545737f08dd2b
plan_head_after: de07a50c78713d3573d95a3945a4b52c7d0c2acc
tech-stack:
  added: []
  patterns:
    - "Read-only live parity check: pg_policies, pg_class.relrowsecurity, pg_proc + has_function_privilege via SELECT only"
key-files:
  created: []
  modified:
    - supabase/migrations/20261108_phase0_tighten_rls.sql
    - .planning/codebase/CHANGELOG.md
    - .planning/codebase/STRUCTURE.md
    - .planning/codebase/CONCERNS.md
key-decisions:
  - "Migration file edited to match live (removed service_role grant on generate_order_id); live was not touched"
  - "Clinical migration applied through Supabase MCP apply_migration by the orchestrator with explicit user authorization, not the CLI push path"
requirements-completed: [APPT-01, APPT-02, APPT-03, PAT-01, PAT-02, SEC-01]
coverage:
  - id: D1
    description: "Live customers table has the four nullable text clinical columns"
    requirement: PAT-01
    verification:
      - kind: other
        ref: "Orchestrator read-only verification after apply_migration (project ltbqxyvdtrrlohdfrprf): 4 columns, all text, all nullable"
        status: pass
  - id: D2
    description: "SEC-01 migration file matches live RLS, policies and function privileges"
    requirement: SEC-01
    verification:
      - kind: other
        ref: "Orchestrator SELECT-only parity checks (pg_policies, relrowsecurity, pg_proc/has_function_privilege); one discrepancy fixed in file, commit f095a5c; static gate exit 0"
        status: pass
      - kind: manual_procedural
        ref: "Human read of final file once; cross-tenant spot check with real tenant ids"
        status: unknown
  - id: D3
    description: "Docs updated and phase gates green"
    requirement: SEC-01
    verification:
      - kind: other
        ref: "TS gate prints 0; package files unchanged; appointments tab has no direct table calls; docs grep gate exit 0"
        status: pass
  - id: D4
    description: "Browser UAT (calendar, drawer, mobile, concurrency, regression) and tenant isolation spot check"
    requirement: APPT-01
    verification:
      - kind: manual_procedural
        ref: "See Human verification pending"
        status: unknown
---
# Phase 1 Plan 07: Live parity, docs and phase gates Summary

Clinical-fields migration is live (applied by the orchestrator), the SEC-01 migration file was reconciled against live read-only with one discrepancy fixed in the file, codebase docs record Phase 1, and the automated gates pass; browser UAT and the cross-tenant spot check remain human-only and PENDING.

## Accomplishments

- **Task 1 (done by the orchestrator, not this executor):** On 2026-11-10 the orchestrator applied `20261110_customers_clinical_fields.sql` to live project ltbqxyvdtrrlohdfrprf via the Supabase MCP `apply_migration` tool, with explicit user authorization (tracker name `20261110_customers_clinical_fields`). Read-only check afterwards: `public.customers` has `gender`, `blood_group`, `allergies`, `chronic_conditions`, all `text`, all nullable. This executor issued no live DDL/DML.
- **Task 2 (done by the orchestrator, read-only):** SELECT-only queries against live (pg_policies, pg_class relrowsecurity, pg_proc + has_function_privilege). Live matches `20261108_phase0_tighten_rls.sql` on all policies: the dropped policies are absent; `tasks_select_own`, `tasks_insert_own`, `tasks_update_own`, `tasks_delete_own` exist for `authenticated` using `crm_can_access_client`. RLS is on for products, bill_order_counters, client_code_counters, tasks, clients, appointments, bills, bill_items. Function settings: `create_order_with_inventory`, `current_client_id`, `get_client_code` are security definer with `search_path=public`, anon no, authenticated yes, service_role yes; `generate_client_code` and `generate_order_id` are security definer with `search_path=public` and no EXECUTE for anon, authenticated or service_role; `update_updated_at_column` and `update_customer_loyalty_updated_at` are invoker with `search_path=public`.
- **Discrepancy fixed in the file (commit `f095a5c`):** the file had `grant execute on function public.generate_order_id() to service_role;` but live has no such grant. The line was removed and replaced by a comment (trigger function does not need EXECUTE at fire time). The static gate for the file exits 0 after the edit. Live was not changed.
- **Task 3 (this executor):** CHANGELOG.md gets a newest-first `2026-11-10 - Phase 1: doctor appointments and patients` entry (query-layer write contract, new files, clinical fields, drawer, RLS record, deploy-order rule, A-01 finding); STRUCTURE.md lists `appointments-calendar.tsx`, the `patient/` folder (four files), `use-appointments-range.ts`, `appointment-schedule.ts` and the new/previously unlisted migrations; CONCERNS.md notes the RLS hardening and clinical columns are now versioned (table definitions still are not) and that the hardening was verified read-only on 2026-11-10.

## Task Commits

1. Task 1: no commit (orchestrator applied live migration; nothing in git)
2. Task 2: `f095a5c` fix(01-07): align phase0 RLS migration with live (no service_role grant on generate_order_id)
3. Task 3: `de07a50` docs(01-07): update codebase docs for phase 1 (changelog, structure, concerns)

## Resolved assumption A-01 (time storage)

Live facts: `appointments.start_time` and `end_time` are `time without time zone`; `date` is `date`. The calendar renders the stored clock time as is, while the list view still converts times through IST in `src/lib/time-utils.ts`. List and calendar may therefore show different times for the same appointment. FLAG for the UAT comparison: open the same appointment in List and in Day view and compare the shown time. No code change made here.

## Phase gates (automated, all green)

- `npx tsc --noEmit | grep "error TS" | grep -v src/lib/web-push-server.ts | wc -l` printed `0` (baseline error in web-push-server.ts, missing `web-push` module, untouched).
- `git diff --name-only -- package.json package-lock.json` empty; appointments tab has no `getSupabaseClient`, `.from("appointments")`, `.update(` or `.insert(`.
- Docs gate: `2026-11-10` in CHANGELOG, `appointment-schedule` in STRUCTURE, `20261108_phase0_tighten_rls` in CONCERNS.

## Deviations from Plan

### Execution-mode deviations (not rule-based)

- Task 1 was a `checkpoint:human-action`; the orchestrator completed it with explicit user authorization via the Supabase MCP `apply_migration` tool instead of the user running the SQL editor. Same outcome (four nullable text columns), verified read-only. The CLI push path was not used.
- Task 2 live queries were run by the orchestrator (this executor has no database tool). One of the four query groups (anon exposure inside a rolled-back transaction) and the cross-tenant counts were not reported as run; see pending items.

### Auto-fixed Issues

**1. [Rule 1 - Bug] File claimed a grant that live does not have**
- **Found during:** Task 2 (orchestrator parity check)
- **Issue:** `grant execute on function public.generate_order_id() to service_role` was in the file but not live.
- **Fix:** removed the grant, added an explanatory comment.
- **Files modified:** supabase/migrations/20261108_phase0_tighten_rls.sql
- **Commit:** f095a5c

## Human verification pending (NOT done; do not treat as passed)

SEC-01 edge flagged "unclassified": parity was verified read-only and the file reviewed against live, but a human should still read the final `20261108_phase0_tighten_rls.sql` once.

1. **Tenant isolation spot check (SQL editor, project ltbqxyvdtrrlohdfrprf, read-only).** Inside a transaction that ends with `rollback`: `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<auth user id of the doctor test client>"}', true);` then count rows in `appointments`, `bills`, `products`, `clients` where `client_id` is another tenant's id (and for `clients`, rows other than the own client). Expected: 0 for every table. Also confirm anon-role counts on appointments, clients, products, bill_items are 0 or permission denied (same rollback pattern with `set local role anon`).
2. **Calendar UX as doctor client (eafea940-a6d1-4aa2-95e2-339f614502ea), running app against live:** List is the default; switch Day then Week; click an empty slot and book (prefilled modal saves); click a card and edit; cancel via the status modal. Create a same-staff overlapping booking and a touching one: overlap shows the amber banner and amber outline, touching shows neither, saving never blocked. Double-click Save on a new booking: exactly one appointment. Compare the same appointment's time in List vs Day view (A-01).
3. **Patient drawer:** Patient tab as doctor client: add a patient with all four clinical fields (values persist; cleared allergies shows blank not "None"); open the drawer from the row; check Overview, Visits, Files; open a patient with no allergies ("Not recorded", never "None", red pills otherwise); click another patient while Files is loading (no stale data); click Edit on a row (opens edit modal, not drawer). As a cafe client open Customers: rows, add and edit modal work, no clinical inputs, no drawer.
4. **Mobile and concurrency:** at 390px width open Appointments (Day and Week) and the patient drawer: no page-level horizontal scrollbar (only the calendar grid scrolls inside its box), drawer full width. With two browser sessions on the doctor tenant book the same slot in both (both save, advisory warning only; second session sees the first booking after refresh) and update the same appointment from both (last update wins, no half-written row).
5. **Regression for the live hardening:** open the Summary tab for a client with tasks (tasks load); create a new test client if normally possible (client code is still generated via `client_code_counters` and the SECURITY DEFINER trigger function).

## Known Stubs

None.

## Threat Flags

None. T-01-33 held (this executor issued no live DDL/DML; the live migration was applied by the orchestrator with explicit user authorization, not via the CLI push path). T-01-34 partially mitigated: policy, RLS-flag and function-privilege parity verified read-only; cross-tenant and anon row-count spot checks pending (item 1). T-01-35 mitigated: migration applied to live before any browser use; deploy-order rule recorded in CHANGELOG.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261108_phase0_tighten_rls.sql, .planning/codebase/CHANGELOG.md, .planning/codebase/STRUCTURE.md, .planning/codebase/CONCERNS.md
- FOUND commits: f095a5c, de07a50
