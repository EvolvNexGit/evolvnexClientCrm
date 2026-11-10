---
phase: 02-consultation-and-print
reviewed: 2026-11-10T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - src/app/globals.css
  - src/components/dashboard/consultation/attachment-open-button.tsx
  - src/components/dashboard/consultation/consultation-summary.tsx
  - src/components/dashboard/consultation/prescription-print.tsx
  - src/components/dashboard/consultation/vitals-card.tsx
  - src/components/dashboard/patient/patient-files-panel.tsx
  - src/components/dashboard/patient/patient-strip.tsx
  - src/components/dashboard/print/print-settings-modal.tsx
  - src/components/dashboard/print/print-sheet.tsx
  - src/components/dashboard/print/test-print-body.tsx
  - src/components/dashboard/tabs/consultation-tab.tsx
  - src/hooks/use-consultations.ts
  - src/hooks/use-print-job.ts
  - src/hooks/use-print-settings.ts
  - src/lib/consultation-files.ts
  - src/lib/consultation-queries.ts
  - src/lib/consultation-types.ts
  - src/lib/consultation-vitals.ts
  - src/lib/print-settings-queries.ts
  - src/lib/print-settings-types.ts
  - supabase/migrations/20261111_consultation_files_storage.sql
  - supabase/migrations/20261111_consultations_vitals.sql
  - supabase/migrations/20261111_print_settings.sql
findings:
  critical: 0
  warning: 6
  info: 9
  total: 15
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-11-10
**Depth:** standard (tenant-isolation and security focus)
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Tenant isolation holds. The three migrations enable RLS, grant nothing to anon or public, scope storage policies to `crm_can_access_client` on the first path segment (non-uuid segment yields NULL, so no access), and `storage_path` is CHECK-bound to the row's own `client_id`. `print_settings` has select, insert and update policies that match the upsert. No service-role, admin client, secret-box import, `any`, `console.*` or `eslint-disable` appears in the Phase 2 files. Signed URLs are created at click time with a 5 minute TTL and are never stored. Legacy URLs are gated to http(s) at every render site. Print values reaching CSS are clamped numbers.

No critical issues. The defects are about Completed-consult integrity (enforced in UI only), a non-atomic complete flow, a stuck-row path in file delete, a print-settings overwrite, and one mobile overflow.

## Warnings

### WR-01: "Completed is never reopened" is UI-only; a stale queue row can un-complete a consult

**File:** `src/hooks/use-consultations.ts:111-114`, `src/lib/consultation-queries.ts:794-841`, `:843-849`
**Issue:** `startConsultation` decides from `row.status`, which is the status at the last queue refresh. If the consult was completed in another tab or session since, the stale "Waiting" row triggers `setConsultationStatus(IN_PROGRESS)` with no status guard, which flips a Completed consult back to In Progress. The same applies to "Save as Draft" from a stale editor, which writes `status = DRAFT`. `updateConsultation` filters only on `id` and `client_id`. Nothing at DB level blocks writes (consultation row, medications, attachments) to a COMPLETED consult, so D-11 depends entirely on the client.
**Failure scenario:** Two tabs open. Tab A completes the visit and prints. Tab B still shows the row as Waiting, clicks "Start Consult", and the completed prescription is silently re-opened and editable.
**Fix:** In `updateConsultation`, add a guard for non-completing writes, e.g. `.neq("status", "COMPLETED")` when `payload.status !== "COMPLETED"`, and use `.select("id")` to detect zero rows and throw "This consultation is already completed." Re-read the status inside `startConsultation` rather than trusting `row.status`. Optionally add a DB trigger or RLS `with check` that rejects updates when `old.status = 'COMPLETED'`, and rejects medication/attachment writes for completed parents.

### WR-02: Save & Complete is non-atomic and sets COMPLETED before medications are written

**File:** `src/lib/consultation-queries.ts:824-840` (and `replaceConsultationMedications` `:583-609`)
**Issue:** `updateConsultation` writes the consultation row, including `status = COMPLETED`, first. It then deletes all medications and re-inserts them as two separate requests. If the delete succeeds and the insert fails (network drop, RLS, constraint), the consult is Completed with no medications. Phase 2 makes this unrecoverable because Completed consults are now read-only in the UI.
**Failure scenario:** Doctor with 5 medications presses Save & Complete on flaky mobile data. The status update lands, the medications insert fails, and the printed prescription is empty. The doctor cannot fix it.
**Fix:** Write medications and exercises first and set the status last (when completing, run the status update as the final statement). Better, move the update into one RPC/transaction. At minimum, insert the new rows before deleting the old ones (or upsert with stable ids).

