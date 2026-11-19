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
  - Schema SQL in-repo: `supabase/migrations/20260814_whatsapp_auto_replies.sql`, `supabase/migrations/20260817_customer_status_whatsapp_credentials.sql`, `supabase/migrations/20260817_customer_contact_fields.sql`, `supabase/migrations/20261111_consultations_vitals.sql`, `supabase/migrations/20261111_print_settings.sql`, `supabase/migrations/20261111_consultation_files_storage.sql`, `supabase/migrations/20261112_bills_order_source_clinic.sql`, `supabase/migrations/20261112_clinic_billing_schema.sql`, `supabase/migrations/20261112_doctor_billing_tab.sql`, `supabase/migrations/20261114_doctor_print_profiles.sql` (authored, not yet applied to live), `supabase/migrations/20261119_staff_members.sql`, `supabase/migrations/20261119_client_settings.sql`, `supabase/migrations/20261119_staff_tab_access.sql` (all three authored 2026-11-19, NOT applied to live), `supabase/migrations/20261120_packages_schema.sql`, `supabase/migrations/20261120_packages_rpcs.sql`, `supabase/migrations/20261120_packages_payment_rpcs.sql`, `supabase/migrations/20261120_packages_tab_access.sql` (authored 2026-11-20, NOT applied to live; probe scripts `supabase/tests/20261120_packages_probes.sql` and `supabase/tests/20261120_packages_payment_probes.sql`; one-file dry run `supabase/tests/20261120_packages_all_dryrun.sql`)
  - Tables touched by app code:
    - Tenancy / nav: `clients`, `client_tab_access`, `people` (`src/lib/client-cache.ts`, `src/lib/tabs.ts`, `src/components/dashboard/tabs/summary-tab.tsx`)
    - Clinic: `appointments`, `consultations`, `consultation_medications`, `consultation_exercises`, `consultation_attachments`, `print_settings` (one letterhead-margin row per client; `src/lib/print-settings-queries.ts`), `doctor_print_profiles` (per-doctor print template and header, one default per client; `src/lib/doctor-print-profile-queries.ts`) (`src/lib/appointment-queries.ts`, `src/lib/consultation-queries.ts`)
    - Scheduling foundation (quick-261114-22k Wave 1): `staff_members` (tenant staff list: `display_name`, `job_title`, `is_bookable`, `is_active`; unique normalized name per client; own-client RLS through `crm_can_access_client`; select, insert, update only, no delete; `src/lib/staff-member-queries.ts`), `appointments.staff_member_id` (nullable, composite FK `(client_id, staff_member_id)` to `staff_members(client_id, id)`; `staff_name` text stays and is dual-written; trigger `appointments_staff_name_sync` keeps the name in step, trigger `staff_members_rename_propagate` rewrites `appointments.staff_name` and `doctor_print_profiles.doctor_name` on rename), `client_settings` (`client_id`, `namespace`, `settings` jsonb; primary key `(client_id, namespace)`; own-client RLS, no delete; code registry `src/lib/client-settings-types.ts` is the allow-list, namespaces `scheduling` (`timezone`, default `Asia/Kolkata`) and `reminders` (`lead_minutes`, default 5, integer 1 to 1440; Wave 2, no migration needed); `src/lib/client-settings-queries.ts`)
      - Staff tab gating: `tabs_info` key `027` (code key `staff`, route `/dashboard/staff`, CRM sidebar item after Appointments) is seeded by `20261119_staff_tab_access.sql`, which backfills an enabled `client_tab_access` row for every client that has an enabled appointments (`002`) row. Apply it LAST, after the Staff tab code is deployed; users must sign in again because the tab list is cached per session. HRM keys `023` to `026` are untouched.
      - Deviation (user decision 2026-11-19, D-11): `staff_members` is a deliberate tenant-scoped table that sits next to the internal-use `public.employees` and `public.people` tables. Tenant code never reads, alters, references or backfills from those two, and no policy of theirs is touched; do not merge the tables by accident. `appointments.verified_by` keeps its existing FK to the internal table.
    - Packages and sessions (quick-261114-22k Wave 3, plan C1): `package_templates` (tenant catalog; browser CRUD under own-client RLS), `customer_packages`, `package_installments`, `package_sessions`, `package_payments` (ledger; browser SELECT only, no INSERT/UPDATE/DELETE grant for any API role). Every ledger write goes through SECURITY DEFINER RPCs with `search_path = ''` and a first-line tenant gate (`auth.uid()` plus `crm_can_access_client(p_client_id)`, else 42501): `sell_package` (final signature; C2 body: all three plans, installment schedule, atomic initial payment), `attach_package_session`, `detach_package_session`, `mark_session_missed`, `resolve_missed_session`, `record_package_payment` (final signature with optional trailing `p_idempotency_key`), `cancel_package`; execute revoked from public and anon. Rationale (R-10, user decision 2026-11-20): zero direct write grants on money and credit tables instead of the invoker plus guard-trigger pattern of `create_clinic_bill`. Trigger `appointments_package_session_sync` on `appointments` (definer, raises on failure) moves the linked session when an appointment is completed, cancelled, un-cancelled or soft-deleted, from any screen. Settings namespace `packages` in `client_settings` (`missed_default`, `rollover_extends_validity_days`, `forfeit_charges_per_visit`, `labels`), read in SQL by `package_settings_for`; values that affect credit or money are snapshotted on the session row (`validity_extended_days`, `charge_on_forfeit`, `resolution_overrode_default`). Payments (plan C2, `20261120_packages_payment_rpcs.sql`): append-only `package_payments` (kinds upfront, installment, per_visit; methods CASH, UPI, CARD, OTHER = the clinic vocabulary) plus `package_installments`. `package_payments.idempotency_key` with the partial unique index `package_payments_client_idem_uniq (client_id, idempotency_key) where not null`: a retry with the same key and details returns the existing row (`replayed`), different details raise 23505, keys are per tenant. Rules enforced in SQL: kind matches the plan; installments must add up exactly to `price_total` (count 1..120, due dates today-366..today+3660 and non-decreasing); upfront and installments cap total paid at `price_total` (23514); per visit pins one consumed session (completed, or forfeited with `charge_on_forfeit` true) and caps payments per session at `price_per_session`, which keeps paid <= accrued even if an unpaid completed visit is corrected back to booked; cancelled packages accept only per-visit settlement; `cancel_package` voids scheduled and undecided sessions and never touches payments. The migration also replaces the appointments trigger function with a reschedule guard (a package-linked appointment cannot move past `valid_until`, 22023) and recreates the trigger on `status, deleted_at, date`. Re-applying `20261120_packages_rpcs.sql` restores the C1 sell body and the C1 trigger, so re-apply the payment file after it. Code: `src/lib/package-{types,ledger,queries}.ts`, `src/hooks/use-packages.ts`.
      - Packages tab gating: `tabs_info` key `028` (code key `packages`, route `/dashboard/packages`, CRM sidebar item after Consultations) is seeded by `20261120_packages_tab_access.sql` with NO access backfill; grant `client_tab_access` by hand per tenant. Apply it LAST, after deploy; users sign in again.
    - Billing / cafe: `customers`, `products`, `bills` (`src/lib/billing-queries.ts`)
    - Clinic billing (Phase 3): `bills` rows with `order_source = 'Clinic'` (enum label added by migration A), `payment_status` (lowercase `paid` / `unpaid`), `payment_mode` (`CASH`, `UPI`, `CARD`, `OTHER`), `consultation_id` (unique per bill through `bills_consultation_id_uniq`) and `appointment_id`; scoped CHECK `bills_clinic_payment_chk` applies to Clinic rows only (`src/lib/clinic-billing-queries.ts`, `src/lib/clinic-billing-types.ts`). Clinic bills are created only through the invoker RPC `public.create_clinic_bill` (SECURITY INVOKER, `search_path public`, execute for `authenticated` only, tenant check through `crm_can_access_client`); the browser sends product ids, quantities, flat discount and payment choice, never a price or total. Mark paid is a direct scoped `bills` update (own-client RLS). The cafe flow still uses `create_order_with_inventory`, unchanged. Tab access for the clinic billing tab is data: `client_tab_access` / `tabs_info` key `015`, seeded by migration C (applied last).
    - Inventory: `ingredients`, `recipes` (`src/lib/inventory-queries.ts`, `src/lib/orderService.ts`)
    - Promos: `promotions`, `promotion_targets`, `promotion_usages` (`src/lib/promotion-queries.ts`)
    - Tasks: `tasks` (`src/components/dashboard/tabs/summary-tab.tsx`)
    - WhatsApp: `communication_provider_accounts`, `communication_auto_replies`, `communication_message_events`, `communication_whatsapp_credentials` (`src/lib/communication-queries.ts`, `src/lib/communication-credentials.ts`, `src/lib/providers/whatsapp/webhook.ts`)

