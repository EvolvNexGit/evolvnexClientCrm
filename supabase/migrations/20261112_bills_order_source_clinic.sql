-- Phase 3 (doctor billing), migration A: order_source enum label 'Clinic' (D-06, D-10).
-- Additive and idempotent. RLS stays enabled; nothing is granted to anon or public.
-- Applied to live by the user in the Supabase SQL Editor with these exact contents
-- (never the CLI push: the live migration table does not list repo files).
-- Apply to live BEFORE deploying code that reads or writes these fields.
-- Run this file ALONE as its own SQL Editor run, before migration B. A new enum value
-- cannot be used until the transaction that added it has committed.
-- Confirm afterwards: select enum_range(null::public.order_source)::text;  -- must list Clinic

alter type public.order_source add value if not exists 'Clinic';
