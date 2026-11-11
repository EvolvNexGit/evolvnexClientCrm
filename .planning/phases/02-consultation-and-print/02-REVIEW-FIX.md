---
phase: 02-consultation-and-print
fixed_at: 2026-11-10T00:00:00Z
review_path: .planning/phases/02-consultation-and-print/02-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-11-10
**Source review:** .planning/phases/02-consultation-and-print/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (WR-01..WR-06 plus Info IN-01, IN-07, IN-08 as requested)
- Fixed: 9
- Skipped: 0 (IN-02..IN-06 and IN-09 were out of the requested scope, not attempted)

**Verification:** run in the main checkout (`workflow.use_worktrees` is false, no worktree). `npx tsc --noEmit` after every fix: only the baseline `src/lib/web-push-server.ts` error (missing `web-push` module). A node smoke import of the pure helpers (`consultation-vitals`, `consultation-files`, `print-settings-types`) loads and behaves; none of those files were modified. No live DB or Supabase access was used; no DB trigger was added.

## Fixed Issues

### WR-01: Completed consult could be re-opened by a stale row

**Files modified:** `src/lib/consultation-queries.ts`, `src/hooks/use-consultations.ts`
**Commit:** 1a02d44 (shared with WR-02, same function)
**Applied fix:** `updateConsultation` pre-reads the stored status and throws "Consultation is already completed." for COMPLETED; the row update also carries `.or("status.is.null,status.neq.COMPLETED").select("id")` and throws the same message on zero rows (closes the race and keeps null-status rows updatable). `startConsultation` now re-reads the stored status via `fetchConsultationById` instead of trusting the queue row. Status: fixed, requires human verification (logic change; the guard is client-side only, there is no DB enforcement).

### WR-02: Save & Complete wrote COMPLETED before medications

**Files modified:** `src/lib/consultation-queries.ts`
**Commit:** 1a02d44
**Applied fix:** medications and exercises are now written first and the consultation row (including status) is the last write. Medication replace is still delete-then-insert (two requests); a failure now leaves an editable, not-Completed consult. Status: fixed, requires human verification. Note `createConsultation` still inserts the row before its children, but the app only creates IN_PROGRESS consults, so it was left alone.

### WR-03: Attachment row could become undeletable

**Files modified:** `src/lib/consultation-queries.ts`
**Commit:** 12a5948
**Applied fix:** `deleteConsultationFile` deletes the DB row first, then removes the storage object best effort (result ignored; worst case is an orphan object). Legacy rows without `storage_path` still delete only the row.

### WR-04: Print settings modal could overwrite margins with zeros

**Files modified:** `src/components/dashboard/print/print-settings-modal.tsx`, `src/components/dashboard/tabs/consultation-tab.tsx`
**Commit:** e7b343e
**Applied fix:** modal takes `ready`, `loading`, `loadError`, `onRetry`. Save and Test print are disabled (and `handleSave` returns early) while `!ready`; a loading line or an error with a Retry button shows instead of "Nothing saved yet". The form re-initialises when `open` or `ready` changes, unless the user has typed (dirty ref, reset on open). The "Print settings" open buttons stay enabled so the user can reach Retry.

### WR-05: Open error broke attachment row layout at 390px

**Files modified:** `src/components/dashboard/consultation/attachment-open-button.tsx`
**Commit:** c55ff95
**Applied fix:** wrapper capped at `max-w-[12rem]`; error span gets `max-w-full break-words text-right`.

### WR-06: Unhandled rejections from Save as Draft / Save & Complete

**Files modified:** `src/components/dashboard/tabs/consultation-tab.tsx`
**Commit:** 3525dc5
**Applied fix:** both handlers wrap the save in try/catch (the hook already sets the banner error); Save & Complete returns early so queue navigation only runs on success.

### IN-01: Global print rule blanked normal Ctrl+P

**Files modified:** `src/app/globals.css`
**Commit:** b8d0250
**Applied fix:** selector scoped to `body:has(> [data-print-root]) > *:not([data-print-root])`.

### IN-07: Lone dash printed as age for invalid DOB

**Files modified:** `src/components/dashboard/consultation/prescription-print.tsx`
**Commit:** fa96f84
**Applied fix:** an age equal to the dash placeholder is treated as absent and omitted.

### IN-08: Stale print job could print a previous patient

**Files modified:** `src/hooks/use-print-job.ts`, `src/components/dashboard/tabs/consultation-tab.tsx`
**Commit:** 87d82db
**Applied fix:** the hook clears the job after a 60 s fallback timeout (cleared on afterprint/cleanup) and exposes `clearPrintJob`; the tab calls it whenever `mode` or the active consultation id changes.

### Migration header comments (requested extra)

**Files modified:** `supabase/migrations/20261111_print_settings.sql`, `supabase/migrations/20261111_consultation_files_storage.sql`
**Commit:** 7d85660
**Applied fix:** comment-only: now say applied live 2026-11-10 by running the file in the Supabase SQL Editor. SQL unchanged. `20261111_consultations_vitals.sql` left as "applied via MCP execute_sql".

## Skipped Issues

None. IN-02, IN-03, IN-04, IN-05, IN-06, IN-09 were deliberately not in scope.

---

_Fixed: 2026-11-10_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
