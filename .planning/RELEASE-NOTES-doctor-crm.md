# Doctor CRM sprint: release notes and test guide

Branch: `feature/doctor-crm-phase1` into `main`. Phases 1 to 3 of the doctor/clinic milestone.
Written for: QA, product and the team deploying this branch.

## 1. What this release is

The existing client-scoped CRM becomes a usable doctor/clinic product on the same multi-tenant app. Clinic features are switched on per client through `client_tab_access`. Cafe/POS clients keep their current tabs and numbers. The earlier WhatsApp inbox roadmap was dropped for now; existing WhatsApp code is untouched.

## 2. Features added

### Phase 1: Appointments and patients
- **Calendar:** Appointments tab has Day and Week views with staff columns. Click an empty slot to book (form prefilled); click a card to edit. The old list view still works.
- **Conflict warning:** booking or moving an appointment onto an overlapping slot for the same staff shows a warning. It is advisory, not a block.
- **Query layer:** all appointment create, update and status writes go through `appointment-queries.ts`.
- **Patient clinical fields:** gender, blood group, allergies, chronic conditions (nullable columns on `customers`).
- **Patient profile drawer:** Overview, Visits (consult history) and Files. Allergies show in red.
- **Security:** the live RLS hardening done on 2026-11-08 is now in git (`20261108_phase0_tighten_rls.sql`).

### Phase 2: Consultation and print
- **Vitals:** BP, pulse, temperature, weight, SpO2 stored on the consultation.
- **Patient strip:** name, age and allergies stay pinned while the consult form scrolls.
- **Private attachments:** uploads (pdf, jpg, png, webp) go to a private `consultation-files` bucket scoped by client; opened through short-lived signed links (5 minutes). Another clinic cannot fetch them.
- **Print settings:** header height, footer height, left and right margins in mm, saved once per clinic.
- **Prescription print:** body-only print (medications, advice, follow-up) for pre-printed letterhead, using the saved margins. Available from queue rows (View / Print) and Patient History.
- **Completed consults** open read-only and are never un-completed from that screen.

### Phase 3: Doctor billing
- **Billing tab** (POS module, key 015, label "Billing") for the doctor client. It lists Unpaid and All bills, with Mark paid (CASH, UPI, CARD, OTHER).
- **Create bill** from a COMPLETED consultation (queue row or read-only view). Fee comes from Services items; prices are computed on the server; optional flat discount; pay now or leave unpaid. One bill per consultation.
- **Receipt print** through the same print mechanism and margins as the prescription. Receipt number is the bill's order id (for example `T-3-1`).
- **Cafe isolation:** Clinic bills never show as active orders, never fire order alerts or push, and are excluded from cafe summary numbers. The doctor summary includes them, counting only paid bills as revenue and unpaid as pending.
- **Tab change for the doctor client:** old "004 Billing" disabled (not deleted), new "015 Billing" enabled. "009 Transactions" stays.
- **Write guard:** Clinic bills can only be created by the server function; updates may only move unpaid to paid with a mode; amounts are frozen and Clinic bills cannot be deleted.

### Tester feedback fixes (branch `fix/doctor-crm-tester-ui-feedback`)
1. Consultation Medication rows have visible labels (Medicine name, Dosage, Frequency, Duration, Instructions).
2. Bill modal: quantity is a minus / plus stepper (1 to 99, never blank); each item is a compact card.
3. Doctor billing tab opens on the All filter.
4. Walk-in removed from New Consult and from the KPI row (4 cards); legacy walk-in rows still show their pill.
5. Spent hidden on the Patient tab (table, card, CSV) for clinical tenants; POS tenants keep it.
6. Light theme: white cards on a near-white page, single red accent, neutral consult KPI icon chips.
7. Light-mode white line above the dashboard fixed: the header used a token opacity class that generates no CSS, so it was transparent. It is now opaque.
8. Add appointment shows Customer, Phone, Service, Date and Start time first; the rest is under More options.
9. Appointments list: one compact row (search, Filters with count badge, Clear); filters in a panel.
10. Doctor summary KPI cards: heavy shadow only in dark mode.
11. AI Analytics bell: real button with a badge and a panel of today's upcoming appointments; sound plus browser notification once when an appointment is 5 minutes away (shares the existing alert opt-in).
12. Per-doctor print profiles (Print settings, Doctor profile / print): Letterhead or Standard (printed clinic/doctor header), optional margin overrides, one default profile. Receipts resolve doctor profile, then default profile (clinic details only), then letterhead margins. With nothing configured receipts print exactly as before.

## 3. Database changes (apply in this order, by hand in the Supabase SQL Editor, never the CLI push)