**File Storage:**
- Supabase Storage private bucket `consultation-files` for consultation attachments (`src/lib/consultation-files.ts`, `src/lib/consultation-queries.ts`)
  - Object path: `{client_id}/{consultation_id}/{uuid}-{safe-name}`; the first path segment is the tenant and drives the `storage.objects` select, insert and delete policies (`crm_can_access_client`). There is no update policy.
  - Limits: 10 MB per file; pdf, jpeg, png and webp only (no HEIC). Enforced in the browser validator and by the bucket config.
  - Access: browser anon key plus the user's JWT only, no service role. Files open through short-lived signed URLs (300 seconds) created at click time by `AttachmentOpenButton`; the bucket is not public.
  - Legacy rows: older name+URL rows in `consultation_attachments` (`file_url` set, `storage_path` null) stay readable and are linked only when the URL is http or https.
  - Migration: `supabase/migrations/20261111_consultation_files_storage.sql`. Must be live before the code is deployed.
- Local static assets (`public/`) and the separate `menu` bucket are unrelated to consultations

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
- `POST /api/notifications/new-order` - Supabase bills INSERT webhook for closed-browser push (`src/app/api/notifications/new-order/route.ts`, `src/lib/web-push-server.ts`); skips POS and Clinic bills (a Clinic row answers `{ ok: true, skipped: "clinic_order" }`). Verified by static review only in Phase 3 (the `web-push` package is missing from local `node_modules`, so the route cannot be imported locally).

**Outgoing:**
- `POST https://graph.facebook.com/{WHATSAPP_API_VERSION}/{phoneNumberId}/messages` - Text messages (`src/lib/providers/whatsapp/cloud-api.ts`)
- `POST /api/communication/whatsapp/credentials` - First-party Route Handler from the dashboard (`src/hooks/use-whatsapp-auto-replies.ts`), not an external callback

---

*Integration audit: 2026-08-19*
