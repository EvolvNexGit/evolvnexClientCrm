---
phase: 03-doctor-billing
plan: 03
subsystem: ui
tags: [nextjs, supabase, billing, order-alerts, web-push, analytics]
status: complete
requires:
  - phase: 03-01
    provides: "order_source label Clinic, bills payment columns (migrations A and B live)"
  - phase: 03-02
    provides: "clinic-billing-queries.ts (raiseQueryError, getClient), ClinicBill types"
provides:
  - "isClinicOrderSource: NULL-safe JS-side predicate in the import-free order-alert-policy.ts"
  - "E1: fetchActiveOrders drops Clinic bills (orders list, alert hydrate, 3s poll)"
  - "E2: fetchTransactionsSince(clientId, sinceIso, { includeClinic? }) excludes Clinic by default"
  - "E3: realtime INSERT alert handler returns early for Clinic bills"
  - "E4: shouldSendOrderPush excludes POS and Clinic; new-order route answers skipped clinic_order"
  - "fetchNonPaidBillStatusesSince in clinic-billing-queries.ts (doctor-only payment status read)"
  - "doctor summary: paid-only clinic revenue, unpaid clinic bills in Pending Payments"
affects: [03-04, 03-05, 03-06, 03-07]
tech-stack:
  added: []
  patterns:
    - "JS-side exclusion predicate, no database-side filter on the order source enum"
    - "doctor-only second fetch for payment status instead of widening the shared cafe select"
key-files:
  created: []
  modified:
    - src/lib/order-alert-policy.ts
    - src/lib/billing-types.ts
    - src/lib/billing-queries.ts
    - src/hooks/use-order-alerts.ts
    - src/lib/web-push-server.ts
    - src/app/api/notifications/new-order/route.ts
    - src/lib/clinic-billing-queries.ts
    - src/hooks/use-doctor-summary.ts
    - src/lib/doctor-summary-analytics.ts
    - src/components/dashboard/tabs/doctor-summary-tab.tsx
key-decisions:
  - "Two chained .filter calls in fetchActiveOrders (delivered, then Clinic) instead of one combined predicate, keeping the existing delivered filter line unchanged"
  - "Clinic transactions missing from the non-paid map are treated as paid (D-09); non-Clinic transactions pass through untouched"
  - "currentTransactions stays the full list (used for Pending Payments); new currentRevenueTransactions/previousRevenueTransactions feed revenue, order count, Avg Bill and hourly revenue"
requirements-completed: []
actuals:
  tokens: 3500
  tasks: 3
  commits: 3
plan_head_before: 28e884da48a9cfd999f9d11a80732285c62d3b47
plan_head_after: 73c63219ae166cdbcb6104d41250e2c0529c2e8e
---

# Phase 3 Plan 03: Clinic bill exclusion and doctor summary rules Summary

Clinic bills are now kept out of active orders, realtime alerts, push and cafe numbers on every path through a NULL-safe JS predicate (no database-side enum filter), while the doctor summary opts in and counts only paid clinic revenue, showing unpaid clinic bills as pending.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Shared predicate through active-orders and transactions-since fetches | 44492a6 |
| 2 | Realtime alert and push guards (E3, E4) | 121e9ff |
| 3 | Doctor summary opt-in, paid-only clinic revenue, unpaid as pending | 73c6321 |

## Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` errors outside `src/lib/web-push-server.ts` | 0 after every task |
| Node smoke of `order-alert-policy.ts` | `clinic predicate smoke ok` (Clinic/" clinic "/CLINIC true; null, undefined, "", POS, Air Menu, 0 false; POS predicate intact) |
| Policy file import count | 0 (stays import-free) |
| `BILL_TRANSACTION_SELECT` line md5 | 5fc7db29420e9bfea9f1c7e5bdccbde0 (byte-identical) |
| Negative grep `\.(neq\|or\|filter)\([^)]*[Cc]linic` on billing-queries.ts | pass, no deviation needed (arrow params are parenthesized, so the regex does not false-fail) |
| `git diff --quiet` on use-cafe-summary.ts and transaction-tab.tsx | clean |
| E3 line order (guard before `const alertPayload`), E4 line order (clinic check before `!shouldSendOrderPush`) | pass |
| shouldSendOrderPush tests both POS and Clinic | pass |
| Task 3 static greps (includeClinic, second fetch, `.neq("payment_status", "paid")`, countsAsRevenue, "unpaid", reworded note, `consultation-fee` absent, `currentTransactions` count >= 3) | all pass |
| No `any`, `console.*`, eslint-disable in added lines; no deletions in any commit | pass |
| `package.json` / `package-lock.json` diff | empty (no installs) |

Tracer gate: Task 1 verify is fully automated; all four checks green before Task 2 started. Live proof (no beep, summary numbers) is deferred to plan 03-07 UAT.

## Deviations from Plan

None - plan executed as written. The planner's note about the fragile Task 1 gate 4 was handled by writing the code with parenthesized arrow params; the gate passed unchanged, so it was not narrowed.

## Auth gates

None.

## Notes for plan 03-07 CONCERNS docs

- `fetchNonPaidBillStatusesSince` has no row cap, so PostgREST's default row limit applies (commonly 1000 per request). A doctor with more than that many non-paid bills in the range (current plus previous period) would get a truncated map, and Clinic bills missing from the map are treated as paid. A one-line comment on the function records this; record it as a known limit.
- Pending Payments alert still links to `/dashboard/transaction` (plan said link logic stays). That tab uses `fetchTransactionsPage`, which does not exclude Clinic, but it shows no payment status, so unpaid clinic bills are found more usefully in the Doctor Billing tab (015). Candidate follow-up: point the alert at `/dashboard/doctor-billing` once 03-06 registers it for doctor clients.
- Patient totals (`totalSpent`) and Transaction tab 009 still include Clinic bills regardless of payment status (D-09 out of scope).
- The push route and `web-push-server.ts` are verified statically only; `web-push` is missing locally (baseline tsc error), so no node import of them was possible.

## Items needing browser verification (collect in 03-07 UAT; needs migration C and plan 03-05 to create Clinic bills, or a hand-made Clinic bill)

1. Create a Clinic bill in one browser while a second browser is signed in to the same client: no beep, no toast in either, and it does not appear on the Orders page after the 3s poll.
2. Closed-browser push: a bills INSERT webhook for a Clinic row returns `{ ok: true, skipped: "clinic_order" }` and sends nothing; a non-POS, non-Clinic bill still pushes.
3. Cafe summary for a cafe tenant (and a doctor tenant on a cafe tab, if any) shows no Clinic bills in revenue or order counts; a legacy NULL-source bill still counts.
4. Doctor summary: unpaid Clinic bill does not add to Revenue, Avg Bill or hourly chart and appears under Pending Payments; after Mark paid it counts in all three; a legacy POS bill is unchanged; Avg. Bill note reads "From POS bills and paid clinic bills".

## Known Stubs

None.

## Threat Flags

None. No new endpoints or schema; the new read goes through existing own-client RLS on `bills`, and the push route only gained an early skip.

## Self-Check: PASSED

All ten modified files present; commits 44492a6, 121e9ff, 73c6321 are ancestors of HEAD on feature/doctor-crm-phase1. REQUIREMENTS.md not touched (BILL-05 to be ticked by the orchestrator at phase end).
