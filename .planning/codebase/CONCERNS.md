<!-- refreshed: 2026-08-19 -->
# Codebase Concerns

**Analysis Date:** 2026-08-19

## Tech Debt

**Client-side `any` row mapping (no generated DB types):**
- Issue: Query layers cast PostgREST rows as `any` / `Record<string, unknown>` instead of a generated `Database` type. Schema drift is only caught at runtime.
- Files: `src/lib/billing-queries.ts`, `src/lib/promotion-queries.ts`, `src/lib/inventory-queries.ts`, `src/lib/orderService.ts`, `src/lib/tabs.ts`, `src/components/dashboard/tabs/summary-tab.tsx`
- Impact: Broken selects, renamed columns, and nested join shape changes compile cleanly and fail in production.
- Fix approach: Generate types from Supabase (`supabase gen types`) and type `.from()` / mappers. Ban `row: any` in query files.

**Schema and RPCs live outside the repo:**
- Issue: This repo only versions three incremental SQL files under `supabase/migrations/`. Core tables (`customers`, `bills`, `appointments`, `consultations`, `clients`, `create_order_with_inventory`) and their RLS policies are not in git.
- Files: `supabase/migrations/20260814_whatsapp_auto_replies.sql`, `supabase/migrations/20260817_customer_status_whatsapp_credentials.sql`, `supabase/migrations/20260817_customer_contact_fields.sql`, `src/lib/orderService.ts`
- Impact: New environments cannot recreate the product. RLS assumptions cannot be reviewed. Checkout depends on an undocumented RPC.
- Fix approach: Export the full public schema (or baseline dump) into `supabase/migrations/` and add the `create_order_with_inventory` function definition next to the app caller.

**Navigation still labels shipped screens as coming soon:**
- Issue: LEADS “Contacts” and “Auto Replies” are `kind: "coming-soon"` in the module catalog, then special-cased in the dashboard to render real tabs.
- Files: `src/lib/module-navigation.ts`, `src/lib/dashboard-tab-routes.ts`, `src/components/dashboard/dashboard-page.tsx`
- Impact: Routing, empty-state copy, and future nav changes are easy to break (e.g. treating automation as a placeholder again).
- Fix approach: Promote `leads-contacts` and `leads-automation` to `existing-tab` / first-class path keys and delete the dashboard special cases.

**Stale README vs real layout:**
- Issue: `README.md` advertises email CRM, RBAC, and an `app/` tree that does not match `src/app/`.
- Files: `README.md`
- Impact: Onboarding and ops follow the wrong paths and feature set.
- Fix approach: Rewrite README to match App Router under `src/`, Supabase auth, and modules that actually ship.

**Lint script without ESLint packages:**
- Issue: `package.json` defines `npm run lint` (`next lint`) but neither `eslint` nor `eslint-config-next` is a dependency. No `eslint.config.*` / `.eslintrc*` exists.
- Files: `package.json`
- Impact: CI or local `npm run lint` is unreliable; style/security lint never runs.
- Fix approach: Add `eslint` + `eslint-config-next`, a config file, and a CI job.

**In-memory caches never invalidate on sign-out:**
- Issue: `clientCache` and `tabsCache` are module-level Maps. Sign-out in `src/contexts/app-context.tsx` does not clear them.
- Files: `src/lib/client-cache.ts`, `src/lib/tabs.ts`, `src/contexts/app-context.tsx`
- Impact: Same browser tab can reuse a previous user’s `clientId` / tab list if auth user ids collide in the Map after a rapid account switch (or if a stale null mapping is cached).
- Fix approach: Export `clearClientCache()` / `clearTabsCache()` and call them from `signOut` and failed session reset.

**Subscription UI is local placeholder data:**
- Issue: Subscriptions persist only via `usePersistentState` with hardcoded starter rows, not Supabase.
- Files: `src/components/dashboard/tabs/subscription-tab.tsx`
- Impact: Operators believe billing plans are saved; data is device-local and not multi-user.
- Fix approach: Back with a `subscriptions` table or hide the tab until real persistence exists.

## Known Bugs

**WhatsApp signature check is OR-across tenants, processing is AND-all messages:**
- Symptoms: A payload HMAC-valid for one `phone_number_id` can still contain inbound messages for other numbers; those messages are processed after verification succeeds.
- Files: `src/lib/providers/whatsapp/webhook.ts` (`verifyWhatsAppSignature`, `handleWhatsAppWebhookPayload`), `src/app/api/communication/whatsapp/webhook/route.ts`
- Trigger: Craft a webhook body that includes tenant A’s `phone_number_id` (whose `appSecret` signs the body) plus extra `messages` metadata for tenant B’s number.
- Workaround: None in app. Meta normally sends one WABA per payload, but the code does not enforce that.

