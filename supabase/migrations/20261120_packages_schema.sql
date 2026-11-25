-- Scheduling Wave 3 (quick-261114-22k, plan C1, D-05, D-06, D-10): packages and sessions schema.
-- Five tables: package_templates (tenant catalog), customer_packages, package_installments, package_sessions,
-- package_payments. Additive and idempotent. RLS stays enabled; nothing is granted to anon or public.
-- STATUS: authored but NOT yet applied to live. Run this file by hand in the Supabase SQL Editor with these exact
-- contents (never the CLI push: the live migration table does not list repo files).
--
-- APPLY ORDER (Wave 3 core):
--   1. 20261119_staff_members.sql and 20261119_client_settings.sql (Wave 1) must already be applied.
--   2. THIS FILE.
--   3. 20261120_packages_rpcs.sql (definer RPCs and the appointments status trigger).
--   4. Deploy the code.
--   5. 20261120_packages_tab_access.sql LAST (tabs_info 028 only; access rows are granted by hand per tenant).
-- Apply BEFORE deploying code that reads these tables.
--
-- Write model (R-10, confirmed 2026-11-20): the browser may read all five tables for its own client, but may write
-- only package_templates (a catalog with no money). The four ledger tables have NO insert, update or delete grant
-- for any API role: every ledger write goes through the SECURITY DEFINER RPCs in 20261120_packages_rpcs.sql.
--
-- Future proof (5.5): every policy value that affects credit or money is snapshotted on the row that used it
-- (package_sessions.validity_extended_days for R-15, package_sessions.charge_on_forfeit for R-16), so a later
-- client_settings change never rewrites history. Columns needed by the Task 7 payment RPCs (cancelled_at,
-- cancel_reason, package_payments.*) exist now so no later ALTER is needed.
--
-- Probe results this file relies on (live, read-only, 2026-11-20): all five table names free; customers PK is id;
-- appointments has id, client_id (not null), date, start_time, status (tentative, booked, completed, cancelled),
-- deleted_at and no customer link column. public.crm_can_access_client(uuid) is the own-client predicate
-- (exactly clients.crm_user_id = auth.uid() for that client). public.update_updated_at_column() exists.
-- Customers are soft-deleted by the app (is_active = false), so the plain customer FK below never blocks the UI.

-- ===========================================================================
-- (a) package_templates: tenant catalog (browser CRUD under own-client RLS)
-- ===========================================================================
create table if not exists public.package_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  session_count integer not null check (session_count between 1 and 500),
  payment_plan text not null default 'upfront'
    check (payment_plan in ('upfront', 'installments', 'per_visit')),
  price_total numeric(12,2) check (price_total is null or (price_total >= 0 and price_total <= 99999999.99)),
  price_per_session numeric(12,2)
    check (price_per_session is null or (price_per_session >= 0 and price_per_session <= 99999999.99)),
  validity_days integer check (validity_days is null or validity_days between 1 and 3650),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, id),
  constraint package_templates_price_plan_chk check (
    (payment_plan = 'per_visit' and price_per_session is not null and price_total is null)
    or (payment_plan <> 'per_visit' and price_total is not null and price_per_session is null)
  )
);

create unique index if not exists package_templates_client_name_uniq
  on public.package_templates (client_id, lower(btrim(name)));

drop trigger if exists package_templates_set_updated_at on public.package_templates;
create trigger package_templates_set_updated_at
before update on public.package_templates
for each row execute function public.update_updated_at_column();

-- ===========================================================================
-- (b) customer_packages: a package sold to one customer (ledger header; RPC writes only)
-- ===========================================================================
-- expired is derived (valid_until passed and not completed), never stored.
create table if not exists public.customer_packages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  template_id uuid,
  name_snapshot text not null check (length(btrim(name_snapshot)) between 1 and 120),
  sessions_total integer not null check (sessions_total between 1 and 500),
  payment_plan text not null check (payment_plan in ('upfront', 'installments', 'per_visit')),
  price_total numeric(12,2) check (price_total is null or (price_total >= 0 and price_total <= 99999999.99)),
  price_per_session numeric(12,2)
    check (price_per_session is null or (price_per_session >= 0 and price_per_session <= 99999999.99)),
  valid_until date,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  note text check (note is null or length(note) <= 500),
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, id),
  constraint customer_packages_price_plan_chk check (
    (payment_plan = 'per_visit' and price_per_session is not null and price_total is null)
    or (payment_plan <> 'per_visit' and price_total is not null and price_per_session is null)
  ),
  constraint customer_packages_cancel_chk check ((status = 'cancelled') = (cancelled_at is not null))
);

