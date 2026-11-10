---
phase: 03-doctor-billing
plan: 01
subsystem: database
tags: [postgres, supabase, rls, plpgsql, migrations]
status: in-progress
requires:
  - phase: 02-consultation-and-print
    provides: consultations, PrintSheet, tenant helper crm_can_access_client
provides:
  - "migration A: order_source label Clinic (authored, not yet applied)"
  - "migration B: bills payment CHECK, indexes, create_clinic_bill (authored, not yet applied)"
  - "migration C: tab 015 access for doctor client, 004 disabled (authored, applied last in 03-06)"
affects: [03-02, 03-03, 03-04, 03-05, 03-06]
actuals:
  tokens: 6500
  tasks: 2
  commits: 1
plan_head_before: ff81077693de6db83982bec96cfa3e43a68ce95b
plan_head_after: 88af9ea
requirements-completed: []
---

# Phase 3 Plan 01: Clinic billing migrations Summary

Status: in-progress. Tasks 1 (live probes) and 2 (author A, B, C) done. Task 3 (apply A then B through the SQL Editor, post-apply probes V1-V10) is pending; C is applied last in plan 03-06. `requirements-completed` stays empty until Task 3 passes.

## Migration files (commit 88af9ea)

| File | Role | Apply |
|------|------|-------|
| `supabase/migrations/20261112_bills_order_source_clinic.sql` | A: single statement `alter type public.order_source add value if not exists 'Clinic'` | Alone, first, confirm with `enum_range` |
| `supabase/migrations/20261112_clinic_billing_schema.sql` | B: recorded bills columns, FKs only when missing, scoped lowercase CHECK `bills_clinic_payment_chk`, indexes `bills_consultation_id_uniq` and `bills_clinic_unpaid_idx`, `create_clinic_bill` (SECURITY INVOKER, search_path public), revoke from public/anon, grant to authenticated | Second run, after A committed |
| `supabase/migrations/20261112_doctor_billing_tab.sql` | C: insert 015 access row (display_name Billing, order/permissions from 004 row, not-exists guard), disable 004 (kept), icon copied only if null, tabs_info 015 is_active set true only if not already true | Last, plan 03-06 |

Static verify (4 automated commands from Task 2): all exit 0.

## Task 1: live probe results (2026-11-10/11, read-only, run by the orchestrator)

| Live finding | Probe | Result |
|---|---|---|
| LF-1 bills payment/link columns | P1, P4 | payment_mode text null; payment_status text default 'paid'; consultation_id uuid; appointment_id uuid; FKs bills_consultation_id_fkey and bills_appointment_id_fkey exist and valid. 597 rows, all paid, 0 with mode, 0 with consultation, 0 Clinic, 0 duplicate consultation ids. Constraints: appointment/client/consultation/customer FKs, pkey, customer_or_walkin_check; no payment CHECK |
| LF-2 bills shape and trigger | P1, P6 | only trigger on bills/bill_items is trg_generate_order_id (BEFORE INSERT, SECURITY DEFINER fn, skips when order_id is set); generate_order_id md5 cf6f72e30baeca751ce18af8d9a7b1d8 |
| LF-3 bill_items | P2 | id, bill_id, product_id, quantity int NOT NULL, price numeric NOT NULL, total numeric NOT NULL; no client_id |
| LF-4 enums | P3 | order_source POS/'Air Menu'; order_status PENDING/ACCEPTED/DELIVERED; consultation_status DRAFT/IN_PROGRESS/COMPLETED/CANCELLED |
| LF-5 policies and helper | P5 | bills_{select,insert,update,delete}_own scoped by exists(clients c where c.id = bills.client_id and c.crm_user_id = auth.uid()); bill_items_*_own via join to bills/clients; crm_can_access_client(uuid) SQL STABLE, search_path public, not definer (anon has execute, pre-existing) |
| LF-6 tab registry | P7 | tabs_info 015 exists (id 8494c870-ec04-4686-8cdd-0953dd7387fd, is_active true, icon null, name Doctor-billing); doctor client_tab_access has 002, 004 (row 521f9c2e-823e-4b27-be72-49bfc43b371b), 007, 008, 009, 013, 014, no 015. Other clients' per-key rows (all enabled): 001:1, 002:2, 003:1, 004:3, 005:2, 006:2, 007:3, 008:3, 009:3, 010:1, 011:2, 012:2, 013:2, 014:2 |
| LF-7 doctor products | P8 | doctor client eafea940-a6d1-4aa2-95e2-339f614502ea (crm_user_id 77000da8-c7b6-42eb-95f0-eddf2d376d2e) has 0 products; 3 of 4 consultations COMPLETED. products: id uuid default gen_random_uuid(), client_id uuid null, name text NOT NULL, price numeric NOT NULL, type text null, is_active bool default true, created_at, image_url |
| LF-8 consultations | P2, P3 | status enum consultation_status (COMPLETED label confirmed) |
| LF-9 cafe function | P6 | create_order_with_inventory def md5 0f2a22a2624dfe9f37d0017aa59fe52d (V10 compares against this) |

Other tenants for isolation probes: client 6f32b50b-09a6-47fb-827e-22669fc32c40 (user 14723a44-6e0f-4c8a-a6d5-17577a60c1d0), client a59168ba-84eb-4dc4-bdd3-bba62b21f122 (user fca1be25-43b7-4b6f-9d16-2d700b811ea6).

Stop-and-report gates: all clear (no column type conflict, no duplicate consultation ids, no out-of-range payment values, COMPLETED and DELIVERED labels present, bills policies own-client scoped, no side-effect trigger beyond order-id generator, no existing create_clinic_bill, 015 present and unassigned, doctor has consultations).

## Decisions made while authoring

- CHECK scoped through `coalesce(order_source::text, '') <> 'Clinic'` so the 597 legacy paid/NULL-mode rows stay valid and B does not need A committed at DDL time.
- Items validation uses regex-guarded casts inside CASE so malformed input yields 22023 'Invalid items', never a cast error; discount range is checked before assignment to numeric(12,2) so huge input maps to 22023 rather than 22003.
- Customer lookup uses only id and client_id (no is_active, not in any live finding).
- Migration C additionally sets tabs_info.is_active = true for key 015 only when not already true (live already true; cheap safety, per orchestrator instruction).
- FKs are recorded without an ON DELETE clause and never dropped or re-created.

## Deviations from Plan

None in the migration content beyond the orchestrator-approved is_active safety statement in C.

## Pending

Task 3: user approves, runs A alone then B in the Supabase SQL Editor (never CLI push), orchestrator runs V1-V10 rolled-back probes and records them here, then sets `status: complete`.

## Known Stubs

None.

## Self-Check: PASSED

Files present: the three migration files; commit 88af9ea on feature/doctor-crm-phase1.
