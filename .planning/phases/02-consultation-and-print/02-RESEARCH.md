# Phase 2: Consultation and print - Research

**Researched:** 2026-11-10
**Domain:** Supabase Storage (private bucket + RLS + signed URLs), jsonb column + constraint, per-tenant settings table, browser body-only print (CSS `@page`) in a Next.js 15 / React 19 client app
**Confidence:** MEDIUM overall. HIGH on in-repo code and installed-library signatures; MEDIUM on Supabase/CSS behaviour (official docs); LIVE DB state NOT probed this session (see Environment Availability and Open Questions).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Vitals are one nullable `consultations.vitals jsonb` column with optional keys bp, pulse, temperature, weight, spo2. No new table.
- D-02: A pinned patient strip (name, age, allergies) stays visible at the top of the consult form; allergies are prominent. Data comes from the customers row (Phase 1 clinical fields).
- D-03: Attachments upload to a private Storage bucket `consultation-files`; object path starts with the owning client id; storage policies check `crm_can_access_client` on that folder segment; files open through short-lived signed URLs.
- D-04: Existing name+URL attachment rows stay readable (additive change); only new uploads go to the bucket. No data migration of legacy rows. (Assumption: default chosen by Claude, not discussed.)
- D-05: `print_settings` table, one row per client, columns header_mm, footer_mm, left_mm, right_mm (numeric, defaults 0, bounded), RLS via `crm_can_access_client`. Settings edited once from the consultation area.
- D-06: Body-only print: medications, advice and follow-up only (no clinic header, doctor block or footer; the letterhead is pre-printed). Margins applied through CSS `@page` / print container padding. Print is shared so Phase 3 receipts reuse it.
- D-07: Smallest safe change; no new dependencies; reuse existing consultation tab/queries; every new table and bucket policy has RLS; migrations idempotent and applied to live by Claude via Supabase MCP after user approval; docs updated.
- D-08: Out of scope: drug database, interaction checks, e-prescription signing, audit log (v2 CLIN-01/02).

### Claude's Discretion
None declared in CONTEXT.md. (Areas this research treats as discretion and flags for confirmation: temperature unit, bucket size/MIME limits, margin bounds, print trigger location, whether a patient line appears on the print. See Open Questions.)

### Deferred Ideas (OUT OF SCOPE)
D-08 items: drug database, interaction checks, e-prescription signing, audit log (v2 CLIN-01/02). WhatsApp inbox/reminders, online booking, patient portal remain deferred per ROADMAP/STATE.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONS-01 | A consultation stores vitals (BP, pulse, temperature, weight, SpO2) | `vitals jsonb` + CHECK constraint shape; read-side sanitizer; app-side range validation; extend `CONSULTATION_SELECT`, `mapConsultationRecord`, `buildConsultationRow`, `updateConsultation`, `ConsultationRecord`/`ConsultationPayload` |
| CONS-02 | A pinned patient strip (name, age, allergies) stays visible on the consult form | Extend the `customers:patient_id (...)` embed with `allergies`; sticky component inside the dashboard's `overflow-y-auto` scroll container |
| CONS-03 | Attachments upload to a private, client-scoped Storage bucket and open through signed URLs | Private bucket SQL, `storage.objects` policies with `crm_can_access_client` on `(storage.foldername(name))[1]`, `upload` / `createSignedUrl(s)` / `remove` from the existing browser client, additive `storage_path` column |
| PRNT-01 | A client saves letterhead margins (header, footer, left, right in mm) once | `print_settings` table (PK `client_id`), RLS + explicit GRANTs, upsert via `onConflict: "client_id"`, settings modal reusing `EntityModal` |
| PRNT-02 | A completed consult prints body-only (medications, advice, follow-up) using those margins | Portal print root + global `@media print` rule + dynamic `@page { margin: 0 }` + mm padding / thead-tfoot spacers; reusable `PrintSheet` for Phase 3 |
</phase_requirements>

## Summary

Phase 2 is three small additive DB changes (a nullable `vitals jsonb` column, a `print_settings` table, a private `consultation-files` bucket with `storage.objects` policies plus one nullable `storage_path` column on `consultation_attachments`) and four UI/query changes in code that already exists: the consult editor, `consultation-queries.ts`, the Phase 1 patient Files panel, and a new shared print component. No new npm dependency is required: `@supabase/supabase-js` 2.103.0 (already installed) exposes `storage.from().upload / createSignedUrl / createSignedUrls / remove`, and printing is plain CSS plus `window.print()`.

