-- Scheduling foundation (quick-261114-22k, Wave 1, D-03): client_settings, one jsonb document per (client, namespace).
-- Additive and idempotent. RLS stays enabled; nothing is granted to anon or public.
-- STATUS: authored but NOT yet applied to live. Run this file by hand in the Supabase SQL Editor with these exact
-- contents (never the CLI push: the live migration table does not list repo files).
-- Apply to live BEFORE deploying code that reads or writes this table.
-- Live default privileges give new public tables to anon, so they are revoked explicitly below.
--
-- The DB accepts any well-formed namespace so a new namespace needs no migration. The code registry in
-- src/lib/client-settings-types.ts is the allow-list for reads and writes and the only place values are validated.
-- Probe P-1: client_settings is a free name. Probe P-4: crm_can_access_client(uuid) is the own-client predicate.

create table if not exists public.client_settings (
  client_id uuid not null references public.clients(id) on delete cascade,
  namespace text not null check (namespace ~ '^[a-z][a-z0-9_]{0,39}$'),
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 8192),
  updated_at timestamptz not null default now(),
  primary key (client_id, namespace)
);

drop trigger if exists client_settings_set_updated_at on public.client_settings;
create trigger client_settings_set_updated_at
before update on public.client_settings
for each row execute function public.update_updated_at_column();

-- RLS: select, insert, update for the own client only. No delete policy and no delete grant.
alter table public.client_settings enable row level security;

drop policy if exists client_settings_select_own on public.client_settings;
create policy client_settings_select_own
on public.client_settings for select to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists client_settings_insert_own on public.client_settings;
create policy client_settings_insert_own
on public.client_settings for insert to authenticated
with check (public.crm_can_access_client(client_id));

drop policy if exists client_settings_update_own on public.client_settings;
create policy client_settings_update_own
on public.client_settings for update to authenticated
using (public.crm_can_access_client(client_id))
with check (public.crm_can_access_client(client_id));

revoke all on public.client_settings from public, anon, authenticated;
grant select, insert, update on public.client_settings to authenticated;

-- ===========================================================================
-- Read-only verification queries (run against live; SELECT only)
-- ===========================================================================
-- (a) Exposure (expect relrowsecurity true; authenticated select/insert/update only; anon none; three policies).
-- select c.relname, c.relrowsecurity
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname = 'client_settings';
-- select grantee, privilege_type from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'client_settings' order by grantee, privilege_type;
-- select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'client_settings' order by policyname;
--
-- (b) Constraint probes (rolled back; as postgres).
-- begin;
-- insert into public.client_settings (client_id, namespace, settings) values ('<client id>', 'Bad-Name', '{}');  -- expect 23514
-- insert into public.client_settings (client_id, namespace, settings) values ('<client id>', 'scheduling', '[]'); -- expect 23514
-- rollback;
--
-- (c) Cross-tenant and anon probes (rolled back).
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"sub":"<tenant A crm_user_id>","role":"authenticated"}', true);
-- select count(*) from public.client_settings where client_id = '<tenant B client id>';                        -- expect 0
-- insert into public.client_settings (client_id, namespace) values ('<tenant B client id>', 'scheduling');      -- expect 42501
-- rollback;
-- begin;
-- set local role anon;
-- select count(*) from public.client_settings;                                                                  -- expect permission denied
-- rollback;

-- ===========================================================================
-- Rollback (commented; run by hand only if needed; loses saved settings)
-- ===========================================================================
-- drop table if exists public.client_settings;
