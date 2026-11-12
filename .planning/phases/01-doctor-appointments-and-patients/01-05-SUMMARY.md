---
phase: 01-doctor-appointments-and-patients
plan: 05
subsystem: patients
tags: [nextjs, react, supabase, patient-profile, drawer, allergies]
status: complete

requires:
  - "01-03: customers clinical fields (gender, blood_group, allergies, chronic_conditions)"
provides:
  - "PatientProfileDrawer slide-over (Overview, Visits, Files) opened from the customer list for clients with the consultation tab"
  - "fetchPatientAttachments(clientId, patientId) and shared mapAttachmentRow in consultation-queries"
affects: [01-07 end-of-phase UAT]

actuals:
  tokens: 11000
  tasks: 2
  commits: 2
plan_head_before: 45e53cde785dd561c07beadc20dd92347a8b8452
plan_head_after: 407224a63e513e0d2bc10391ba18106b78b0861c

tech-stack:
  added: []
  patterns:
    - "Slide-over adapted from EntityModal structure; body component keyed by patient id so tab and panel state reset per patient"
    - "Panel effects use a cancelled flag + cleanup so stale responses cannot render across patients"
    - "Plain useState for open patient (never usePersistentState) so clinical data stays out of localStorage"

key-files:
  created:
    - src/components/dashboard/patient/patient-profile-drawer.tsx
    - src/components/dashboard/patient/patient-overview-panel.tsx
    - src/components/dashboard/patient/patient-visits-panel.tsx
    - src/components/dashboard/patient/patient-files-panel.tsx
  modified:
    - src/lib/consultation-queries.ts
    - src/components/dashboard/billing/customer-table.tsx
    - src/components/dashboard/tabs/customer-tab.tsx

key-decisions:
  - "Name cell / mobile name block rendered as buttons only when hasClinicalFields; desktop row click handles opening, Actions cell stops propagation"
  - "mapAttachmentRow coerces mime_type via String() when non-null (was passed through as-is); type-safe with Record<string, unknown> input"
  - "Files panel shows non-http(s) URLs as plain text under the file name"

requirements-completed: [PAT-02]

coverage:
  - id: D1
    description: "Patient profile drawer with Overview (red allergy pills, 'Not recorded' for empty), Visits, Files; clinic clients only; Edit/Deactivate do not open it"
    requirement: PAT-02
    verification:
      - kind: other
        ref: "tsc gate (errors outside web-push-server.ts) = 0 after both tasks; Task 1 and Task 2 static greps pass; no usePersistentState/localStorage in patient components; package.json/lock unchanged"
        status: pass
      - kind: manual_procedural
        ref: "Plan 01-07 UAT: doctor client, two patients, switch tabs while Files loading, Edit does not open drawer, 390px width full-width drawer"
        status: unknown
---

# Phase 1 Plan 05: Patient profile drawer Summary

Staff can click a patient row (desktop) or name block (mobile) to open a right slide-over with Overview (allergies first as red pills with a warning icon, or "Not recorded"), Visits (consultation history) and Files (existing consultation attachments), shown only for clients with the consultation tab.

## Accomplishments

- Task 1 (tracer): `PatientProfileDrawer` and `PatientOverviewPanel`, row/card click wiring in `customer-table.tsx` (new `clientId` prop, plain `useState` for `profilePatient`, Actions cell `stopPropagation`, drawer mounted only under `hasClinicalFields`), `customer-tab.tsx` passes `clientId`.
- Task 2: `fetchPatientAttachments` (consultation ids scoped by client and patient, status not CANCELLED, limit 200; early `[]`; attachments by `.in("consultation_id")` and client_id), shared `mapAttachmentRow`, `PatientVisitsPanel`, `PatientFilesPanel` (http/https-only links with `target="_blank"` and `rel="noopener noreferrer"`), tab strip (`role="tablist"`) in a body component keyed by patient id.

## Task Commits

1. Task 1: `cdeee7d` feat(01-05): patient profile drawer with Overview and red allergy pills
2. Task 2: `407224a` feat(01-05): add Visits and Files tabs and patient attachments query

## Deviations from Plan

None - plan executed exactly as written. Implementation notes: the mobile card name block uses a small inline IIFE to switch between button and div so the markup is shared; the tab strip lives in a `PatientProfileBody` component (keyed by patient id) rather than inline in the drawer so `activeTab` state resets per patient.

## Verification

- TypeScript gate (`npx tsc --noEmit | grep "error TS" | grep -v web-push-server.ts | wc -l`) = 0 after each task.
- Task 1 and Task 2 static greps pass.
- Tracer gate: automated-only verify re-run end-to-end before Task 2 and passed (tracer verified, expanding).
- `git diff --name-only -- package.json package-lock.json` empty. Nothing executed against live Supabase.

## Pending Human Verification

As the doctor test client: open Patient tab, click a patient with consultations and attachments, switch Overview / Visits / Files; click another patient quickly while Files is loading; try a patient without consultations; click Edit on a row (must open the edit modal, not the drawer); at 390px width drawer is full width and scrolls vertically only. Deferred to end-of-phase UAT (plan 01-07). Requires the 01-03 clinical-fields migration applied to live.

## Known Stubs

None.

## Threat Flags

None. T-01-23 (client_id scoping on both queries, attachments only for client-scoped consultation ids), T-01-24 (keyed body + cancelled flags), T-01-25 (http/https-only links, noopener noreferrer), T-01-27 (plain useState, no localStorage) mitigated; T-01-26 and T-01-28 accepted per plan.

## Self-Check: PASSED

- FOUND: src/components/dashboard/patient/patient-profile-drawer.tsx, patient-overview-panel.tsx, patient-visits-panel.tsx, patient-files-panel.tsx
- FOUND commits: cdeee7d, 407224a
