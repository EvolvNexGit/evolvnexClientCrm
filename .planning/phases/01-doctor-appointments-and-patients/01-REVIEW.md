---
phase: 01-doctor-appointments-and-patients
reviewed: 2026-11-10T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/components/dashboard/appointments-calendar.tsx
  - src/components/dashboard/billing/customer-table.tsx
  - src/components/dashboard/patient/patient-files-panel.tsx
  - src/components/dashboard/patient/patient-overview-panel.tsx
  - src/components/dashboard/patient/patient-profile-drawer.tsx
  - src/components/dashboard/patient/patient-visits-panel.tsx
  - src/components/dashboard/tabs/appointments-tab.tsx
  - src/components/dashboard/tabs/customer-tab.tsx
  - src/hooks/use-appointments-range.ts
  - src/lib/appointment-queries.ts
  - src/lib/appointment-schedule.ts
  - src/lib/billing-queries.ts
  - src/lib/billing-types.ts
  - src/lib/consultation-queries.ts
  - supabase/migrations/20261108_phase0_tighten_rls.sql
  - supabase/migrations/20261110_customers_clinical_fields.sql
findings:
  critical: 0
  warning: 13
  info: 6
  total: 19
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-11-10
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Tenant scoping on the new reads/writes is sound: every query in `appointment-queries.ts`, the new `consultation-queries.ts` functions and the `customers` clinical columns filters `client_id`; `createAppointment` writes `client_id` after the spread; `updateAppointment` and `setAppointmentStatus` filter on both `client_id` and `id` and fail loudly on zero rows. The stale-response guards in `useAppointmentsRange` and in the three patient panels (request id / cancelled flag, `key={patient.id}` remount) are correct. The advisory conflict warning never blocks save. `layoutColumnAppointments` and `findAppointmentConflicts` are correct for half-open intervals.

No BLOCKER-class defect was proven. The thirteen warnings are mostly correctness and robustness defects in the appointment form (duplicate creation after a post-save refresh failure, lost validation, keyboard time entry), a time-handling inconsistency between the list and calendar views, tenant-unscoped localStorage for PHI (accepted risk T-01-13 covers the mechanism, not the cross-tenant leak), and RLS migration replayability/verification gaps.

## Warnings

### WR-01: Post-save refresh failure is reported as a save failure, so a retry creates a duplicate appointment

**File:** `src/components/dashboard/tabs/appointments-tab.tsx:665-697`
**Issue:** After `createAppointment`/`updateAppointment` succeeds, the same `try` block awaits `pagedAppointments.refresh()`, `rangeAppointments.refresh()` and `fetchAppointmentFilterOptions(clientId)`. The last one throws on any PostgREST error. A throw there lands in `catch`, shows "Unable to save appointment.", and leaves the modal open with the form intact. The user clicks Save again and `createAppointment` inserts a second row (there is no uniqueness guard). For a clinic this means double-booked patients caused by a flaky network after a successful write.
**Fix:** Separate the write from the follow-up refresh. Close/reset the modal as soon as the write succeeds and handle refresh failures independently.
```ts
try {
  setIsSaving(true);
  if (!editingAppointment) await createAppointment(clientId, payload);
  else await updateAppointment(clientId, editingAppointment.id, payload);
} catch (saveError) {
  setAddError(formatSupabaseError(saveError, "Unable to save appointment."));
  return; // finally still resets isSaving
} finally {
  setIsSaving(false);
}
setModalMode(null); setEditingAppointment(null); resetForm();
void Promise.allSettled([pagedAppointments.refresh(), rangeAppointments.refresh(), refreshFilterOptions()]);
```

### WR-02: Clinical and appointment PII persisted to localStorage is not tenant-scoped and is never cleared on sign-out

**File:** `src/components/dashboard/billing/customer-table.tsx:104-114`, `src/components/dashboard/tabs/appointments-tab.tsx:462-470`
**Issue:** `customer-table-editing-customer` stores the whole `CustomerRecord` (including the new `allergies`, `chronic_conditions`, `gender`, `blood_group`), and `customer-table-form` / `appointments-tab-form` store the typed form. Keys carry no `clientId`, and nothing in `src` calls `localStorage.removeItem` for them on sign-out (only `billing-tab.tsx` clears its own key). `isAddOpen`/`editingCustomer` are also persisted, so on the next page load the Edit modal reopens pre-populated. On a shared reception machine where clinic A signs out and clinic B signs in, clinic B sees clinic A's patient record and clinical text. The code comment on `profilePatient` ("must never reach localStorage") shows the intent was to keep clinical data out of storage, but `editingCustomer` and `form` defeat it. The plan's accepted risk T-01-13 covers clinical text in localStorage for the same user; it does not cover cross-tenant exposure, which is the project's core isolation value.
**Fix:** At minimum, include `clientId` in the keys (`customer-table-form:${clientId}`) so another tenant never reads them; better, do not persist `editingCustomer` (persist only its id) and clear the `customer-table-*` and `appointments-tab-*` keys in the sign-out path.

