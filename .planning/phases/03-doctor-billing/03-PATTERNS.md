# Phase 3: Doctor billing - Pattern Map

**Mapped:** 2026-11-10
**Files analyzed:** 22 (new/modified)
**Analogs found:** 21 / 22 (all analog paths are git-tracked `src/` or `supabase/migrations/` files, not capability mirrors)

CONTEXT.md decisions D-01..D-14 and live findings LF-1..LF-9 override 03-RESEARCH.md. Overrides that change patterns: payment_status is lowercase `'paid'`/`'unpaid'` (D-04, not 'PAID'/'UNPAID'); `bills` columns payment_mode, payment_status, consultation_id, appointment_id and both FKs already exist (LF-1), so migration B records them with `add column if not exists` plus constraints, never assumes absent; `tabs_info` 015 already exists (LF-6), migration C only inserts `client_tab_access`; no "Consultation" product type, any active product is a fee item (D-01, LF-7).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/20261112_bills_order_source_clinic.sql` (A) | migration | DDL | `20261111_consultations_vitals.sql` (header style) | role-match |
| `supabase/migrations/20261112_clinic_billing_schema.sql` (B) | migration | CRUD + RPC | `20261111_consultations_vitals.sql` + `20261111_print_settings.sql` (grants) + `20261108_phase0_tighten_rls.sql` (function revoke) | role-match |
| `supabase/migrations/20261112_doctor_billing_tab.sql` (C) | migration | data seed | `20261111_consultations_vitals.sql` (idempotent style) | partial |
| `src/lib/clinic-billing-types.ts` | model | transform | `src/lib/billing-types.ts` + `consultation-types.ts` | exact |
| `src/lib/clinic-billing-queries.ts` | service | CRUD + RPC | `src/lib/consultation-queries.ts` (helpers) + `billing-queries.ts` (bills select/page) | exact |
| `src/hooks/use-clinic-bills.ts` | hook | CRUD | `src/hooks/use-customers.ts` + `use-paged-list.ts` | exact |
| `src/components/dashboard/tabs/doctor-billing-tab.tsx` | component | CRUD | `src/components/dashboard/tabs/billing-tab.tsx` / `consultation-tab.tsx` print wiring | role-match |
| `src/components/dashboard/billing/clinic-bill-modal.tsx` | component | request-response | `src/components/dashboard/billing/entity-modal.tsx` consumers | role-match |
| `src/components/dashboard/print/clinic-receipt-print.tsx` | component | transform | `src/components/dashboard/consultation/prescription-print.tsx` | exact |
| `src/lib/tabs.ts` (mod) | config | - | itself | exact |
| `src/lib/dashboard-tab-routes.ts` (mod) | config | - | itself | exact |
| `src/lib/module-navigation.ts` (mod) | config | - | itself | exact |
| `src/components/dashboard/dashboard-page.tsx` (mod) | component | - | itself | exact |
| `src/lib/order-alert-policy.ts` (mod) | utility | transform | `isPosOrderSource` in same file | exact |
| `src/lib/billing-queries.ts` (mod: E1, E2) | service | CRUD | itself | exact |
| `src/hooks/use-order-alerts.ts` (mod: E3) | hook | event-driven | itself | exact |
| `src/lib/web-push-server.ts` (mod: E4) | service | request-response | itself | exact |
| `src/app/api/notifications/new-order/route.ts` (mod: E4) | route | request-response | itself | exact |
| `src/hooks/use-doctor-summary.ts` (mod) | hook | CRUD | itself | exact |
| `src/lib/doctor-summary-analytics.ts` + `doctor-summary-tab.tsx` (mod) | utility/component | transform | itself | exact |
| `src/components/dashboard/tabs/consultation-tab.tsx` (mod) | component | CRUD | itself | exact |
| `src/lib/billing-types.ts` (mod: `BILL_ORDER_SOURCE_CLINIC`, `TransactionRecord.payment_status`) | model | - | itself | exact |

## Pattern Assignments

### Migrations A, B, C (migration)

**Header style** (`supabase/migrations/20261111_consultations_vitals.sql:1-6`, `20261111_print_settings.sql:1-6`):
```sql
-- Doctor clients: vitals on a consultation (D-01). Additive and idempotent.
-- No RLS change: existing consultations_*_own_client policies already cover the column.
-- Applied to live through Supabase MCP execute_sql with these exact contents (never the CLI push:
-- the live migration table does not list repo files).
-- Apply to live BEFORE deploying code that selects these columns.
-- Live already had consultations.vitals jsonb (nullable, empty) on 2026-11-11; the add is a no-op there.
```
Phase 3 header must say: applied by the user in the Supabase SQL Editor (D-10), never CLI push; A before B, C last after 015 code is deployed; LF-1 columns/FKs already live so `add column if not exists` is a recorded no-op.

**Idempotent constraint** (`20261111_consultations_vitals.sql:8-21`): `add column if not exists`, then `drop constraint if exists X;` then `add constraint X check (...)`. Use this for `bills_clinic_payment_chk`:
```sql
-- lowercase per D-04/LF-1; existing 597 rows are 'paid' with NULL mode, so the CHECK must admit them
check (payment_status is null or payment_status in ('paid','unpaid'))  -- plus: mode in ('CASH','UPI','CARD','OTHER') or null; paid+Clinic rows require mode
```
Caution: legacy rows are `paid` with `payment_mode` NULL, so "mode required when paid" cannot be a plain table CHECK. Either scope it (`order_source::text <> 'Clinic' or ...`, uses enum literal at DDL time: only after A has committed) or enforce in the function plus the mark-paid path. Planner must pick one and note it (research draft CHECK would fail validation on the 597 rows).

**Enum add (A)** (RESEARCH Pattern 3): file contains only `alter type public.order_source add value if not exists 'Clinic';`. No other statement; B must not use the `'Clinic'` literal at DDL time (index predicates/CHECK) unless A is already committed. Inside the plpgsql function body it is resolved at run time.

**Grants for function** (`20261108_phase0_tighten_rls.sql:67-68` style, per RESEARCH): `revoke all on function public.create_clinic_bill(uuid, uuid, uuid, jsonb, numeric, text, text) from public, anon;` then `grant execute ... to authenticated;`.

**Table grants/RLS pattern** (`20261111_print_settings.sql:20-40`) only applies if a table were added; Phase 3 adds none. `crm_can_access_client(uuid)` is the tenant predicate (`20260814_whatsapp_auto_replies.sql:72-84`, sql stable, search_path=public).

**Function body**: copy the RESEARCH Pattern 2 draft (03-RESEARCH.md lines 180-251) with these CONTEXT changes: lowercase payment status; status `'DELIVERED'`, source `'Clinic'`, order_type left NULL/default (LF-2 default 'Dine-In' applies; omit column); products filtered `client_id = p_client_id and is_active` with identical error for missing/foreign ids; `bill_items` has no client_id (LF-3) so insert `(bill_id, product_id, quantity, price, total)` only; `order_id` comes from `trg_generate_order_id` (do not set); advisory lock then unique partial index `bills_consultation_id_uniq` for one bill per consult.

**Migration C**: `tabs_info` 015 exists (LF-6), so insert only `client_tab_access (client_id, tab_id, is_enabled, display_order, permissions, display_name)` with `where not exists`, copying display_order/permissions from the doctor client's 004 row; then `update ... set is_enabled = false` for 004 only (id 521f9c2e-823e-4b27-be72-49bfc43b371b); optional `update tabs_info set icon = ... where key='015' and icon is null`. Doctor client id used in research: `eafea940-a6d1-4aa2-95e2-339f614502ea`.

---

### `src/lib/clinic-billing-queries.ts` (service, CRUD + RPC)

**Analog:** `src/lib/consultation-queries.ts` helpers + `src/lib/billing-queries.ts` bills reads.

**Imports and helpers** (`consultation-queries.ts:1-2, 52-58`):
```typescript
import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";
function getClient() {
  const supabase = getSupabaseClient();
  if (!supabase) { throw new Error("Missing Supabase environment variables."); }
  return supabase;
}
function raiseQueryError(error: unknown, fallback: string): never {
  throw new Error(formatSupabaseError(error, fallback));
}
```
Duplicate these locally (AGENTS.md convention).

**Clinic-only select string** (D-12): do NOT extend `BILL_TRANSACTION_SELECT` (`billing-queries.ts:624-625`, shared by every cafe client). Define in the new module, e.g. `"id, order_id, customer_id, created_at, total_amount, discount, final_amount, payment_status, payment_mode, consultation_id, appointment_id, customers(name, phone), bill_items(id, quantity, price, total, products(name))"`.

**Paged list** (`billing-queries.ts:772-790`): `.select(SELECT, { count: "exact" }).eq("client_id", clientId).order("created_at", {ascending:false}).range(from, to)`; return `{ items, hasMore: totalCount != null ? from + items.length < totalCount : items.length === params.limit, totalCount }`. Add `.eq("order_source", "Clinic")` (safe here: only doctor clients with migration A live call it) and an optional `.eq("payment_status", "unpaid")` for the unpaid list. `buildListRange` from `@/lib/list-pagination`.

**Mapper**: copy `mapBillRowToTransaction` row handling (`billing-queries.ts:643-660`: array-or-object `customers`, `Array.isArray(row.bill_items)`) and `asNumber` (`billing-queries.ts:29-32`); use `Record<string, unknown>`, no `any`.

**RPC call** (RESEARCH "RPC call and error mapping", style of `orderService.createOrder`): `getClient().rpc("create_clinic_bill", { p_client_id: clientId, p_customer_id, p_consultation_id, p_items: items.map(i => ({ product_id: i.productId, quantity: i.quantity })), p_discount, p_payment_status, p_payment_mode })`. Map `error.code` 23505 to "This consultation is already billed.", 42501 to access, P0002 to not found, else `raiseQueryError(error, "Unable to create the bill.")`. Send NO price and NO appointment id (D-03). `clientId` from `useClient()`.

**Mark paid** (D-04; precedent `updateBillStatus`, `billing-queries.ts:839-858`):
```typescript
const { data, error } = await supabase.from("bills")
  .update({ payment_status: "paid", payment_mode: mode })
  .eq("client_id", clientId).eq("id", billId).eq("payment_status", "unpaid").select("id");
