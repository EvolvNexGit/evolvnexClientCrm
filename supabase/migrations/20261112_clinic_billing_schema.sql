-- Phase 3 (doctor billing), migration B: payment constraints, indexes and create_clinic_bill (D-02, D-03, D-04, D-07, D-10).
-- Additive and idempotent. RLS stays enabled; nothing is granted to anon or public.
-- Applied to live by the user in the Supabase SQL Editor with these exact contents
-- (never the CLI push: the live migration table does not list repo files).
-- Apply to live BEFORE deploying code that reads or writes these fields.
-- Run only after migration A has been applied and committed (the enum label Clinic must exist).
-- Live already has the four columns and both foreign keys on public.bills (LF-1, verified 2026-11-10),
-- so the column adds below are recorded no-ops and the foreign keys are added only when missing.
-- Nothing here is evaluated against the Clinic enum literal at DDL time: the CHECK compares the text cast,
-- and the literal appears only inside the function body, which is resolved at run time.

-- (a) Columns already live; recorded here so the repo matches reality.
alter table public.bills add column if not exists payment_mode text;
alter table public.bills add column if not exists payment_status text default 'paid';
alter table public.bills add column if not exists consultation_id uuid;
alter table public.bills add column if not exists appointment_id uuid;

-- (b) Foreign keys only when missing; live keeps its current delete behaviour (no ON DELETE action).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bills'::regclass
       and conname = 'bills_consultation_id_fkey'
  ) then
    alter table public.bills
      add constraint bills_consultation_id_fkey
      foreign key (consultation_id) references public.consultations(id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bills'::regclass
       and conname = 'bills_appointment_id_fkey'
  ) then
    alter table public.bills
      add constraint bills_appointment_id_fkey
      foreign key (appointment_id) references public.appointments(id);
  end if;
end
$$;

-- (c) Payment shape. The 597 legacy rows are paid with a NULL mode and must stay valid, which is why
-- "mode required when paid" is scoped to Clinic rows through the text cast of order_source (D-04).
alter table public.bills drop constraint if exists bills_clinic_payment_chk;
alter table public.bills add constraint bills_clinic_payment_chk check (
  (payment_status is null or payment_status in ('paid', 'unpaid'))
  and (payment_mode is null or payment_mode in ('CASH', 'UPI', 'CARD', 'OTHER'))
  and (
    coalesce(order_source::text, '') <> 'Clinic'
    or (payment_status = 'paid' and payment_mode is not null)
    or (payment_status = 'unpaid' and payment_mode is null)
  )
);

-- (d) One bill per consultation (D-02) and the unpaid list. Plain column predicates only.
create unique index if not exists bills_consultation_id_uniq
  on public.bills (consultation_id)
  where consultation_id is not null;

create index if not exists bills_clinic_unpaid_idx
  on public.bills (client_id, created_at desc)
  where payment_status = 'unpaid';

-- (e) Clinic bill creation. SECURITY INVOKER: the existing bills_*_own and bill_items_*_own policies still apply.
-- allow_menu_read_products lets any authenticated role read other tenants' products (LF-5), so every
-- lookup below carries an explicit client_id = p_client_id predicate. Amounts are computed here from
-- products.price; the caller sends only product_id and quantity (D-03). order_id, order_type and
-- table_number are left to the live trigger and column defaults (D-07, LF-2).
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

-- (f) Live default privileges hand new functions to anon, so revoke explicitly, then grant to authenticated only.
revoke all on function public.create_clinic_bill(uuid, uuid, uuid, jsonb, numeric, text, text) from public, anon;
grant execute on function public.create_clinic_bill(uuid, uuid, uuid, jsonb, numeric, text, text) to authenticated;

-- ===========================================================================
-- Read-only verification queries (run against live; SELECT only)
-- ===========================================================================
-- (a) Function exposure (expect prosecdef false, proconfig search_path=public, anon false, public false, authenticated true).
-- select p.proname,
--        p.prosecdef,
--        p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--        has_function_privilege('public', p.oid, 'execute') as public_exec,
--        has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec
-- from pg_proc p
-- where p.oid = 'public.create_clinic_bill(uuid,uuid,uuid,jsonb,numeric,text,text)'::regprocedure;
--
-- (b) CHECK rejection probe (rolled back; expect SQLSTATE 23514 on bills_clinic_payment_chk).
-- begin;
-- insert into public.bills (client_id, customer_id, total_amount, final_amount, order_source, payment_status, payment_mode)
-- values ('<doctor client id>', '<patient id>', 10, 10, 'Clinic', 'paid', null);
-- rollback;
--
-- (c) Legacy rows still valid (expect paid >= 597, not_paid 0, with_mode 0 on first apply).
-- select count(*) filter (where payment_status = 'paid') as paid,
--        count(*) filter (where payment_status is distinct from 'paid') as not_paid,
--        count(*) filter (where payment_mode is not null) as with_mode
-- from public.bills;
