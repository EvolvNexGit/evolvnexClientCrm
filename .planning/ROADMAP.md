# Roadmap: EvolvNex Business Growth OS

## Overview

This milestone turns the existing client-scoped CRM into a usable **doctor/clinic** product on the same multi-tenant OS: a real appointment calendar, a patient profile, a consultation with printable prescription, and simple clinic billing. Clinic features are enabled per client through `client_tab_access`; cafe/POS clients keep their current tabs. The WhatsApp inbox roadmap was dropped on 2026-11-10 (existing WhatsApp code in `src/` is untouched, only the planned work is paused). Live RLS hardening (Phase 0) was applied directly to Supabase on 2026-11-08 and is synced into the repo as part of Phase 1.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (1.1, 2.1): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Doctor appointments and patients** - Calendar, appointment queries, patient profile, Phase 0 RLS migration in repo
- [ ] **Phase 2: Consultation and print** - Vitals, private file upload, letterhead print settings, prescription print
- [ ] **Phase 3: Doctor billing** - doctor-billing tab, clinic bill function, receipt print

## Phase Details

### Phase 1: Doctor appointments and patients

**Goal:** Receptionists book and move appointments on a day/week calendar, and staff see a patient profile with clinical basics, without changing the appointment-to-patient matching (phone) or adding tables beyond nullable columns.
**Depends on:** Nothing (first phase)
**Requirements:** APPT-01, APPT-02, APPT-03, PAT-01, PAT-02, SEC-01
**Success Criteria** (what must be TRUE):
  1. Appointments tab offers a day and week calendar with staff columns; clicking an empty slot opens the add form prefilled; the existing list view still works
  2. Booking or moving an appointment onto an overlapping slot for the same staff shows a conflict warning
  3. Appointment create, update and status changes go through `appointment-queries.ts` (no direct Supabase writes left in the tab)
  4. A patient has gender, blood group, allergies and chronic conditions; allergies show prominently on the patient profile
  5. Patient profile shows Overview, Visits (consult history) and Files for one patient from the customer list
  6. `supabase/migrations/20261108_phase0_tighten_rls.sql` in git matches what is live; tenant A cannot read tenant B appointments, bills, products or clients

**Plans:** 7/7 plans executed
**UI hint**: yes

Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Appointment query layer: create/update/status/range, tenant-scoped, tab writes moved (APPT-03) [wave 1]
- [x] 01-02-PLAN.md — SEC-01 migration file 20261108_phase0_tighten_rls.sql, idempotent, matches live (SEC-01) [wave 1]
- [x] 01-03-PLAN.md — Customers clinical fields: migration, types, queries, consultation-gated modal inputs (PAT-01) [wave 1]

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-04-PLAN.md — Day/Week calendar with staff columns, click-to-book and click-to-edit (APPT-01) [wave 2]
- [x] 01-05-PLAN.md — Patient profile drawer: Overview, Visits, Files, allergies in red (PAT-02) [wave 2]

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 01-06-PLAN.md — Advisory conflict warning in the modal and on calendar cards (APPT-02) [wave 3]

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 01-07-PLAN.md — Live apply of clinical migration (user), read-only SEC-01 parity check, docs, phase gates and UAT [wave 4]

### Phase 2: Consultation and print

**Goal:** A doctor records vitals, attaches real files privately, and prints a body-only prescription on pre-printed letterhead using the clinic's own margin settings.
**Depends on:** Phase 1
**Requirements:** CONS-01, CONS-02, CONS-03, PRNT-01, PRNT-02
**Success Criteria** (what must be TRUE):
  1. Consultation form stores and shows vitals (BP, pulse, temperature, weight, SpO2) on `consultations.vitals`
  2. A pinned patient strip (name, age, allergies) stays visible while the consult form scrolls
  3. Attachments upload to a private `consultation-files` bucket scoped by `client_id`; viewing uses signed URLs; another tenant cannot fetch the file
  4. A clinic saves header height, footer height, left and right margins (mm) once; print uses them via CSS `@page`
  5. Printing a completed consult outputs medications, advice and follow-up in the body area only

