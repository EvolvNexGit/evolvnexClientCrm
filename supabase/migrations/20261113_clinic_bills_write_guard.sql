-- Phase 3 follow-up (CR-01), migration D: make create_clinic_bill the only writer of Clinic bills.
-- Idempotent. RLS stays enabled; no policy is dropped or loosened; nothing is granted to anon or public.
-- Apply by hand in the Supabase SQL Editor (never the CLI push). Run after migrations A, B and C.
-- Why: bills_*_own and bill_items_*_own are tenant-row policies only, so any signed-in user of a tenant could
-- edit Clinic amounts, flip paid back to unpaid, re-tag a cafe bill as Clinic, or insert Clinic rows with their
-- own prices. Cafe (non-Clinic) bills are not touched by any guard below.
-- Clinic writes are allowed only inside create_clinic_bill, which sets the transaction-local flag app.clinic_rpc.
-- PostgREST exposes only public-schema functions, so a client cannot set that flag.

-- (a) bills: block direct Clinic inserts and deletes; on update allow only unpaid -> paid (with a mode) on Clinic rows.
create or replace function public.bills_clinic_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $g$
begin
  if tg_op = 'INSERT' then
    if new.order_source::text = 'Clinic'
       and coalesce(current_setting('app.clinic_rpc', true), '') <> 'on' then
      raise exception 'Clinic bills are created through create_clinic_bill only' using errcode = '42501';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.order_source::text = 'Clinic' then
      raise exception 'Clinic bills cannot be deleted' using errcode = '42501';
    end if;
    return old;
  else
    if old.order_source::text = 'Clinic' or new.order_source::text = 'Clinic' then
      if (to_jsonb(new) - 'payment_status' - 'payment_mode') is distinct from (to_jsonb(old) - 'payment_status' - 'payment_mode')
         or old.payment_status is distinct from 'unpaid'
         or new.payment_status is distinct from 'paid'
         or new.payment_mode is null then
        raise exception 'Clinic bill is not editable' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;
end
$g$;

drop trigger if exists bills_clinic_guard_trg on public.bills;
create trigger bills_clinic_guard_trg
  before insert or update or delete on public.bills
  for each row execute function public.bills_clinic_guard();

-- (b) bill_items of a Clinic bill: no direct insert, update or delete.
create or replace function public.bill_items_clinic_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $g$
declare
  v_bill uuid;
begin
  v_bill := case when tg_op = 'DELETE' then old.bill_id else new.bill_id end;
  if exists (select 1 from public.bills b where b.id = v_bill and b.order_source::text = 'Clinic')
     and coalesce(current_setting('app.clinic_rpc', true), '') <> 'on' then
    raise exception 'Clinic bill items are not editable' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.bill_id is distinct from old.bill_id
     and exists (select 1 from public.bills b where b.id = old.bill_id and b.order_source::text = 'Clinic') then
    raise exception 'Clinic bill items are not editable' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$g$;

drop trigger if exists bill_items_clinic_guard_trg on public.bill_items;
create trigger bill_items_clinic_guard_trg
  before insert or update or delete on public.bill_items
  for each row execute function public.bill_items_clinic_guard();

