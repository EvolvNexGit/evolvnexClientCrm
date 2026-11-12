---
phase: 02-consultation-and-print
plan: 05
subsystem: prescription-print
tags: [print, prescription, read-only, consultation, history]
status: complete
requirements: [PRNT-02]
commits: 2
plan_head_before: 5ddc3936e04f6eb38209053d98f9fef008910ea0
plan_head_after: 233429eed324fae8e2972d888ad2dea8d5153abf
actuals:
  tasks: 2
  commits: 2
provides:
  - "PrescriptionPrint: body-only sheet content (patient line, medications table, medication notes, advice, follow-up, empty sentence) in explicit black pt sizes"
  - "ConsultationSummaryBody and SummarySection in consultation-summary.tsx, shared by HistorySummary and the read-only completed view, now including vitals"
  - "Print entry points: Print icon per Completed history row, Print in the visit summary, View / Print on Completed queue rows, Print in the read-only editor"
  - "Read-only Completed consult editor (isReadOnly) with Open-only attached files"
affects: [02-06]
key-files:
  created:
    - src/components/dashboard/consultation/prescription-print.tsx
    - src/components/dashboard/consultation/consultation-summary.tsx
  modified:
    - src/components/dashboard/tabs/consultation-tab.tsx
key-decisions:
  - "Printable payload is the exact ConsultationDetail fetched for the clicked visit (or the loaded active consult); handlePrintVisit refuses anything not Completed"
  - "Every print button is disabled while printSettings.ready is false (T-02-22)"
  - "Dates are formatted from the stored YYYY-MM-DD parts (formatDateOnly), no timezone shift"
  - "History Print icon is a sibling of the row button, not nested"
  - "handleRemoveAttachment also early-returns when read-only (extra to the four handlers in the plan)"
coverage:
  - id: TSC
    description: "npx tsc --noEmit, errors outside src/lib/web-push-server.ts: 0 after each task"
    status: pass
  - id: GREP
    description: "Static gates for tasks 1 and 2 (empty sentence, formatDateOnly, text-black, no theme tokens or non-D-10 fields or raw HTML injection in the print file; usePrintJob/PrintSheet/PrescriptionPrint/handlePrintVisit/printSettings.ready wired; View / Print x2, no Completed disable, isReadOnly x9, shared summary, no local SummarySection, printSettingsModal rendered twice)"
    status: pass
  - id: DEPS
    description: "git diff --name-only -- package.json package-lock.json empty"
    status: pass
  - id: HUMAN
    description: "Chrome/Edge print preview, read-only view on a real Completed consult, mobile viewport, forced settings failure, 25-medication multi-page sheet"
    status: needs-browser-verification
---

# Plan 02-05 summary

A Completed consult now prints body-only on pre-printed letterhead using the saved margins, from Patient History, the queue and the editor, and Completed consults open read-only and can never be un-completed from that screen (PRNT-02; D-06, D-10, D-11).

## Tasks

1. Tracer (b0098a4): `PrescriptionPrint` (one-line patient name, age, date; medications table with break-inside-avoid rows; medication notes; advice; follow-up date and notes; "No prescription content recorded." when empty; black on white, pt sizes, no theme tokens, React text nodes only). `consultation-tab.tsx` wiring: `usePrintJob<ConsultationDetail>`, `handlePrintVisit` (settings-ready guard, fetch by id, null and non-Completed refusal messages, finally clears busy state), `PrintSheet` with saved margins, per-row Print icon button for Completed history rows as a sibling of the row button, role=alert error line.
2. Expansion (233429e): `consultation-summary.tsx` extracted from HistorySummary (vitals chips from VITAL_FIELDS added; follow-up notes alone now count as content); HistorySummary gets an optional Print button for Completed visits; queue Completed rows show an enabled "View / Print" in both mobile and desktop views; `isReadOnly` Completed editor hides Save as Draft, Save & Complete, Cancel Consult, upload and the form, shows the summary and a read-only Open-only file list, header offers Back to Queue, Print settings and Print; save/complete/cancel/upload (and remove) handlers early-return; Print settings modal moved to one `printSettingsModal` const rendered in both branches.

## Deviations from Plan

None - plan executed as written. Small additions: `handleRemoveAttachment` also guards on `isReadOnly`; `hasContent` in the shared summary includes follow-up notes so "No notes were recorded" never shows next to a Follow-up section. `npm run build` was not run (baseline web-push-server.ts error).

## Needs human / browser verification

- Chrome/Edge, doctor test client: print a Completed history visit with medications, advice, follow-up (Margins Default, Save as PDF): only patient line, medications table with notes, advice, follow-up, black on white, inset by saved margins, no URL/date text. Empty visit prints "No prescription content recorded."; with no saved settings margins are 0.
- Settings load failure (offline/blocked request): every Print button disabled, page banner shows the error.
- Queue at 1280px and 390px: Completed row shows View / Print and opens the read-only view (strip, vitals, notes, medications, follow-up, files with Open, no save/cancel/upload); Print works; Back to Queue leaves the row Completed.
- 25-medication consult: continues onto page 2 with header/footer spacers repeated, rows not split.
- History summary of a Completed visit shows vitals and a Print button; non-Completed rows have no Print.
- The date shown on the sheet matches the stored follow-up date (no off-by-one) in the IST browser.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Created files exist; commits b0098a4 and 233429e are on branch feature/doctor-crm-phase1; package.json and package-lock.json unchanged.