**Status / non-message webhooks fail signature verification:**
- Symptoms: Payloads without `metadata.phone_number_id` never match a secret (`collectPhoneNumberIds` empty → `verifyWhatsAppSignature` returns false → HTTP 401). Meta retries.
- Files: `src/lib/providers/whatsapp/webhook.ts`, `src/app/api/communication/whatsapp/webhook/route.ts`
- Trigger: Delivery status callbacks and other change types without phone metadata.
- Workaround: Ignore retry noise in Meta’s webhook logs.

**Checkout ignores inventory validation errors:**
- Symptoms: `createOrder` swallows `validateInventory` failures and still calls `create_order_with_inventory`. UI warnings can be skipped when the pre-check throws.
- Files: `src/lib/orderService.ts`
- Trigger: Recipe/ingredient query error or unexpected shape during POS checkout.
- Workaround: Rely solely on the RPC (if it actually enforces stock). That RPC is not in this repo, so behavior is unknown.

**Duplicate customer check is racy and incomplete:**
- Symptoms: Two simultaneous creates with the same details both succeed. Duplicate detection loads every customer for the tenant and compares name/phone/email/dob in JS. No unique index on phone in `supabase/migrations/20260817_customer_contact_fields.sql`.
- Files: `src/lib/billing-queries.ts` (`createCustomer`)
- Trigger: Double-submit or CSV import races (`src/components/dashboard/tabs/contacts-tab.tsx`).
- Workaround: Manual cleanup in the customers table.

**Default auto-reply seed can duplicate:**
- Symptoms: `ensureDefaultAutoReplies` inserts when the list is empty with no unique `(client_id, trigger_text)` constraint.
- Files: `src/lib/communication-queries.ts`, `supabase/migrations/20260814_whatsapp_auto_replies.sql`
- Trigger: Two dashboard loads before the first insert commits.
- Workaround: Delete extra rows in Auto Replies.

**Appointment / transaction search under-counts past 200 rows:**
- Symptoms: Filters run in memory on a capped fetch (`LIST_PAGE_SHOW_ALL_MAX` = 200). Older appointments never appear. Transaction text search uses the same cap.
- Files: `src/lib/appointment-queries.ts`, `src/lib/billing-queries.ts` (`fetchTransactionsPage`), `src/lib/list-pagination.ts`
- Trigger: Tenant with >200 appointments or searching older bills.
- Workaround: Narrow date filters (appointments still only load the first 200 by `date`/`start_time` order).

## Security Considerations

**Dashboard auth is client-only (no middleware):**
- Risk: `/dashboard` and `/dashboard/[tab]` always render the client shell. Protection is `useEffect` redirect in `src/components/dashboard/dashboard-page.tsx`. HTML/JS for the CRM still downloads unauthenticated.
- Files: `src/app/dashboard/page.tsx`, `src/app/dashboard/[tab]/page.tsx`, `src/components/dashboard/dashboard-page.tsx`, `src/contexts/app-context.tsx`
- Current mitigation: Supabase session in the browser; data queries use the anon key + user JWT.
- Recommendations: Add `middleware.ts` (or a server layout) that validates the session before rendering dashboard routes.

**Tenant isolation depends on undocumented RLS:**
- Risk: Almost every query is `getSupabaseClient()` in the browser with a caller-supplied `clientId`. If `customers`, `bills`, `appointments`, etc. lack `crm_can_access_client`-style RLS, any signed-in user can pass another `clientId`.
- Files: `src/lib/billing-queries.ts`, `src/lib/consultation-queries.ts`, `src/lib/appointment-queries.ts`, `src/lib/inventory-queries.ts`, `src/lib/orderService.ts`, `src/lib/server/request-auth.ts`
- Current mitigation: Communication tables in `supabase/migrations/20260814_whatsapp_auto_replies.sql` enable RLS. Core CRM tables are not defined here.
- Recommendations: Confirm RLS on every `client_id` table; never trust `clientId` from the client without a matching `clients.crm_user_id = auth.uid()` policy.