Three findings change how the plans must be sequenced or scoped. (1) **Completed consults cannot currently be reopened**: the queue "Start Consult" button is `disabled` when `row.status === "Completed"` and `handleSaveComplete` immediately returns to the queue and clears the active consult, so "print a completed consult" needs an explicit entry point (queue action, post-complete state, and/or HistorySummary). (2) **Supabase stopped auto-granting new `public` tables to the Data API**; per the changelog the new behaviour applies to all existing projects from 2026-10-30, so `print_settings` MUST carry explicit `GRANT`s (the repo's own communication migration already does). (3) **Print needs a portal**: the dashboard shell is `h-dvh overflow-hidden`, so printing in place clips to one screen height; the print root must be a direct child of `body` with every other body child `display:none` in `@media print`, and it must use explicit black-on-white colours because the app root is `class="dark"`.

Live DB state (current `consultations` / `consultation_attachments` columns and nullability, existing buckets and `storage.objects` policies, whether Phase 1's `customers` clinical columns were applied) was **not** verified: the Supabase MCP tools were not callable from this research session. The plan's first task must run the read-only probes in "Environment Availability" before any migration is written against assumptions.

**Primary recommendation:** Ship in this order: (a) live probes, (b) three idempotent migrations (vitals, print_settings, storage bucket+policies+`storage_path`) applied to live BEFORE any code that selects the new columns, (c) query/type layer, (d) vitals + patient strip + upload UI in the consult editor, (e) shared `PrintSheet` + settings modal + prescription print with an explicit "print a completed consult" entry point.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Vitals persistence + shape guard | Database / Storage | Browser / Client (range validation) | jsonb column + CHECK is the last line; ranges stay in app code to avoid migration churn |
| Patient strip (name, age, allergies) | Browser / Client | Database (embed via PostgREST) | Pure presentation of a joined `customers` row; sticky inside the dashboard scroll container |
| File bytes storage | Database / Storage (Supabase Storage) | — | Private bucket; tenant isolation enforced by `storage.objects` RLS, not by the client |
| Upload / signed-URL / delete calls | Browser / Client (anon key + user JWT) | Database / Storage (RLS decides) | Same pattern as the rest of the app: browser singleton + RLS; no API route, no service role |
| Attachment metadata row | Database / Storage (`consultation_attachments`) | Browser (insert via query module) | Existing table; add nullable `storage_path` |
| Print margins | Database / Storage (`print_settings`) | Browser (clamp + render) | One row per client; RLS by `crm_can_access_client` |
| Body-only print layout | Browser / Client | — | `@page` + print container are browser features; no server rendering, no PDF library |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` (+ bundled `@supabase/storage-js`) | 2.103.0 installed [VERIFIED: `npm ls` this session; `node_modules/@supabase/storage-js/package.json` `"version": "2.103.0"`] | Storage upload, signed URLs, remove; PostgREST upsert | Already the app's data client; signatures confirmed in installed typings (see Code Examples) |
| Next.js / React | 15.5.15 / 19.2.5 [CITED: AGENTS.md Technology Stack] | `createPortal` from `react-dom`, client components | Existing |
| Tailwind CSS | 3.4.19 [CITED: AGENTS.md] | `print:` variant (`hidden print:block`) | Existing; `print` variant documented [CITED: tailwindcss.com/docs/hover-focus-and-other-states] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | ^0.511.0 [CITED: AGENTS.md] | Icons (`Printer`, `Upload`, `Settings`, `HeartPulse`) | Buttons |
| none new | — | — | D-07: no new dependencies. Do NOT add react-to-print, jsPDF, html2canvas, react-hook-form, zod. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Portal + `@media print` | Hidden iframe / `window.open` print window | Iframe needs style copying and breaks Tailwind tokens; portal reuses the page's CSS. Portal chosen. |
| `thead`/`tfoot` spacer rows (repeat per page) | Single container padding | Padding only offsets page 1 top and last-page bottom; spacers repeat on every page. Prescriptions are usually one page, so padding is an acceptable fallback if spacers misbehave in manual test. |
| `storage_path` column | Encode the path in `file_url` with a `storage://` prefix | Prefix needs no migration but overloads a URL column and the Phase 1 Files panel would render it as raw text. Column is cleaner and additive (D-04). |

**Installation:** none. `npm ls @supabase/supabase-js` returns `evolvnex-client-crm@0.1.0 └── @supabase/supabase-js@2.103.0` [VERIFIED: command run this session].

## Package Legitimacy Audit

No external packages are installed or added in this phase (D-07, D-16 precedent). Gate not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         Browser (consultation tab, anon key + user JWT)
  ┌───────────────────────────────────────────────────────────────────────────┐
  │ Consult editor                                                            │
  │  PatientStrip (sticky) <── activeConsultation.patient{name,dob,allergies} │
  │  VitalsCard  ──► normalizeVitals() ─► payloadFromForm ─► saveConsultation │
  │  Attachments: <input type=file> ─► validate type/size ─► uploadConsult…() │
  │  Print button ─► window.print()   Print settings ─► PrintSettingsModal    │
  └───────┬──────────────┬──────────────────┬─────────────────────┬───────────┘
          │PostgREST     │Storage API       │PostgREST            │browser print
          ▼              ▼                  ▼                     ▼
  consultations      storage.objects     print_settings      body > [data-print-root]
  (vitals jsonb,     bucket              (client_id PK,      (portal; all other body
   customers embed)  consultation-files   4 x mm, RLS)        children display:none)
  consultation_      path:                                     @page{size:A4;margin:0}
  attachments        <client_id>/<consult_id>/<uuid>-<name>    thead/tfoot spacer =
  (+storage_path)    RLS: crm_can_access_client(               header_mm/footer_mm,
          │           folder[1]::uuid)                         td padding = left/right_mm
          └──────────────┴───── all gated by public.crm_can_access_client(client_id)
  Signed URL: createSignedUrl(path, ttl) on click ─► opened in new tab (never stored)
```

### Recommended Project Structure
```
src/
├── lib/
│   ├── consultation-types.ts        # + ConsultationVitals, vitals on Record/Payload, storage_path on attachment, allergies on patient summary
│   ├── consultation-queries.ts      # + vitals mapping, uploadConsultationFile, getConsultationFileUrl, delete w/ object removal
│   ├── print-settings-types.ts      # PrintSettings, DEFAULT_PRINT_SETTINGS, clampPrintMargins (pure, no imports)
│   └── print-settings-queries.ts    # fetchPrintSettings, savePrintSettings (upsert)
├── hooks/
│   └── use-print-settings.ts        # loading/saving/error bag, per AGENTS hook convention
├── components/dashboard/
│   ├── print/
│   │   ├── print-sheet.tsx          # shared portal + @page + spacer table (Phase 3 reuses)
│   │   └── print-settings-modal.tsx # 4 mm inputs inside EntityModal
│   └── tabs/consultation-tab.tsx    # PatientStrip, VitalsCard, file upload, print entry points (modify)
└── app/globals.css                  # + @media print block (global, small)
supabase/migrations/
├── 20261111_consultations_vitals.sql
├── 20261111_print_settings.sql
└── 20261111_consultation_files_storage.sql
```
Kebab-case, `*-queries.ts` + `*-types.ts` pairs, named exports for new widgets [CITED: AGENTS.md Conventions].

### Pattern 1: Private bucket + tenant-scoped storage policies
**What:** Bucket private; object path `<client_id>/<consultation_id>/<uuid>-<safe-name>`; four policies (select, insert, delete; no update because we never upsert) all keyed on `crm_can_access_client` of the first folder segment.
**When to use:** Every consultation file. Policies `to authenticated` only; anon gets nothing.
**Example:**
```sql
-- Source: Supabase access-control docs pattern (bucket_id + (storage.foldername(name))[1]) [CITED: supabase.com/docs/guides/storage/security/access-control]
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consultation-files', 'consultation-files', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- CASE guard: a non-uuid first segment yields NULL (-> crm_can_access_client(NULL) = false)
-- instead of raising "invalid input syntax for type uuid" for the whole query.
drop policy if exists consultation_files_select on storage.objects;
create policy consultation_files_select on storage.objects for select to authenticated
using (
  bucket_id = 'consultation-files'
  and public.crm_can_access_client(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then ((storage.foldername(name))[1])::uuid end)
);
-- insert: same predicate in WITH CHECK; delete: same predicate in USING. No update policy (no upsert).
```
`storage.buckets` columns `public`, `file_size_limit bigint`, `allowed_mime_types text[]` confirmed [CITED: supabase.com/docs/guides/storage/schema/design]. `crm_can_access_client(uuid)` body (quoted from the repo migration): `select exists (select 1 from public.clients c where c.id = target_client_id and c.crm_user_id = auth.uid());` `language sql stable set search_path = public`, `grant execute ... to authenticated` [VERIFIED: supabase/migrations/20260814_whatsapp_auto_replies.sql:72-86]. Live definition not re-read (see Open Questions).

### Pattern 2: Upload, then insert metadata row; sign on demand
**What:** Validate (type allow-list, size) -> `upload(path, file, { contentType, upsert: false })` -> insert `consultation_attachments` row (`client_id`, `consultation_id`, `file_name` original, `file_url` null/'' , `storage_path`, `mime_type`, `file_size`, `uploaded_by`) -> if insert fails, best-effort `remove([path])`. Viewing: legacy row (`storage_path` null) opens `file_url` if `^https?://`; new row calls `createSignedUrl(storage_path, 300)` at click time.
**Why click-time:** signed URLs expire; pre-signing a list wastes requests and goes stale. Mobile Safari blocks `window.open` after an `await`: open a blank tab synchronously in the click handler, then set `location` (or render a button that signs then navigates, and fall back to `window.location.assign`).

### Pattern 3: One settings row per tenant (upsert)
**What:** `print_settings.client_id` is the primary key; `supabase.from("print_settings").upsert(row, { onConflict: "client_id" }).select().single()`. `ON CONFLICT DO UPDATE` needs SELECT + INSERT + UPDATE policies [ASSUMED: standard PostgreSQL RLS behaviour] so create all three. Missing row on read = defaults (all 0), not an error (`maybeSingle()`).

### Pattern 4: Body-only print root
**What:** A component that portals into `document.body` and is `hidden print:block`; a global `@media print` rule hides every other `body` child; a `<style>` inside it sets `@page { size: A4; margin: 0 }` so the rule exists only while a printable sheet is mounted.
**Example:** see Code Examples (PrintSheet).

### Anti-Patterns to Avoid
- **Printing in place inside the dashboard shell:** root is `flex h-dvh max-h-dvh ... overflow-hidden` [VERIFIED: dashboard-page.tsx:515 `<div className="flex h-dvh max-h-dvh min-w-0 flex-col overflow-hidden bg-background text-text">`]; Chrome clips to one page. Use the portal.
- **`visibility:hidden` on the rest of the page:** hidden elements still occupy layout and produce blank pages. Use `display:none`.
- **Interpolating user-entered margin strings into CSS:** always `Number()` + clamp, then interpolate numbers only.
- **Deleting attachment rows without removing the object:** orphaned private blobs. Remove the object first, then the row. Never delete `storage.objects` rows via SQL (file stays in the bucket) [CITED: supabase.com/docs/guides/storage/management/delete-objects].
- **Persisting clinical form state in `localStorage`:** `usePersistentState` exists in the repo; do not use it for vitals/notes.
- **Granting `anon` on `print_settings`:** tenant settings are never anonymous.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tenant authorization for files | Custom API route that checks tenant then streams file | `storage.objects` RLS with `crm_can_access_client` + `createSignedUrl` | Constitution: RLS is the boundary; no service-role code in the client or new route |
| Time-limited file links | Own token/expiry scheme | `createSignedUrl(path, expiresInSeconds)` | Built in; revocation = delete object or rotate signing key [CITED: supabase.com/docs/guides/storage/serving/downloads] |
| File-name safety | Trust `file.name` as the object key | Generate `crypto.randomUUID()` prefix + `[A-Za-z0-9._-]` sanitised name (cap length); keep original in `file_name` | Path traversal, Unicode/space/`#?` key problems; Storage key rules are not documented in the pages fetched, so sanitise defensively |
| PDF generation | jsPDF / html2canvas / server PDF | Browser print (user can "Save as PDF") | D-07 no deps; pre-printed letterhead means paper output |
| Page-margin repetition | JS pagination | `thead`/`tfoot` spacer rows or `padding` | CSS handles it; verify multi-page manually |
| Upsert of settings | select-then-insert/update | PostgREST `upsert({onConflict:"client_id"})` | Single round trip, no race |

**Key insight:** every hard part (tenant isolation, expiry, margins) already has a platform primitive; the work is wiring and guarding the edges (path validation, grants, legacy rows, sticky/print CSS in an `overflow-hidden` shell).

## Runtime State Inventory

Not a rename/refactor phase (additive only). Omitted per template.

One related runtime-state note: legacy `consultation_attachments` rows hold external URLs in `file_url`. D-04 keeps them untouched; readers must branch on `storage_path` presence.

## Common Pitfalls

### Pitfall 1: Code deployed before the column exists
**What goes wrong:** `CONSULTATION_SELECT` gains `vitals`; if live lacks the column, every consultation query for every tenant fails. Same for `customers:patient_id (..., allergies)`; Phase 1's own migration header warns of exactly this [VERIFIED: supabase/migrations/20261110_customers_clinical_fields.sql:3-4 "Apply to live BEFORE deploying code that selects these columns"].
**How to avoid:** migrations applied to live (with user approval) before merging code that selects them; probe `information_schema.columns` first. Whether Phase 1's `customers` clinical columns were ever applied to live is unconfirmed [CITED: 01-03-SUMMARY.md line 53 "Plan 01-07: apply migration to live"; 01-VERIFICATION says UAT pending].
**Warning signs:** consultation tab shows "column ... does not exist" error banner.

### Pitfall 2: New table not reachable by the Data API (grants)
**What goes wrong:** `print_settings` created with RLS + policies but no `GRANT`; PostgREST returns permission denied (42501) for `authenticated`.
**Why:** Supabase stopped auto-granting new `public` tables to API roles; new projects from 2026-05-30, all existing projects from 2026-10-30 [CITED: supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically]. Today is 2026-11-10. Storage tables are unaffected [same source].
**How to avoid:** include `grant select, insert, update on public.print_settings to authenticated; grant select, insert, update, delete on public.print_settings to service_role;` (no anon). The repo's own `20260814_whatsapp_auto_replies.sql` already grants explicitly [VERIFIED: lines 122-124 `grant select, insert, update, delete on public.communication_provider_accounts to authenticated;`]. Probe `has_table_privilege('authenticated','public.print_settings','select')` after applying.

### Pitfall 3: Completed consults cannot be reopened, so "print a completed consult" has no entry point
**What goes wrong:** Queue button is `disabled={saving || row.status === "Completed"}` [VERIFIED: consultation-tab.tsx:1002 and :1065], and `handleSaveComplete` calls `setMode("queue"); clearActiveConsultation(); setSelectedRow(null);` [VERIFIED: consultation-tab.tsx:679-681]. After Save & Complete the doctor is back on the queue with nothing to print.
**How to avoid (planner decision, recommend all three, smallest first):** (1) enable the queue button for Completed rows as "View / Print" - `startConsultation` already skips the status change for `"In Progress"`/`"Completed"` and just loads [VERIFIED: use-consultations.ts:108-113 `if (row.status !== "In Progress" && row.status !== "Completed")`]; (2) after Save & Complete, optionally stay in the editor with a "Print prescription" action; (3) Print button on `HistorySummary` for past visits. If a Completed consult can be reopened, `handleSaveDraft` forces `"DRAFT"` [VERIFIED: consultation-tab.tsx:663-667], which would silently un-complete it: hide/disable "Save as Draft" for Completed, or keep the status.

### Pitfall 4: Print prints a blank or one clipped page
**What goes wrong:** (a) printing inside `h-dvh overflow-hidden`; (b) `visibility:hidden` leaving phantom pages; (c) calling `window.print()` right after `setState` before the DOM commits; (d) light text on white because the app root is `class="dark"` [VERIFIED: layout.tsx:28 `<html lang="en" className={`dark ${inter.className}`}`; body `bg-background text-text`].
**How to avoid:** portal child of `body`; `display:none !important` on other body children in print; mount the print root while the consult is loaded (always rendered, `hidden print:block`) so Print is just `window.print()`; set explicit `bg-white text-black` and ignore theme tokens inside the sheet.

### Pitfall 5: Chrome prints URL/date headers and footers
**What goes wrong:** Browser header/footer text lands on the pre-printed letterhead.
**How to avoid:** `@page { margin: 0 }`; Chrome does not show headers/footers when the margin is 0 or too small [CITED: developer.chrome.com/blog/print-margins]. Apply the real margins as content spacing (padding/spacers), not as `@page` margin. Safari does not reliably honour `@page` margins [CITED: bugzilla.mozilla.org/show_bug.cgi?id=1250674 via search result, MEDIUM]; document Chrome/Edge as the supported print browser. Printer hardware has an unprintable edge (about 3-6 mm, [ASSUMED]); the settings modal should say "tune with a test print" and offer a test-print sheet (dotted body box).

### Pitfall 6: Multi-page prescriptions flow into the letterhead
**What goes wrong:** padding on one container only protects page 1 top / last page bottom.
**How to avoid:** `thead`/`tfoot` rows with height = header_mm / footer_mm repeat per page when displayed as table header/footer groups (works in current Chrome; older engines were unreliable) [CITED: hiqpdf docs + forum threads via search, MEDIUM]. A single tall `<td>` must be allowed to fragment; test a 2-page prescription manually. Fallback: padding only + note "one page".

### Pitfall 7: Storage `remove()` can "succeed" with nothing removed
**What goes wrong:** `remove` returns `{ data: FileObject[] }`; if RLS hides the object, `data` is an empty array with no error [ASSUMED: commonly reported Storage behaviour]. Code that only checks `error` believes the file is gone.
**How to avoid:** check `data.length === paths.length`; treat 0 as an error; then delete the row.

### Pitfall 8: Bad path/segment breaks policy evaluation
**What goes wrong:** `(storage.foldername(name))[1]::uuid` on a non-uuid raises, failing the whole SELECT over `storage.objects`.
**How to avoid:** CASE-guard (Pattern 1); INSERT policy rejects malformed first segments so they cannot be created by users.

### Pitfall 9: Legacy name+URL rows break or render wrongly
**What goes wrong:** Files panel and editor both assume `file_url` is a link [VERIFIED: patient-files-panel.tsx:73-81 renders `<a href={file.file_url}>` only when `SAFE_URL_PATTERN` matches; consultation-tab.tsx:1484-1491 renders `href={attachment.file_url}` unconditionally]. New rows with empty `file_url` would render a dead link; the editor link has no http(s) guard today.
**How to avoid:** one shared helper `resolveAttachmentHref` / `openAttachment(attachment)` used by BOTH the editor list and `PatientFilesPanel`; legacy rows keep the http(s) guard, new rows sign on click.

### Pitfall 10: `file_url` may be NOT NULL live
**What goes wrong:** inserting a bucket attachment with `file_url` null violates a NOT NULL constraint. The mapper does `file_url: String(item.file_url ?? "")` [VERIFIED: consultation-queries.ts:291], which suggests but does not prove nullability.
**How to avoid:** probe `is_nullable`; the migration may include `alter table public.consultation_attachments alter column file_url drop not null;` (idempotent, additive) so new rows can leave it null. Update `ConsultationAttachmentRecord.file_url` to `string | null` or keep mapping null to `""`.

### Pitfall 11: Sticky strip does not stick
**What goes wrong:** `position: sticky` sticks only inside its parent and relative to the nearest scrolling ancestor. The scroller is `<div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-6 pt-6 ...">` [VERIFIED: dashboard-page.tsx:559-559]. The existing patient card (line 1152) is inside the left column `space-y-6` div, so sticky there would only span the left column.
**How to avoid:** render `PatientStrip` as a direct child of the editor's outermost `<div className="space-y-6">` (line 1097), after the header section, with `sticky top-0 z-20 bg-card`; give it an opaque background and a bottom border/shadow so scrolling content does not show through. Verify at 390px.

### Pitfall 12: Mobile 390px
Vitals grid `grid-cols-2 sm:grid-cols-3 xl:grid-cols-5`; inputs `min-h-11`; `inputMode="decimal"` for numeric fields (BP stays text, `inputMode="text"` or pattern `\d{2,3}/\d{2,3}`); file `<input accept="application/pdf,image/jpeg,image/png,image/webp">` (mobile OS offers camera); strip wraps into 2 lines, allergies pill truncates with `title`; print settings modal uses `EntityModal` (already full-width on mobile).

### Pitfall 13: Null allergies vs "none"
A null/empty allergies field means "not recorded", not "no allergies". Reuse Phase 1's wording ("Not recorded" in the drawer) [CITED: 01-VERIFICATION.md line 69]. Show a red prominent pill only when text is present; otherwise muted "Allergies: not recorded". Never render "NKDA" automatically.

### Pitfall 14: `addConsultation` fallback shell and type ripple
Adding `vitals` to `ConsultationRecord` forces `vitals: null` into the hand-built shell object in `useConsultations.addConsultation` [VERIFIED: use-consultations.ts:186-212] and `patient: null` there is fine; `tsc` will flag it. Also `mapPatient` is shared by the queue mapper; add `allergies` there with a `null` default so both callers stay valid.

### Pitfall 15: Non-UTC date and IST helpers
Follow-up date is a plain `date`; printing must not pass it through `formatUtcToIst` (that helper is for timestamptz). Use the stored `YYYY-MM-DD`, formatted with a local `toLocaleDateString` on a date-only parse (`new Date(y, m-1, d)`), to avoid off-by-one.

## Code Examples

### Vitals type, sanitizer and normalizer (pure; safe to smoke-test with `node`)
```typescript
// New in consultation-types.ts. Keys match D-01: bp, pulse, temperature, weight, spo2.
export const VITAL_KEYS = ["bp", "pulse", "temperature", "weight", "spo2"] as const;
export type ConsultationVitals = {
  bp?: string;          // "120/80"
  pulse?: number;       // bpm
  temperature?: number; // unit decided in Open Question 1
  weight?: number;      // kg
  spo2?: number;        // percent
};

const VITAL_RANGES = { pulse: [20, 300], temperature: [30, 115], weight: [0.5, 500], spo2: [50, 100] } as const; // temperature range depends on unit; planner finalises

/** Read side: jsonb is untrusted. Keep only known keys with the right JS type. */
export function parseVitals(raw: unknown): ConsultationVitals | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const out: ConsultationVitals = {};
  if (typeof row.bp === "string" && /^\d{2,3}\/\d{2,3}$/.test(row.bp.trim())) out.bp = row.bp.trim();
  for (const key of ["pulse", "temperature", "weight", "spo2"] as const) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}
```
Write side: `payloadFromForm` returns `vitals: normalizeVitals(form)` (null when every field blank; throws/returns an error string for out-of-range so the UI shows the message instead of saving). `updateConsultation` follows the file's existing style: `if (payload.vitals !== undefined) updateRow.vitals = payload.vitals;` [pattern verified: consultation-queries.ts:689-704 uses `if (payload.x !== undefined) updateRow.x = payload.x`]. `buildConsultationRow` adds `vitals: payload.vitals ?? null`.

### Migration: vitals (idempotent)
```sql
alter table public.consultations add column if not exists vitals jsonb;

alter table public.consultations drop constraint if exists consultations_vitals_shape;
alter table public.consultations add constraint consultations_vitals_shape check (
  vitals is null or (
    jsonb_typeof(vitals) = 'object'
    and (vitals - array['bp','pulse','temperature','weight','spo2']) = '{}'::jsonb
    and octet_length(vitals::text) <= 256
  )
);
-- No RLS change: existing consultations policies (crm_can_access_client(client_id)) cover the table.
```
The `jsonb - text[]` operator is standard PostgreSQL 10+ [ASSUMED; probe on live with a SELECT using the expression].

### Migration: print_settings (idempotent)
```sql
create table if not exists public.print_settings (
  client_id uuid primary key references public.clients(id) on delete cascade,
  header_mm numeric(5,1) not null default 0 check (header_mm between 0 and 100),
  footer_mm numeric(5,1) not null default 0 check (footer_mm between 0 and 100),
  left_mm   numeric(5,1) not null default 0 check (left_mm   between 0 and 50),
  right_mm  numeric(5,1) not null default 0 check (right_mm  between 0 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (left_mm + right_mm <= 120),     -- A4 is 210 mm wide: keep a printable column
  check (header_mm + footer_mm <= 200)   -- A4 is 297 mm tall
);
alter table public.print_settings enable row level security;

drop policy if exists print_settings_select_own on public.print_settings;
create policy print_settings_select_own on public.print_settings for select to authenticated
using (public.crm_can_access_client(client_id));
drop policy if exists print_settings_insert_own on public.print_settings;
create policy print_settings_insert_own on public.print_settings for insert to authenticated
with check (public.crm_can_access_client(client_id));
drop policy if exists print_settings_update_own on public.print_settings;
create policy print_settings_update_own on public.print_settings for update to authenticated
using (public.crm_can_access_client(client_id))
with check (public.crm_can_access_client(client_id));

grant select, insert, update on public.print_settings to authenticated;
grant select, insert, update, delete on public.print_settings to service_role;
```
Policy/grant idiom mirrors the repo [VERIFIED: 20261108_phase0_tighten_rls.sql:11-30 `create policy tasks_select_own on public.tasks for select to authenticated using (public.crm_can_access_client(client_id));`]. Bounds (100/50 mm, sums) are recommended defaults, not user-specified; see Open Questions.

### Migration: attachments + storage (idempotent)
```sql
alter table public.consultation_attachments add column if not exists storage_path text;
alter table public.consultation_attachments alter column file_url drop not null;  -- no-op if already nullable
alter table public.consultation_attachments drop constraint if exists consultation_attachments_storage_path_client_chk;
alter table public.consultation_attachments add constraint consultation_attachments_storage_path_client_chk
  check (storage_path is null or storage_path like client_id::text || '/%');
-- then: bucket upsert + 3 storage.objects policies (Pattern 1)
```
`consultation_attachments` columns the code relies on [VERIFIED: consultation-queries.ts:285-297]: `id, client_id, consultation_id, file_name, file_url, mime_type, file_size, uploaded_by, uploaded_at` (mapper reads exactly these via `item.id`, `item.client_id`, `item.consultation_id`, `item.file_name`, `item.file_url`, `item.mime_type`, `item.file_size`, `item.uploaded_by`, `item.uploaded_at`).

### Storage calls (installed 2.103.0 signatures)
```typescript
// Verified in node_modules/@supabase/storage-js/dist/index.d.mts:
//   upload(path: string, fileBody: FileBody, fileOptions?: FileOptions)  // FileOptions: cacheControl?, contentType?, upsert?, duplex?, metadata?, headers?
//   createSignedUrl(path: string, expiresIn: number, options?: {download?: string|boolean; ...}) -> { data: { signedUrl: string }, error: null } | { data: null, error: StorageError }
//   createSignedUrls(paths: string[], expiresIn: number, ...) -> data: { error: string|null; path: string|null; signedUrl: string }[]
//   remove(paths: string[]) -> { data: FileObject[], error: null } | { data: null, error: StorageError }
const BUCKET = "consultation-files";
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 300;

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-100) || "file";
}

export async function uploadConsultationFile(clientId: string, consultationId: string, file: File): Promise<void> {
  const supabase = getClient();
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) throw new Error("Only PDF, JPG, PNG or WebP files are allowed.");
  if (file.size > MAX_BYTES) throw new Error("File is larger than 10 MB.");
  const { data: { user } } = await supabase.auth.getUser();
  const storagePath = `${clientId}/${consultationId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) raiseQueryError(uploadError, "Unable to upload file.");
  const { error: rowError } = await supabase.from("consultation_attachments").insert({
    client_id: clientId, consultation_id: consultationId, file_name: file.name.trim(),
    file_url: null, storage_path: storagePath, mime_type: file.type, file_size: file.size, uploaded_by: user?.id ?? null,
  });
  if (rowError) { await supabase.storage.from(BUCKET).remove([storagePath]); raiseQueryError(rowError, "Unable to save file record."); }
}

export async function getConsultationFileUrl(storagePath: string): Promise<string> {
  const { data, error } = await getClient().storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) raiseQueryError(error, "Unable to open file.");
  return data.signedUrl;
}
```
`crypto.randomUUID()` already used client-side in this module [VERIFIED: consultation-queries.ts:517 `const consultationId = crypto.randomUUID();`]. `getClient`/`raiseQueryError` are the module's existing helpers [VERIFIED: consultation-queries.ts:47-58]. Remove flow: `remove([path])`, require `data.length === 1`, then delete the row with `.eq("client_id", clientId).eq("id", attachmentId)` (existing `deleteConsultationAttachment` style).

### Print: shared sheet + global rule
```tsx
// src/components/dashboard/print/print-sheet.tsx
"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clampPrintMargins, type PrintSettings } from "@/lib/print-settings-types";

