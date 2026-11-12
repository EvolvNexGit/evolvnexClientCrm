-- Tenant isolation: drop the permissive `using (true)` SELECT policy on client_tab_access.
-- It let any authenticated user read every client's tab-access rows (permissive policies OR together,
-- so it overrode cta_select_own_client). After this, authenticated users read only their own
-- client's rows via cta_select_own_client (clients.crm_user_id = auth.uid()).
-- App impact: none — getTabs() (src/lib/tabs.ts) already filters .eq("client_id", own clientId);
-- webhook/admin paths use the service role (bypasses RLS). RLS stays enabled.
-- Applied to live via MCP / SQL editor (not CLI push), matching earlier migrations.

drop policy if exists client_tab_access_authenticated_select on public.client_tab_access;

-- Rollback (commented; restores the previous open read — not recommended):
-- create policy client_tab_access_authenticated_select on public.client_tab_access
--   for select to authenticated using (true);
