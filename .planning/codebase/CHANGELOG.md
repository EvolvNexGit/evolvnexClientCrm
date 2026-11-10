# Codebase Change Log (living blueprint)

Newest first. Each entry: what changed, files, contracts. Structural changes are also patched into STRUCTURE.md / ARCHITECTURE.md.

## 2026-11-10 — Phase 2: consultation and print

**Problem:** Consultations had no vitals, allergies were not visible while writing notes, attachments were bare name+URL rows with no real file behind them, and there was no way to print a prescription on a clinic's pre-printed letterhead.

**Contracts introduced**
- `consultations.vitals` jsonb: five keys (`bp`, `pulse`, `temperature`, `weight`, `spo2`), shape CHECK, max 256 bytes. Temperature is stored as a plain number in degrees Celsius (D-09); Fahrenheit-looking input such as 98.6 is rejected with a Celsius message. Blank vitals store SQL null.
- `src/lib/consultation-vitals.ts`: import-free `parseVitals`, `normalizeVitals`, `vitalsToForm`, `VITAL_FIELDS`, `VITAL_RANGES`; verifiable with plain node. `updateConsultation` writes vitals only when `payload.vitals !== undefined`, so status-only updates keep stored vitals. `VitalsCard` renders the inputs; both save handlers validate through `normalizeVitals` before any request.
- `PatientStrip` (`src/components/dashboard/patient/patient-strip.tsx`): sticky name, age and allergies strip in the consult editor with three allergy states (recorded text as a red pill, "not recorded" when null or blank, "unavailable"). Null or blank allergies is never shown as "none".
- Private storage bucket `consultation-files` (10 MB, pdf, jpeg, png, webp). Object path is `client_id/consultation_id/uuid-name`. Three `storage.objects` policies (select, insert, delete; no update) key on `crm_can_access_client` of the first path segment, with a guard so a non-uuid segment cannot raise inside the policy.
- `consultation_attachments.storage_path` (new, with a client-prefix check) and `file_url` made nullable: legacy name+URL rows keep working and need no data migration (D-04).
- `src/lib/consultation-files.ts`: import-free `validateConsultationFile`, `safeFileName`, `isUuid`, `buildStoragePath`, `isSafeHttpUrl`, bucket constants. `uploadConsultationFile` (`upsert: false`, best-effort object cleanup if the row insert fails), `getConsultationFileUrl`, `fetchConsultationAttachments`, `deleteConsultationFile` in `consultation-queries.ts` (object removed first and must report exactly one removed object before the row is deleted).
- `AttachmentOpenButton` (`src/components/dashboard/consultation/attachment-open-button.tsx`): the single Open control, creating a 300 second signed URL at click time, shared by the consult editor and the Patient Files panel. Legacy URL rows render as a link only when the URL is http or https.
- `print_settings` table: one row per client (`client_id` primary key), header and footer 0-100 mm, left and right 0-50 mm, one decimal, RLS on, explicit grants to `authenticated` only (default anon/public grants revoked).
- `src/lib/print-settings-types.ts` (import-free `clampPrintMargins`, `parseMarginMm`, `parseMarginsForm`, `marginsToForm`), `print-settings-queries.ts` (`fetchPrintSettings` with `maybeSingle`, `savePrintSettings` clamped upsert on `client_id`), `usePrintSettings` (with a `ready` flag that is false while loading or after a failed load), `PrintSettingsModal` with Test print.
- Shared print mechanism, reusable by Phase 3 receipts: `PrintSheet` (body portal, `data-print-root`, static `@page { margin: 0; }`, thead and tfoot mm spacers so margins repeat on every page), `usePrintJob<T>`, `TestPrintBody`, and one global `@media print` block in `src/app/globals.css` that hides everything else and forces black on white. Only numbers from `clampPrintMargins` reach inline styles.
- `PrescriptionPrint` (body-only sheet) and `ConsultationSummaryBody` (shared by the history summary and the read-only completed view, now including vitals).

**Behaviour decisions**
- D-09: temperature in degrees Celsius.
- D-10: the print contains only the patient line (name, age, date), medications with notes, advice, and follow-up date and notes. No vitals, findings, assessment, exercises or app chrome. An empty consult prints "No prescription content recorded."
- D-11: the queue shows View / Print on Completed consults, Patient History has a Print button per Completed visit, and Completed consults open read-only (no Save as Draft, Save & Complete, Cancel Consult or upload) and are never un-completed from that screen.

