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
