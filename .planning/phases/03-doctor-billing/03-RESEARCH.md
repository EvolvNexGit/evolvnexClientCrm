# Phase 3: Doctor billing - Research

**Researched:** 2026-11-10
**Domain:** Supabase/Postgres (enum add, new columns, SECURITY INVOKER plpgsql function, RLS), tab registry (`tabs_info` / `client_tab_access`), cafe-vs-clinic isolation in analytics and order alerts, receipt print on the Phase 2 PrintSheet.
**Confidence:** HIGH on in-repo code paths and exclusion points (all files opened this session). MEDIUM on Postgres/Supabase behaviour (official docs). LOW/UNPROBED on live DB state: **no Supabase MCP tool was callable in this research session, so no live SELECT was run.** The exact SELECTs to run first are in "Environment Availability". Every live-state claim below is tagged `[ASSUMED]` until those probes are recorded.

## User Constraints

No `03-CONTEXT.md` exists. Decisions are proposed in "Open Questions" (each with a recommended default). Standing constraints from the request, ROADMAP, REQUIREMENTS and AGENTS.md that the planner must treat as locked:

- Goal (ROADMAP Phase 3): doctor clients bill consult fees from a dedicated `doctor-billing` tab (DB key 015) on the existing `bills` / `bill_items` / `products` tables, print a receipt, never pollute cafe analytics or order alerts.
- Out of scope (REQUIREMENTS): separate invoice table; modifying `create_order_with_inventory`; GST, insurance, packages (CLIN-04); disabling RLS; trusting a client-supplied tenant id.
- Smallest safe change, no new npm dependencies, RLS never disabled, tenant derived from the authenticated user (`crm_can_access_client`), live DB writes are done later by the orchestrator/user, not by the research or planning agent.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BILL-01 | `doctor-billing` tab (DB key 015) assignable per client; doctor client has it instead of Billing | Tab registry contract (4 code files + 1 data migration); disable 004 rather than delete; sequence so 004 is disabled only when the 015 code is live |
| BILL-02 | `bills` records payment mode, paid/unpaid status, links to consultation and appointment; order source `Clinic` exists | `ALTER TYPE ... ADD VALUE` in its own migration; 4 nullable columns + CHECK + FKs + 2 indexes in a second migration |
| BILL-03 | `SECURITY INVOKER` function creates a clinic bill and verifies customer, products, consultation belong to caller's client | `create_clinic_bill` design below (derive appointment from the consult; DB price is authoritative; uniform "not found" for foreign ids) |
| BILL-04 | Receipt prints through the same print mechanism; unpaid list available | `PrintSheet` + `usePrintJob<ClinicReceipt>` + new `ClinicReceiptPrint`; unpaid list = `payment_status = 'UNPAID'` query with a Mark paid action |
| BILL-05 | Clinic bills excluded from cafe summary analytics, active-order lists and order alerts | Four exact exclusion points found (below); final status alone is NOT sufficient |
</phase_requirements>

## Summary

Phase 3 is two small DB changes plus one RPC, one tab registration, one new query module pair, one new tab screen, one receipt component, and four surgical exclusion edits in existing alert/analytics code. No new dependency, no new table. The Phase 2 print stack (`PrintSheet`, `usePrintJob<T>`, `usePrintSettings`, the `@media print` block in `globals.css`) is reusable as-is by adding a `ClinicReceiptPrint` body component.

Three findings contradict or sharpen the roadmap. (1) **A final status does not stop alerts.** Only the list/poll path honors `DELIVERED` (`fetchActiveOrders`). The realtime `INSERT` handler in `use-order-alerts.ts` has no source or status check, and the server push route (`shouldSendOrderPush`) fires for every source that is not `POS`, so a `Clinic` bill would alert and push today. Code guards on `order_source` are required in addition to the final status. (2) **Excluding Clinic by default breaks the doctor's own revenue.** `useDoctorSummary` reads bills through the same `fetchTransactionsSince`; the doctor client currently bills through 004 (source `POS`), so after the switch the doctor summary revenue would silently drop to zero unless the doctor hook opts in to Clinic bills. (3) **There is no consultation fee field anywhere in code** (`ConsultationRecord` has none; `doctor-summary-tab.tsx:362` literally says "no consultation-fee field"), so "fee prefilled" has to come from `products` rows (or a new column; see Open Questions).

Deploy-order is the main operational risk: new enum value and columns must be live before any code that selects or filters on them, because `BILL_TRANSACTION_SELECT` and the alert queries are shared with every cafe client. The plan recommends a JS-side `isClinicOrderSource()` predicate (no DB filter on the enum) so the exclusion code is safe to ship before or after the enum exists.

**Primary recommendation:** Apply in this order: probes, migration A (enum value only), migration B (columns, checks, indexes, `create_clinic_bill`, grants), ship code (exclusion guards first, then query layer, tab, receipt), then migration C last (register tab 015, enable it for the doctor client, disable 004) at the moment the 015 code is live.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tenant ownership checks (customer, products, consultation) | Database (INVOKER function + RLS) | Browser (passes `clientId`, never trusted) | `crm_can_access_client(p_client_id)` binds the id to `auth.uid()`; function re-checks every referenced row's `client_id` |
| Price, subtotal, discount, final amount | Database (function, `numeric`) | Browser (preview only) | Prices read from `products`, never from the client; server totals are what is stored and printed |
| Receipt number | Database (existing BEFORE INSERT `generate_order_id` trigger) | — | Reuse; function reads it back via `RETURNING` |
| One bill per consultation | Database (partial unique index + advisory lock) | Browser (disable button while saving) | Double-click protection must be in the DB |
| Paid/unpaid state change | Database (table CHECK + RLS) | Browser query module | Mark-paid is a scoped UPDATE |
| Clinic exclusion from cafe numbers and order alerts | Browser query module + alert hook; API route (push) | — | The alerts and analytics run in the browser and in one Route Handler; DB filter would couple to enum deploy order |
| Tab visibility | Database (`tabs_info`, `client_tab_access`) | Browser (`tabs.ts`, `module-navigation.ts`, `dashboard-page.tsx`) | Existing data-driven tab contract |
| Receipt print | Browser (PrintSheet portal, `@page`) | — | Reuse Phase 2; Chrome/Edge only |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.103.0 installed [CITED: AGENTS.md Technology Stack; verified for storage in 02-RESEARCH.md] | `rpc("create_clinic_bill", ...)`, PostgREST reads/updates | Existing data client; same call style as `orderService.createOrder` (`supabase.rpc("create_order_with_inventory", {...})`) |
| Next.js / React / Tailwind | 15.5.15 / 19.2.5 / 3.4.19 [CITED: AGENTS.md] | Tab screen, modal, receipt | Existing |
| `lucide-react` | ^0.511.0 [CITED: AGENTS.md] | `Receipt`, `Printer`, `Wallet` icons (`Receipt` already imported in `module-navigation.ts`) | Existing |

