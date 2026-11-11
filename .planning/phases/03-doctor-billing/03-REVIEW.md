---
phase: 03-doctor-billing
reviewed: 2026-11-11T00:00:00Z
depth: deep
files_reviewed: 24
files_reviewed_list:
  - supabase/migrations/20261112_bills_order_source_clinic.sql
  - supabase/migrations/20261112_clinic_billing_schema.sql
  - supabase/migrations/20261112_doctor_billing_tab.sql
  - src/lib/clinic-billing-types.ts
  - src/lib/clinic-billing-queries.ts
  - src/lib/billing-queries.ts
  - src/lib/billing-types.ts
  - src/lib/order-alert-policy.ts
  - src/lib/doctor-summary-analytics.ts
  - src/lib/tabs.ts
  - src/lib/dashboard-tab-routes.ts
  - src/lib/module-navigation.ts
  - src/lib/web-push-server.ts
  - src/app/api/notifications/new-order/route.ts
  - src/hooks/use-clinic-bills.ts
  - src/hooks/use-clinic-receipt-print.ts
  - src/hooks/use-order-alerts.ts
  - src/hooks/use-doctor-summary.ts
  - src/components/dashboard/tabs/doctor-billing-tab.tsx
  - src/components/dashboard/tabs/consultation-tab.tsx
  - src/components/dashboard/tabs/doctor-summary-tab.tsx
  - src/components/dashboard/billing/clinic-bill-modal.tsx
  - src/components/dashboard/print/clinic-receipt-print.tsx
  - src/components/dashboard/dashboard-page.tsx
findings:
  critical: 1
  warning: 5
  info: 7
  total: 13
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-11-11
**Depth:** deep
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Reviewed the Phase 3 migrations, clinic billing query/type modules, alert/analytics exclusion paths, tab/modal/print UI and the push route. Cross-file traces done for: create_clinic_bill tenant checks (every lookup carries client_id = p_client_id; consultation/patient/product/appointment all derived server-side; advisory lock plus unique index closes the double-bill race), E1-E4 Clinic exclusion (all four guards present and reachable; realtime `payload.new` carries `order_source`; no missed cafe path beyond the documented Transaction tab / patient totals), paise math, stale-response handling, and receipt data source.

The RPC itself is sound. The main gap is that it is not the only write path: the DB does not stop a same-tenant user from bypassing it (CR-01). Remaining findings are error-message leakage, a misleading error mapping, modal dismissal during save, stale rows on filter switch, and live-name receipts.

Documented limits (D-11 oracle, Dine-In/T0, Transaction tab 009 and patient totals, today-only consults, no row cap on `fetchNonPaidBillStatusesSince`, Pending Payments link, push route static verification, anon execute on `crm_can_access_client`, Safari/HEIC, web-push baseline tsc error) were not re-reported.

## Critical Issues

### CR-01: Clinic bill amounts, status and mark-paid guard are enforced only in the browser; DB allows direct tampering

