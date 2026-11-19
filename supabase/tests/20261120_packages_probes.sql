-- =====================================================================================================================
-- Packages probes (quick-261114-22k, plan C1: Tasks 5 and 6). SELF-CHECKING, FULLY ROLLED BACK.
-- =====================================================================================================================
-- What it proves (each failure raises 'FAIL: ...' and aborts; success ends with one row: ALL PASS):
--   * sell -> attach -> complete consumes exactly 1 credit; package completes when credit is used up
--   * capacity exhausted rejects (23514); double attach rejects (23505); attach after valid_until rejects (22023)
--   * cross-tenant sell / attach / detach / mark / resolve with another tenant's p_client_id rejects (42501);
--     own p_client_id with another tenant's customer / appointment / package / session rejects (P0002)
--   * direct INSERT / UPDATE / DELETE on every ledger table as authenticated is denied (42501); templates are
--     writable only for the own client
--   * anon cannot execute any package RPC and cannot read any package table (42501)
--   * cancel -> missed_pending -> un-cancel reverts; a resolved decision is never reverted by un-cancel
--   * rollover frees the slot; with rollover_extends_validity_days N > 0 valid_until moves by N and N is snapshotted;
--     with N = 0 nothing moves; later setting changes never rewrite earlier rows
--   * forfeit consumes, sets resolution_overrode_default against the tenant default and snapshots charge_on_forfeit
--   * completed -> booked reverts consumption; soft delete voids a scheduled link; mark missed -> missed_pending
--   * the appointments trigger raises (and the appointment change rolls back) when a payment pins a completed visit
--   * consumed + held never exceeds sessions_total (remaining never below zero)
--   * catalog: RPCs are SECURITY DEFINER with search_path '', anon has no EXECUTE, helpers are not callable by
--     authenticated, ledger tables have no browser write grant, no overloads, trigger present
--
-- HOW TO RUN (Supabase Dashboard -> SQL Editor, as the default postgres role; run the WHOLE file at once):
--   A. Migrations already applied: run this file unchanged.
--   B. Migrations NOT applied yet (dry run against live): paste, at the INSERTION POINT below and in this order, the
--      full bodies of 20261119_client_settings.sql (only if Wave 1 is not live), 20261120_packages_schema.sql and
--      20261120_packages_rpcs.sql. The final ROLLBACK undoes the DDL too, so nothing is left behind.
--      Note: the DDL takes an exclusive lock on public.appointments until the rollback (a few seconds), so pick a
--      quiet moment.
--   Data: it borrows the first two clients (by id) that have different crm_user_id values, and inserts one throwaway
--   customer per tenant plus appointments dated 2035 named "ZZ Probe" inside the transaction. Everything is rolled
--   back. If customers or appointments gained a new NOT NULL column without a default, the SETUP block fails with
--   that column's name: add a value there and re-run.
-- =====================================================================================================================

begin;

-- >>> INSERTION POINT (option B): paste migration bodies here. <<<

-- ---------------------------------------------------------------------------------------------------------------------
-- (0) Helpers in pg_temp (removed by the rollback). Granted to authenticated and anon so impersonated blocks use them.
-- ---------------------------------------------------------------------------------------------------------------------
create function pg_temp.g(p_key text) returns uuid
language sql stable as $$ select current_setting('probe.' || p_key)::uuid $$;