### Supporting
None new. Do NOT add a payments SDK, PDF library, money library (`dinero.js`, `decimal.js`), form library or zod (D-07 precedent: no new dependencies).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `payment_status` / `payment_mode` as `text` + CHECK | New enum types | A second enum means another `ADD VALUE`-style migration risk for every future value; text + CHECK is additive and trivially changeable. Recommended: text + CHECK |
| JS-side `isClinicOrderSource` filter | PostgREST `.or("order_source.is.null,order_source.neq.Clinic")` | A DB-side filter casts the literal to the enum, so before the enum value exists it errors (`invalid input value for enum`) for every cafe client. JS-side filter has no deploy-order coupling and handles NULL sources. (The server push route already filters in code.) |
| Direct scoped `UPDATE` for Mark paid | `mark_clinic_bill_paid` invoker function | Direct update is smaller if `bills` has an UPDATE policy (probe Q6); fall back to the function only if it does not |
| Appointment derived inside the function from the consult | Client passes `p_appointment_id` | Derivation removes a client-supplied id from the trust surface |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed or added in this phase. Gate not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Receptionist (browser, anon key + user JWT)
  |
  |  Consultation tab (Completed row / read-only view)        Doctor Billing tab (key 015)
  |     "Create bill" (only if tabs include doctor-billing)     list: Unpaid | All, Mark paid, Print
  |              \                                             /
  |               v                                           v
  |            ClinicBillModal  (patient + consult prefilled; product lines from `products`;
  |                              discount; payment status + mode; JS preview in integer paise)
  |                    |
  |                    v  supabase.rpc("create_clinic_bill", {p_client_id: useClient().clientId, ...})
  |  ============================ PostgREST (authenticated JWT) ============================
  |                    v
  |   public.create_clinic_bill  [SECURITY INVOKER, search_path=public]
  |     1. auth.uid() not null AND crm_can_access_client(p_client_id)        -> else 42501
  |     2. consultation: same client, same patient, status COMPLETED        -> else "not found"
  |     3. customer: same client, active                                    -> else "not found"
  |     4. pg_advisory_xact_lock(consultation) ; no existing bill for consultation
  |     5. items: jsonb array 1..20, qty 1..99, distinct product ids, each product same client + active
  |     6. totals from products.price (numeric, round 2); 0 <= discount <= subtotal
  |     7. INSERT bills (status DELIVERED, order_source Clinic, payment_*, consultation_id, appointment_id)
  |            -> BEFORE INSERT trigger generate_order_id (SECURITY DEFINER) sets order_id (receipt no)
  |        INSERT bill_items
  |     8. RETURN jsonb {bill_id, order_id, total_amount, discount, final_amount}
  |                    |
  |   RLS on bills / bill_items / customers / consultations / products applies to every statement
  |                    v
  |   fetchClinicBillById -> ClinicReceipt payload -> usePrintJob.requestPrint
  |                    v
  |   <PrintSheet margins={usePrintSettings.margins}><ClinicReceiptPrint/></PrintSheet>  (portal, @page)
  |
  |   Cafe-isolation guards (all keyed on order_source === "Clinic"):
  |     fetchActiveOrders (always) | fetchTransactionsSince (default exclude; doctor summary opts in)
  |     use-order-alerts realtime INSERT handler | /api/notifications/new-order (shouldSendOrderPush)