**Deploy-order rule:** apply the three `20261111_*.sql` migrations (`20261111_consultations_vitals.sql`, `20261111_print_settings.sql`, `20261111_consultation_files_storage.sql`) to live BEFORE deploying this code. The consultation select lists `vitals` and the strip selects `customers.allergies`, so consultation queries fail for every tenant until the objects exist. All three are idempotent and were applied to live on 2026-11-10 after user approval: the vitals migration through Supabase MCP `execute_sql`, and the `print_settings` and storage migrations run by the user in the Supabase SQL Editor (the MCP tool prompt declined that DDL). The probes and rolled-back cross-tenant role simulation are recorded in the 02-01 SUMMARY. Do not use `supabase db push`: the live migration table does not list repo files.

**Known limits (details in CONCERNS.md):** Chrome and Edge are the supported print browsers (Safari does not honour `@page` margins reliably); HEIC photo uploads are rejected by design because the bucket allow-list is pdf, jpg, png and webp (D-12), so export as JPG first; the test print assumes A4.

**Files**
- Added: `supabase/migrations/20261111_{consultations_vitals,print_settings,consultation_files_storage}.sql`, `src/lib/{consultation-vitals,consultation-files,print-settings-types,print-settings-queries}.ts`, `src/hooks/{use-print-settings,use-print-job}.ts`, `src/components/dashboard/patient/patient-strip.tsx`, `src/components/dashboard/consultation/{vitals-card,attachment-open-button,consultation-summary,prescription-print}.tsx`, `src/components/dashboard/print/{print-sheet,print-settings-modal,test-print-body}.tsx`
- Modified: `src/lib/consultation-types.ts`, `src/lib/consultation-queries.ts`, `src/hooks/use-consultations.ts`, `src/components/dashboard/tabs/consultation-tab.tsx`, `src/components/dashboard/patient/patient-files-panel.tsx`, `src/app/globals.css`

## 2026-11-10 — Phase 1: doctor appointments and patients

**Problem:** Receptionists had only a grouped list of appointments, no clinical basics on patient rows, and the live RLS hardening of 2026-11-08 existed only as hand-applied SQL.

**Contracts introduced**
- `src/lib/appointment-queries.ts` write functions: `createAppointment`, `updateAppointment`, `setAppointmentStatus`, plus `fetchAppointmentsRange` (capped at `APPOINTMENT_RANGE_MAX`, ISO date validation, `deleted_at` null). Every write filters `client_id` (and `id` on update) and fails loudly with "Appointment not found." on zero rows. `appointments-tab.tsx` has no direct Supabase table calls.
- `src/lib/appointment-schedule.ts`: import-free pure helpers (slots, staff columns, lane layout, week dates, `findAppointmentConflicts`, `getConflictingIds`), verifiable with plain node.
- `src/hooks/use-appointments-range.ts`: range hook with stale-response guard.
- `src/components/dashboard/appointments-calendar.tsx`: Day (staff columns) and Week views, click-to-book and click-to-edit via the existing modal, advisory overlap warning (amber banner in the modal, amber outline on cards; never blocks save, D-04). `getAppointmentStatusTone` is the single status pill source, shared with the list.
- Customers clinical fields (migration `20261110_customers_clinical_fields.sql`): nullable text `gender`, `blood_group`, `allergies`, `chronic_conditions`; inputs gated by the `consultation` tab. Empty is stored as null; update skips undefined keys.
- Patient profile drawer under `src/components/dashboard/patient/` (Overview with red allergy pills, Visits, Files) and `fetchPatientAttachments` in `consultation-queries.ts`.
- `supabase/migrations/20261108_phase0_tighten_rls.sql` records the live RLS hardening (tasks/products/counters RLS, own-client policies, dropped open policies, function EXECUTE revokes, `search_path` pins). Verified read-only against live on 2026-11-10; the `generate_order_id` service_role grant was removed from the file because live has none.

**Deploy-order rule:** apply `20261110_customers_clinical_fields.sql` to live BEFORE deploying this code. `CUSTOMER_SELECT` references the four new columns, so every customers query fails for every tenant until they exist. Applied to live on 2026-11-10. Do not use `supabase db push`: the live migration table does not list repo files.

**Time storage finding (assumption A-01, resolved):** live `appointments.start_time` / `end_time` are `time without time zone` and `date` is `date`. The calendar renders stored clock time as is; the list view still converts times through IST in `src/lib/time-utils.ts`, so list and calendar may show different times for the same row. Compare during UAT and reconcile in a later plan if they differ.

