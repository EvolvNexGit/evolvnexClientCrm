<!-- refreshed: 2026-08-19 -->
# Architecture

**Analysis Date:** 2026-08-19

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                         Next.js App Router (UI)                           │
│  `src/app/layout.tsx` → `src/components/app-shell.tsx` → AppProvider      │
├────────────────────┬────────────────────┬─────────────────────────────────┤
│  Login             │  Dashboard shell   │  Tab views (dynamic import)     │
│  `src/app/login`   │  `dashboard-page`  │  `src/components/dashboard/tabs`│
│  `login-form.tsx`  │  `top-navigation`  │  + billing widgets              │
└─────────┬──────────┴─────────┬──────────┴────────────────┬────────────────┘
          │                    │                           │
          ▼                    ▼                           ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    Client data layer (browser)                            │
│  hooks `src/hooks/*` → queries `src/lib/*-queries.ts`                     │
│  types `src/lib/*-types.ts`  ·  anon client `src/lib/supabase.ts`         │
└─────────────────────────────────┬─────────────────────────────────────────┘
                                  │ PostgREST + Auth (RLS)
                                  ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         Supabase                                          │
│  Auth users · `clients` · domain tables · `client_tab_access`             │
└───────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│                    Server routes (Node runtime)                           │
│  `src/app/api/communication/whatsapp/{webhook,credentials}/route.ts`      │
│  Auth: Bearer → `src/lib/server/request-auth.ts` (credentials)            │
│  Auth: Meta HMAC / verify token (webhook)                                 │
│  Admin client `src/lib/supabase-admin.ts` + `src/lib/crypto/secret-box.ts`│
│  Provider `src/lib/providers/whatsapp/{webhook,cloud-api}.ts`             │
└───────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root layout | HTML shell, dark class, global CSS, wrap all pages in `AppShell` | `src/app/layout.tsx` |
| App shell | Mounts `AppProvider` around every route | `src/components/app-shell.tsx` |
| App context | Session, client mapping, visible tabs, sign-in/out | `src/contexts/app-context.tsx` |
| Home route | Redirects authenticated users to `/dashboard`, others to `/login` | `src/app/page.tsx` |
| Login route | Renders `LoginForm` (`force-dynamic`) | `src/app/login/page.tsx` |
| Dashboard routes | Thin wrappers that render `DashboardPage` | `src/app/dashboard/page.tsx`, `src/app/dashboard/[tab]/page.tsx` |
| Dashboard page | Module chrome, URL/tab sync, gated tab rendering | `src/components/dashboard/dashboard-page.tsx` |
| Module navigation | Top modules (AI Analytics, CRM, POS, LEADS, HRM) and sidebar item kinds | `src/lib/module-navigation.ts` |
| Tab access | Load and normalize `client_tab_access` → `TabDefinition[]` | `src/lib/tabs.ts` |
| Tab routes | Canonical `/dashboard/{key}` paths including coming-soon keys | `src/lib/dashboard-tab-routes.ts` |
| Anon Supabase | Browser singleton, auth persistence, error formatting | `src/lib/supabase.ts` |
| Admin Supabase | Service-role client; server-only | `src/lib/supabase-admin.ts` |
| Request auth | Bearer token → user + `client_id` for API routes | `src/lib/server/request-auth.ts` |
| Domain queries | Client-scoped CRUD against PostgREST | `src/lib/billing-queries.ts`, `src/lib/inventory-queries.ts`, `src/lib/appointment-queries.ts`, `src/lib/consultation-queries.ts`, `src/lib/promotion-queries.ts`, `src/lib/communication-queries.ts` |
| Order service | POS cart + `createOrder` RPC | `src/lib/orderService.ts` |
| WhatsApp webhook | Signature, inbound insert, auto-reply send | `src/lib/providers/whatsapp/webhook.ts` |
| Cloud API | Graph API text send | `src/lib/providers/whatsapp/cloud-api.ts` |

## Pattern Overview

**Overall:** Client-scoped CRM SPA on Next.js App Router, with a thin server layer for secrets and inbound WhatsApp.

