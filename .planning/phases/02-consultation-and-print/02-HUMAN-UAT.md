---
phase: 02-consultation-and-print
status: pending
created: 2026-11-10
requirements: [CONS-01, CONS-02, CONS-03, PRNT-01, PRNT-02]
---

# Phase 2 consolidated browser UAT

One checklist for the whole phase, built from the "needs browser verification" lists of 02-02 to 02-05 and the human checks of 02-06. Run against live (migrations already applied 2026-11-10) with `npm run dev` or a deployed build.

**Test client (doctor):** `eafea940-a6d1-4aa2-95e2-339f614502ea`. **Supported print browsers:** Chrome and Edge. Use a patient with allergies recorded and one with none recorded. Mark each item PASS / FAIL with a note.

Known limits to keep in mind, not defects: Safari is not a supported print browser; HEIC uploads are rejected by design (export as JPG first); the test print assumes A4.

## A. Vitals and patient strip (CONS-01, CONS-02)

- [ ] A1. Open a consult for a patient with allergies. The strip (name, age, allergies) shows a red allergy pill; it stays pinned while the form scrolls at 1280px and 390px.
- [ ] A2. Open a consult for a patient with no allergies recorded. The strip shows muted "not recorded", never "none" or "NKDA". Long allergy text clamps to two lines.
- [ ] A3. The strip is absent while "Loading consultation..." shows.
- [ ] A4. Enter all five vitals (BP, pulse, temperature in C, weight, SpO2), Save as Draft, reload, reopen: values persist.
- [ ] A5. Clear all vitals and save: stored as null (empty fields on reopen, no error).
- [ ] A6. Temperature 98.6 is blocked with a Celsius message and the page scrolls to the vitals card; pulse 500 is blocked with its message; no save request is sent for a blocked save (check the Network tab).
- [ ] A7. At 390px the vitals grid is two columns with no horizontal scrollbar.

## B. Attachments (CONS-03) and tenant isolation

- [ ] B1. Upload a PDF and a JPG to a consult. Both appear in the list; Open opens each in a new tab through a short-lived link (the URL contains a token, not a public path).
- [ ] B2. About 5 minutes later, the same link has expired; pressing Open again gives a fresh working link.
- [ ] B3. Rejections show an inline message and send nothing: a `.svg`, a `.txt`, a 12 MB PDF.
- [ ] B4. Type a finding without saving, then upload a file: the typed finding survives.
- [ ] B5. Delete a file (confirm dialog appears): it leaves the list and the object is gone in the Supabase Storage dashboard.
- [ ] B6. Legacy rows: an `https` name+URL row still opens as a link; a row with a non-http value (for example `javascript:alert(1)`) shows as plain text with no link, both in the consult editor and in the Patient profile Files tab. The Files tab Open button also works for bucket rows.
- [ ] B7. Pop-up blocked: with pop-ups blocked, Open shows a message and does not navigate away from the form. At 390px Open works without leaving the form.
- [ ] B8. Isolation: as a second tenant (or logged out), request the first file's object path through the storage API, both authenticated and via the public object URL (`/storage/v1/object/public/consultation-files/...`). Expect 400 or 404, never the file.

## C. Print settings (PRNT-01)

- [ ] C1. Open Print settings from the queue header, save header 30, footer 20, left 15, right 15, reload the page and reopen: values persist. `select * from public.print_settings` shows exactly one row for the client.
- [ ] C2. Enter 150 in header, blank in footer, `abc` in right: inline range or number messages, nothing sent; a blank field is accepted as 0.
- [ ] C3. With no saved row the "Nothing saved yet" note shows.
- [ ] C4. Chrome, Margins set to Default, dark theme on: press Test print, Save as PDF. Only the dashed box page prints, black on white, with no URL, date or page-number text; the box is inset about 30 mm top, 15 mm left and right (measure in the PDF).
- [ ] C5. Press Test print twice in a row; close the modal right after pressing Test print; the dashboard returns to normal after the dialog closes.
- [ ] C6. Block the `print_settings` request in dev tools (or go offline) and reload: the page shows the load error and every Print button (queue, history, editor) is disabled.

## D. Prescription print and read-only completed consults (PRNT-02, D-11)

- [ ] D1. Complete a consult with vitals, medications (with notes), advice, follow-up and an attached file.
- [ ] D2. Queue, Completed Today, at 1280px and 390px: the row shows an enabled "View / Print" and opens the read-only view: strip, vitals, notes, medications, follow-up and files with Open; no Save as Draft, Save & Complete, Cancel Consult or upload control.
- [ ] D3. Print from that view (Chrome, Margins Default, Save as PDF): only the patient line (name, age, date), medications with notes, advice and follow-up; black on white; inset by the saved margins; no vitals, findings, assessment, exercises, app chrome, URL or date header text.
- [ ] D4. Back to Queue: the row is still Completed.
- [ ] D5. Patient History: a Completed visit has a Print icon on its row and a Print button in its summary; the summary now shows vitals; non-Completed visits have no Print.
- [ ] D6. A consult with 25 medications: prints onto page 2 with the header and footer spacing repeated on page 2 and rows not split across pages.
- [ ] D7. A Completed consult with no prescription content prints "No prescription content recorded."
- [ ] D8. With Print settings never saved (new test client, or the row deleted), margins print as 0.
- [ ] D9. Dark theme: the print is still black on white.
- [ ] D10. The follow-up date on the sheet matches the stored date (no off-by-one) in the IST browser.

## E. Regression (Phase 1 and other tenants)

- [ ] E1. Doctor client: Appointments List, Day and Week views load and behave as before; the Patient profile drawer (Overview, Visits, Files) opens normally.
- [ ] E2. Cafe client: Customers, Billing and Summary load as before.
- [ ] E3. The cafe client sees no consultation tab, print settings or clinical UI.

## Result

| Section | Result | Notes |
|---------|--------|-------|
| A Vitals and strip | | |
| B Attachments and isolation | | |
| C Print settings | | |
| D Prescription print | | |
| E Regression | | |
