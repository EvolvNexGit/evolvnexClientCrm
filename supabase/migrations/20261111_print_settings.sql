-- Per-client letterhead margins for body-only print (D-05, D-12). Additive and idempotent.
-- RLS stays enabled; nothing is granted to anon or public.
-- Applied live 2026-11-10 by running this file in the Supabase SQL Editor with these exact contents
-- (never the CLI push: the live migration table does not list repo files).
-- Apply to live BEFORE deploying code that selects these columns.
-- Live default privileges give new public tables to anon, so they are revoked explicitly below.

create table if not exists public.print_settings (
  client_id uuid primary key references public.clients(id) on delete cascade,
  header_mm numeric(5,1) not null default 0 check (header_mm between 0 and 100),
  footer_mm numeric(5,1) not null default 0 check (footer_mm between 0 and 100),
  left_mm numeric(5,1) not null default 0 check (left_mm between 0 and 50),
  right_mm numeric(5,1) not null default 0 check (right_mm between 0 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.print_settings enable row level security;

drop policy if exists print_settings_select_own on public.print_settings;
create policy print_settings_select_own
on public.print_settings for select to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists print_settings_insert_own on public.print_settings;
create policy print_settings_insert_own
on public.print_settings for insert to authenticated
with check (public.crm_can_access_client(client_id));

drop policy if exists print_settings_update_own on public.print_settings;
create policy print_settings_update_own
on public.print_settings for update to authenticated
using (public.crm_can_access_client(client_id))
with check (public.crm_can_access_client(client_id));

revoke all on public.print_settings from public, anon, authenticated;
grant select, insert, update on public.print_settings to authenticated;
