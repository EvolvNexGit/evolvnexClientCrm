---
phase: 02-consultation-and-print
plan: 02
subsystem: consultation-ui
tags: [vitals, patient-strip, allergies, consultation]
status: complete
requirements: [CONS-01, CONS-02]
commits: 3
plan_head_before: 3ec7abfe3a2b0f7e6dd2467103529b4c30196daf
plan_head_after: 3ddd6b3cf7ac9d122d52b31d4fd099e35a3d74ba
actuals:
  tasks: 3
  commits: 3
provides:
  - "PatientStrip: sticky name/age/allergies strip, three allergy states (text, not recorded, unavailable)"
  - "src/lib/consultation-vitals.ts: dependency-free parseVitals, normalizeVitals, vitalsToForm, VITAL_FIELDS, VITAL_RANGES"
  - "consultations.vitals read/write through types, select, mapper, build and update paths"
  - "VitalsCard in consult editor with validate-before-save"
affects: [02-03, 02-04, 02-05]
key-files:
  created:
    - src/lib/consultation-vitals.ts
    - src/components/dashboard/patient/patient-strip.tsx
    - src/components/dashboard/consultation/vitals-card.tsx
  modified:
    - src/lib/consultation-types.ts
    - src/lib/consultation-queries.ts
    - src/hooks/use-consultations.ts
    - src/components/dashboard/tabs/consultation-tab.tsx
key-decisions:
  - "Blank/whitespace allergies map to null (not recorded), never a reassuring default"
  - "updateConsultation writes vitals only when payload.vitals !== undefined, so status-only updates keep stored vitals"
  - "Temperature stored as plain Celsius number; 98.6 rejected with a Celsius message (D-09)"
coverage:
  - id: TSC
    description: "npx tsc --noEmit, errors outside src/lib/web-push-server.ts: 0 after each task"
    status: pass
  - id: SMOKE
    description: "node smoke test of consultation-vitals.ts (parse, blank-to-null, valid, six invalid cases, partial, Celsius message) prints 'vitals smoke ok'"
    status: pass
  - id: GREP
    description: "Static grep gates for tasks 1-3 (select, sticky class, states, no NKDA wording, wiring, no browser storage, no import in vitals module)"
    status: pass
  - id: DEPS
    description: "git diff -- package.json package-lock.json empty"
    status: pass
  - id: HUMAN
    description: "Sticky behaviour, allergy pill visuals, vitals persistence/blank-null/98.6 block, 390px layout"
    status: needs-browser-verification
---

# Plan 02-02 summary

Doctors can record vitals (BP, pulse, temperature in C, weight, SpO2) on a consultation and see a patient strip pinned while the form scrolls.

## Tasks

1. Patient strip tracer (57e64b6): `customers:patient_id` embed now selects `allergies`; `mapPatient` returns trimmed string or null; `PatientStrip` rendered as a direct child of the editor wrapper after the header, only when the consult is loaded and not loading.
2. Vitals data layer (9670cf3): `consultation-vitals.ts` (zero imports, erasable TS only); `vitals` added to record, payload, select, mapper (`parseVitals`), `buildConsultationRow`, conditional `updateConsultation` write, and the `addConsultation` fallback shell in the hook.
3. Vitals card (3ddd6b3): `VitalsCard` (id `consult-vitals`, `grid-cols-2 sm:grid-cols-3 xl:grid-cols-5`, `min-h-11` inputs); tab gets `vitalsForm`/`vitalsError` state, rehydrates in the activeConsultation effect, and `buildSavePayload()` gates both save handlers via `normalizeVitals`.

## Deviations from Plan

None - plan executed as written. Notes: node 24 imports the `.ts` helper directly (prints a harmless MODULE_TYPELESS_PACKAGE_JSON warning); the strip is rendered before the `error` banner as specified.

## Needs human / browser verification

- Strip stays pinned inside the dashboard overflow-y-auto shell at 1280px and 390px; red pill for recorded allergies (two-line clamp), muted "not recorded" otherwise; strip absent during "Loading consultation...".
- Vitals save, reopen, persist; clearing all fields stores SQL null; 98.6 temperature blocks with Celsius message and scrolls to card; pulse 500 blocks; no request on blocked save; two-column grid at 390px with no horizontal scroll.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Files exist and commits 57e64b6, 9670cf3, 3ddd6b3 are on branch feature/doctor-crm-phase1.
