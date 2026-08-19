# Roadmap: EvolvNex Business Growth OS

## Overview

This milestone keeps the existing CRM tabs and ships a tenant-safe WhatsApp Conversations inbox on a provider-independent data model. Later OS modules (campaigns, POS, LEADS, HRM, AirMenu) stay off this roadmap.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Conversation model** - Generic threads/messages + RLS in git
- [ ] **Phase 2: Tenant-safe ingest** - HMAC, idempotent inbound, status callbacks
- [ ] **Phase 3: Server send** - JWT-scoped reply, Graph errors, 24h window
- [ ] **Phase 4: Inbox UI** - List, thread, states, mobile, live updates
- [ ] **Phase 5: CRM loop** - Contact match + existing tabs still work
- [ ] **Phase 6: Communication nav** - Conversations reachable; campaigns not implied shipped

## Phase Details

### Phase 1: Conversation model
**Goal:** Persist provider-independent conversations and messages with tenant RLS, without putting WhatsApp into the customer row model.
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** MODEL-01, TENANT-01, CRED-01
**Success Criteria** (what must be TRUE):
  1. New conversation/message tables exist in-repo with RLS enabled for tenant isolation
  2. WhatsApp identifiers are stored in provider-side records, not as the CRM customer primary key model
  3. Service-role and provider secrets are still absent from client bundles
**Plans:** TBD
**UI hint**: no

Plans:
- [ ] 01-01: TBD during `/gsd-plan-phase 1`

### Phase 2: Tenant-safe ingest
**Goal:** Meta can deliver messages and statuses to the correct tenant only, without duplicates.
**Mode:** mvp
**Depends on:** Phase 1
**Requirements:** WHHK-01, WHHK-02, WHHK-03, WHHK-04
**Success Criteria** (what must be TRUE):
  1. A payload signed for tenant A’s number does not persist messages for another number
  2. Retrying the same inbound WhatsApp message id does not duplicate the thread UI row
  3. Status callbacks for this number return success to Meta and update outbound state
  4. Tenant is resolved from WABA `phone_number_id`, not from a client-supplied id
**Plans:** TBD
**UI hint**: no

Plans:
- [ ] 02-01: TBD during `/gsd-plan-phase 2`

### Phase 3: Server send
**Goal:** Staff can reply from the server with honest success/failure and a closed customer-care window.
**Mode:** mvp
**Depends on:** Phase 2
**Requirements:** SEND-01, SEND-02, SEND-03
**Success Criteria** (what must be TRUE):
  1. A reply leaves through a Route Handler; the Cloud API token is not visible in the browser
  2. A Graph rejection shows a safe error and is not treated as delivered
  3. Outside the 24-hour window, free-form session send cannot appear successful
**Plans:** TBD
**UI hint**: no

Plans:
- [ ] 03-01: TBD during `/gsd-plan-phase 3`

### Phase 4: Inbox UI
**Goal:** Staff can use Conversations as a real inbox (list, thread, empty/error, mobile, live messages).
**Mode:** mvp
**Depends on:** Phase 3
**Requirements:** INBX-01, INBX-02, INBX-03, INBX-04
**Success Criteria** (what must be TRUE):
  1. Staff see this tenant’s thread list after sign-in
  2. Opening a thread shows chronological history
  3. Empty, loading, and error states work on a mobile viewport
  4. A newly stored message appears without a full page reload while the thread is open
**Plans:** TBD
**UI hint**: yes

Plans:
- [ ] 04-01: TBD during `/gsd-plan-phase 4`

### Phase 5: CRM loop
**Goal:** Inbox sits on CRM people; current CRM tabs do not regress.
**Mode:** mvp
**Depends on:** Phase 4
**Requirements:** CONT-01, CRM-01
**Success Criteria** (what must be TRUE):
  1. An inbound number that matches a tenant customer (normalized) links the thread to that contact
  2. Contacts, appointments, consultations, and promotions still work for the signed-in tenant
**Plans:** TBD
**UI hint**: yes

Plans:
- [ ] 05-01: TBD during `/gsd-plan-phase 5`

### Phase 6: Communication nav
**Goal:** Conversations is reachable in Communication navigation without advertising unbuilt campaign/automation product.
**Mode:** mvp
**Depends on:** Phase 5
**Requirements:** NAV-01
**Success Criteria** (what must be TRUE):
  1. Staff can navigate to Conversations from the product chrome
  2. Campaigns / Segments / Automation are not presented as shipped features
**Plans:** TBD
**UI hint**: yes

Plans:
- [ ] 06-01: TBD during `/gsd-plan-phase 6`

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Conversation model | 0/1 | Not started | - |
| 2. Tenant-safe ingest | 0/1 | Not started | - |
| 3. Server send | 0/1 | Not started | - |
| 4. Inbox UI | 0/1 | Not started | - |
| 5. CRM loop | 0/1 | Not started | - |
| 6. Communication nav | 0/1 | Not started | - |