**File:** `src/lib/clinic-billing-queries.ts:142-149`, `supabase/migrations/20261112_clinic_billing_schema.sql:65-68, 233-235`
**Issue:** `create_clinic_bill` is SECURITY INVOKER and relies on the existing `bills_*_own` / `bill_items_*_own` row policies (migration comment line 65). Those policies are tenant-row-level only (see `20261108_phase0_tighten_rls.sql`, lines 36-43: "bills_*_own policies remain"). Nothing in this phase restricts which columns or which transitions an authenticated user of the tenant may write. Using the public anon key plus their own JWT, any signed-in staff member can:
1. `PATCH bills` on a Clinic bill and set `total_amount`/`discount`/`final_amount` to anything (no trigger, no column grant).
2. Flip a paid Clinic bill back to `unpaid` with `payment_mode = null`; `bills_clinic_payment_chk` explicitly allows that shape (lines 46-54). There is no `paid_at` or audit row, so cash skimming leaves no trace.
3. Update a non-Clinic bill: the `.eq("order_source", "Clinic")` / `.eq("payment_status","unpaid")` guards in `markClinicBillPaid` are client-side only. A hand-built request can set `payment_status`/`payment_mode` on cafe/POS bills, or change a cafe bill's `order_source` to `Clinic` to hide it from cafe alerts and summaries.
4. `INSERT` a Clinic bill plus `bill_items` rows directly with any price, bypassing the D-03 server-side pricing and the one-bill-per-consultation advisory lock (the unique index still limits one per consultation, but only if `consultation_id` is supplied).
The D-03 "database decides prices" guarantee therefore holds only for the honest UI path.
**Fix:** Make the RPC the only writer for Clinic bills.
```sql
-- 1) Freeze financial columns and allow only unpaid -> paid on Clinic rows
create or replace function public.bills_clinic_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (old.order_source::text = 'Clinic' or new.order_source::text = 'Clinic') then
    if new.order_source is distinct from old.order_source
       or new.client_id is distinct from old.client_id
       or new.total_amount is distinct from old.total_amount
       or new.discount is distinct from old.discount
       or new.final_amount is distinct from old.final_amount
       or new.consultation_id is distinct from old.consultation_id
       or new.customer_id is distinct from old.customer_id
       or not (old.payment_status = 'unpaid' and new.payment_status = 'paid') then
      raise exception 'Clinic bill is not editable' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger bills_clinic_guard_trg before update on public.bills
  for each row execute function public.bills_clinic_guard();
```
Then tighten the live `bills_insert_own` / `bill_items_insert_own` policies (or add a RESTRICTIVE policy) so direct inserts with `order_source::text = 'Clinic'` are refused unless `current_setting('app.clinic_rpc', true) = 'on'` set inside `create_clinic_bill`, or make the function SECURITY DEFINER with its own `crm_can_access_client` check. Prefer a `mark_clinic_bill_paid(p_client_id, p_bill_id, p_mode)` RPC and add a `paid_at` column. If live already has column-level protection, record it in the migration and in CONCERNS.

## Warnings

### WR-01: Raw database error text is shown to the user (details, failing row, constraint names)

**File:** `src/lib/clinic-billing-queries.ts:213, 105, 128, 152, 171` (via `formatSupabaseError`, `src/lib/supabase.ts:74-97`)
**Issue:** `formatSupabaseError` concatenates `message + details + hint + (code)`. In `mapCreateBillError` every unmapped code (23514 check violation, 23502 not-null, 23503 FK, 22003 numeric overflow, 22023 with an unexpected message) falls through to it, and `markClinicBillPaid` and the fetchers use it directly. Postgres check/not-null violations put `Failing row contains (...)` (all column values of the bill row, including `client_id`, customer id, consultation id) in `details`, plus the constraint name `bills_clinic_payment_chk`. This surfaces in `saveError` / `actionError` (`clinic-bill-modal.tsx:410`, `doctor-billing-tab.tsx:95`). AGENTS.md: do not leak internals to the client.
**Fix:** For create and mark-paid, do not fall through to `formatSupabaseError`; log with `console.error("[clinic-billing] ...", error)` and return a fixed string, keeping the network-error branch only:
```ts
return isNetworkAuthError(error) ? formatSupabaseError(error, "Unable to create the bill.") : "Unable to create the bill. Try again.";
```

### WR-02: Every unique violation is reported as "already billed"

**File:** `src/lib/clinic-billing-queries.ts:187-189`
**Issue:** `code === "23505"` unconditionally maps to `CLINIC_ALREADY_BILLED_MESSAGE`, and the modal then shows an "Open Billing" link (`clinic-bill-modal.tsx:413-420`). The same SQLSTATE is raised by any other unique collision in the insert path (for example a live `order_id` generator/trigger collision on `bills`, or a unique index on `bill_items`). The user is told the consultation is billed when it is not, and is sent away instead of retrying.
**Fix:** Match the specific cause: `message.includes("already billed") || message.includes("bills_consultation_id_uniq")`; otherwise return the generic retry text.