-- Template link is tenant-scoped; deleting a template keeps the sold package (only template_id is cleared).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.customer_packages'::regclass
       and conname = 'customer_packages_template_fkey'
  ) then
    alter table public.customer_packages
      add constraint customer_packages_template_fkey
      foreign key (client_id, template_id)
      references public.package_templates (client_id, id)
      on delete set null (template_id);
  end if;
end
$$;

create index if not exists customer_packages_client_customer_idx
  on public.customer_packages (client_id, customer_id);
create index if not exists customer_packages_client_status_idx
  on public.customer_packages (client_id, status, created_at desc);

drop trigger if exists customer_packages_set_updated_at on public.customer_packages;
create trigger customer_packages_set_updated_at
before update on public.customer_packages
for each row execute function public.update_updated_at_column();

-- ===========================================================================
-- (c) package_installments: due-dated schedule (sum = price_total, enforced by the sell RPC in Task 7)
-- ===========================================================================
create table if not exists public.package_installments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  package_id uuid not null,
  seq integer not null check (seq between 1 and 120),
  due_on date not null,
  amount numeric(12,2) not null check (amount > 0 and amount <= 99999999.99),
  created_at timestamptz not null default now(),
  unique (client_id, id),
  unique (package_id, seq),
  constraint package_installments_package_fkey
    foreign key (client_id, package_id) references public.customer_packages (client_id, id) on delete cascade
);

create index if not exists package_installments_client_package_idx
  on public.package_installments (client_id, package_id, due_on);

-- ===========================================================================
-- (d) package_sessions: credit ledger, one row per use (RPC and trigger writes only)
-- ===========================================================================
-- status         consumes credit  holds a slot
-- scheduled      no               yes
-- completed      yes              no
-- missed_pending no               yes   (awaiting the doctor's decision; never consumes)
-- rolled_over    no               no
-- forfeited      yes              no
-- voided         no               no
create table if not exists public.package_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  package_id uuid not null,
  appointment_id uuid references public.appointments(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'missed_pending', 'rolled_over', 'forfeited', 'voided')),
  missed_reason text check (missed_reason is null or missed_reason in ('cancelled', 'no_show')),
  resolution text check (resolution is null or resolution in ('rollover', 'forfeit')),
  resolution_overrode_default boolean not null default false,
  -- R-15 snapshot: days added to customer_packages.valid_until by this rollover (0 = expiry did not move).
  validity_extended_days integer not null default 0 check (validity_extended_days between 0 and 365),
  -- R-16 snapshot: whether this forfeited visit is owed on a per-visit plan; set only for forfeited rows.
  charge_on_forfeit boolean,
  note text check (note is null or length(note) <= 500),
  completed_at timestamptz,
  missed_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  voided_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, id),
  constraint package_sessions_package_fkey
    foreign key (client_id, package_id) references public.customer_packages (client_id, id) on delete cascade,
  -- A decision exists exactly on resolved rows, and matches the status.
  constraint package_sessions_resolution_chk check (
    (status = 'rolled_over' and resolution = 'rollover' and resolved_at is not null)
    or (status = 'forfeited' and resolution = 'forfeit' and resolved_at is not null)
    or (status not in ('rolled_over', 'forfeited') and resolution is null and resolved_at is null
        and resolution_overrode_default = false)
  ),
  constraint package_sessions_forfeit_snapshot_chk check ((status = 'forfeited') = (charge_on_forfeit is not null)),
  constraint package_sessions_extension_chk check (validity_extended_days = 0 or status = 'rolled_over')
);

-- One live link per appointment (voided links are history and may repeat).
create unique index if not exists package_sessions_appointment_live_uniq
  on public.package_sessions (appointment_id)
  where appointment_id is not null and status <> 'voided';

create index if not exists package_sessions_client_package_idx
  on public.package_sessions (client_id, package_id, status);
create index if not exists package_sessions_client_pending_idx
  on public.package_sessions (client_id, missed_at)
  where status = 'missed_pending';

drop trigger if exists package_sessions_set_updated_at on public.package_sessions;
create trigger package_sessions_set_updated_at
before update on public.package_sessions
for each row execute function public.update_updated_at_column();

-- ===========================================================================
-- (e) package_payments: append-only money ledger (rows written by Task 7 RPCs only)
-- ===========================================================================
create table if not exists public.package_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  package_id uuid not null,
  kind text not null check (kind in ('upfront', 'installment', 'per_visit')),
  amount numeric(12,2) not null check (amount > 0 and amount <= 99999999.99),
  method text not null check (method in ('CASH', 'UPI', 'CARD', 'OTHER')),
  paid_at timestamptz not null default now(),
  session_id uuid,
  note text check (note is null or length(note) <= 500),
  recorded_by uuid,
  created_at timestamptz not null default now(),
  unique (client_id, id),
  constraint package_payments_package_fkey
    foreign key (client_id, package_id) references public.customer_packages (client_id, id),
  constraint package_payments_session_fkey
    foreign key (client_id, session_id) references public.package_sessions (client_id, id),
  constraint package_payments_per_visit_chk check (kind <> 'per_visit' or session_id is not null)
);

