-- Scheduling Wave 3 (quick-261114-22k, plan C1, D-05, R-10): package ledger RPCs and the appointments status trigger.
-- Idempotent (create or replace, drop trigger if exists): safe to re-apply whenever this file changes.
-- STATUS: authored but NOT yet applied to live. Run by hand in the Supabase SQL Editor with these exact contents
-- (never the CLI push: the live migration table does not list repo files).
-- APPLY ORDER: after 20261120_packages_schema.sql (and the Wave 1 client_settings migration), before deploying code.
--
-- Security model (R-10, user decision 2026-11-20):
--   * Every RPC is SECURITY DEFINER with search_path = '' and schema-qualified object names (pg_catalog builtins
--     resolve implicitly), so a caller cannot shadow any object through search_path.
--   * The first statement is the tenant gate public.package_assert_tenant(p_client_id): the caller must be signed in
--     (auth.uid() not null) and must own p_client_id through the existing own-client helper
--     public.crm_can_access_client (clients.crm_user_id = auth.uid()); otherwise SQLSTATE 42501. The parameter alone
--     is never trusted, and every lookup below also carries client_id = p_client_id.
--   * Execute is revoked from public and anon, then granted to authenticated. Internal helpers and the trigger
--     function are revoked from authenticated too, so no API role can call them directly.
--   * The ledger tables have no browser write grant, so these functions are the only write path.
--
-- Signature rule (5.5): sell_package already has its FINAL parameter list (plan, prices, installment schedule,
-- initial payment). Task 7 (20261120_packages_payment_rpcs.sql) replaces only its body. Never add an overload;
-- new parameters may only be appended with defaults.
--
-- Error contract (mapped in src/lib/package-queries.ts): 42501 not allowed, P0002 not found, 22023 invalid input,
-- 23505 already linked, 23514 capacity exhausted or blocked by a recorded payment.
--
-- Appointments trigger (R-9): appointments_package_session_sync runs AFTER UPDATE OF status, deleted_at. It does
-- nothing for appointments without a live package session. It never swallows errors: if the ledger write fails,
-- the appointment status change rolls back with it, so credit and appointment never disagree.

-- ===========================================================================
-- (a) Internal helpers (not callable by API roles)
-- ===========================================================================