// data?.length !== 1 -> throw new Error("Bill not found or already paid.")
```
**fetchClinicBillById(clientId, billId)**: same select + `.eq("client_id", clientId).eq("id", billId).maybeSingle()`; receipt payload comes from this re-fetch (D-08), never form state.

**Fee products**: reuse `fetchProducts(clientId)` (`billing-queries.ts:460-480`, active only, `.eq("client_id")`); do not write a second products query. Empty list drives the "create fee items in Services (008) first" state (LF-7).

---

### `src/lib/clinic-billing-types.ts` (model)

**Analog:** `src/lib/billing-types.ts` (`*Record`/`*Payload`, `as const` unions) and `consultation-types.ts:3` (`CONSULT_STATUSES ... as const`).
```typescript
export const CLINIC_PAYMENT_MODES = ["CASH", "UPI", "CARD", "OTHER"] as const;
export type ClinicPaymentMode = (typeof CLINIC_PAYMENT_MODES)[number];
export const CLINIC_PAYMENT_STATUSES = ["paid", "unpaid"] as const;
export type ClinicPaymentStatus = (typeof CLINIC_PAYMENT_STATUSES)[number];
```
`ClinicBillRecord` (snake_case DB fields + `items`), `ClinicBillPayload` (camelCase: `customerId, consultationId, items[{productId, quantity}], discount, paymentStatus, paymentMode`), money helpers in integer paise (import-free; Phase 2 kept `consultation-vitals.ts` import-free for node smoke tests). Add `BILL_ORDER_SOURCE_CLINIC = "Clinic" as const` beside `BILL_ORDER_SOURCE_POS` (`billing-types.ts:5`). Add `payment_status?: string | null` to `TransactionRecord` (`billing-types.ts:90-106`) only if E2 doctor opt-in needs it in the shared mapper (see E2 note).

---

### `src/hooks/use-clinic-bills.ts` (hook, CRUD)

**Analog:** `src/hooks/use-customers.ts:1-50` (state bag `loading/saving/error`, `refresh`, mutators with try/finally `setSaving`) and `use-paged-list.ts:20-40` (`usePagedList({ resetKey, fetchPage })`, stale `requestIdRef` guard).
```typescript
"use client";
const [saving, setSaving] = useState(false);
// catch (fetchError) { setError(fetchError instanceof Error ? fetchError.message : "Unable to load ..."); }
```
Return `{ items, loading, loadingMore, error, hasMore, totalCount, saving, refresh, createBill, markPaid }`. Filter (Unpaid | All) goes in `resetKey`.

---

### `src/components/dashboard/print/clinic-receipt-print.tsx` (component, transform)

**Analog:** `src/components/dashboard/consultation/prescription-print.tsx` (body-only, no clinic header/footer).

**Excerpt** (lines 1-5, 36-52): `"use client"`, `formatUtcToIst` from `@/lib/time-utils`, `nonBlank` helper, `HEADING_CLASS = "text-[10pt] font-semibold uppercase tracking-wide"`, root `<div className="space-y-4 text-[11pt] leading-snug text-black">`, date as `formatDateOnly(formatUtcToIst(created_at).slice(0, 10))`, tables `border-collapse text-[10pt]`, rows `break-inside-avoid border-b border-black`, React text nodes only (no `dangerouslySetInnerHTML`), explicit black on white (app is dark). Named export `ClinicReceiptPrint({ bill })`. Content: receipt no = `bill.order_id` (D-07), date, patient name, item/qty/rate/amount table, subtotal, discount, total, "PAID - UPI" or "UNPAID". Money: `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 })` as in `billing-tab.tsx:14-20`.

**Print wiring** (analog `consultation-tab.tsx`):
- hooks `:402-404`: `const printSettings = usePrintSettings(clientId); const { printPayload, requestPrint, clearPrintJob } = usePrintJob<ClinicBillRecord>();`
- stale-job guard `:414-418`: `useEffect(() => { clearPrintJob(); }, [mode, activeConsultationId, clearPrintJob]);` (use the tab filter and selected bill id).
- sheet `:655-659`:
```tsx
const printSheet = printPayload ? (
  <PrintSheet margins={printSettings.margins}>
    <ClinicReceiptPrint bill={printPayload} />
  </PrintSheet>
) : null;
```
- button `:1228-1235`: `disabled={... || !printSettings.ready}` `title={printSettings.ready ? "Print receipt" : "Print settings are not loaded"}`.
- fetch-then-print `:631-653` (`handlePrintVisit`: guard `!printSettings.ready || printingId`, fetch, check, `requestPrint(detail)`). For receipts call `fetchClinicBillById` then `requestPrint`.
Imports: `PrintSheet` from `@/components/dashboard/print/print-sheet` (`print-sheet.tsx:18-47`, portal, margins prop), `usePrintJob` (`use-print-job.ts`, one frame then `window.print()`, clears on `afterprint` and 60s), `usePrintSettings` (`use-print-settings.ts:51-65`, `ready = !loading && error === null`). D-08: billing tab reads margins only; when `!printSettings.hasSavedSettings` show a note linking to `/dashboard/consultation`; no second `PrintSettingsModal`.

---

### `src/components/dashboard/tabs/doctor-billing-tab.tsx` (component, CRUD)

**Analog:** `consultation-tab.tsx` (print wiring above, default export `{ clientId }`) and `billing-tab.tsx`/`billing-crm-tab.tsx` for list UI. Default-exported client component with `{ clientId: string }` (tab render contract, AGENTS.md).
- List chrome: `DataState` (`billing/data-state.tsx:3-30`) `loading/error/empty/emptyLabel`, specific emptyLabel; pagination `ListPaginationControls` (`src/components/ui/list-pagination-controls.tsx`) with `usePagedList`.
- Tokens: `bg-card text-text border-border text-muted-foreground`, `cn()` from `@/lib/utils`, `Button` from `@/components/ui/button`.
- Mobile: row cards on small screens and table at `xl:` (`consultation-tab.tsx:1096-1112` card `<article>` + `hidden xl:block` table pattern); inputs `min-h-11`.
- Filters Unpaid | All; per-row "Mark paid" (mode select required), "Print".

### `src/components/dashboard/billing/clinic-bill-modal.tsx` (component)

**Analog:** `EntityModal` (`billing/entity-modal.tsx:6-58`): `<EntityModal open title onClose contentClassName="sm:max-w-lg">` with body children. Named export, reused from consultation-tab and doctor-billing-tab. Props: `clientId`, patient (`patientId`, name), `consultationId`, `onCreated(bill)`. Product list from `fetchProducts`; exactly one active product preselects (D-01); quantity `inputMode="numeric"`; discount 0..subtotal; payment status + mode; preview in integer paise; final amounts shown from RPC result. Catch bindings named `saveError`.

---

### Tab registration (tabs.ts, dashboard-tab-routes.ts, module-navigation.ts, dashboard-page.tsx)

- `src/lib/tabs.ts:153-168` `DB_KEY_TO_CODE_KEY`: after `"014": "consultation",` add `"015": "doctor-billing",`. `DEFAULT_TAB_ORDER` (`tabs.ts:7-22`): add `"doctor-billing",` after `"billing",`. Without the map entry key "015" never renders.
- `src/lib/dashboard-tab-routes.ts:13` `billing: "/dashboard/billing",`: add `"doctor-billing": "/dashboard/doctor-billing",` (quoted key as with `"cafe-summary"` at :7).
- `src/lib/module-navigation.ts:87` in `pos` module items: after the billing line add
  `{ id: "doctor-billing", label: "Billing", kind: "existing-tab", tabKey: "doctor-billing", icon: Receipt },` (`Receipt` already imported/used at the `transactions` item). Hidden unless the key is in `tabs`, so cafe clients unaffected.
- `src/components/dashboard/dashboard-page.tsx:63-65` dynamic import pattern:
```tsx
const DoctorBillingTab = dynamic(() => import("./tabs/doctor-billing-tab"), { loading: () => <TabLoading /> });
```
  and beside `:576-578` add `{displayTabKey === "doctor-billing" && <DoctorBillingTab clientId={clientId} />}`.

---

### Exclusion points E1-E4 (D-12)

**Predicate** (`src/lib/order-alert-policy.ts:63-65`, add directly below):
```typescript
export function isPosOrderSource(orderSource: unknown) {
  return String(orderSource ?? "").trim().toUpperCase() === "POS";
}
export function isClinicOrderSource(orderSource: unknown) {  // NEW, NULL-safe, JS-side only
  return String(orderSource ?? "").trim().toUpperCase() === "CLINIC";
}
```
No PostgREST enum filter anywhere (NULL/legacy sources; enum may not exist at deploy).

**E1** `billing-queries.ts:830-834` `fetchActiveOrders`: add after the delivered filter:
```typescript
.filter((transaction) => !isDeliveredStatus(transaction.status))
.filter((transaction) => !isClinicOrderSource(transaction.order_source));
```
Import `isClinicOrderSource` from `@/lib/order-alert-policy` (check no cycle: the policy file must not import billing-queries).

**E2** `billing-queries.ts:793-810` `fetchTransactionsSince(clientId, sinceIso, options?: { includeClinic?: boolean })`: keep the select unchanged (BILL_TRANSACTION_SELECT, `order_source` already included), map, then `return options?.includeClinic ? rows : rows.filter((t) => !isClinicOrderSource(t.order_source));`. Callers: `use-cafe-summary.ts:40` default (excludes); `use-doctor-summary.ts:84` passes `{ includeClinic: true }`. For D-09 paid/unpaid split the doctor path needs `payment_status`; since the shared select must not gain columns before B is live, have the doctor path use a second fetch from `clinic-billing-queries` (clinic select string) or an `includeClinic` branch that uses the clinic select. Planner decides; keep cafe select untouched.

**E3** `use-order-alerts.ts:162-166` realtime INSERT handler, right after `const inserted = asInsertedBill(payload.new);`:
```typescript
if (isClinicOrderSource(inserted?.order_source)) { return; }
```
Add `isClinicOrderSource` to the existing import at `:6` (`import { isLocalPosOrderId } from "@/lib/order-alert-policy";`). Hydrate/poll already covered by E1 via `fetchActiveOrders`.

**E4** `web-push-server.ts:41-43`:
```typescript
export function shouldSendOrderPush(bill: Record<string, unknown>) {
  return !isPosOrderSource(bill.order_source) && !isClinicOrderSource(bill.order_source);
}
```
`new-order/route.ts:65-67`: currently `if (!shouldSendOrderPush(bill)) { return NextResponse.json({ ok: true, skipped: "pos_order" }); }`. Distinguish: add `if (isClinicOrderSource(bill.order_source)) return NextResponse.json({ ok: true, skipped: "clinic_order" });` before it (webhook payload carries the full row; fail-closed is fine).

---

### Doctor summary (`use-doctor-summary.ts`, `doctor-summary-analytics.ts`, `doctor-summary-tab.tsx`) (D-09)

- `use-doctor-summary.ts:84` `fetchTransactionsSince(clientId, sinceIso),` inside `Promise.all` -> pass `{ includeClinic: true }` (or the clinic-fetch variant above).
- `doctor-summary-analytics.ts:293-294` revenue is `currentTransactions.reduce((sum, t) => sum + t.final_amount, 0)`; change to sum only transactions where `payment_status` is `paid` or is not a Clinic row (legacy POS rows have no clinic payment fields and stay counted; LF-1 says all 597 are 'paid'). `:203` hourly revenue bucket uses the same rule. `:365-368` "Pending Payments" currently `transaction.status === "pending"`; extend to also count `payment_status === 'unpaid'` (`pendingTotal` sum at :367).
- `doctor-summary-tab.tsx:362` note `"From POS bills (no consultation-fee field)"`: reword to include Clinic bills. Patient `totalSpent` (`CUSTOMER_SELECT` bills sub-select) unchanged (D-09). Transaction tab 009 unchanged.

---

### `consultation-tab.tsx` "Create bill" entry (D-02)

- Tab gating: `useApp()` exposes `tabs: TabDefinition[]` (`src/contexts/app-context.tsx:61,301`). Show the button only when `tabs.some((tab) => tab.key === "doctor-billing")` (confirm `TabDefinition` field name in `src/lib/types.ts`). consultation-tab does not currently call `useApp`, add it.
- Queue rows: card button `:1096-1105` and desktop table row `:1167` currently render `{row.status === "Completed" ? "View / Print" : ...}`. Add a second `<Button variant="secondary">Create bill</Button>` for `row.status === "Completed" && row.source === "consultation"` (`ConsultationQueueRow.id` is the consultation id when `source === "consultation"`, with `patientId`, `consultation-types.ts:97-113`). Appointment-source rows are not yet consults and cannot be billed.
- Read-only view: in the `isReadOnly` button group at `:1221-1236` (beside Print settings / Print) add a "Create bill" button using `activeConsultation.id` and its `patient_id`.
- History list `:1860-1866` already prints per visit; optional.
- Mount `<ClinicBillModal>` once near `printSheet`; on success refetch queue and optionally open receipt print. Already-billed: modal shows the "already billed" message from 23505 mapping.

---

## Shared Patterns

### Tenant scoping
**Source:** AGENTS.md; `clientId` from `useClient()`/tab prop. Every query `.eq("client_id", clientId)`; RPC takes `p_client_id` only as a selector authorized by `crm_can_access_client(p_client_id)` + `auth.uid()`. Never trust URL/tenant from client alone.
**Apply to:** clinic-billing-queries, migration B function.

### Error handling
**Source:** `consultation-queries.ts:52-58` (`getClient` throw `"Missing Supabase environment variables."`, `raiseQueryError`); hooks `fetchError instanceof Error ? fetchError.message : "Unable to ..."` (`use-customers.ts:23-24`).
**Apply to:** query module, hook, modal.

### Print
**Source:** `print-sheet.tsx`, `use-print-job.ts`, `use-print-settings.ts`, `consultation-tab.tsx:402-418, 631-659`.
**Apply to:** doctor-billing-tab, any receipt print from consultation-tab.

### Client/server boundary
Never import `supabase-admin.ts` into `"use client"` files; `order-alert-policy.ts` is shared by browser and server (`web-push-server.ts` already imports it), keep it import-light.

### List UI states
**Source:** `billing/data-state.tsx` (`loading`, `error: string | null`, `empty`, specific `emptyLabel`).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| SECURITY INVOKER plpgsql RPC in `20261112_clinic_billing_schema.sql` | migration | No function-creating migration in repo except the Phase 0 revoke list (`20261108_phase0_tighten_rls.sql:67-116`); use RESEARCH Pattern 2 with the CONTEXT overrides above. Also `generate_order_id`/trigger bodies are not in repo. |

## Metadata

**Analog search scope:** `src/lib`, `src/hooks`, `src/components/dashboard/{tabs,billing,print,consultation}`, `src/app/api/notifications`, `supabase/migrations`.
**Files read:** ~25. Cross-checks: 03-RESEARCH.md lines 523-705 were not read (Open Questions 9+, validation); planner should skim them.
**Pattern extraction date:** 2026-11-10
