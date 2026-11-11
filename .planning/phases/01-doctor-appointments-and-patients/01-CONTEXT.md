# Phase 1: Doctor appointments and patients - Context

**Gathered:** 2026-11-10
**Status:** Ready for planning
**Source:** Decisions made in the planning conversation of 2026-11-07..10 (codebase + live Supabase analysis), not a discuss-phase run.

<domain>
## Phase Boundary

Make appointments usable for a receptionist (day/week calendar, conflict warning, writes moved into the query layer), add clinical basics to a patient and a patient profile drawer, and put the already-applied live RLS hardening into git. **Not in this phase:** vitals, consult changes, print, billing, WhatsApp/reminders, online booking, `patient_id` on appointments.

Patients are `customers` rows (the Customer tab is labelled "Patient" for the doctor client via `client_tab_access.display_name`). The doctor test client is `eafea940-a6d1-4aa2-95e2-339f614502ea`.

</domain>

<decisions>
## Implementation Decisions

### Calendar (APPT-01, APPT-02)
- **D-01:** Add a Day/Week toggle to the existing `appointments-tab.tsx`; the current grouped list stays as the default/other view. New component file (e.g. `appointments-calendar.tsx` under `src/components/dashboard/`) — no calendar library, Tailwind + existing `cn()` and tokens. — **Reversibility:** reversible.
- **D-02:** Columns = distinct `staff_name` values (already derived by `fetchAppointmentFilterOptions`); rows = time slots using the tab's existing `TIME_STEP_SECONDS` / `snapTimeToStep`. An appointment with no `staff_name` goes in an "Unassigned" column.
- **D-03:** Clicking an empty slot opens the existing add modal prefilled (date, start_time, end_time, staff_name); clicking a card opens the existing edit modal. Reuse the existing modal/form state, do not build a second form.
- **D-04:** Conflict warning = same `staff_name`, same `date`, overlapping `[start_time, end_time)`, ignoring `status = 'cancelled'` and the appointment being edited. Check client-side against the loaded range; it is a **warning, not a block** (user can still save). No DB constraint in this phase. — **Reversibility:** reversible.
- **D-05:** Calendar loads one range via a new `fetchAppointmentsRange(clientId, fromDate, toDate)` (not the 200-row capped list fetch). Always `.eq("client_id", clientId).is("deleted_at", null)`.

### Query layer (APPT-03)
- **D-06:** Add to `src/lib/appointment-queries.ts`: `createAppointment`, `updateAppointment`, `setAppointmentStatus`, `fetchAppointmentsRange`. Existing `softDeleteAppointment` stays. Replace the direct `client.from("appointments").insert/update` calls in `appointments-tab.tsx` (around the save handler and status-change handler). Pure refactor: no behaviour change to the list view. Keep the `raise`/`throw error` style of the file; every write filters `.eq("client_id", clientId)`.
- **D-07:** Appointment-to-patient matching stays **by phone** (`findOrCreatePatientForAppointment` in `consultation-queries.ts`). Do NOT add `appointments.patient_id`. — **Reversibility:** reversible (nullable column can be added later).
- **D-08:** Appointment `status` is free text in DB (`tentative | booked | cancelled | completed`; legacy `pending` may exist). Do not tighten with a DB constraint here.

