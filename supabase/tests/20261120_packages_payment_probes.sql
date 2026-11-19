-- =====================================================================================================================
-- Package payment probes (quick-261114-22k, plan C2: Task 7). SELF-CHECKING, FULLY ROLLED BACK.
-- =====================================================================================================================
-- What it proves (each failure raises 'FAIL: ...' and aborts; success ends with one row: ALL PASS):
--   * catalog: sell_package / record_package_payment / cancel_package / the appointments trigger function are SECURITY DEFINER with search_path '', anon and
--     public cannot execute them, no overloads, idempotency_key column plus the partial unique index exist, the C2
--     sell_package body is live (not the C1 body), and no browser write grant exists on payments or installments
--   * sell per plan: upfront, installments (3 rows, sum = price, seq 1..3, 120 rows accepted), per_visit, free upfront,
--     template pick (own active template only)
--   * installment sum mismatch, empty / 121 rows, bad amounts (zero, negative, 3 decimals, string), bad dates (missing,
--     invalid, 'tomorrow', descending, too old, too far), schedule on the wrong plan, wrong plan prices: all rejected
--     (22023) and leave NO package behind (atomic)
--   * initial payment is created atomically with the sale; amount above the price rejected (23514); bad method / shape
--     rejected (22023); not allowed on per_visit
--   * record each kind (upfront, installment, per_visit); wrong kind rejected (22023); overpayment rejected (23514)
--     for every plan; invalid amount / method / key rejected (22023)
--   * per_visit: rolled_over, unconsumed (scheduled) and forfeited-without-charge sessions rejected (22023); completed and
--     forfeited-with-charge allowed; per-session cap (23514); another package's session P0002; accrued math and
--     balance = accrued - paid never negative
--   * idempotency: same key + same details returns the SAME row (replayed true), no duplicate, even after the payment
--     reached the total; same key with other details or on another package 23505; blank key = no key; key scoped per tenant
--   * cross-tenant: other tenant's p_client_id 42501; own client with the other tenant's package / session P0002;
--     other tenant's template P0002; payments of the other tenant invisible
--   * anon cannot execute anything; direct INSERT / UPDATE / DELETE on payments and installments denied (42501)
--   * cancel_package voids scheduled and undecided sessions, keeps payments and consumed sessions, sets cancelled_at and
--     cancel_reason, blocks attach and upfront payments afterwards, refuses completed and already cancelled packages;
--     per_visit visits already delivered can still be settled after a cancel
--   * the C1 appointments trigger still raises 23514 (and the appointment change rolls back) when a payment pins a
--     completed visit
--   * reschedule guard: a linked appointment cannot move past valid_until (22023, date and session unchanged, also
--     together with a status change); within validity, no-expiry packages, unlinked and detached appointments are free;
--     a date-only change never alters session status; status and soft-delete transitions still work
--   * a deterministic random walk of payments never lets paid exceed the total
--
-- HOW TO RUN (Supabase Dashboard -> SQL Editor, as the default postgres role; run the WHOLE file at once):
--   A. Migrations already applied (schema, rpcs, payment rpcs): run this file unchanged.
--   B. Migrations NOT applied yet (dry run against live): paste, at the INSERTION POINT below and in this order, the
--      full bodies of 20261119_client_settings.sql (only if Wave 1 is not live), 20261120_packages_schema.sql,
--      20261120_packages_rpcs.sql and 20261120_packages_payment_rpcs.sql. The final ROLLBACK undoes the DDL too.
--      Easier: run supabase/tests/20261120_packages_all_dryrun.sql, which already contains all of that plus the C1
--      probes in one transaction (regenerate with `node scripts/build-packages-dryrun.mjs`).
--      Note: the DDL takes an exclusive lock on public.appointments until the rollback (a few seconds): pick a quiet moment.
--   Data: borrows the first two clients (by id) with different crm_user_id values; inserts one throwaway customer per
--   tenant and appointments dated 2036 named "ZZ PayProbe" inside the transaction. Everything is rolled back. It also
--   writes a packages client_settings row for tenant A inside the transaction (rolled back) so forfeit snapshots are
--   deterministic. If customers or appointments gained a new NOT NULL column without a default, SETUP fails with that
--   column's name: add a value there and re-run.
-- =====================================================================================================================

begin;

-- >>> INSERTION POINT (option B): paste migration bodies here. <<<

-- ---------------------------------------------------------------------------------------------------------------------
-- (0) Helpers in pg_temp (removed by the rollback). create or replace so the C1 probe file can run first in the same
--     transaction (combined dry run). Granted to authenticated and anon so impersonated blocks can use them.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function pg_temp.g(p_key text) returns uuid
language sql stable as $$ select current_setting('probe.' || p_key)::uuid $$;

