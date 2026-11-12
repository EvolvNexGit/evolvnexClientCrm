-- Phase 3 (doctor billing), migration C: tab 015 access for the doctor client, 004 disabled (D-06, D-10, LF-6).
-- Idempotent. RLS stays enabled; nothing is granted to anon or public.
-- Applied to live by the user in the Supabase SQL Editor with these exact contents
-- (never the CLI push: the live migration table does not list repo files).
-- Applied LAST, after the 015 code is deployed; stale tab cache means the doctor must sign in again after it runs.
-- tabs_info key '015' already exists live (LF-6), so no tabs_info row is created here.
-- Rows for tab 009 and for every other client are not touched.

-- (i) 015 access row for the doctor client, copying order and permissions from that client's 004 row.
insert into public.client_tab_access (client_id, tab_id, is_enabled, display_order, permissions, display_name)
select 'eafea940-a6d1-4aa2-95e2-339f614502ea'::uuid,
       t15.id,
       true,
       old_cta.display_order,
       old_cta.permissions,
       'Billing'
  from public.tabs_info t15
  join public.tabs_info t04 on t04.key = '004'
  join public.client_tab_access old_cta
    on old_cta.tab_id = t04.id
   and old_cta.client_id = 'eafea940-a6d1-4aa2-95e2-339f614502ea'::uuid
 where t15.key = '015'
   and not exists (
     select 1
       from public.client_tab_access x
      where x.client_id = 'eafea940-a6d1-4aa2-95e2-339f614502ea'::uuid
        and x.tab_id = t15.id
   );

-- (ii) Disable (never delete) the doctor client's 004 row.
update public.client_tab_access cta
   set is_enabled = false
  from public.tabs_info ti
 where ti.id = cta.tab_id
   and ti.key = '004'
   and cta.client_id = 'eafea940-a6d1-4aa2-95e2-339f614502ea'::uuid
   and cta.is_enabled is distinct from false;

-- (iii) 015 tabs_info row: copy the 004 icon only when the icon is currently null; keep the tab active.
update public.tabs_info t15
   set icon = (select t04.icon from public.tabs_info t04 where t04.key = '004' limit 1)
 where t15.key = '015'
   and t15.icon is null;

update public.tabs_info
   set is_active = true
 where key = '015'
   and is_active is not true;

-- ===========================================================================
-- Rollback (commented; run by hand only if needed)
-- ===========================================================================
-- update public.client_tab_access cta
--    set is_enabled = true
--   from public.tabs_info ti
--  where ti.id = cta.tab_id and ti.key = '004'
--    and cta.client_id = 'eafea940-a6d1-4aa2-95e2-339f614502ea'::uuid;
-- delete from public.client_tab_access cta
--  using public.tabs_info ti
--  where ti.id = cta.tab_id and ti.key = '015'
--    and cta.client_id = 'eafea940-a6d1-4aa2-95e2-339f614502ea'::uuid;
