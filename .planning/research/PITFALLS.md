# Pitfalls Research

**Domain:** Multi-tenant WhatsApp inbox on existing CRM SaaS
**Researched:** 2026-08-20
**Confidence:** HIGH (several pitfalls already present in this repo)

## Critical Pitfalls

### Pitfall 1: Cross-tenant webhook verification

**What goes wrong:**
HMAC succeeds against tenant A’s app secret; payload also contains another number’s messages; those rows are written.

**Why it happens:**
Convenience: “OR across all secrets” then process the whole body.

**How to avoid:**
Resolve `metadata.phone_number_id` first; verify with **that** account’s secret only; ignore/drop other numbers.

**Warning signs:**
One 200 with inserts into multiple `client_id`s from a single test payload.

**Phase to address:**
Inbox ingest / webhook hardening (before exposing thread UI as “done”).

---

### Pitfall 2: Status webhooks fail signature / 401

**What goes wrong:**
Delivery status payloads lack the fields the verifier collects; Meta retries; staff never see sent/failed.

**Why it happens:**
Verifier assumes `messages` + `phone_number_id` always present.

**How to avoid:**
Handle `statuses` changes; bind tenant from `metadata.phone_number_id` or status recipient mapping already stored.

**Warning signs:**
Meta webhook logs 401; `communication_message_events` empty for outbound.

**Phase to address:**
Same phase as ingest, or immediately after persist.

---

### Pitfall 3: 24-hour window ignored

**What goes wrong:**
Free-form reply fails with Graph error; UI looks “sent”.

**Why it happens:**
Cloud API allows session messages only inside customer-care window; templates required outside.

**How to avoid:**
Track `last_inbound_at`; disable composer or switch to “template required”; surface Graph error body (sanitized).

**Warning signs:**
`(#131047)` / window errors in logs; user thinks inbox is broken.

**Phase to address:**
Send path (v1). Full template product is v1.x/v2.

---

### Pitfall 4: Non-idempotent ingest

**What goes wrong:**
Meta retries duplicate messages; staff see triples; auto-reply fires twice (already a seed-duplicate issue).

**Why it happens:**
No unique `(provider, wamid)`.

**How to avoid:**
Unique index + insert ignore; auto-reply keyed the same way.

**Warning signs:**
Duplicate rows after ngrok reconnect tests.

**Phase to address:**
Schema for conversations/messages.

---

### Pitfall 5: Phone match misses the CRM contact

**What goes wrong:**
Thread exists but “unknown visitor”; operator loses the OS value.

**Why it happens:**
`91…` vs `+91` vs leading zero; multiple customers same phone.

**How to avoid:**
Normalize E.164 at write; document collision policy (newest / manual link).

**Warning signs:**
Inbox shows name from WhatsApp profile only.

**Phase to address:**
Contact linking, after persist.

---

### Pitfall 6: Schema/RLS not in git

**What goes wrong:**
Inbox policies work on one project and are invisible to the next engineer; Constitution cannot be reviewed.

**Why it happens:**
This repo only versions incremental WhatsApp/customer SQL.

**How to avoid:**
Migrations for new conversation tables **with RLS** in-repo; export baseline when possible.

**Warning signs:**
“It works on production Supabase” but empty `supabase/migrations`.

**Phase to address:**
First schema phase for inbox.

---

### Pitfall 7: Rebuilding CRM or baking WhatsApp into `customers`

**What goes wrong:**
Provider columns on CRM core; Instagram later forks the model.

**Why it happens:**
Fastest demo.

**How to avoid:**
Generic conversations; WhatsApp ids in provider tables.

**Warning signs:**
PRs adding `whatsapp_wamid` to `customers`.

**Phase to address:**
Data model (first inbox phase).

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Query inbox from client like billing-queries | Fast UI | Harder to enforce send secrets | Reads OK **if** RLS is proven |
| Skip status webhooks | Ship list UI | Ghost “sent” | Never for v1 “done” |
| Skip unique wamid | Ship ingest | Dupes + double auto-reply | Never |
| Disable RLS | Queries work | Constitution breach | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Meta HMAC | Hashing parsed JSON | Raw body bytes |
| Graph version | Unpinned `/latest/` | Env pin + changelog bump |
| Service role webhook | Using it for user reads | Service role only after verify, scoped writes |
| Realtime | No RLS filter | `client_id` eq tenant |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Load all messages for tenant | Tab freeze | Paginate thread; list only latest preview | Hundreds of threads |
| Realtime on all tables | Battery/CPU, extra connections | Messages + conversation row only | Many open dashboards |
| JS duplicate-customer scan | Slow create | Unique phone index | Large `customers` (already noted) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trust client tenant id | Cross-tenant read/write | JWT / phone_number_id map |
| App secret in `NEXT_PUBLIC_` | Account takeover | Server env only |
| HMAC OR-any-tenant | Cross-tenant ingest | Per-number secret |
| Logging Graph tokens | Secret leak | Redact Authorization |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Composer enabled outside window | Failed send, blame the app | Window countdown / template CTA |
| No empty inbox state | “Broken” | Constitution empty states |
| Clinic-only copy | Generic SMB confusion | Neutral labels over time (not a v1 rebuild) |

## "Looks Done But Isn't" Checklist

- [ ] **Webhook:** Verified on raw body; one tenant per `phone_number_id`
- [ ] **Retries:** Duplicate `wamid` does not duplicate UI
- [ ] **Statuses:** sent/delivered/failed visible or explicitly deferred with a reason
- [ ] **Send:** Server route; Graph errors shown
- [ ] **RLS:** Second user/tenant cannot select first tenant’s messages
- [ ] **CRM tabs:** Contacts/appointments/consultations still load
- [ ] **Secrets:** No token in network tab from the browser bundle

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cross-tenant rows | HIGH | Stop webhook; SQL audit `client_id` vs `phone_number_id`; notify |
| Duplicate wamids | MEDIUM | Dedupe; add unique index |
| Window errors | LOW | UX + optional template later |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Cross-tenant HMAC | Webhook/ingest | Hostile payload test (two numbers) |
| Status 401 | Webhook/ingest | Meta status fixture → 200 + row update |
| Idempotency | Schema | Retry same POST twice |
| 24h window | Send | Fixture last_inbound > 24h |
| Phone match | Contact link | `91` vs `+91` cases |
| Schema in git | Schema | Migration file + RLS in PR |
| WhatsApp-on-customers | Schema | Review table list |

## Sources

- `.planning/codebase/CONCERNS.md` — HIGH
- Meta webhook setup + `X-Hub-Signature-256` — HIGH
- WhatsApp customer care window (Cloud API) — HIGH
- Constitution multi-tenancy / secrets — HIGH

---
*Pitfalls research for: EvolvNex WhatsApp inbox*
*Researched: 2026-08-20*
