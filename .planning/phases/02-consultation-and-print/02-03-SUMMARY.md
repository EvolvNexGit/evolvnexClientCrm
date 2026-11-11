---
phase: 02-consultation-and-print
plan: 03
subsystem: consultation-attachments
tags: [storage, signed-url, attachments, security, consultation]
status: complete
requirements: [CONS-03]
commits: 2
plan_head_before: 3d1774c7dfb459223170aaed324415c9c4a05451
plan_head_after: 6fb9781f7510503ce430b0ce7a29b85c06aebad6
actuals:
  tasks: 2
  commits: 2
provides:
  - "src/lib/consultation-files.ts: dependency-free bucket constants, validateConsultationFile, safeFileName, isUuid, buildStoragePath, isSafeHttpUrl"
  - "uploadConsultationFile, getConsultationFileUrl (300 s signed URL), fetchConsultationAttachments, deleteConsultationFile"
  - "AttachmentOpenButton: single guarded Open used by the consult editor and PatientFilesPanel"
  - "ConsultationAttachmentRecord.storage_path, mapped on both fetch paths"
affects: [02-06]
key-files:
  created:
    - src/lib/consultation-files.ts
    - src/components/dashboard/consultation/attachment-open-button.tsx
  modified:
    - src/lib/consultation-types.ts
    - src/lib/consultation-queries.ts
    - src/hooks/use-consultations.ts
    - src/components/dashboard/tabs/consultation-tab.tsx
    - src/components/dashboard/patient/patient-files-panel.tsx
key-decisions:
  - "File actions patch only activeConsultation.attachments; editor rehydrate effect keyed on id and updated_at so unsaved notes survive"
  - "Blocked pop-up shows a message and never navigates the current page"
  - "Remove requires exactly one removed storage object before the row is deleted (RLS-hidden object keeps the row)"
  - "addConsultationAttachment, attachFile and deleteConsultationAttachment kept untouched (D-04)"
coverage:
  - id: TSC
    description: "npx tsc --noEmit, errors outside src/lib/web-push-server.ts: 0 after each task"
    status: pass
  - id: SMOKE
    description: "node smoke test of consultation-files.ts (type/size/empty rejection, hostile names, non-uuid throws, javascript/data/null/empty URLs unsafe) prints 'files smoke ok'"
    status: pass
  - id: GREP
    description: "Static grep gates for tasks 1 and 2 (createSignedUrl, upsert false, TTL constant, storage_path, uploadFile, AttachmentOpenButton in tab and panel, updated_at dep, no raw file_url anchor, no getPublicUrl, window.confirm, no SAFE_URL_PATTERN, count check in deleteConsultationFile)"
    status: pass
  - id: DEPS
    description: "git diff -- package.json package-lock.json empty"
    status: pass
  - id: HUMAN
    description: "Live upload, signed open, expiry, delete, legacy rows, 390px pop-up behaviour"
    status: needs-browser-verification
---

# Plan 02-03 summary

Consult attachments now upload to the private `consultation-files` bucket under `client_id/consultation_id/uuid-name`, open through 300 s signed URLs created at click time, and legacy name+URL rows stay readable behind an http(s)-only guard shared by the editor and the Patient Files panel.

## Tasks

1. Tracer (25d939f): pure `consultation-files.ts` (zero imports); `uploadConsultationFile` validates, uploads with `upsert: false` and the file content type, inserts the row (`file_url` null, `storage_path`, mime, size, uploader) and best-effort removes the object if the insert fails; `getConsultationFileUrl`; `fetchConsultationAttachments`; hook `uploadFile` and `patchActiveAttachments`; `AttachmentOpenButton`; editor shows an Upload file control (accept list, 10 MB hint, inline alert) and no name+URL entry; rehydrate effect depends on `[activeConsultation?.id, activeConsultation?.updated_at]`.
2. Removal and shared guard (6fb9781): `deleteConsultationFile` (object first, exactly one removed or raise and delete nothing; legacy rows delete the row only); `removeAttachment(consultationId, attachment)` patches attachments only; delete button confirms via `window.confirm` and has an aria-label; `PatientFilesPanel` uses `AttachmentOpenButton` and `isSafeHttpUrl`, the local pattern constant is gone, non-link legacy URLs still render as text, bucket rows show no raw text.

## Deviations from Plan

None - plan executed as written. Notes: no `eslint-disable` comment was added for the narrowed effect dependency array (project rule: no eslint-disable); a short explanatory comment sits there instead. Node 24 imports the `.ts` helper directly and prints a harmless module-typing warning.

## Needs human / browser verification

- As the doctor test client: upload a PDF and a JPG, open each (new tab, signed URL), expiry after about 5 minutes; type a finding without saving, then upload a third file and confirm the finding survives.
- Reject 12 MB PDF, .svg, .txt (inline message). Delete a file, confirm the object is gone in the Storage dashboard.
- Legacy rows: https URL opens as a link; `javascript:alert(1)` row shows as text with no link, in both the editor and the Patient profile Files tab.
- 390px: Open works on a phone or emulator without navigating away from the form; pop-up blocked message appears when pop-ups are blocked.
- HEIC photos are rejected by design (not in the D-12 allow-list); record as a known limitation in plan 02-06 docs.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Files exist and commits 25d939f, 6fb9781 are on branch feature/doctor-crm-phase1.
