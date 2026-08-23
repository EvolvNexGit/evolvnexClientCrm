# Phase 1: Conversation model - Context

**Gathered:** 2026-08-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Add an in-git, RLS-scoped **conversation thread model** that WhatsApp (and later providers) can attach to. This phase delivers schema + policies + types only — not webhook fixes, send routes, inbox UI, or customer matching (those are Phases 2–5).

</domain>

<decisions>
## Implementation Decisions

### Table strategy (evolve vs parallel)
- **D-01:** Add `communication_conversations` and **evolve** existing `communication_message_events` with a nullable `conversation_id` FK — do not introduce a second parallel message table. — **Reversibility:** costly — webhook and query code already write `communication_message_events`; a second table duplicates ingest paths.
- **D-02:** Keep `communication_provider_accounts` as the provider-side anchor (`phone_number_id`, WABA metadata); conversations reference `provider` + optional link to provider account, not WhatsApp fields on `customers`. — **Reversibility:** one-way — adding WhatsApp columns to `customers` would fight the Constitution.

### Thread identity
- **D-03:** One conversation row per tenant per provider channel per peer: unique on `(client_id, provider, provider_account_id, peer_phone)` where `peer_phone` is normalized E.164 (WhatsApp `wa_id` / customer phone). — **Reversibility:** costly — changing the uniqueness key after ingest starts requires migration and re-grouping.
- **D-04:** Store `last_message_at`, optional `last_message_preview`, and `last_message_direction` on the conversation for list sorting (denormalized; updated by ingest/send in later phases). — **Reversibility:** reversible — list UX helper columns.

### Customer link
- **D-05:** **No `customer_id` on conversations in Phase 1.** Contact matching is Phase 5 (`CONT-01`). Schema stays peer-phone-centric until then. — **Reversibility:** reversible — nullable FK can be added in Phase 5 without breaking Phase 1.

### Existing `communication_message_events` rows
- **D-06:** **Keep** existing log rows; leave `conversation_id` null for historical rows. Phase 2 ingest assigns new inbound/outbound rows to conversations. Optional one-time backfill is **deferred** (not Phase 1 scope). — **Reversibility:** reversible — backfill script can run later.

### RLS and access
- **D-07:** Reuse `crm_can_access_client(client_id)` for `communication_conversations` SELECT/ALL policies, matching existing communication tables. — **Reversibility:** reversible — same pattern as `20260814_whatsapp_auto_replies.sql`.
- **D-08:** Authenticated users may SELECT conversations and message events for their tenant; INSERT/UPDATE on messages from the client remains read-only for inbox v1 (writes via server routes in Phase 3). Extend grants consistently with existing `communication_message_events` (select-only today). — **Reversibility:** costly — widening client INSERT before send route exists risks bypassing server boundary.

### Claude's Discretion
- Exact column names (`peer_phone` vs `external_participant_id`), preview length, and whether `provider_account_id` is nullable when provider is known but account row not yet synced — planner may align with existing `communication_*` naming in migrations and `communication-queries.ts`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Engineering law
- `AGENTS.md.docx` — AI engineering instructions (Constitution summary, Communication nav, layers)
- `EvolvNex Engineering Constitution.docx` — Multi-tenancy, RLS, provider independence, change discipline
- `AGENTS.md` — GSD-generated project guide (stack, conventions, workflow)

### Planning
- `.planning/PROJECT.md` — v1 scope, core value, out of scope
- `.planning/REQUIREMENTS.md` — MODEL-01, TENANT-01, CRED-01
- `.planning/ROADMAP.md` — Phase 1 goal and success criteria
- `.planning/research/SUMMARY.md` — Inbox architecture implications

### Schema (in-repo)
- `supabase/migrations/20260814_whatsapp_auto_replies.sql` — `communication_provider_accounts`, `communication_message_events`, `communication_auto_replies`, RLS helper
- `supabase/migrations/20260817_customer_status_whatsapp_credentials.sql` — credentials, unique `phone_number_id`, idempotent `provider_message_id` index

### Code
- `src/lib/communication-queries.ts` — existing communication CRUD patterns
- `src/lib/providers/whatsapp/webhook.ts` — current inbound insert to `communication_message_events`
- `.planning/codebase/CONCERNS.md` — webhook tenant/signature gaps (Phase 2, not this phase)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `communication_message_events` table + unique `(provider, provider_message_id)` — extend with `conversation_id`
- `communication_provider_accounts` + unique `phone_number_id` per tenant — conversation threads bind to WABA line
- `crm_can_access_client()` — RLS pattern already applied to communication tables
- `src/lib/communication-queries.ts` — query module pattern for new conversation fetches

### Established Patterns
- Migrations under `supabase/migrations/YYYYMMDD_snake_description.sql`
- Domain types in `src/lib/communication-types.ts` (extend, do not fork WhatsApp types into CRM)
- Snake_case columns on `*Record` types; camelCase on payloads at query boundary

### Integration Points
- Phase 2 webhook will upsert conversation then insert message with `conversation_id`
- Phase 4 inbox UI will list `communication_conversations` ordered by `last_message_at`
- Phase 5 adds `customer_id` FK and population logic

</code_context>

<specifics>
## Specific Ideas

User confirmed completing onboarding and Phase 1 discuss without selecting gray-area options. Defaults above follow Constitution + existing migrations + roadmap phase boundaries (contact link in Phase 5).

</specifics>

<deferred>
## Deferred Ideas

- Backfill script to group historical `communication_message_events` into conversations — Phase 2 or 5
- `customer_id` on conversations — Phase 5
- Media columns / template message types — v1.x or v2
- Separate `communication_messages` table — rejected in favor of evolving message_events

</deferred>

---

*Phase: 01-conversation-model*
*Context gathered: 2026-08-23*
