---
phase: quick-261114-22k
plan: A
subsystem: scheduling-foundation
tags: [staff_members, client_settings, staff-tab, rls, appointments]
requires: []
provides:
  - staff_members table, appointments.staff_member_id, dual-write picker (migration authored, not applied)
  - client_settings store and scheduling namespace registry (migration authored, not applied)
  - dedicated CRM Staff tab gated by tabs_info 027 (seed authored, apply last)
affects: [Wave 2 reminders, Wave 3 packages, Wave 4 calendar sync]
tech-stack:
  added: []
  patterns: [own-client RLS via crm_can_access_client, composite tenant FK, import-free pure registry with node assertion script]
key-files:
  created:
    - supabase/migrations/20261119_staff_members.sql
    - supabase/migrations/20261119_client_settings.sql
    - supabase/migrations/20261119_staff_tab_access.sql
    - src/lib/staff-member-types.ts
    - src/lib/staff-member-queries.ts
    - src/lib/client-settings-types.ts
    - src/lib/client-settings-queries.ts
    - src/hooks/use-staff-members.ts
    - src/hooks/use-client-settings.ts
    - src/components/dashboard/staff-picker-field.tsx
    - src/components/dashboard/tabs/staff-tab.tsx
    - scripts/check-client-settings.mjs
  modified:
    - src/lib/appointment-queries.ts
    - src/lib/tabs.ts
    - src/lib/dashboard-tab-routes.ts
    - src/lib/module-navigation.ts
    - src/components/dashboard/dashboard-page.tsx
    - src/components/dashboard/tabs/appointments-tab.tsx
    - .planning/codebase/INTEGRATIONS.md
    - .planning/codebase/STRUCTURE.md
    - .planning/codebase/CHANGELOG.md
    - .planning/codebase/CONCERNS.md
decisions:
  - "Sync trigger leaves staff_name untouched when it already equals the staff display_name after trim and lowercase, so legacy casing variants never collide with unique_booking during backfill"
  - "Triggers are SECURITY INVOKER with pinned search_path; own-client RLS and the existing appointments policies already allow the writes they perform"
  - "Legacy free-text staff_name with no staff match stays selectable in the picker as '(not in staff list)' so older appointments never lose their staff on edit"
metrics:
  duration: "about 1 session"
  completed: 2026-11-19
status: complete
actuals:
  tokens: 23500
  tasks: 2
  commits: 2
plan_head_before: 686b23270e02b54b81f8de0f833b9729d59801a7
plan_head_after: 436b37012322be02128bf2b606cf6aafc1081d08
---

# Phase quick-261114-22k Plan A: Wave 0 and Wave 1 (staff_members, client_settings, Staff tab) Summary

Tenant-scoped `staff_members` with a dual-writing appointment staff picker, a `client_settings` namespace store, and a dedicated CRM Staff tab gated by tabs_info 027. Three migrations are authored but NOT applied to live. Wave 2 and later were not started.

## Wave 0 probe results (read-only, run by the orchestrator against ltbqxyvdtrrlohdfrprf)

| Probe | Result |
|-------|--------|
| P-1 | `staff_members`, `client_settings`, `integration_*`, `package*` all free. `tabs_info` columns: id uuid, name, key, description, icon, route, is_active (not `tab_key`); keys 001-026 exist, 027/028/029 free. `client_tab_access`: id, client_id, tab_id, is_enabled, display_order, permissions jsonb, created_at, updated_at, display_name |
| P-2 | `appointments`: client_id uuid NOT NULL (0 null rows) so the composite FK is viable; status CHECK tentative/booked/cancelled/completed; no `updated_at` column; NO user triggers; `unique_booking` UNIQUE (client_id, date, start_time, staff_name); `verified_by` FK to employees left alone; RLS select/update/delete `client_id = current_client_id()`, insert with_check same |
| P-3 | `customers` PK = id |
| P-4 | `crm_can_access_client(uuid)` is exactly `exists(select 1 from clients c where c.id = target and c.crm_user_id = auth.uid())`, STABLE sql, search_path public, so used as the own-client predicate. `update_updated_at_column()` exists |
| P-5 | PostgreSQL 17.6; pgcrypto installed; supabase_vault 0.3.1 installed; pg_net 0.20.0 and pg_cron 1.6.4 available, not installed (Wave 4 only) |
| P-6 | `print_settings`: authenticated INSERT/SELECT/UPDATE, postgres all, no service_role grant. Later integration tables need explicit service_role grants (not relevant to Wave 1) |
| P-10 | 3 clients have an enabled appointments (002) tab; 0 existing 027 rows. First run of the Staff access seed is expected to insert exactly 3 rows |
| P-8 | NOT answered (human question: do the numbered specs outside the repo define integrations, packages, staff or tenant settings differently). Recorded as an unresolved assumption: Wave 1 proceeded on the plan as written. User should confirm before Wave 3 (packages) and Wave 4 (integrations) at the latest, and ideally before applying the Wave 1 migrations |
| P-7, P-9 | P-7 resolved by D-12. P-9 (secret-box present?) is Wave 4 only; not checked in this plan (the base already lacks `src/lib/crypto`) |

