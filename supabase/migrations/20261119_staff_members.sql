-- Scheduling foundation (quick-261114-22k, Wave 1, D-02, D-11): tenant-scoped staff_members plus appointments.staff_member_id.
-- Additive and idempotent. RLS stays enabled; nothing is granted to anon or public.
-- STATUS: authored but NOT yet applied to live. Run this file by hand in the Supabase SQL Editor with these exact
-- contents (never the CLI push: the live migration table does not list repo files).
-- Apply to live BEFORE deploying code that reads staff_members or appointments.staff_member_id.
-- Live default privileges give new public tables to anon, so they are revoked explicitly below.
--
-- Isolation (D-11): public.employees and public.people are internal-use tables. Nothing in this file alters,
-- reads, references or backfills from them, and no policy of theirs is touched. appointments.verified_by keeps its
-- existing foreign key to the internal table; staff_member_id is a separate column with its own composite FK.
--
-- Probe results this file relies on (Wave 0, live project, 2026-11-19):
--   P-1  staff_members is a free name.
--   P-2  appointments.client_id is NOT NULL on every row (0 nulls), so the composite tenant FK below is viable.
--        If a later re-probe finds null client_id rows, replace the FK with a validating trigger instead.
--        appointments has NO user triggers today; ours are name-prefixed (appointments_staff_name_sync).
--        appointments has UNIQUE (client_id, date, start_time, staff_name) (unique_booking): see the sync trigger note.
--   P-4  public.crm_can_access_client(uuid) is exactly clients.crm_user_id = auth.uid() for the row's client,
--        so it is the own-client predicate. public.update_updated_at_column() exists.

-- (a) staff_members: one tenant-scoped list of people who can be booked or assigned (any job title).
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) > 0 and length(display_name) <= 200),
  job_title text check (job_title is null or length(job_title) <= 200),
  is_bookable boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Supports the composite tenant foreign key from appointments (and later domains).
  unique (client_id, id)
);

-- Mirrors staffKey semantics (trimmed, lowercased) so legacy name matching stays unambiguous.
create unique index if not exists staff_members_client_name_uniq
  on public.staff_members (client_id, lower(btrim(display_name)));

drop trigger if exists staff_members_set_updated_at on public.staff_members;
create trigger staff_members_set_updated_at
before update on public.staff_members
for each row execute function public.update_updated_at_column();

-- (b) RLS: select, insert, update for the own client only. No delete policy and no delete grant:
-- staff referenced by history are deactivated, never deleted.
alter table public.staff_members enable row level security;

drop policy if exists staff_members_select_own on public.staff_members;
create policy staff_members_select_own
on public.staff_members for select to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists staff_members_insert_own on public.staff_members;
create policy staff_members_insert_own
on public.staff_members for insert to authenticated
with check (public.crm_can_access_client(client_id));

drop policy if exists staff_members_update_own on public.staff_members;
create policy staff_members_update_own
on public.staff_members for update to authenticated
using (public.crm_can_access_client(client_id))
with check (public.crm_can_access_client(client_id));

revoke all on public.staff_members from public, anon, authenticated;
grant select, insert, update on public.staff_members to authenticated;

-- (c) appointments.staff_member_id: additive nullable column; staff_name stays (dual-write, Stage A).
alter table public.appointments add column if not exists staff_member_id uuid;

-- Composite FK: an appointment can never point at another tenant's staff member.
-- NO ACTION on delete (staff are never deleted). MATCH SIMPLE skips the check while staff_member_id is null.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.appointments'::regclass
       and conname = 'appointments_staff_member_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_staff_member_fkey
      foreign key (client_id, staff_member_id)
      references public.staff_members (client_id, id);
  end if;
end
$$;

create index if not exists appointments_client_staff_member_date_idx
  on public.appointments (client_id, staff_member_id, date)
  where deleted_at is null;

-- (d) Dual-write guard: whenever staff_member_id is set, staff_name follows the staff member's display_name,
-- from any writer. The lookup is tenant-scoped. When the existing text already matches after trim and lowercase it
-- is left untouched, so legacy casing variants never collide with unique_booking
-- (client_id, date, start_time, staff_name) during the backfill below.
create or replace function public.appointments_staff_name_sync()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_name text;
begin
  if new.staff_member_id is not null then
    select s.display_name
      into v_name
      from public.staff_members s
     where s.id = new.staff_member_id
       and s.client_id = new.client_id;

    if v_name is not null
       and lower(btrim(coalesce(new.staff_name, ''))) <> lower(btrim(v_name)) then
      new.staff_name := v_name;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists appointments_staff_name_sync on public.appointments;
create trigger appointments_staff_name_sync
before insert or update of staff_member_id on public.appointments
for each row execute function public.appointments_staff_name_sync();

-- (e) Rename propagation: staff_name is the join key of print profiles, calendar columns, conflict checks and
-- summaries, so a rename rewrites appointments.staff_name and the matching doctor_print_profiles.doctor_name.
-- The profile update is dynamic and guarded: it only runs when that table exists, and it is skipped when a profile
-- already carries the new name (unique (client_id, doctor_name)).
create or replace function public.staff_members_rename_propagate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.appointments a
     set staff_name = new.display_name
   where a.client_id = new.client_id
     and a.staff_member_id = new.id
     and a.staff_name is distinct from new.display_name;

  if to_regclass('public.doctor_print_profiles') is not null then
    execute
      'update public.doctor_print_profiles p
          set doctor_name = $2, updated_at = now()
        where p.client_id = $1
          and lower(btrim(p.doctor_name)) = lower(btrim($3))
          and not exists (
            select 1 from public.doctor_print_profiles x
             where x.client_id = $1 and x.doctor_name = $2 and x.id <> p.id
          )'
      using new.client_id, new.display_name, old.display_name;
  end if;

  return null;