-- (c) create_clinic_bill: same body as migration B plus the transaction-local flag around the two inserts.
create or replace function public.create_clinic_bill(
  p_client_id uuid,
  p_customer_id uuid,
  p_consultation_id uuid,
  p_items jsonb,
  p_discount numeric default 0,
  p_payment_status text default 'unpaid',
  p_payment_mode text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_appointment uuid;
  v_valid int;
  v_requested int;
  v_distinct int;
  v_matched int;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_final numeric(12,2);
  v_mode text;
  v_bill_id uuid;
  v_order_id text;
begin
  -- (1) caller must be signed in and own p_client_id
  if auth.uid() is null or p_client_id is null or not public.crm_can_access_client(p_client_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- (2) one message for missing, foreign, mismatched and not-completed consultations
  if p_customer_id is null or p_consultation_id is null then
    raise exception 'Consultation not found or not completed' using errcode = 'P0002';
  end if;

  select c.appointment_id
    into v_appointment
    from public.consultations c
   where c.id = p_consultation_id
     and c.client_id = p_client_id
     and c.patient_id = p_customer_id
     and upper(c.status::text) = 'COMPLETED';
  if not found then
    raise exception 'Consultation not found or not completed' using errcode = 'P0002';
  end if;

  -- (3) patient of the same tenant
  perform 1
    from public.customers cu
   where cu.id = p_customer_id
     and cu.client_id = p_client_id;
  if not found then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  -- (4) items: 1..20 objects of {product_id, quantity 1..99}; every other key (such as price) is never read
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Invalid items' using errcode = '22023';
  end if;

  select count(*)
    into v_valid
    from jsonb_array_elements(p_items) e
   where jsonb_typeof(e) = 'object'
     and jsonb_typeof(e->'product_id') = 'string'
     and (e->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and jsonb_typeof(e->'quantity') = 'number'
     and (case when (e->>'quantity') ~ '^[0-9]{1,2}$' then (e->>'quantity')::int else 0 end) between 1 and 99;
  if v_valid <> jsonb_array_length(p_items) then
    raise exception 'Invalid items' using errcode = '22023';
  end if;

  -- all elements are validated, so the casts below are safe; missing, foreign and inactive products
  -- fail the same way, and duplicate product ids are rejected
  with req as (
    select (e->>'product_id')::uuid as product_id,
           (e->>'quantity')::int as quantity
      from jsonb_array_elements(p_items) e
  )
  select count(*),
         count(distinct req.product_id),
         count(p.id),
         coalesce(sum(round(p.price * req.quantity, 2)), 0)
    into v_requested, v_distinct, v_matched, v_subtotal
    from req
    left join public.products p
      on p.id = req.product_id
     and p.client_id = p_client_id
     and p.is_active;
  if v_distinct <> v_requested or v_matched <> v_requested then
    raise exception 'Invalid items' using errcode = '22023';
  end if;

  -- (6) flat discount between 0 and the subtotal
  if round(coalesce(p_discount, 0), 2) < 0 or round(coalesce(p_discount, 0), 2) > v_subtotal then
    raise exception 'Invalid discount' using errcode = '22023';
  end if;
  v_discount := round(coalesce(p_discount, 0), 2);
  v_final := v_subtotal - v_discount;

  -- (7) payment: paid needs a known mode; unpaid stores no mode whatever was passed
  if coalesce(p_payment_status, '') not in ('paid', 'unpaid') then
    raise exception 'Invalid payment' using errcode = '22023';
  end if;
  if p_payment_status = 'paid' then
    v_mode := upper(btrim(p_payment_mode));
    if v_mode is null or v_mode not in ('CASH', 'UPI', 'CARD', 'OTHER') then
      raise exception 'Invalid payment' using errcode = '22023';
    end if;
  else
    v_mode := null;
  end if;

  -- (8) one bill per consultation: lock, then check (the unique index is the final backstop)
  perform pg_advisory_xact_lock(hashtextextended(p_consultation_id::text, 0));
  if exists (select 1 from public.bills b where b.consultation_id = p_consultation_id) then
    raise exception 'This consultation is already billed' using errcode = '23505';
  end if;

  -- (8b) allow the Clinic write guards below for this transaction only (CR-01)
  perform set_config('app.clinic_rpc', 'on', true);

  -- (9) bill header; the appointment comes from the consultation, never from the caller
  insert into public.bills (
    client_id, customer_id, total_amount, discount, final_amount,
    status, order_source, payment_status, payment_mode, consultation_id, appointment_id
  )
  values (
    p_client_id, p_customer_id, v_subtotal, v_discount, v_final,
    'DELIVERED', 'Clinic', p_payment_status, v_mode, p_consultation_id, v_appointment
  )
  returning id, order_id into v_bill_id, v_order_id;

  -- (10) bill lines priced from products.price (bill_items has no client_id column, LF-3)
  insert into public.bill_items (bill_id, product_id, quantity, price, total)
  select v_bill_id,
         p.id,
         r.quantity,
         p.price,
         round(p.price * r.quantity, 2)
    from (
      select (e->>'product_id')::uuid as product_id,
             (e->>'quantity')::int as quantity
        from jsonb_array_elements(p_items) e
    ) r
    join public.products p
      on p.id = r.product_id
     and p.client_id = p_client_id
     and p.is_active;

  perform set_config('app.clinic_rpc', 'off', true);

  -- (11)
  return jsonb_build_object(
    'bill_id', v_bill_id,
    'order_id', v_order_id,
    'total_amount', v_subtotal,
    'discount', v_discount,
    'final_amount', v_final,
    'payment_status', p_payment_status,
    'payment_mode', v_mode
  );
end
$$;

revoke all on function public.create_clinic_bill(uuid, uuid, uuid, jsonb, numeric, text, text) from public, anon;
grant execute on function public.create_clinic_bill(uuid, uuid, uuid, jsonb, numeric, text, text) to authenticated;

-- Rollback (commented; run by hand only if needed)
-- drop trigger if exists bills_clinic_guard_trg on public.bills;
-- drop trigger if exists bill_items_clinic_guard_trg on public.bill_items;
-- drop function if exists public.bills_clinic_guard();
-- drop function if exists public.bill_items_clinic_guard();
