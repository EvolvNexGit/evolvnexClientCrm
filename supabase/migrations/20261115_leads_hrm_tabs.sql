-- LEADS / HRM become permission-gated like every other tab.
-- tabs_info rows 016–026; the app maps each key to a coming-soon path key in src/lib/tabs.ts
-- (DB_KEY_TO_CODE_KEY) and module-navigation.ts shows an item only when the client has an
-- enabled client_tab_access row for it (`requiresAccess`).
-- Idempotent. RLS unchanged (tabs_info/client_tab_access stay read-only to authenticated).
-- Applied to live via the Supabase SQL editor / MCP (not CLI push), matching earlier migrations.
--
-- IMPORTANT: after the gating code deploys, clients WITHOUT these rows lose LEADS/HRM nav
-- (including WhatsApp auto replies / settings). Grant rows per client before deploying.

insert into public.tabs_info (key, name, is_active)
select v.key, v.name, true
  from (values
    ('016', 'Leads-inbox'),
    ('017', 'Leads-contacts'),
    ('018', 'Leads-campaigns'),
    ('019', 'Leads-templates'),
    ('020', 'Leads-whatsapp-settings'),
    ('021', 'Leads-automation'),
    ('022', 'Leads-segments'),
    ('023', 'Hrm-employees'),
    ('024', 'Hrm-attendance'),
    ('025', 'Hrm-leave'),
    ('026', 'Hrm-payroll')
  ) as v(key, name)
 where not exists (select 1 from public.tabs_info t where t.key = v.key);

-- ===========================================================================
-- Rollback (commented; run by hand only if needed)
-- ===========================================================================
-- delete from public.client_tab_access cta using public.tabs_info ti
--  where ti.id = cta.tab_id and ti.key between '016' and '026';
-- delete from public.tabs_info where key between '016' and '026';