**Authenticated users can read/write WhatsApp ciphertext:**
- Risk: Policies grant `authenticated` `SELECT`/`ALL` on `communication_whatsapp_credentials`, including `encrypted_payload`. A tenant user can dump ciphertext from the browser console and can upsert raw (possibly plaintext) payloads without `encryptSecret`.
- Files: `supabase/migrations/20260817_customer_status_whatsapp_credentials.sql`, `src/lib/communication-credentials.ts`, `src/app/api/communication/whatsapp/credentials/route.ts`
- Current mitigation: AES-256-GCM in `src/lib/crypto/secret-box.ts` with server-only `COMMUNICATION_ENCRYPTION_KEY`. UI uses the credentials API for writes. Public connection queries avoid selecting the blob (`src/lib/communication-queries.ts`).
- Recommendations: Deny authenticated access to `encrypted_payload` (column grant or view). Perform all secret reads/writes with the service role after `getAuthenticatedRequestClient`. Keep `COMMUNICATION_ENCRYPTION_KEY` off `NEXT_PUBLIC_*`.

**Service-role webhook is a high-value endpoint:**
- Risk: `getSupabaseAdminClient()` in `src/lib/supabase-admin.ts` bypasses RLS. Bugs in signature verification (see Known Bugs) become cross-tenant data/send access. GET verify-token lookup uses admin (`findClientIdByVerifyToken`).
- Files: `src/lib/supabase-admin.ts`, `src/lib/providers/whatsapp/webhook.ts`, `src/app/api/communication/whatsapp/webhook/route.ts`
- Current mitigation: HMAC SHA-256 with per-tenant `appSecret`; challenge requires hashed verify token; inbound idempotency unique index on `(provider, provider_message_id)`.
- Recommendations: Bind verification to a single tenant; reject mixed `phone_number_id` payloads; rate-limit GET/POST; do not log raw bodies.

**Tab `permissions` are unused:**
- Risk: Permissions are loaded from `client_tabs` and stored on `TabDefinition` but never checked in the UI. README claims RBAC.
- Files: `src/lib/tabs.ts`, `src/lib/types.ts`, `src/components/dashboard/dashboard-page.tsx`
- Current mitigation: Visibility is only `is_enabled` / `is_active`.
- Recommendations: Enforce permissions in the shell and in RLS (or drop the field).

**Webhook 500 vs 200 retry policy:**
- Risk: Business-logic failures return 500 (`src/app/api/communication/whatsapp/webhook/route.ts`), causing Meta retries. Combined with non-unique outbound `provider_message_id` nulls, retries can send duplicate auto-replies if inbound insert succeeded but send/log failed mid-loop.
- Files: `src/lib/providers/whatsapp/webhook.ts` (`insertInboundIfNew` then send), `src/app/api/communication/whatsapp/webhook/route.ts`
- Current mitigation: Duplicate inbound `provider_message_id` returns skip (`23505`).
- Recommendations: Persist a “reply attempted” state before send, or return 200 after inbound persist and retry outbound asynchronously.

## Performance Bottlenecks

**Unbounded nested customer + bills fetch:**
- Problem: `fetchCustomers` selects `bills(id, final_amount, created_at)` for every active customer with no range. Used by `useCustomers` (customer, contacts, billing tabs) and `useCafeSummary`.
- Files: `src/lib/billing-queries.ts`, `src/hooks/use-customers.ts`, `src/hooks/use-cafe-summary.ts`, `src/components/dashboard/tabs/customer-tab.tsx`, `src/components/dashboard/tabs/contacts-tab.tsx`, `src/components/dashboard/tabs/billing-tab.tsx`
- Cause: Totals are computed in the browser from nested bills. PostgREST also silently caps rows (often 1000).
- Improvement path: Use paged `fetchCustomersPage` everywhere; replace nested bills with SQL aggregates (`sum`/`count` on `bills`) or a materialized view.

**Summary dashboards load full history:**
- Problem: Cafe summary pulls all customers + ingredients + bills since previous range. Doctor summary selects all appointments with no `.range()`. `fetchTransactions` / `useTransactions` loads all bills with nested items.
- Files: `src/hooks/use-cafe-summary.ts`, `src/hooks/use-doctor-summary.ts`, `src/lib/billing-queries.ts` (`fetchTransactions`, `fetchTransactionsSince`), `src/hooks/use-transactions.ts`, `src/lib/inventory-queries.ts` (`fetchIngredients`)
- Cause: Analytics assembled in the browser.
- Improvement path: SQL RPCs or views grouped by day; cap and paginate POS transaction lists independently of notifications.

