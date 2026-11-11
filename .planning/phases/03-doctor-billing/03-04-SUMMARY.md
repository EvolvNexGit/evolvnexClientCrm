---
phase: 03-doctor-billing
plan: 04
subsystem: ui
tags: [nextjs, supabase, billing, print, receipt]
status: complete
requires:
  - phase: 03-02
    provides: "doctor-billing tab, clinic-billing-queries.ts and clinic-billing-types.ts"
  - phase: 03-03
    provides: "Clinic guards (no alerts or cafe numbers for Clinic bills)"
provides:
  - "fetchClinicBillById: client-scoped, Clinic-source, maybeSingle re-fetch of one stored bill"
  - "describeClinicPayment: import-free receipt payment label"
  - "ClinicReceiptPrint: body-only black-on-white receipt for PrintSheet"
  - "useClinicReceiptPrint(clientId): usePrintSettings + usePrintJob + by-id fetch wrapper (reused by plan 03-05)"
  - "Print on every bill card and table row, with settings error/retry, no-saved-settings note and stale-job clear"
affects: [03-05, 03-06, 03-07]
tech-stack:
  added: []
  patterns:
    - "Receipt payload is always the bill re-fetched by id, never form state or a list row"
    - "Billing tab reads print margins only; settings are edited in Consultations (no second settings modal)"
key-files:
  created:
    - src/components/dashboard/print/clinic-receipt-print.tsx
    - src/hooks/use-clinic-receipt-print.ts
  modified:
    - src/lib/clinic-billing-types.ts
    - src/lib/clinic-billing-queries.ts
    - src/components/dashboard/tabs/doctor-billing-tab.tsx
key-decisions:
  - "printBill returns early when settings are not ready or another receipt is loading; the Print button is disabled on the same conditions, so a failed settings load never prints with default margins"
  - "Print and Mark paid share one flex-wrap action row (min-h-11 below xl) already in Task 1, since the Print button needed a home; Task 2 added the states around it"
  - "Typed-routes accepted the literal Link href /dashboard/consultation, so no as never cast was added"
requirements-completed: []
actuals:
  tokens: 2600
  tasks: 2
  commits: 2
plan_head_before: e5ab0dfba2f11b8130f702d65c82f24dcf19ec0e
plan_head_after: 5f82a886160f81731386f51d86d852b7f4e6adb2
---

# Phase 3 Plan 04: Clinic receipt print Summary

A stored clinic bill now prints as a body-only receipt (receipt number from `order_id`, IST date, patient, items table, subtotal, discount when above zero, total, one payment line) through the Phase 2 PrintSheet, usePrintJob and usePrintSettings, built from the bill re-fetched by id and disabled until print settings are ready.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Print a stored bill end to end (by-id fetch, hook, PrintSheet, receipt body) | 9d4d656 |
| 2 | Print settings states and stale-job handling in the billing tab | 5f82a88 |

## Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` errors outside `src/lib/web-push-server.ts` | 0 after both tasks |
| Node smoke of `describeClinicPayment` | `receipt label smoke ok` (PAID - UPI, PAID, UNPAID, empty string) |
| Task 1 structural greps (receipt export, text-black, break-inside-avoid, describeClinicPayment, order_id, formatUtcToIst, fetchClinicBillById + maybeSingle, hook composition, `<PrintSheet`, `<ClinicReceiptPrint`) | pass |
| Task 1 negative greps (theme tokens, dangerouslySetInnerHTML, window.print, vitals/findings/assessment, console.log/debug/info) | pass |
| Task 2 greps (settingsError, retrySettings, hasSavedSettings, /dashboard/consultation, clearPrintJob, Loader2, printError) and no `PrintSettingsModal` | pass |
| `BILL_TRANSACTION_SELECT` | unchanged (billing-queries.ts not touched) |
| `package.json` / `package-lock.json` diff | empty (no installs) |
| Post-commit deletion check | no deletions in either commit |
| Types module still plain-node importable | yes (smoke ran) |

Tracer gate: Task 1 verify fully automated and green before Task 2. Live proof (print preview, margins) deferred to plan 03-07 UAT.

## Deviations from Plan

None - plan executed as written.

## Auth gates

None.

## Items needing browser verification (collect in 03-07 UAT; needs migration C and a Clinic bill)

1. Chrome and Edge, Margins: Default, Save as PDF, dark theme on: Print on a paid and on an unpaid bill prints only the receipt (number, date, patient, items, subtotal, discount when present, total, "PAID - UPI" or "UNPAID"), black on white, inset by the saved margins, no browser header/footer text, no app chrome.
2. Receipt number prints the live trigger value; a dash when `order_id` is null.
3. Print disabled while settings load or after a failed load (error banner with Retry); Retry re-enables. With no saved settings row, the note and Consultations link show and it navigates to `/dashboard/consultation`.
4. Row spinner while a bill loads; "Bill not found." shows inline for a bill deleted between listing and print.
5. Open the print dialog then switch Unpaid | All: no leftover job remains (Ctrl+P after the switch must not print a receipt).
6. Mobile (below xl): Print and Mark paid sit on one wrapping row with 44px targets; table at xl shows both in the Actions column, Mark paid panel still opens inline.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or schema; the by-id read goes through existing own-client RLS on `bills` and is also filtered by `client_id`.

## Self-Check: PASSED

All five modified/created source files present; commits 9d4d656 and 5f82a88 are ancestors of HEAD on feature/doctor-crm-phase1. REQUIREMENTS.md not touched (BILL-04 to be ticked by the orchestrator at phase end).