**Files**
- Added: `src/lib/appointment-schedule.ts`, `src/hooks/use-appointments-range.ts`, `src/components/dashboard/appointments-calendar.tsx`, `src/components/dashboard/patient/{patient-profile-drawer,patient-overview-panel,patient-visits-panel,patient-files-panel}.tsx`, `supabase/migrations/20261108_phase0_tighten_rls.sql`, `supabase/migrations/20261110_customers_clinical_fields.sql`
- Modified: `src/lib/appointment-queries.ts`, `src/lib/billing-types.ts`, `src/lib/billing-queries.ts`, `src/lib/consultation-queries.ts`, `src/components/dashboard/billing/customer-table.tsx`, `src/components/dashboard/tabs/{appointments,customer}-tab.tsx`

## 2026-11-04 — Appointments: collapsible date groups

`appointments-tab.tsx`: Today / Tomorrow / Upcoming / Past group headers are now toggle buttons (chevron, `aria-expanded`). Local `collapsedGroups` state (not persisted): Today open, other groups collapsed on every load. Removed the non-functional "View all" button. Summary cards and filters unchanged.

## 2026-11-04 — Sidebar labels driven by client_tab_access.display_name

**Problem:** Sidebar/drawer labels for existing tabs came from the static `MODULES` config ("Customers"), ignoring per-client names set in the DB (e.g. "Patients").

**Change:** `TabDefinition.customLabel` (src/lib/types.ts) is set in `normalizeTab` (src/lib/tabs.ts) from `client_tab_access.display_name` (null if empty). `getSidebarItemsForModule` (src/lib/module-navigation.ts) uses `customLabel ?? config.label` for `existing-tab` items. Static label remains the fallback only; no hardcoded patient naming. Specialty summary tabs still show "AI-Analytics".

**Files:** `src/lib/types.ts`, `src/lib/tabs.ts`, `src/lib/module-navigation.ts`

**Open:** Headings inside tab bodies (e.g. "customer" wording in forms, "Add customer") are still static copy; extend if the DB label should apply there too. Sidebar and mobile drawer share the resolved items, so both are covered.

## 2026-11-01 — Billing stock alerts + inventory unit safety

**Problem:** POS billing showed permanent red cards for stock issues; mixed units (l stock vs ml recipe) produced false "short by 190 l" because raw numbers were compared.

**Contracts introduced**
- `src/lib/inventory-units.ts` — unit families (weight g/kg, volume ml/l, count unit). Exports `INVENTORY_UNITS`, `getUnitFamily`, `areUnitsCompatible`, `getCompatibleUnits`, `convertQuantity` (null if incompatible), `convertQuantityRounded`, `describeUnitMismatch`. All unit logic must go through this module; no local `units` arrays.
- Recipe unit must be in the same family as the ingredient's stock unit. Enforced in UI (filtered dropdown) and in `inventory-queries.ts` (`createRecipe`/`updateRecipe` throw on mismatch).
- Ingredient unit may change only within its family when recipes use it (`updateIngredient` throws otherwise). `countRecipesForIngredient(clientId, ingredientId)` is exported.

**Behaviour changes**
- `orderService.validateInventory`: recipe qty converted to stock unit before comparing, aggregated per ingredient in stock unit. Incompatible units → one fix-recipe warning, no shortage maths. Message format: `Out of stock: X (short by N u)`, `Low stock: X (N u left)`. Checkout remains non-blocking.
- `billing-tab.tsx`: removed permanent warning cards and `isLowStock`/`isOutOfStock` state; new warnings (diffed vs previous cart) show via `StockAlertToast` (5s auto-dismiss, click to dismiss, max 3 lines + "+N more").
- `recipe-tab.tsx`: unit dropdown limited to ingredient's family; unit defaults to stock unit on ingredient pick; add-to-recipe blocked on mismatch; editing a legacy mismatched row resets unit to stock unit with a notice.
- `ingredient-tab.tsx`: when editing, unit change converts quantity+threshold within family; family change blocked (and options limited) when ingredient is used in recipes.

**Files**
- Added: `src/lib/inventory-units.ts`, `src/components/dashboard/billing/stock-alert-toast.tsx`
- Modified: `src/lib/orderService.ts`, `src/lib/inventory-queries.ts`, `src/components/dashboard/tabs/{billing,recipe,ingredient}-tab.tsx`

**Not done / open**
- DB RPC `create_order_with_inventory` is not in `supabase/migrations/`; unknown whether it converts units on stock deduction. Needs SQL review + migration (`convert_qty`, compat check).
- Legacy mismatched recipe rows are not yet badged in the Recipes list.
- `web-push` missing from local node_modules (tsc error, unrelated); run `npm install`.