**Key Characteristics:**
- Multi-tenant isolation via `clients.crm_user_id` → `clientId`; every domain query filters by that id.
- Feature visibility is data-driven (`client_tab_access` + `tabs_info`), then filtered again by hardcoded module catalogs in `src/lib/module-navigation.ts`.
- Browser talks to Supabase directly with the anon key (RLS). Route handlers exist only where the browser must not hold secrets (WhatsApp credentials, Meta webhook).
- Dashboard is one client component that dynamically imports tab modules; App Router pages do not own feature UI.

## Layers

**App Router (routes):**
- Purpose: URL entry points and API handlers; almost no UI logic.
- Location: `src/app/`
- Contains: `layout.tsx`, `page.tsx`, `login/page.tsx`, `dashboard/page.tsx`, `dashboard/[tab]/page.tsx`, `api/communication/whatsapp/*/route.ts`, `globals.css`
- Depends on: `src/components/*`, `src/lib/providers/*`, `src/lib/server/*`
- Used by: Next.js runtime

**Presentation:**
- Purpose: Screens, chrome, and feature tabs.
- Location: `src/components/`
- Contains: `app-shell.tsx`, `login-form.tsx`, `ui/*`, `dashboard/*` (shell, sidebar, tabs, billing widgets)
- Depends on: `src/contexts/app-context.tsx`, `src/hooks/*`, `src/lib/*`
- Used by: `src/app/*` pages

**Application state (React):**
- Purpose: Auth session, mapped `clientId`, permitted tabs, active tab id.
- Location: `src/contexts/app-context.tsx`
- Contains: `AppProvider`, `useApp`, `useAuth`, `useClient`
- Depends on: `src/lib/supabase.ts`, `src/lib/client-cache.ts`, `src/lib/tabs.ts`
- Used by: login, dashboard, any client component that needs tenant context

**Hooks:**
- Purpose: Per-feature loading/saving/error state; pagination wrappers.
- Location: `src/hooks/`
- Contains: `use-{entity}.ts`, `use-paged-list.ts`, `use-persistent-state.ts`, `use-debounced-value.ts`
- Depends on: `src/lib/*-queries.ts` (or `/api` fetch for WhatsApp secrets)
- Used by: tab components

**Domain / data access:**
- Purpose: Map rows, enforce `client_id`, throw formatted errors.
- Location: `src/lib/`
- Contains: `*-queries.ts`, `*-types.ts`, `orderService.ts`, analytics helpers, navigation/tab config
- Depends on: `getSupabaseClient()` except admin/crypto/provider paths
- Used by: hooks and a few tabs (e.g. `src/components/dashboard/tabs/billing-tab.tsx` calls `orderService` directly)

**Server / provider:**
- Purpose: Encrypt secrets, impersonate or bypass user JWT for webhooks, call Meta Graph API.
- Location: `src/lib/server/`, `src/lib/supabase-admin.ts`, `src/lib/crypto/`, `src/lib/providers/`, `src/lib/communication-credentials.ts`
- Contains: Node `crypto`, service-role client, HMAC verification
- Depends on: env (`SUPABASE_SERVICE_ROLE_KEY`, `COMMUNICATION_ENCRYPTION_KEY`)
- Used by: `src/app/api/**` only — never import into `"use client"` modules

**Persistence:**
- Purpose: Postgres schema and RLS (applied in Supabase, not in this repo’s runtime).
- Location: `supabase/migrations/`
- Contains: SQL for WhatsApp credentials, auto-replies, customer contact fields
- Depends on: existing `clients` and related tables (not all migrations live in-repo)
- Used by: both anon and admin clients

## Data Flow

### Primary Request Path

