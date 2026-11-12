# Phase 3: Doctor billing - Context

**Gathered:** 2026-11-10 (user accepted all proposed decisions in chat; no discuss session)
**Status:** Ready for planning

<domain>
Phase 3 delivers BILL-01..05 for doctor clients: a `doctor-billing` tab (key 015), bills created from Completed consults through a SECURITY INVOKER function, payment mode and paid/unpaid status, Clinic bills kept out of cafe analytics and order alerts, and a receipt printed through the Phase 2 PrintSheet.
</domain>

<live_findings>
Verified by read-only probes on live project ltbqxyvdtrrlohdfrprf, 2026-11-10 (these supersede assumptions in 03-RESEARCH.md; no repo migration created them, so the migration files must record live state):
- LF-1: `bills` ALREADY has payment_mode text null, payment_status text default 'paid' (all 597 rows 'paid', mode NULL), consultation_id uuid, appointment_id uuid, with FKs bills_consultation_id_fkey and bills_appointment_id_fkey (no ON DELETE action). No CHECK on payment_status/payment_mode yet; no index on consultation_id. Migration B must use `add column if not exists` as a no-op record plus constraints and indexes, never assume the columns are absent.
- LF-2: `bills`: client_id nullable; customer_id nullable; customer_or_walkin_check requires customer_id or walk_in_name; total_amount, final_amount NOT NULL; discount default 0; status order_status NOT NULL default PENDING; order_type default 'Dine-In'; order_source default 'POS'; table_number default 'T0'; order_id text filled by trigger trg_generate_order_id (SECURITY DEFINER, uses clients.client_code + bill_order_counters, skips when order_id already set).
- LF-3: `bill_items`: id, bill_id, product_id (nullable), quantity int NOT NULL, price NOT NULL, total NOT NULL. No client_id column.
- LF-4: enums: order_status PENDING/ACCEPTED/DELIVERED; order_type Dine-In/Take-Away/Delivery; order_source POS/'Air Menu' only (no Clinic yet).
- LF-5: policies bills_{select,insert,update,delete}_own and bill_items_*_own exist (roles {public}); products has allow_menu_read_products (anon+authenticated read) so the function must filter products by client_id explicitly. Bills data: POS/DELIVERED 476, POS/ACCEPTED 20, POS/PENDING 97, Air Menu 4.
- LF-6: `tabs_info` key 015 "Doctor-billing" ALREADY EXISTS (id 8494c870-ec04-4686-8cdd-0953dd7387fd, icon null, created 2026-11-07). Doctor client access rows: 002, 004 (id 521f9c2e-823e-4b27-be72-49bfc43b371b), 007 (display_name Patient), 008 (display_name Services), 009, 013, 014. No 015 row yet. `client_tab_access` columns: id, client_id, tab_id (uuid), is_enabled, display_order, permissions, display_name.
- LF-7: doctor client has ZERO products rows. Fee items must be created by the user in the Services tab (008) before billing works; the UI needs an empty state that says so.
- LF-8: consultations.status is enum consultation_status; has no fee column; has patient_id, appointment_id, doctor_id.
- LF-9: create_order_with_inventory is SECURITY DEFINER with search_path=public and stays untouched.
</live_findings>

<decisions>
- D-01: Fee source = normal `products` (Services tab) rows. Exactly one active product preselects. No new fee column. The user creates fee items; empty state explains it.
- D-02: A bill is created only from a COMPLETED consultation (same patient). Entry points: "Create bill" on Completed queue rows and in the read-only Completed view, shown only when the client has the doctor-billing tab. One bill per consultation (partial unique index on consultation_id). consultation_id stays nullable in the table.
- D-03: Price comes from products.price server-side; the client sends only product_id and quantity. Only adjustment: a flat discount 0..subtotal. No per-line price override, no percentage discount.
- D-04: payment_status values are lowercase 'paid' / 'unpaid' to match live data; payment_mode is CASH / UPI / CARD / OTHER (text + CHECK; mode required when paid). No partial payments, refunds or paid_at. "Mark paid" sets status paid and requires a mode, by direct scoped UPDATE (bills_update_own exists) unless the plan finds a reason for a function.
- D-05: No void/cancel of a bill in v1; fix manually.
- D-06: Enum label `Clinic` on order_source; sidebar label "Billing" in the POS module next to the existing billing item; doctor client display_name 'Billing'.
- D-07: Receipt number = existing bills.order_id from the trigger, unchanged.
- D-08: Receipt = new ClinicReceiptPrint through the Phase 2 PrintSheet, usePrintJob and usePrintSettings (Print disabled until settings ready). The billing tab reads margins only and links to Consultations to edit them; no second PrintSettingsModal. Receipt body is built from the re-fetched stored bill.
- D-09: Doctor summary (013) includes Clinic bills through an explicit opt-in on the shared fetch; only payment_status 'paid' counts as revenue; 'unpaid' shows as pending. Cafe summary and any default caller keep excluding Clinic. Patient totalSpent unchanged. Transaction tab (009) unchanged.
- D-10: Migrations, in apply order: A = `alter type public.order_source add value if not exists 'Clinic'` alone (committed before anything uses it); B = constraints/indexes/function `create_clinic_bill` (SECURITY INVOKER, search_path=public, returns jsonb, revoke from public/anon, grant execute to authenticated; checks auth.uid(), crm_can_access_client(p_client_id), customer, consultation (COMPLETED, same patient), products (active, client_id match) with identical error for missing and foreign ids; status DELIVERED, source Clinic; advisory lock plus unique index for one bill per consult); C = tabs access seed (insert 015 client_tab_access for the doctor client with display_name 'Billing'; set is_enabled=false on the doctor client's 004 row, do not delete; 009 untouched; icon update on the 015 tabs_info row only if the existing icon field is null), applied LAST after the 015 code is deployed. Live apply: Claude hands the SQL to the user to run in the Supabase SQL Editor (MCP DDL prompts were declined in Phase 2); Claude verifies afterwards with read-only SELECTs and rolled-back probes. Never CLI push. Stale tab cache: doctor re-logs in after C.
- D-11: Accept the residual that existing bills_insert_own allows inserting a bill row pointing at a foreign consultation id (existence oracle only); document in CONCERNS. Optional composite FK is out of scope.
- D-12 (research findings turned into requirements): final status DELIVERED does not stop alerts, so code guards are required: (E1) fetchActiveOrders, (E2) fetchTransactionsSince default-exclude with doctor opt-in, (E3) realtime alert handler (use-order-alerts), (E4) shouldSendOrderPush and the new-order push route. Use a JS-side NULL-safe `isClinicOrderSource()` (no DB enum filter, because NULL/legacy sources exist and the enum value may not exist at deploy time) and a separate clinic-only select string so cafe tenants never depend on migration B. Deploy order: migration A and B live before any code that inserts or reads new fields.
- D-13: Smallest safe change; no new dependencies; RLS never disabled; tenant from authenticated user, never client-supplied ids; create_order_with_inventory untouched; docs updated (CHANGELOG, INTEGRATIONS, STRUCTURE, CONCERNS); tab registration contract per AGENTS.md (tabs.ts, dashboard-tab-routes.ts, module-navigation.ts, dashboard-page.tsx).
- D-14: Out of scope: voids, refunds, partial payments, insurance, invoices with tax, composite tenant FK, WhatsApp receipt sending.
</decisions>
