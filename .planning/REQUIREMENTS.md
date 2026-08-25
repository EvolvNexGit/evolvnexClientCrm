# Requirements: EvolvNex Business Growth OS

**Defined:** 2026-08-20
**Core Value:** A tenant's people and conversations live in one isolated system — CRM context plus a working inbox — without mixing tenants, leaking secrets, or baking WhatsApp into the rest of the product.

## v1 Requirements

Requirements for the inbox milestone. Existing CRM/WhatsApp plumbing is treated as a baseline to preserve, not a rebuild.

### Inbox

- [ ] **INBX-01**: Authenticated staff can open a Conversations view listing this tenant’s threads (preview, time, unread or equivalent signal)
- [ ] **INBX-02**: Staff can open a thread and read messages in chronological order
- [ ] **INBX-03**: Conversations UI shows loading, empty, and error states and remains usable on a mobile viewport
- [ ] **INBX-04**: While a thread is open, newly persisted messages for that tenant appear without a full page reload (Realtime or equivalent)

### Webhook ingest

- [ ] **WHHK-01**: Inbound WhatsApp webhooks are authenticated with `X-Hub-Signature-256` over the raw body using the app secret for that payload’s `phone_number_id` only
- [ ] **WHHK-02**: A verified inbound customer message is stored once; Meta retries with the same provider message id do not create duplicate visible messages
- [ ] **WHHK-03**: Delivery/status callbacks for this tenant’s number return success to Meta and update the corresponding outbound message state (at least sent vs failed)
- [ ] **WHHK-04**: Webhook processing never authorizes a tenant from a client-supplied tenant id; mapping is WABA `phone_number_id` → provider account → `client_id`

### Send

- [ ] **SEND-01**: Staff can send a reply in an open thread; the Cloud API token never ships to the browser
- [ ] **SEND-02**: If Graph rejects the send, staff see a safe failure (no stack traces or tokens); the message is not shown as successfully delivered
- [ ] **SEND-03**: If the WhatsApp customer-care window is closed, staff cannot send a free-form session message as if it succeeded (composer blocked or explicit “template required” — templates as a product are v2)

### Model and tenancy

- [ ] **MODEL-01**: Threads and messages use provider-independent records; WhatsApp ids live in the provider layer, not as the CRM customer primary model
- [ ] **TENANT-01**: New conversation/message tables have RLS so tenant A cannot read tenant B’s inbox
- [ ] **CRED-01**: Provider secrets and the service-role key remain server-only (credentials route and webhook stay that way)

### CRM

- [ ] **CONT-01**: When an inbound WhatsApp number matches a tenant customer (normalized phone), the thread is linked to that contact
- [ ] **CRM-01**: Existing contacts, appointments, consultations, and promotions tabs still load and mutate for the signed-in tenant after inbox work

### Navigation

- [ ] **NAV-01**: Staff can reach Conversations from Communication-style navigation without implying Campaigns, Segments, or Automation are shipped

## v2 Requirements

Deferred to later OS milestones. Tracked, not in this roadmap.

### Communication product

- **CAMP-01**: Tenant can run WhatsApp campaigns / broadcasts
- **SEGM-01**: Tenant can target segments of contacts
- **AUTO-01**: Step-based automation (not drag-and-drop unless separately approved)
- **TMPL-01**: Template gallery as a product (beyond window-closed UX)
- **MEDA-01**: Image/document/voice as a first-class inbox surface
- **ASGN-01**: Multi-agent assignment and SLAs
- **PROV-01**: Instagram, email, SMS, or Telegram as additional providers

### Other OS modules

- **POS-01**: POS as a first-class ship slice (partial exists)
- **LEAD-01**: LEADS module complete
- **HRM-01**: HRM module complete
- **AIR-01**: AirMenu / QR ordering (separate from Communication)
- **PAY-01**: Payment provider completion (Razorpay etc.)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Drag-and-drop automation builder | Constitution unless explicitly approved |
| Disable RLS / expose service role / trust client tenant id | Security non-negotiable |
| Replace Next.js, React, TypeScript, or Supabase | Existing OS stack |
| Rebuild CRM tabs for v1 | User decision: keep current tabs |
| Mix ordering or payments into Communication services | Constitution module boundaries |

## User Stories & Acceptance Criteria

- Staff signs in, opens Conversations, sees only their tenant’s threads, opens one, reads history, replies; CRM contact appears when the phone matches; other CRM tabs still work.
- A forged or mixed-WABA webhook does not write another tenant’s messages.
- Duplicate Meta deliveries do not duplicate the thread.
- Failed Graph sends are visible as failures.

## Traceability

Which phases cover which requirements. Filled during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MODEL-01 | Phase 1 | Pending |
| TENANT-01 | Phase 1 | Pending |
| CRED-01 | Phase 1 | Pending |
| WHHK-01 | Phase 2 | Pending |
| WHHK-02 | Phase 2 | Pending |
| WHHK-03 | Phase 2 | Pending |
| WHHK-04 | Phase 2 | Pending |
| SEND-01 | Phase 3 | Pending |
| SEND-02 | Phase 3 | Pending |
| SEND-03 | Phase 3 | Pending |
| INBX-01 | Phase 4 | Pending |
| INBX-02 | Phase 4 | Pending |
| INBX-03 | Phase 4 | Pending |
| INBX-04 | Phase 4 | Pending |
| CONT-01 | Phase 5 | Pending |
| CRM-01 | Phase 5 | Pending |
| NAV-01 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-08-20*
*Last updated: 2026-08-20 after roadmap*
