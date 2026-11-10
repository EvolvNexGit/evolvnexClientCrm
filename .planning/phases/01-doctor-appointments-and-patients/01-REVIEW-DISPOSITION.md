# Phase 1 code review disposition

Source: `01-REVIEW.md` (standard depth, 16 files, 0 critical, 13 warnings, 6 info). Recorded 2026-11-10. Status key: `open` = not yet decided or fixed, `resolved` = verified no action needed, `accepted` = known and kept.

| ID | Summary | Status | Note |
|----|---------|--------|------|
| WR-01 | Post-save refresh failure reported as "Unable to save"; modal stays open so a retry can duplicate the appointment | open | Fix recommended |
| WR-02 | localStorage keys not tenant-scoped or cleared on sign-out; editing-customer record (allergies, conditions) can show to the next tenant on a shared machine | open | Fix recommended (privacy) |
| WR-03 | Calendar reads time-only values as wall clock; list view treats them as UTC | open | Live column is `time without time zone` (verified 2026-11-10); compare one appointment in List vs Day |
| WR-04 | `clockToMinutes` returns null for malformed `T..:..:..:..Z` timestamps repaired by time-utils | open | |
| WR-05 | `noValidate` removed email validation; start time not enforced; end <= start accepted | open | |
| WR-06 | Snapping time inputs on every change may break typing minutes | open | Check in a browser |
| WR-07 | Enter in the customer picker replaces typed free text with first suggestion | open | |
| WR-08 | Picking a suggestion while a request is in flight leaves the spinner stuck | open | |
| WR-09 | Staff names compared case-sensitively in conflict detection and columns | open | |
| WR-10 | `softDeleteAppointment` has no zero-row check; update/status/delete do not filter `deleted_at` | open | |
| WR-11 | `fetchPatientAttachments` sends up to 200 UUIDs in an IN list and silently truncates beyond 200 consultations | open | |
| WR-12 | CSV export formula injection from externally sourced names; `revokeObjectURL` called right after `click()` | open | |
| WR-13 | RLS migration: products write policies, generate_order_id security mode, replayability | resolved (partly) | Live check 2026-11-10: `products_{insert,update,delete}_own` exist for authenticated; `generate_order_id` is SECURITY DEFINER with search_path=public. Remaining: the file is not replayable on a fresh database because `*_own` policies on bills, bill_items, clients, appointments are not created by any repo migration (accepted, known drift, see STATE.md blockers) |
| IN-01..IN-06 | Accessibility, labels, off-grid end time, silent caps, bounds, minor render issues | open | Low priority |