**Contact audience scan of 2000 rows:**
- Problem: `fetchContactAudience` uses `.range(0, 1999)` then counts tags in JS.
- Files: `src/lib/billing-queries.ts`
- Cause: No `unnest`/`group by` in SQL.
- Improvement path: Postgres aggregation over `contact_tags` / `contact_source` / `outreach_status`.

**Auto-reply match loads every rule per inbound message:**
- Problem: `findMatchingReply` selects all active replies for the client and scans in JS for each inbound text.
- Files: `src/lib/providers/whatsapp/webhook.ts`
- Cause: `contains` vs `exact` is easier in JS than SQL.
- Improvement path: Exact matches via unique indexed lookup; keep a small in-memory cache per `clientId` with TTL.

**Webhook verifies by decrypting secrets per phone id:**
- Problem: `verifyWhatsAppSignature` parses JSON, then `getWhatsAppSecretsByPhoneNumberId` decrypts the full secret blob (access token included) just to check HMAC.
- Files: `src/lib/providers/whatsapp/webhook.ts`, `src/lib/communication-credentials.ts`
- Cause: App secret lives inside the same encrypted JSON as the Cloud API token.
- Improvement path: Store `app_secret` (or an HMAC key id) separately for verify-only reads.

## Fragile Areas

**`dashboard-page.tsx` view resolution:**
- Files: `src/components/dashboard/dashboard-page.tsx`, `src/lib/module-navigation.ts`, `src/lib/dashboard-tab-routes.ts`, `src/lib/tabs.ts`
- Why fragile: URL path, `localStorage` tab/module keys, DB-driven tab keys, coming-soon keys, and specialty `*-summary` aliases all feed one resolver. Specialty summaries without a dedicated component fall through to Coming Soon.
- Safe modification: Add a new screen by updating routes, `MODULES`, and a single render branch together; add a mapping test for path → component.
- Test coverage: None (no `*.test.*` / `*.spec.*` in the repo).

**WhatsApp credential save merge:**
- Files: `src/lib/communication-credentials.ts`, `src/app/api/communication/whatsapp/credentials/route.ts`, `src/hooks/use-whatsapp-auto-replies.ts`
- Why fragile: Partial secret updates merge with ciphertext loaded via the user JWT. Decrypt failure returns `null` existing secrets and then requires all fields again—or can persist incomplete state if checks are bypassed.
- Safe modification: Load existing secrets only with the admin client; treat decrypt failure as `status: error`.
- Test coverage: None.

**POS order creation:**
- Files: `src/lib/orderService.ts`, `src/components/dashboard/tabs/billing-tab.tsx`
- Why fragile: Cart `clientId` is copied from the first product; mixed-tenant carts are not rejected. Totals in UI can diverge from RPC `total`. Status casing (`ACCEPTED` vs UI `accepted`) is mapped in several places (`src/lib/billing-queries.ts`).
- Safe modification: Assert every cart line’s `clientId` equals the session client; keep status enums in one module.
- Test coverage: None.

**Consultation nested writes:**
- Files: `src/lib/consultation-queries.ts`, `src/hooks/use-consultations.ts`
- Why fragile: Client-generated UUIDs work around RLS that blocks `SELECT` after `INSERT`. `select("*")` on medications/exercises/attachments. Comment in file acknowledges RLS mismatch.
- Safe modification: Tighten column lists; keep client UUID generation until INSERT…RETURNING is allowed.
- Test coverage: None.

## Scaling Limits

**List UI cap of 200:**
- Current capacity: `LIST_PAGE_SHOW_ALL_MAX = 200` in `src/lib/list-pagination.ts`.
- Limit: Appointments, inventory search/low-stock, and transaction search cannot operate past 200 loaded rows. Users see a “capped” hint in `src/components/ui/list-pagination-controls.tsx`.
- Scaling path: Push filters/sorts to PostgREST/SQL; raise cap only for export jobs on the server.

**PostgREST default row cap (~1000):**
- Current capacity: Unbounded `.select()` helpers (`fetchCustomers`, `fetchIngredients`, `fetchTransactions`, doctor appointments) rely on server `max_rows`.
- Limit: Silent truncation → wrong totals, missed alerts, incomplete CSV-adjacent workflows.
- Scaling path: Always `.range()` or aggregate in SQL; set explicit pagination.

**WhatsApp webhook is synchronous and single-process:**
- Current capacity: One Node route (`runtime: "nodejs"`) decrypts, writes events, and calls Graph API per message in a loop.
- Limit: Burst inbound traffic ties up the serverless/instance timeout; Graph API latency blocks Meta’s HTTP wait.
- Scaling path: Verify + enqueue; worker sends replies; keep idempotency on `communication_message_events`.