-- Tenant gate: signed in, and the own-client helper confirms the caller owns p_client_id.
create or replace function public.package_assert_tenant(p_client_id uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or p_client_id is null or not public.crm_can_access_client(p_client_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end
$$;

-- Serializes every credit change of one package (attach, detach, resolve, trigger, Task 7 payments).
create or replace function public.package_lock(p_package_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('customer_packages:' || p_package_id::text, 0));
$$;

-- Sets active/completed from consumed credit (completed + forfeited). Cancelled packages never change here.
create or replace function public.package_sync_status(p_client_id uuid, p_package_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer;
  v_status text;
  v_consumed integer;
  v_next text;
begin
  select p.sessions_total, p.status
    into v_total, v_status
    from public.customer_packages p
   where p.id = p_package_id
     and p.client_id = p_client_id
   for update;
  if not found then
    raise exception 'Package not found' using errcode = 'P0002';
  end if;

  if v_status = 'cancelled' then
    return v_status;
  end if;

  select count(*)
    into v_consumed
    from public.package_sessions s
   where s.client_id = p_client_id
     and s.package_id = p_package_id
     and s.status in ('completed', 'forfeited');

  v_next := case when v_consumed >= v_total then 'completed' else 'active' end;
  if v_next <> v_status then
    update public.customer_packages p
       set status = v_next,
           completed_at = case when v_next = 'completed' then now() else null end
     where p.id = p_package_id
       and p.client_id = p_client_id;
  end if;

  return v_next;
end
$$;

-- ===========================================================================
-- (b) sell_package: FINAL signature. C1 body supports the upfront plan only; Task 7 replaces the body.
-- ===========================================================================
create or replace function public.sell_package(
  p_client_id uuid,
  p_customer_id uuid,
  p_name text,
  p_sessions_total integer,
  p_payment_plan text,
  p_price_total numeric default null,
  p_price_per_session numeric default null,
  p_valid_until date default null,
  p_template_id uuid default null,
  p_installments jsonb default null,
  p_initial_payment jsonb default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_note text;
  v_package_id uuid;
begin
  perform public.package_assert_tenant(p_client_id);

  if p_customer_id is null then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  perform 1
    from public.customers cu
   where cu.id = p_customer_id
     and cu.client_id = p_client_id;
  if not found then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  if p_template_id is not null then
    perform 1
      from public.package_templates t
     where t.id = p_template_id
       and t.client_id = p_client_id
       and t.is_active;
    if not found then
      raise exception 'Template not found' using errcode = 'P0002';
    end if;
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if length(v_name) not between 1 and 120 then
    raise exception 'Invalid name' using errcode = '22023';
  end if;

  if p_sessions_total is null or p_sessions_total not between 1 and 500 then
    raise exception 'Invalid session count' using errcode = '22023';
  end if;

  if p_payment_plan is null or p_payment_plan not in ('upfront', 'installments', 'per_visit') then
    raise exception 'Invalid payment plan' using errcode = '22023';
  end if;

  -- C1 body: upfront only. Installments, per-visit and the initial payment arrive with Task 7 (same signature).
  if p_payment_plan <> 'upfront' then
    raise exception 'Payment plan not supported yet' using errcode = '22023';
  end if;
  if p_installments is not null and jsonb_typeof(p_installments) <> 'null' then
    raise exception 'Installments not supported yet' using errcode = '22023';
  end if;
  if p_initial_payment is not null and jsonb_typeof(p_initial_payment) <> 'null' then
    raise exception 'Initial payment not supported yet' using errcode = '22023';
  end if;

  if p_price_total is null
     or p_price_total < 0
     or p_price_total > 99999999.99
     or p_price_total <> round(p_price_total, 2)
     or p_price_per_session is not null then
    raise exception 'Invalid price' using errcode = '22023';
  end if;

  -- One day of slack for clinic time zones ahead of the database clock; at most about ten years ahead.
  if p_valid_until is not null and (p_valid_until < current_date - 1 or p_valid_until > current_date + 3660) then
    raise exception 'Invalid validity' using errcode = '22023';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Invalid note' using errcode = '22023';
  end if;

  insert into public.customer_packages (
    client_id, customer_id, template_id, name_snapshot, sessions_total, payment_plan,
    price_total, price_per_session, valid_until, status, note, created_by
  )
  values (
    p_client_id, p_customer_id, p_template_id, v_name, p_sessions_total, p_payment_plan,
    p_price_total, null, p_valid_until, 'active', v_note, auth.uid()
  )
  returning id into v_package_id;

  return jsonb_build_object('package_id', v_package_id, 'status', 'active');
end
$$;

-- ===========================================================================
-- (c) attach_package_session: link one appointment to a package (one live link per appointment)
-- ===========================================================================
create or replace function public.attach_package_session(
  p_client_id uuid,
  p_package_id uuid,
  p_appointment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg_status text;
  v_total integer;
  v_valid_until date;
  v_appt_date date;
  v_appt_status text;
  v_used integer;
  v_status text;
  v_session_id uuid;
begin
  perform public.package_assert_tenant(p_client_id);

  if p_package_id is null then
    raise exception 'Package not found' using errcode = 'P0002';
  end if;
  if p_appointment_id is null then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;

  perform public.package_lock(p_package_id);

  select p.status, p.sessions_total, p.valid_until
    into v_pkg_status, v_total, v_valid_until
    from public.customer_packages p
   where p.id = p_package_id
     and p.client_id = p_client_id;
  if not found then
    raise exception 'Package not found' using errcode = 'P0002';
  end if;
  if v_pkg_status <> 'active' then
    raise exception 'Package is not active' using errcode = '22023';
  end if;

  -- Row lock serializes two attaches of the same appointment to different packages.
  select a.date::date, a.status::text
    into v_appt_date, v_appt_status
    from public.appointments a
   where a.id = p_appointment_id
     and a.client_id = p_client_id
     and a.deleted_at is null
   for update;
  if not found then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;
  if v_appt_status = 'cancelled' then
    raise exception 'Cannot link a cancelled appointment' using errcode = '22023';
  end if;
  if v_valid_until is not null and (v_appt_date is null or v_appt_date > v_valid_until) then
    raise exception 'Package expired for this appointment date' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.package_sessions s
     where s.appointment_id = p_appointment_id
       and s.status <> 'voided'
  ) then
    raise exception 'Appointment already linked to a package' using errcode = '23505';
  end if;

  -- Consumed (completed, forfeited) plus held (scheduled, missed_pending) may never exceed the total.
  select count(*)
    into v_used
    from public.package_sessions s
   where s.client_id = p_client_id
     and s.package_id = p_package_id
     and s.status in ('scheduled', 'completed', 'missed_pending', 'forfeited');
  if v_used >= v_total then
    raise exception 'No sessions left on this package' using errcode = '23514';
  end if;

  -- A visit linked after it was already completed consumes immediately (older appointments linked later).
  v_status := case when v_appt_status = 'completed' then 'completed' else 'scheduled' end;

  insert into public.package_sessions (client_id, package_id, appointment_id, status, completed_at, created_by)
  values (
    p_client_id, p_package_id, p_appointment_id, v_status,
    case when v_status = 'completed' then now() else null end,
    auth.uid()
  )
  returning id into v_session_id;

  if v_status = 'completed' then
    perform public.package_sync_status(p_client_id, p_package_id);
  end if;

  return jsonb_build_object(
    'session_id', v_session_id,
    'status', v_status,
    'remaining', v_total - v_used - 1
  );
end
$$;

-- ===========================================================================
-- (d) detach_package_session: void a scheduled or undecided link (frees the slot, keeps the row as history)
-- ===========================================================================
create or replace function public.detach_package_session(
  p_client_id uuid,
  p_session_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_package_id uuid;
  v_status text;
  v_note text;
begin
  perform public.package_assert_tenant(p_client_id);

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Invalid note' using errcode = '22023';
  end if;

  select s.package_id
    into v_package_id
    from public.package_sessions s
   where s.id = p_session_id
     and s.client_id = p_client_id;
  if p_session_id is null or not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  perform public.package_lock(v_package_id);

  select s.status
    into v_status
    from public.package_sessions s
   where s.id = p_session_id
     and s.client_id = p_client_id
   for update;

  if v_status not in ('scheduled', 'missed_pending') then
    raise exception 'Only scheduled or undecided sessions can be removed' using errcode = '22023';
  end if;

  update public.package_sessions s
     set status = 'voided',
         voided_at = now(),
         note = coalesce(v_note, s.note)
   where s.id = p_session_id
     and s.client_id = p_client_id;

  return jsonb_build_object('session_id', p_session_id, 'status', 'voided');
end
$$;

-- ===========================================================================
-- (e) Appointments status trigger: completed consumes, cancelled opens a decision, un-cancel reverts
-- ===========================================================================
-- Transitions of the live (non-voided) session linked to the updated appointment:
--   appointment -> completed               : scheduled | missed_pending -> completed
--   appointment -> cancelled               : scheduled | completed      -> missed_pending (reason cancelled)
--   cancelled  -> booked | tentative       : missed_pending             -> scheduled (unresolved only)
--   completed  -> booked | tentative       : completed                  -> scheduled (status correction)
--   soft delete (deleted_at set)           : scheduled                  -> voided
-- Resolved decisions (rolled_over, forfeited) and voided rows are never changed here. Leaving completed is blocked
-- (raises 23514) when a package payment already references the session, so money never points at an unconsumed visit.
create or replace function public.appointments_package_session_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_package_id uuid;
  v_status text;
  v_next text;
  v_new text := new.status::text;
  v_old text := old.status::text;
begin
  select s.id, s.package_id
    into v_session_id, v_package_id
    from public.package_sessions s
   where s.appointment_id = new.id
     and s.client_id = new.client_id
     and s.status <> 'voided'
   limit 1;
  if not found then
    return null;
  end if;

  perform public.package_lock(v_package_id);

  select s.status
    into v_status
    from public.package_sessions s
   where s.id = v_session_id
   for update;

  if new.deleted_at is not null and old.deleted_at is null then
    if v_status = 'scheduled' then
      update public.package_sessions s
         set status = 'voided', voided_at = now()
       where s.id = v_session_id;
    end if;
    return null;
  end if;

  if new.deleted_at is not null or v_new is not distinct from v_old then
    return null;
  end if;

  v_next := case
    when v_status in ('rolled_over', 'forfeited', 'voided') then null
    when v_new = 'completed' and v_status in ('scheduled', 'missed_pending') then 'completed'
    when v_new = 'cancelled' and v_status in ('scheduled', 'completed') then 'missed_pending'
    when v_new in ('booked', 'tentative') and v_old = 'cancelled' and v_status = 'missed_pending' then 'scheduled'
    when v_new in ('booked', 'tentative') and v_old = 'completed' and v_status = 'completed' then 'scheduled'
    else null
  end;

  if v_next is null then
    return null;
  end if;

  if v_status = 'completed' and exists (
    select 1 from public.package_payments pp where pp.session_id = v_session_id
  ) then
    raise exception 'This visit has a recorded package payment; its completed status cannot change'
      using errcode = '23514';
  end if;

  update public.package_sessions s
     set status = v_next,
         completed_at = case when v_next = 'completed' then now() else null end,
         missed_at = case when v_next = 'missed_pending' then now() else null end,
         missed_reason = case when v_next = 'missed_pending' then 'cancelled' else null end
   where s.id = v_session_id;

  perform public.package_sync_status(new.client_id, v_package_id);
  return null;
end
$$;

drop trigger if exists appointments_package_session_sync on public.appointments;
create trigger appointments_package_session_sync
after update of status, deleted_at on public.appointments
for each row
when (old.status is distinct from new.status or old.deleted_at is distinct from new.deleted_at)
execute function public.appointments_package_session_sync();

-- ===========================================================================
-- (f) Privileges: live default privileges hand new functions to anon, so revoke explicitly.
-- ===========================================================================
revoke all on function public.package_assert_tenant(uuid) from public, anon, authenticated;
revoke all on function public.package_lock(uuid) from public, anon, authenticated;
revoke all on function public.package_sync_status(uuid, uuid) from public, anon, authenticated;
revoke all on function public.appointments_package_session_sync() from public, anon, authenticated;

revoke all on function public.sell_package(uuid, uuid, text, integer, text, numeric, numeric, date, uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.sell_package(uuid, uuid, text, integer, text, numeric, numeric, date, uuid, jsonb, jsonb, text) to authenticated;

revoke all on function public.attach_package_session(uuid, uuid, uuid) from public, anon;
grant execute on function public.attach_package_session(uuid, uuid, uuid) to authenticated;

revoke all on function public.detach_package_session(uuid, uuid, text) from public, anon;
grant execute on function public.detach_package_session(uuid, uuid, text) to authenticated;

-- ===========================================================================
-- Read-only verification queries (run against live; SELECT only)
-- ===========================================================================
-- (a) Function exposure: prosecdef true on the RPCs and the trigger function, proconfig search_path="",
--     anon_exec false everywhere, authenticated_exec true only on the RPCs.
-- select p.proname, p.prosecdef, p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('sell_package','attach_package_session','detach_package_session','mark_session_missed',
--                      'resolve_missed_session','package_assert_tenant','package_lock','package_sync_status',
--                      'package_settings_for','appointments_package_session_sync')
--  order by p.proname;
--
-- (b) No overloads (expect exactly one row per name).
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace
--    and proname like '%package%' group by proname order by proname;
--
-- (c) Trigger inventory on appointments (expect appointments_staff_name_sync and appointments_package_session_sync).
-- select tgname from pg_trigger where tgrelid = 'public.appointments'::regclass and not tgisinternal order by tgname;
--
-- (d) Behaviour, cross-tenant and anon probes: supabase/tests/20261120_packages_probes.sql (one rolled-back
--     transaction; ends with ALL PASS).

-- ===========================================================================
-- Rollback (commented; run by hand only if needed). Drops behaviour only; tables stay.
-- ===========================================================================
-- drop trigger if exists appointments_package_session_sync on public.appointments;
-- drop function if exists public.appointments_package_session_sync();
-- drop function if exists public.sell_package(uuid, uuid, text, integer, text, numeric, numeric, date, uuid, jsonb, jsonb, text);
-- drop function if exists public.attach_package_session(uuid, uuid, uuid);
-- drop function if exists public.detach_package_session(uuid, uuid, text);
-- drop function if exists public.package_sync_status(uuid, uuid);
-- drop function if exists public.package_lock(uuid);
-- drop function if exists public.package_assert_tenant(uuid);
