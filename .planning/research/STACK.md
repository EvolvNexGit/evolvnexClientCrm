# Stack Research

**Domain:** Multi-tenant SMB CRM + provider-independent WhatsApp inbox on existing Next.js/Supabase OS
**Researched:** 2026-08-20
**Confidence:** HIGH for keep-existing core; MEDIUM for Graph API pin (Meta versions move quarterly)

> Orchestrator-authored after `gsd-project-researcher` agents stalled (plan JSON only, no document writes). Grounded in `.planning/codebase/*`, `PROJECT.md`, Constitution, and Meta Cloud API webhook docs.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 15.x (repo `^15.3.1`, lockfile 15.5.15) | App Router UI + Route Handlers | Already the OS shell. Inbox pages stay in `src/app/dashboard`; webhook/send stay in `src/app/api/`. Do not replace. |
| React | 19.x | Inbox thread UI | Matches current dashboard tabs (`"use client"`). |
| TypeScript | 5.9.x | Types across layers | `strict` already on; generate DB types next, do not add a second language. |
| PostgreSQL via Supabase | hosted | Tenant data, Auth, Realtime | Constitution source of truth. Inbox rows must be RLS-scoped like other domain tables. |
| `@supabase/supabase-js` | 2.49+ (lockfile ~2.103) | Auth, PostgREST, Realtime | Existing client. Use Realtime `postgres_changes` on conversation/message tables the same way `use-transactions.ts` listens to `bills`. |
| WhatsApp Cloud API (Graph) | Pin `WHATSAPP_API_VERSION` (today default `v21.0` in `cloud-api.ts`; Meta latest line is ~v23–v25 — bump only after changelog read) | Send/receive | Already implemented with `fetch`, not a Meta SDK. Keep native `fetch`. Pin version; never float. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node `crypto` | built-in | HMAC `X-Hub-Signature-256`, AES-256-GCM secret box | Already in `webhook.ts` / `secret-box.ts`. Verify on **raw body**, constant-time compare. |
| `lucide-react` | ^0.511 | Icons | Reuse; do not add another icon kit. |
| Tailwind CSS | 3.4.x | Inbox layout | Existing design tokens / dark theme. |
| *none new for v1 inbox* | — | — | No Redis, no BullMQ, no WhatsApp SDK unless a phase proves fetch+DB status tracking is insufficient. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `supabase gen types` | Typed `.from()` | CONCERNS.md: query files use `any`. Generate into `src/lib/database.types.ts` (or equivalent) before inbox schema grows. |
| ESLint + `eslint-config-next` | Lint | `npm run lint` exists without packages. Add when hardening, not as a product feature. |
| Official WhatsApp webhook docs | Contract | https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/ |

## Installation

```bash
# No new runtime packages required for v1 inbox if schema + routes + UI reuse existing stack.

# When hardening types (recommended same milestone as conversation tables):
npx supabase gen types typescript --linked > src/lib/database.types.ts

# When lint becomes real:
npm install -D eslint eslint-config-next
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Native `fetch` + Graph | Official Meta WhatsApp SDK / `whatsapp-cloud-api` npm | Only if fetch + typed DTOs become unmaintainable; Constitution prefers smallest change. |
| Supabase Realtime on messages | Polling every N seconds | Fallback if Realtime RLS or connection cost is a problem; Constitution: realtime only where valuable — inbox is that case. |
| Next Route Handler webhook | Separate worker (Inngest, SQS) | When Meta retries + media download + fan-out exceed request timeout; not v1 unless timeouts appear. |
| Postgres conversation tables | Store threads only in WhatsApp | Never — need CRM join, tenant RLS, provider-independent thread id. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| New WhatsApp-named tables as the Communication model | Hardcodes provider; Constitution forbids | Generic `conversations` / `messages` + provider account FK |
| Client-held Cloud API tokens | Secrets in frontend | Existing encrypted `communication_whatsapp_credentials` + server send route |
| Disable RLS for “inbox speed” | Constitution prohibition | Indexes + pagination + Realtime filters on `client_id` |
| Drag-and-drop automation builders | Constitution unless approved | Out of v1 |
| Twilio/360dialog as default | Extra vendor; WhatsApp Cloud already in repo | Keep Cloud API; other BSPs only if a tenant requires them later |
| Zustand/Redux for global inbox | App already uses hooks + React state | Local thread state + Realtime |

## Stack Patterns by Variant

**If inbound volume stays SMB (tens–hundreds of messages/hour/tenant):**
- Process webhook inline in the Route Handler, persist, return 200 quickly.
- Because Meta retries on slow/5xx; keep handler idempotent on `wamid`.

**If media (images/voice) is in v1:**
- Download media with the **server** token to Storage or a signed URL; never put the token in the browser.
- Because media URLs from Graph are short-lived and authenticated.

**If only text in v1:**
- Skip Storage; store `type` + `text` + provider message id.
- Because PROJECT.md inbox-only does not require campaigns or rich templates.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| next@15 | react@19 | Already shipping |
| @supabase/supabase-js@2 | Next 15 Route Handlers | Service role only on server |
| Graph v21 vs v23+ | Same `/PHONE_NUMBER_ID/messages` shape | Pin env; test webhook + send after bump |

## Sources

- `.planning/codebase/STACK.md`, `INTEGRATIONS.md` — HIGH
- https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/ — HIGH
- https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components/ — HIGH
- Meta Graph changelog (pin; do not float) — MEDIUM until bump PR reads it
- Constitution + `AGENTS.md.docx` — HIGH (constraints, not versions)

---
*Stack research for: EvolvNex CRM + WhatsApp inbox*
*Researched: 2026-08-20*
