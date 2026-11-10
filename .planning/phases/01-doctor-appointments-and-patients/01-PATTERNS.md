# Phase 1: Doctor appointments and patients - Pattern Map

**Mapped:** 2026-11-10
**Files analyzed:** 11
**Analogs found:** 10 / 11 (all analog paths verified git-tracked)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/lib/appointment-queries.ts` (add create/update/setStatus/range) | query module | CRUD | same file `softDeleteAppointment` + `fetchAppointmentFilterOptions` | exact |
| `src/components/dashboard/tabs/appointments-tab.tsx` (modify) | component (tab) | CRUD | itself (lines 542-663) | exact |
| `src/components/dashboard/appointments-calendar.tsx` (new) | component | request-response (read, click callbacks) | `appointments-tab.tsx` (pills, TIME_STEP) | partial |
| `src/lib/billing-queries.ts` + `billing-types.ts` | query + types | CRUD | itself (`CUSTOMER_SELECT`, `mapCustomer`, `createCustomer`, `updateCustomer`) | exact |
| `src/components/dashboard/billing/customer-table.tsx` | component | CRUD | itself (`CustomerFormState`, form, row) | exact |
| `src/components/dashboard/patient/patient-profile-drawer.tsx` (new) | component | request-response | `entity-modal.tsx` (shell) + `consultation-tab.tsx` 1601-1670 (history) | role-match |
| `src/components/dashboard/patient/*` tabs (Overview/Visits/Files) | component | request-response | `consultation-tab.tsx` history panel | role-match |
| a patient-files fetch (in `consultation-queries.ts` or patient file) | query | CRUD (read) | `fetchConsultationById` attachments block (consultation-queries.ts 321-374) | role-match |
| `supabase/migrations/20261110_customers_clinical_fields.sql` | migration | batch | `20260817_customer_contact_fields.sql` | exact |
| `supabase/migrations/20261108_phase0_tighten_rls.sql` | migration | batch | `20260814_whatsapp_auto_replies.sql` (RLS section) | role-match |
| Drawer slide-over primitive | component | - | none (only centered `EntityModal`) | none |

## Pattern Assignments

### `src/lib/appointment-queries.ts` (query, CRUD)

**Analog:** same file. Keep `getClient()` (lines 39-45) and `throw error` style (file does NOT use `raise`; AGENTS.md says keep file's style).

**Write pattern** (lines 156-168):
```typescript
export async function softDeleteAppointment(clientId: string, appointmentId: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("appointments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("id", appointmentId);
  if (error) { throw error; }
}
```
New `updateAppointment(clientId, id, payload)` / `setAppointmentStatus(clientId, id, status)` copy this exactly (current tab writes at lines 605 and 647 are MISSING `.eq("client_id")`; adding it is required by D-06).

**Insert:** current tab code (appointments-tab.tsx 597-602): `.insert({ client_id: clientId, ...payload })`. Move into `createAppointment(clientId, payload)`.

**Range fetch** (model on lines 181-188, replace the order/range tail):
```typescript
.from("appointments").select(APPOINTMENT_SELECT)
.eq("client_id", clientId).is("deleted_at", null)
.gte("date", fromDate).lte("date", toDate)
.order("date", { ascending: true }).order("start_time", { ascending: true, nullsFirst: false })
```
Return `AppointmentRow[]`. Define an `AppointmentPayload` type (snake_case, matching the tab's `payload` object at appointments-tab.tsx 579-591: name, phone, email, service, staff_name, location, date, start_time, end_time, status, remark). Types live in this file (`AppointmentRow` is exported here, no separate types file); note `status` union on `AppointmentRow` excludes legacy `pending` (D-08).

### `appointments-tab.tsx` (modify)

- Replace lines 573-577 (`getSupabaseClient()` null check) and 593-609 with `createAppointment`/`updateAppointment`; lines 640-651 with `setAppointmentStatus`. Remove `getSupabaseClient` import (line 35) only if no other use remains (grep first).
- Error handling to preserve (628-630): `setAddError(saveError instanceof Error ? saveError.message : "Unable to save appointment.")`. Supabase `throw error` is a PostgrestError, not an `Error` instance, so message falls to fallback; acceptable (pure refactor), or use `formatSupabaseError`.
- Reusable bits to export/share with calendar: `TIME_STEP_MINUTES=10`, `TIME_STEP_SECONDS`, `snapTimeToStep` (lines 93-104, currently module-private; extract to calendar or export), `toNullable` (75-78), `initialForm` (61-73).
- Prefill modal for empty-slot click: set form state then `setModalMode("add")` like `openAddModal` (501-505) but `setForm({...initialForm, date, start_time, end_time, staff_name})` after `resetForm`. Card click: `openEditModal(appointment, "edit")` (507-523). Status pills: reuse existing status class helper in the tab (grep `status` badge map near list rendering ~1000-1100; not extracted).
- Modal: `EntityModal` (billing/entity-modal.tsx).

### `appointments-calendar.tsx` (new; no calendar analog)

Props suggestion: `{ appointments, staffColumns, date/range, onSlotClick(staff,date,time), onCardClick(a), loading, error }`. Named export, `"use client"`, `@/` imports, `cn` from `@/lib/utils`, tokens `bg-card border-border text-muted-foreground`. Wrap scroll in `overflow-x-auto` container (D-15). Use `DataState` (below) for loading/error/empty. Conflict check as pure function: same `staff_name`, same `date`, `aStart < bEnd && bStart < aEnd`, skip `status==='cancelled'` and edited id; treat null `end_time` as start+step.

### `billing-types.ts` / `billing-queries.ts` (customer clinical fields)

**Types** (billing-types.ts 7-36): add to `CustomerRecord` `gender: string | null; blood_group: string | null; allergies: string | null; chronic_conditions: string | null;` and to `CustomerPayload` `gender?, bloodGroup?, allergies?, chronicConditions?: string | null`.

**Three places hold the column list; all must change** in billing-queries.ts:
- `CUSTOMER_SELECT` (line 79-80)
- `createCustomer` returning `.select(...)` string (lines 231-233)
- `mapCustomer` (87-103): add `gender: row.gender ?? null,` etc.

**Create/update** (lines 215-230, 251-265) pattern to copy:
```typescript
notes: payload.notes?.trim() || null,                                     // create
...(payload.notes !== undefined ? { notes: payload.notes?.trim() || null } : {}),  // update
```
`updateCustomer` already filters `.eq("client_id", clientId)`. Row mapper uses `row: any` (legacy; do not extend, but adding fields inside it is fine).

### `customer-table.tsx` (modify)

- `CustomerFormState` / `initialForm` (37-51): add four string fields. Form is persisted via `usePersistentState("customer-table-form", ...)` so old persisted state lacks new keys; default with `?? ""` when reading.
- `openEdit` (129) maps record to form; submit builds payload at 147-151 (create) and 171-175 (update): add the new fields there.
- Form fields (390-443): inputs use `form`/`onChange({ ...form, x: e.target.value })`. Gate the four new inputs by `hasConsultationTab`.
- Row click: `<tr key={customer.id} className="hover:bg-muted/40">` at line 280 (desktop) and mobile cards ~253; add `onClick` + `cursor-pointer` only when consultation tab present; existing Edit/Deactivate buttons (291-305) need `event.stopPropagation()`.
- Gate (D-11): `const { tabs } = useApp();` (`tabs: TabDefinition[]`, app-context.tsx line 23) then `tabs.some((t) => t.key === "consultation")`. Verify the `TabDefinition` field name in `src/lib/types.ts` (code key is `consultation`, from `tabs.ts` line 167 `"014": "consultation"`). `CustomerTable` currently receives no clientId; drawer needs it: pass as new prop from the parent customer tab or use `useClient()`/`useApp().clientId`.

### Patient profile drawer (new, `src/components/dashboard/patient/`)

**No slide-over analog.** Copy structure from `EntityModal` (entity-modal.tsx 19-52): fixed overlay `fixed inset-0 z-50 bg-black/70`, `onClick={onClose}` + inner `stopPropagation`, `role="dialog" aria-modal="true"`, header with Close button (`h-11 min-w-11`), scroll body `min-h-0 flex-1 overflow-y-auto overscroll-contain`. Change alignment to `justify-end` and panel `h-full w-full sm:max-w-md` for a right drawer (full-width on mobile).

**Visits tab:** call `fetchPatientConsultationHistory(clientId, patientId)` (consultation-queries.ts 378-): returns `ConsultationHistoryItem[]` (`{id, filter, date, time, title, status, statusTone, ringTone}`, consultation-types.ts 156-165). Do NOT extract from consultation-tab (the list at 1656-1700 is embedded with selection state, filters, and `HistorySummary`; not a straight lift). Re-render a simple list using the card markup at 1660-1670 (`rounded-2xl border border-border bg-background p-4`, ring dot `item.ringTone`, status `item.statusTone`). Empty copy to reuse: "No consultation history for this patient yet." Note it queries `consultations.patient_id` = customers.id.

**Load/error pattern (copy from consultation-tab 572-602):** effect with cancelled flag, `loading`/`error` state, `loadError instanceof Error ? loadError.message : "Unable to ..."`.

**DataState** (billing/data-state.tsx): `<DataState loading error empty emptyLabel />`, renders null when data present:
```tsx
<DataState loading={loading} error={error} empty={!loading && !error && items.length === 0} emptyLabel="No visits yet." />
```

**Files tab:** no existing patient-level attachments query. Analog `fetchConsultationById` attachments block (consultation-queries.ts 321-326, 364-374):
```typescript
supabase.from("consultation_attachments").select("*")
  .eq("client_id", clientId).eq("consultation_id", consultationId)
  .order("uploaded_at", { ascending: false })
```
New function (put in `consultation-queries.ts`, reuse its `getClient`/`raiseQueryError` at lines 46-57): first select consultation ids for `patient_id` (same filter as history), then `.in("consultation_id", ids)` on attachments; map to `{id, file_name, file_url, uploaded_at}` (field names per mapper lines 364-374). Short-circuit empty ids. Render name + `<a href={file_url} target="_blank" rel="noreferrer">`.

**Overview:** allergies red pill: use `border-primary/50 bg-primary/10 text-primary` (the red token used by DataState error) or `bg-red-500/10 text-red-400`.

### `20261110_customers_clinical_fields.sql`

**Analog:** `supabase/migrations/20260817_customer_contact_fields.sql` (header comment line, then `alter table public.customers add column if not exists ...`). 
```sql
-- Doctor clients: clinical basics on customers (patients). Nullable, additive.
alter table public.customers
  add column if not exists gender text,
  add column if not exists blood_group text,
  add column if not exists allergies text,
  add column if not exists chronic_conditions text;
```

### `20261108_phase0_tighten_rls.sql`

**Analog:** `20260814_whatsapp_auto_replies.sql` lines 65-124. Copy these idioms:
```sql
alter table public.X enable row level security;
drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks for select to authenticated
using (public.crm_can_access_client(client_id));
-- insert: with check (...); update: using + with check; delete: using
```
`crm_can_access_client(uuid)` is defined there (lines 72-86: `language sql stable set search_path = public`; `grant execute ... to authenticated`). Do not redefine; live already has it. Header comment style: first line purpose, second "RLS enabled; never disable".
For revokes: `revoke execute on function public.get_client_code(...) from anon, public;` (signatures must match live; check with `pg_proc`/`pg_policies` read-only per D-14). `alter function ... set search_path = public;` and `create or replace function generate_client_code() ... security definer set search_path = public` need the live body (not in repo); copy from live via read-only `pg_get_functiondef`. All `drop policy if exists <name> on public.<table>` for the open policies listed in D-13; exact names must be pulled from live `pg_policies`.
Soft-delete migration (`20261107_appointments_soft_delete.sql`) style: `if not exists` everywhere, partial index `where deleted_at is null`.

## Shared Patterns

### Tenant scoping
Every query `.eq("client_id", clientId)`; clientId first arg. Appointments reads add `.is("deleted_at", null)`.

### Error handling
- appointment/billing modules: `if (error) { throw error; }`
- consultation module: `raiseQueryError(error, "Unable to load ...")` (`formatSupabaseError`, consultation-queries.ts 55-57)
- UI: `error instanceof Error ? error.message : "fallback"` into `string | null` state.

### Loading/empty/error UI
`DataState` from `@/components/dashboard/billing/data-state` (props `loading, error, empty, emptyLabel`).

### Modal
`EntityModal` (`open, title, onClose, children, contentClassName`) for add/edit; keep one form (D-03).

### Consultation-tab gate
`useApp().tabs.some(t => t.key === "consultation")` (D-11).

## No Analog Found

| File | Reason |
|---|---|
| Slide-over drawer primitive | Only centered `EntityModal` exists; adapt it |
| Calendar grid | No calendar/time-grid component in repo; build with Tailwind |
| Patient-level attachments query | Only per-consultation attachments exist |

## Metadata

**Analog search scope:** `src/lib`, `src/components/dashboard`, `src/contexts`, `supabase/migrations`
**Date:** 2026-11-10
**Caveats:** `appointments-tab.tsx` is ~1420 lines, only lines 56-125, 498-673 read plus grep of the rest; status-pill helper location not pinned (grep before planning). No test runner exists in repo (AGENTS.md).
