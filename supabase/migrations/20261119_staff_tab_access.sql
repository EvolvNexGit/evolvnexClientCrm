-- Scheduling foundation (quick-261114-22k, Wave 1, D-13): dedicated CRM Staff tab, tabs_info key 027, gated by client_tab_access.
-- Idempotent. RLS unchanged (tabs_info and client_tab_access stay read-only to authenticated).
-- STATUS: authored but NOT yet applied to live. Run by hand in the Supabase SQL Editor (never the CLI push: the live
-- migration table does not list repo files).
--
-- APPLY LAST, only after the Staff tab code is deployed (key mapping "027" -> staff in src/lib/tabs.ts, route,
-- sidebar item and render line). An older build does not know key 027, so granting it early risks a stray tab
-- row in old builds (same rule as 20261112_doctor_billing_tab.sql). Also requires 20261119_staff_members.sql applied first.
--
-- NAVIGATION VISIBILITY WARNING (as in 20261115_leads_hrm_tabs.sql): after this runs, every tenant that has the
-- appointments tab (tabs_info key 002) gains a Staff item in the CRM sidebar. Tenants without the appointments tab
-- are unaffected. No existing tab row, no HRM key (023-026) and no other client is changed.
--
-- The tab list is cached per session: users must sign in again to see the new tab.
--
-- Probes (Wave 0): tabs_info key 027 is free; 3 clients have an enabled appointments (002) tab and 0 have a 027 row,
-- so the first run is expected to insert exactly 3 access rows.

-- (i) tabs_info row for key 027 only when absent. icon and route stay null, like the LEADS and HRM seed rows.
insert into public.tabs_info (key, name, is_active)
select '027', 'Staff', true
 where not exists (select 1 from public.tabs_info t where t.key = '027');

-- (ii) Enabled 027 access row for every client that already has an enabled appointments (002) access row and no
-- 027 row yet, copying that client's display_order and permissions. display_name stays null so the default label
-- Staff applies. Idempotent via not-exists.
insert into public.client_tab_access (client_id, tab_id, is_enabled, display_order, permissions)
select a.client_id, t27.id, true, a.display_order, a.permissions
  from public.client_tab_access a
  join public.tabs_info t02 on t02.id = a.tab_id and t02.key = '002'
  join public.tabs_info t27 on t27.key = '027'
 where a.is_enabled is true
   and not exists (
     select 1
       from public.client_tab_access x
      where x.client_id = a.client_id
        and x.tab_id = t27.id
   );

-- ===========================================================================
-- Read-only verification queries (run against live; SELECT only)
-- ===========================================================================
-- (a) Inserted rows equal the probe P-10 count on the first run (expected 3), and a second run inserts zero rows.
-- select count(*) as staff_access_rows
--   from public.client_tab_access cta join public.tabs_info ti on ti.id = cta.tab_id and ti.key = '027';
--
-- (b) A tenant without an enabled appointments tab has no 027 row (expect 0 rows).
-- select cta.client_id
--   from public.client_tab_access cta join public.tabs_info ti on ti.id = cta.tab_id and ti.key = '027'
--  where not exists (
--    select 1 from public.client_tab_access a join public.tabs_info t02 on t02.id = a.tab_id and t02.key = '002'
--     where a.client_id = cta.client_id and a.is_enabled is true
--  );
--
-- (c) HRM keys untouched (expect 4 rows, keys 023-026, unchanged).
-- select key, name, is_active from public.tabs_info where key between '023' and '026' order by key;

-- ===========================================================================
-- Rollback (commented; run by hand only if needed)
-- ===========================================================================
-- delete from public.client_tab_access cta using public.tabs_info ti
--  where ti.id = cta.tab_id and ti.key = '027';
-- delete from public.tabs_info where key = '027';
