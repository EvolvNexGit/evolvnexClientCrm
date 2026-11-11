---
phase: 01-doctor-appointments-and-patients
plan: 02
subsystem: database
tags: [supabase, rls, security, migration, tenancy]
status: complete

requires: []
provides:
  - "supabase/migrations/20261108_phase0_tighten_rls.sql: git record of the live RLS hardening (SEC-01)"
affects: [01-07 live reconciliation]

actuals:
  tokens: 2500
  tasks: 2
  commits: 2
plan_head_before: 7da84217c216d97ea5b5b7e985ce0103ec625983
plan_head_after: a59534f9ea794146c1862f30b75471490a6643fc

tech-stack:
  added: []
  patterns:
    - "Idempotent RLS migration: drop policy if exists before every create policy; enable RLS repeatable"
    - "Definer trigger function altered before RLS is enabled on its counter table"

key-files:
  created:
    - supabase/migrations/20261108_phase0_tighten_rls.sql
  modified: []

key-decisions:
  - "No begin/commit wrapper added; header states it runs as one script (statements are individually idempotent)"
  - "crm_can_access_client not redefined; reused from 20260814"

requirements-completed: [SEC-01]

coverage:
  - id: D1
    description: "Migration file records D-13 live end state statement-for-statement and is idempotent"
    requirement: SEC-01
    verification:
      - kind: other
        ref: "Task 2 static gates: 4 RLS enables, 20 policy drops, 4 creates, 4 alter function, 5 revokes, 4 grants; no RLS-off, always-true, anon/public grants, function redefinition"
        status: pass
      - kind: manual_procedural
        ref: "Plan 01-07: run the file's read-only verification queries against live and reconcile"
        status: unknown
---

# Phase 1 Plan 02: Phase 0 RLS hardening migration Summary

`supabase/migrations/20261108_phase0_tighten_rls.sql` now records the hand-applied live hardening of project ltbqxyvdtrrlohdfrprf: RLS on tasks/products/counters, own-client tasks policies, 16 open policies dropped, function EXECUTE revokes and search_path pins, all idempotent.

## Accomplishments

- Task 1 (tracer): header plus the tasks block (RLS enable, four drop-first `tasks_*_own` policies using `crm_can_access_client(client_id)`).
- Task 2: appointments, bill_items, bills, products, bill_order_counters, client_code_counters, clients blocks; `generate_client_code()` made SECURITY DEFINER (line 56) before RLS on `client_code_counters` (line 57); function revoke/grant for five functions; `search_path = public` on three functions; trailing commented read-only verification queries (policies, RLS flags, function privileges, anon exposure inside rollback).

## Task Commits

1. Task 1: `a77ff34` feat(01-02): add phase0 RLS migration skeleton with tasks policies
2. Task 2: `a59534f` feat(01-02): add remaining D-13 RLS hardening blocks and verification queries

## Deviations from Plan

None - plan executed exactly as written. Draft SQL was not consulted; D-13 used as source of truth.

## Verification

- Both Task 1 gates and both Task 2 gates exit 0 (counts as in coverage D1).
- `git diff --name-only -- package.json package-lock.json` empty.
- Nothing was executed against the live Supabase project (D-14).
- Tracer gate: automated-only verify re-run end-to-end before Task 2 and passed.

## Pending Human Verification

Plan 01-07 must run the file's verification queries against live (read-only) and confirm exact policy names and the `create_order_with_inventory` argument list via `pg_get_function_identity_arguments`. Flagged assumption SEC-01 edge ("unclassified - review manually"): a human should review the final file once. The file contains no rollback statements by design.

## Known Stubs

None.

## Threat Flags

None. Mitigations T-01-06, T-01-07, T-01-09, T-01-11 implemented in the file and gates; T-01-08 deferred to plan 01-07.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261108_phase0_tighten_rls.sql
- FOUND commits: a77ff34, a59534f
