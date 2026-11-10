-- Phase 0: tighten RLS. Own-client policies (crm_user_id = auth.uid()) remain the access path.
-- This file records changes ALREADY APPLIED by hand to Supabase project ltbqxyvdtrrlohdfrprf on 2026-11-08 (steps A-F).
-- Every statement is idempotent, so re-running it on live is a no-op.
-- RLS stays on and must never be turned off; never add always-true policies or grants to anon/public.
-- The live migration tracker does not list repo files, so this file is NOT applied through the CLI push command (D-14).
-- It runs as one script/transaction.

-- tasks: RLS was off. Scope to the owning client.
alter table public.tasks enable row level security;

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own
on public.tasks for select to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own
on public.tasks for insert to authenticated
with check (public.crm_can_access_client(client_id));

drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own
on public.tasks for update to authenticated
using (public.crm_can_access_client(client_id))
with check (public.crm_can_access_client(client_id));

drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own
on public.tasks for delete to authenticated
using (public.crm_can_access_client(client_id));

-- appointments: drop the open read-all and public insert policies. Own-client policies remain.
drop policy if exists "Enable read access for all users" on public.appointments;
drop policy if exists insert_appointment on public.appointments;

-- bill_items: drop the open and legacy policies. bill_items_*_own policies remain.
drop policy if exists "allow read bill items" on public.bill_items;
drop policy if exists "bill_items insert" on public.bill_items;
drop policy if exists "bill_items select" on public.bill_items;

-- bills: drop the legacy policies. bills_*_own policies remain.
drop policy if exists "bills insert" on public.bills;
drop policy if exists "bills select" on public.bills;

-- products: drop legacy and read-all policies, then enable RLS. allow_menu_read_products remains.
drop policy if exists "products insert" on public.products;
drop policy if exists "products update" on public.products;
drop policy if exists products_allow_read_all on public.products;
alter table public.products enable row level security;

-- bill_order_counters: drop the open ALL policy, then enable RLS.
drop policy if exists "allow counter system access" on public.bill_order_counters;
alter table public.bill_order_counters enable row level security;

-- client_code_counters: the trigger function must run as definer BEFORE RLS blocks its counter writes.
alter function public.generate_client_code() security definer set search_path = public;
alter table public.client_code_counters enable row level security;

-- clients: drop the open read policies. clients_*_own policies remain.
drop policy if exists "allow client read for billing system" on public.clients;
drop policy if exists "allow read clients for order generation" on public.clients;
drop policy if exists "allow system client lookup for billing" on public.clients;
drop policy if exists "system read clients for billing triggers" on public.clients;
drop policy if exists "system read clients for triggers" on public.clients;

-- function exposure: no EXECUTE for anon/public. Trigger functions are not callable by API roles.
revoke execute on function public.create_order_with_inventory(uuid, uuid, text, text, numeric, json, public.order_status, text, public.order_source, public.order_type) from public, anon;
grant execute on function public.create_order_with_inventory(uuid, uuid, text, text, numeric, json, public.order_status, text, public.order_source, public.order_type) to authenticated, service_role;

revoke execute on function public.get_client_code(uuid) from public, anon;
grant execute on function public.get_client_code(uuid) to authenticated, service_role;

revoke execute on function public.current_client_id() from public, anon;
grant execute on function public.current_client_id() to authenticated, service_role;

revoke execute on function public.generate_order_id() from public, anon, authenticated;
grant execute on function public.generate_order_id() to service_role;

revoke execute on function public.generate_client_code() from public, anon, authenticated;

-- search_path: pin to public on the remaining functions.
alter function public.create_order_with_inventory(uuid, uuid, text, text, numeric, json, public.order_status, text, public.order_source, public.order_type) set search_path = public;
alter function public.update_updated_at_column() set search_path = public;
alter function public.update_customer_loyalty_updated_at() set search_path = public;

-- ===========================================================================
-- Read-only verification queries (run against live; SELECT only)
-- ===========================================================================
-- (a) Policies on the eight hardened tables.
-- select tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('appointments','bill_items','bills','products','clients','bill_order_counters','client_code_counters','tasks')
-- order by tablename, policyname;
--
-- (b) RLS flags (expect relrowsecurity = true on all four).
-- select c.relname, c.relrowsecurity
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname in ('products','bill_order_counters','client_code_counters','tasks')
-- order by c.relname;
--
-- (c) Function definitions, security mode, config and EXECUTE privileges.
-- select p.proname,
--        pg_get_function_identity_arguments(p.oid) as identity_args,
--        p.prosecdef,
--        p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
--        has_function_privilege('public', p.oid, 'execute') as public_exec
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('create_order_with_inventory','get_client_code','current_client_id','generate_order_id','generate_client_code','update_updated_at_column','update_customer_loyalty_updated_at','crm_can_access_client')
-- order by p.proname;
--
-- (d) Anon exposure check (expect 0 rows or a permission error for each count).
-- begin;
-- set local role anon;
-- select count(*) from public.appointments;
-- select count(*) from public.clients;
-- select count(*) from public.products;
-- select count(*) from public.bill_items;
-- rollback;
