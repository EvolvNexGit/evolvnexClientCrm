# Phase 2: Consultation and print - Pattern Map

**Mapped:** 2026-11-10
**Files analyzed:** 16 (new/modified)
**Analogs found:** 14 / 16 (all analog paths verified git-tracked)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/20261111_consultations_vitals.sql` | migration | CRUD | `supabase/migrations/20261110_customers_clinical_fields.sql` | exact |
| `supabase/migrations/20261111_print_settings.sql` | migration | CRUD | `supabase/migrations/20261108_phase0_tighten_rls.sql` (policies) + `20260814_whatsapp_auto_replies.sql` (create table + GRANT, lines 72-86, 122-124) | role-match |
| `supabase/migrations/20261111_consultation_files_storage.sql` | migration | file-I/O | same two files (storage.objects policies have no repo analog) | partial |
| `src/lib/consultation-vitals.ts` (new, pure) | utility | transform | `src/lib/list-pagination.ts` (pure, no `@/` imports) | role-match |
| `src/lib/consultation-types.ts` (mod) | model | - | itself (Record/Payload convention) | exact |
| `src/lib/consultation-queries.ts` (mod) | service | CRUD + file-I/O | itself: `addConsultationAttachment`, `deleteConsultationAttachment`, `updateConsultation`, `buildConsultationRow`, `mapPatient` | exact |
| `src/lib/print-settings-types.ts` (new) | model | transform | `src/lib/consultation-types.ts` | role-match |
| `src/lib/print-settings-queries.ts` (new) | service | CRUD (upsert) | `src/lib/communication-credentials.ts` (upsert/maybeSingle) + `consultation-queries.ts` (getClient/raiseQueryError) | role-match |
| `src/hooks/use-print-settings.ts` (new) | hook | CRUD | `src/hooks/use-whatsapp-auto-replies.ts` | exact |
| `src/hooks/use-consultations.ts` (mod) | hook | CRUD | itself (shell object at ~186-212 needs `vitals: null`) | exact |
| `src/components/dashboard/print/print-sheet.tsx` (new) | component | transform | none in repo (use RESEARCH Pattern 4) | no analog |
| `src/components/dashboard/print/print-settings-modal.tsx` (new) | component | request-response | `src/components/dashboard/billing/entity-modal.tsx` consumers | role-match |
| `src/components/dashboard/tabs/consultation-tab.tsx` (mod) | component | CRUD | itself | exact |
| `src/components/dashboard/patient/patient-files-panel.tsx` (mod) | component | request-response | itself (lines 60-84) | exact |
| `src/app/globals.css` (mod) | config | - | itself (lines 60-64 html/body rule) | exact |
| `.planning/codebase/{CHANGELOG,INTEGRATIONS,STRUCTURE}.md` (mod) | docs | - | existing | exact |

## Pattern Assignments

### Query layer: `src/lib/consultation-queries.ts` (service, CRUD)

Local helpers to reuse (lines 47-58):
```typescript
function getClient() {
  const supabase = getSupabaseClient();
  if (!supabase) { throw new Error("Missing Supabase environment variables."); }
  return supabase;
}
function raiseQueryError(error: unknown, fallback: string): never {
  throw new Error(formatSupabaseError(error, fallback));
}
```
- `CONSULTATION_SELECT` (line 22-45): add `vitals` column; change line 43 to `customers:patient_id (id, name, phone, dob, allergies)`.
- `mapPatient` (72-86): add `allergies: (patient.allergies as string | null) ?? null`. Shared with queue mapper (default null keeps both valid).
- `buildConsultationRow` (165-183): add `vitals: payload.vitals ?? null,` before `updated_at`.
- `updateConsultation` (678+): follow the `if (payload.x !== undefined) updateRow.x = ...` style: `if (payload.vitals !== undefined) updateRow.vitals = payload.vitals;`
- `mapConsultationRecord`: `vitals: parseVitals(row.vitals)`; attachment mapper (~285-297) add `storage_path: (item.storage_path as string | null) ?? null`.
- New upload/sign/remove functions: copy `addConsultationAttachment` (637-660) for the `auth.getUser()` + insert shape and `deleteConsultationAttachment` (662-676) for `.eq("client_id", clientId).eq("id", attachmentId)`. Storage code body is in 02-RESEARCH.md "Storage calls". Remove object first, require `data.length === 1`, then delete row.

```typescript
const { error } = await supabase.from("consultation_attachments").insert({
  client_id: clientId, consultation_id: consultationId,
  file_name: payload.fileName.trim(), file_url: payload.fileUrl.trim(),
  mime_type: payload.mimeType ?? null, file_size: payload.fileSize ?? null, uploaded_by: user?.id ?? null,
});
if (error) { raiseQueryError(error, "Unable to add consultation attachment."); }
```
Keep `addConsultationAttachment` (legacy URL path) intact (D-04).

### `src/lib/print-settings-queries.ts` (service, upsert)

Analog: `src/lib/communication-credentials.ts` lines 56, 104 (`.maybeSingle()`, `.upsert(`). Use the `getClient`/`raiseQueryError` local-helper duplication convention (AGENTS.md). Pattern: `fetchPrintSettings(clientId)` -> `.eq("client_id", clientId).maybeSingle()`; null row -> `DEFAULT_PRINT_SETTINGS`. `savePrintSettings(clientId, payload)` -> clamp, build row with `client_id` written LAST (after spread), `.upsert(row, { onConflict: "client_id" })`. `print-settings-types.ts` must stay import-free (`clampPrintMargins`, `DEFAULT_PRINT_SETTINGS`, `*Record` snake_case vs `*Payload` camelCase per AGENTS).

### `src/hooks/use-print-settings.ts` (hook)

**Analog:** `src/hooks/use-whatsapp-auto-replies.ts` lines 1-52. Copy:
```typescript
"use client";
import { useCallback, useEffect, useState } from "react";
import { formatSupabaseError } from "@/lib/supabase";
// state: settings, loading, saving, error: string | null
const refresh = useCallback(async () => {
  try { setLoading(true); setError(null); /* fetch */ }
  catch (fetchError) { setError(formatSupabaseError(fetchError, "Unable to load ...")); }
  finally { setLoading(false); }
}, [clientId]);
useEffect(() => { void refresh(); }, [refresh]);
// mutator: setSaving(true); try {...} catch (saveError) { setError(...); throw saveError; } finally { setSaving(false); }
```
Return `{ settings, loading, saving, error, refresh, save }`.

### `src/components/dashboard/print/print-settings-modal.tsx`

**Analog:** `EntityModal` (`src/components/dashboard/billing/entity-modal.tsx` lines 6-14 props `{open,title,onClose,children,contentClassName}`; named export, full-width on mobile). Wrap four number inputs (`min-h-11`, `inputMode="decimal"`), show hint "tune with a test print", call hook `save`, display `error`. Use `cn()` from `@/lib/utils`, tokens `bg-card text-text border-border`.

### `src/components/dashboard/print/print-sheet.tsx`

No in-repo analog. Use 02-RESEARCH.md "Print: shared sheet + global rule" verbatim (portal to `document.body`, `data-print-root`, `bg-white text-black`, spacer thead/tfoot, numbers only into CSS). `"use client"` first line, named export.

### `src/app/globals.css`

Existing rule at lines 60-64 (`html, body { height:100%; min-height:100dvh }`) is why the `@media print` block must reset `height:auto; overflow:visible`. Append the global `@media print { body > *:not([data-print-root]) { display:none !important } ... }` block from RESEARCH.

### `src/components/dashboard/tabs/consultation-tab.tsx` (modify)

- Save paths (lines 658-682): `handleSaveDraft` forces `"DRAFT"` and `handleSaveComplete` does `setMode("queue"); clearActiveConsultation(); setSelectedRow(null);`. D-11: disable/hide Save Draft and Save & Complete when `activeConsultation.status` is Completed (buttons at ~1118-1136 and ~1586-1595).
- Queue buttons: `disabled={saving || row.status === "Completed"}` at lines 1002 and 1065; change label to "View / Print" and enable for Completed (`startConsultation` in `use-consultations.ts:108-113` already loads without changing status).
- Editor root: `<div className="space-y-6">` line 1097; place `PatientStrip` (sticky, `top-0 z-20 bg-card`) as direct child right after the header `<section>` (RESEARCH "Sticky strip").
- Attachment list (1470-1500) currently `href={attachment.file_url}` unguarded. Replace with shared open helper: legacy rows keep `^https?://` guard, new rows (`storage_path`) sign at click time.
- `payloadFromForm(editorForm, medications, exercises)`: add vitals form fields -> `normalizeVitals`; surface out-of-range message instead of saving.
- `HistorySummary` (line 305): add Print button.
- Hidden `PrescriptionPrint` inside `PrintSheet` always mounted while consult loaded; Print button = `window.print()`.

### `src/components/dashboard/patient/patient-files-panel.tsx`

Lines 60-84: `SAFE_URL_PATTERN` guards link render of `file.file_url`. Same shared resolve/open helper must be used here; for `storage_path` rows render an "Open" button that calls `getConsultationFileUrl` then opens (open blank tab synchronously first for mobile Safari).

### Migrations

**Header convention** (`20261108_phase0_tighten_rls.sql` lines 1-6): comment stating idempotent, applied to live via MCP, RLS never off, no anon grants. **Policy idiom** (lines 11-30):
```sql
alter table public.tasks enable row level security;
drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks for select to authenticated
using (public.crm_can_access_client(client_id));
-- insert: with check (...); update: using + with check; delete: using
```
`20261110_customers_clinical_fields.sql` header line 3-4: "Apply to live BEFORE deploying code that selects these columns" - repeat in vitals/storage migration headers. Explicit grants idiom: `20260814_whatsapp_auto_replies.sql:122-124` (`grant select, insert, update, delete on ... to authenticated;`). Full SQL bodies (vitals CHECK, print_settings, bucket + storage.objects policies with CASE-guarded uuid cast, `storage_path` column + `file_url drop not null`) are in 02-RESEARCH.md Code Examples; use those.

## Shared Patterns

- **Tenancy:** every query `.eq("client_id", clientId)`; `clientId` from `useClient()` passed as the first arg; on insert/upsert write `client_id` last. Storage path always `${clientId}/${consultationId}/${uuid}-${safeName}`.
- **Errors:** `raiseQueryError(error, "user-facing fallback")` in query modules; hooks convert to `string | null` via `formatSupabaseError`; UI via `DataState` (`src/components/dashboard/billing/data-state.tsx`). No `console.log`; never log signed URLs.
- **Style:** `@/` imports, `type` over `interface`, `import type`, kebab-case, named exports for widgets, `cn()` from `@/lib/utils`, no new deps, no `any` on mapped rows (`Record<string, unknown>`).
- **Type ripple:** adding `vitals`/`storage_path` to `ConsultationRecord`/attachment type forces updates in `use-consultations.ts` `addConsultation` shell object (~186-212).
- **Validation:** `parseVitals` (read, untrusted jsonb) and `normalizeVitals` (write, range) live in dependency-free `consultation-vitals.ts` so `node` smoke tests work; temperature per D-09 is Celsius (range 30-45).
- **No test runner:** gates are `npx tsc --noEmit`, `npm run build`, node smoke scripts for pure helpers, SQL probes, manual UAT.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `print-sheet.tsx` | component | print/portal | No print or portal code exists; use RESEARCH Pattern 4 |
| storage.objects policies (in storage migration) | migration | file-I/O | No Storage usage in repo (`INTEGRATIONS.md` says none); use RESEARCH Pattern 1 |

## Metadata

**Analog search scope:** `src/lib`, `src/hooks`, `src/components/dashboard`, `supabase/migrations`
**Files scanned:** about 15 read or grepped
**Pattern extraction date:** 2026-11-10
