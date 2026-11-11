---
phase: 03-doctor-billing
fixed_at: 2026-11-11T00:00:00Z
review_path: .planning/phases/03-doctor-billing/03-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 7
skipped: 1
status: partial
---

# Phase 3: Code Review Fix Report

**Source review:** `.planning/phases/03-doctor-billing/03-REVIEW.md`
**Iteration:** 1
**Verification:** `npx tsc --noEmit` run in the main checkout (`workflow.use_worktrees=false`, no worktree). Only the baseline `src/lib/web-push-server.ts` TS2307 (`web-push` missing) remains. No browser run was done; see "Browser checks to add".

**Summary:** CR-01 handled separately by the orchestrator via SQL (not touched here). WR-06 skipped (schema change). Fixed WR-01..WR-05, IN-02, IN-05, plus the requested empty-state UX change.

## Fixed Issues

### WR-02: Every unique violation is reported as "already billed"
**Files modified:** `src/lib/clinic-billing-queries.ts`
**Commit:** 80b3819
**Applied fix:** 23505 maps to `CLINIC_ALREADY_BILLED_MESSAGE` only when the message contains "already billed" or `bills_consultation_id_uniq`; any other unique clash returns "Unable to create the bill. Try again." (no Open Billing link).

### WR-01: Raw database error text shown to the user
**Files modified:** `src/lib/clinic-billing-queries.ts`
**Commit:** 0e59144
**Applied fix:** New `toSafeErrorMessage` returns the fixed fallback string, keeping the formatted message only for network errors (`isNetworkAuthError`). `raiseQueryError` (fetchers, mark paid) and the `mapCreateBillError` fall-through use it. No logging added (client code, per rules).

### WR-03: Modal can be dismissed while the create request is in flight
**Files modified:** `src/components/dashboard/billing/clinic-bill-modal.tsx`
**Commit:** c4fc49e
**Applied fix:** `ClinicBillBody` reports `saving` to `ClinicBillModal` via `onSavingChange`; the modal passes an `onClose` to `EntityModal` that is a no-op while saving (backdrop click and header Close). `EntityModal` is unchanged.
**Not done:** passing `onCreated` from `consultation-tab` to mark the row billed. The consultation tab has no per-row "billed" state, so this would be new UI; a retry now shows "already billed" with the Open Billing link.

### WR-04: Filter switch shows previous filter's rows and can corrupt "Show more"
**Files modified:** `src/hooks/use-paged-list.ts`, `src/hooks/use-clinic-bills.ts`
**Commit:** 18983d1
**Applied fix:** New opt-in option `clearOnKeyChange` on `usePagedList` (default false, other tabs unchanged). When the key differs from the last loaded key, items/hasMore/totalCount are cleared and loading is shown, so Show more cannot paginate from stale rows. `useClinicBills` enables it. Logic change; requires human verification.

### WR-05: Mark paid does not refresh when server says already paid
**Files modified:** `src/lib/clinic-billing-types.ts`, `src/lib/clinic-billing-queries.ts`, `src/hooks/use-clinic-bills.ts`
**Commit:** 8180ce7
**Applied fix:** New `CLINIC_BILL_NOT_PAYABLE_MESSAGE` constant; `markPaid` calls `refresh()` in the catch branch when that error occurs (only that error, so a transient failure does not blank the list). Not done: preserving loaded pagination after a successful mark paid (optional in the review). Requires human verification.

### IN-02: Receipt printed from create modal has no unsaved-settings warning
**Files modified:** `src/components/dashboard/billing/clinic-bill-modal.tsx`
**Commit:** a9da309
**Applied fix:** `CreatedPanel` shows a note when `ready && !hasSavedSettings`. Plain text rather than a link, because the modal only lives inside the Consultations tab (where Print settings is).

### IN-05: UI mislabels unknown payment state and missing patient
**Files modified:** `src/components/dashboard/tabs/doctor-billing-tab.tsx`
**Commit:** ce797b4
**Applied fix:** `StatusPill` renders a neutral "Unknown" pill when `payment_status` is null; null customer shows "Patient unavailable" instead of "Walk-in" (mobile and table).

### UX (user request): Empty state explains where bills come from
**Files modified:** `src/components/dashboard/tabs/doctor-billing-tab.tsx`
**Commit:** 7e279fa
**Applied fix:** Unpaid and All empty states now show a title plus "Bills are created from a completed consultation in the Consultations tab" with a link to `/dashboard/consultation` (same `Link` styling as the print-settings note). `DataState` still handles loading/error; the empty block is rendered by the tab. No new components or tables.

## Skipped Issues

### WR-06: Receipts are rebuilt from live product names
**File:** `src/lib/clinic-billing-queries.ts:18, 54-58`
**Reason:** Needs a schema change (`bill_items.name` snapshot column and `create_clinic_bill` update). Out of scope for this pass; left documented. Not fixed.
**Original issue:** Renaming/deleting a fee item rewrites wording of historic receipt reprints (or prints "Unknown item").

### CR-01 (not attempted)
Handled by the orchestrator via SQL; `supabase/migrations` untouched by this run.

## Browser checks to add

1. Create bill fails with a DB error (e.g. force a check violation): the message is the fixed "Unable to create the bill. Try again.", no constraint name or row values.
2. Offline/blocked network during create: the "Cannot reach Supabase" message still appears.
3. Create bill for an already-billed consultation: shows "already billed" plus Open Billing link; a non-consultation unique clash would not show the link (hard to trigger manually).
4. Click Create bill, then immediately click the backdrop and the header Close: dialog stays open until the request finishes; Created panel with receipt number is visible; Cancel is disabled while saving.
5. Billing tab: switch All -> Unpaid with slow network: paid rows disappear immediately and Loading shows; no Show more visible until the Unpaid load finishes; Show more then appends correctly.
6. Two sessions: pay a bill in session A, then Mark paid in session B on the stale row: "Bill not found or already paid." shows and the list refreshes (row gone from Unpaid).
7. Create-bill modal with no saved print settings: after creation the "Print settings are not saved yet..." note shows; with saved settings it does not.
8. Billing list rows with null payment status show "Unknown" and no Mark paid button; rows with no patient show "Patient unavailable" (mobile cards and desktop table).
9. Empty Unpaid and empty All lists show the Consultations explanation with a working link to `/dashboard/consultation`; loading and error states unchanged.
10. Regression: other paged lists (customers, products, consultations search) behave as before when typing in search (clearOnKeyChange is off).

---

_Fixed: 2026-11-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