### WR-03: Modal can be dismissed while the create request is in flight

**File:** `src/components/dashboard/billing/clinic-bill-modal.tsx:428, 436-457`; `src/components/dashboard/billing/entity-modal.tsx:22, 41`
**Issue:** The body disables Cancel while `saving`, but `EntityModal` calls `onClose` unconditionally from the backdrop click (line 22) and the header Close button (line 41). Closing mid-save unmounts `ClinicBillBody`; the RPC still completes, the bill exists, but the user never sees the "Bill created" panel or receipt number, and `consultation-tab` passes no `onCreated`. Their natural retry then hits "already billed". The double-submit guard (`savingRef`) is per-mount, so reopening gives a fresh guard.
**Fix:** Lift an `isSaving` signal to `ClinicBillModal` (callback ref or state set by the body) and pass `onClose={saving ? () => undefined : onClose}`; or have `ClinicBillModal` accept a `dismissible` prop honored by `EntityModal`. Also pass `onCreated` from `consultation-tab` to mark the row billed.

### WR-04: Filter switch shows the previous filter's rows and can corrupt "Show more"

**File:** `src/hooks/use-clinic-bills.ts:12-16`, `src/hooks/use-paged-list.ts:60-77, 144-152`, `src/components/dashboard/tabs/doctor-billing-tab.tsx:246-248`
**Issue:** On `resetKey` change `loadInitial` only calls `setLoading(true)` when `itemsLengthRef.current === 0`; existing items stay on screen (written for refreshes). Switching All -> Unpaid keeps paid bills rendered under "Unpaid" with the old `totalCount`/`hasMore` until the fetch returns. If the user taps "Show more" in that window, `showMore` bumps `requestIdRef` (discarding the in-flight initial load), then fetches the new filter at `offset = old items.length` and appends it to the old filter's rows, producing a mixed, partly skipped list that never self-corrects.
**Fix:** Key the list state by filter so it resets: render the list part as a child keyed `filter` (own `usePagedList`), or in `use-paged-list.ts` clear `items`/`hasMore`/`totalCount` and set `loading` when `loadedKeyRef.current !== key`.

### WR-05: Mark paid does not refresh when the server says the bill is already paid; refresh collapses pagination

**File:** `src/hooks/use-clinic-bills.ts:20-31`
**Issue:** `refresh()` runs only on success. When `markClinicBillPaid` throws "Bill not found or already paid." (another receptionist paid it, or a double tap whose first call won), the stale unpaid row and its open panel stay with an error until the user switches filters. On success, `refresh()` (`loadInitial({force:true})`) resets to the first page and drops rows loaded with Show more.
**Fix:** Call `await refresh()` in the catch branch for that error as well; optionally preserve loaded length by removing the paid row locally on the unpaid filter instead of re-fetching page 1.

### WR-06: Receipts are rebuilt from live product names, not from the stored bill

**File:** `src/lib/clinic-billing-queries.ts:18, 54-58`, `src/components/dashboard/print/clinic-receipt-print.tsx:65`
**Issue:** `bill_items` stores quantity, price and total but no item name; the name comes from the `products(name)` embed. A later rename, deactivation, or delete of the fee item rewrites the wording of every historic receipt reprint (or prints "Unknown item"). Amounts are stable, labels are not, which is a problem for a medical/financial receipt reprinted months later.
**Fix:** Add a `name` snapshot column to `bill_items` and write it in `create_clinic_bill` (`p.name`), falling back to the embed only for legacy rows.

## Info

### IN-01: Redundant duplicate Clinic guard in the push route

**File:** `src/app/api/notifications/new-order/route.ts:66-68`, `src/lib/web-push-server.ts:42`
**Issue:** `shouldSendOrderPush` already returns false for Clinic, so the explicit `isClinicOrderSource` block above it is dead for control flow and only changes the `skipped` label (`clinic_order` vs `pos_order`). Harmless, but two places to keep in sync.
**Fix:** Keep one (prefer `shouldSendOrderPush`) and have it return a reason.