1. Browser hits `/` (`src/app/page.tsx`). `useAuth()` waits for bootstrap.
2. `AppProvider` calls `getSupabaseClient().auth.getSession()` (`src/contexts/app-context.tsx`, `src/lib/supabase.ts`).
3. On user present, `getClientIdForAuthUser(user.id)` reads `clients` where `crm_user_id` matches (`src/lib/client-cache.ts`).
4. `getTabs(clientId)` reads `client_tab_access` joined to `tabs_info`, maps numeric DB keys to code keys, caches in-memory (`src/lib/tabs.ts`).
5. Home redirects to `/dashboard` or `/login`. Dashboard gate: no user → `/login`; no `clientId` → `ClientFallback` (`src/components/dashboard/dashboard-page.tsx`).
6. User picks a module/sidebar item. `navigateToKey` updates `activeTabId` and `router.push` to `getDashboardTabPath` (`src/lib/dashboard-tab-routes.ts`).
7. Tab component receives `clientId`, calls a hook, which calls `fetchX(clientId)` in `src/lib/*-queries.ts` via the anon client (RLS).
8. UI shows loading/error/empty via hook state and `DataState` (`src/components/dashboard/billing/data-state.tsx`).

### Authentication Path

1. `LoginForm` calls `signIn(email, password)` (`src/components/login-form.tsx`).
2. `supabase.auth.signInWithPassword` (`src/contexts/app-context.tsx`).
3. `onAuthStateChange` hydrates client + tabs; successful login navigates via `/` → `/dashboard`.
4. Sign-out clears session and client state, `router.replace("/login")`.
5. There is **no** `middleware.ts`; route protection is client-side only.

### POS checkout path

1. `BillingTab` mutates cart through `orderService` (`src/lib/orderService.ts`).
2. `validateInventory` then `createOrder` invoke Supabase RPCs / tables with `clientId`.
3. Orders/transactions hooks refresh lists; `use-transactions.ts` can fire browser notifications via `src/lib/order-notifications.ts`.

### WhatsApp inbound path

1. Meta GET `/api/communication/whatsapp/webhook` with hub challenge (`src/app/api/communication/whatsapp/webhook/route.ts`).
2. `verifyWhatsAppWebhookChallenge` hashes verify token and looks up client (`src/lib/providers/whatsapp/webhook.ts`, `src/lib/communication-credentials.ts`).
3. Meta POST with `X-Hub-Signature-256`; HMAC checked against per-phone `appSecret`.
4. New inbound rows insert into `communication_inbound_messages`; matching `communication_auto_replies` triggers `sendWhatsAppTextMessage` (`src/lib/providers/whatsapp/cloud-api.ts`).
5. Events land in `communication_message_events` via service role.

### WhatsApp credentials path

1. Tab hook `useWhatsAppAutoReplies` loads public connection via anon queries (`src/lib/communication-queries.ts`).
2. Saving secrets: `fetch("/api/communication/whatsapp/credentials")` with `Authorization: Bearer` session token (`src/hooks/use-whatsapp-auto-replies.ts`).
3. `getAuthenticatedRequestClient` binds JWT to anon client and resolves `client_id` (`src/lib/server/request-auth.ts`).
4. `saveWhatsAppCredentials` encrypts payload with AES-256-GCM (`src/lib/crypto/secret-box.ts`) and writes credential + provider account rows.

**State Management:**
- Global: React context (`AppProvider`) — session, `clientId`, tabs, `activeTabId`.
- Feature: local `useState` inside hooks; list pagination in `usePagedList`.
- Persistence: Supabase Auth storage; `localStorage` for last tab/module (`dashboard-page.tsx`) and `usePersistentState`.
- Module caches: `Map` in `src/lib/client-cache.ts` and `src/lib/tabs.ts` (process-lifetime, not invalidated across tabs except `forceRefresh`).

## Key Abstractions

**TabDefinition:**
- Purpose: Normalized, client-visible dashboard tab.
- Examples: `src/lib/types.ts`, produced by `src/lib/tabs.ts`
- Pattern: DB numeric keys (`001`…`014`) and aliases map to code keys (`customer`, `cafe-summary`, …)

**Module / nav item:**
- Purpose: Presentation catalog independent of DB tabs (`existing-tab` | `ai-insights` | `coming-soon`).
- Examples: `MODULES` in `src/lib/module-navigation.ts`
- Pattern: Sidebar is `getSidebarItemsForModule(moduleId, tabs)` — existing tabs hidden if not in `tabs`; coming-soon always shown

