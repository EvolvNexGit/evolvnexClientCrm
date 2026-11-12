---
phase: 02-consultation-and-print
plan: 01
subsystem: database
tags: [supabase, rls, storage, migration, tenancy]
status: complete
provides:
  - "consultations.vitals jsonb with shape check (keys bp, pulse, temperature, weight, spo2; max 256 bytes)"
  - "print_settings table (one row per client, mm margins, RLS, explicit grants)"
  - "consultation_attachments.storage_path + client-prefix check; file_url nullable"
  - "Private bucket consultation-files (10 MB, pdf/jpeg/png/webp) with select/insert/delete policies on first folder segment"
affects: [02-02, 02-03, 02-04, 02-05]
key-files:
  created:
    - supabase/migrations/20261111_consultations_vitals.sql
    - supabase/migrations/20261111_print_settings.sql
    - supabase/migrations/20261111_consultation_files_storage.sql
key-decisions:
  - "vitals migration applied live by orchestrator via MCP execute_sql; print_settings and storage migrations run by the user in the Supabase SQL Editor after the tool prompt declined the DDL"
  - "No update policy on storage.objects (upload once, delete, re-upload)"
  - "print_settings explicitly revokes the default anon/public grants, then grants select/insert/update to authenticated"
coverage:
  - id: V1-V5
    description: "Columns, constraints, RLS, policies, privileges, bucket config verified by read-only SELECTs against live"
    status: pass
  - id: V6
    description: "Public bucket URL returns 400, not 200"
    status: pass
  - id: V7
    description: "Rolled-back cross-tenant simulation: B sees 0 of A's objects and print_settings, B cannot insert into A's folder or A's print_settings, A sees own object, anon denied"
    status: pass
---

# Plan 02-01 summary

Live probes ran first (read-only): customers already had the Phase 1 clinical columns; `consultations.vitals` jsonb already existed without constraints; `storage.buckets` held only `menu`; no `storage.objects` policies existed; default ACL granted anon/authenticated on new public tables.

All three migrations are idempotent and now live. Post-apply verification passed (V1-V7). RLS stays enabled everywhere; nothing is granted to anon or public.

Deploy-before-code: plans 02-02 to 02-05 depend on these objects.