### WR-03: Calendar reads time-only values as wall-clock while the list view and consultation queue treat them as UTC

**File:** `src/lib/appointment-schedule.ts:57-75`, `src/lib/time-utils.ts:59-74`, `src/lib/consultation-queries.ts:136-138,250`
**Issue:** For a stored `start_time` of `"09:00:00"` (a `time` column, which is what the form's `"09:00"` can only be saved into), `clockToMinutes` returns 540 (09:00). `formatAppointmentTimeRange` -> `parseAppointmentDateTime` builds `${date}T09:00:00Z` and `formatDateToIstTime` renders it as 14:30. So the same appointment reads 09:00 in the calendar and the edit form, and 14:30 in the list view. Separately, `formatUtcToIstTimeLabel("09:00:00")` (used for the consultation queue time) goes through `parseDbTimestamp`, which appends `Z` to `"09:00:00"`, gets an invalid date, and shows `"-"`. The new calendar and conflict code is consistent with the form, but the application as a whole now shows two different clock times for one record, and conflict overlays are computed on a different clock than the list shows the user. ISO values additionally ignore date rollover (a stored `…T20:00Z` becomes 01:30 IST but stays on the previous `date` column).
**Fix:** Decide one rule for time-only values and apply it in `time-utils.ts` (treat `HH:MM[:SS]` as wall-clock IST, i.e. do not convert) so list, queue, edit form and calendar agree; add a time-only branch to `formatUtcToIstTimeLabel`. Confirm against the live column type of `appointments.start_time`/`end_time`.

### WR-04: `clockToMinutes` rejects the malformed timestamp shape that `time-utils` explicitly repairs

**File:** `src/lib/appointment-schedule.ts:41-43`
**Issue:** `normalizeAppointmentTimestamp` in `time-utils.ts` exists because stored values like `2026-06-11T02:00:00:00Z` occur in this data. `ISO_TIMESTAMP_PATTERN` allows only one `:SS` group, so these values return `null`. Such appointments are shown as "Unscheduled - no start time" in the calendar and are skipped by `findAppointmentConflicts`/`getConflictingIds`, i.e. a real booking silently disappears from overlap detection.
**Fix:** Run the input through `normalizeAppointmentTimestamp` before matching (or extend the pattern to accept `(?::\d{2})?` once more) and add an assertion for it.

### WR-05: `noValidate` removed email validation; "Start time *" is not enforced; end <= start is accepted

**File:** `src/components/dashboard/tabs/appointments-tab.tsx:617-663,1280`
**Issue:** Setting `noValidate` on the form disables the browser's `type="email"` check, and `handleSaveAppointment` never validates email, so malformed emails are now saved. The label says `Start time *` but only name, phone, service and date are checked; saving without a start time creates an appointment that lands in the "Unscheduled" chip list and is invisible to conflict detection. An end time earlier than or equal to the start is saved as-is: the list shows a range of `-`, the calendar silently draws a 10-minute block.
**Fix:** Add explicit checks before building the payload: valid email when non-empty, `start_time` required (or drop the asterisk), and when both times are present `end_time > start_time`.

### WR-06: `snapTimeToStep` on a controlled `type="time"` input fights keyboard entry

**File:** `src/components/dashboard/tabs/appointments-tab.tsx:1380-1383,1394-1396`
**Issue:** The snap runs on every `onChange`. Typing a minute digit fires `onChange` with an intermediate value (for example `09:03`), which is immediately rewritten to `09:00`; the controlled value reset means the user cannot type minutes that are not already on the 10-minute grid by keyboard (spinner/arrow keys and the picker still work). Behaviour is browser dependent, so this needs a quick manual check in Chrome and Safari. It also rounds an end time down, which can collapse it onto the start time.
**Fix:** Do not mutate while typing; snap on `onBlur`, or keep the native `step` only and validate in the save handler (see WR-05).

### WR-07: Enter in the customer picker silently replaces typed free text with the first suggestion

**File:** `src/components/dashboard/tabs/appointments-tab.tsx:169-171,199-202`
**Issue:** `activeIndex` is reset to 0 whenever `suggestions` changes, and Enter while open selects `suggestions[activeIndex]`. A receptionist typing a new customer name and pressing Enter (the natural "next field" action) gets a different existing customer's name, phone and email written into the form, which can then be saved against the wrong patient. The input's own hint says "type new customer name" is supported.
**Fix:** Start with `activeIndex = -1` and only pick on Enter when the user has navigated (`activeIndex >= 0`); otherwise close the list and let the typed name stand.

### WR-08: Customer picker spinner can stick after a suggestion is chosen mid-request

**File:** `src/components/dashboard/tabs/appointments-tab.tsx:141-167`
**Issue:** The effect depends on `open`. If a debounced request is in flight and the user clicks an older suggestion, `pick` sets `open=false`, the cleanup sets `cancelled=true`, and the `.finally` therefore skips `setLoading(false)`. The next effect run exits early because `open` is false, so `loading` stays true and the field shows the spinner indefinitely (until the list is reopened).
**Fix:** Reset the flag in the cleanup path, e.g. `if (!open || !clientId) { setLoading(false); return; }`, and call `setLoading(false)` in the cleanup function.

### WR-09: Conflict detection and staff columns match staff names case-sensitively

**File:** `src/lib/appointment-schedule.ts:139-159,283,309`; `src/components/dashboard/tabs/appointments-tab.tsx:273-274`
**Issue:** `SearchableCreatableField` treats `dr shah` and `Dr Shah` as the same option for `exactMatch`, but "Add" stores the raw typed casing. `findAppointmentConflicts`, `getConflictingIds`, `buildStaffColumns` and `matchesStaff` compare with `===`, so the same doctor under two spellings gets two calendar columns and the advisory double-booking warning never fires across them. This defeats the one safeguard the phase added.
**Fix:** Compare on a normalized key (`trim().toLowerCase()`) in all four places, keep the first-seen casing for the label, and have the field snap to an existing option's casing on case-insensitive match.

### WR-10: `softDeleteAppointment` is a silent no-op on zero rows; updates can touch soft-deleted rows

**File:** `src/lib/appointment-queries.ts:183-225,261-272`
**Issue:** `updateAppointment` and `setAppointmentStatus` were hardened to throw when no row matches, but `softDeleteAppointment` still reports success for a stale or foreign id, so the UI removes the confirm dialog with nothing deleted. None of the three filter `.is("deleted_at", null)`, so a stale calendar card can edit or change the status of an appointment that another user already deleted, effectively reviving data the list no longer shows.
**Fix:** Add `.is("deleted_at", null)` to the update/status/delete queries and `.select("id")` plus the zero-row check to `softDeleteAppointment`.

### WR-11: `fetchPatientAttachments` can build an oversized `IN` URL and silently truncates at 200 consultations

**File:** `src/lib/consultation-queries.ts:383-415`
**Issue:** Up to 200 UUIDs are sent as a PostgREST `in.(...)` URL parameter (about 7.4 KB of query string), which sits at the limit of common proxy request-line caps; the failure would surface as a generic "Unable to load patient files." for long-term patients. Consultations beyond the 200 most recent are never searched, and the UI gives no indication that the list is partial.
**Fix:** Use an embedded filter instead of a two-step id list, e.g. `consultation_attachments` select with `consultations!inner(patient_id)` and `.eq("consultations.patient_id", patientId)`, or chunk the ids; surface a "showing recent files" note when the cap is hit.

### WR-12: CSV export is vulnerable to formula injection from externally sourced customer names

**File:** `src/components/dashboard/billing/customer-table.tsx:118-129`
**Issue:** `downloadCsv` only quotes fields. Customer `name`, `email` and `outreach_status` can originate from outside the tenant (WhatsApp profile names, public forms). A value starting with `=`, `+`, `-` or `@` executes as a formula when staff open `customers.csv` in Excel. `URL.revokeObjectURL` is also called synchronously after `click()`, which can cancel the download in some browsers.
**Fix:** Prefix cells that match `/^[=+\-@\t\r]/` with a single quote, and revoke the URL in a `setTimeout`.

### WR-13: RLS migration cannot be verified or replayed from the repo, and two statements need a live check

**File:** `supabase/migrations/20261108_phase0_tighten_rls.sql:32-85`
**Issue:** The script is idempotent as written (every `create policy` follows a `drop policy if exists`; `enable row level security`, `revoke`, `grant` and `alter function` are repeatable), but correctness depends on state that is not in the repo:
1. `products`: after the drops only `allow_menu_read_products` is stated to remain. If no own-client INSERT/UPDATE policy exists for `authenticated`, enabling RLS blocks all product writes from the CRM. The file never creates or names one (unlike `tasks`).
2. `bill_order_counters` and `client_code_counters` get RLS enabled with the open policy dropped, and only `generate_client_code` is made `SECURITY DEFINER`. `generate_order_id` is revoked from `authenticated` and not made definer here. If it is not already definer on live, order creation through `create_order_with_inventory` (invoker) cannot write the counter. The 2026-11-10 parity note covers the grant, not the security mode.
3. `bills`, `bill_items`, `clients`, `appointments` rely on `*_own` policies that no repo migration creates, so on a database built from the repo the drops leave those tables with no policy (deny all).
**Fix:** Add the verification queries for items 1 and 2 to the header (policies on `products`, `prosecdef` for `generate_order_id`), record the result, and state in the header that the file is not replayable on a fresh database because base-table policies live outside the repo.

## Info

### IN-01: Keyboard and screen-reader ergonomics of the calendar and drawer

**File:** `src/components/dashboard/appointments-calendar.tsx:374-386`, `src/components/dashboard/patient/patient-profile-drawer.tsx:77-84`
**Issue:** Every 10-minute slot is a focusable button, which is 72 tab stops per column (360+ in week view) before the next control. The drawer sets `aria-modal="true"` but does not move focus into the dialog, trap it, or restore it on close; Escape is bound on `window`.
**Fix:** Give slot buttons `tabIndex={-1}` (offer a keyboard "add" path instead) and add focus management to the drawer (or reuse `EntityModal`).

### IN-02: Day-view empty message always says "today"

**File:** `src/components/dashboard/appointments-calendar.tsx:287`
**Issue:** `emptyLabel` is "No appointments today" for any selected day. On Dec 25 it still says today.
**Fix:** Use "No appointments on this day" or format the date.

### IN-03: Slot-click end time can leave the 10-minute grid and the unscheduled chips ignore the staff filter

**File:** `src/components/dashboard/appointments-calendar.tsx:204,310-332`
**Issue:** `Math.min(startMinutes + 30, 24 * 60 - 1)` yields `23:59` for the last slots, which is off-step. In week view the staff filter hides other staff's cards but the "Unscheduled" list still shows everyone's.
**Fix:** Clamp to `1440 - TIME_STEP_MINUTES`; filter `unscheduled` with `matchesStaff` when a staff pill is selected.

### IN-04: Range cap and load errors are invisible to the user

**File:** `src/lib/appointment-queries.ts:227-251`, `src/hooks/use-appointments-range.ts:50-54`, `src/components/dashboard/tabs/appointments-tab.tsx:512-517`
**Issue:** `APPOINTMENT_RANGE_MAX` (1000) truncates silently, so conflicts beyond the cap are never seen. When the modal-day load fails (`modalDayAppointments.error`) the conflict warning simply never appears with no hint that the check did not run. On error the hook keeps the previous `appointments`.
**Fix:** Expose a `truncated` flag and show a "check unavailable" line in the modal when `modalDayAppointments.error` is set.

### IN-05: Clinical columns have no server-side bounds; `updateCustomer` is a silent no-op on zero rows

**File:** `supabase/migrations/20261110_customers_clinical_fields.sql:6-10`, `src/lib/billing-queries.ts:251-286`
**Issue:** `allergies`/`chronic_conditions` are unbounded `text` and `gender`/`blood_group` unconstrained; the 500-character and option-list limits exist only in the form. `updateCustomer` does not verify that a row matched (unlike `updateAppointment`), so an edit against a stale or deactivated id reports success. The migration comment correctly notes it must be applied before deploy because `CUSTOMER_SELECT` references the columns for every tenant.
**Fix:** Add `check (char_length(allergies) <= 500)` style constraints (or accept and document), and mirror the `.select("id")` zero-row check.

### IN-06: Drawer subscription churn and silent history cap

**File:** `src/components/dashboard/patient/patient-profile-drawer.tsx:58-71`, `src/lib/consultation-queries.ts:438`
**Issue:** `onClose` is an inline arrow in `customer-table.tsx:400`, so the Escape listener is removed and re-added on every parent render. `fetchPatientConsultationHistory` returns at most 20 visits with no "showing latest 20" indication in `PatientVisitsPanel`. `customer-tab.tsx` also still runs `useCustomers` (full unpaged fetch including every patient's clinical text) alongside the paged list, so every add/edit triggers two refetches.
**Fix:** Wrap `onClose` in `useCallback` (or hold it in a ref); show a truncation note; derive `saving`/`error` without the full `fetchCustomers` load.

---

_Reviewed: 2026-11-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
