# Requirements: EvolvNex Business Growth OS

**Defined:** 2026-11-10
**Core Value:** A tenant's people and records live in one isolated system — each client gets only the tabs and workflows it needs — without mixing tenants or leaking secrets.

## v1 Requirements

Requirements for the doctor/clinic milestone. Existing CRM, WhatsApp and POS code is a baseline to preserve, not a rebuild.

### Appointments

- [ ] **APPT-01**: Staff can view appointments on a day and week calendar with staff columns, and create or edit from an empty slot or a card; the list view remains
- [ ] **APPT-02**: Booking or moving an appointment onto an overlapping slot for the same staff shows a conflict warning
- [x] **APPT-03**: Appointment create, update and status changes live in `appointment-queries.ts`, scoped by `client_id`

### Patients

- [x] **PAT-01**: A patient (customer row) stores gender, blood group, allergies and chronic conditions as nullable fields
- [ ] **PAT-02**: Staff can open a patient profile with Overview, Visits and Files; allergies are prominent

### Consultation and print

- [ ] **CONS-01**: A consultation stores vitals (BP, pulse, temperature, weight, SpO2)
- [ ] **CONS-02**: A pinned patient strip (name, age, allergies) stays visible on the consult form
- [ ] **CONS-03**: Attachments upload to a private, client-scoped Storage bucket and open through signed URLs
- [ ] **PRNT-01**: A client saves letterhead margins (header, footer, left, right in mm) once
- [ ] **PRNT-02**: A completed consult prints body-only (medications, advice, follow-up) using those margins

### Doctor billing

- [ ] **BILL-01**: A `doctor-billing` tab (DB key 015) is assignable per client; the doctor client has it instead of Billing
- [ ] **BILL-02**: `bills` records payment mode, paid/unpaid status and links to a consultation and appointment; order source `Clinic` exists
- [ ] **BILL-03**: A `SECURITY INVOKER` function creates a clinic bill and verifies customer, products and consultation belong to the caller's client
- [ ] **BILL-04**: A receipt prints through the same print mechanism; an unpaid list is available
- [ ] **BILL-05**: Clinic bills are excluded from cafe summary analytics, active-order lists and order alerts

### Security

- [x] **SEC-01**: The live RLS hardening (products, counters, clients, appointments, bill_items, tasks, function grants) exists as a migration in `supabase/migrations/`

## v2 Requirements

Deferred. Tracked, not in this roadmap.

### Communication (paused 2026-11-10)

- **INBX-01**: Conversations inbox (threads, messages, live updates)
- **WHHK-01**: Hardened, tenant-safe, idempotent WhatsApp webhook ingest
- **SEND-01**: Server-side replies with 24-hour window handling
- **REMD-01**: Appointment and follow-up reminders over WhatsApp
- **CAMP-01**: Campaigns / broadcasts
- **SEGM-01**: Segments
- **AUTO-01**: Step-based automation
- **PROV-01**: Additional providers

### Clinical depth

- **CLIN-01**: Printable e-prescription with drug database and interaction checks
- **CLIN-02**: Audit log and consent tracking for record access
- **CLIN-03**: Online booking link, patient portal, telemedicine
- **CLIN-04**: GST invoices, insurance claims, treatment packages

### Other OS modules

- **POS-01**: POS as a first-class slice (partial exists)
- **LEAD-01**: LEADS module complete
- **HRM-01**: HRM module complete
- **AIR-01**: AirMenu / QR ordering
- **PAY-01**: Payment provider completion

## Out of Scope

| Feature | Reason |
|---------|--------|
| Drag-and-drop automation builder | Constitution unless explicitly approved |
| Disable RLS / expose service role / trust client tenant id | Security non-negotiable |
| Replace Next.js, React, TypeScript, or Supabase | Existing OS stack |
| Rebuild CRM tabs | Extend existing tabs and tables only |
| Separate invoice table | Reuse `bills` / `bill_items` / `products` |
| Modifying `create_order_with_inventory` | Cafe flow stays as is; clinic uses its own function |

## User Stories & Acceptance Criteria

- Receptionist opens the week calendar, books a patient into a free slot, gets warned on a clash, and moves the visit by clicking the card.
- Doctor opens a patient, sees allergies at the top, records vitals and notes, attaches a report privately, and prints the prescription on pre-printed letterhead.
- Receptionist bills the consult from the consult screen, takes payment, and prints a receipt; unpaid bills show in one list.
- Another tenant, or an anonymous caller, cannot read any of this data.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| APPT-01 | Phase 1 | Pending |
| APPT-02 | Phase 1 | Pending |
| APPT-03 | Phase 1 | Complete |
| PAT-01 | Phase 1 | Complete |
| PAT-02 | Phase 1 | Pending |
| SEC-01 | Phase 1 | Complete |
| CONS-01 | Phase 2 | Pending |
| CONS-02 | Phase 2 | Pending |
| CONS-03 | Phase 2 | Pending |
| PRNT-01 | Phase 2 | Pending |
| PRNT-02 | Phase 2 | Pending |
| BILL-01 | Phase 3 | Pending |
| BILL-02 | Phase 3 | Pending |
| BILL-03 | Phase 3 | Pending |
| BILL-04 | Phase 3 | Pending |
| BILL-05 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-11-10*
*Last updated: 2026-11-10 after roadmap restructure (WhatsApp inbox phases dropped)*