### Patient fields and profile (PAT-01, PAT-02)
- **D-09:** Migration `supabase/migrations/20261110_customers_clinical_fields.sql`: `alter table public.customers add column if not exists gender text, blood_group text, allergies text, chronic_conditions text` — all nullable, no defaults, no RLS change (existing `customers_*_own` policies cover the table). — **Reversibility:** reversible (additive nullable columns).
- **D-10:** Extend `CustomerRecord`, `CustomerPayload`, the select list and `mapCustomer`/`createCustomer`/`updateCustomer` in `src/lib/billing-queries.ts` + `billing-types.ts` (columns snake_case on the Record, camelCase on Payload per AGENTS.md). Add the four fields to the existing customer add/edit modal in `customer-table.tsx`.
- **D-11:** Clinical fields and the profile drawer are shown **only when the client has the `consultation` tab** (`useApp()` tabs contains key `consultation`), so cafe clients' Customer tab is unchanged. No new feature-flag system.
- **D-12:** Patient profile = a slide-over drawer opened by clicking a patient row; three tabs: **Overview** (demographics, allergies prominent in red, chronic conditions, notes), **Visits** (reuse `fetchPatientConsultationHistory`; extract the history list from `consultation-tab.tsx` into a shared component only if it is a straight lift), **Files** (list existing `consultation_attachments` for that patient's consultations as name + link; Phase 2 replaces upload with private Storage). Loading / empty / error states via `DataState`. New files under a `src/components/dashboard/patient/` folder.

### Security migration sync (SEC-01)
- **D-13:** Add `supabase/migrations/20261108_phase0_tighten_rls.sql` containing exactly what is **already live** in Supabase project `ltbqxyvdtrrlohdfrprf` (applied manually 2026-11-08, steps A-F). It must be **idempotent** (`drop policy if exists`, `create policy` guarded by drop-first, `alter ... enable row level security` is safe to repeat) so re-running on live is a no-op. Live end state: RLS enabled on `products`, `bill_order_counters`, `client_code_counters`, `tasks`; `generate_client_code()` is SECURITY DEFINER with `search_path=public`; dropped open policies on `appointments` (read-all, public insert), `bill_items` (read-all + 2 legacy), `bills` (2 legacy), `products` (2 legacy + `products_allow_read_all`), `clients` (5 open read policies), `bill_order_counters` (open ALL); added `tasks_{select,insert,update,delete}_own` using `crm_can_access_client(client_id)`; EXECUTE revoked from anon/public on `create_order_with_inventory`, `get_client_code`, `current_client_id` (kept for authenticated + service_role) and from public/anon/authenticated on `generate_order_id` and `generate_client_code` (trigger functions); `search_path=public` set on `create_order_with_inventory`, `update_updated_at_column`, `update_customer_loyalty_updated_at`. Reference SQL: step list in this conversation; a draft is at `C:\Users\ANKUR~1.SHA\AppData\Local\Temp\claude\bd9ed7b402620258\7a76d082-690b-4e93-b065-5c9849424c74\scratchpad\phase0_tighten_rls.sql` (may be gone; verify against live with `pg_policies`).
- **D-14:** Repo migrations are **not** tracked by the live migration table (it lists 8 versions; none of the repo's files). Do not try to "apply" repo migrations to live in this phase; the executor must NOT run destructive SQL against live. Live verification is read-only (`execute_sql` selects, advisors).

### UX (user wants simple, not crowded)
- **D-15:** Receptionist-first. Max 2 clicks to book, move, or open a patient. Status shown with colour pills reused from the existing tab. Every list/drawer has loading, empty ("No appointments today" with one action) and error states. Calendar and drawer must work at mobile width (calendar may scroll horizontally inside its container; page itself must not).
- **D-16:** No new npm dependencies.

### Claude's Discretion
- Exact component file/prop names, hour range shown (suggest 08:00-20:00, configurable constant), slot height, and how week view collapses on mobile (day view default on small screens).
- Whether to extract the consult history list into a shared component or re-render a simple list in the drawer.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project law
- `AGENTS.md` — conventions, naming, error handling, "do not create parallel services/tables/components", tab render contract
- `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md` (APPT-01..03, PAT-01..02, SEC-01), `.planning/ROADMAP.md` (Phase 1 success criteria)

### Code
- `src/components/dashboard/tabs/appointments-tab.tsx` — current list UI, form state, direct Supabase writes to replace
- `src/lib/appointment-queries.ts` — existing fetch + `softDeleteAppointment` pattern
- `src/lib/consultation-queries.ts` — `fetchPatientConsultationHistory`, `findOrCreatePatientForAppointment`
- `src/components/dashboard/tabs/consultation-tab.tsx` — history panel to reuse
- `src/components/dashboard/billing/customer-table.tsx`, `src/lib/billing-queries.ts`, `src/lib/billing-types.ts` — customer CRUD to extend
- `src/components/dashboard/billing/data-state.tsx`, `entity-modal.tsx`, `src/lib/list-pagination.ts`, `src/contexts/app-context.tsx` (`useApp` tabs)
- `supabase/migrations/20261107_appointments_soft_delete.sql` — migration style and `deleted_at` index

### Live DB facts (verified 2026-11-08/10)
- `appointments`: id, client_id, name, phone, email, service, location, staff_name, date, start_time, end_time, status (text), remark, created_by, verified_at/by, reminder_sent(+_at), created_at, deleted_at. RLS: own-client policies via `current_client_id()`.
- `customers`: id, client_id, name, phone, email, dob, created_at, end_date, is_active, outreach_status, contact_tags, contact_source, last_activity_at, is_blocked, notes, assigned_to. RLS via `clients.crm_user_id = auth.uid()`.
- `consultations`/`consultation_*`: RLS via `crm_can_access_client(client_id)`.

</canonical_refs>

<specifics>
## Specific Ideas

- Time slots use the existing 15/30-min step constant from the appointments tab.
- Allergies render as a red pill so a doctor cannot miss them.

</specifics>

<deferred>
## Deferred Ideas

- Reminders over WhatsApp (`appointments.reminder_sent*` columns already exist) — paused with WhatsApp work.
- `appointments.patient_id`, online booking link, patient portal, audit log/consent.
- UI-SPEC design contract (skipped via `--skip-ui`; run `/gsd-ui-phase 1` later if a visual contract is wanted).

</deferred>