end
$$;

drop trigger if exists staff_members_rename_propagate on public.staff_members;
create trigger staff_members_rename_propagate
after update of display_name on public.staff_members
for each row
when (old.display_name is distinct from new.display_name)
execute function public.staff_members_rename_propagate();

-- Trigger functions never need EXECUTE for the invoking role; keep them off the API surface.
revoke all on function public.appointments_staff_name_sync() from public, anon, authenticated;
revoke all on function public.staff_members_rename_propagate() from public, anon, authenticated;

-- (f) Idempotent backfill. Sources are ONLY appointments.staff_name and doctor_print_profiles.doctor_name.
-- One staff member per (client_id, lower(btrim(name))), most frequent casing wins, is_bookable = true.
insert into public.staff_members (client_id, display_name, is_bookable)
select p.client_id, btrim(left(p.nm, 200)), true
  from (
    select distinct on (n.client_id, n.k) n.client_id, n.k, n.nm
      from (
        select a.client_id,
               lower(btrim(a.staff_name)) as k,
               btrim(a.staff_name) as nm,
               count(*) as cnt
          from public.appointments a
         where a.client_id is not null
           and a.staff_name is not null
           and btrim(a.staff_name) <> ''
         group by a.client_id, lower(btrim(a.staff_name)), btrim(a.staff_name)
      ) n
     order by n.client_id, n.k, n.cnt desc, n.nm
  ) p
on conflict do nothing;

do $$
begin
  if to_regclass('public.doctor_print_profiles') is not null then
    execute
      'insert into public.staff_members (client_id, display_name, is_bookable)
       select distinct on (d.client_id, lower(btrim(d.doctor_name)))
              d.client_id, btrim(left(btrim(d.doctor_name), 200)), true
         from public.doctor_print_profiles d
        where d.client_id is not null
          and btrim(d.doctor_name) <> ''''
        order by d.client_id, lower(btrim(d.doctor_name)), d.doctor_name
       on conflict do nothing';
  end if;
end
$$;

-- Link existing appointments by normalized name (the sync trigger keeps existing casing when names match).
update public.appointments a
   set staff_member_id = s.id
  from public.staff_members s
 where a.staff_member_id is null
   and a.client_id = s.client_id
   and a.staff_name is not null
   and lower(btrim(a.staff_name)) = lower(btrim(s.display_name));

-- ===========================================================================
-- Read-only verification queries (run against live; SELECT only)
-- ===========================================================================
-- (a) Table exposure (expect relrowsecurity true; authenticated has select/insert/update only; anon none).
-- select c.relname, c.relrowsecurity
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname = 'staff_members';
-- select grantee, privilege_type from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'staff_members' order by grantee, privilege_type;
-- select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'staff_members' order by policyname;
--
-- (b) Backfill result (expect unlinked_named = 0: every appointment with a name is linked).
-- select count(*) as staff_members, count(*) filter (where is_bookable) as bookable from public.staff_members;
-- select count(*) filter (where staff_member_id is not null) as linked,
--        count(*) filter (where staff_member_id is null and nullif(btrim(staff_name), '') is not null) as unlinked_named
-- from public.appointments;
--
-- (c) Isolation catalog probe (expect 0 rows: no constraint from our objects points at the internal tables,
--     and no constraint on staff_members references anything but clients and itself).
-- select conrelid::regclass as from_table, conname, confrelid::regclass as to_table
-- from pg_constraint
-- where contype = 'f'
--   and confrelid in ('public.employees'::regclass, 'public.people'::regclass)
--   and (conrelid = 'public.staff_members'::regclass or conname = 'appointments_staff_member_fkey');
-- select conname, confrelid::regclass as to_table from pg_constraint
-- where conrelid = 'public.staff_members'::regclass and contype = 'f';  -- expect only clients
--
-- (d) Triggers on appointments (expect appointments_staff_name_sync only, plus any added by later waves).
-- select tgname from pg_trigger where tgrelid = 'public.appointments'::regclass and not tgisinternal order by tgname;
--
-- (e) Cross-tenant and anon probes (rolled back). Replace the uuids; the auth.uid of tenant A is clients.crm_user_id.
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"sub":"<tenant A crm_user_id>","role":"authenticated"}', true);
-- select count(*) from public.staff_members where client_id = '<tenant B client id>';          -- expect 0
-- insert into public.staff_members (client_id, display_name) values ('<tenant B client id>', 'x'); -- expect 42501 (RLS)
-- update public.appointments set staff_member_id = '<tenant B staff id>' where id = '<tenant A appointment id>'; -- expect 23503 (composite FK)
-- rollback;
-- begin;
-- set local role anon;
-- select count(*) from public.staff_members;                                                     -- expect permission denied
-- rollback;
-- Rename propagation probe (rolled back; as postgres):
-- begin;
-- update public.staff_members set display_name = display_name || ' (probe)' where id = '<staff id>';
-- select staff_name from public.appointments where staff_member_id = '<staff id>' limit 3;      -- expect the new name
-- rollback;

-- ===========================================================================
-- Rollback (commented; run by hand only if needed; loses staff_members data written since apply)
-- ===========================================================================
-- drop trigger if exists staff_members_rename_propagate on public.staff_members;
-- drop trigger if exists appointments_staff_name_sync on public.appointments;
-- drop function if exists public.staff_members_rename_propagate();
-- drop function if exists public.appointments_staff_name_sync();
-- alter table public.appointments drop constraint if exists appointments_staff_member_fkey;
-- drop index if exists public.appointments_client_staff_member_date_idx;
-- alter table public.appointments drop column if exists staff_member_id;
-- drop table if exists public.staff_members;