| Order | File | What |
|---|---|---|
| Phase 0 | `20261108_phase0_tighten_rls.sql` | Already live; recorded in repo |
| P1 | `20261110_customers_clinical_fields.sql` | Patient clinical columns |
| P2 | `20261111_consultations_vitals.sql`, `20261111_print_settings.sql`, `20261111_consultation_files_storage.sql` | Vitals, margins, private bucket and policies |
| P3 A | `20261112_bills_order_source_clinic.sql` | Enum label `Clinic` (run alone) |
| P3 B | `20261112_clinic_billing_schema.sql` | Payment constraints, indexes, `create_clinic_bill` |
| P3 C | `20261112_doctor_billing_tab.sql` | Doctor client gets tab 015, 004 disabled. Run after the code is deployed |
| P3 D | `20261113_clinic_bills_write_guard.sql` | Write guards on Clinic bills |
| Print profiles | `20261114_doctor_print_profiles.sql` | Table `doctor_print_profiles` (per-doctor print template, RLS, one default per client). Authored, NOT applied to live; run by hand in the SQL Editor BEFORE deploying this code, because receipt printing reads the table |

The files above the print-profiles row are already applied on the live project `ltbqxyvdtrrlohdfrprf`. Deploy the code, then have the doctor sign out and in again (tab list is cached).

## 4. How to access

1. Sign in as the doctor test user (client `eafea940-a6d1-4aa2-95e2-339f614502ea`).
2. **CRM module:** Appointments, Patients, Consultations. **POS module:** Billing, Services, Transactions.
3. Before testing billing: add at least one fee item in **Services** (the doctor client has none).
4. Cafe clients need no change; use one to confirm nothing moved (section 6).

## 5. How to test

Detailed checklists with tick boxes live in the repo:
- `.planning/phases/02-consultation-and-print/02-HUMAN-UAT.md` (34 items)
- `.planning/phases/03-doctor-billing/03-HUMAN-UAT.md` (35 items)
- `.planning/phases/03-doctor-billing/03-REVIEW-FIX.md` (10 extra checks)

Quick smoke path, about 15 minutes:

**Appointments and patients**
1. Appointments, Day view: click an empty slot, book. Move another appointment onto the same staff slot and confirm the conflict warning.
2. Switch to Week, then to List; confirm all three show the booking.
3. Patients: open a profile, set an allergy; it shows in red. Check Overview, Visits and Files.

**Consultation and print**
4. Open a consultation: patient strip stays visible while scrolling; enter vitals; save as draft, reload, values persist.
5. Upload a pdf or image; click Open (signed link works). Try a `.heic`; it is rejected by design.
6. Print settings: set margins, press Test print. Use Chrome or Edge.
7. Complete the consult, print the prescription: only the body area prints. The completed consult opens read-only.

**Billing**
8. Services: add a fee item (for example "Consultation 500").
9. Consultations: on a Completed row of today, click Create bill. Pick the fee, add a discount, leave Unpaid, save. Note the bill number.
10. POS, Billing: the bill appears under Unpaid. Mark paid with a mode; it moves out of Unpaid and shows under All.
11. Print the receipt; margins match the saved settings.
12. Try to bill the same consultation again: you get "already billed".
13. Dashboard summary (doctor): paid bill counts as revenue, unpaid shows as pending.

**Isolation (cafe client)**
14. Sign in as a cafe client: no new tabs, summary and active orders unchanged, no clinic bill visible.

## 6. Known limits (not bugs)
- Print is supported on Chrome and Edge only; Safari margins are unreliable.
- HEIC photo uploads are rejected (pdf, jpg, png, webp only).
- Only today's consultations can be billed from the UI.
- Clinic bills also appear in the Transactions tab (as Delivered, with cafe defaults Dine-In and T0) and in patient totals.
- No void, refund, partial payment or tax in v1; a wrong bill is fixed by hand in the database.
- Receipts read live product names; renaming a product changes reprinted receipts.
- The Pending Payments alert links to Transactions, not Billing.
- Mark paid has no paid-at time or audit trail; revenue is booked at bill creation time.
- Appointment reminders fire only while the browser tab is open; web push when the tab is closed is out of scope.
- Doctor print profiles apply to clinic receipts only; prescription print still uses the shared print settings margins (not yet per-doctor).
- Spent is hidden only for clinical tenants (those with the consultation tab); the computed field is still in the data layer.

## 7. Verification status
- Code review run for Phase 3; 9 review findings fixed, the rest recorded in `03-REVIEW.md`.
- Type check clean apart from a missing `web-push` package on the dev machine (affects only the push route locally).
- Live database checks (tenant isolation, function privileges, tab access) done read-only or with rolled-back probes.
- The write guards from migration D passed a rolled-back probe as the doctor on 2026-11-11: Create bill and Mark paid work; direct edit, insert, delete, flip-back and item edits are blocked; a second bill for the same consult is refused; a cafe insert works. Not probed: updating an existing cafe bill and re-tagging a cafe bill as Clinic (no cafe bills in the test tenants), so do one cafe order and status change in the browser.
- Browser UAT for Phases 1, 2 and 3 is pending; phase status stays open until it passes.