create or replace function pg_temp.check(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FAIL: %', p_label;
  end if;
end
$$;

create or replace function pg_temp.expect_sqlstate(p_sql text, p_state text, p_label text) returns void
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
create or replace function pg_temp.act_as(p_user text, p_role text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_user, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
end
$$;

create or replace function pg_temp.session_status(p_appointment uuid) returns text
language sql stable as $$
  select s.status from public.package_sessions s where s.appointment_id = p_appointment and s.status <> 'voided' limit 1
$$;

create or replace function pg_temp.consumed(p_package uuid) returns integer
language sql stable as $$
  select count(*)::integer from public.package_sessions s where s.package_id = p_package and s.status in ('completed', 'forfeited')
$$;
create or replace function pg_temp.held(p_package uuid) returns integer
language sql stable as $$
  select count(*)::integer from public.package_sessions s where s.package_id = p_package and s.status in ('scheduled', 'missed_pending')
$$;

-- Money helpers: paid = sum of the package's payments; accrued (per_visit) = price_per_session x chargeable visits.
create or replace function pg_temp.paid(p_package uuid) returns numeric
language sql stable as $$
  select coalesce(sum(pp.amount), 0) from public.package_payments pp where pp.package_id = p_package
$$;
create or replace function pg_temp.pay_count(p_package uuid) returns integer
language sql stable as $$
  select count(*)::integer from public.package_payments pp where pp.package_id = p_package
$$;
create or replace function pg_temp.accrued(p_package uuid) returns numeric
language sql stable as $$
  select coalesce(max(p.price_per_session), 0) * (
    select count(*) from public.package_sessions s
     where s.package_id = p_package
       and (s.status = 'completed' or (s.status = 'forfeited' and s.charge_on_forfeit is true)))
    from public.customer_packages p where p.id = p_package
$$;

-- SQL text of a sell_package call for tenant A and the probe customer (used with expect_sqlstate).
create or replace function pg_temp.sell_sql(p_plan text, p_total numeric, p_per numeric, p_sched jsonb, p_init jsonb)
returns text
language sql stable as $$
  select format(
    'select public.sell_package(%L, %L, %L, 6, %L, %L, %L, null, null, %L::jsonb, %L::jsonb)',
    pg_temp.g('a_client'), pg_temp.g('cust_a'), 'ZZ Pay Bad', p_plan, p_total, p_per, p_sched, p_init)
$$;

grant execute on function pg_temp.g(text), pg_temp.check(boolean, text), pg_temp.expect_sqlstate(text, text, text),
  pg_temp.act_as(text, text), pg_temp.session_status(uuid), pg_temp.consumed(uuid), pg_temp.held(uuid),
  pg_temp.paid(uuid), pg_temp.pay_count(uuid), pg_temp.accrued(uuid),
  pg_temp.sell_sql(text, numeric, numeric, jsonb, jsonb)
  to authenticated, anon;

-- ---------------------------------------------------------------------------------------------------------------------
-- (1) SETUP as postgres: two tenants, one throwaway customer each, appointments in 2036.
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

  insert into public.customers (client_id, name, phone) values (v_a_client, 'ZZ PayProbe Customer A', '9000000011')
  returning id into v_id;
  perform set_config('probe.cust_a', v_id::text, true);
  insert into public.customers (client_id, name, phone) values (v_b_client, 'ZZ PayProbe Customer B', '9000000012')
  returning id into v_id;
  perform set_config('probe.cust_b', v_id::text, true);

  -- appt_N is dated 2036-01-01 + N (appt_1 = 2036-01-02 ... appt_14 = 2036-01-15).
  for i in 1..14 loop
    insert into public.appointments (client_id, name, phone, service, staff_name, date, start_time, status)
    values (v_a_client, 'ZZ PayProbe Customer A', '9000000011', 'ZZ PayProbe', 'ZZ Probe Staff', date '2036-01-01' + i, '10:00', 'booked')
    returning id into v_id;
    perform set_config('probe.appt_' || i, v_id::text, true);
  end loop;

  for i in 1..2 loop
    insert into public.appointments (client_id, name, phone, service, staff_name, date, start_time, status)
    values (v_b_client, 'ZZ PayProbe Customer B', '9000000012', 'ZZ PayProbe', 'ZZ Probe Staff', date '2036-01-01' + i, '10:00', 'booked')
    returning id into v_id;
    perform set_config('probe.appt_b' || i, v_id::text, true);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (2) CATALOG as postgres.
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
    'public.record_package_payment(uuid,uuid,text,numeric,text,uuid,text,text)',
    'public.cancel_package(uuid,uuid,text)'
  ] loop
    v_proc := v_sig::regprocedure;
    perform pg_temp.check(not has_function_privilege('anon', v_proc, 'execute'), 'anon must not execute ' || v_sig);
    perform pg_temp.check(not has_function_privilege('public', v_proc, 'execute'), 'public must not execute ' || v_sig);
    perform pg_temp.check(has_function_privilege('authenticated', v_proc, 'execute'), 'authenticated must execute ' || v_sig);
    perform pg_temp.check(
      (select p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=""%' from pg_proc p where p.oid = v_proc),
      v_sig || ' must be SECURITY DEFINER with search_path ''''');
  end loop;

  perform pg_temp.check(
    not exists (
      select 1 from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('sell_package', 'record_package_payment', 'cancel_package')
       group by p.proname having count(*) > 1),
    'no payment RPC overloads');

  perform pg_temp.check(
    pg_get_functiondef('public.sell_package(uuid,uuid,text,integer,text,numeric,numeric,date,uuid,jsonb,jsonb,text)'::regprocedure)
      like '%Invalid installments%',
    'the C2 sell_package body is live (the C1 body is active: re-apply 20261120_packages_payment_rpcs.sql after the rpcs file)');

  perform pg_temp.check(
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'package_payments' and column_name = 'idempotency_key'),
    'package_payments.idempotency_key exists');
  perform pg_temp.check(
    exists (select 1 from pg_indexes
             where schemaname = 'public' and indexname = 'package_payments_client_idem_uniq'
               and indexdef ilike '%unique%' and indexdef ilike '%idempotency_key is not null%'),
    'partial unique index on (client_id, idempotency_key)');

  foreach v_table in array array['package_installments', 'package_payments'] loop
    perform pg_temp.check(has_table_privilege('authenticated', 'public.' || v_table, 'select'), 'authenticated reads ' || v_table);
    foreach v_priv in array array['insert', 'update', 'delete', 'truncate'] loop
      perform pg_temp.check(not has_table_privilege('authenticated', 'public.' || v_table, v_priv),
        'authenticated must not ' || v_priv || ' ' || v_table);
      perform pg_temp.check(not has_table_privilege('anon', 'public.' || v_table, v_priv),
        'anon must not ' || v_priv || ' ' || v_table);
    end loop;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (3) TENANT B as authenticated: own data for the cross-tenant checks (template, upfront with a payment and a key,
--     per_visit with a completed visit).
-- ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(current_setting('probe.b_user'), 'authenticated');

do $$
declare
  v jsonb;
  b uuid := pg_temp.g('b_client');
  v_id uuid;
begin
  insert into public.package_templates (client_id, name, session_count, payment_plan, price_total)
  values (b, 'ZZ Pay B Template', 2, 'upfront', 100)
  returning id into v_id;
  perform set_config('probe.tmpl_b', v_id::text, true);

  v := public.sell_package(b, pg_temp.g('cust_b'), 'ZZ Pay BU', 2, 'upfront', 1000, null, null, null, null,
         jsonb_build_object('amount', 100, 'method', 'UPI'));
  perform set_config('probe.pbu', v ->> 'package_id', true);
  perform pg_temp.check(pg_temp.paid(pg_temp.g('pbu')) = 100, 'B initial payment recorded');

  v := public.record_package_payment(b, pg_temp.g('pbu'), 'upfront', 50, 'CASH', p_idempotency_key => 'probe-key-0001');
  perform pg_temp.check((v ->> 'replayed')::boolean = false and (v ->> 'balance')::numeric = 850, 'B keyed payment, balance 850');

  v := public.sell_package(b, pg_temp.g('cust_b'), 'ZZ Pay BV', 3, 'per_visit', null, 100);
  perform set_config('probe.pbv', v ->> 'package_id', true);
  v := public.attach_package_session(b, pg_temp.g('pbv'), pg_temp.g('appt_b1'));
  perform set_config('probe.sbv', v ->> 'session_id', true);
  update public.appointments set status = 'completed' where id = pg_temp.g('appt_b1');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_b1')) = 'completed', 'SETUP: B visit completed');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (4) TENANT A: selling per plan, atomic initial payment, schedule and price validation.
-- ---------------------------------------------------------------------------------------------------------------------
reset role;
set local role authenticated;
select pg_temp.act_as(current_setting('probe.a_user'), 'authenticated');

do $$
declare
  v jsonb;
  a uuid := pg_temp.g('a_client');
  c uuid := pg_temp.g('cust_a');
  v_sched jsonb;
  v_pkg uuid;
  v_tmpl uuid;
  v_tmpl_off uuid;
begin
  perform pg_temp.check(public.crm_can_access_client(a), 'SETUP: impersonated user A does not own client A');

  -- Upfront: no schedule, no payment.
  v := public.sell_package(a, c, 'ZZ Pay U', 4, 'upfront', 1000);
  v_pkg := (v ->> 'package_id')::uuid;
  perform pg_temp.check(v ->> 'status' = 'active' and v ->> 'payment_id' is null, 'upfront sale, no initial payment');
  perform pg_temp.check(pg_temp.pay_count(v_pkg) = 0, 'upfront sale writes no payment by itself');
  perform pg_temp.check(
    (select count(*) from public.package_installments i where i.package_id = v_pkg) = 0, 'upfront has no installments');

  -- Upfront with an initial payment is atomic with the package.
  v := public.sell_package(a, c, 'ZZ Pay UP', 4, 'upfront', 1000, null, null, null, null,
         jsonb_build_object('amount', 400, 'method', 'CASH', 'note', 'deposit'));
  v_pkg := (v ->> 'package_id')::uuid;
  perform pg_temp.check(v ->> 'payment_id' is not null, 'initial payment id returned');
  perform pg_temp.check(
    (select pp.kind = 'upfront' and pp.amount = 400 and pp.method = 'CASH' and pp.note = 'deposit' and pp.client_id = a
       and pp.package_id = v_pkg and pp.recorded_by = auth.uid()
       from public.package_payments pp where pp.id = (v ->> 'payment_id')::uuid),
    'initial payment row is kind upfront, amount, method, note, recorded_by');
  perform pg_temp.check(pg_temp.paid(v_pkg) = 400, 'paid = 400 after the initial payment');

  -- Upfront fully paid at sale, and a free package.
  v := public.sell_package(a, c, 'ZZ Pay Full', 2, 'upfront', 250.50, null, null, null, null,
         jsonb_build_object('amount', 250.50, 'method', 'UPI'));
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 0.01, %L)', a, v ->> 'package_id', 'upfront', 'CASH'),
    '23514', 'fully paid upfront takes no more');
  v := public.sell_package(a, c, 'ZZ Pay Free', 2, 'upfront', 0);
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 1, %L)', a, v ->> 'package_id', 'upfront', 'CASH'),
    '23514', 'free package takes no payment');

  -- Installments: 3 x 300 for 900, first one collected at sale.
  v_sched := jsonb_build_array(
    jsonb_build_object('due_on', current_date, 'amount', 300),
    jsonb_build_object('due_on', current_date + 30, 'amount', 300),
    jsonb_build_object('due_on', current_date + 60, 'amount', 300));
  v := public.sell_package(a, c, 'ZZ Pay I', 6, 'installments', 900, null, null, null, v_sched,
         jsonb_build_object('amount', 300, 'method', 'UPI'));
  v_pkg := (v ->> 'package_id')::uuid;
  perform set_config('probe.pi', v_pkg::text, true);
  perform pg_temp.check((v ->> 'installments')::int = 3, 'sell reports 3 installments');
  perform pg_temp.check(
    (select count(*) = 3 and sum(i.amount) = 900 and min(i.seq) = 1 and max(i.seq) = 3
            and min(i.due_on) = current_date and max(i.due_on) = current_date + 60
       from public.package_installments i where i.package_id = v_pkg),
    'installment rows: 3, sum 900, seq 1..3, due dates in order');
  perform pg_temp.check(
    (select pp.kind from public.package_payments pp where pp.id = (v ->> 'payment_id')::uuid) = 'installment',
    'initial payment on an installments plan is kind installment');

  -- 120 rows is the upper bound and is accepted (120 x 1 = 120).
  v := public.sell_package(a, c, 'ZZ Pay I120', 6, 'installments', 120, null, null, null,
         (select jsonb_agg(jsonb_build_object('due_on', current_date + n, 'amount', 1) order by n) from generate_series(1, 120) n));
  perform pg_temp.check(
    (select count(*) from public.package_installments i where i.package_id = (v ->> 'package_id')::uuid) = 120, '120 installments accepted');

  -- Per visit: price per session, no total.
  v := public.sell_package(a, c, 'ZZ Pay PVprobe', 6, 'per_visit', null, 500);
  perform pg_temp.check(
    (select p.payment_plan = 'per_visit' and p.price_total is null and p.price_per_session = 500
       from public.customer_packages p where p.id = (v ->> 'package_id')::uuid),
    'per_visit stores price_per_session only');

  -- Template pick: own active template links; inactive and another tenant's template are not found.
  insert into public.package_templates (client_id, name, session_count, payment_plan, price_total)
  values (a, 'ZZ Pay Template', 4, 'upfront', 400) returning id into v_tmpl;
  insert into public.package_templates (client_id, name, session_count, payment_plan, price_total, is_active)
  values (a, 'ZZ Pay Template Off', 4, 'upfront', 400, false) returning id into v_tmpl_off;
  v := public.sell_package(a, c, 'ZZ Pay FromTemplate', 4, 'upfront', 400, null, null, v_tmpl);
  perform pg_temp.check(
    (select p.template_id from public.customer_packages p where p.id = (v ->> 'package_id')::uuid) = v_tmpl, 'template linked');
  perform pg_temp.expect_sqlstate(
    format('select public.sell_package(%L, %L, %L, 4, %L, 400, null, null, %L)', a, c, 'ZZ x', 'upfront', v_tmpl_off),
    'P0002', 'inactive template');
  perform pg_temp.expect_sqlstate(
    format('select public.sell_package(%L, %L, %L, 4, %L, 400, null, null, %L)', a, c, 'ZZ x', 'upfront', pg_temp.g('tmpl_b')),
    'P0002', 'other tenant template');
end
$$;

-- Rejected sales: every one raises and leaves no package behind (atomic).
do $$
declare
  v_ok_sched jsonb := jsonb_build_array(
    jsonb_build_object('due_on', current_date, 'amount', 500),
    jsonb_build_object('due_on', current_date + 30, 'amount', 500));
  v_121 jsonb := (select jsonb_agg(jsonb_build_object('due_on', current_date, 'amount', 1)) from generate_series(1, 121));
begin
  -- Schedule shape and sum.
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000,
    null, jsonb_build_array(jsonb_build_object('due_on', current_date, 'amount', 300), jsonb_build_object('due_on', current_date, 'amount', 300)), null),
    '22023', 'installment sum mismatch (600 vs 1000)');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000,
    null, jsonb_build_array(jsonb_build_object('due_on', current_date, 'amount', 600), jsonb_build_object('due_on', current_date, 'amount', 600)), null),
    '22023', 'installment sum above the price');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null, '[]'::jsonb, null), '22023', 'empty schedule');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 121, null, v_121, null), '22023', '121 installments');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null, null, null), '22023', 'installments without a schedule');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null, 'null'::jsonb, null), '22023', 'json null schedule');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null, '{"due_on":"2030-01-01","amount":1000}'::jsonb, null),
    '22023', 'schedule not an array');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', null, null, v_ok_sched, null), '22023', 'installments without a price');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 0, null, v_ok_sched, null), '22023', 'installments with a zero price');

  -- Amount rules.
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null,
    jsonb_build_array(jsonb_build_object('due_on', current_date, 'amount', -100), jsonb_build_object('due_on', current_date, 'amount', 1100)), null),
    '22023', 'negative installment');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null,
    jsonb_build_array(jsonb_build_object('due_on', current_date, 'amount', 0), jsonb_build_object('due_on', current_date, 'amount', 1000)), null),
    '22023', 'zero installment');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 200.01, null,
    jsonb_build_array(jsonb_build_object('due_on', current_date, 'amount', 100.005), jsonb_build_object('due_on', current_date, 'amount', 100.005)), null),
    '22023', 'three-decimal installment');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null,
    jsonb_build_array(jsonb_build_object('due_on', current_date, 'amount', '1000')), null),
    '22023', 'amount as a string');

  -- Date rules.
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null,
    jsonb_build_array(jsonb_build_object('amount', 1000)), null), '22023', 'missing due_on');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null,
    jsonb_build_array(jsonb_build_object('due_on', '2030-02-30', 'amount', 1000)), null), '22023', 'invalid calendar date');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null,
    jsonb_build_array(jsonb_build_object('due_on', 'tomorrow', 'amount', 1000)), null), '22023', 'special date word');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null,
    jsonb_build_array(jsonb_build_object('due_on', current_date + 30, 'amount', 500), jsonb_build_object('due_on', current_date, 'amount', 500)), null),
    '22023', 'descending due dates');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null,
    jsonb_build_array(jsonb_build_object('due_on', current_date - 400, 'amount', 1000)), null), '22023', 'due date too far in the past');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null,
    jsonb_build_array(jsonb_build_object('due_on', current_date + 4000, 'amount', 1000)), null), '22023', 'due date too far ahead');

  -- Schedule on the wrong plan, wrong plan prices.
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('upfront', 1000, null, v_ok_sched, null), '22023', 'schedule on an upfront plan');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('per_visit', null, 500, v_ok_sched, null), '22023', 'schedule on a per_visit plan');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('upfront', 1000, 50, null, null), '22023', 'upfront with price_per_session');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('upfront', null, null, null, null), '22023', 'upfront without price');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('upfront', 10.005, null, null, null), '22023', 'upfront with three decimals');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('per_visit', 1000, 500, null, null), '22023', 'per_visit with price_total');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('per_visit', null, 0, null, null), '22023', 'per_visit with zero price');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('per_visit', null, 10.005, null, null), '22023', 'per_visit with three decimals');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('per_visit', null, null, null, null), '22023', 'per_visit without price');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('monthly', 100, null, null, null), '22023', 'unknown plan');

  -- Initial payment rules.
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('upfront', 1000, null, null, '{"amount":0,"method":"CASH"}'::jsonb),
    '22023', 'initial payment of zero');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('upfront', 1000, null, null, '{"amount":-5,"method":"CASH"}'::jsonb),
    '22023', 'negative initial payment');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('upfront', 1000, null, null, '{"amount":10.005,"method":"CASH"}'::jsonb),
    '22023', 'three-decimal initial payment');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('upfront', 1000, null, null, '{"amount":100,"method":"BTC"}'::jsonb),
    '22023', 'bad initial method');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('upfront', 1000, null, null, '{"amount":"100","method":"CASH"}'::jsonb),
    '22023', 'initial amount as string');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('upfront', 1000, null, null, '[{"amount":100,"method":"CASH"}]'::jsonb),
    '22023', 'initial payment as an array');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('upfront', 1000, null, null, '{"method":"CASH"}'::jsonb),
    '22023', 'initial payment without amount');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('upfront', 1000, null, null, '{"amount":1000.01,"method":"CASH"}'::jsonb),
    '23514', 'initial payment above the price (upfront)');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('installments', 1000, null, v_ok_sched, '{"amount":1000.01,"method":"CASH"}'::jsonb),
    '23514', 'initial payment above the price (installments)');
  perform pg_temp.expect_sqlstate(pg_temp.sell_sql('per_visit', null, 500, null, '{"amount":100,"method":"CASH"}'::jsonb),
    '22023', 'initial payment on per_visit');

  -- Atomic: none of the rejected sales left a package behind.
  perform pg_temp.check(
    not exists (select 1 from public.customer_packages p where p.name_snapshot = 'ZZ Pay Bad'),
    'rejected sales leave no package behind');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (5) TENANT A: record each kind, wrong kind, overpayment, argument validation, installments.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  v jsonb;
  a uuid := pg_temp.g('a_client');
  v_pu uuid;
  pinst uuid := pg_temp.g('pi');
  pu uuid;
begin
  v := public.sell_package(a, pg_temp.g('cust_a'), 'ZZ Pay U1', 3, 'upfront', 1000);
  v_pu := (v ->> 'package_id')::uuid;
  perform set_config('probe.pu', v_pu::text, true);
  pu := v_pu;

  -- Upfront: two partial payments to the exact total.
  v := public.record_package_payment(a, pu, 'upfront', 400, 'CASH', p_note => 'first');
  perform pg_temp.check((v ->> 'paid_total')::numeric = 400 and (v ->> 'balance')::numeric = 600
    and (v ->> 'replayed')::boolean = false, 'upfront 400: paid 400, balance 600');
  v := public.record_package_payment(a, pu, 'upfront', 600, 'UPI');
  perform pg_temp.check((v ->> 'paid_total')::numeric = 1000 and (v ->> 'balance')::numeric = 0, 'upfront reaches the exact total');
  perform pg_temp.check(pg_temp.paid(pu) = 1000 and pg_temp.pay_count(pu) = 2, 'two upfront payments stored');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 0.01, %L)', a, pu, 'upfront', 'CASH'), '23514', 'upfront overpayment by 0.01');

  -- Argument validation on a fresh upfront package (so an overpayment is not the reason for a rejection).
  v := public.sell_package(a, pg_temp.g('cust_a'), 'ZZ Pay U2', 3, 'upfront', 500);
  perform set_config('probe.pu2', v ->> 'package_id', true);
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L)', a, pg_temp.g('pu2'), 'installment', 'CASH'), '22023', 'installment kind on upfront');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L)', a, pg_temp.g('pu2'), 'per_visit', 'CASH'), '22023', 'per_visit kind on upfront');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L)', a, pg_temp.g('pu2'), 'refund', 'CASH'), '22023', 'unknown kind');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, null, 100, %L)', a, pg_temp.g('pu2'), 'CASH'), '22023', 'null kind');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 0, %L)', a, pg_temp.g('pu2'), 'upfront', 'CASH'), '22023', 'zero amount');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, -5, %L)', a, pg_temp.g('pu2'), 'upfront', 'CASH'), '22023', 'negative amount');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 10.005, %L)', a, pg_temp.g('pu2'), 'upfront', 'CASH'), '22023', 'three decimals');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, null, %L)', a, pg_temp.g('pu2'), 'upfront', 'CASH'), '22023', 'null amount');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L)', a, pg_temp.g('pu2'), 'upfront', 'BTC'), '22023', 'bad method');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, null)', a, pg_temp.g('pu2'), 'upfront'), '22023', 'null method');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L, %L)', a, pg_temp.g('pu2'), 'upfront', 'CASH', gen_random_uuid()),
    '22023', 'session on an upfront plan');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L, null, %L)', a, pg_temp.g('pu2'), 'upfront', 'CASH', repeat('x', 501)),
    '22023', 'note over 500');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100000000, %L)', a, pg_temp.g('pu2'), 'upfront', 'CASH'), '22023', 'amount above the column maximum');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, null, %L, 100, %L)', a, 'upfront', 'CASH'), 'P0002', 'null package');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L)', a, gen_random_uuid(), 'upfront', 'CASH'), 'P0002', 'unknown package');
  perform pg_temp.check(pg_temp.pay_count(pg_temp.g('pu2')) = 0, 'no rejected call wrote a payment');

  -- Installments (900, 300 already paid at sale): wrong kind, overpayment, exact total.
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L)', a, pinst, 'upfront', 'CASH'), '22023', 'upfront kind on installments');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 600.01, %L)', a, pinst, 'installment', 'CASH'), '23514', 'installments overpayment by 0.01');
  v := public.record_package_payment(a, pinst, 'installment', 250.25, 'CARD');
  perform pg_temp.check((v ->> 'paid_total')::numeric = 550.25 and (v ->> 'balance')::numeric = 349.75, 'installment 250.25: paid 550.25');
  v := public.record_package_payment(a, pinst, 'installment', 349.75, 'OTHER');
  perform pg_temp.check((v ->> 'balance')::numeric = 0 and pg_temp.paid(pinst) = 900, 'installments reach the exact total');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 0.01, %L)', a, pinst, 'installment', 'CASH'), '23514', 'installments full');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (6) TENANT A: per_visit sessions in every state, accrual, per-session cap.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  v jsonb;
  a uuid := pg_temp.g('a_client');
  c uuid := pg_temp.g('cust_a');
  pv uuid;
  pvx uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; sx uuid;
  v_labels jsonb := '{"package":"Package","packages":"Packages","session":"Session","sessions":"Sessions"}';
begin
  v := public.sell_package(a, c, 'ZZ Pay PV', 6, 'per_visit', null, 500);
  pv := (v ->> 'package_id')::uuid;
  perform set_config('probe.pv', pv::text, true);

  -- s1 completed.
  s1 := (public.attach_package_session(a, pv, pg_temp.g('appt_1')) ->> 'session_id')::uuid;
  update public.appointments set status = 'completed' where id = pg_temp.g('appt_1');

  -- s2 forfeited and charged (setting on).
  insert into public.client_settings (client_id, namespace, settings)
  values (a, 'packages', jsonb_build_object('missed_default', 'rollover', 'rollover_extends_validity_days', 0,
                                            'forfeit_charges_per_visit', true, 'labels', v_labels))
  on conflict (client_id, namespace) do update set settings = excluded.settings;
  s2 := (public.attach_package_session(a, pv, pg_temp.g('appt_2')) ->> 'session_id')::uuid;
  update public.appointments set status = 'cancelled' where id = pg_temp.g('appt_2');
  perform public.resolve_missed_session(a, s2, 'forfeit');
  perform pg_temp.check((select s.charge_on_forfeit from public.package_sessions s where s.id = s2) = true, 'SETUP: s2 forfeit is charged');

  -- s3 forfeited, NOT charged (setting off).
  update public.client_settings
     set settings = jsonb_build_object('missed_default', 'rollover', 'rollover_extends_validity_days', 0,
                                       'forfeit_charges_per_visit', false, 'labels', v_labels)
   where client_id = a and namespace = 'packages';
  s3 := (public.attach_package_session(a, pv, pg_temp.g('appt_3')) ->> 'session_id')::uuid;
  update public.appointments set status = 'cancelled' where id = pg_temp.g('appt_3');
  perform public.resolve_missed_session(a, s3, 'forfeit');
  perform pg_temp.check((select s.charge_on_forfeit from public.package_sessions s where s.id = s3) = false, 'SETUP: s3 forfeit is not charged');

  -- s4 rolled over, s5 still scheduled.
  s4 := (public.attach_package_session(a, pv, pg_temp.g('appt_4')) ->> 'session_id')::uuid;
  update public.appointments set status = 'cancelled' where id = pg_temp.g('appt_4');
  perform public.resolve_missed_session(a, s4, 'rollover');
  s5 := (public.attach_package_session(a, pv, pg_temp.g('appt_5')) ->> 'session_id')::uuid;

  -- A completed visit in ANOTHER package of the same tenant (for the session/package mismatch check).
  v := public.sell_package(a, c, 'ZZ Pay PVX', 2, 'per_visit', null, 100);
  pvx := (v ->> 'package_id')::uuid;
  sx := (public.attach_package_session(a, pvx, pg_temp.g('appt_14')) ->> 'session_id')::uuid;
  update public.appointments set status = 'completed' where id = pg_temp.g('appt_14');

  perform set_config('probe.s1', s1::text, true);
  perform set_config('probe.s2', s2::text, true);

  -- Accrual: completed (500) + forfeited charged (500) = 1000; nothing else accrues.
  perform pg_temp.check(pg_temp.accrued(pv) = 1000, 'accrued = 500 x (1 completed + 1 charged forfeit)');

  -- Rejected: rolled over, scheduled, forfeited without charge, no session, wrong kind, other package's session.
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L, %L)', a, pv, 'per_visit', 'CASH', s4), '22023', 'payment against a rolled over session');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L, %L)', a, pv, 'per_visit', 'CASH', s5), '22023', 'payment against an unconsumed (scheduled) session');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L, %L)', a, pv, 'per_visit', 'CASH', s3), '22023', 'payment against a forfeited session that is not charged');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L)', a, pv, 'per_visit', 'CASH'), '22023', 'per_visit without a session');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L, %L)', a, pv, 'upfront', 'CASH', s1), '22023', 'upfront kind on per_visit');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L, %L)', a, pv, 'installment', 'CASH', s1), '22023', 'installment kind on per_visit');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L, %L)', a, pv, 'per_visit', 'CASH', sx), 'P0002', 'session of another package');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 100, %L, %L)', a, pv, 'per_visit', 'CASH', gen_random_uuid()), 'P0002', 'unknown session');
  perform pg_temp.check(pg_temp.pay_count(pv) = 0, 'no rejected per_visit call wrote a payment');

  -- Allowed: completed and forfeited-with-charge, up to price_per_session per session.
  v := public.record_package_payment(a, pv, 'per_visit', 500, 'CASH', s1);
  perform pg_temp.check((v ->> 'paid_total')::numeric = 500 and (v ->> 'balance')::numeric = 500, 'per_visit on a completed visit: balance 500');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 0.01, %L, %L)', a, pv, 'per_visit', 'CASH', s1), '23514', 'per-session cap (completed)');
  v := public.record_package_payment(a, pv, 'per_visit', 200, 'UPI', s2);
  perform pg_temp.check((v ->> 'balance')::numeric = 300, 'per_visit on a charged forfeit: balance 300');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 300.01, %L, %L)', a, pv, 'per_visit', 'CASH', s2), '23514', 'per-session cap (forfeit, 300.01 over)');
  v := public.record_package_payment(a, pv, 'per_visit', 300, 'CARD', s2);
  perform pg_temp.check((v ->> 'balance')::numeric = 0 and pg_temp.paid(pv) = pg_temp.accrued(pv), 'paid equals accrued, balance 0');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 0.01, %L, %L)', a, pv, 'per_visit', 'CASH', s2), '23514', 'per-session cap (forfeit full)');

  -- Per-session caps keep paid <= accrued even if an unpaid completed visit is later corrected back to booked.
  perform pg_temp.check(pg_temp.paid(pv) <= pg_temp.accrued(pv), 'per_visit paid never exceeds accrued');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (7) TENANT A: idempotency.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  v jsonb;
  v2 jsonb;
  a uuid := pg_temp.g('a_client');
  c uuid := pg_temp.g('cust_a');
  p2 uuid := pg_temp.g('pu2');
  p3 uuid;
  p4 uuid;
begin
  v := public.sell_package(a, c, 'ZZ Pay U3', 3, 'upfront', 500);
  p3 := (v ->> 'package_id')::uuid;
  v := public.sell_package(a, c, 'ZZ Pay U4', 3, 'upfront', 100);
  p4 := (v ->> 'package_id')::uuid;

  -- First call stores the row; the same key is also used by tenant B (scoped per tenant, so no clash).
  v := public.record_package_payment(a, p2, 'upfront', 200, 'CASH', p_idempotency_key => 'probe-key-0001');
  perform pg_temp.check((v ->> 'replayed')::boolean = false and (v ->> 'paid_total')::numeric = 200, 'keyed payment stored');
  perform pg_temp.check(
    (select pp.client_id = a and pp.package_id = p2 and pp.idempotency_key = 'probe-key-0001'
       from public.package_payments pp where pp.id = (v ->> 'payment_id')::uuid),
    'the key is stored on tenant A''s own row (tenant B using the same key text did not clash)');

  -- Replay with the same details returns the SAME row and writes nothing.
  v2 := public.record_package_payment(a, p2, 'upfront', 200, 'CASH', p_idempotency_key => 'probe-key-0001');
  perform pg_temp.check((v2 ->> 'replayed')::boolean = true and v2 ->> 'payment_id' = v ->> 'payment_id', 'replay returns the same payment id');
  perform pg_temp.check(pg_temp.pay_count(p2) = 1 and pg_temp.paid(p2) = 200, 'replay did not double charge');
  v2 := public.record_package_payment(a, p2, 'upfront', 200, 'CASH', p_note => 'a different note', p_idempotency_key => ' probe-key-0001 ');
  perform pg_temp.check((v2 ->> 'replayed')::boolean = true and pg_temp.pay_count(p2) = 1, 'replay ignores note and trims the key');

  -- Same key, different details: rejected, nothing written.
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 201, %L, null, null, %L)', a, p2, 'upfront', 'CASH', 'probe-key-0001'),
    '23505', 'same key with another amount');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 200, %L, null, null, %L)', a, p2, 'upfront', 'UPI', 'probe-key-0001'),
    '23505', 'same key with another method');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 200, %L, null, null, %L)', a, p3, 'upfront', 'CASH', 'probe-key-0001'),
    '23505', 'same key on another package');
  perform pg_temp.check(pg_temp.pay_count(p2) = 1 and pg_temp.pay_count(p3) = 0, 'key conflicts wrote nothing');

  -- A retry after the payment reached the exact total still succeeds (replay is checked before the balance).
  v := public.record_package_payment(a, p2, 'upfront', 300, 'CASH', p_idempotency_key => 'probe-key-0002');
  perform pg_temp.check((v ->> 'balance')::numeric = 0 and pg_temp.paid(p2) = 500, 'second keyed payment reaches the total');
  v2 := public.record_package_payment(a, p2, 'upfront', 300, 'CASH', p_idempotency_key => 'probe-key-0002');
  perform pg_temp.check((v2 ->> 'replayed')::boolean = true and (v2 ->> 'balance')::numeric = 0 and pg_temp.pay_count(p2) = 2,
    'replay after reaching the total returns the row instead of an overpayment error');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 0.01, %L)', a, p2, 'upfront', 'CASH'), '23514', 'unkeyed extra payment still overpays');

  -- Blank keys are no key: two calls make two rows. Over-long key rejected.
  perform public.record_package_payment(a, p4, 'upfront', 10, 'CASH', p_idempotency_key => '');
  perform public.record_package_payment(a, p4, 'upfront', 10, 'CASH', p_idempotency_key => '   ');
  perform pg_temp.check(pg_temp.pay_count(p4) = 2 and pg_temp.paid(p4) = 20, 'blank keys do not dedupe');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 10, %L, null, null, %L)', a, p4, 'upfront', 'CASH', repeat('k', 101)),
    '22023', 'key over 100 characters');
  perform pg_temp.check(
    (select count(*) from public.package_payments pp where pp.client_id = a and pp.idempotency_key = 'probe-key-0001') = 1,
    'exactly one stored row per (client, key)');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (8) TENANT A: cross-tenant isolation of the payment RPCs.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  a uuid := pg_temp.g('a_client');
  b uuid := pg_temp.g('b_client');
  pbu uuid := pg_temp.g('pbu');
  pbv uuid := pg_temp.g('pbv');
  sbv uuid := pg_temp.g('sbv');
begin
  perform pg_temp.check(not public.crm_can_access_client(b), 'SETUP: user A must not own client B');

  -- Other tenant's p_client_id: 42501 on every payment RPC.
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 1, %L)', b, pbu, 'upfront', 'CASH'), '42501', 'cross-tenant record payment');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 1, %L, %L)', b, pbv, 'per_visit', 'CASH', sbv), '42501', 'cross-tenant per_visit payment');
  perform pg_temp.expect_sqlstate(
    format('select public.cancel_package(%L, %L)', b, pbu), '42501', 'cross-tenant cancel');
  perform pg_temp.expect_sqlstate(
    format('select public.sell_package(%L, %L, %L, 1, %L, 10)', b, pg_temp.g('cust_b'), 'ZZ x', 'upfront'), '42501', 'cross-tenant sell');

  -- Own p_client_id with the other tenant's objects: not found, nothing leaks or changes.
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 1, %L)', a, pbu, 'upfront', 'CASH'), 'P0002', 'B package via A (payment)');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 1, %L, %L)', a, pbv, 'per_visit', 'CASH', sbv), 'P0002', 'B package and session via A');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 1, %L, %L)', a, pg_temp.g('pv'), 'per_visit', 'CASH', sbv), 'P0002', 'B session on A package');
  perform pg_temp.expect_sqlstate(
    format('select public.cancel_package(%L, %L)', a, pbu), 'P0002', 'B package via A (cancel)');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 1, %L, null, null, %L)', a, pbu, 'upfront', 'CASH', 'probe-key-0001'), 'P0002',
    'B package with the key B already used');

  perform pg_temp.check((select count(*) from public.package_payments pp where pp.client_id = b) = 0, 'A cannot read B payments');
  perform pg_temp.check((select count(*) from public.package_installments i where i.client_id = b) = 0, 'A cannot read B installments');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (9) TENANT A: cancel_package.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  v jsonb;
  a uuid := pg_temp.g('a_client');
  c uuid := pg_temp.g('cust_a');
  pc uuid;
  pd uuid;
  pdone uuid;
  pvc uuid;
  s_pc_sched uuid; s_pc_missed uuid; s_pc_done uuid; s_pvc uuid;
begin
  v := public.sell_package(a, c, 'ZZ Pay Cancel', 5, 'upfront', 1000, null, null, null, null,
         jsonb_build_object('amount', 300, 'method', 'CASH'));
  pc := (v ->> 'package_id')::uuid;
  s_pc_sched := (public.attach_package_session(a, pc, pg_temp.g('appt_6')) ->> 'session_id')::uuid;
  s_pc_missed := (public.attach_package_session(a, pc, pg_temp.g('appt_7')) ->> 'session_id')::uuid;
  update public.appointments set status = 'cancelled' where id = pg_temp.g('appt_7');
  s_pc_done := (public.attach_package_session(a, pc, pg_temp.g('appt_8')) ->> 'session_id')::uuid;
  update public.appointments set status = 'completed' where id = pg_temp.g('appt_8');
  perform pg_temp.check(
    pg_temp.held(pc) = 2 and pg_temp.consumed(pc) = 1, 'SETUP: one scheduled, one undecided, one completed');

  v := public.cancel_package(a, pc, 'customer moved away');
  perform pg_temp.check((v ->> 'voided_sessions')::int = 2 and v ->> 'status' = 'cancelled', 'cancel voids the two open sessions');
  perform pg_temp.check(
    (select s.status from public.package_sessions s where s.id = s_pc_sched) = 'voided'
    and (select s.status from public.package_sessions s where s.id = s_pc_missed) = 'voided'
    and (select s.voided_at is not null from public.package_sessions s where s.id = s_pc_sched),
    'scheduled and undecided sessions are voided with voided_at');
  perform pg_temp.check(
    (select s.status from public.package_sessions s where s.id = s_pc_done) = 'completed', 'the completed session is kept');
  perform pg_temp.check(
    (select p.status = 'cancelled' and p.cancelled_at is not null and p.cancel_reason = 'customer moved away'
       from public.customer_packages p where p.id = pc),
    'package cancelled with cancelled_at and cancel_reason');
  perform pg_temp.check(pg_temp.pay_count(pc) = 1 and pg_temp.paid(pc) = 300, 'cancel keeps every payment');
  perform pg_temp.check(pg_temp.held(pc) = 0 and pg_temp.consumed(pc) = 1, 'no held sessions after cancel, consumed stays');

  -- The appointment of a voided link changes freely and never touches the cancelled ledger.
  update public.appointments set status = 'completed' where id = pg_temp.g('appt_6');
  perform pg_temp.check(pg_temp.consumed(pc) = 1 and pg_temp.session_status(pg_temp.g('appt_6')) is null,
    'completing a voided link consumes nothing');

  -- A cancelled package takes no new link and no upfront payment; cancelling twice is rejected.
  perform pg_temp.expect_sqlstate(
    format('select public.attach_package_session(%L, %L, %L)', a, pc, pg_temp.g('appt_9')), '22023', 'attach to a cancelled package');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 10, %L)', a, pc, 'upfront', 'CASH'), '22023', 'upfront payment on a cancelled package');
  perform pg_temp.expect_sqlstate(
    format('select public.cancel_package(%L, %L)', a, pc), '22023', 'cancel twice');

  -- Reason bounded; blank reason stored as null; completed packages cannot be cancelled.
  v := public.sell_package(a, c, 'ZZ Pay Cancel2', 2, 'upfront', 100);
  pd := (v ->> 'package_id')::uuid;
  perform pg_temp.expect_sqlstate(
    format('select public.cancel_package(%L, %L, %L)', a, pd, repeat('r', 501)), '22023', 'reason over 500');
  perform public.cancel_package(a, pd, '   ');
  perform pg_temp.check(
    (select p.status = 'cancelled' and p.cancel_reason is null from public.customer_packages p where p.id = pd), 'blank reason stored as null');

  v := public.sell_package(a, c, 'ZZ Pay Cancel3', 1, 'upfront', 100);
  pdone := (v ->> 'package_id')::uuid;
  perform public.attach_package_session(a, pdone, pg_temp.g('appt_10'));
  update public.appointments set status = 'completed' where id = pg_temp.g('appt_10');
  perform pg_temp.check((select p.status from public.customer_packages p where p.id = pdone) = 'completed', 'SETUP: package completed');
  perform pg_temp.expect_sqlstate(
    format('select public.cancel_package(%L, %L)', a, pdone), '22023', 'cancel a completed package');

  -- Per visit: a visit already delivered can still be settled after the package is cancelled (R-17: no refunds).
  v := public.sell_package(a, c, 'ZZ Pay PVC', 3, 'per_visit', null, 400);
  pvc := (v ->> 'package_id')::uuid;
  s_pvc := (public.attach_package_session(a, pvc, pg_temp.g('appt_11')) ->> 'session_id')::uuid;
  update public.appointments set status = 'completed' where id = pg_temp.g('appt_11');
  perform public.cancel_package(a, pvc, 'stopped');
  v := public.record_package_payment(a, pvc, 'per_visit', 400, 'CASH', s_pvc);
  perform pg_temp.check((v ->> 'balance')::numeric = 0, 'per_visit settles a delivered visit on a cancelled package');
  perform pg_temp.expect_sqlstate(
    format('select public.record_package_payment(%L, %L, %L, 0.01, %L, %L)', a, pvc, 'per_visit', 'CASH', s_pvc), '23514', 'per_visit cap on a cancelled package');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (10) The C1 appointments trigger still raises when a payment (recorded through the RPC) pins a completed visit.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
begin
  perform pg_temp.expect_sqlstate(
    format('update public.appointments set status = %L where id = %L', 'booked', pg_temp.g('appt_1')),
    '23514', 'trigger raises when a payment pins the completed visit');
  perform pg_temp.check(
    (select a.status::text from public.appointments a where a.id = pg_temp.g('appt_1')) = 'completed', 'appointment change rolled back');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_1')) = 'completed', 'session unchanged');
  -- A forfeited (resolved) session is never reverted by appointment edits either.
  update public.appointments set status = 'booked' where id = pg_temp.g('appt_2');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_2')) = 'forfeited', 'forfeited session is not reverted');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (10b) Reschedule guard: a linked appointment cannot move past the package's valid_until (22023); status and delete
--       transitions of the trigger keep behaving as in C1 (the C1 probe file covers them; spot-checked here too).
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  v jsonb;
  a uuid := pg_temp.g('a_client');
  c uuid := pg_temp.g('cust_a');
  pe uuid;
  pn uuid;
  v_sid uuid;
begin
  -- Package valid until 2036-01-20; appt_12 is 2036-01-13 (within validity) and gets linked.
  v := public.sell_package(a, c, 'ZZ Pay Resched', 3, 'upfront', 300, null, date '2036-01-20');
  pe := (v ->> 'package_id')::uuid;
  v_sid := (public.attach_package_session(a, pe, pg_temp.g('appt_12')) ->> 'session_id')::uuid;

  -- Within validity (including valid_until itself): allowed, and the session does not change (date-only change).
  update public.appointments set date = date '2036-01-16' where id = pg_temp.g('appt_12');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_12')) = 'scheduled', 'reschedule within validity leaves the session scheduled');
  update public.appointments set date = date '2036-01-20' where id = pg_temp.g('appt_12');
  perform pg_temp.check(
    (select a2.date::date from public.appointments a2 where a2.id = pg_temp.g('appt_12')) = date '2036-01-20',
    'reschedule onto valid_until itself is allowed');
  perform pg_temp.check(
    (select s.status from public.package_sessions s where s.id = v_sid) = 'scheduled' and pg_temp.held(pe) = 1 and pg_temp.consumed(pe) = 0,
    'date-only change does not alter session status or credit');

  -- Past valid_until: rejected 22023 and the appointment keeps its date.
  perform pg_temp.expect_sqlstate(
    format('update public.appointments set date = date %L where id = %L', '2036-01-21', pg_temp.g('appt_12')),
    '22023', 'reschedule past valid_until');
  perform pg_temp.check(
    (select a2.date::date from public.appointments a2 where a2.id = pg_temp.g('appt_12')) = date '2036-01-20',
    'rejected reschedule left the appointment date unchanged');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_12')) = 'scheduled', 'rejected reschedule left the session unchanged');

  -- Date and status changed together: the guard still applies (nothing is half applied).
  perform pg_temp.expect_sqlstate(
    format('update public.appointments set date = date %L, status = %L where id = %L', '2036-02-01', 'cancelled', pg_temp.g('appt_12')),
    '22023', 'reschedule past valid_until together with a status change');
  perform pg_temp.check(
    (select a2.status::text from public.appointments a2 where a2.id = pg_temp.g('appt_12')) = 'booked'
    and pg_temp.session_status(pg_temp.g('appt_12')) = 'scheduled',
    'combined rejected update changed neither status nor session');

  -- Status transitions still work after a date change (cancel -> missed_pending -> un-cancel -> scheduled).
  update public.appointments set status = 'cancelled' where id = pg_temp.g('appt_12');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_12')) = 'missed_pending', 'cancel still opens a decision');
  update public.appointments set status = 'booked' where id = pg_temp.g('appt_12');
  perform pg_temp.check(pg_temp.session_status(pg_temp.g('appt_12')) = 'scheduled', 'un-cancel still reverts');

  -- Soft delete is not blocked by the guard and still voids a scheduled link.
  update public.appointments set deleted_at = now() where id = pg_temp.g('appt_12');
  perform pg_temp.check(
    (select s.status from public.package_sessions s where s.id = v_sid) = 'voided', 'soft delete still voids a scheduled link');

  -- A package without an expiry never blocks a reschedule.
  v := public.sell_package(a, c, 'ZZ Pay NoExpiry', 3, 'upfront', 300);
  pn := (v ->> 'package_id')::uuid;
  perform public.attach_package_session(a, pn, pg_temp.g('appt_9'));
  update public.appointments set date = date '2040-01-01' where id = pg_temp.g('appt_9');
  perform pg_temp.check(
    (select a2.date::date from public.appointments a2 where a2.id = pg_temp.g('appt_9')) = date '2040-01-01'
    and pg_temp.session_status(pg_temp.g('appt_9')) = 'scheduled',
    'reschedule on a package without valid_until is unaffected');

  -- An unlinked appointment is unaffected by the date guard.
  update public.appointments set date = date '2041-05-05' where id = pg_temp.g('appt_13');
  perform pg_temp.check(
    (select a2.date::date from public.appointments a2 where a2.id = pg_temp.g('appt_13')) = date '2041-05-05',
    'reschedule of an unlinked appointment is unaffected');

  -- After a detach the appointment is free again (voided link is not live).
  perform public.detach_package_session(a, (select s.id from public.package_sessions s where s.appointment_id = pg_temp.g('appt_9') and s.status = 'scheduled'));
  update public.appointments set date = date '2042-01-01' where id = pg_temp.g('appt_9');
  perform pg_temp.check(
    (select a2.date::date from public.appointments a2 where a2.id = pg_temp.g('appt_9')) = date '2042-01-01',
    'a detached appointment moves freely');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (11) Deterministic random walk: paid never exceeds the total; balance never negative; ledger invariants hold.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  v jsonb;
  a uuid := pg_temp.g('a_client');
  pr uuid;
  v_amt numeric;
  v_rejected integer := 0;
  v_left numeric;
  i integer;
begin
  perform setseed(0.2026);
  v := public.sell_package(a, pg_temp.g('cust_a'), 'ZZ Pay Walk', 1, 'upfront', 123.45);
  pr := (v ->> 'package_id')::uuid;

  for i in 1..80 loop
    v_amt := round((random() * 60)::numeric + 0.01, 2);
    begin
      perform public.record_package_payment(a, pr, 'upfront', v_amt, 'CASH');
    exception when sqlstate '23514' then
      v_rejected := v_rejected + 1;
    end;
    perform pg_temp.check(pg_temp.paid(pr) <= 123.45, 'random walk: paid never exceeds the total (step ' || i || ')');
  end loop;
  perform pg_temp.check(v_rejected > 0, 'random walk exercised the overpayment path');

  v_left := 123.45 - pg_temp.paid(pr);
  if v_left > 0 then
    perform public.record_package_payment(a, pr, 'upfront', v_left, 'CASH');
  end if;
  perform pg_temp.check(pg_temp.paid(pr) = 123.45, 'random walk ends at exactly the total');

  -- Invariants over every package of tenant A created by this script (and any other on the tenant).
  perform pg_temp.check(
    not exists (
      select 1 from public.customer_packages p
       where p.client_id = a
         and ((p.payment_plan <> 'per_visit' and pg_temp.paid(p.id) > p.price_total)
           or (p.payment_plan = 'per_visit' and pg_temp.paid(p.id) > pg_temp.accrued(p.id)))),
    'paid never exceeds the total (upfront, installments) or accrued (per_visit) on any package');
  perform pg_temp.check(
    not exists (
      select 1 from public.customer_packages p
       where p.client_id = a and pg_temp.consumed(p.id) + pg_temp.held(p.id) > p.sessions_total),
    'consumed + held never exceeds sessions_total');
  perform pg_temp.check(
    not exists (
      select 1 from public.package_installments i join public.customer_packages p on p.id = i.package_id
       where i.client_id = a group by p.id, p.price_total having sum(i.amount) <> p.price_total),
    'every installment schedule adds up to its price_total');
  perform pg_temp.check(
    not exists (select 1 from public.package_payments pp where pp.client_id = a and pp.amount <= 0),
    'no non-positive payment exists');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (12) Direct writes on the money tables are denied for authenticated (no grant), whatever the row.
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  a uuid := pg_temp.g('a_client');
  v_table text;
begin
  foreach v_table in array array['package_payments', 'package_installments'] loop
    perform pg_temp.expect_sqlstate(format('insert into public.%I (client_id) values (%L)', v_table, a), '42501', 'direct insert ' || v_table);
    perform pg_temp.expect_sqlstate(format('update public.%I set client_id = client_id', v_table), '42501', 'direct update ' || v_table);
    perform pg_temp.expect_sqlstate(format('delete from public.%I', v_table), '42501', 'direct delete ' || v_table);
  end loop;
  perform pg_temp.expect_sqlstate(
    'update public.package_payments set idempotency_key = null', '42501', 'direct update of the idempotency key');
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- (13) ANON: no payment RPC, no money table.
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
    format('select public.record_package_payment(%L, %L, %L, 1, %L)', a, pg_temp.g('pu2'), 'upfront', 'CASH'), '42501', 'anon record payment');
  perform pg_temp.expect_sqlstate(
    format('select public.cancel_package(%L, %L)', a, pg_temp.g('pu2')), '42501', 'anon cancel');
  perform pg_temp.expect_sqlstate(
    format('select public.sell_package(%L, %L, %L, 1, %L, 10)', a, pg_temp.g('cust_a'), 'ZZ x', 'upfront'), '42501', 'anon sell');
  foreach v_table in array array['package_payments', 'package_installments'] loop
    perform pg_temp.expect_sqlstate(format('select count(*) from public.%I', v_table), '42501', 'anon read ' || v_table);
    perform pg_temp.expect_sqlstate(format('insert into public.%I (client_id) values (%L)', v_table, a), '42501', 'anon insert ' || v_table);
  end loop;
end
$$;

reset role;
select 'ALL PASS' as result;

rollback;