**Query module + types module:**
- Purpose: Keep PostgREST and row mapping out of JSX.
- Examples: `src/lib/billing-queries.ts` + `src/lib/billing-types.ts`; `src/lib/consultation-queries.ts` + `src/lib/consultation-types.ts`
- Pattern: `getClient()` → throw if missing env; `raise`/`formatSupabaseError` on PostgREST errors; always `.eq("client_id", clientId)`

**Paged list:**
- Purpose: Offset pagination with search reset.
- Examples: `src/lib/list-pagination.ts`, `src/hooks/use-paged-list.ts`, `src/components/ui/list-pagination-controls.tsx`
- Pattern: `fetchPage({ limit, offset })` returns `{ items, hasMore, totalCount }`

**DataState:**
- Purpose: Shared loading / error / empty chrome for lists.
- Examples: `src/components/dashboard/billing/data-state.tsx`
- Pattern: Render this first; return `null` when there is data so the parent table can render

**Provider adapter:**
- Purpose: Isolate Meta/WhatsApp from generic communication types.
- Examples: `src/lib/providers/whatsapp/cloud-api.ts`, `src/lib/providers/whatsapp/webhook.ts`
- Pattern: Generic tables + `src/lib/communication-types.ts`; provider folder holds Graph API and HMAC details

## Entry Points

**Next.js UI:**
- Location: `src/app/layout.tsx`
- Triggers: Every page render
- Responsibilities: Metadata, `AppShell` / `AppProvider`

**`/`:**
- Location: `src/app/page.tsx`
- Triggers: Direct visit or post-login `router.replace("/")`
- Responsibilities: Auth gate redirect

**`/login`:**
- Location: `src/app/login/page.tsx`
- Triggers: Unauthenticated users
- Responsibilities: Email/password form

**`/dashboard` and `/dashboard/[tab]`:**
- Location: `src/app/dashboard/page.tsx`, `src/app/dashboard/[tab]/page.tsx`
- Triggers: Authenticated navigation
- Responsibilities: Render `DashboardPage`; `[tab]` is a catch-all segment for both real tabs and coming-soon keys

**WhatsApp webhook:**
- Location: `src/app/api/communication/whatsapp/webhook/route.ts`
- Triggers: Meta Cloud API
- Responsibilities: Verify + process inbound messages (`runtime = "nodejs"`)

**WhatsApp credentials API:**
- Location: `src/app/api/communication/whatsapp/credentials/route.ts`
- Triggers: Signed-in CRM user saving Cloud API secrets
- Responsibilities: Authenticate JWT, encrypt and persist credentials

## Architectural Constraints

- **Threading:** Single-threaded Node for API routes (`export const runtime = "nodejs"` on WhatsApp routes). Browser is React 19 on the Next event loop; no worker threads.
- **Global state:** Module singletons — `supabaseClient` in `src/lib/supabase.ts`, `adminClient` in `src/lib/supabase-admin.ts`, `clientCache` in `src/lib/client-cache.ts`, `tabsCache` in `src/lib/tabs.ts`.
- **Circular imports:** Not a known cycle. Safe direction: `module-navigation.ts` → `tabs.ts` → `types.ts`; `dashboard-tab-routes.ts` → `tabs.ts` + `module-navigation.ts`. Do not import `dashboard-page.tsx` from `lib/`.
- **Client vs server boundary:** Never import `src/lib/supabase-admin.ts`, `src/lib/crypto/secret-box.ts`, or `src/lib/providers/whatsapp/webhook.ts` from `"use client"` files. Anon client (`src/lib/supabase.ts`) is shared.
- **Tenant scoping:** Pass `clientId` from `useClient()` into every query. Do not trust URL params as tenant id.
- **No Next middleware:** Adding server-side auth redirects requires a new `middleware.ts`; today only client effects guard routes.
- **Tab render contract:** Tabs are default-exported client components with `{ clientId: string }`. Register them in `dashboard-page.tsx` (dynamic import + boolean render). Also add keys to `DASHBOARD_TAB_ROUTES` and, if DB-backed, `DB_KEY_TO_CODE_KEY` / aliases in `src/lib/tabs.ts`.

## Anti-Patterns

### Querying Supabase inside a tab with no `*-queries` module

