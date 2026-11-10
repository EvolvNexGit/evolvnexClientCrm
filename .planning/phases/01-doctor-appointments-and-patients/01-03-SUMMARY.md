---
phase: 01-doctor-appointments-and-patients
plan: 03
subsystem: customers
tags: [supabase, migration, customers, patients, clinical-fields, nextjs]
status: complete

requires: []
provides:
  - "supabase/migrations/20261110_customers_clinical_fields.sql: gender, blood_group, allergies, chronic_conditions nullable columns on customers"
  - "CustomerRecord/CustomerPayload clinical fields, GENDER_OPTIONS, BLOOD_GROUP_OPTIONS"
  - "Consultation-gated clinical inputs in the customer add/edit modal (PAT-01)"
affects: [01-05 patient profile drawer, 01-07 live migration apply]

actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: 6a0ab0bbf9d14cc7f9899f9f4dfc9b297b253478
plan_head_after: ab025f3fb9eb6f8e2f7ea4d6f4122a59ed9d9fe6

tech-stack:
  added: []
  patterns:
    - "Gate clinic-only UI on useApp().tabs containing key consultation; clinical payload keys added by conditional spread so other tenants' payloads are unchanged"
    - "Trim-or-null on create; update skips undefined keys so forms that omit fields cannot wipe stored values"
    - "Persisted form state read with ?? \"\" to tolerate old localStorage shape"

key-files:
  created:
    - supabase/migrations/20261110_customers_clinical_fields.sql
  modified:
    - src/lib/billing-types.ts
    - src/lib/billing-queries.ts
    - src/components/dashboard/billing/customer-table.tsx

key-decisions:
  - "Migration file written atomically with all four columns in Task 1; types/queries for the other three followed in Task 2"
  - "Clinical payload built by a small buildClinicalPayload helper in customer-table.tsx, spread only when hasClinicalFields"
  - "withStoredOption helper keeps a stored value outside the preset gender/blood group list selectable so saving never blanks it"

requirements-completed: [PAT-01]

coverage:
  - id: D1
    description: "Patient row stores gender, blood_group, allergies, chronic_conditions as nullable fields editable for clinic clients only; empty stored as null; duplicate detection and ordering unchanged"
    requirement: PAT-01
    verification:
      - kind: other
        ref: "tsc gate (errors outside web-push-server.ts) = 0; migration has 4 add-column-if-not-exists; billing-queries.ts mentions each of the four columns 5 times; duplicate-detection region free of clinical fields; 9 created_at desc order clauses; package.json/lock unchanged"
        status: pass
      - kind: manual_procedural
        ref: "Plan 01-07: apply migration to live, then browser check as doctor client (values persist, cleared allergies shows blank not None) and cafe client (modal unchanged)"
        status: unknown
---

# Phase 1 Plan 03: Patient clinical fields Summary

Four nullable clinical columns (gender, blood_group, allergies, chronic_conditions) added to `customers` via an additive migration file, threaded through types, select/mapper/create/update with trim-or-null semantics, and exposed as consultation-gated inputs in the customer add/edit modal.

## Accomplishments

- Task 1 (tracer): migration file (all four columns, `add column if not exists`, no defaults, no RLS change), then `allergies` through every layer: type, payload, `CUSTOMER_SELECT`, create returning select, `mapCustomer`, create insert, update spread, gated Allergies textarea (maxLength 500).
- Task 2: gender, blood group, chronic conditions through the same layers; `GENDER_OPTIONS` / `BLOOD_GROUP_OPTIONS` as-const arrays with derived union types; Gender and Blood group selects (empty "Not set" plus options, stored out-of-list values kept selectable) and Chronic conditions textarea, all inside `showClinicalFields`.

## Task Commits

1. Task 1: `b89f02d` feat(01-03): thread allergies through customers and add clinical migration
2. Task 2: `ab025f3` feat(01-03): add gender, blood group, chronic conditions to patient form

## Deviations from Plan

None - plan executed exactly as written. Minor implementation choice: Task 1 added the `allergies` payload spread inline; Task 2 refactored it into `buildClinicalPayload` (same behavior).

## Verification

- TypeScript gate (`npx tsc --noEmit | grep "error TS" | grep -v web-push-server.ts | wc -l`) = 0 after both tasks.
- Task 1 static gate and Task 2 static gate pass (see coverage D1).
- Tracer gate: automated-only verify re-run end-to-end before Task 2 and passed.
- `git diff --name-only -- package.json package-lock.json` empty. Nothing executed against live Supabase (D-14).

## Pending Human Verification

BLOCKING ORDER: `CUSTOMER_SELECT` now references the four new columns. The migration `supabase/migrations/20261110_customers_clinical_fields.sql` MUST be applied to live (by hand, per D-14) before any deploy or browser use of this code, otherwise every customers query fails for every tenant (PostgREST unknown column). Handled in plan 01-07 Task 1. Then run the Task 2 human check: doctor client adds/edits a patient with all four fields (values persist, cleared allergies shows blank not None); cafe client's modal shows only name, phone, email, date of birth, outreach status.

## Known Stubs

None.

## Threat Flags

None. T-01-12 (migration ordering) documented here and deferred to 01-07; T-01-13 accepted (clinical form state in localStorage via usePersistentState, existing pattern); T-01-14, T-01-15, T-01-16 mitigated (conditional payload spread, undefined-skip update, consultation gate, maxLength 500 and constrained selects).

## Self-Check: PASSED

- FOUND: supabase/migrations/20261110_customers_clinical_fields.sql
- FOUND commits: b89f02d, ab025f3
