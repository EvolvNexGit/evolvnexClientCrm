-- Scheduling Wave 3 (quick-261114-22k, plan C1, D-13): Packages tab, tabs_info key 028, gated by client_tab_access.
-- Idempotent. RLS unchanged (tabs_info and client_tab_access stay read-only to authenticated).
-- STATUS: authored but NOT yet applied to live. Run by hand in the Supabase SQL Editor (never the CLI push: the live
-- migration table does not list repo files).
--
-- APPLY LAST, only after the Packages tab code is deployed (key mapping "028" -> packages in src/lib/tabs.ts, route,
-- sidebar item and render line). An older build does not know key 028, so granting it early risks a stray tab row in
-- old builds (same rule as 20261119_staff_tab_access.sql). Requires 20261120_packages_schema.sql and
-- 20261120_packages_rpcs.sql applied first.
--
-- NO AUTOMATIC BACKFILL (Design Spec 5.4): this file only inserts the tabs_info row. No tenant sees Packages until
-- an access row is granted by hand (template below). No existing tab row, no HRM key (023-026), no Staff row (027)
-- and no client is changed by this file.
--
-- The tab list is cached per session: after a grant, that tenant's users must sign in again to see the new tab.
--
-- Probe (live, 2026-11-20): tabs_info key 028 is free (max key 027).

-- (i) tabs_info row for key 028 only when absent. icon and route stay null, like the Staff, LEADS and HRM seed rows.
insert into public.tabs_info (key, name, is_active)
select '028', 'Packages', true
 where not exists (select 1 from public.tabs_info t where t.key = '028');

-- ===========================================================================
-- Manual grant template (commented; run by hand per tenant that should see Packages)
-- ===========================================================================
-- insert into public.client_tab_access (client_id, tab_id, is_enabled, display_order, permissions)
-- select '<client id>'::uuid, t.id, true, 50, '[]'::jsonb
--   from public.tabs_info t
--  where t.key = '028'
--    and not exists (
--      select 1 from public.client_tab_access x where x.client_id = '<client id>'::uuid and x.tab_id = t.id
--    );
-- (Copy display_order and permissions from the tenant's appointments row instead of 50 and [] if preferred.)

-- ===========================================================================
-- Read-only verification queries (run against live; SELECT only)
-- ===========================================================================
-- (a) One 028 row, and a second run of this file inserts nothing.
-- select key, name, is_active from public.tabs_info where key = '028';
-- (b) Access rows only where granted by hand (expect 0 right after applying this file).
-- select count(*) from public.client_tab_access cta join public.tabs_info ti on ti.id = cta.tab_id and ti.key = '028';
-- (c) HRM keys and Staff untouched.
-- select key, name, is_active from public.tabs_info where key between '023' and '027' order by key;

-- ===========================================================================
-- Rollback (commented; run by hand only if needed)
-- ===========================================================================
-- delete from public.client_tab_access cta using public.tabs_info ti
--  where ti.id = cta.tab_id and ti.key = '028';
-- delete from public.tabs_info where key = '028';