export function PrintSheet({ settings, children }: { settings: PrintSettings; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  if (!host) return null;
  const m = clampPrintMargins(settings); // Number() + clamp; only numbers reach the CSS below
  return createPortal(
    <div data-print-root className="hidden bg-white text-black print:block">
      <style>{"@page { size: A4; margin: 0; }"}</style>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><td style={{ height: `${m.header_mm}mm`, padding: 0 }} /></tr></thead>
        <tfoot><tr><td style={{ height: `${m.footer_mm}mm`, padding: 0 }} /></tr></tfoot>
        <tbody><tr><td style={{ padding: `0 ${m.right_mm}mm 0 ${m.left_mm}mm`, verticalAlign: "top" }}>{children}</td></tr></tbody>
      </table>
    </div>,
    host,
  );
}
```
```css
/* globals.css */
@media print {
  body > *:not([data-print-root]) { display: none !important; }
  html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; color: #000 !important; }
}
```
Print entry: `<Button onClick={() => window.print()}>`; the `PrescriptionPrint` child renders medications (one row each: name, dosage, frequency, duration, instructions), `advice`, follow-up date/notes, all with explicit black text and mm/pt font sizes. Phase 3's receipt passes different children to the same `PrintSheet`. The existing `html, body { height: 100%; min-height: 100dvh }` rule [VERIFIED: globals.css:60-64] is why the print override resets height. `print:` utilities and `hidden` combine as in the Tailwind docs example [CITED: tailwindcss.com/docs/hover-focus-and-other-states].

### Sticky strip
```tsx
// direct child of the editor's outer space-y-6 div
<div className="sticky top-0 z-20 -mx-1 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
    <span className="font-semibold text-text">{patientName}</span>
    <span className="text-sm text-muted-foreground">{patientAge}</span>
    {allergies ? <span className="rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Allergies: {allergies}</span>
               : <span className="text-xs text-muted-foreground">Allergies: not recorded</span>}
  </div>
</div>
```
Red token `border-primary/50 bg-primary/10 text-primary` is the repo's error/red pill [CITED: 01-PATTERNS.md line 111].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| New `public` tables auto-exposed to Data API | Explicit `GRANT` per role required | New projects 2026-05-30; existing projects 2026-10-30 [CITED: Supabase changelog 45329] | `print_settings` migration must GRANT |
| Name+URL attachment rows | Private bucket + signed URLs | This phase | Two attachment kinds coexist |
| Chrome `@page` margin boxes unsupported | Chrome 131+ supports generated content in margin boxes [CITED: developer.chrome.com/blog/print-margins] | Chrome 131 | Not needed here; `@page { margin: 0 }` approach unaffected |

**Deprecated/outdated:** none relevant.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Live `consultations` has no `vitals` column yet and `consultations` RLS is `crm_can_access_client(client_id)` (CONTEXT says RLS via that helper; column list not probed) | Pitfall 1 | Migration no-ops or conflicts; policies differ |
| A2 | Live `consultation_attachments.file_url` may be NOT NULL; `storage_path` does not exist | Pitfall 10 | Insert fails; migration `drop not null` covers it |
| A3 | Phase 1 `customers` clinical columns (`allergies` etc.) are applied on live | Pitfall 1, strip | Strip embed breaks all consultation queries until applied |
| A4 | No existing `consultation-files` bucket or conflicting `storage.objects` policies on live | Pattern 1 | Bucket upsert changes existing config; duplicate policy names |
| A5 | `jsonb - text[]` operator and `pg_column_size`/`octet_length` check are valid on live PG (standard PG 10+) | vitals migration | Migration errors; use `jsonb_object_keys` alternative |
| A6 | `ON CONFLICT DO UPDATE` upsert needs SELECT + INSERT + UPDATE policies | Pattern 3 | Upsert fails with RLS error if a policy is missing |
| A7 | Storage `remove()` returns empty `data` (no error) when RLS denies | Pitfall 7 | Orphan/ghost handling slightly off |
| A8 | Storage validates `allowed_mime_types` against the declared Content-Type (not content sniffing) | Pattern 1, Security | A renamed file could pass; still private + signed, low impact |
| A9 | Chrome splits a tall single `<td>` across printed pages and repeats `thead`/`tfoot` | Pitfall 6 | Multi-page layout wrong; fall back to padding |
| A10 | Clinics print A4 on Chrome/Edge desktop | Pitfall 5 | `size: A4` or Safari behaviour needs rework |
| A11 | Bucket limit 10 MB and MIME allow-list (PDF/JPG/PNG/WebP) fit clinic needs; margin bounds 0-100 / 0-50 mm | Migrations | User may want other limits |
| A12 | Tailwind 3.4 supports `print:` variant like v4 docs fetched | Stack | Use plain `@media print` CSS instead |
| A13 | Standard (non-resumable) upload is fine up to 10 MB (docs recommend resumable above 6 MB) | Pattern 2 | Slow-network failures for 6-10 MB; cap at 6 MB if needed [CITED: supabase.com/docs/guides/storage/uploads/standard-uploads] |

## Open Questions

1. **Temperature unit (Fahrenheit or Celsius)?**
   - Known: D-01 fixes five keys, no unit key. Indian clinics commonly record Fahrenheit [ASSUMED].
   - Unclear: which unit the doctor client uses.
   - Recommendation: ask the user; fix one unit label in the UI and range-validate accordingly (C: 30-45, F: 86-115). Do not store mixed units.

2. **What exactly does the print contain, and does it include a patient line?**
   - Known: D-06 says medications, advice, follow-up only; no header/doctor/footer.
   - Unclear: a prescription with no patient name/date is unusual; also whether `medication_notes` (free text) prints alongside structured medications, and whether exercises print.
   - Recommendation: print structured medications + `medication_notes`, `advice`, follow-up date/notes; include a one-line patient name/age/date at the top of the body unless the user says the letterhead pre-prints it. Confirm with user before implementation.

3. **Where is the print entry point for completed consults?** (Pitfall 3.) Recommend: queue "View / Print" for Completed rows + Print button in the editor when status is COMPLETED + `HistorySummary`. Confirm the doctor may reopen a completed consult read-only.

4. **Live state unverified.** Run the probes (Environment Availability) first: `vitals`, attachments columns/nullability, buckets, `storage.objects` policies, whether Phase 1 `customers` columns are applied, default privileges regime.

5. **Limits.** 10 MB / four MIME types and margin bounds are recommendations; user may want HEIC, DOCX, or larger files (HEIC from iPhones is not in the allow-list; the picker may convert or reject).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | typecheck, pure-function smoke tests | yes | v24.16.0 [VERIFIED: `node -v`]; type-stripping works (`node -e "import('./m.ts')..."` printed `100`) | - |
| TypeScript compiler | `npx tsc --noEmit` | yes | `node_modules/.bin/tsc` present [VERIFIED: ls] | - |
| `@supabase/supabase-js` | upload/sign/remove | yes | 2.103.0 | - |
| ESLint | lint | no | `next lint` script exists but no eslint dep declared [CITED: AGENTS.md] | typecheck + build only |
| Supabase live project `ltbqxyvdtrrlohdfrprf` (read via MCP) | probes, migration apply | NOT reachable from this research session (no MCP tool surfaced) | - | Planner/executor runs probes via Supabase MCP `execute_sql` (SELECT only) as Wave 0 |
| psql / supabase CLI | - | no | - | MCP |
| Printer / Chrome | manual print UAT | human step | - | Chrome "Save as PDF" with Margins: Default for layout check |

**Probes to run first (read-only SELECTs):**
```sql
-- columns + nullability
select table_name, column_name, data_type, is_nullable from information_schema.columns
 where table_schema='public' and table_name in ('consultations','consultation_attachments','customers','print_settings') order by table_name, ordinal_position;
-- buckets and storage policies
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='storage' and tablename='objects';
-- table policies
select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='public' and tablename in ('consultations','consultation_attachments','consultation_medications');
-- helper body and grant regime
select pg_get_functiondef('public.crm_can_access_client(uuid)'::regprocedure);
select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='customers' and grantee in ('anon','authenticated');
select defaclrole::regrole, defaclacl from pg_default_acl;
select jsonb '{"bp":"1"}' - array['bp','pulse'] = '{}'::jsonb;   -- operator check (expect true)
```

**Missing dependencies with no fallback:** none (live probes are a planned first task, not a blocker).
**Missing dependencies with fallback:** ESLint (typecheck/build instead).

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` [VERIFIED: config.json line 24]. No test runner exists in the repo [CITED: AGENTS.md]; do not add one (D-07). Use typecheck, build, pure-function smoke scripts, SQL probes and a manual UAT list.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none (TypeScript compiler + `next build` + Node type-stripping smoke scripts + SQL probes + manual UAT) |
| Config file | none - see Wave 0 |
| Quick run command | `npx tsc --noEmit` |
| Full suite command | `npx tsc --noEmit && npm run build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONS-01 | `parseVitals` drops unknown keys/wrong types; `normalizeVitals` rejects out-of-range, returns null when blank | smoke (pure) | `node -e "import('./src/lib/consultation-types.ts').then(m=>{console.log(m.parseVitals({bp:'120/80',x:1}))})"` (module must stay import-free of `@/` aliases for this to run; keep pure helpers in a dependency-free file, e.g. `src/lib/consultation-vitals.ts`) | no - Wave 0 |
| CONS-01 | DB rejects `{"foo":1}` and non-objects | SQL probe | `begin; set local role authenticated; ... insert/update ... ; rollback;` or constraint definition check in `pg_constraint` | no - Wave 0 |
| CONS-01 | Save vitals, reload, values persist; blank save stores null | manual UAT | doctor client: fill vitals, Save as Draft, reopen | - |
| CONS-02 | Strip stays pinned while scrolling at 1280px and 390px; allergies red when present, "not recorded" when null | manual UAT | browser | - |
| CONS-03 | Upload PDF/JPG; opens via signed URL; legacy URL row still opens; >10 MB and .exe rejected; bucket private | manual + SQL probe | `select public from storage.buckets where id='consultation-files'` -> false; unauthenticated GET of `/storage/v1/object/public/consultation-files/<path>` -> 400/404 | - |
| CONS-03 | Tenant B cannot select/insert/delete tenant A objects | SQL probe (rolled back) | `begin; select set_config('request.jwt.claims','{"sub":"<tenantB crm_user_id>","role":"authenticated"}',true); set local role authenticated; select count(*) from storage.objects where bucket_id='consultation-files' and name like '<tenantA client_id>/%'; rollback;` expect 0 | - |
| PRNT-01 | Save margins once; reload shows them; out-of-bound values rejected (UI + DB) | smoke + SQL + manual | `clampPrintMargins` smoke; DB CHECK probe; UAT | no - Wave 0 |
| PRNT-01 | Tenant B cannot read/write tenant A `print_settings` | SQL probe (rolled back) | as above on `public.print_settings` | - |
| PRNT-02 | Print preview shows only medications/advice/follow-up (and agreed patient line), no app chrome, no browser header/footer, black on white, margins match mm (ruler on PDF) | manual UAT (Chrome print preview, "Margins: Default", Save as PDF) | browser | - |
| PRNT-02 | Two-page prescription keeps header/footer spacing on page 2 | manual UAT | browser | - |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit`
- **Per wave merge:** `npx tsc --noEmit && npm run build`
- **Phase gate:** typecheck + build green, SQL probes recorded in VERIFICATION, manual UAT list signed off, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/consultation-vitals.ts` (dependency-free `parseVitals` / `normalizeVitals`) - enables Node smoke test for CONS-01
- [ ] `src/lib/print-settings-types.ts` dependency-free `clampPrintMargins` - enables smoke test for PRNT-01
- [ ] Live probes (Environment Availability) recorded in the first plan's SUMMARY
- [ ] Framework install: none (do not add one)

## Security Domain

> `security_enforcement` is enabled (key absent from config = enabled; `security_asvs_level: 1`, `security_block_on: "high"`) [VERIFIED: config.json lines 47-49].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | existing Supabase Auth session |
| V3 Session Management | no (unchanged) | - |
| V4 Access Control | yes | RLS on `print_settings`, `storage.objects` (bucket-scoped, `crm_can_access_client`), existing consultation tables; client_id always from `useClient()`, never URL |
| V5 Input Validation | yes | vitals range + shape (app) + CHECK (DB); mm `Number()`+clamp + CHECK; file type/size allow-list (app + bucket limits); sanitised object names |
| V6 Cryptography | no | no hand-rolled crypto; signed URLs are platform-issued |
| V8 Data Protection | yes (health data) | private bucket, 300 s signed URLs, no clinical data in `localStorage`, no logging of URLs/tokens (`console.error` scope tags only, never signed URLs) |
| V12 Files and Resources | yes | MIME allow-list (no HTML/SVG/executables), size cap, random path component, no execution, `rel="noopener noreferrer"` on opened links |
| V14 Configuration | yes | bucket `public=false`; explicit GRANTs (no anon on `print_settings`); no service role in client |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant object read via guessed path | Information disclosure | `storage.objects` SELECT policy on `crm_can_access_client(first folder)`; private bucket; verify with rolled-back role-simulation probe |
| Upload into another tenant's folder | Tampering | INSERT `WITH CHECK` same predicate; row CHECK `storage_path like client_id::text || '/%'` |
| Path traversal / odd characters in file name | Tampering | UUID-prefixed, regex-sanitised name; original name stored only in `file_name` and rendered as text |
| Content-type spoof / stored XSS via HTML/SVG | Tampering / Elevation | Allow-list excludes `text/html`, `image/svg+xml`; bucket `allowed_mime_types`; signed URL served from storage domain, opened with `noopener noreferrer` |
| Signed URL leakage (referer, history, sharing) | Information disclosure | short TTL (300 s), generate at click, never persist or log; `rel="noreferrer"` |
| Legacy `file_url` as `javascript:`/`data:` link | Elevation (XSS) | keep `^https?://` guard for legacy rows in BOTH editor and Files panel (editor currently lacks it, Pitfall 9) |
| CSS injection through margin values | Tampering | numbers only: `Number()`, clamp, DB CHECK; never interpolate strings into `<style>` |
| Mass assignment of `client_id` on upsert/insert | Tampering | `client_id` set last from the authenticated `clientId` argument (Phase 1 pattern: "client_id written after payload spread") [CITED: STATE.md 01-01] and enforced by RLS WITH CHECK |
| New table silently unreachable or over-granted | DoS / Elevation | explicit least-privilege GRANTs (authenticated + service_role only) |

## Project Constraints (from CLAUDE.md / AGENTS.md)

No `./CLAUDE.md` in the repo; directives come from `AGENTS.md` (project) and the user's global CLAUDE.md (response style only; applies to chat, not this document).
- Tenancy: never authorize with client-supplied tenant id alone; every query `.eq("client_id", clientId)`; `clientId` from `useClient()`/`useAuth()`.
- Security: no service-role/secret in frontend or git; never disable RLS; every new table/bucket policy has RLS.
- Architecture: do not create parallel services/tables/components; search existing first; `*-queries.ts` + `*-types.ts` pair; kebab-case; no `utils/`/`helpers/` trees; new reusable widgets use named exports; tabs stay default-exported.
- Error handling: query modules wrap with `raiseQueryError`/`formatSupabaseError` and a user-facing fallback; hooks expose `string | null` error; use `DataState` for loading/error/empty; no `console.log` in UI/query modules; never log tokens/URLs.
- Style: `"use client"` first line for hook/browser-API files; keep query/types modules server-safe; `cn()` from `@/lib/utils`; Tailwind tokens (`bg-card`, `text-text`, `border-border`, `text-muted-foreground`); no new CSS-in-JS lib; no new `any` on mapped rows (use `Record<string, unknown>`); `type` over `interface`; `import type`; `@/` alias only.
- Migrations: `supabase/migrations/YYYYMMDD_snake_description.sql`, idempotent; repo migration files are not tracked by the live migration table (D-14 of Phase 1), so apply deliberately via MCP after user approval and keep the file equal to what is live.
- Docs: material schema/storage/print changes must update `.planning/codebase/` docs (`CHANGELOG.md`, `INTEGRATIONS.md` line 41-42 currently says "no `supabase.storage` usage" and attachments are rows only; `STRUCTURE.md`).
- Verification: typecheck, build, migration + RLS, tenant isolation, API failure paths, mobile, empty/error/loading.
- GSD: edits go through a GSD workflow (this research writes the planning artifact only).

## Sources

### Primary (HIGH confidence)
- In-repo files read this session: `src/lib/consultation-queries.ts`, `src/lib/consultation-types.ts`, `src/components/dashboard/tabs/consultation-tab.tsx` (1-160, 296-424, 425-824, 1000-1695), `src/hooks/use-consultations.ts`, `src/components/dashboard/patient/patient-files-panel.tsx`, `patient-profile-drawer.tsx` (1-60), `src/components/dashboard/billing/entity-modal.tsx`, `src/app/layout.tsx`, `src/app/globals.css` (60-80), `src/components/dashboard/dashboard-page.tsx` (grep), `supabase/migrations/20260814_whatsapp_auto_replies.sql`, `20261108_phase0_tighten_rls.sql`, `20261110_customers_clinical_fields.sql`, `.planning/*` context/requirements/state/roadmap/phase 1 docs, `.planning/config.json`
- Installed typings `node_modules/@supabase/storage-js/dist/index.d.mts` (upload, createSignedUrl, createSignedUrls, remove, FileOptions)

### Secondary (MEDIUM confidence)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control) - policies on `storage.objects`, `storage.foldername`, INSERT-only for upload, SELECT+UPDATE for upsert
- [Supabase Storage schema](https://supabase.com/docs/guides/storage/schema/design) - `storage.buckets` / `storage.objects` columns
- [Supabase delete objects](https://supabase.com/docs/guides/storage/management/delete-objects) - use `remove`, SQL delete orphans files
- [Supabase downloads](https://supabase.com/docs/guides/storage/serving/downloads) - signed URLs, revocation
- [Supabase standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads) - `upsert`, `contentType`, 6 MB recommendation
- [Supabase file limits](https://supabase.com/docs/guides/storage/uploads/file-limits) - bucket limit cannot exceed global; free plan global max 50 MB
- [Supabase changelog 45329](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) - explicit grants; existing projects from 2026-10-30
- [Chrome print margins](https://developer.chrome.com/blog/print-margins) - margin 0 hides headers/footers
- [MDN @page](https://developer.mozilla.org/en-US/docs/Web/CSS/@page) - `margin`, `size` descriptors
- [Tailwind states](https://tailwindcss.com/docs/hover-focus-and-other-states) - `print:` variant (v4 docs; v3 behaviour assumed same)

### Tertiary (LOW confidence)
- Web search summaries for thead/tfoot page repetition and Safari `@page` support; community reports for `remove()` empty-data behaviour (marked [ASSUMED])

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; signatures verified in installed typings.
- Architecture: MEDIUM - patterns follow official docs and repo conventions; live DB state unprobed.
- Pitfalls: MEDIUM-HIGH - in-repo pitfalls (completed-consult dead end, overflow-hidden shell, dark theme, legacy link rendering) verified by reading code; print/multi-page and Storage edge behaviour need manual confirmation.

**Research date:** 2026-11-10
**Valid until:** 2026-12-10 (Supabase Data API grant regime is fast-moving; re-check changelog if migrations slip)