### WR-03: Failed row delete after object removal leaves a row that can never be deleted

**File:** `src/lib/consultation-queries.ts:771-792`
**Issue:** The object is removed first, then the row. If `deleteConsultationAttachment` fails (network or RLS), the row survives with a dangling `storage_path`. On retry, `bucket.remove` returns `data: []` for the missing object, so the `data.length !== 1` guard throws "could not be removed from storage" forever. The row stays in the list, and Open fails with an object-not-found error.
**Fix:** Treat an empty result as "already gone" only after confirming absence (e.g. `bucket.list(prefix, { search: fileName })` returns nothing, or `createSignedUrl` returns a not-found error). Otherwise delete the row first and then best-effort remove the object, which risks an orphan object instead of an undeletable row.

### WR-04: Print settings modal can overwrite saved margins with zeros

**File:** `src/components/dashboard/print/print-settings-modal.tsx:38-49,133`, `src/components/dashboard/tabs/consultation-tab.tsx:978-988,1002,1202`
**Issue:** The "Print settings" buttons are not gated on `printSettings.ready`. The modal initialises its form from `margins` only when `open` flips (the effect depends on `[open]`). If settings are still loading, or the fetch failed (`error` set, `ready` false), `margins` is the all-zero default, the form shows 0, the modal says "Nothing saved yet", and Save upserts zeros over the real saved row. If the load finishes after the modal opened, the form never picks up the saved values.
**Failure scenario:** Transient fetch error, then the doctor opens Print settings to tweak one value and saves. All four saved letterhead margins are reset to 0, and every later print ignores the pre-printed letterhead.
**Fix:** Pass `ready`/`loading`/`error` into the modal. Disable Save and Test print and show "Settings not loaded, retry" when `!ready`. Re-initialise the form when `ready` turns true while the form is untouched (add `ready` and `margins` to the effect with a dirty flag).

### WR-05: Open error text breaks the attachment row layout at 390px

**File:** `src/components/dashboard/consultation/attachment-open-button.tsx:48,57-61`
**Issue:** The wrapper is `inline-flex shrink-0 flex-col`. The error span ("Pop-up blocked. Allow pop-ups for this site to open files.") is a non-shrinking flex item, so it takes its max-content width, roughly 330px or more. Inside the `li` (`flex justify-between`, `consultation-tab.tsx:1316,1638`, `patient-files-panel.tsx:61`), this squeezes the file name to zero and overflows the card horizontally. Pop-up blocked is the likeliest failure on mobile.
**Fix:** Drop `shrink-0` on the wrapper when an error is showing, or cap the error with `max-w-[12rem] break-words text-right`. Alternatively render the error below the row, outside the flex line.

### WR-06: Rejected promises from Save as Draft / Save & Complete are unhandled

**File:** `src/components/dashboard/tabs/consultation-tab.tsx:674-701`, handlers wired at `:1226,1234,1736,1743`
**Issue:** `saveConsultation` rethrows after setting the hook error (`use-consultations.ts:139`). `handleSaveDraft` and `handleSaveComplete` do not catch, and the buttons use `void handle...()`. Every failed save produces an unhandled rejection in the console. It is not user-visible (the banner shows), but it is noisy, and `handleSaveComplete` correctly skips navigation only because the throw aborts it. Note the contrast with `handleRemoveAttachment` and `handleFileSelected`, which do catch.
**Fix:** Wrap in try/catch with a comment that the hook already surfaces the error, and keep the early return so the queue navigation does not run on failure.

## Info

### IN-01: Global `@media print` blanks any print that has no print sheet

**File:** `src/app/globals.css:150-165`
**Issue:** `body > *:not([data-print-root]) { display: none !important }` applies app-wide. Ctrl+P on any dashboard page (reports, billing) now prints a blank page. Acceptable for the shared-sheet design, but unintended for all other screens.
**Fix:** Scope it, e.g. `body:has(> [data-print-root]) > *:not([data-print-root])`.