**Plans:** 6/6 plans executed
**UI hint**: yes

Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Live read-only probes, three idempotent migrations (vitals, print_settings, private bucket + storage policies) and the approved apply to live with isolation probes (CONS-01, CONS-03, PRNT-01) [wave 1]

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — Pinned patient strip (name, age, allergies) and vitals data layer plus Vitals card (CONS-01, CONS-02) [wave 2]

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-03-PLAN.md — Private file upload, signed-URL Open shared by editor and Patient Files, guarded legacy URLs, object-first delete (CONS-03) [wave 3]

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 02-04-PLAN.md — Print settings (mm margins per client) and the shared PrintSheet + usePrintJob + print CSS with a Test print (PRNT-01) [wave 4]

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 02-05-PLAN.md — Body-only prescription print, queue View / Print, history Print, read-only Completed consult (PRNT-02) [wave 5]

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 02-06-PLAN.md — Docs, phase gates and consolidated end-of-phase UAT (CONS-01..03, PRNT-01..02) [wave 6]

### Phase 3: Doctor billing

**Goal:** Doctor clients bill consult fees from a dedicated doctor-billing tab that reuses the existing bills tables, prints a receipt, and never pollutes cafe analytics or order alerts.
**Depends on:** Phase 2
**Requirements:** BILL-01, BILL-02, BILL-03, BILL-04, BILL-05
**Success Criteria** (what must be TRUE):
  1. Doctor client `eafea940-a6d1-4aa2-95e2-339f614502ea` sees `doctor-billing` (key 015) and no longer sees `004 Billing`; `009 Transaction` stays; cafe clients are unaffected
  2. A bill can be created from a completed consult with patient and fee prefilled, with payment mode and paid/unpaid status
  3. Clinic bills use order source `Clinic` and a final status, so they never appear as active orders or trigger alerts and are excluded from cafe summary numbers
  4. The bill is created by a `SECURITY INVOKER` function that verifies customer, products and consultation belong to the caller's client; a foreign id is rejected
  5. A receipt prints through the Phase 2 print mechanism; an unpaid list shows outstanding bills

**Plans:** 2/7 plans executed
**UI hint**: yes

Plans:
**Wave 1**
- [x] 03-01-PLAN.md — Live re-confirmation of LF-1..LF-9, migrations A (enum Clinic, alone), B (payment CHECK, indexes, create_clinic_bill) and C (015 tab access, authored only); A then B applied by the user with rolled-back isolation probes (BILL-01, BILL-02, BILL-03) [wave 1]

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 03-02-PLAN.md — Clinic billing types and queries, doctor-billing tab with Unpaid | All list and Mark paid, and the four-file registration of tab key 015 (BILL-01, BILL-02, BILL-04) [wave 2]

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 03-03-PLAN.md — Cafe isolation: NULL-safe Clinic predicate and guards E1-E4 (active orders, transactions-since, realtime alert, push) plus doctor summary opt-in with paid-only revenue (BILL-05) [wave 3]

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 03-04-PLAN.md — Receipt: ClinicReceiptPrint through the Phase 2 PrintSheet, shared print hook, Print and settings states in the billing tab (BILL-04) [wave 4]

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 03-05-PLAN.md — Create-bill modal (fee prefill, discount, payment) and Create bill from Completed queue rows and the read-only consult (BILL-02, BILL-03) [wave 5]

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 03-06-PLAN.md — Apply migration C last, after the code is deployed: doctor client gets 015 and loses 004 (BILL-01) [wave 6]

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 03-07-PLAN.md — Docs, phase gates and consolidated end-of-phase UAT (BILL-01..05) [wave 7]

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Doctor appointments and patients | 7/7 | In Progress | - |
| 2. Consultation and print | 6/6 | In Progress | - |
| 3. Doctor billing | 2/7 | In Progress | - |
