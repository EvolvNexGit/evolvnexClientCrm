# Feature Research

**Domain:** Multi-tenant SMB CRM + Conversations/inbox (WhatsApp first)
**Researched:** 2026-08-20
**Confidence:** HIGH for v1 cut (from PROJECT.md); MEDIUM for competitor table-stakes (industry pattern, not user interviews)

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Conversation list | Inbox is a list of threads, not a log dump | MEDIUM | Filter by tenant; unread first |
| Thread view (chronological messages) | Staff must read history | MEDIUM | Provider-agnostic message rows |
| Send reply in-thread | Inbox without send is a monitor | MEDIUM | Server-side Cloud API; 24h customer-care window |
| Link thread to CRM contact | “Growth OS” value is context | MEDIUM | Match `wa_id` / phone to `customers` |
| Tenant isolation | Multi-tenant SaaS | HIGH if RLS wrong | Never trust client `client_id` |
| Inbound persist from webhook | Otherwise inbox is empty | MEDIUM | Idempotent on WhatsApp message id |
| Delivery/read or at least sent/failed status | Staff need to know if it left | MEDIUM | Status webhooks currently 401 in CONCERNS.md |
| Keep existing CRM tabs | User: do not rebuild CRM | LOW–MEDIUM | Regression, not new product |
| Credential stay server-side | Operators connect WABA without leaking tokens | LOW (exists) | Credentials route already present |
| Empty / loading / error states | Constitution definition of done | LOW | Mobile + dark theme |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| CRM context pane (appointments, last bill) beside thread | OS vs generic Wati/Interakt | MEDIUM | Read existing query modules; don’t copy WhatsApp into CRM tables |
| Provider-independent thread model | Instagram/SMS later without rewrite | MEDIUM | Upfront schema cost, Constitution-required |
| Open conversation from contact record | Operator loop | LOW | Deep link `/dashboard/conversations?contact=` |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Broadcast campaigns / segments | “Marketing WhatsApp” | Template approval, opt-in, spam, not v1 | Phase after inbox |
| Chatbots / drag-drop automation | “AI inbox” | Constitution; failure/retry surface | Step-based automation later |
| Multi-agent assignment, SLAs, canned libraries as a product | Shared inbox maturity | Scope; needs roles | Single-operator thread first; assignment later |
| Email/SMS/Instagram in v1 | Omni-channel pitch | Each provider is a full webhook+auth project | WhatsApp only |
| Client-side Graph calls | Faster prototype | Tokens leak | Server send |
| Realtime on every CRM table | “Live OS” | Load + complexity | Realtime on messages/conversations only |

## Feature Dependencies

```
Webhook verify + tenant bind
    └──requires──> Conversation persist
                       └──requires──> Thread list + thread view
                                          └──requires──> Send reply (server)
Contact match ──enhances──> Thread view
Status webhooks ──enhances──> Send reply
CRM tabs (existing) ──conflicts──> Rebuilding CRM
Campaigns ──conflicts──> Inbox-only v1 (defer)
```

### Dependency Notes

- **Send requires persist + credentials:** cannot reply without mapped `phone_number_id` and boxed token.
- **Contact match requires stable phone normalization:** E.164 vs local formats; India-heavy SMBs.
- **Status webhooks require signature path that works without `messages[]`:** known bug.

## MVP Definition

### Launch With (v1)

- [ ] Tenant-safe conversation list + thread
- [ ] Inbound WhatsApp → message rows (idempotent)
- [ ] Outbound reply via existing Cloud API helper
- [ ] Contact link when phone matches
- [ ] Existing CRM tabs still work
- [ ] Webhook HMAC + per-tenant processing (fix OR-across-tenants)
- [ ] Status callbacks do not 401 the whole pipeline

### Add After Validation (v1.x)

- [ ] Media (image/document) — after text loop works
- [ ] Unread badges / mute
- [ ] Open thread from contacts tab
- [ ] Template send when outside 24h window (compliance UX)

### Future Consideration (v2+)

- [ ] Campaigns, segments, template gallery as a product
- [ ] Automation (step-based)
- [ ] POS/LEADS/HRM/AirMenu completeness
- [ ] Additional providers

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Thread list + view | HIGH | MEDIUM | P1 |
| Inbound webhook persist | HIGH | MEDIUM | P1 |
| Server send | HIGH | MEDIUM | P1 |
| Webhook tenant/HMAC fix | HIGH | MEDIUM | P1 |
| Status webhooks | HIGH | MEDIUM | P1 |
| Contact linking | HIGH | MEDIUM | P1 |
| Keep CRM tabs | HIGH | LOW | P1 |
| CRM context pane | MEDIUM | MEDIUM | P2 |
| Media | MEDIUM | HIGH | P2 |
| Campaigns | HIGH later | HIGH | P3 |

## Competitor Feature Analysis

| Feature | Interakt / Wati-class | HubSpot WhatsApp | Our Approach |
|---------|----------------------|------------------|--------------|
| Shared inbox | Full (assign, labels) | Inbox + CRM | Threads + CRM link first; assignment later |
| Campaigns | Core SKU | Marketing hub | Explicitly out of v1 |
| CRM objects | Light | Heavy | Keep existing tabs |
| Multi-channel | Often extra | Extra | WhatsApp provider only |

## Sources

- `PROJECT.md` v1 decisions — HIGH
- `.planning/codebase/CONCERNS.md` webhook bugs — HIGH
- SMB WhatsApp inbox category (Interakt, Wati, respond.io, Tidio) — MEDIUM
- Meta 24-hour customer care window + template messages — HIGH (platform rule)

---
*Feature research for: EvolvNex CRM + WhatsApp inbox*
*Researched: 2026-08-20*