**What happens:** `src/components/dashboard/tabs/summary-tab.tsx` calls `getSupabaseClient()` and selects `clients` / tasks inline.
**Why it's wrong:** Other features keep mapping, errors, and `client_id` filters in `src/lib/*-queries.ts`, so summary cannot be reused or tested the same way.
**Do this instead:** Add `src/lib/profile-queries.ts` (or similar) and a `use-client-profile.ts` hook; keep the tab presentational like `src/components/dashboard/tabs/orders-tab.tsx`.

### Boolean tab switchboard growth

**What happens:** `src/components/dashboard/dashboard-page.tsx` chains `displayTabKey === "..."` and special-cases `comingSoonKey === "leads-automation"` / `"leads-contacts"`.
**Why it's wrong:** New screens require editing a 600-line shell; coming-soon catalog in `module-navigation.ts` diverges from real implementations.
**Do this instead:** A `Record<tabKey, Component>` (or registry next to `DASHBOARD_TAB_ROUTES`) plus `kind: "existing-tab"` for live LEADS screens. Keep `ComingSoonTab` only for keys without a component.

### Importing the service-role client into the browser bundle

**What happens:** Using `getSupabaseAdminClient` from a client component.
**Why it's wrong:** Service role bypasses RLS and would leak `SUPABASE_SERVICE_ROLE_KEY` if bundled.
**Do this instead:** Call a Route Handler. Pattern: `src/hooks/use-whatsapp-auto-replies.ts` → `src/app/api/communication/whatsapp/credentials/route.ts` → `src/lib/supabase-admin.ts` only on the server.

### Skipping `client_id` on writes

**What happens:** Inserts/updates that omit `.eq("client_id", clientId)` or payload `client_id`.
**Why it's wrong:** Cross-tenant leakage if RLS is incomplete; queries in `billing-queries.ts` / `consultation-queries.ts` always scope by client.
**Do this instead:** Copy the `getClient()` + `.eq("client_id", clientId)` pattern from `src/lib/communication-queries.ts`.

### Treating `coming-soon` as unimplemented when UI exists

**What happens:** LEADS Auto Replies and Contacts are `kind: "coming-soon"` in `src/lib/module-navigation.ts` but render real tabs in `dashboard-page.tsx`.
**Why it's wrong:** Planners think the feature is a stub; permission filtering via `client_tab_access` is skipped for those items.
**Do this instead:** When a screen is live, use `existing-tab` with a `tabKey` (and DB tab row) or a dedicated kind that still checks access.

## Error Handling

**Strategy:** Throw `Error` with `formatSupabaseError` in query modules; hooks catch and store `string | null` for UI. Auth uses `authError` / `clientError` on context. API routes map message substrings to HTTP 400/401/500.

**Patterns:**
- Query files: `raise(error, "Unable to load …")` wrapping `formatSupabaseError` (`src/lib/communication-queries.ts`, `src/lib/consultation-queries.ts`).
- Missing env: throw `"Missing Supabase environment variables."` from `getClient()` helpers.
- Dashboard: `ClientFallback` when mapping fails (`src/components/dashboard/dashboard-page.tsx`).
- Webhook: `console.error("[whatsapp-webhook] …")` then 401/403/500 (`src/app/api/communication/whatsapp/webhook/route.ts`). Prefer 500 so Meta retries transient failures.
- Network auth: `isNetworkAuthError` clears local session and sends user to login (`src/lib/supabase.ts`, `src/contexts/app-context.tsx`).

## Cross-Cutting Concerns

**Logging:** `console.error` on WhatsApp webhook/verify failures only. No structured logger or APM.

**Validation:** Client-side string trim and required-field throws in query/API helpers (`asTrimmed` in credentials route; trigger/response checks in `communication-queries.ts`). HMAC + hashed verify token on webhook. Search strings sanitized in `buildIlikeOrFilter` (`src/lib/list-pagination.ts`).

**Authentication:** Supabase email/password in the browser. API user actions use Bearer JWT + `clients.crm_user_id`. Webhooks use Meta signature and hashed verify tokens, not the CRM user session.

---

*Architecture analysis: 2026-08-19*
