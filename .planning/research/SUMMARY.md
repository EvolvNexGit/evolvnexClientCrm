# Project Research Summary

**Project:** EvolvNex Business Growth OS
**Domain:** Multi-tenant SMB CRM + provider-independent WhatsApp inbox (subsequent milestone)
**Researched:** 2026-08-20
**Confidence:** HIGH for constraints and existing stack; MEDIUM for Graph API pin (Meta versions move)

## Executive Summary

This repo already is a Next.js 15 + React 19 + Supabase CRM with WhatsApp Cloud API send, webhook, and boxed credentials. v1 does **not** replace that stack. It adds a **Conversations/inbox** on generic conversation/message tables, with WhatsApp remaining a provider adapter.

Experts build this as: HMAC on raw webhook body, tenant from `phone_number_id` (never client-supplied id), unique provider message ids, server-side send, 24-hour customer-care window, RLS on every new table. The main risks are already in this codebase: cross-tenant HMAC OR-logic, status webhooks 401, schema/RLS not fully in git, and WhatsApp leaking into generic Communication.

## Key Findings

### Recommended Stack

Keep Next, React, TypeScript, Tailwind, `@supabase/supabase-js`, native `fetch` to Graph, Node `crypto`. Add **no** WhatsApp SDK, Redis, or workflow builder for v1. Pin `WHATSAPP_API_VERSION`. Generate Supabase types when conversation tables land. Realtime only on conversation/message rows.

**Core technologies:**
- Next.js 15 App Router — dashboard tab + Route Handlers for webhook/send
- Supabase Postgres + Auth + RLS + Realtime — tenant data
- WhatsApp Cloud API (pinned Graph version) — first provider only

### Expected Features

**Must have (table stakes):**
- Conversation list + chronological thread
- Inbound persist (idempotent) + outbound reply via server
- Tenant isolation / RLS; secrets never in the client
- Status handling so send is not “fire and forget”
- Link thread to CRM contact when phone matches
- Existing CRM tabs keep working

**Should have (competitive):**
- CRM context beside the thread
- Open conversation from a contact
- Provider-independent thread ids (required by Constitution even if only WhatsApp ships)

**Defer (v2+):**
- Campaigns, segments, automation, extra providers, shared-inbox assignment, media-as-product, AirMenu/POS/LEADS/HRM completeness

### Architecture Approach

UI (Conversations tab) → send API (Bearer → `request-auth`) → communication service → WhatsApp provider **or** generic repository. Webhook: verify → map WABA number to `client_id` → upsert conversation → insert message. Do not put Graph tokens or service role in the browser.

**Major components:**
1. Generic `conversations` / `messages` — provider-agnostic inbox model
2. WhatsApp provider + existing credential box — Graph send/receive
3. Conversations dashboard tab — list/thread/empty/error/mobile

### Critical Pitfalls

1. **Cross-tenant HMAC** — verify with the secret for **that** `phone_number_id` only
2. **Status payloads 401** — handle `statuses` without assuming `messages[]`
3. **Non-idempotent ingest** — unique `(provider, wamid)`
4. **24h window ignored** — disable free-form send or require templates
5. **WhatsApp columns on `customers`** — breaks provider independence

## Implications for Roadmap

### Phase 1: Conversation model + RLS
**Rationale:** Cannot build a truthful inbox on WhatsApp-specific CRM columns; Constitution requires migrations + RLS in git.
**Delivers:** Generic tables, policies, types
**Addresses:** MODEL, TENANT schema
**Avoids:** WhatsApp-on-customers

### Phase 2: Tenant-safe ingest
**Rationale:** Inbox is empty or dangerous without webhook correctness.
**Delivers:** HMAC, idempotent inbound, status callbacks
**Avoids:** Cross-tenant ingest, 401 retries

### Phase 3: Server send + session window
**Rationale:** Reply is the operator loop; secrets stay server-side.
**Delivers:** Send route, Graph errors, 24h UX
**Uses:** Existing `cloud-api.ts` + `request-auth`

### Phase 4: Inbox UI
**Rationale:** Vertical slice users can see
**Delivers:** List, thread, loading/empty/error, mobile, optional Realtime
**Implements:** Conversations tab

### Phase 5: CRM link + keep existing tabs
**Rationale:** Core value is people + conversations together
**Delivers:** Phone match to `customers`; regression on contacts/appointments/consultations/promotions
**Avoids:** CRM rebuild

### Phase 6: Nav + constitution polish
**Rationale:** AGENTS.md Communication nav without shipping campaigns
**Delivers:** Conversations entry; no campaign/automation product

### Phase Ordering Rationale

- Schema before UI so RLS is reviewable
- Ingest before send so replies attach to real threads
- UI after persist so the tab is not a mock
- CRM link after threads exist
- Nav last so routing does not advertise unbuilt Campaigns as done

### Research Flags

- **Phase 2:** Meta webhook variants (messages vs statuses) — read current Cloud API docs during plan-phase
- **Phase 3:** Exact Graph error codes for window / rate limit

Phases with standard patterns:
- **Phase 4:** Dashboard tab + hooks matching existing CRM tabs
- **Phase 5:** Reuse `billing-queries` / customer phone fields

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Already in repo |
| Features | HIGH | Locked in PROJECT.md questioning |
| Architecture | HIGH | Extends current layers |
| Pitfalls | HIGH | Several bugs already mapped |

**Overall confidence:** HIGH for this milestone

### Gaps to Address

- Full public schema/RLS dump still absent — inbox migrations must be complete even if core CRM schema stays external
- Numbered architecture docs live outside the repo — stop if a change needs them
- Graph version default is `v21.0`; latest Meta line may be newer — bump only with changelog

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md`, `.planning/codebase/*`, Constitution / AGENTS.md
- https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/

### Secondary (MEDIUM confidence)
- SMB inbox category (Wati/Interakt-class) for table stakes vs campaigns

### Tertiary (LOW confidence)
- Exact current Graph latest version — verify at plan-phase

---
*Research completed: 2026-08-20*
*Ready for roadmap: yes*
