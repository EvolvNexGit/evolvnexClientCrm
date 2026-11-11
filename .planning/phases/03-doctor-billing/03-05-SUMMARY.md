---
phase: 03-doctor-billing
plan: 05
subsystem: ui
tags: [nextjs, supabase, billing, rpc, modal]
status: complete
requires:
  - phase: 03-01
    provides: "create_clinic_bill invoker function (migration B, live)"
  - phase: 03-03
    provides: "Clinic guards (no alerts or cafe numbers for Clinic bills)"
  - phase: 03-04
    provides: "useClinicReceiptPrint, ClinicReceiptPrint, fetchClinicBillById"
provides:
  - "Import-free money helpers: parseQuantity, parseMoneyInput, toPaise, computeTotalsPaise, limits and payload types"
  - "createClinicBill: RPC wrapper sending seven named arguments, SQLSTATE error mapping, defensive jsonb parse"
  - "ClinicBillModal: fee picker, empty state, discount, paid/unpaid, paise preview, created panel with Print receipt"
  - "Gated Create bill entries: read-only Completed view, mobile queue cards, xl queue table"
affects: [03-06, 03-07]
tech-stack:
  added: []
  patterns:
    - "Browser sends product ids, quantities, flat discount and payment choice only; the database function decides every amount"
    - "Modal body mounted only while open; receipt print hook mounted only after a bill exists"
key-files:
  created:
    - src/components/dashboard/billing/clinic-bill-modal.tsx
  modified:
    - src/lib/clinic-billing-types.ts
    - src/lib/clinic-billing-queries.ts
    - src/components/dashboard/tabs/consultation-tab.tsx
key-decisions:
  - "Preview math is integer paise; the success panel shows the server-returned final_amount, not the preview"
  - "Typed-routes accepted the literal Link hrefs /dashboard/product and /dashboard/doctor-billing, so no as never cast"
  - "Double-submit guarded by a ref as well as the disabled button, since state updates are async"
requirements-completed: []
actuals:
  tokens: 9500
  tasks: 2
  commits: 2
plan_head_before: a86c8d3d478ca83f4f20f8d5276153e6c89ff8bc
plan_head_after: af3b819a6e96260f1938b5163b0398ffc816d5d2
---

# Phase 3 Plan 05: Create bill from a Completed consultation Summary

A receptionist can bill a Completed consultation from the read-only view or the Completed Today queue (mobile cards and xl table): patient prefilled, fee picked from active Services products (auto-selected when only one exists), flat discount, Paid with a required mode or Unpaid, then a receipt prints from the created panel. The wrapper sends only product ids, quantities, discount and payment to `create_clinic_bill`.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Helpers, RPC wrapper, modal and gated button on the read-only Completed view | fb5268c |
| 2 | Create bill on Completed consultation-source queue rows (mobile and desktop), already-billed link | af3b819 |

## Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` errors outside `src/lib/web-push-server.ts` | 0 after both tasks |
| Node smoke of money helpers | `money helpers smoke ok` |
| Earlier smoke (`describeClinicPayment`) | still passes; types file has 0 imports |
| Task 1 structural greps (rpc name, p_client_id, p_items, SQLSTATEs, modal exports, EntityModal, fetchProducts, createClinicBill, useClinicReceiptPrint, numeric input, min-h-11, empty state, Services link, payment mode option) | pass |
| Task 1 negative greps (p_price/p_appointment/p_total/p_final/p_status, localStorage, usePersistentState, dangerouslySetInnerHTML, window.print) | pass |
| Task 2 greps (`row.source === "consultation"` x2, `canBill &&` x3, `{clinicBillModal}` x2, already-billed constant and Open Billing link) | pass |
| Task 2 `Create bill` awk count (3) and `! grep 'patientId: ""'` | pass (no false fail; modal fallback is written `billTarget?.patientId ?? ""`) |
| `package.json` / `package-lock.json` / `supabase/` diff | empty |
| Post-commit deletion check | no deletions in either commit |
| `billing-queries.ts` / `BILL_TRANSACTION_SELECT` | not touched |

Tracer gate: Task 1 verify fully automated and green before Task 2. Live proof deferred to plan 03-07 UAT (migration C not yet applied).

## Deviations from Plan

None - plan executed as written. The plan checker's warning about the `patientId: ""` gate did not trigger.

## Auth gates

None.

## Items needing browser verification (collect in 03-07 UAT)

1. Doctor client with zero products: Create bill on a Completed consult shows "No fee items yet" with an Open Services link to `/dashboard/product` and no form.
2. One active product: preselected with quantity 1; two products: first line empty. A product cannot be picked in two lines; Add item hides at 20 lines or when no unused product remains.
3. Create bill stays disabled until every line is valid, the discount is 0..subtotal (error "Discount cannot exceed the subtotal.") and Paid has a mode. Unpaid needs no mode. Preview shows subtotal, discount, total.
4. Create an unpaid and a paid bill (with and without discount): created panel shows receipt number, server total and "PAID - MODE" or "UNPAID". Print receipt is disabled until print settings load, then opens the receipt through the Phase 2 print sheet. Done closes.
5. Second bill for the same consult shows "This consultation is already billed." with an Open Billing link to `/dashboard/doctor-billing`.
6. Create bill appears only for clients with the doctor-billing tab, only on Completed consultation-source queue rows (mobile card and xl table) and on the read-only Completed view; never on Waiting, In Progress or appointment-source rows.
7. 390px: modal inputs are 44px high, quantity is numeric keypad, modal scrolls; mobile card row shows View / Print and Create bill side by side.
8. Error paths against the live function (stale product id, non-completed consult) show the friendly messages, not raw SQL text.

## Known limits

- The queue lists only today's consultations, so billing an earlier day's consultation is not reachable from the UI (D-02 entry points only; recorded for 03-07).

## Known Stubs

None.

## Threat Flags

None. No new endpoints or schema; the only new call is the existing invoker function from plan 03-01 with ids and quantities.

## Self-Check: PASSED

All four source files present; commits fb5268c and af3b819 are ancestors of HEAD on feature/doctor-crm-phase1. REQUIREMENTS.md not touched.
