-- Scheduling Wave 3 (quick-261114-22k, plan C2, Task 7, D-06): package payments.
-- Replaces the sell_package BODY (same signature, never an overload), adds record_package_payment and
-- cancel_package, and replaces the appointments trigger function with a reschedule-past-expiry guard. Adds package_payments.idempotency_key plus its partial unique index. Idempotent: every statement
-- is create or replace / if not exists, so the whole file is safe to re-apply.
-- STATUS: authored but NOT yet applied to live. Run by hand in the Supabase SQL Editor with these exact contents
-- (never the CLI push: the live migration table does not list repo files).
--
-- APPLY ORDER (Wave 3 payments): after 20261120_packages_schema.sql and 20261120_packages_rpcs.sql, before deploying
-- the C2 code, and BEFORE 20261120_packages_tab_access.sql if that has not been applied yet.
--   !! 20261120_packages_rpcs.sql still contains the C1 (upfront only) sell_package body. Re-applying that file later
--   !! silently puts the C1 body back. Whenever 20261120_packages_rpcs.sql is re-applied, re-apply THIS file after it.
--   !! supabase/tests/20261120_packages_payment_probes.sql fails loudly (installments sale) if the C1 body is live.
--
-- Security model: identical to C1 (R-10, 2026-11-20). SECURITY DEFINER, search_path = '', every object schema-qualified,
-- first statement public.package_assert_tenant(p_client_id) (signed in AND owns the client, else 42501; the parameter is
-- never trusted alone), every lookup also carries client_id = p_client_id, execute revoked from public and anon then
-- granted to authenticated. package_payments and package_installments keep NO browser write grant.
--
-- Lock order (same as C1): appointment row first where an appointment is involved (these RPCs touch none), then the
-- per-package advisory lock public.package_lock(package_id), then package / session / payment rows. The package
-- existence check runs BEFORE the advisory lock so a caller can never lock another tenant's package id.
--
-- Reschedule guard (user decision 2026-11-20): section (e) replaces the appointments trigger function (same body as C1
-- plus a date check) and recreates the trigger on status, deleted_at AND date. Re-applying 20261120_packages_rpcs.sql
-- puts the C1 trigger (no date guard) back, so re-apply THIS file after it, exactly as for sell_package.
--
-- Money rules (numeric(12,2) in SQL; the TypeScript side compares integer paise):
--   * plan prices: upfront and installments need price_total (0..99,999,999.99, two decimals; installments need > 0);
--     per_visit needs price_per_session > 0 and no price_total. Wrong-plan prices are rejected (22023).
--   * installments: a jsonb array of {due_on, amount}; count 1..120, amount number > 0 with two decimals, due_on
--     yyyy-mm-dd between today - 366 and today + 3660, non-decreasing in order (seq = array order), and the amounts
--     must add up EXACTLY to price_total (22023). Everything is validated before any row is written.
--   * initial payment (upfront and installments only): {amount, method, note?}, amount > 0, <= price_total (23514 when
--     above), method in CASH/UPI/CARD/OTHER. It is written in the same transaction as the package, so a rejected
--     schedule or payment leaves nothing behind. Per-visit plans reject it (nothing is owed at sale time).
--   * kind must match the plan: upfront -> upfront, installments -> installment, per_visit -> per_visit (22023).
--   * upfront / installments: total paid may never exceed price_total (23514). No session_id allowed.
--   * per_visit: the payment pins ONE consumed session of that package that is owed: completed, or forfeited AND
--     charge_on_forfeit is true (a forfeited session with charge_on_forfeit false, a rolled over, scheduled, undecided
--     or voided session accrues nothing: 22023). Payments pinned to one session may never exceed price_per_session
--     (23514). This per-session cap is stricter than "paid <= accrued" on purpose: it makes paid <= accrued an
--     invariant even when an unpaid completed visit is later corrected back to booked (the C1 trigger already blocks
--     that correction for a visit that carries a payment), so a balance can never go negative.
--     accrued = price_per_session x (completed + forfeited where charge_on_forfeit is true); balance = accrued - paid.
--   * cancelled packages accept only per_visit payments (to settle visits already delivered); upfront and installments
--     payments on a cancelled package are rejected (22023). No refund kind exists (R-17).
--   * cancel_package voids open sessions (scheduled, missed_pending), sets cancelled_at / cancel_reason, never deletes
--     payments or consumed sessions. Completed and already cancelled packages cannot be cancelled (22023).
--
-- Idempotency (record_package_payment): the optional trailing p_idempotency_key is part of the FINAL signature from day
-- one. Backed by the unique index package_payments_client_idem_uniq on (client_id, idempotency_key) where not null.
-- Under the package lock, a retry with the same key and the same package, kind, amount, method and session returns the
-- EXISTING row (replayed = true) before any balance check, so a retry after a payment that exactly reached the total
-- still succeeds without charging twice. The same key with different details raises 23505. Keys are scoped per tenant.
-- A blank key counts as no key. sell_package has no key: its initial payment is atomic with the new package.
--
-- Error contract (mapped in src/lib/package-queries.ts): 42501 not allowed, P0002 not found, 22023 invalid input,
-- 23505 duplicate (already linked / key reuse), 23514 capacity, amount above the balance, or blocked by a payment.