### IN-02: Vitals parsing accepts odd numeric forms and implausible BP

**File:** `src/lib/consultation-vitals.ts:108,115-131`
**Issue:** `Number(text)` accepts `1e1`, `0x14`, `+72`, `72.`. BP pattern accepts `80/120` (systolic below diastolic) and `999/999`. The DB constraint (`20261111_consultations_vitals.sql:16-22`) validates only keys and size, not value types or ranges, so direct API writes can store strings or out-of-range numbers (the read side filters types but not ranges).
**Fix:** Use `/^\d+(\.\d+)?$/` before `Number()`, check systolic greater than diastolic with sane bounds, and optionally add jsonb type checks to the CHECK constraint.

### IN-03: Legacy URL-attachment writers are dead code that can store arbitrary URLs

**File:** `src/lib/consultation-queries.ts:651-674`, `src/hooks/use-consultations.ts:228-243`
**Issue:** `addConsultationAttachment` and `attachFile` are no longer used by the tab. They accept any string as `file_url` (D-04 says new files go to the bucket only). Rendering is guarded by `isSafeHttpUrl`, but any future caller bypasses that.
**Fix:** Remove both, or validate with `isSafeHttpUrl` before insert.

### IN-04: Orphan objects and unchecked cleanup result

**File:** `src/lib/consultation-queries.ts:733-737`
**Issue:** On a failed row insert the `bucket.remove` result is ignored, so a failed cleanup silently leaves PHI in the bucket. Deleting a consultation (cascade) or cancelling also leaves objects behind. CONCERNS already lists orphan risk.
**Fix:** Check the remove result and log it with a scoped `console.error` (no path or URL). Consider a periodic orphan sweep.

### IN-05: Modal remounts per mode and a missing effect dependency

**File:** `src/components/dashboard/tabs/consultation-tab.tsx:1170,1870`, `src/components/dashboard/print/print-settings-modal.tsx:49`
**Issue:** `PrintSettingsModal` is rendered in separate return branches, so switching mode unmounts it, losing typed values and any in-flight test-print job. The `[open]` effect omits `margins` (intentional, but see WR-04).
**Fix:** Render one modal instance outside the mode branches.

### IN-06: MIME type is client-declared only

**File:** `src/lib/consultation-files.ts:22-36`, `src/lib/consultation-queries.ts:714-717`
**Issue:** The allow-list checks `file.type`, and the bucket `allowed_mime_types` trusts the upload Content-Type. A renamed non-image can be uploaded as `image/png`. Signed URLs are served from the Supabase origin (not the app origin), so XSS risk is low.
**Fix:** Optionally sniff magic bytes (`%PDF`, JPEG, PNG, RIFF/WEBP) before upload.

### IN-07: Prescription prints a lone dash for an unparseable DOB

**File:** `src/components/dashboard/consultation/prescription-print.tsx:34,48`
**Issue:** `formatPatientAge` returns "—" for an invalid DOB, which is truthy, so the paper shows a stray dash as the age.
**Fix:** Treat "—" as absent: `const age = dob ? formatPatientAge(dob) : null; if (age === "—") ...`.

### IN-08: A print job without `afterprint` stays mounted

**File:** `src/hooks/use-print-job.ts:16-30`, `src/components/dashboard/tabs/consultation-tab.tsx:648-652,1869`
**Issue:** If a browser never fires `afterprint`, `job` stays set. Navigating to the queue unmounts the sheet, and re-entering the editor remounts it with the old patient's prescription, so a manual Ctrl+P prints the previous patient's PHI.
**Fix:** Clear the job on unmount of the tab, or when `activeConsultation?.id` changes.

### IN-09: Invalid or unknown stored vitals are silently dropped on the next save

**File:** `src/lib/consultation-vitals.ts:65-88`, `src/components/dashboard/tabs/consultation-tab.tsx:437-440,671`
**Issue:** `parseVitals` discards keys with the wrong type or an invalid BP. The form is built from the parsed value, and Save writes it back, so data written outside the app is erased without notice.
**Fix:** Accept as a limitation, or surface a notice when parsing dropped keys.

---

_Reviewed: 2026-11-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