### IN-02: Receipt printed from the create modal gives no warning when print settings are unsaved

**File:** `src/components/dashboard/billing/clinic-bill-modal.tsx:61-98`
**Issue:** The tab warns "receipts print with 0 mm margins" (`doctor-billing-tab.tsx:216-224`), but `CreatedPanel` uses `ready` only. With no saved settings the body-only receipt prints over the pre-printed letterhead at 0 mm margins.
**Fix:** Surface `hasSavedSettings` in `CreatedPanel` with the same note.

### IN-03: Unreachable branch and unstable pagination order

**File:** `supabase/migrations/20261112_clinic_billing_schema.sql:118-125`; `src/lib/clinic-billing-queries.ts:103`
**Issue:** The "Patient not found" check can never fail: step (2) already requires a consultation with `c.patient_id = p_customer_id` for this client. Separately, `fetchClinicBillsPage` orders by `created_at` only; ties across a page boundary can duplicate or skip bills.
**Fix:** Drop step (3) or fold it into (2); add `.order("id", { ascending: false })` as a tiebreaker.

### IN-04: Revenue is booked at bill creation date; no paid_at

**File:** `src/lib/doctor-summary-analytics.ts:146-150`, `src/hooks/use-doctor-summary.ts:95-99`
**Issue:** A Clinic bill created last month and paid today counts toward last month (range filter is on `created_at`), and the previous period's revenue changes retroactively when it is paid. With CR-01's `paid_at`, revenue could be bucketed by payment time. Also, statuses default to `"paid"` when absent from the non-paid map, so any incomplete map silently inflates revenue (fail-open).
**Fix:** Add `paid_at`, bucket paid Clinic revenue by it, and default unknown status to unpaid.

### IN-05: UI mislabels unknown payment state and missing patient

**File:** `src/components/dashboard/tabs/doctor-billing-tab.tsx:44-45, 255, 291`
**Issue:** `StatusPill` renders "Unpaid" for any non-`paid` value including `null` (unmapped status), with no Mark paid action since the button requires exactly `"unpaid"`. A null customer shows "Walk-in", though Clinic bills always have a patient.
**Fix:** Render an explicit "Unknown" pill for `null`; label "Patient unavailable".

### IN-06: Tab 015 gating is UI-only; RPC is callable for any tenant

**File:** `src/components/dashboard/tabs/consultation-tab.tsx:406`, `supabase/migrations/20261112_clinic_billing_schema.sql:98`
**Issue:** `canBill` hides the button for tenants without tab 015, but `create_clinic_bill` checks only `crm_can_access_client`, so a cafe tenant with consultations could create Clinic bills via the API.
**Fix:** If this matters, check `client_tab_access` for tab 015 inside the function.

### IN-07: Server and client money math can diverge; server accepts odd prices; migration C environment constants

**File:** `src/lib/clinic-billing-types.ts:78-96`, `supabase/migrations/20261112_clinic_billing_schema.sql:154-155`, `supabase/migrations/20261112_doctor_billing_tab.sql:11-37`
**Issue:** (a) The client computes `round(price*100) * qty` per line, the server `round(price * qty, 2)`; they agree only while `products.price` has at most two decimals. The server does not require `p.price is not null and p.price >= 0` (a null price silently drops from the subtotal; a negative price shrinks it and yields the misleading "Invalid discount"), and `numeric(12,2)` overflow raises an unmapped 22003. (b) Migration C hardcodes one tenant UUID and silently inserts nothing if that tenant lacks a 004 row.
**Fix:** Add `and p.price is not null and p.price >= 0` to the product join (reject as Invalid items); keep `products.price` constrained to 2 decimals; have migration C `raise notice` when zero rows were affected.

---

_Reviewed: 2026-11-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