-- ===========================================================================
-- (a) Idempotency column and index (ALTER ... IF NOT EXISTS; no table rewrite, nullable)
-- ===========================================================================
alter table public.package_payments
  add column if not exists idempotency_key text
  check (idempotency_key is null or length(idempotency_key) between 1 and 100);

create unique index if not exists package_payments_client_idem_uniq
  on public.package_payments (client_id, idempotency_key)
  where idempotency_key is not null;

-- ===========================================================================
-- (b) sell_package: same signature as C1, new body (all three plans, schedule, atomic initial payment)
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
  v_has_schedule boolean := p_installments is not null and jsonb_typeof(p_installments) <> 'null';
  v_has_initial boolean := p_initial_payment is not null and jsonb_typeof(p_initial_payment) <> 'null';
  v_elem jsonb;
  v_ord integer;
  v_count integer := 0;
  v_sum numeric := 0;
  v_amt numeric;
  v_due date;
  v_prev date;
  v_pay_amount numeric;
  v_pay_method text;
  v_pay_note text;
  v_pay_kind text;
  v_payment_id uuid;
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

  -- Plan-specific price rules (the table CHECK repeats the plan / price pairing as a second barrier).
  if p_payment_plan = 'per_visit' then
    if p_price_per_session is null
       or p_price_per_session <= 0
       or p_price_per_session > 99999999.99
       or p_price_per_session <> round(p_price_per_session, 2)
       or p_price_total is not null then
      raise exception 'Invalid price' using errcode = '22023';
    end if;
  else
    if p_price_total is null
       or p_price_total < 0
       or p_price_total > 99999999.99
       or p_price_total <> round(p_price_total, 2)
       or p_price_per_session is not null then
      raise exception 'Invalid price' using errcode = '22023';
    end if;
  end if;

  -- One day of slack for clinic time zones ahead of the database clock; at most about ten years ahead.
  if p_valid_until is not null and (p_valid_until < current_date - 1 or p_valid_until > current_date + 3660) then
    raise exception 'Invalid validity' using errcode = '22023';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Invalid note' using errcode = '22023';
  end if;

  -- Installment schedule: required for installments, forbidden for the other plans. Validated in full before any write.
  if p_payment_plan = 'installments' then
    if not v_has_schedule or jsonb_typeof(p_installments) <> 'array' then
      raise exception 'Invalid installments' using errcode = '22023';
    end if;
    if p_price_total <= 0 then
      raise exception 'Invalid price' using errcode = '22023';
    end if;
    if jsonb_array_length(p_installments) not between 1 and 120 then
      raise exception 'Invalid installments' using errcode = '22023';
    end if;

    for v_elem, v_ord in
      select e.value, e.ordinality::integer
        from jsonb_array_elements(p_installments) with ordinality as e(value, ordinality)
       order by e.ordinality
    loop
      if jsonb_typeof(v_elem) <> 'object'
         or jsonb_typeof(v_elem -> 'amount') is distinct from 'number'
         or jsonb_typeof(v_elem -> 'due_on') is distinct from 'string'
         or (v_elem ->> 'due_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Invalid installments' using errcode = '22023';
      end if;

      v_amt := (v_elem ->> 'amount')::numeric;
      if v_amt <= 0 or v_amt > 99999999.99 or v_amt <> round(v_amt, 2) then
        raise exception 'Invalid installments' using errcode = '22023';
      end if;

      begin
        v_due := (v_elem ->> 'due_on')::date;
      exception when others then
        raise exception 'Invalid installments' using errcode = '22023';
      end;
      if v_due < current_date - 366 or v_due > current_date + 3660 then
        raise exception 'Invalid installments' using errcode = '22023';
      end if;
      if v_prev is not null and v_due < v_prev then
        raise exception 'Invalid installments' using errcode = '22023';
      end if;

      v_prev := v_due;
      v_sum := v_sum + v_amt;
      v_count := v_ord;
    end loop;

    if v_sum <> p_price_total then
      raise exception 'Invalid installments' using errcode = '22023';
    end if;
  elsif v_has_schedule then
    raise exception 'Invalid installments' using errcode = '22023';
  end if;

  -- Initial payment: parsed and bounded before the package exists.
  if v_has_initial then
    if p_payment_plan = 'per_visit' or jsonb_typeof(p_initial_payment) <> 'object' then
      raise exception 'Invalid initial payment' using errcode = '22023';
    end if;
    if jsonb_typeof(p_initial_payment -> 'amount') is distinct from 'number'
       or jsonb_typeof(p_initial_payment -> 'method') is distinct from 'string' then
      raise exception 'Invalid initial payment' using errcode = '22023';
    end if;

    v_pay_amount := (p_initial_payment ->> 'amount')::numeric;
    v_pay_method := p_initial_payment ->> 'method';
    if v_pay_amount <= 0 or v_pay_amount > 99999999.99 or v_pay_amount <> round(v_pay_amount, 2) then
      raise exception 'Invalid initial payment' using errcode = '22023';
    end if;
    if v_pay_method not in ('CASH', 'UPI', 'CARD', 'OTHER') then
      raise exception 'Invalid initial payment' using errcode = '22023';
    end if;
    -- jsonb_typeof is NULL when the key is missing, so only a present non-string note is rejected.
    if jsonb_typeof(p_initial_payment -> 'note') not in ('string', 'null') then
      raise exception 'Invalid initial payment' using errcode = '22023';
    end if;
    v_pay_note := nullif(btrim(coalesce(p_initial_payment ->> 'note', '')), '');
    if v_pay_note is not null and length(v_pay_note) > 500 then
      raise exception 'Invalid initial payment' using errcode = '22023';
    end if;
    if v_pay_amount > p_price_total then
      raise exception 'Amount exceeds the balance' using errcode = '23514';
    end if;
    v_pay_kind := case when p_payment_plan = 'upfront' then 'upfront' else 'installment' end;
  end if;

  insert into public.customer_packages (
    client_id, customer_id, template_id, name_snapshot, sessions_total, payment_plan,
    price_total, price_per_session, valid_until, status, note, created_by
  )
  values (
    p_client_id, p_customer_id, p_template_id, v_name, p_sessions_total, p_payment_plan,
    p_price_total, p_price_per_session, p_valid_until, 'active', v_note, auth.uid()
  )
  returning id into v_package_id;

  if p_payment_plan = 'installments' then
    insert into public.package_installments (client_id, package_id, seq, due_on, amount)
    select p_client_id, v_package_id, e.ordinality::integer, (e.value ->> 'due_on')::date, (e.value ->> 'amount')::numeric
      from jsonb_array_elements(p_installments) with ordinality as e(value, ordinality);
  end if;

  if v_has_initial then
    insert into public.package_payments (client_id, package_id, kind, amount, method, note, recorded_by)
    values (p_client_id, v_package_id, v_pay_kind, v_pay_amount, v_pay_method, v_pay_note, auth.uid())
    returning id into v_payment_id;
  end if;

  return jsonb_build_object(
    'package_id', v_package_id,
    'status', 'active',
    'payment_id', v_payment_id,
    'installments', v_count
  );
end
$$;

-- ===========================================================================
-- (c) record_package_payment: FINAL signature (optional trailing parameters only from here on)
-- ===========================================================================
create or replace function public.record_package_payment(
  p_client_id uuid,
  p_package_id uuid,
  p_kind text,
  p_amount numeric,
  p_method text,
  p_session_id uuid default null,
  p_note text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_key text;
  v_plan text;
  v_status text;
  v_price_total numeric;
  v_price_per numeric;
  v_paid numeric;
  v_chargeable integer;
  v_accrued numeric;
  v_existing public.package_payments%rowtype;
  v_payment_id uuid;
  v_sess_status text;
  v_sess_charge boolean;
  v_sess_paid numeric;
begin
  perform public.package_assert_tenant(p_client_id);

  if p_package_id is null then
    raise exception 'Package not found' using errcode = 'P0002';
  end if;
  if p_kind is null or p_kind not in ('upfront', 'installment', 'per_visit') then
    raise exception 'Invalid payment kind' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 99999999.99 or p_amount <> round(p_amount, 2) then
    raise exception 'Invalid amount' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('CASH', 'UPI', 'CARD', 'OTHER') then
    raise exception 'Invalid method' using errcode = '22023';
  end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Invalid note' using errcode = '22023';
  end if;
  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  if v_key is not null and length(v_key) > 100 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  -- Existence for THIS tenant first, so the advisory lock below can never be taken on another tenant's package id.
  perform 1
    from public.customer_packages p
   where p.id = p_package_id
     and p.client_id = p_client_id;
  if not found then
    raise exception 'Package not found' using errcode = 'P0002';
  end if;

  perform public.package_lock(p_package_id);

  select p.payment_plan, p.status, p.price_total, p.price_per_session
    into v_plan, v_status, v_price_total, v_price_per
    from public.customer_packages p
   where p.id = p_package_id
     and p.client_id = p_client_id
   for update;

  select coalesce(sum(pp.amount), 0)
    into v_paid
    from public.package_payments pp
   where pp.client_id = p_client_id
     and pp.package_id = p_package_id;

  select count(*)
    into v_chargeable
    from public.package_sessions s
   where s.client_id = p_client_id
     and s.package_id = p_package_id
     and (s.status = 'completed' or (s.status = 'forfeited' and s.charge_on_forfeit is true));
  v_accrued := v_chargeable * coalesce(v_price_per, 0);

  -- Replay BEFORE any balance check: a retry of a payment that reached the total must still succeed.
  if v_key is not null then
    select pp.*
      into v_existing
      from public.package_payments pp
     where pp.client_id = p_client_id
       and pp.idempotency_key = v_key;
    if found then
      if v_existing.package_id = p_package_id
         and v_existing.kind = p_kind
         and v_existing.amount = p_amount
         and v_existing.method = p_method
         and v_existing.session_id is not distinct from p_session_id then
        return jsonb_build_object(
          'payment_id', v_existing.id,
          'package_id', p_package_id,
          'kind', v_existing.kind,
          'amount', v_existing.amount,
          'paid_total', v_paid,
          'balance', case when v_plan = 'per_visit' then v_accrued - v_paid else v_price_total - v_paid end,
          'replayed', true
        );
      end if;
      raise exception 'Idempotency key already used' using errcode = '23505';
    end if;
  end if;

  if v_status = 'cancelled' and v_plan <> 'per_visit' then
    raise exception 'Package is cancelled' using errcode = '22023';
  end if;

  if p_kind <> case v_plan when 'upfront' then 'upfront' when 'installments' then 'installment' else 'per_visit' end then
    raise exception 'Payment kind does not match the plan' using errcode = '22023';
  end if;

  if v_plan = 'per_visit' then
    if p_session_id is null then
      raise exception 'Session is required' using errcode = '22023';
    end if;

    select s.status, s.charge_on_forfeit
      into v_sess_status, v_sess_charge
      from public.package_sessions s
     where s.id = p_session_id
       and s.client_id = p_client_id
       and s.package_id = p_package_id
     for update;
    if not found then
      raise exception 'Session not found' using errcode = 'P0002';
    end if;
    if not (v_sess_status = 'completed' or (v_sess_status = 'forfeited' and v_sess_charge is true)) then
      raise exception 'This session is not chargeable' using errcode = '22023';
    end if;

    select coalesce(sum(pp.amount), 0)
      into v_sess_paid
      from public.package_payments pp
     where pp.client_id = p_client_id
       and pp.session_id = p_session_id;
    if v_sess_paid + p_amount > v_price_per then
      raise exception 'Amount exceeds the balance' using errcode = '23514';
    end if;
  else
    if p_session_id is not null then
      raise exception 'Session not allowed for this plan' using errcode = '22023';
    end if;
    if v_paid + p_amount > v_price_total then
      raise exception 'Amount exceeds the balance' using errcode = '23514';
    end if;
  end if;

  begin
    insert into public.package_payments (
      client_id, package_id, kind, amount, method, session_id, note, idempotency_key, recorded_by
    )
    values (p_client_id, p_package_id, p_kind, p_amount, p_method, p_session_id, v_note, v_key, auth.uid())
    returning id into v_payment_id;
  exception when unique_violation then
    -- Only the idempotency index can fire here: the same key raced in on another package of this tenant.
    raise exception 'Idempotency key already used' using errcode = '23505';
  end;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'package_id', p_package_id,
    'kind', p_kind,
    'amount', p_amount,
    'paid_total', v_paid + p_amount,
    'balance', case when v_plan = 'per_visit' then v_accrued - (v_paid + p_amount) else v_price_total - (v_paid + p_amount) end,
    'replayed', false
  );
end
$$;

-- ===========================================================================
-- (d) cancel_package: voids open sessions, keeps every payment and consumed session
-- ===========================================================================
create or replace function public.cancel_package(
  p_client_id uuid,
  p_package_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_status text;
  v_voided integer;
begin
  perform public.package_assert_tenant(p_client_id);

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'Invalid note' using errcode = '22023';
  end if;

  if p_package_id is null then
    raise exception 'Package not found' using errcode = 'P0002';
  end if;
  perform 1
    from public.customer_packages p
   where p.id = p_package_id
     and p.client_id = p_client_id;
  if not found then
    raise exception 'Package not found' using errcode = 'P0002';
  end if;

  perform public.package_lock(p_package_id);

  select p.status
    into v_status
    from public.customer_packages p
   where p.id = p_package_id
     and p.client_id = p_client_id
   for update;

  if v_status = 'cancelled' then
    raise exception 'Package is already cancelled' using errcode = '22023';
  end if;
  if v_status = 'completed' then
    raise exception 'Completed packages cannot be cancelled' using errcode = '22023';
  end if;

  update public.package_sessions s
     set status = 'voided',
         voided_at = now()
   where s.client_id = p_client_id
     and s.package_id = p_package_id
     and s.status in ('scheduled', 'missed_pending');
  get diagnostics v_voided = row_count;

  update public.customer_packages p
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = v_reason
   where p.id = p_package_id
     and p.client_id = p_client_id;

  return jsonb_build_object('package_id', p_package_id, 'status', 'cancelled', 'voided_sessions', v_voided);
end
$$;

-- ===========================================================================
-- (e) Appointments trigger: same body as C1 plus a reschedule guard (user decision 2026-11-20)
-- ===========================================================================
-- Rescheduling a package-linked appointment past the package's valid_until is rejected (22023, message 'Package
-- expired for this appointment date', the same text attach_package_session uses). The check runs only when the date
-- changed, the appointment is not being soft-deleted, and a live (non-voided) session links it to a package that has
-- a valid_until. A null new date counts as expired for a package with an expiry (same rule as attach). Everything else
-- is the C1 body unchanged: a date-only change never alters session status, status and delete transitions behave as
-- before, lock order is appointment row (held by the UPDATE), then the package lock, then the session row.
-- The trigger is recreated idempotently and now fires on status, deleted_at and date.
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
  v_valid_until date;
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

  -- Reschedule guard: the package lock is held before the package row is read.
  if new.deleted_at is null and old.date is distinct from new.date then
    select p.valid_until
      into v_valid_until
      from public.customer_packages p
     where p.id = v_package_id
       and p.client_id = new.client_id;
    if v_valid_until is not null and (new.date is null or new.date::date > v_valid_until) then
      raise exception 'Package expired for this appointment date' using errcode = '22023';
    end if;
  end if;

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
after update of status, deleted_at, date on public.appointments
for each row
when (old.status is distinct from new.status
      or old.deleted_at is distinct from new.deleted_at
      or old.date is distinct from new.date)
execute function public.appointments_package_session_sync();

-- ===========================================================================
-- (f) Privileges: live default privileges hand new functions to anon, so revoke explicitly.
-- ===========================================================================
revoke all on function public.sell_package(uuid, uuid, text, integer, text, numeric, numeric, date, uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.sell_package(uuid, uuid, text, integer, text, numeric, numeric, date, uuid, jsonb, jsonb, text) to authenticated;

revoke all on function public.record_package_payment(uuid, uuid, text, numeric, text, uuid, text, text) from public, anon;
grant execute on function public.record_package_payment(uuid, uuid, text, numeric, text, uuid, text, text) to authenticated;

revoke all on function public.cancel_package(uuid, uuid, text) from public, anon;
grant execute on function public.cancel_package(uuid, uuid, text) to authenticated;

-- The trigger function stays callable by no API role (same as C1).
revoke all on function public.appointments_package_session_sync() from public, anon, authenticated;

-- ===========================================================================
-- Read-only verification queries (run against live; SELECT only)
-- ===========================================================================
-- (a) Function exposure: prosecdef true, proconfig search_path="", anon_exec false, authenticated_exec true.
-- select p.proname, p.prosecdef, p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('sell_package', 'record_package_payment', 'cancel_package')
--  order by p.proname;
--
-- (b) No overloads (expect one row per name, count 1).
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace
--    and proname in ('sell_package', 'record_package_payment', 'cancel_package') group by proname order by proname;
--
-- (c) The C2 sell_package body is live (expect true; false means the C1 body was re-applied: re-run this file).
-- select pg_get_functiondef('public.sell_package(uuid,uuid,text,integer,text,numeric,numeric,date,uuid,jsonb,jsonb,text)'::regprocedure)
--        like '%Invalid installments%' as c2_body_live;
--
-- (d) Idempotency column and partial unique index.
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'package_payments' and column_name = 'idempotency_key';
-- select indexdef from pg_indexes where schemaname = 'public' and indexname = 'package_payments_client_idem_uniq';
--
-- (e) Behaviour, cross-tenant and anon probes: supabase/tests/20261120_packages_payment_probes.sql (one rolled-back
--     transaction; ends with ALL PASS). One-file dry run: supabase/tests/20261120_packages_all_dryrun.sql.

-- ===========================================================================
-- Rollback (commented; run by hand only if needed). Payments already recorded stay in the table.
-- Re-applying 20261120_packages_rpcs.sql restores the C1 sell_package body AND the C1 trigger (no reschedule guard).
-- ===========================================================================
-- drop function if exists public.cancel_package(uuid, uuid, text);
-- drop function if exists public.record_package_payment(uuid, uuid, text, numeric, text, uuid, text, text);
-- To go back to the C1 sell_package body, re-apply supabase/migrations/20261120_packages_rpcs.sql.
-- drop index if exists public.package_payments_client_idem_uniq;
-- alter table public.package_payments drop column if exists idempotency_key;
