---
phase: 03-doctor-billing
plan: 02
subsystem: ui
tags: [nextjs, supabase, billing, tab-registry, pagination]
status: complete
requires:
  - phase: 03-01
    provides: "order_source label Clinic, bills payment CHECK and indexes (migrations A and B live)"
provides:
  - "clinic-billing-types.ts: import-free payment constants, guards, ClinicBillRecord"
  - "clinic-billing-queries.ts: own CLINIC_BILL_SELECT, fetchClinicBillsPage, markClinicBillPaid"
  - "use-clinic-bills.ts: paged hook with saving, actionError, markPaid"
  - "doctor-billing tab (Unpaid | All, cards below xl, table at xl, inline Mark paid panel)"
  - "tab 015 registered as doctor-billing in tabs.ts, dashboard-tab-routes.ts, module-navigation.ts, dashboard-page.tsx"
affects: [03-03, 03-04, 03-05, 03-06, 03-07]
tech-stack:
  added: []
  patterns:
    - "clinic-only select string kept out of the shared cafe BILL_TRANSACTION_SELECT"
    - "scoped update with exactly-one-row check for state transitions"
key-files:
  created:
    - src/lib/clinic-billing-types.ts
    - src/lib/clinic-billing-queries.ts
    - src/hooks/use-clinic-bills.ts
    - src/components/dashboard/tabs/doctor-billing-tab.tsx
  modified:
    - src/lib/billing-types.ts
    - src/lib/tabs.ts
    - src/lib/dashboard-tab-routes.ts
    - src/lib/module-navigation.ts
    - src/components/dashboard/dashboard-page.tsx
key-decisions:
  - "Hook also exposes clearActionError (small addition to the planned return shape) so a stale mark-paid error does not leak into the next opened panel"
  - "MarkPaidPanel is a small component mounted per open bill, so the chosen mode resets on every open"
  - "Unknown stored payment_status/payment_mode map to null through the guards instead of an unchecked cast"
requirements-completed: []
actuals:
  tokens: 4500
  tasks: 3
  commits: 3
plan_head_before: e16380f5e17e1a240a554610cf5bd16d1c58efd7
plan_head_after: bbcf91ecb60df77e0ab2a616d5aa14175e4721b3
---

# Phase 3 Plan 02: Doctor billing tab Summary

Clinic bill list (Unpaid | All) with paged cards/table and a Mark paid action that requires a payment mode, registered as tab 015 `doctor-billing` through the four-file registry contract; invisible to every client until migration C (plan 03-06).

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Clinic bill list end to end | b478f7f |
| 2 | Register tab 015 as doctor-billing | 2939a6a |
| 3 | Mark paid with a required payment mode | bbcf91e |

## Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` errors outside `src/lib/web-push-server.ts` | 0 after every task |
| Node smoke of `clinic-billing-types.ts` | `clinic types smoke ok` (guards case-sensitive, lists match D-04) |
| Static greps (types file zero imports, select, client scope, Clinic source, wiring, registry entries, mark-paid pieces) | all pass |
| `git diff` of `src/lib/billing-queries.ts` vs plan base e16380f | empty (shared select untouched) |
| No `any`, no `console.*`, no `dangerouslySetInnerHTML`, no `.delete(`/void/refund/un-pay in new files | pass |
| Registry diff deletions (4 files) | 0 (limit 3), exactly one `id: "doctor-billing"` item |
| `package.json` / `package-lock.json` diff | empty (no installs) |

Tracer gate: Task 1 verify is automated (typecheck, smoke, static greps), all re-run green before Task 2 started; the plan's human-check is deferred to plan 03-07 UAT because the tab is unreachable until migration C.

## Deviations from Plan

None - plan executed as written. One additive item: `clearActionError` returned from `useClinicBills` (see key-decisions); not a Rule 1-4 deviation, it supports the plan's "changing the filter closes the panel" and error display behavior.

## Auth gates

None.

## Items needing browser verification (after plan 03-06 applies migration C; collect in 03-07 UAT)

1. Doctor client sees Billing under POS and `/dashboard/doctor-billing` loads; a cafe client does not see the item and the route renders nothing for them.
2. Unpaid and All filters: loading, error and the two specific empty strings.
3. Layout: cards below xl, table at xl, no horizontal scroll at 390px; Mark paid panel usable on mobile (min-h-11 controls).
4. Mark paid: Confirm disabled until a mode is chosen; success removes the row from Unpaid and shows `Paid · MODE` in All; a second attempt (second tab) shows "Bill not found or already paid." in the panel; only one panel open at a time; changing the filter closes it.
5. Bills only exist after plan 03-05 or a hand-created Clinic bill; the live DB currently holds 0 Clinic bills, so empty states are what shows first.
6. Cross-tenant read/update denial is covered by RLS (checked in 03-01 V8); a UI check is optional.

## Known Stubs

None. (Receipt print and Create bill arrive in plans 03-04 and 03-05; no placeholder UI for them was added.)

## Threat Flags

None. No new endpoints or schema; reads and one update go through existing own-client RLS on `bills`.

## Self-Check: PASSED

Files present: the four new files and five edited files; commits b478f7f, 2939a6a, bbcf91e are ancestors of HEAD on feature/doctor-crm-phase1.

## Requirements note

`requirements-completed` is left empty and REQUIREMENTS.md was not ticked: BILL-01 needs migration C live (03-06), BILL-04 needs the receipt print (03-04), BILL-02 is only fully proven by 03-05/03-07. Code-side coverage from this plan: BILL-01 (registration), BILL-02 (payment fields read, filtered, updated), BILL-04 (unpaid list).