create function pg_temp.check(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FAIL: %', p_label;
  end if;
end
$$;

create function pg_temp.expect_sqlstate(p_sql text, p_state text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then
      return;
    end if;
    raise exception 'FAIL: % expected SQLSTATE % but got % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % expected SQLSTATE % but the statement succeeded', p_label, p_state;
end
$$;

-- Supabase auth.uid() reads request.jwt.claim.sub or request.jwt.claims ->> 'sub'; set both.
create function pg_temp.act_as(p_user text, p_role text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_user, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
end
$$;

-- Session status of the live (non-voided) link of an appointment.
create function pg_temp.session_status(p_appointment uuid) returns text
language sql stable as $$
  select s.status from public.package_sessions s where s.appointment_id = p_appointment and s.status <> 'voided' limit 1
$$;

-- consumed (completed + forfeited) and held (scheduled + missed_pending) of one package.
create function pg_temp.consumed(p_package uuid) returns integer
language sql stable as $$
  select count(*)::integer from public.package_sessions s where s.package_id = p_package and s.status in ('completed', 'forfeited')
$$;
create function pg_temp.held(p_package uuid) returns integer
language sql stable as $$
  select count(*)::integer from public.package_sessions s where s.package_id = p_package and s.status in ('scheduled', 'missed_pending')
$$;

grant execute on function pg_temp.g(text), pg_temp.check(boolean, text), pg_temp.expect_sqlstate(text, text, text),
  pg_temp.act_as(text, text), pg_temp.session_status(uuid), pg_temp.consumed(uuid), pg_temp.held(uuid)
  to authenticated, anon;

-- ---------------------------------------------------------------------------------------------------------------------
-- (1) SETUP as postgres: two tenants, one throwaway customer each, appointments in 2035.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_a_client uuid;
  v_a_user uuid;
  v_b_client uuid;
  v_b_user uuid;
  v_id uuid;
  i integer;
begin
  select c.id, c.crm_user_id into v_a_client, v_a_user
    from public.clients c where c.crm_user_id is not null order by c.id limit 1;
  select c.id, c.crm_user_id into v_b_client, v_b_user
    from public.clients c where c.crm_user_id is not null and c.crm_user_id <> v_a_user order by c.id limit 1;
  if v_a_client is null or v_b_client is null then
    raise exception 'SETUP: need two clients owned by different crm_user_id values';
  end if;

  perform set_config('probe.a_client', v_a_client::text, true);
  perform set_config('probe.a_user', v_a_user::text, true);
  perform set_config('probe.b_client', v_b_client::text, true);
  perform set_config('probe.b_user', v_b_user::text, true);

  insert into public.customers (client_id, name, phone) values (v_a_client, 'ZZ Probe Customer A', '9000000001')
  returning id into v_id;
  perform set_config('probe.cust_a', v_id::text, true);
  insert into public.customers (client_id, name, phone) values (v_b_client, 'ZZ Probe Customer B', '9000000002')
  returning id into v_id;
  perform set_config('probe.cust_b', v_id::text, true);

  -- appt_N is dated 2035-01-01 + N (appt_1 = 2035-01-02 ... appt_12 = 2035-01-13).
  for i in 1..12 loop
    insert into public.appointments (client_id, name, phone, service, staff_name, date, start_time, status)
    values (v_a_client, 'ZZ Probe Customer A', '9000000001', 'ZZ Probe', 'ZZ Probe Staff', date '2035-01-01' + i, '10:00', 'booked')
    returning id into v_id;
    perform set_config('probe.appt_' || i, v_id::text, true);
  end loop;

  insert into public.appointments (client_id, name, phone, service, staff_name, date, start_time, status)
  values (v_b_client, 'ZZ Probe Customer B', '9000000002', 'ZZ Probe', 'ZZ Probe Staff', date '2035-01-02', '10:00', 'booked')
  returning id into v_id;
  perform set_config('probe.appt_b', v_id::text, true);
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (2) CATALOG as postgres: definer + search_path '', privileges, no overloads, trigger present.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_sig text;
  v_proc regprocedure;
  v_table text;
  v_priv text;
begin
  foreach v_sig in array array[
    'public.sell_package(uuid,uuid,text,integer,text,numeric,numeric,date,uuid,jsonb,jsonb,text)',
    'public.attach_package_session(uuid,uuid,uuid)',
    'public.detach_package_session(uuid,uuid,text)',
    'public.mark_session_missed(uuid,uuid,text)',
    'public.resolve_missed_session(uuid,uuid,text,text)'
  ] loop
    v_proc := v_sig::regprocedure;
    perform pg_temp.check(not has_function_privilege('anon', v_proc, 'execute'), 'anon must not execute ' || v_sig);
    perform pg_temp.check(not has_function_privilege('public', v_proc, 'execute'), 'public must not execute ' || v_sig);
    perform pg_temp.check(has_function_privilege('authenticated', v_proc, 'execute'), 'authenticated must execute ' || v_sig);
    perform pg_temp.check(
      (select p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=""%' from pg_proc p where p.oid = v_proc),
      v_sig || ' must be SECURITY DEFINER with search_path ''''');
  end loop;

  foreach v_sig in array array[
    'public.package_assert_tenant(uuid)',
    'public.package_lock(uuid)',
    'public.package_sync_status(uuid,uuid)',
    'public.package_settings_for(uuid)',
    'public.appointments_package_session_sync()'
  ] loop
    v_proc := v_sig::regprocedure;
    perform pg_temp.check(not has_function_privilege('authenticated', v_proc, 'execute'), 'authenticated must not execute ' || v_sig);
    perform pg_temp.check(not has_function_privilege('anon', v_proc, 'execute'), 'anon must not execute ' || v_sig);
  end loop;

  perform pg_temp.check(
    (select p.prosecdef from pg_proc p where p.oid = 'public.appointments_package_session_sync()'::regprocedure),
    'trigger function must be SECURITY DEFINER');

  perform pg_temp.check(
    not exists (
      select 1 from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('sell_package', 'attach_package_session', 'detach_package_session', 'mark_session_missed',
                           'resolve_missed_session')
       group by p.proname having count(*) > 1),
    'no RPC overloads');

  perform pg_temp.check(
    exists (select 1 from pg_trigger t where t.tgrelid = 'public.appointments'::regclass
             and t.tgname = 'appointments_package_session_sync' and not t.tgisinternal),
    'appointments_package_session_sync trigger exists');

  foreach v_table in array array['customer_packages', 'package_installments', 'package_sessions', 'package_payments'] loop
    perform pg_temp.check(has_table_privilege('authenticated', 'public.' || v_table, 'select'), 'authenticated reads ' || v_table);
    foreach v_priv in array array['insert', 'update', 'delete', 'truncate'] loop
      perform pg_temp.check(not has_table_privilege('authenticated', 'public.' || v_table, v_priv),
        'authenticated must not ' || v_priv || ' ' || v_table);
    end loop;
  end loop;

  foreach v_table in array array['package_templates', 'customer_packages', 'package_installments', 'package_sessions', 'package_payments'] loop
    perform pg_temp.check(not has_table_privilege('anon', 'public.' || v_table, 'select'), 'anon must not read ' || v_table);
    perform pg_temp.check(
      (select c.relrowsecurity from pg_class c where c.oid = ('public.' || v_table)::regclass), 'RLS enabled on ' || v_table);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (3) TENANT B as authenticated: sells, attaches and cancels its own visit (data for the cross-tenant checks).
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(current_setting('probe.b_user'), 'authenticated');

do $$
declare
  v jsonb;
  v_rows integer;
begin
  v := public.sell_package(pg_temp.g('b_client'), pg_temp.g('cust_b'), 'ZZ Probe PB', 2, 'upfront', 1000, null, date '2035-12-31');
  perform set_config('probe.pb', v ->> 'package_id', true);
  v := public.attach_package_session(pg_temp.g('b_client'), pg_temp.g('pb'), pg_temp.g('appt_b'));
  perform set_config('probe.sb', v ->> 'session_id', true);
  update public.appointments set status = 'cancelled' where id = pg_temp.g('appt_b');
  get diagnostics v_rows = row_count;
  perform pg_temp.check(v_rows = 1, 'SETUP: tenant B could not update its own appointment (check appointments RLS)');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_b')) = 'missed_pending', 'B cancel -> missed_pending');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (4) TENANT A as authenticated: tracer, capacity, duplicates, expiry, completion, cross-tenant, direct DML.
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
set local role authenticated;
select pg_temp.act_as(current_setting('probe.a_user'), 'authenticated');

do $$
declare
  v jsonb;
  v_rows integer;
  a uuid := pg_temp.g('a_client');
  b uuid := pg_temp.g('b_client');
  v_table text;
begin
  perform pg_temp.check(public.crm_can_access_client(a), 'SETUP: impersonated user A does not own client A');
  perform pg_temp.check(not public.crm_can_access_client(b), 'SETUP: user A must not own client B');

  -- Tracer: sell 3 -> attach -> complete consumes exactly one.
  v := public.sell_package(a, pg_temp.g('cust_a'), 'ZZ Probe P1', 3, 'upfront', 3000, null, date '2035-12-31');
  perform set_config('probe.p1', v ->> 'package_id', true);
  perform pg_temp.check(v ->> 'status' = 'active', 'sell returns active');
  v := public.attach_package_session(a, pg_temp.g('p1'), pg_temp.g('appt_1'));
  perform pg_temp.check(v ->> 'status' = 'scheduled' and (v ->> 'remaining')::int = 2, 'attach -> scheduled, remaining 2');
  perform pg_temp.check(pg_temp.consumed(pg_temp.g('p1')) = 0 and pg_temp.held(pg_temp.g('p1')) = 1, 'scheduled holds, does not consume');
  update public.appointments set status = 'completed' where id = pg_temp.g('appt_1');
  get diagnostics v_rows = row_count;
  perform pg_temp.check(v_rows = 1, 'SETUP: tenant A could not update its own appointment (check appointments RLS)');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_1')) = 'completed', 'complete -> session completed');
  perform pg_temp.check(pg_temp.consumed(pg_temp.g('p1')) = 1 and pg_temp.held(pg_temp.g('p1')) = 0, 'complete consumes exactly 1');

  -- Capacity: a 1-session package takes one link, the second is rejected with 23514.
  v := public.sell_package(a, pg_temp.g('cust_a'), 'ZZ Probe P2', 1, 'upfront', 500, null, null);
  perform set_config('probe.p2', v ->> 'package_id', true);
  perform public.attach_package_session(a, pg_temp.g('p2'), pg_temp.g('appt_2'));
  perform pg_temp.expect_sqlstate(
    format('select public.attach_package_session(%L, %L, %L)', a, pg_temp.g('p2'), pg_temp.g('appt_3')),
    '23514', 'capacity exhausted');

  -- Double attach: appt_2 is already linked (to P2) -> 23505 on any package.
  perform pg_temp.expect_sqlstate(
    format('select public.attach_package_session(%L, %L, %L)', a, pg_temp.g('p1'), pg_temp.g('appt_2')),
    '23505', 'double attach');

  -- Completing the only session completes the package; a completed package takes no new link (22023).
  update public.appointments set status = 'completed' where id = pg_temp.g('appt_2');
  perform pg_temp.check(
    (select p.status from public.customer_packages p where p.id = pg_temp.g('p2')) = 'completed', 'package completes when used up');
  perform pg_temp.expect_sqlstate(
    format('select public.attach_package_session(%L, %L, %L)', a, pg_temp.g('p2'), pg_temp.g('appt_12')),
    '22023', 'attach to a completed package');

  -- Attach after valid_until: P4 valid until 2035-01-03, appt_10 is 2035-01-11 -> 22023.
  v := public.sell_package(a, pg_temp.g('cust_a'), 'ZZ Probe P4', 5, 'upfront', 100, null, date '2035-01-03');
  perform set_config('probe.p4', v ->> 'package_id', true);
  perform pg_temp.expect_sqlstate(
    format('select public.attach_package_session(%L, %L, %L)', a, pg_temp.g('p4'), pg_temp.g('appt_10')),
    '22023', 'attach after valid_until');

  -- C1 sell body: upfront only; installments / initial payment / other plans are rejected (22023).
  perform pg_temp.expect_sqlstate(
    format('select public.sell_package(%L, %L, %L, 3, %L, 300)', a, pg_temp.g('cust_a'), 'ZZ x', 'installments'),
    '22023', 'installments plan rejected in C1');
  perform pg_temp.expect_sqlstate(
    format('select public.sell_package(%L, %L, %L, 3, %L, 300, null, null, null, %L::jsonb)', a, pg_temp.g('cust_a'), 'ZZ x', 'upfront', '[{"seq":1}]'),
    '22023', 'installment schedule rejected in C1');
  perform pg_temp.expect_sqlstate(
    format('select public.sell_package(%L, %L, %L, 0, %L, 300)', a, pg_temp.g('cust_a'), 'ZZ x', 'upfront'),
    '22023', 'zero sessions rejected');

  -- Cross-tenant with B's p_client_id: 42501 on every RPC.
  perform pg_temp.expect_sqlstate(
    format('select public.sell_package(%L, %L, %L, 1, %L, 10)', b, pg_temp.g('cust_b'), 'ZZ x', 'upfront'), '42501', 'cross-tenant sell');
  perform pg_temp.expect_sqlstate(
    format('select public.attach_package_session(%L, %L, %L)', b, pg_temp.g('pb'), pg_temp.g('appt_b')), '42501', 'cross-tenant attach');
  perform pg_temp.expect_sqlstate(
    format('select public.detach_package_session(%L, %L)', b, pg_temp.g('sb')), '42501', 'cross-tenant detach');
  perform pg_temp.expect_sqlstate(
    format('select public.mark_session_missed(%L, %L)', b, pg_temp.g('sb')), '42501', 'cross-tenant mark missed');
  perform pg_temp.expect_sqlstate(
    format('select public.resolve_missed_session(%L, %L, %L)', b, pg_temp.g('sb'), 'forfeit'), '42501', 'cross-tenant resolve');

  -- Own p_client_id but B's objects: not found (P0002), nothing leaks or changes.
  perform pg_temp.expect_sqlstate(
    format('select public.sell_package(%L, %L, %L, 1, %L, 10)', a, pg_temp.g('cust_b'), 'ZZ x', 'upfront'), 'P0002', 'B customer via A');
  perform pg_temp.expect_sqlstate(
    format('select public.attach_package_session(%L, %L, %L)', a, pg_temp.g('p1'), pg_temp.g('appt_b')), 'P0002', 'B appointment via A');
  perform pg_temp.expect_sqlstate(
    format('select public.attach_package_session(%L, %L, %L)', a, pg_temp.g('pb'), pg_temp.g('appt_5')), 'P0002', 'B package via A');
  perform pg_temp.expect_sqlstate(
    format('select public.resolve_missed_session(%L, %L, %L)', a, pg_temp.g('sb'), 'forfeit'), 'P0002', 'B session via A');
  perform pg_temp.check((select count(*) from public.customer_packages p where p.client_id = b) = 0, 'A cannot read B packages');
  perform pg_temp.check((select count(*) from public.package_sessions s where s.client_id = b) = 0, 'A cannot read B sessions');

  -- Direct writes on every ledger table are denied (no grant), whatever the row.
  foreach v_table in array array['customer_packages', 'package_installments', 'package_sessions', 'package_payments'] loop
    perform pg_temp.expect_sqlstate(format('insert into public.%I (client_id) values (%L)', v_table, a), '42501', 'direct insert ' || v_table);
    perform pg_temp.expect_sqlstate(format('update public.%I set client_id = client_id', v_table), '42501', 'direct update ' || v_table);
    perform pg_temp.expect_sqlstate(format('delete from public.%I', v_table), '42501', 'direct delete ' || v_table);
  end loop;

  -- Templates: own-client CRUD works; another tenant's client_id is rejected by RLS (42501).
  insert into public.package_templates (client_id, name, session_count, payment_plan, price_total)
  values (a, 'ZZ Probe Template', 4, 'upfront', 400);
  perform pg_temp.expect_sqlstate(
    format('insert into public.package_templates (client_id, name, session_count, payment_plan, price_total) values (%L, %L, 4, %L, 400)', b, 'ZZ x', 'upfront'),
    '42501', 'template insert for another tenant');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (5) TENANT A: missed-session flow, R-15 and R-16 snapshots, reverts, soft delete, mark missed.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  v jsonb;
  a uuid := pg_temp.g('a_client');
  p3 uuid;
  s4 uuid;
  s5 uuid;
  v_labels jsonb := '{"package":"Package","packages":"Packages","session":"Session","sessions":"Sessions"}';
begin
  v := public.sell_package(a, pg_temp.g('cust_a'), 'ZZ Probe P3', 10, 'upfront', 5000, null, date '2035-06-30');
  p3 := (v ->> 'package_id')::uuid;

  -- Cancel -> missed_pending (holds, never consumes) -> un-cancel reverts to scheduled.
  v := public.attach_package_session(a, p3, pg_temp.g('appt_4'));
  s4 := (v ->> 'session_id')::uuid;
  update public.appointments set status = 'cancelled' where id = pg_temp.g('appt_4');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_4')) = 'missed_pending', 'cancel -> missed_pending');
  perform pg_temp.check(pg_temp.consumed(p3) = 0 and pg_temp.held(p3) = 1, 'missed_pending holds but does not consume');
  perform pg_temp.check(
    (select s.missed_reason from public.package_sessions s where s.id = s4) = 'cancelled', 'missed_reason cancelled');
  update public.appointments set status = 'booked' where id = pg_temp.g('appt_4');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_4')) = 'scheduled', 'un-cancel reverts to scheduled');

  -- R-15 on: default rollover, extension 7 days, forfeits not charged (saved through own-client RLS).
  insert into public.client_settings (client_id, namespace, settings)
  values (a, 'packages', jsonb_build_object('missed_default', 'rollover', 'rollover_extends_validity_days', 7,
                                            'forfeit_charges_per_visit', false, 'labels', v_labels))
  on conflict (client_id, namespace) do update set settings = excluded.settings;

  update public.appointments set status = 'cancelled' where id = pg_temp.g('appt_4');
  v := public.resolve_missed_session(a, s4, 'rollover', 'probe');
  perform pg_temp.check(v ->> 'status' = 'rolled_over', 'resolve rollover -> rolled_over');
  perform pg_temp.check((v ->> 'overrode_default')::boolean = false, 'rollover with default rollover is not an override');
  perform pg_temp.check((v ->> 'validity_extended_days')::int = 7, 'rollover reports 7 extension days');
  perform pg_temp.check(
    (select p.valid_until from public.customer_packages p where p.id = p3) = date '2035-07-07', 'valid_until moved by 7 days');
  perform pg_temp.check(
    (select s.validity_extended_days from public.package_sessions s where s.id = s4) = 7, 'extension snapshotted on the session');
  perform pg_temp.check(pg_temp.consumed(p3) = 0 and pg_temp.held(p3) = 0, 'rollover frees the slot without consuming');
  perform pg_temp.expect_sqlstate(
    format('select public.resolve_missed_session(%L, %L, %L)', a, s4, 'forfeit'), '22023', 'second decision rejected');

  -- A resolved decision is never reverted by un-cancelling.
  update public.appointments set status = 'booked' where id = pg_temp.g('appt_4');
  perform pg_temp.check(
    (select s.status from public.package_sessions s where s.id = s4) = 'rolled_over', 'resolved decision not reverted');

  -- R-16: forfeit against default rollover is an override; charge_on_forfeit snapshots false.
  v := public.attach_package_session(a, p3, pg_temp.g('appt_5'));
  s5 := (v ->> 'session_id')::uuid;
  update public.appointments set status = 'cancelled' where id = pg_temp.g('appt_5');
  v := public.resolve_missed_session(a, s5, 'forfeit');
  perform pg_temp.check(v ->> 'status' = 'forfeited', 'resolve forfeit -> forfeited');
  perform pg_temp.check((v ->> 'overrode_default')::boolean = true, 'forfeit against default rollover is an override');
  perform pg_temp.check(
    (select s.charge_on_forfeit from public.package_sessions s where s.id = s5) = false, 'charge_on_forfeit snapshot false');
  perform pg_temp.check(pg_temp.consumed(p3) = 1, 'forfeit consumes');
  perform pg_temp.check(
    (select p.valid_until from public.customer_packages p where p.id = p3) = date '2035-07-07', 'forfeit never extends');

  -- Settings change: default forfeit, no extension, forfeits charged. Earlier snapshots must not change.
  update public.client_settings
     set settings = jsonb_build_object('missed_default', 'forfeit', 'rollover_extends_validity_days', 0,
                                       'forfeit_charges_per_visit', true, 'labels', v_labels)
   where client_id = a and namespace = 'packages';

  v := public.attach_package_session(a, p3, pg_temp.g('appt_6'));
  update public.appointments set status = 'cancelled' where id = pg_temp.g('appt_6');
  v := public.resolve_missed_session(a, (v ->> 'session_id')::uuid, 'rollover');
  perform pg_temp.check((v ->> 'overrode_default')::boolean = true, 'rollover against default forfeit is an override');
  perform pg_temp.check((v ->> 'validity_extended_days')::int = 0, 'N = 0 extends nothing');
  perform pg_temp.check(
    (select p.valid_until from public.customer_packages p where p.id = p3) = date '2035-07-07', 'N = 0 keeps valid_until');

  v := public.attach_package_session(a, p3, pg_temp.g('appt_7'));
  update public.appointments set status = 'cancelled' where id = pg_temp.g('appt_7');
  v := public.resolve_missed_session(a, (v ->> 'session_id')::uuid, 'forfeit');
  perform pg_temp.check((v ->> 'overrode_default')::boolean = false, 'forfeit with default forfeit is not an override');
  perform pg_temp.check((v ->> 'charge_on_forfeit')::boolean = true, 'charge_on_forfeit snapshot true after the change');
  perform pg_temp.check(
    (select s.charge_on_forfeit from public.package_sessions s where s.id = s5) = false, 'earlier forfeit snapshot unchanged');
  perform pg_temp.check(
    (select s.validity_extended_days from public.package_sessions s where s.id = s4) = 7, 'earlier extension snapshot unchanged');
  perform pg_temp.check(
    not exists (
      select 1 from public.package_sessions s
       where s.client_id = a and s.status not in ('rolled_over', 'forfeited') and s.resolution_overrode_default),
    'unresolved rows never carry an override flag');
end
$$;

do $$
declare
  v jsonb;
  a uuid := pg_temp.g('a_client');
  p1 uuid := pg_temp.g('p1');
  s11 uuid;
begin
  -- completed -> booked reverts consumption (status correction).
  perform public.attach_package_session(a, p1, pg_temp.g('appt_8'));
  update public.appointments set status = 'completed' where id = pg_temp.g('appt_8');
  perform pg_temp.check(pg_temp.consumed(p1) = 2, 'second completion consumes');
  update public.appointments set status = 'booked' where id = pg_temp.g('appt_8');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_8')) = 'scheduled', 'completed -> booked reverts to scheduled');
  perform pg_temp.check(pg_temp.consumed(p1) = 1 and pg_temp.held(p1) = 1, 'consumption reverted');

  -- Soft delete voids a scheduled link and frees its slot.
  perform public.attach_package_session(a, p1, pg_temp.g('appt_9'));
  perform pg_temp.check(pg_temp.held(p1) = 2, 'P1 full: 1 consumed + 2 held');
  perform pg_temp.expect_sqlstate(
    format('select public.attach_package_session(%L, %L, %L)', a, p1, pg_temp.g('appt_10')), '23514', 'P1 full rejects');
  update public.appointments set deleted_at = now() where id = pg_temp.g('appt_9');
  perform pg_temp.check(
    (select s.status from public.package_sessions s where s.appointment_id = pg_temp.g('appt_9')) = 'voided', 'soft delete voids');

  -- Mark missed (no-show on an overdue scheduled session) -> missed_pending, then resolve.
  v := public.attach_package_session(a, p1, pg_temp.g('appt_11'));
  s11 := (v ->> 'session_id')::uuid;
  perform public.mark_session_missed(a, s11, 'did not come');
  perform pg_temp.check(
    (select s.status = 'missed_pending' and s.missed_reason = 'no_show' from public.package_sessions s where s.id = s11),
    'mark missed -> missed_pending (no_show)');
  perform pg_temp.expect_sqlstate(
    format('select public.mark_session_missed(%L, %L)', a, s11), '22023', 'mark missed only from scheduled');
  perform public.resolve_missed_session(a, s11, 'rollover');

  -- Detach frees a scheduled slot; a completed session cannot be detached.
  perform public.detach_package_session(a, (select s.id from public.package_sessions s where s.appointment_id = pg_temp.g('appt_8') and s.status = 'scheduled'));
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_8')) is null, 'detach voids the link');
  perform pg_temp.expect_sqlstate(
    format('select public.detach_package_session(%L, %L)', a,
      (select s.id from public.package_sessions s where s.appointment_id = pg_temp.g('appt_1') and s.status = 'completed')),
    '22023', 'completed session cannot be detached');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (6) Trigger raises instead of swallowing: a payment pins the completed visit, so un-completing it fails and the
--     appointment keeps its status (ledger and appointment never disagree). The payment row is inserted as postgres
--     because the payment RPCs arrive in Task 7.
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
insert into public.package_payments (client_id, package_id, kind, amount, method, session_id)
select s.client_id, s.package_id, 'per_visit', 1, 'CASH', s.id
  from public.package_sessions s
 where s.appointment_id = pg_temp.g('appt_1') and s.status = 'completed';

set local role authenticated;
select pg_temp.act_as(current_setting('probe.a_user'), 'authenticated');

do $$
begin
  perform pg_temp.expect_sqlstate(
    format('update public.appointments set status = %L where id = %L', 'booked', pg_temp.g('appt_1')),
    '23514', 'trigger raises when a payment pins the completed visit');
  perform pg_temp.check(
    (select a.status::text from public.appointments a where a.id = pg_temp.g('appt_1')) = 'completed', 'appointment change rolled back');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_1')) = 'completed', 'session unchanged');

  -- Remaining never below zero for any probe package (consumed + held <= total).
  perform pg_temp.check(
    not exists (
      select 1 from public.customer_packages p
       where p.client_id = pg_temp.g('a_client')
         and pg_temp.consumed(p.id) + pg_temp.held(p.id) > p.sessions_total),
    'consumed + held never exceeds sessions_total');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (7) ANON: no RPC, no table.
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
set local role anon;
select pg_temp.act_as(null, 'anon');

do $$
declare
  a uuid := pg_temp.g('a_client');
  v_table text;
begin
  perform pg_temp.expect_sqlstate(
    format('select public.sell_package(%L, %L, %L, 1, %L, 10)', a, pg_temp.g('cust_a'), 'ZZ x', 'upfront'), '42501', 'anon sell');
  perform pg_temp.expect_sqlstate(
    format('select public.attach_package_session(%L, %L, %L)', a, pg_temp.g('p1'), pg_temp.g('appt_12')), '42501', 'anon attach');
  perform pg_temp.expect_sqlstate(
    format('select public.detach_package_session(%L, %L)', a, gen_random_uuid()), '42501', 'anon detach');
  perform pg_temp.expect_sqlstate(
    format('select public.mark_session_missed(%L, %L)', a, gen_random_uuid()), '42501', 'anon mark missed');
  perform pg_temp.expect_sqlstate(
    format('select public.resolve_missed_session(%L, %L, %L)', a, gen_random_uuid(), 'rollover'), '42501', 'anon resolve');
  foreach v_table in array array['package_templates', 'customer_packages', 'package_installments', 'package_sessions', 'package_payments'] loop
    perform pg_temp.expect_sqlstate(format('select count(*) from public.%I', v_table), '42501', 'anon read ' || v_table);
  end loop;
end
$$;

reset role;
select 'ALL PASS' as result;

rollback;
