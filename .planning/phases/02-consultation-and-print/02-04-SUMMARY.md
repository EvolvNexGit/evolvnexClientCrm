---
phase: 02-consultation-and-print
plan: 04
subsystem: print-settings
tags: [print, letterhead, margins, print-settings, rls, consultation]
status: complete
requirements: [PRNT-01]
commits: 2
plan_head_before: 7449e4a3cdd282db1e0a42071febd2df39789349
plan_head_after: b264c348fc507ed95b69d7446fb40589bc0b9543
actuals:
  tasks: 2
  commits: 2
provides:
  - "src/lib/print-settings-types.ts: import-free PrintMargins types, bounds, clampPrintMargins, parseMarginMm, parseMarginsForm, marginsToForm"
  - "fetchPrintSettings (maybeSingle, null when no row) and savePrintSettings (clamped upsert, client_id last, onConflict client_id)"
  - "usePrintSettings: margins, hasSavedSettings, ready, loading, saving, error, saveError, save, refresh"
  - "PrintSettingsModal with inline validation and Test print, opened from the consultation queue header"
  - "PrintSheet, usePrintJob<T>, @media print isolation: shared print mechanism for prescriptions (02-05) and Phase 3 receipts"
affects: [02-05, 02-06]
key-files:
  created:
    - src/lib/print-settings-types.ts
    - src/lib/print-settings-queries.ts
    - src/hooks/use-print-settings.ts
    - src/hooks/use-print-job.ts
    - src/components/dashboard/print/print-settings-modal.tsx
    - src/components/dashboard/print/print-sheet.tsx
    - src/components/dashboard/print/test-print-body.tsx
  modified:
    - src/app/globals.css
    - src/components/dashboard/tabs/consultation-tab.tsx
key-decisions:
  - "Only numbers from clampPrintMargins reach inline styles; the style element is the static string @page { margin: 0; } (CSS injection guard, T-02-20)"
  - "ready is false while loading or after a failed load; a failed save keeps the last loaded margins usable (T-02-22)"
  - "Test print sheet sits outside EntityModal so it survives the modal closing during the print dialog"
  - "Modal form re-initialises only when open changes, so a background refresh never overwrites typing"
coverage:
  - id: TSC
    description: "npx tsc --noEmit, errors outside src/lib/web-push-server.ts: 0 after each task"
    status: pass
  - id: SMOKE
    description: "node smoke test of print-settings-types.ts (clamp of hostile input, blank means 0, out-of-range/NaN rejected, form parse, round trip) prints 'print settings smoke ok'"
    status: pass
  - id: GREP
    description: "Static grep gates for tasks 1 and 2 (zero imports in types, onConflict, client filter, maybeSingle, client_id last in save, ready/saveError, portal, data-print-root, @page rule, print:block, afterprint, requestAnimationFrame, @media print, no dangerouslySetInnerHTML)"
    status: pass
  - id: DEPS
    description: "git diff -- package.json package-lock.json empty"
    status: pass
  - id: HUMAN
    description: "Live save/reload of margins, inline validation, Chrome/Edge print preview and PDF measurement"
    status: needs-browser-verification
---

# Plan 02-04 summary

Clinics can save header, footer, left and right letterhead margins (mm) once from the consultation queue, and the shared print mechanism (PrintSheet, usePrintJob, print CSS) exists and is exercised by a Test print.

## Tasks

1. Tracer (19bcf44): import-free `print-settings-types.ts` (bounds header/footer 0-100, left/right 0-50, one decimal, blank is 0); `fetchPrintSettings` filters `client_id`, uses `maybeSingle`, returns null for no row; `savePrintSettings` clamps then upserts with `onConflict: "client_id"` and `client_id` written after the spread; `usePrintSettings` with the `ready` flag and separate `error`/`saveError`; `PrintSettingsModal` (four `min-h-11` number inputs, inline range errors, letterhead hint, "Nothing saved yet" note); Print settings button and modal mounted in the queue branch, load error shown as an extra banner line.
2. Shared print mechanism (b264c34): `PrintSheet` body portal (`data-print-root`, `hidden bg-white text-black print:block`, static `@page { margin: 0; }`, thead/tfoot mm spacers, padded body cell); `usePrintJob<T>` (payload plus nonce, print inside requestAnimationFrame after commit, afterprint clears); `TestPrintBody` dashed A4 body-area box; one `@media print` block in `globals.css` (hide other body children with display none, reset html/body height, overflow, colors); Test print button in the modal using the valid draft margins, disabled while saving or invalid.

## Deviations from Plan

None - plan executed as written. Notes: no `eslint-disable` comments (project rule); the open-keyed effect in the modal has no suppression comment. The `npm run build` was not run (not in this plan's verify commands; the baseline web-push-server.ts error would affect it).

## Needs human / browser verification

- Live, as the doctor test client: Print settings, save 30/20/15/15, reload, reopen: values persist; `select * from public.print_settings` shows exactly one row for the client. Enter 150 header, blank footer, abc right: inline range messages, nothing sent; blank accepted as 0; with no row the "Nothing saved yet" note shows.
- Chrome/Edge, dark theme: Test print with 30/20/15/15, Margins Default in preview: only the dashed box page, black on white, no URL/date/page-number text, box inset about 30 mm top, 15 mm left/right (measure in a PDF). Test print twice in a row; close the modal right after pressing Test print; dashboard returns to normal after the dialog closes.
- Safari is not a supported print browser (unreliable `@page`); record in plan 02-06 docs.
- Not browser-checked: `typeof document` early return plus `createPortal` in the same commit as the print request (only mounts after a click).

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

All created files exist; commits 19bcf44 and b264c34 are on branch feature/doctor-crm-phase1.