No stop condition triggered.

## Tasks

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 1 | Tracer: staff member picked or quick-added in the appointment form and saved with `staff_member_id` and `staff_name` | 4609dda | `20261119_staff_members.sql`, `staff-member-{types,queries}.ts`, `use-staff-members.ts`, `staff-picker-field.tsx`, `appointment-queries.ts`, `appointments-tab.tsx` |
| 2 | client_settings store, registry, gated CRM Staff tab, docs | 436b370 | `20261119_client_settings.sql`, `20261119_staff_tab_access.sql`, `client-settings-{types,queries}.ts`, `use-client-settings.ts`, `staff-tab.tsx`, wiring in `tabs.ts` / `dashboard-tab-routes.ts` / `module-navigation.ts` / `dashboard-page.tsx`, `scripts/check-client-settings.mjs`, four codebase docs |

## Verification

- `npx tsc --noEmit`: exit 0 after each task and at the end.
- `node scripts/check-client-settings.mjs`: "all assertions passed" (defaults for null, non-object, unknown keys and wrong types; valid IANA zone accepted; invalid zone falls back to Asia/Kolkata on read and is rejected on strict save; unknown namespace rejected; scheduling round-trips). Node prints a harmless MODULE_TYPELESS_PACKAGE_JSON warning.
- Task 2 automated verify chain (tsc, script, the three grep checks, and the HRM-untouched diff check on `tabs.ts`, `dashboard-tab-routes.ts`, `module-navigation.ts`): passed.
- `npm run build`: exit 0 (compiled, types valid, 5/5 static pages).
- NOT run: anything against the live database (no migration applied, no rolled-back role probes), mobile 320px visual check, two-tenant UI check, browser run of the Staff tab or picker. These need the migrations applied; the probe SQL is in each migration footer.

## Deviations from Plan

**1. [Rule 3 - Blocking] `use-staff-members.ts` created in Task 1 instead of Task 2.** The appointment form (Task 1) needs the staff list and a create mutator, and the plan already puts the same hook in Task 2's file list. Creating it once in Task 1 avoids a throwaway duplicate fetch path. Commit 4609dda. No behaviour change versus the plan.

**2. [Rule 1 - Bug avoided] Sync trigger skips the rewrite when names already match after trim and lowercase.** Rewriting staff_name to the canonical casing during the backfill could make two legacy casing variants at the same date and start_time collide on `unique_booking`. Same-name rows are left untouched; mismatching names are still rewritten.

**3. TDD note.** Task 2 is marked tdd="true", but the pure module and its assertion script were written in the same step (no separate RED commit); the script was run green before commit. The repo has no test runner, so no test-first commit gate applies.

No Rule 4 items. No auth gates. HRM keys 023-026 and `public.employees` / `public.people` were not touched.

## Known Stubs

None.

## Needs user action (nothing below has been done)

Apply by hand in the Supabase SQL Editor (never CLI push), in this order:

1. `supabase/migrations/20261119_staff_members.sql` (before deploying this code)
2. `supabase/migrations/20261119_client_settings.sql` (before deploying this code)
3. Deploy the code.
4. `supabase/migrations/20261119_staff_tab_access.sql` LAST, after deploy. It inserts tabs_info 027 and enabled access rows for the 3 tenants with an appointments tab. Users must sign in again to see the Staff item.

Then run the commented verification and rolled-back probes at the bottom of each file (cross-tenant, anon, catalog probe proving no constraint points at `employees` or `people`, rename propagation, seed idempotency count = 3). Answer P-8 (numbered specs) before Wave 3.

Note: the code selects `appointments.staff_member_id` and reads `staff_members`, so deploying it before migrations 1 and 2 are applied breaks the appointments tab. Follow the order above.

## Threat Flags

None beyond the plan's threat model. New surface is RLS-protected tenant tables only; no new endpoints, no service-role code, no secrets.

## Self-Check: PASSED

- Files exist: all 12 created files and 10 modified files present on disk (verified by commit contents).
- Commits exist on HEAD: 4609dda, 436b370.