**Module-level singletons:**
- Current capacity: One `supabaseClient` (`src/lib/supabase.ts`) and one `adminClient` (`src/lib/supabase-admin.ts`) per server/browser isolate.
- Limit: Tests and multi-tenant server jobs share mutable clients; admin client is fatal if `SUPABASE_SERVICE_ROLE_KEY` is missing (webhook 500).
- Scaling path: Factory per request for admin; document env requirements for webhook hosting.

## Dependencies at Risk

**No automated test or CI stack:**
- Risk: `package.json` has no test runner, no GitHub Actions under `.github/`, and no coverage tooling. `recharts` `^3.10.1` and Next `^15.3.1` can drift without a lockstep check beyond `package-lock.json`.
- Impact: Regressions in billing math, webhook crypto, and RLS-sensitive queries ship undetected.
- Migration plan: Add Vitest for `secret-box`, webhook signature, and mappers; Playwright for login + one POS path; GitHub Action on `lint`/`test`/`build`.

**`create_order_with_inventory` RPC (external):**
- Risk: Sole checkout write path is an undocumented Postgres function.
- Impact: Deploying the Next app without that RPC makes POS unusable.
- Migration plan: Check the function into `supabase/migrations/` and add a contract test (request shape in `src/lib/orderService.ts`).

**Meta Graph API version pin:**
- Risk: Default `WHATSAPP_API_VERSION` is `v21.0` in `src/lib/providers/whatsapp/cloud-api.ts`. Meta deprecates versions.
- Impact: Auto-replies fail with opaque Graph errors.
- Migration plan: Track version in env and a scheduled smoke send.

## Missing Critical Features

**Server-side session gate:**
- Problem: No Next middleware; dashboard is a client redirect.
- Blocks: Secure cookie/session handling, bot-resistant CRM, consistent auth for future API routes.

**Observability:**
- Problem: Errors go to `console.error` (webhook) or UI strings. No Sentry/OpenTelemetry.
- Blocks: Diagnosing production WhatsApp 401/500 loops and POS RPC failures.

**HRM, campaigns, inbox, reports:**
- Problem: Placeholder routes in `src/lib/module-navigation.ts` / `src/lib/dashboard-tab-routes.ts`.
- Blocks: Product areas advertised in the shell.

**Role-based access:**
- Problem: `permissions` unused; one `crm_user_id` per `clients` row in `src/lib/server/request-auth.ts`.
- Blocks: Multi-user clinics/cafes with least privilege.

**Rate limiting and webhook IP allowlisting:**
- Problem: Public GET/POST on `src/app/api/communication/whatsapp/webhook/route.ts`.
- Blocks: Cheap verify-token probing and retry storms.

## Test Coverage Gaps

**Entire application (no tests):**
- What's not tested: Auth redirect, RLS assumptions, AES-GCM round-trip, HMAC verify, auto-reply matching, order RPC mapping, duplicate-customer logic, CSV import in `src/components/dashboard/tabs/contacts-tab.tsx`, pagination caps.
- Files: All of `src/`; `package.json` scripts have no `test`.
- Risk: Security and money paths (POS, WhatsApp send) change without a safety net.
- Priority: High

**Crypto and webhook (highest leverage):**
- What's not tested: `encryptSecret`/`decryptSecret`/`hashVerifyToken` in `src/lib/crypto/secret-box.ts`; `verifyWhatsAppSignature` mixed-tenant behavior in `src/lib/providers/whatsapp/webhook.ts`.
- Files: those two modules plus `src/app/api/communication/whatsapp/webhook/route.ts`
- Risk: Silent auth bypass or inability to decrypt after a key format change.
- Priority: High

**Query mappers and money math:**
- What's not tested: `mapCustomer` nested bills, `orderService.calculateTotals` / inventory remaining, promotion usage in `src/lib/promotion-queries.ts`.
- Files: `src/lib/billing-queries.ts`, `src/lib/orderService.ts`, `src/lib/promotion-queries.ts`
- Risk: Wrong totals, stock, or promo discounts.
- Priority: High

**Dashboard routing matrix:**
- What's not tested: coming-soon vs real tab keys, specialty summary aliases in `src/lib/tabs.ts`.
- Files: `src/components/dashboard/dashboard-page.tsx`, `src/lib/dashboard-tab-routes.ts`
- Risk: Blank dashboard or wrong module after nav edits.
- Priority: Medium

---

*Concerns analysis: 2026-08-19*
