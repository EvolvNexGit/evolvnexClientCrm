-- Doctor clients: vitals on a consultation (D-01). Additive and idempotent.
-- No RLS change: existing consultations_*_own_client policies already cover the column.
-- Applied to live through Supabase MCP execute_sql with these exact contents (never the CLI push:
-- the live migration table does not list repo files).
-- Apply to live BEFORE deploying code that selects these columns.
-- Live already had consultations.vitals jsonb (nullable, empty) on 2026-11-11; the add is a no-op there.

alter table public.consultations
  add column if not exists vitals jsonb;

alter table public.consultations
  drop constraint if exists consultations_vitals_shape;

-- Only the five D-01 keys, an object, at most 256 bytes.
alter table public.consultations
  add constraint consultations_vitals_shape check (
    vitals is null
    or (
      jsonb_typeof(vitals) = 'object'
      and (vitals - array['bp','pulse','temperature','weight','spo2']) = '{}'::jsonb
      and octet_length(vitals::text) <= 256
    )
  );
