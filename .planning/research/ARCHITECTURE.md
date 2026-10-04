# Architecture Research

**Domain:** Conversations/inbox on existing EvolvNex Next.js + Supabase OS
**Researched:** 2026-08-20
**Confidence:** HIGH (extends current layers; Constitution-aligned)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ UI  dashboard tab: Conversations (list + thread + CRM side)     │
│     src/components/dashboard/tabs/  + hooks                     │
├─────────────────────────────────────────────────────────────────┤
│ API  POST send-message (Bearer → request-auth → client_id)      │
│      GET/POST webhook (Meta verify + HMAC, no user session)     │
├─────────────────────────────────────────────────────────────────┤
│ Validation / service                                            │
│   conversation-service  message-service  tenant from JWT/WABA   │
├─────────────────────────────────────────────────────────────────┤
│ Provider     │ Repository                                       │
│ whatsapp/    │ conversations + messages tables (generic)        │
│ cloud-api    │ communication_provider_accounts + credentials    │
│ webhook map  │ customers (phone match)                          │
├─────────────────────────────────────────────────────────────────┤
│ Postgres + RLS     Auth (user)     Realtime (messages)          │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Conversations tab | List/thread UX | New tab module; reuse dashboard shell |
| `request-auth` | User → `client_id` for send | Existing `src/lib/server/request-auth.ts` |
| WhatsApp webhook route | Raw body, HMAC, 200 | Fix tenant bind in `webhook.ts` |
| WhatsApp cloud-api | Outbound Graph calls | Existing `cloud-api.ts` |
| Conversation repository | CRUD threads/messages | New `*-queries` **or** server-only repo if RLS + service layer required |
| Contact matcher | `wa_id` → customer | Normalize phone; never take tenant from body |

## Recommended Project Structure

```
src/
├── app/api/communication/
│   ├── whatsapp/webhook/route.ts      # existing; harden
│   ├── whatsapp/credentials/route.ts  # existing
│   └── messages/send/route.ts         # new: tenant from JWT, provider dispatch
├── lib/providers/whatsapp/            # WhatsApp-only
├── lib/communication/                 # generic thread/message types + service
├── hooks/use-conversations.ts
├── hooks/use-messages.ts
└── components/dashboard/tabs/conversations-tab.tsx
```

### Structure Rationale

- **`providers/whatsapp`:** Constitution — provider-specific behavior stays here.
- **`lib/communication`:** Generic models so Instagram later does not fork the UI.
- **Send as Route Handler:** Tokens never in the browser (unlike current CRM query-from-client pattern). Inbox send is a sensitive operation; Constitution prefers server boundary.

## Architectural Patterns

### Pattern 1: Provider adapter

**What:** Inbox UI talks to conversation ids; WhatsApp maps `wamid` / `phone_number_id`.
**When to use:** Always for Communication.
**Trade-offs:** Extra join table; avoids WhatsApp columns on `customers`.

### Pattern 2: Idempotent webhook

**What:** Unique `(provider, provider_message_id)` insert; duplicate Meta retries = no-op 200.
**When to use:** All inbound.
**Trade-offs:** Need unique index; first-write-wins on races.

### Pattern 3: Realtime fan-in

**What:** Subscribe to `messages` where `client_id = session tenant` (RLS).
**When to use:** Open thread / list.
**Trade-offs:** Don’t subscribe to whole `public` schema.

## Data Flow

### Request Flow

```
Staff types reply
  → conversations UI
  → POST /api/communication/messages/send  (Bearer)
  → request-auth client_id
  → load credentials for that client only
  → whatsapp cloud-api fetch
  → insert message row (pending → sent/failed)
  → Realtime updates other tabs
```

### Inbound Flow

```
Meta POST webhook
  → verify X-Hub-Signature-256 on raw body (app secret for THAT phone_number_id)
  → resolve tenant from phone_number_id (single tenant, not OR-any)
  → upsert conversation + insert message if wamid new
  → optional auto-reply (existing) without breaking inbox persist
  → 200
```

### Key Data Flows

1. **Tenant bind:** JWT for user actions; WABA `phone_number_id` for webhooks — never the other way around.
2. **CRM join:** Read-only from inbox to `customers` / appointments by `client_id` + phone.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k users | Inline webhook + Realtime; current monolith |
| 1k–100k | Queue media download; paginate threads; indexes `(client_id, last_message_at)` |
| 100k+ | Dedicated ingest worker; partition messages |

### Scaling Priorities

1. **First bottleneck:** Unbounded message select per thread — paginate.
2. **Second bottleneck:** Webhook timeout on media — async after 200.

## Anti-Patterns

### Anti-Pattern 1: Trust `client_id` in webhook JSON

**What people do:** Pass tenant in querystring or payload field.
**Why it's wrong:** Forgery / cross-tenant write.
**Do this instead:** Map `phone_number_id` → `communication_provider_accounts.client_id`.

### Anti-Pattern 2: HMAC-valid if *any* tenant secret matches, then process *all* messages

**What people do:** Current CONCERNS.md bug.
**Why it's wrong:** Cross-tenant ingest.
**Do this instead:** Verify with the secret of the `phone_number_id` in **that** change; drop foreign numbers.

### Anti-Pattern 3: Inbox queries only from the browser with service-like privileges

**What people do:** Widen RLS or use service role in client.
**Why it's wrong:** Constitution.
**Do this instead:** Anon + RLS for reads if policies are correct; writes that need secrets stay on server.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| WhatsApp Cloud API | Server `fetch`, pinned Graph version | 24h window; templates later |
| Meta webhooks | HMAC + verify token GET | Status vs messages payloads differ |
| Supabase Auth | Bearer on send route | Existing |
| Supabase Realtime | `postgres_changes` | Filter by tenant |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Inbox UI ↔ CRM queries | Direct read of existing query modules | No WhatsApp types in billing |
| Webhook ↔ auto-replies | Same ingest pipeline | Don’t skip persist when auto-reply fires |
| POS/AirMenu ↔ Communication | None in v1 | Constitution: keep separate |

## Sources

- `.planning/codebase/ARCHITECTURE.md` — HIGH
- Constitution layering + provider independence — HIGH
- Meta webhook component docs — HIGH

---
*Architecture research for: EvolvNex inbox*
*Researched: 2026-08-20*
