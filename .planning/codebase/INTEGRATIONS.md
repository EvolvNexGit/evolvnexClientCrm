<!-- refreshed: 2026-08-19 -->
# External Integrations

**Analysis Date:** 2026-08-19

## APIs & External Services

**Backend-as-a-service:**
- Supabase (hosted Postgres + Auth + Realtime) - All CRM data and sessions
  - SDK/Client: `@supabase/supabase-js` via `createClient` in `src/lib/supabase.ts` (anon, browser, persist session), `src/lib/supabase-admin.ts` (service role, webhook), `src/lib/server/request-auth.ts` (user JWT on API routes)
  - Auth: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; server webhook also `SUPABASE_SERVICE_ROLE_KEY`

**Messaging:**
- Meta WhatsApp Cloud API (`https://graph.facebook.com/{version}/{phoneNumberId}/messages`) - Outbound auto-reply text
  - SDK/Client: native `fetch` in `src/lib/providers/whatsapp/cloud-api.ts` (not an official Meta SDK)
  - Auth: per-tenant access token stored encrypted in Postgres (`COMMUNICATION_ENCRYPTION_KEY` for AES-256-GCM in `src/lib/crypto/secret-box.ts`); API version env `WHATSAPP_API_VERSION` (default `v21.0`)

**Browser platform (not third-party SaaS):**
- Notifications + Web Audio - New-order alerts in `src/lib/order-notifications.ts` (used from `src/hooks/use-transactions.ts`)

**Editor tooling (not production):**
- Supabase MCP HTTP server - `.vscode/mcp.json` (`https://mcp.supabase.com/mcp`) for Cursor; does not ship in the Next app

## Data Storage

**Databases:**
- PostgreSQL via Supabase
  - Connection: `NEXT_PUBLIC_SUPABASE_URL` + anon or service-role key (PostgREST / Auth HTTP, not a direct `DATABASE_URL` in app code)
  - Client: `@supabase/supabase-js` `.from(...)` in query modules; RLS expected (migrations enable RLS on communication tables)
  - Schema SQL in-repo: `supabase/migrations/20260814_whatsapp_auto_replies.sql`, `supabase/migrations/20260817_customer_status_whatsapp_credentials.sql`, `supabase/migrations/20260817_customer_contact_fields.sql`
  - Tables touched by app code:
    - Tenancy / nav: `clients`, `client_tab_access`, `people` (`src/lib/client-cache.ts`, `src/lib/tabs.ts`, `src/components/dashboard/tabs/summary-tab.tsx`)
    - Clinic: `appointments`, `consultations`, `consultation_medications`, `consultation_exercises`, `consultation_attachments` (`src/lib/appointment-queries.ts`, `src/lib/consultation-queries.ts`)
    - Billing / cafe: `customers`, `products`, `bills` (`src/lib/billing-queries.ts`)
    - Inventory: `ingredients`, `recipes` (`src/lib/inventory-queries.ts`, `src/lib/orderService.ts`)
    - Promos: `promotions`, `promotion_targets`, `promotion_usages` (`src/lib/promotion-queries.ts`)
    - Tasks: `tasks` (`src/components/dashboard/tabs/summary-tab.tsx`)
    - WhatsApp: `communication_provider_accounts`, `communication_auto_replies`, `communication_message_events`, `communication_whatsapp_credentials` (`src/lib/communication-queries.ts`, `src/lib/communication-credentials.ts`, `src/lib/providers/whatsapp/webhook.ts`)

**File Storage:**
- Local static assets only (`public/` if used; no `supabase.storage` usage detected)
- Consultation attachments stored as rows in `consultation_attachments`, not object storage (`src/lib/consultation-queries.ts`)

**Caching:**
- In-memory `Map` for auth-user → client id in `src/lib/client-cache.ts`
- `sessionStorage` for known order ids in `src/lib/order-notifications.ts`
- No Redis/CDN cache layer

**Realtime:**
- Supabase Realtime `postgres_changes` on `public.bills` filtered by `client_id` in `src/hooks/use-transactions.ts`

## Authentication & Identity

**Auth Provider:**
- Supabase Auth
  - Implementation: email/password `signInWithPassword` / `signOut` / `onAuthStateChange` in `src/contexts/app-context.tsx`; login UI `src/components/login-form.tsx`
  - Browser client: persist session, auto refresh, detect session in URL (`src/lib/supabase.ts`)
  - Tenant mapping: `clients.crm_user_id` → `clientId` (`src/lib/client-cache.ts`, `src/lib/server/request-auth.ts`)
  - API credential save: `Authorization: Bearer <access_token>` on `POST /api/communication/whatsapp/credentials` (`src/app/api/communication/whatsapp/credentials/route.ts`)
  - Webhook path: no user session; service-role client (`src/lib/supabase-admin.ts`) after Meta signature + verify-token checks

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry/Datadog SDK)

**Logs:**
- `console.error` on WhatsApp webhook verify/signature/processing failures (`src/app/api/communication/whatsapp/webhook/route.ts`)
- User-facing auth/network copy via `formatAuthErrorMessage` in `src/lib/supabase.ts`

## CI/CD & Deployment

**Hosting:**
- Not detected in-repo (standard Next.js Node host; GitHub remote documented in `README.md` as `EvolvNexGit/evolvnexClientCrm`)

**CI Pipeline:**
- None (no `.github/workflows`)

## Environment Configuration

**Required env vars:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (`src/lib/supabase.ts`, `src/lib/supabase-admin.ts`, `src/lib/server/request-auth.ts`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anon key for RLS-scoped client
- `SUPABASE_SERVICE_ROLE_KEY` - Server-only; Meta webhook and admin lookups (`src/lib/supabase-admin.ts`)
- `COMMUNICATION_ENCRYPTION_KEY` - 32-byte key as 64-char hex or base64; encrypts WhatsApp tokens (`src/lib/crypto/secret-box.ts`)

**Optional env vars:**
- `WHATSAPP_API_VERSION` - Graph API version; default `v21.0` (`src/lib/providers/whatsapp/cloud-api.ts`)

**Secrets location:**
- `.env.example` documents names; runtime secrets in `.env` / `.env.local` (gitignored)
- WhatsApp access token, app secret, and verify token: encrypted payload in `communication_whatsapp_credentials.encrypted_payload`; verify token also hashed (`src/lib/communication-credentials.ts`)
- Never put service-role or encryption keys in `NEXT_PUBLIC_*` variables

## Webhooks & Callbacks

**Incoming:**
- `GET /api/communication/whatsapp/webhook` - Meta subscription challenge (`hub.mode`, `hub.verify_token`, `hub.challenge`); verify token hashed-lookup (`src/lib/providers/whatsapp/webhook.ts`)
- `POST /api/communication/whatsapp/webhook` - Inbound WhatsApp events; `x-hub-signature-256` HMAC-SHA256 with tenant `appSecret`; Node runtime (`src/app/api/communication/whatsapp/webhook/route.ts`)
  - Handler loads auto-replies, sends Cloud API text, writes `communication_message_events`

**Outgoing:**
- `POST https://graph.facebook.com/{WHATSAPP_API_VERSION}/{phoneNumberId}/messages` - Text messages (`src/lib/providers/whatsapp/cloud-api.ts`)
- `POST /api/communication/whatsapp/credentials` - First-party Route Handler from the dashboard (`src/hooks/use-whatsapp-auto-replies.ts`), not an external callback

---

*Integration audit: 2026-08-19*