create index if not exists package_payments_client_package_idx
  on public.package_payments (client_id, package_id, paid_at);

-- ===========================================================================
-- (f) RLS and grants
-- ===========================================================================
alter table public.package_templates enable row level security;
alter table public.customer_packages enable row level security;
alter table public.package_installments enable row level security;
alter table public.package_sessions enable row level security;
alter table public.package_payments enable row level security;

-- Templates: select, insert, update, delete for the own client.
drop policy if exists package_templates_select_own on public.package_templates;
create policy package_templates_select_own
on public.package_templates for select to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists package_templates_insert_own on public.package_templates;
create policy package_templates_insert_own
on public.package_templates for insert to authenticated
with check (public.crm_can_access_client(client_id));

drop policy if exists package_templates_update_own on public.package_templates;
create policy package_templates_update_own
on public.package_templates for update to authenticated
using (public.crm_can_access_client(client_id))
with check (public.crm_can_access_client(client_id));

drop policy if exists package_templates_delete_own on public.package_templates;
create policy package_templates_delete_own
on public.package_templates for delete to authenticated
using (public.crm_can_access_client(client_id));

-- Ledger tables: select own only. No write policy AND no write grant (two independent barriers).
drop policy if exists customer_packages_select_own on public.customer_packages;
create policy customer_packages_select_own
on public.customer_packages for select to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists package_installments_select_own on public.package_installments;
create policy package_installments_select_own
on public.package_installments for select to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists package_sessions_select_own on public.package_sessions;
create policy package_sessions_select_own
on public.package_sessions for select to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists package_payments_select_own on public.package_payments;
create policy package_payments_select_own
on public.package_payments for select to authenticated
using (public.crm_can_access_client(client_id));

-- Live default privileges hand new tables to anon, so revoke everything first, then grant the minimum.
revoke all on public.package_templates from public, anon, authenticated;
revoke all on public.customer_packages from public, anon, authenticated;
revoke all on public.package_installments from public, anon, authenticated;
revoke all on public.package_sessions from public, anon, authenticated;
revoke all on public.package_payments from public, anon, authenticated;

grant select, insert, update, delete on public.package_templates to authenticated;
grant select on public.customer_packages to authenticated;
grant select on public.package_installments to authenticated;
grant select on public.package_sessions to authenticated;
grant select on public.package_payments to authenticated;

-- ===========================================================================
-- Read-only verification queries (run against live; SELECT only)
-- ===========================================================================
-- (a) Exposure: RLS on for all five; authenticated has SELECT only on the four ledger tables and
--     SELECT/INSERT/UPDATE/DELETE on package_templates; anon has nothing.
-- select c.relname, c.relrowsecurity
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public'
--    and c.relname in ('package_templates','customer_packages','package_installments','package_sessions','package_payments');
-- select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public'
--    and table_name in ('package_templates','customer_packages','package_installments','package_sessions','package_payments')
--    and grantee in ('anon','authenticated','public')
--  order by table_name, grantee, privilege_type;
-- select tablename, policyname, cmd from pg_policies
--  where schemaname = 'public' and (tablename like 'package%' or tablename = 'customer_packages')
--  order by tablename, policyname;
--
-- (b) Role-simulation probes: see supabase/tests/20261120_packages_probes.sql (single rolled-back transaction:
--     other tenant sees none, direct insert/update/delete on every ledger table denied, anon denied).
-- Quick manual version (rolled back):
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"sub":"<tenant A crm_user_id>","role":"authenticated"}', true);
-- select count(*) from public.customer_packages where client_id = '<tenant B client id>';            -- expect 0
-- insert into public.package_sessions (client_id, package_id) values ('<tenant A client id>', gen_random_uuid()); -- expect 42501
-- rollback;
-- begin;
-- set local role anon;
-- select count(*) from public.customer_packages;                                                     -- expect 42501
-- rollback;

-- ===========================================================================
-- Rollback (commented; run by hand only if needed; loses all package history). Drop the RPC file first.
-- ===========================================================================
-- drop table if exists public.package_payments;
-- drop table if exists public.package_sessions;
-- drop table if exists public.package_installments;
-- drop table if exists public.customer_packages;
-- drop table if exists public.package_templates;