```

### Recommended Project Structure
```
supabase/migrations/
├── 20261112_bills_order_source_clinic.sql      # A: alter type ... add value only
├── 20261112_clinic_billing_schema.sql          # B: columns, checks, indexes, create_clinic_bill, grants
└── 20261112_doctor_billing_tab.sql             # C: tabs_info 015 + doctor client enablement, disable 004 (applied last)
src/lib/
├── clinic-billing-types.ts      # import-free: constants, ClinicBillRecord/Payload, money helpers (smoke-testable)
├── clinic-billing-queries.ts    # createClinicBill (rpc), fetchClinicBillsPage, fetchClinicBillById, markClinicBillPaid
├── billing-types.ts             # + BILL_ORDER_SOURCE_CLINIC
├── order-alert-policy.ts        # + isClinicOrderSource (shared by browser alerts, route, query filters)
├── billing-queries.ts           # exclusion edits only (fetchActiveOrders, fetchTransactionsSince)
├── tabs.ts, dashboard-tab-routes.ts, module-navigation.ts   # register 015 / doctor-billing
src/hooks/use-clinic-bills.ts    # paged list + create + markPaid bag
src/components/dashboard/
├── tabs/doctor-billing-tab.tsx                  # default export, { clientId }
├── billing/clinic-bill-modal.tsx                # reused from consultation tab and billing tab (named export)
└── print/clinic-receipt-print.tsx               # body-only receipt for PrintSheet
```
Kebab-case, `*-queries.ts` + `*-types.ts` pair, named exports for widgets, default export for the tab [CITED: AGENTS.md Conventions].

### Pattern 1: Tab registration contract (verified files)
Four code touch points plus data. Quoted verbatim:
- `src/lib/tabs.ts:153-168` maps DB keys: `"004": "billing",` `"009": "transaction",` `"014": "consultation",` [VERIFIED: tabs.ts:153-168]. Add `"015": "doctor-billing",`.
- `DEFAULT_TAB_ORDER` (tabs.ts:7-22) lists `"billing",` then `"transaction",`. Add `"doctor-billing"` after `"billing"`. [VERIFIED: tabs.ts:7-22]
- `src/lib/dashboard-tab-routes.ts:13` `billing: "/dashboard/billing",` inside `DASHBOARD_TAB_ROUTES`. Add `"doctor-billing": "/dashboard/doctor-billing",`. [VERIFIED: dashboard-tab-routes.ts:4-34]
- `src/lib/module-navigation.ts:87` `{ id: "billing", label: "Billing", kind: "existing-tab", tabKey: "billing", icon: ShoppingBag },` is in the `pos` module (lines 83-95); CRM module (lines 73-82) holds `consultation`. Add `{ id: "doctor-billing", label: "Billing", kind: "existing-tab", tabKey: "doctor-billing", icon: Receipt }`. Sidebar items are hidden unless the key is in `tabs` (`getSidebarItemsForModule`), so cafe clients are unaffected. [VERIFIED: module-navigation.ts:83-95, 213-231]
- `src/components/dashboard/dashboard-page.tsx`: `const ConsultationTab = dynamic(() => import("./tabs/consultation-tab"), {` (line 63) and render branches `{displayTabKey === "consultation" && <ConsultationTab clientId={clientId} />}` / `{displayTabKey === "billing" && <BillingTab clientId={clientId} />}` (lines 576, 578). Add a `DoctorBillingTab` dynamic import and one render branch. [VERIFIED: dashboard-page.tsx:63-65, 575-592]
- `isSpecialtySummaryTab("doctor-billing")` is false (only `*-summary` keys qualify), so no AI Insights capture. [VERIFIED: tabs.ts:41-48]
- `resolveCodeKey` takes the DB `key` ("015") through `DB_KEY_TO_CODE_KEY`; unknown numeric keys pass through unmapped and the tab would never render. Hence the map entry is mandatory. [VERIFIED: tabs.ts:191-212]
- Stale `localStorage["dashboard-active-tab"] = "billing"` for the doctor user falls through to the default tab once 004 is disabled (`tabs.find` fails); no code needed. [VERIFIED: dashboard-page.tsx:288-297]

### Pattern 2: `create_clinic_bill` (SECURITY INVOKER, tenant-checked)
Draft for the plan to refine once probes Q1-Q5 confirm `bills` / `bill_items` column names and enum labels. Notes follow the code.

```sql
-- Migration B (draft). Columns first.
alter table public.bills add column if not exists payment_mode text;
alter table public.bills add column if not exists payment_status text;
alter table public.bills add column if not exists consultation_id uuid;
alter table public.bills add column if not exists appointment_id uuid;

alter table public.bills drop constraint if exists bills_consultation_id_fkey;
alter table public.bills add constraint bills_consultation_id_fkey
  foreign key (consultation_id) references public.consultations(id) on delete set null;
alter table public.bills drop constraint if exists bills_appointment_id_fkey;
alter table public.bills add constraint bills_appointment_id_fkey
  foreign key (appointment_id) references public.appointments(id) on delete set null;

alter table public.bills drop constraint if exists bills_clinic_payment_chk;
alter table public.bills add constraint bills_clinic_payment_chk check (
  (payment_status is null and payment_mode is null)
  or (payment_status = 'UNPAID' and payment_mode is null)
  or (payment_status = 'PAID' and payment_mode in ('CASH','UPI','CARD','OTHER'))
);

-- text predicates only (no enum literal), so safe in the same transaction as column creation
create unique index if not exists bills_consultation_id_uniq on public.bills (consultation_id) where consultation_id is not null;
create index if not exists bills_clinic_unpaid_idx on public.bills (client_id, created_at desc) where payment_status = 'UNPAID';
create index if not exists bills_appointment_id_idx on public.bills (appointment_id) where appointment_id is not null;

create or replace function public.create_clinic_bill(
  p_client_id uuid, p_customer_id uuid, p_consultation_id uuid,
  p_items jsonb, p_discount numeric default 0,
  p_payment_status text default 'UNPAID', p_payment_mode text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_appointment uuid; v_subtotal numeric(12,2); v_discount numeric(12,2);
  v_final numeric(12,2); v_bill_id uuid; v_order_id text;
  v_requested int; v_matched int; v_mode text;
begin
  if auth.uid() is null or p_client_id is null or not public.crm_can_access_client(p_client_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- uniform message for missing OR foreign ids (no existence oracle)
  select c.appointment_id into v_appointment
    from public.consultations c
   where c.id = p_consultation_id and c.client_id = p_client_id
     and c.patient_id = p_customer_id and upper(c.status::text) = 'COMPLETED';
  if not found then raise exception 'Consultation not found or not completed' using errcode = 'P0002'; end if;

  perform 1 from public.customers cu
   where cu.id = p_customer_id and cu.client_id = p_client_id and cu.is_active;
  if not found then raise exception 'Patient not found' using errcode = 'P0002'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Invalid items' using errcode = '22023';
  end if;

  with req as (
    select (e->>'product_id')::uuid as product_id, (e->>'quantity')::int as quantity
      from jsonb_array_elements(p_items) e)
  select count(*), count(distinct req.product_id) filter (where p.id is not null),
         coalesce(sum(round(p.price * req.quantity, 2)), 0)
    into v_requested, v_matched, v_subtotal
    from req left join public.products p
      on p.id = req.product_id and p.client_id = p_client_id and p.is_active;
  -- sketch: also reject duplicate product ids (count(distinct) <> count(*)) and any quantity
  -- outside 1..99; reject when v_requested <> v_matched -> 'Invalid items' (errcode 22023)

  v_discount := round(coalesce(p_discount, 0), 2);
  if v_discount < 0 or v_discount > v_subtotal then raise exception 'Invalid discount' using errcode = '22023'; end if;
  v_final := v_subtotal - v_discount;

  if p_payment_status not in ('PAID','UNPAID') then raise exception 'Invalid payment status' using errcode = '22023'; end if;
  v_mode := case when p_payment_status = 'PAID' then upper(p_payment_mode) end;  -- CHECK constraint enforces the allowed set

  perform pg_advisory_xact_lock(hashtextextended(p_consultation_id::text, 0));
  if exists (select 1 from public.bills b where b.consultation_id = p_consultation_id) then
    raise exception 'This consultation is already billed' using errcode = '23505';
  end if;

  insert into public.bills (client_id, customer_id, total_amount, discount, final_amount,
                            status, order_source, payment_status, payment_mode, consultation_id, appointment_id)
  values (p_client_id, p_customer_id, v_subtotal, v_discount, v_final,
          'DELIVERED', 'Clinic', p_payment_status, v_mode, p_consultation_id, v_appointment)
  returning id, order_id into v_bill_id, v_order_id;

  insert into public.bill_items (bill_id /*, client_id if the column exists */, product_id, quantity, price, total)
  select v_bill_id, p.id, r.quantity, p.price, round(p.price * r.quantity, 2)
    from (select (e->>'product_id')::uuid as product_id, (e->>'quantity')::int as quantity
            from jsonb_array_elements(p_items) e) r
    join public.products p on p.id = r.product_id and p.client_id = p_client_id;

  return jsonb_build_object('bill_id', v_bill_id, 'order_id', v_order_id,
    'total_amount', v_subtotal, 'discount', v_discount, 'final_amount', v_final);
end $$;

revoke all on function public.create_clinic_bill(uuid, uuid, uuid, jsonb, numeric, text, text) from public, anon;
grant execute on function public.create_clinic_bill(uuid, uuid, uuid, jsonb, numeric, text, text) to authenticated;
```

Design decisions embedded above, with reasons:
- **`SECURITY INVOKER` + explicit checks.** Under INVOKER the existing `*_own` policies already filter every statement, but they are not sufficient alone for products: the Phase 0 migration deliberately leaves `allow_menu_read_products` in place ("allow_menu_read_products remains", [VERIFIED: 20261108_phase0_tighten_rls.sql:45]), which exists so the public menu can read products and may let an authenticated session see other tenants' products. Therefore every lookup also carries an explicit `client_id = p_client_id` predicate. [CITED: Supabase docs "Prefer security invoker, which is also the default"; "definer functions that read per-user data should also check ownership in the function body"]
- **Tenant binding.** `crm_can_access_client(uuid)` is `language sql stable set search_path = public` and checks `clients.crm_user_id = auth.uid()` [VERIFIED: supabase/migrations/20260814_whatsapp_auto_replies.sql:72-84]. `p_client_id` from the browser is only a selector; the function authorizes it against `auth.uid()`.
- **Price and totals from the DB.** The cafe RPC takes `price` in `p_items` from the client (`price: item.unitPrice`, [VERIFIED: orderService.ts:296-300]); the clinic function takes only `product_id` and `quantity`. `numeric(12,2)`, `round(..., 2)` at line level.
- **Appointment derived from the consult** (`v_appointment`), not passed. BILL-02's link is satisfied without a client-supplied id.
- **Advisory lock + unique index.** `pg_advisory_xact_lock` serializes two simultaneous bills for one consultation without needing UPDATE privilege on `consultations` (which `SELECT ... FOR UPDATE` would). The partial unique index is the final backstop; the query layer maps `23505` to "already billed".
- **Status.** `'DELIVERED'` is the only existing final value the code knows: `updateBillStatus` maps to `"PENDING"`, `"ACCEPTED"`, `"DELIVERED"` [VERIFIED: billing-queries.ts:839-845]. Any status other than these three normalizes to `null` in `normalizeBillStatus` and is then treated as ACTIVE (not delivered) by `fetchActiveOrders`, so a "paid"/"completed"-style label would reappear in active orders [VERIFIED: billing-queries.ts:629-640, 812-814, 832-834]. Use `DELIVERED`, subject to probe Q3.
- **`order_type` left NULL** (the cafe client already passes `orderType ?? null` to the RPC [VERIFIED: orderService.ts:295 `p_order_type: orderType ?? null,`]).
- **Return `jsonb`** so `RETURNS TABLE` out-parameter names (`order_id`, `total_amount`) cannot collide with column references inside plpgsql (ambiguity errors). `extractOrderResult`-style parsing already exists in `orderService.ts:50-69`.
- **Grants.** Revoke from `public, anon`, grant `authenticated` only. The same pattern is in the Phase 0 migration lines 67-68 [VERIFIED: 20261108_phase0_tighten_rls.sql:67-68]. Live default privileges hand new public tables to `anon` (Phase 2 probe, [CITED: 02-01-SUMMARY.md "default ACL granted anon/authenticated on new public tables"]); functions are likely the same, so the explicit revoke is mandatory. Supabase docs: "By default, any role can run a database function"; revoke from `public` and the restricted role, then grant back [CITED: supabase.com/docs/guides/database/functions].
- **`search_path = public`** pinned (matches the repo's own pins; Supabase recommends empty path for definer functions, which is not needed for invoker, but all references here are schema-qualified anyway).
- Aggregate-with-CTE block above is a sketch of intent (count requested vs matched, detect duplicates, quantity bounds); the planner/executor should write it as separate checks for readability.

### Pattern 3: Enum value and sequencing
`order_source` is an enum: the cafe RPC signature ends `... public.order_status, text, public.order_source, public.order_type)` [VERIFIED: 20261108_phase0_tighten_rls.sql:67]. Add the label in a file that contains **only** the `ALTER TYPE`:

```sql
-- 20261112_bills_order_source_clinic.sql
alter type public.order_source add value if not exists 'Clinic';
```
Since PostgreSQL 12 `ADD VALUE` may run inside a transaction block, but the new label cannot be used until that transaction commits; using it earlier raises `unsafe use of new value ... of enum type` (hint: new enum values must be committed before they can be used) [CITED: PostgreSQL mailing-list/commit history and Stack Overflow summary via web search, 2026-11-10; official ALTER TYPE page was unreachable this session]. Tooling note: Supabase `apply_migration`, and likely the SQL editor, wrap one call in one transaction, so:
1. Apply migration A as its own call and confirm `select enum_range(null::public.order_source)` contains `Clinic`.
2. Only then apply migration B. B must not use the literal in anything evaluated at DDL time (CHECK, index predicate, default). The sketch above deliberately uses text predicates and only references `'Clinic'` inside the plpgsql function body (resolved at run time).
3. Applying A and B in the same call is the failure mode to avoid. `IF NOT EXISTS` makes A idempotent.
The label spelling `Clinic` comes from ROADMAP success criterion 3; existing labels may be uppercase (`POS` in code: `export const BILL_ORDER_SOURCE_POS = "POS" as const;` [VERIFIED: billing-types.ts:5]). Probe Q3 shows the existing labels; match their style if the user prefers (Open Question 6).

### Pattern 4: Where Clinic bills must be excluded (all verified)

| # | Location | Today (verbatim evidence) | Required change |
|---|----------|--------------------------|-----------------|
| E1 | `fetchActiveOrders` `src/lib/billing-queries.ts:817-835` (feeds `useOrders`, `useOrderAlerts` hydrate and 3 s poll) | Selects all client bills from last 24 h; `.filter((transaction) => !isDeliveredStatus(transaction.status));` | Also `.filter((t) => !isClinicOrderSource(t.order_source))`. Defense in depth over the DELIVERED status |
| E2 | `fetchTransactionsSince` `billing-queries.ts:793-810` (feeds `useCafeSummary` line 40 `fetchTransactionsSince(clientId, sinceIso),` and `useDoctorSummary` line 84 `fetchTransactionsSince(clientId, sinceIso),`) | No source filter | Add `options?: { includeClinic?: boolean }`; default excludes Clinic (JS filter after mapping). `useDoctorSummary` passes `{ includeClinic: true }` or doctor revenue goes to zero (see Pitfall 2) |
| E3 | `use-order-alerts.ts:151-180` realtime handler on `table: "bills"` `event: "INSERT"` | Builds `alertPayload` from `inserted.id`, `table_number`, `final_amount`; no `order_source` or `status` check | `if (isClinicOrderSource(inserted?.order_source)) return;` before building the payload. Realtime `payload.new` for INSERT carries the full row [ASSUMED: default replica identity includes all columns on INSERT] |
| E4 | `src/lib/web-push-server.ts:41-43` `export function shouldSendOrderPush(bill: Record<string, unknown>) { return !isPosOrderSource(bill.order_source); }`, called at `src/app/api/notifications/new-order/route.ts:65-67` (`skipped: "pos_order"`) | Pushes for every non-POS source, so a Clinic bill pushes | `return !isPosOrderSource(s) && !isClinicOrderSource(s)`; route returns `skipped: "clinic_order"` |
| E5 | `mapCustomer` / `CUSTOMER_SELECT` `bills(id, final_amount, created_at)` (billing-queries.ts:79-80, 82-108) | Per-patient `totalSpent` and `totalOrders` count every bill | Decision, not a bug: Clinic bills counting toward a patient's spend is desirable for the doctor client and invisible to cafes (no Clinic bills). Unpaid amounts will be counted as spent (Open Question 9) |
| E6 | `fetchTransactions`, `fetchTransactionsPage` (Transaction tab 009) | All bills | Leave unchanged: the doctor's Transaction tab should list Clinic bills. Optional: show a PAID/UNPAID chip (status badge shows "Delivered") |

The new `isClinicOrderSource` lives beside `isPosOrderSource` in `src/lib/order-alert-policy.ts:63-65` (`return String(orderSource ?? "").trim().toUpperCase() === "POS";` [VERIFIED: order-alert-policy.ts:63-65]), and `BILL_ORDER_SOURCE_CLINIC` beside `BILL_ORDER_SOURCE_POS` in `billing-types.ts`. `web-push-server.ts` already imports from `order-alert-policy`, so a single predicate serves browser and server. Note `use-order-alerts.ts` also lets bills the same browser created via POS be skipped by `isLocalPosOrderId`; the Clinic flow does not call `rememberLocalPosOrderId`, so E3 is the only thing silencing the creating browser.

Two pre-existing facts that interact: `STATE.md` records that `create_order_with_inventory` "ignores `p_order_source` / `p_order_type`" [CITED: STATE.md:108], so cafe POS bills may carry NULL or a default source. Every Clinic guard must be NULL-safe (the predicate above is) and must never be written as a DB `neq`. Also `shouldSendOrderPush` suggests a Supabase Database Webhook calls the route on `bills` INSERT; that config lives in the Supabase dashboard, not in git (probe Q8 looks for the trigger).

### Pattern 5: Receipt through the Phase 2 mechanism
Reuse, do not fork:
- `PrintSheet` takes `margins` and children and portals to `document.body` with `data-print-root`, static `@page { margin: 0; }`, thead/tfoot spacers [VERIFIED: print-sheet.tsx:18-47].
- `usePrintJob<T>()` returns `{ printPayload, requestPrint, clearPrintJob }`; prints one animation frame after commit; clears on `afterprint` and after 60 s [VERIFIED: use-print-job.ts:5-41].
- `usePrintSettings(clientId)` returns `margins` and `ready` (`!loading && error === null`) so print never silently uses default margins [VERIFIED: use-print-settings.ts:51-65]. Disable Print until `ready`, exactly like the consultation tab (`disabled={!activeConsultation || detailLoading || !printSettings.ready}`, [VERIFIED: consultation-tab.tsx:1229]).
- `@media print` rule `body:has(> [data-print-root]) > *:not([data-print-root]) { display: none !important; }` [VERIFIED: globals.css:153-156] only hides the page while a sheet is mounted, so two tabs sharing it is safe.
- Receipt body (explicit black on white, pt sizes, React text nodes only, as in `PrescriptionPrint`): receipt number (`bills.order_id`), date (`formatUtcToIst(created_at)`), patient name, line table (item, qty, rate, amount), subtotal, discount, total, payment status and mode ("PAID - UPI" / "UNPAID"). No clinic header, doctor block or footer (D-06: letterhead pre-printed). Format money with the `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 })` pattern already used in `billing-tab.tsx:14-20` [VERIFIED].
- The print payload is the DB-returned bill re-fetched by id (`fetchClinicBillById`), not the form state, so the receipt always matches what was stored.
- Margin editing stays in the Consultation tab (`PrintSettingsModal` is mounted there). The billing tab should show "Print settings not saved - set margins in Consultations" when `hasSavedSettings` is false rather than duplicate the modal (Open Question 8).

### Pattern 6: Money handling and rounding
- DB: `numeric` everywhere, `round(x, 2)` at line total and discount; `final = subtotal - discount`; CHECK-free but the function guarantees `0 <= discount <= subtotal`, so `final_amount >= 0`.
- Client: never send prices; send `{ product_id, quantity }`. The modal's live preview computes in integer paise (`Math.round(price * 100)`) and formats with `Intl.NumberFormat`; the number shown after save is the RPC return, not the preview.
- No tax lines (GST is CLIN-04, deferred). If the user later wants GST the `bills` columns can be added without touching this function's contract.
- Currency symbol/locale: INR, `en-IN`, 2 decimals, consistent with `billing-tab.tsx`.

### Pattern 7: Receipt numbering
`bills.order_id` is populated by the existing BEFORE INSERT trigger `generate_order_id` (named in the Phase 0 migration: `revoke execute on function public.generate_order_id() from public, anon, authenticated;` [VERIFIED: 20261108_phase0_tighten_rls.sql:78]). Live check on 2026-11-10: it is SECURITY DEFINER with `search_path=public` and no EXECUTE for API roles [CITED: 01-07-SUMMARY.md:76]; that is why an INVOKER insert can still increment `bill_order_counters` (RLS-enabled, "allow counter system access" dropped). The function body (format, per-client or per-day counter, whether it fires for every source) is not in the repo: probe Q4. If the format is cafe-style (daily "#001"), receipts show it; if the user wants a distinct clinic prefix, that needs a trigger change and is out of scope (Open Question 7). Counter rows are updated inside the trigger, so concurrent bills for one client serialize on the counter row (acceptable at clinic volume).

### Anti-Patterns to Avoid
- **Reusing `create_order_with_inventory`.** Out of scope; it is SECURITY DEFINER, takes client-supplied prices, ignores source/type and does not validate ownership [CITED: STATE.md:108; 01-07-SUMMARY.md:76].
- **Trusting the final status to hide Clinic bills** (E3/E4 prove it does not).
- **Filtering with a PostgREST enum literal** before the enum exists, or with `neq` (drops NULL-source rows).
- **Adding columns to the shared `BILL_TRANSACTION_SELECT` before migration B is live**: that select is used by every cafe client (`fetchTransactions*`, `fetchActiveOrders`); a missing column breaks all of them. Use a separate clinic-only select string in `clinic-billing-queries.ts`.
- **Passing `p_appointment_id`, price, or status from the browser.**
- **Printing from form state** instead of the stored bill.
- **Growing `billing-queries.ts`** with clinic logic: new module pair `clinic-billing-*` (AGENTS.md: split a new domain into its own pair).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Receipt numbers | Client-side counter or max()+1 | Existing `generate_order_id` trigger | Counter table is RLS-locked; trigger is definer; race-free |
| Tenant authorization | Route handler that checks tenant then writes with service role | INVOKER function + `crm_can_access_client` + RLS | Constitution: RLS is the boundary, no service role in new code |
| Paper output | PDF library, `window.open` print window | `PrintSheet` + `usePrintJob` | Already built and reviewed in Phase 2 |
| Money arithmetic | Float math in TS | `numeric` in SQL, integer paise for preview | Float drift on 2-decimal currency |
| Double-submit protection | Disabled button only | Advisory lock + partial unique index on `consultation_id` | Two tabs or a retry can both pass a UI check |
| Paged list state | New fetch/pagination plumbing | `usePagedList` + `ListPageResult` | Existing, handles stale responses |
| Modal chrome | New dialog component | `EntityModal` | Existing, mobile-ready |

**Key insight:** every hard part (numbering, tenancy, printing, pagination, modal) already exists; the work is one function, four exclusion guards and wiring, plus getting the deploy order right.

## Runtime State Inventory

Not a rename/refactor phase, but it changes what an existing live client sees and creates live state:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Doctor client's historical bills have source `POS` (billed through 004). They stay as is and keep counting in doctor revenue | None. Do not migrate them to `Clinic` (would alter history and report totals) |
| Live service config | `tabs_info` row key `015` does not exist yet [ASSUMED, probe Q9]; `client_tab_access` rows for 004 and 009 exist for the doctor client [ASSUMED, probe Q10]; a Supabase Database Webhook may POST `bills` INSERTs to `/api/notifications/new-order` [ASSUMED, probe Q8] | Data migration C (insert + one update); webhook needs no change because the route guard (E4) handles Clinic |
| OS-registered state | None - verified by reading the repo; no scheduler/launchd/pm2 involvement | None |
| Secrets/env vars | `ORDER_PUSH_WEBHOOK_SECRET`, VAPID keys used by the push route are unchanged | None |
| Build artifacts | None (no package changes) | None |
| Browser state | `localStorage["dashboard-active-tab"]`, `dashboard-active-module`; `crm-order-alert-*` session keys | None; stale tab key falls back to default (verified above) |

## Common Pitfalls

### Pitfall 1: Code ships before the schema
**What goes wrong:** selecting `payment_status` / `consultation_id`, or filtering on the enum literal, errors for every tenant if the migration is not live. Phase 1 and 2 migrations carry the same warning ("Apply to live BEFORE deploying code that selects these columns", [VERIFIED: supabase/migrations/20261111_print_settings.sql:5]).
**How to avoid:** A then B applied and verified before any code that touches the new columns; exclusion guards are JS-only so they can ship either side. Clinic-only select string.

### Pitfall 2: Doctor revenue disappears
**What goes wrong:** E2 default-exclude without an opt-in zeroes the doctor summary revenue, average bill and hourly revenue, because `buildDoctorSummaryAnalytics` sums `transaction.final_amount` over everything `fetchTransactionsSince` returns [VERIFIED: doctor-summary-analytics.ts:293-295].
**How to avoid:** `useDoctorSummary` passes `{ includeClinic: true }`; add a verification step (doctor summary shows a Clinic bill in revenue).

### Pitfall 3: Unpaid counted as revenue
`final_amount` of an UNPAID Clinic bill would enter doctor revenue and `Avg Bill`. The "Pending Payments" alert only counts `transaction.status === "pending"` [VERIFIED: doctor-summary-analytics.ts:365]; Clinic bills are DELIVERED so unpaid ones never appear there. Needs `payment_status` in the select and a small analytics edit (Open Question 9).

### Pitfall 4: Alerts still fire for Clinic bills
Covered in E3/E4. Warning sign: a beep on the reception browser right after Save, or a push notification. Verify with alerts enabled in a second browser session.

### Pitfall 5: `ADD VALUE` in the same transaction as first use
See Pattern 3. Warning sign: `unsafe use of new value "Clinic" of enum type order_source`.

### Pitfall 6: Wrong NULL handling on a source filter
`order_source <> 'Clinic'` is NULL for NULL sources, dropping those rows. The JS predicate treats NULL as "not Clinic". Cafe POS bills may have NULL/default source (STATE.md).

### Pitfall 7: INSERT ... RETURNING under RLS
The repo already hit "RLS that blocks SELECT after INSERT" on consultations and works around it with client-generated UUIDs [CITED: CONCERNS.md "Consultation nested writes"]. `INSERT INTO bills ... RETURNING id, order_id` requires the SELECT policy to admit the new row. `bills_*_own` policies exist per the Phase 0 migration comment ("`bills_*_own` policies remain", line 41) but their predicates were not read: probe Q5. Fallback: generate `v_bill_id := gen_random_uuid()` and read `order_id` with a separate SELECT, or relax nothing.

### Pitfall 8: Foreign products visible through `allow_menu_read_products`
Explicit `client_id = p_client_id` on every product lookup (done in the draft). Test with a foreign product id: must return "Invalid items", not success.

### Pitfall 9: Trigger side effects on bills / bill_items
Loyalty, inventory deduction or notification triggers written for the cafe flow may fire on a Clinic bill (function `update_customer_loyalty_updated_at` exists, [VERIFIED: phase0 migration:85]; what fires it is unknown). Probe Q7 lists every trigger on `bills`, `bill_items`, `customers`. If an inventory trigger exists it should no-op for products with no recipes; confirm.

### Pitfall 10: Consultation status casing
`STATUS_TO_DISPLAY` tolerates lowercase legacy values (`completed: "Completed"`, [VERIFIED: consultation-types.ts:174-183]) and the canonical list is `["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"]` [VERIFIED: consultation-types.ts:3]. The function compares `upper(status::text) = 'COMPLETED'`. If `consultations.status` is an enum, `::text` is still right.

### Pitfall 11: Disabling 004 before 015 code is live
Doctor loses the only billing tab. Migration C is the last step and is reversible (`update ... set is_enabled = true`). Prefer disabling to deleting the `client_tab_access` row.

### Pitfall 12: tabs cache
`tabsCache` is a process-lifetime Map keyed by clientId; `getTabs` with `forceRefresh` bypasses it [VERIFIED: tabs.ts:4, 247-253]. After migration C the doctor user must reload/sign in again; UAT must say so.

### Pitfall 13: Print readiness and stale jobs
Reuse the Phase 2 guards: Print disabled until `printSettings.ready`; clear the job on tab/mode change (`useEffect(() => clearPrintJob(), [...])`, [VERIFIED: consultation-tab.tsx:414-418]) so a manual Ctrl+P cannot print the previous patient's receipt.

### Pitfall 14: Mobile 390 px and dark theme
Modal inputs `min-h-11`; quantity as `inputMode="numeric"`; receipt in explicit black on white (the app root is `class="dark"`, [VERIFIED: 02-RESEARCH.md citing layout.tsx:28]).

### Pitfall 15: Time zone on the receipt
`bills.created_at` is a timestamp; format with `formatUtcToIst` from `src/lib/time-utils.ts` (as `PrescriptionPrint` does for `created_at`, [VERIFIED: prescription-print.tsx:37]) and slice the date, not `toLocaleDateString` on the ISO string.

## Code Examples

### Exclusion predicate and guards (pure; smoke-testable with node)
```typescript
// src/lib/order-alert-policy.ts  (beside isPosOrderSource, which today reads:
//   return String(orderSource ?? "").trim().toUpperCase() === "POS";)
export function isClinicOrderSource(orderSource: unknown) {
  return String(orderSource ?? "").trim().toUpperCase() === "CLINIC";
}

// src/lib/billing-queries.ts
export async function fetchTransactionsSince(
  clientId: string,
  sinceIso: string,
  options?: { includeClinic?: boolean },
): Promise<TransactionRecord[]> {
  /* ...existing select... */
  const rows = (data ?? []).map((row) => mapBillRowToTransaction(row as Record<string, unknown>));
  return options?.includeClinic ? rows : rows.filter((t) => !isClinicOrderSource(t.order_source));
}

// src/lib/web-push-server.ts
export function shouldSendOrderPush(bill: Record<string, unknown>) {
  return !isPosOrderSource(bill.order_source) && !isClinicOrderSource(bill.order_source);
}

// src/hooks/use-order-alerts.ts  (realtime INSERT handler, before building alertPayload)
if (isClinicOrderSource(inserted?.order_source)) {
  return;
}
```

### RPC call and error mapping (query module)
```typescript
// src/lib/clinic-billing-queries.ts  (pattern: orderService.createOrder + communication-queries raise())
const { data, error } = await getClient().rpc("create_clinic_bill", {
  p_client_id: clientId,
  p_customer_id: payload.customerId,
  p_consultation_id: payload.consultationId,
  p_items: payload.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
  p_discount: payload.discount,
  p_payment_status: payload.paymentStatus,
  p_payment_mode: payload.paymentStatus === "PAID" ? payload.paymentMode : null,
});
// map: error.code 23505 -> "This consultation is already billed."; 42501 -> "You do not have access."; P0002 -> "Patient, consultation or item not found."; else raiseQueryError(error, "Unable to create the bill.")
```

### Mark paid (scoped update, no function needed if bills has an UPDATE policy)
```typescript
const { data, error } = await supabase
  .from("bills")
  .update({ payment_status: "PAID", payment_mode: mode })
  .eq("client_id", clientId).eq("id", billId)
  .eq("order_source", "Clinic").eq("payment_status", "UNPAID")
  .select("id");
// zero rows -> throw new Error("Bill not found or already paid.")
```
(`updateBillStatus` is the existing precedent: `.update({ status: dbStatus }).eq("client_id", clientId).eq("id", billId)`, [VERIFIED: billing-queries.ts:847-851].) The `bills_clinic_payment_chk` CHECK rejects `PAID` without a mode at the DB.

### Migration C (data; applied last; idempotent; column names to be confirmed by probes Q9/Q10)
```sql
insert into public.tabs_info (name, key, icon, is_active)
select 'Doctor Billing', '015', '<icon string copied from the 004 row>', true
where not exists (select 1 from public.tabs_info where key = '015');
-- then: insert into public.client_tab_access (client_id, tab_id, is_enabled, display_order, display_name, permissions)
--   copy display_order/permissions from the doctor client's 004 row, display_name 'Billing',
--   where client_id = 'eafea940-a6d1-4aa2-95e2-339f614502ea' and not exists (same client + tab);
-- then: update public.client_tab_access set is_enabled = false  -- 004 for that client only (join tabs_info key = '004')
```
Whether `tabs_info.id` is uuid, int or has a default, and whether `client_tab_access` has other NOT NULL columns, is unknown (probes Q9, Q10); `tabs.ts` only selects `display_order, permissions, display_name, is_enabled, tabs_info!inner(id, name, key, icon, is_active)` [VERIFIED: tabs.ts:262-269].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ALTER TYPE ADD VALUE` could not run in a transaction block | Allowed from PG12, but the value is unusable until commit | PG 12 | Split A and B |
| Supabase auto-granted new objects to API roles | Explicit grants required (tables); live project still has default ACL granting `anon` on new public tables per the Phase 2 probe | Supabase changelog 45329 (see 02-RESEARCH.md) | `revoke ... from public, anon` then `grant ... to authenticated` on the new function |
| Doctor billed through POS billing (004, source POS) | Dedicated 015 tab with source Clinic | This phase | Doctor summary must opt in to Clinic bills |

**Deprecated/outdated:** none relevant.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `bills` has columns `client_id, customer_id, total_amount, discount, final_amount, status, order_source, order_type, order_id, created_at` and none of the four new column names already exist (names seen only via `BILL_TRANSACTION_SELECT`, billing-queries.ts:624-625; `client_id`/`customer_id` via `.eq("client_id", ...)` and `mapBillRowToTransaction`) | Pattern 2 | `add column if not exists` no-ops against an existing column of a different type; INSERT column list wrong. Probe Q1 |
| A2 | `bill_items` columns are `bill_id, product_id, quantity, price, total` plus maybe `client_id`; `product_id` NOT NULL | Pattern 2 | INSERT fails; free-text lines impossible. Probe Q2 |
| A3 | `order_status` has `DELIVERED`; `order_source` is an enum without `Clinic`; `order_type` nullable | Pattern 2, 3 | Final status label wrong; `ADD VALUE` may already exist. Probe Q3 |
| A4 | `generate_order_id` is a BEFORE INSERT trigger on `bills` that fires for any source and fills `order_id` | Pattern 7 | Receipt number blank or cafe-style; probe Q4 |
| A5 | `bills_select_own/insert_own/update_own` exist with `crm_can_access_client(client_id)`; `bill_items_*_own` allow insert for own bills | Pitfall 7, Mark paid | `RETURNING` fails; mark-paid needs a function. Probe Q5/Q6 |
| A6 | `allow_menu_read_products` (and `products_*_own`) let an authenticated user read other tenants' active products | Pitfall 8 | Explicit predicates are harmless if false |
| A7 | Triggers on `bills`/`bill_items` (loyalty, inventory, webhook) behave harmlessly for a Clinic bill | Pitfall 9 | Unintended side effects; probe Q7/Q8 |
| A8 | `consultations.patient_id`, `.status`, `.appointment_id`, `.client_id` exist live with the types seen in `ConsultationRecord` (consultation-types.ts:14-36); `appointments.id` is uuid | Pattern 2 | FK or query errors; probe Q11 |
| A9 | `tabs_info.key` for billing is `'004'` (text), `client_tab_access` links by a tab id column and has `is_enabled`, `display_order`, `display_name`, `permissions`; 015 does not exist; the doctor client has 004 and 009 enabled | Migration C | Seed shape wrong. Probes Q9/Q10 |
| A10 | The doctor client has product rows usable as the consultation fee (type/price), or the user will create them | Fee prefill | "Fee prefilled" has no source. Probe Q12 |
| A11 | Realtime `INSERT` `payload.new` contains `order_source` | E3 | Guard never matches; fall back to a `fetchClinic...` lookup or rely on fetchActiveOrders only |
| A12 | New functions get default EXECUTE for `anon` on this project | Grants | Revoke is harmless if false; probe Q13 |
| A13 | PostgREST can `rpc()` a function whose params are `p_*` with `jsonb` array argument as in the cafe RPC (json) | Query layer | Minor; same call style as `orderService` |
| A14 | The doctor client has `013 doctor-summary`, not `012 cafe-summary` (decides which analytics Clinic bills reach) | E2 | Probe Q10 |
| A15 | Payment mode set `CASH, UPI, CARD, OTHER` fits the clinic | Pattern 2 | User may want cheque, insurance, wallet; text + CHECK makes this a one-line change |

## Open Questions

1. **Where does the fee come from? (BILL-02 "fee prefilled")**
   - What we know: no fee field on consultations, appointments, or `ConsultationRecord`; the doctor summary note says "no consultation-fee field"; the function needs `products` rows (BILL-03 "verifies ... products").
   - What's unclear: whether the doctor client has fee products and whether the Product tab (008) is enabled for them.
   - Recommended default: fees are normal `products` rows (type `Consultation`); the modal preselects the product when exactly one active `Consultation` product exists, else shows a picker; the doctor client gets 008 enabled or products seeded by the orchestrator. No new fee column.
2. **Is a consultation required to create a bill?**
   - Recommended default: yes in v1 (function requires a COMPLETED consult for the same patient; column stays nullable so a later phase can relax). Entry points: "Create bill" on Completed queue rows and the read-only Completed view; billing tab lists and manages bills.
3. **Price override and discounts?**
   - Recommended default: price always `products.price`; flat-amount discount allowed (0 to subtotal); no per-line price edit, no percentage discount. Variable fees = multiple products.
4. **Payment modes and partial payment.**
   - Recommended default: `PAID`/`UNPAID` only (as in BILL-02), modes `CASH, UPI, CARD, OTHER`; no partial payments, no refunds, no `paid_at` column.
5. **Void / correct a wrong bill.**
   - Recommended default: out of scope for v1; one bill per consultation is enforced; a wrong bill is corrected by a manual DB fix by the orchestrator. If the user wants a void path, add `payment_status = 'VOID'` to the CHECK and make the unique index exclude it (small, but it needs UI).
6. **`Clinic` label spelling and the sidebar placement.**
   - Recommended default: enum label `Clinic` exactly as in ROADMAP; tab sidebar label "Billing", placed in the POS module next to "Transactions" (module item right after `billing`), seeded `client_tab_access.display_name = 'Billing'` for the doctor client.
7. **Receipt number format.**
   - Recommended default: reuse `bills.order_id` from the existing trigger unchanged (probe Q4 shows its shape). A clinic-specific prefix is a trigger change and out of scope.
8. **Print settings access from the billing tab.**
   - Recommended default: billing tab only reads margins (`usePrintSettings`), disables Print until `ready`, and links to Consultations for editing; no second `PrintSettingsModal`.
9. **Doctor summary treatment of Clinic bills.**
   - What we know: the doctor summary must include Clinic bills (opt-in), otherwise revenue drops to zero for the doctor client.
   - What's unclear: whether UNPAID bills should count as revenue.
   - Recommended default: include Clinic bills; add `payment_status` to the doctor-summary select (after migration B is live) and count only `PAID` Clinic bills as revenue; list unpaid ones under "Pending Payments". If the user prefers minimal scope: include as is and record the limitation. Patient `totalSpent` (E5) is left as is.
10. **Which migration path for tab seeding?**
    - Recommended default: migration C is a repo file containing the `tabs_info` row plus the doctor-client-specific enablement and 004 disable, applied by the orchestrator last, via the SQL Editor or `apply_migration` as in Phase 2 (the live tracker does not list repo files; never the CLI push).
11. **Composite tenant FK hardening.**
    - What we know: simple FKs on `consultation_id` / `appointment_id` are not tenant-aware, and the existing `bills_insert_own` policy lets a tenant insert a bill directly with another tenant's consultation id (existence oracle only; no data returned).
    - Recommended default: accept the residual (function checks + RLS), document it in the threat notes. Optional hardening: composite FK `(client_id, consultation_id)` with `ON DELETE SET NULL (consultation_id)` plus a `unique (client_id, id)` on `consultations`/`appointments`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase MCP `execute_sql` (project `ltbqxyvdtrrlohdfrprf`) | Live probes, migration apply | NOT callable from this research session | - | Orchestrator runs the SELECTs below (read-only) and pastes results into the first plan's SUMMARY; the planner treats Wave 0 as a blocking task |
| Node / TypeScript | `npx tsc --noEmit`, smoke scripts | yes (per 02-RESEARCH.md: Node v24, `node_modules/.bin/tsc`) | - | - |
| `@supabase/supabase-js` | rpc / PostgREST | yes | 2.103.0 | - |
| ESLint | lint | no (`next lint` has no deps) [CITED: AGENTS.md] | - | typecheck + `npm run build` |
| Chrome/Edge + printer | receipt print UAT | human step | - | "Save as PDF" with Margins: Default |

**Missing dependencies with no fallback:** none. Live probes are a planned first task, not a blocker.

**Probes to run first (READ-ONLY SELECT only; run via MCP `execute_sql` or the SQL Editor):**
```sql
-- Q1 bills columns, types, defaults, nullability
select column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns
 where table_schema='public' and table_name='bills' order by ordinal_position;
-- Q2 bill_items columns
select column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns
 where table_schema='public' and table_name='bill_items' order by ordinal_position;
-- Q3 enums
select t.typname, e.enumlabel, e.enumsortorder from pg_type t join pg_enum e on e.enumtypid=t.oid
 where t.typname in ('order_source','order_type','order_status') order by t.typname, e.enumsortorder;
-- Q4 trigger function bodies + all triggers on bills / bill_items / customers / consultations
select event_object_table, trigger_name, action_timing, event_manipulation, action_condition, action_statement
  from information_schema.triggers where event_object_schema='public'
   and event_object_table in ('bills','bill_items','customers','consultations') order by 1,2;
select p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname in ('generate_order_id','create_order_with_inventory','crm_can_access_client','current_client_id','update_customer_loyalty_updated_at');
-- Q5/Q6 policies and grants
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
 where schemaname='public' and tablename in ('bills','bill_items','products','customers','consultations','clients','appointments','bill_order_counters') order by 1,2;
select table_name, grantee, privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name in ('bills','bill_items','products','customers','consultations') and grantee in ('anon','authenticated') order by 1,2,3;
-- Q7 constraints and indexes on bills
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.bills'::regclass;
select indexname, indexdef from pg_indexes where schemaname='public' and tablename='bills';
-- Q8 possible outbound webhook triggers (pg_net / supabase_functions) on bills
select tgname, tgrelid::regclass, pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid in ('public.bills'::regclass,'public.bill_items'::regclass);
-- Q9 tabs_info
select * from public.tabs_info order by key;
-- Q10 doctor client tab access (004, 009, 008, 012/013, 014, 015)
select cta.*, ti.key, ti.name from public.client_tab_access cta join public.tabs_info ti on ti.id = cta.tab_id
 where cta.client_id = 'eafea940-a6d1-4aa2-95e2-339f614502ea' order by ti.key;   -- adjust join column after Q9/columns
select column_name, data_type, is_nullable, column_default from information_schema.columns
 where table_schema='public' and table_name in ('tabs_info','client_tab_access') order by table_name, ordinal_position;
-- Q11 consultations / appointments / customers columns (fee or amount fields? status type?)
select table_name, column_name, data_type, udt_name, is_nullable from information_schema.columns
 where table_schema='public' and table_name in ('consultations','appointments') order by table_name, ordinal_position;
-- Q12 doctor client products (fee source)
select id, name, price, type, is_active from public.products where client_id='eafea940-a6d1-4aa2-95e2-339f614502ea' order by created_at;
-- Q13 default ACL regime and current function privileges
select defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl from pg_default_acl;
select p.proname, has_function_privilege('anon', p.oid,'execute') anon_exec, has_function_privilege('authenticated', p.oid,'execute') auth_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_order_with_inventory','crm_can_access_client');
-- Q14 how cafe bills look in the data (is order_source NULL for POS bills?)
select order_source, status, count(*) from public.bills group by 1,2 order by 3 desc;
```
(Q14 aggregates across tenants; run as the privileged role used by the orchestrator, not exposed to the app.)

## Validation Architecture

> `workflow.nyquist_validation` is `true` [VERIFIED: .planning/config.json:24]. No test runner exists and none is to be added [CITED: AGENTS.md, TESTING.md "Do not invent a test command until a runner is added"].

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none: TypeScript compiler, `next build`, Node type-stripping smoke scripts, SQL probes in rolled-back transactions, manual UAT (same stack as Phase 2) |
| Config file | none |
| Quick run command | `npx tsc --noEmit` (baseline: one pre-existing error in `src/lib/web-push-server.ts`, missing `web-push` module; gate = zero errors outside that file) |
| Full suite command | `npx tsc --noEmit && npm run build` (build also hits the baseline error; record as known) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILL-01 | 015 maps to `doctor-billing`, route and nav item exist; doctor client has it, not 004; 009 present; cafe client tab list unchanged | static grep + SQL + manual | `grep` gates for `"015": "doctor-billing"`, `doctor-billing` in routes/nav/dashboard-page; SQL select of `client_tab_access` joined to `tabs_info` for doctor and one cafe client | no - Wave 0 |
| BILL-02 | New columns, CHECK, FKs, unique index, enum label live | SQL probe | `select enum_range(null::public.order_source)`; Q1; `pg_constraint`; `pg_indexes`; reject `payment_status='PAID'` with null mode inside a rolled-back transaction | no - Wave 0 |
| BILL-03 | Function is INVOKER, search_path pinned, anon cannot execute; foreign customer / product / consultation rejected; unfinished consult rejected; customer/consult mismatch rejected; double bill rejected; bad qty/discount rejected; happy path returns totals and an `order_id` | SQL role simulation (rolled back) | `begin; select set_config('request.jwt.claims', '{"sub":"<doctor crm_user_id>","role":"authenticated"}', true); set local role authenticated; select public.create_clinic_bill(...); rollback;` plus `set local role anon` call must raise permission denied; `select prosecdef, proconfig from pg_proc where proname='create_clinic_bill'` | no - Wave 0 |
| BILL-03 | Pure money helpers agree with SQL | smoke (pure) | `node -e "import('./src/lib/clinic-billing-types.ts').then(m=>console.log(m.computeTotalsPaise(...)))"` (module must stay import-free of `@/` aliases) | no - Wave 0 |
| BILL-04 | Receipt prints body-only with margins; unpaid list shows only UNPAID; Mark paid flips and requires a mode | manual UAT + SQL | Chrome print preview/Save as PDF (Margins: Default); `select count(*) from bills where payment_status='UNPAID'` vs list | - |
| BILL-05 | Clinic bill absent from active orders, no beep/push, cafe summary unchanged, doctor summary includes it | smoke + manual | node smoke of `isClinicOrderSource` (`"Clinic"`, `" clinic "`, `null`, `"POS"`); grep gates E1-E4; two-browser alert UAT; cafe summary numbers before/after creating a Clinic bill | no - Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit`
- **Per wave merge:** `npx tsc --noEmit && npm run build`
- **Phase gate:** typecheck green outside the baseline error, SQL probes recorded in the SUMMARY, UAT list signed off before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Live probes Q1-Q14 recorded (blocks every later task)
- [ ] `src/lib/clinic-billing-types.ts` import-free (constants, payload types, `computeTotalsPaise`, `parseMoneyInput`) for the Node smoke test
- [ ] SQL role-simulation script file kept in the SUMMARY or as a commented footer in migration B (pattern of the Phase 0 file's trailing verification queries)
- [ ] Framework install: none (do not add one)

## Security Domain

> `security_enforcement` enabled, `security_asvs_level: 1`, `security_block_on: "high"` [VERIFIED: config.json:47-49].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | Supabase Auth session; function rejects `auth.uid() is null` |
| V3 Session Management | no | - |
| V4 Access Control | yes | INVOKER function + `crm_can_access_client(p_client_id)` + explicit `client_id` predicates + RLS on all touched tables; `revoke ... from public, anon` |
| V5 Input Validation | yes | jsonb shape, quantity 1..99, item count 1..20, discount bounds, text+CHECK for payment values; UI validation is advisory only |
| V6 Cryptography | no | none hand-rolled |
| V8 Data Protection | yes (health-adjacent) | receipt printed from stored data in black React text nodes; no clinical data in `localStorage`; no logging of bill contents |
| V13 API | yes | RPC returns uniform errors for missing and foreign ids; `console.error` scope tags only |
| V14 Configuration | yes | explicit grants; no service role in client code |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Foreign `customer_id` / `product_id` / `consultation_id` in RPC | Tampering / Info disclosure | Explicit `client_id = p_client_id` on every lookup; uniform "not found"; rolled-back foreign-id tests |
| Caller supplies a price or total | Tampering | Function reads `products.price`; client sends only ids and quantities |
| Supplying someone else's `p_client_id` | Elevation | `crm_can_access_client(p_client_id)` against `auth.uid()` |
| Anonymous or low-privilege RPC call | Elevation | `revoke all ... from public, anon`; grant only `authenticated`; verify with `has_function_privilege` |
| search_path hijack | Elevation | `set search_path = public`, schema-qualified names |
| Double submit / race creating two bills | Repudiation / Integrity | Advisory xact lock + partial unique index; UI disables button |
| Direct `bills` insert with foreign `consultation_id` (existing `bills_insert_own` policy) | Info disclosure (existence oracle) | Accepted residual; optional composite FK (Open Question 11) |
| Cross-tenant bill list via guessed ids | Info disclosure | Every query `.eq("client_id", clientId)` plus RLS |
| Alerts or pushes leaking Clinic bill amounts to cafe sessions | Info disclosure | E3/E4 guards; push goes only to the bill's own `client_id` subscriptions anyway |
| Receipt HTML injection through names | Tampering (XSS) | React text nodes only, no `dangerouslySetInnerHTML` (same rule as Phase 2 print) |
| Mark-paid forging | Tampering | Scoped UPDATE (client, id, source, status UNPAID) under RLS; CHECK requires a mode |
| Migration applied out of order | DoS | A then B then code then C; reversible C |

## Project Constraints (from CLAUDE.md / AGENTS.md)

No project `./CLAUDE.md`; directives come from AGENTS.md and the user's global CLAUDE.md (reply style only, not applicable to this document).
- Tenancy: never authorize with client-supplied `tenant_id`/`client_id` alone; every data query `.eq("client_id", clientId)`; `clientId` from `useClient()`/`useAuth()`.
- Security: no service role or secrets in frontend/git; never disable RLS; new function and tables carry explicit grants.
- Architecture: do not create parallel services/tables/components; search first. New domain gets its own `*-queries.ts` + `*-types.ts` pair; kebab-case; no `utils/`/`helpers/` trees; tabs default-exported `{ clientId }`; register tabs in `dashboard-page.tsx` + `DASHBOARD_TAB_ROUTES` + `DB_KEY_TO_CODE_KEY`.
- Error handling: query modules wrap with a user-facing fallback (`raiseQueryError`/`formatSupabaseError`); hooks expose `string | null`; use `DataState` for loading/error/empty; no `console.log`; never log tokens.
- Style: `"use client"` first line for hook/browser files; keep query/types modules server-safe; `cn()` from `@/lib/utils`; Tailwind tokens; no `any` on new mapped rows (use `Record<string, unknown>`); `type` over `interface`; `import type`; `@/` alias only; `as never` for typed-route pushes.
- Migrations: `supabase/migrations/YYYYMMDD_snake_description.sql`, idempotent; the live tracker does not list repo files, so apply deliberately and keep the file equal to what is live.
- Docs: material schema/provider/API changes update `.planning/codebase/` docs (CHANGELOG, STRUCTURE, CONCERNS; CONCERNS "POS order creation" and "Print" sections reference this area).
- Verification: typecheck, build, migration + RLS, tenant isolation, API failure paths, mobile, empty/error/loading.
- GSD: edits go through a GSD workflow.

## Suggested Plan Slicing (for the planner)

1. **Wave 1: live probes Q1-Q14 and migrations A and B** (A first as its own apply; verify; then B), plus role-simulation tests of `create_clinic_bill` (all rolled back). Checkpoint: orchestrator applies after user approval.
2. **Wave 2: exclusion guards** (E1-E4 and `isClinicOrderSource`, `BILL_ORDER_SOURCE_CLINIC`, doctor summary opt-in). Safe to ship before the schema because JS-only.
3. **Wave 3: query/types layer, hook, tab registration code, `DoctorBillingTab` with Unpaid/All list and Mark paid, `ClinicBillModal`.**
4. **Wave 4: consultation entry ("Create bill" on Completed rows and read-only view, gated on `tabs` containing `doctor-billing`), `ClinicReceiptPrint`, Print wiring.**
5. **Wave 5: migration C applied last (015 + doctor enablement + disable 004), docs (CHANGELOG, STRUCTURE, CONCERNS), gates and consolidated UAT.**

## Sources

### Primary (HIGH confidence, opened this session)
- In-repo: `src/lib/billing-queries.ts`, `billing-types.ts`, `orderService.ts`, `tabs.ts`, `dashboard-tab-routes.ts`, `module-navigation.ts`, `order-alert-policy.ts`, `web-push-server.ts`, `cafe-summary-analytics.ts`, `doctor-summary-analytics.ts` (180-409), `consultation-types.ts`; `src/hooks/use-order-alerts.ts`, `use-orders.ts`, `use-cafe-summary.ts`, `use-doctor-summary.ts`, `use-print-job.ts`, `use-print-settings.ts`; `src/components/dashboard/dashboard-page.tsx` (40-120, 120-520, 555-667), `tabs/billing-tab.tsx` (1-150), `tabs/transaction-tab.tsx`, `tabs/billing-crm-tab.tsx`, `tabs/consultation-tab.tsx` (395-460, 620-745, 1195-1270), `print/print-sheet.tsx`, `consultation/prescription-print.tsx`; `src/app/api/notifications/new-order/route.ts`; `src/app/globals.css` (print block); `supabase/migrations/20261108_phase0_tighten_rls.sql`, `20261111_print_settings.sql`, `20260814_whatsapp_auto_replies.sql` (crm_can_access_client).
- Planning docs: ROADMAP.md, REQUIREMENTS.md, STATE.md, 02-CONTEXT.md, 02-RESEARCH.md, 02-01/02-04/02-05 SUMMARY, 01-07-SUMMARY, CONCERNS.md, TESTING.md, config.json, AGENTS.md.

### Secondary (MEDIUM confidence)
- [Supabase: Database functions](https://supabase.com/docs/guides/database/functions): prefer `security invoker`; any role can execute by default; revoke from `public` and `anon`, grant back to `authenticated`; definer functions must check ownership.
- Web search, 2026-11-10: PostgreSQL `ALTER TYPE ... ADD VALUE` transaction rule (PG12+ allowed in a transaction, value unusable until commit; `unsafe use of new value` error): [commit 984c92074](https://forger.sitiv.fr/open-dsi/postgres/commit/984c92074), [Stack Overflow summary](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/65130629/new-enum-values-must-be-committed-before-they-can-be-used). The official ALTER TYPE page was unreachable (socket hang up) this session.

### Tertiary (LOW confidence, needs the live probes)
- All live-database claims (`[ASSUMED]` A1-A15).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new packages; everything reuses opened in-repo code.
- Architecture and exclusion points: HIGH (each location opened and quoted).
- Function/DDL design: MEDIUM, correct against Postgres semantics but column names and policies are unprobed.
- Live state: LOW until Q1-Q14 are run.

**Research date:** 2026-11-10
**Valid until:** 2026-12-10 (Supabase default-ACL and Data API regime is fast-moving; re-run probes if migrations slip)
