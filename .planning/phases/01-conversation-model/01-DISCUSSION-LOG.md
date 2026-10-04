# Phase 1: Conversation model - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-23
**Phase:** 1-conversation model
**Areas discussed:** Table strategy, thread identity, customer link, historical message_events (defaults applied — user did not select gray areas interactively)

---

## Table strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Evolve message_events | Add `communication_conversations`; add `conversation_id` to existing `communication_message_events` | ✓ |
| Parallel messages table | New `communication_messages` alongside message_events | |
| Conversation-only | New tables but no link to existing log | |

**User's choice:** Proceed with completion — orchestrator applied Constitution-aligned default (smallest change, reuse webhook insert path).
**Notes:** Avoids duplicate ingest and matches existing migration investment.

---

## Thread identity

| Option | Description | Selected |
|--------|-------------|----------|
| Peer + WABA line | Unique per `(client_id, provider, provider_account_id, peer_phone E.164)` | ✓ |
| By customer only | One thread per CRM customer | |
| Global per phone | Ignore WABA / phone_number_id | |

**User's choice:** Default (peer + WABA line).
**Notes:** Matches multi-tenant WhatsApp Cloud API; unique index on `phone_number_id` already exists on provider accounts.

---

## Customer link

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to Phase 5 | No `customer_id` on conversation in Phase 1 | ✓ |
| Nullable now | Add FK now, populate in Phase 5 | |

**User's choice:** Default (defer per ROADMAP Phase 5 / CONT-01).

---

## Historical message_events

| Option | Description | Selected |
|--------|-------------|----------|
| Keep, null conversation_id | Existing rows unchanged; new rows get conversation_id from Phase 2 | ✓ |
| Backfill in Phase 1 | One-time migration to assign threads | |
| Ignore / truncate | Drop or hide old rows | |

**User's choice:** Default (keep; backfill deferred).

---

## Claude's Discretion

Column naming, preview field lengths, exact grant matrix for conversations table — planner discretion within D-01–D-08.

## Deferred Ideas

- Historical backfill script
- customer_id FK (Phase 5)
