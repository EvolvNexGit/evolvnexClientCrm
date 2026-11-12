-- Grant every active tab (001–026) to the internal test client a59168ba-84eb-4dc4-bdd3-bba62b21f122
-- (all-access QA account). Requested 2026-11-13. Idempotent; other clients untouched.
-- Note: enabling both 004 (Billing) and 015 (Doctor-billing) shows two "Billing" items under POS.
-- Users must sign in again (tab cache) after this runs.

insert into public.client_tab_access (client_id, tab_id, is_enabled, display_order, permissions)
select 'a59168ba-84eb-4dc4-bdd3-bba62b21f122'::uuid, ti.id, true, 0, '{}'::jsonb
  from public.tabs_info ti
 where ti.is_active = true
   and not exists (
     select 1
       from public.client_tab_access x
      where x.client_id = 'a59168ba-84eb-4dc4-bdd3-bba62b21f122'::uuid
        and x.tab_id = ti.id
   );

update public.client_tab_access
   set is_enabled = true
 where client_id = 'a59168ba-84eb-4dc4-bdd3-bba62b21f122'::uuid
   and is_enabled is distinct from true;

-- Rollback (commented): disable rows added here
-- update public.client_tab_access cta set is_enabled = false from public.tabs_info ti
--  where ti.id = cta.tab_id and ti.key in ('015','016','017','018','019','020','021','022','023','024','025','026')
--    and cta.client_id = 'a59168ba-84eb-4dc4-bdd3-bba62b21f122'::uuid;
