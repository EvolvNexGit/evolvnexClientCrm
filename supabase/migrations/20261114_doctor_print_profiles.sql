-- Per-doctor print profiles for clinic receipts (letterhead vs standard printed header). Additive and idempotent.
-- RLS stays enabled; nothing is granted to anon or public.
-- STATUS: authored but NOT yet applied to live. Run this file by hand in the Supabase SQL Editor with these exact
-- contents (never the CLI push: the live migration table does not list repo files).
-- Apply to live BEFORE deploying code that reads this table (standard-mode receipts select from it).
-- Live default privileges give new public tables to anon, so they are revoked explicitly below.

create table if not exists public.doctor_print_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  doctor_name text not null check (length(btrim(doctor_name)) > 0 and length(doctor_name) <= 200),
  mode text not null default 'letterhead' check (mode in ('letterhead', 'standard')),
  clinic_name text check (clinic_name is null or length(clinic_name) <= 200),
  doctor_display_name text check (doctor_display_name is null or length(doctor_display_name) <= 200),
  qualification text check (qualification is null or length(qualification) <= 200),
  address text check (address is null or length(address) <= 500),
  phone text check (phone is null or length(phone) <= 200),
  reg_no text check (reg_no is null or length(reg_no) <= 200),
  gst_no text check (gst_no is null or length(gst_no) <= 200),
  header_mm numeric(5,1) check (header_mm is null or header_mm between 0 and 100),
  footer_mm numeric(5,1) check (footer_mm is null or footer_mm between 0 and 100),
  left_mm numeric(5,1) check (left_mm is null or left_mm between 0 and 50),
  right_mm numeric(5,1) check (right_mm is null or right_mm between 0 and 50),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, doctor_name)
);

-- At most one default profile per client.
create unique index if not exists doctor_print_profiles_one_default_per_client
on public.doctor_print_profiles (client_id)
where is_default is true;

alter table public.doctor_print_profiles enable row level security;

drop policy if exists doctor_print_profiles_select_own on public.doctor_print_profiles;
create policy doctor_print_profiles_select_own
on public.doctor_print_profiles for select to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists doctor_print_profiles_insert_own on public.doctor_print_profiles;
create policy doctor_print_profiles_insert_own
on public.doctor_print_profiles for insert to authenticated
with check (public.crm_can_access_client(client_id));

drop policy if exists doctor_print_profiles_update_own on public.doctor_print_profiles;
create policy doctor_print_profiles_update_own
on public.doctor_print_profiles for update to authenticated
using (public.crm_can_access_client(client_id))
with check (public.crm_can_access_client(client_id));

drop policy if exists doctor_print_profiles_delete_own on public.doctor_print_profiles;
create policy doctor_print_profiles_delete_own
on public.doctor_print_profiles for delete to authenticated
using (public.crm_can_access_client(client_id));

revoke all on public.doctor_print_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.doctor_print_profiles to authenticated;
