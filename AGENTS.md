<!-- gsd-project-start source:PROJECT.md -->

## Project

**EvolvNex Business Growth OS**

EvolvNex is a multi-tenant SaaS **Business Growth OS** for generic SMBs: one product where operators run CRM, talk to customers, and (later) POS, leads, HR, and ordering — not a pile of isolated tools. This repository is that OS, even though the current executable app is a client-scoped Next.js + Supabase CRM with WhatsApp as the first communication provider.

v1 keeps the existing CRM tabs working and ships a **Conversations / inbox** so staff can message customers on WhatsApp without leaking WhatsApp into the generic Communication architecture. Campaigns, segments, templates-as-a-product, automation, POS, LEADS, HRM, and AirMenu are later phases of the same OS.

**Core Value:** A tenant's people and conversations live in one isolated system — CRM context plus a working inbox — without mixing tenants, leaking secrets, or baking WhatsApp into the rest of the product.

### Constraints

- **Tech stack**: Next.js + React + TypeScript + Supabase/PostgreSQL — Constitution and existing repo
- **Security**: No service-role, provider secrets, webhook secrets, payment secrets, or private keys in frontend or git; never disable RLS to ship a feature
- **Tenancy**: Never authorize with client-supplied `tenant_id` / `client_id` alone
- **Architecture**: Do not create parallel services/tables/components; search existing first. Folder layout follows the current `src/` app — do not invent `utils/`/`helpers/` trees that fight STRUCTURE.md
- **Change discipline**: Smallest safe change; Constitution over convenience
- **Docs**: Material architecture/schema/provider/API changes must update matching documentation (or flag that numbered specs live outside the repo)
- **Verification**: Typecheck, lint/build, migration + RLS, tenant isolation, API failure paths, mobile, empty/error/loading — not screenshot-only

<!-- gsd-project-end -->

<!-- gsd-stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.9.3 - Application source under `src/` (`strict: true` in `tsconfig.json`; `target`/`lib` ES2020; JSX preserved for Next)
- SQL - Schema changes in `supabase/migrations/` (WhatsApp communication tables, customer outreach/contact fields)
- CSS - Global theme tokens and dark shell in `src/app/globals.css`; Tailwind utility classes in components
- JSON - `package.json`, `package-lock.json`, `tsconfig.json`, `.vscode/mcp.json`

## Runtime

- Node.js ^18.18.0 || ^19.8.0 || >= 20.0.0 (Next 15.5.15 engines in `package-lock.json`); README documents Node.js 18+
- Browser: React 19 client components (`"use client"`) for dashboard, auth, and data hooks
- Next.js Route Handlers for WhatsApp use `export const runtime = "nodejs"` in `src/app/api/communication/whatsapp/webhook/route.ts` and `src/app/api/communication/whatsapp/credentials/route.ts`
- npm (scripts and lockfile); README also mentions yarn as optional
- Lockfile: `package-lock.json` present (lockfileVersion 3)

## Frameworks

- Next.js 15.5.15 (range `^15.3.1` in `package.json`) - App Router under `src/app/` (`page.tsx`, `layout.tsx`, `dashboard/`, `login/`, `api/`)
- React 19.2.5 / react-dom matching - UI tree; path alias `@/*` → `src/*` in `tsconfig.json`
- Tailwind CSS 3.4.19 - Utility styling; theme extension in `tailwind.config.ts` maps to CSS variables in `src/app/globals.css`
- PostCSS + Autoprefixer - `postcss.config.mjs`
- Not detected - no test runner in `package.json`, no `*.test.*` / `*.spec.*` files
- `next dev` / `next build` / `next start` - `package.json` scripts
- `next lint` - script present; ESLint config and `eslint` package not declared in `package.json`
- `npm run clean` - deletes `.next` via Node `fs.rmSync`
- TypeScript compiler (`noEmit: true`) for typecheck via Next plugin in `tsconfig.json`
- `next.config.ts` enables `typedRoutes: true`

## Key Dependencies

- `@supabase/supabase-js` 2.103.0 - Auth, Postgres REST, and Realtime (`src/lib/supabase.ts`, `src/lib/supabase-admin.ts`, query modules)
- `next` 15.5.15 - SSR/RSC, routing, Route Handlers
- `react` / `react-dom` 19.2.5 - Component model
- `lucide-react` ^0.511.0 - Icons (`src/lib/module-navigation.ts`, login and dashboard tabs)
- `recharts` 3.10.1 - Charts on summary/analytics tabs
- Node built-in `crypto` - AES-256-GCM secret boxing (`src/lib/crypto/secret-box.ts`) and HMAC webhook verification (`src/lib/providers/whatsapp/webhook.ts`)
- `@types/node` ^22.15.3, `@types/react`, `@types/react-dom` - Dev typings

## Configuration

- Next.js loads env from `.env.local` (documented in `README.md` and `src/lib/supabase.ts` error copy)
- Template: `.env.example` (names only). A `.env` file is present at repo root — treat as secrets; do not commit values
- Required for browser client: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/lib/supabase.ts`)
- Server-only: `SUPABASE_SERVICE_ROLE_KEY` (`src/lib/supabase-admin.ts`), `COMMUNICATION_ENCRYPTION_KEY` (`src/lib/crypto/secret-box.ts`), optional `WHATSAPP_API_VERSION` default `v21.0` (`src/lib/providers/whatsapp/cloud-api.ts`)
- Gitignore: `.env`, `.env.local`, `.env.development.local`, `.env.production.local` in `.gitignore`
- `next.config.ts` - typed routes only; no custom webpack/image domains
- `tsconfig.json` - bundler module resolution, `@/*` alias
- `tailwind.config.ts` - content globs `./src/**/*.{ts,tsx}` (also unused `./app` and `./components` at repo root)
- No `.nvmrc`, no `engines` field in `package.json`

## Platform Requirements

- Node.js 18.18+ (prefer 20+) and npm
- Copy `.env.example` → `.env.local` with a live or local Supabase project (`README.md`)
- `npm install` then `npm run dev` → `http://localhost:3000`
- Optional Cursor MCP: `.vscode/mcp.json` points at official Supabase MCP (editor-only, not an app runtime)
- `next build` + `next start` (Node server). No `Dockerfile`, `vercel.json`, or CI workflow detected
- Host must inject the env vars above; webhook route needs a public HTTPS URL for Meta
- Next engines imply Node 18.18+ / 20+ on the host

<!-- gsd-stack-end -->

<!-- gsd-conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Use kebab-case for almost all TypeScript/React files: `use-customers.ts`, `billing-queries.ts`, `contacts-tab.tsx`, `secret-box.ts`.
- Pair a domain query module with a types module: `{domain}-queries.ts` + `{domain}-types.ts` (examples: `src/lib/billing-queries.ts` + `src/lib/billing-types.ts`, `src/lib/consultation-queries.ts` + `src/lib/consultation-types.ts`, `src/lib/communication-queries.ts` + `src/lib/communication-types.ts`).
- Dashboard screens live as `*-tab.tsx` under `src/components/dashboard/tabs/`.
- Next.js App Router pages are `page.tsx` / `layout.tsx`; Route Handlers are `route.ts` (see `src/app/api/communication/whatsapp/credentials/route.ts`).
- Exception: `src/lib/orderService.ts` is camelCase. Do not copy this; new lib modules stay kebab-case.
- SQL migrations: `supabase/migrations/YYYYMMDD_snake_description.sql` (example: `supabase/migrations/20260817_customer_contact_fields.sql`).
- `src/app/` — App Router routes only.
- `src/components/` — UI; nest by area (`dashboard/`, `dashboard/tabs/`, `dashboard/billing/`, `ui/`).
- `src/hooks/` — client data/state hooks.
- `src/lib/` — Supabase queries, types, providers, crypto, pagination.
- `src/lib/providers/whatsapp/` — WhatsApp Cloud API and webhook parsing.
- `src/lib/server/` — request-scoped server helpers (`src/lib/server/request-auth.ts`).
- `src/contexts/` — React context providers.
- `src/lib/crypto/` — encryption helpers (`src/lib/crypto/secret-box.ts`).
- Named exports, camelCase: `fetchCustomers`, `createCustomer`, `getAuthenticatedRequestClient`, `formatSupabaseError`.
- Query CRUD verbs: `fetch*` / `fetch*Page`, `create*`, `update*`, `delete*` / `remove*` in hooks (`src/hooks/use-customers.ts`).
- Row mappers: `mapCustomer`, `mapPatient`, `mapAutoReply` — private unless reused.
- Local helpers in query files: `getClient()`, `asNumber()`, `raise()` / `raiseQueryError()`.
- Hooks: `use{Name}` matching the file: `useCustomers` in `src/hooks/use-customers.ts`.
- Event handlers in components: `handleSubmit`, `handle*` (see `src/components/login-form.tsx`).
- camelCase for JS locals and hook state: `clientId`, `setSaving`, `nextReplies`.
- SCREAMING_SNAKE for module constants: `LIST_PAGE_INITIAL` (`src/lib/list-pagination.ts`), `CONSULTATION_SELECT` (`src/lib/consultation-queries.ts`), `REQUEST_TIMEOUT_MS` (`src/contexts/app-context.tsx`).
- Catch bindings describe the failure: `fetchError`, `saveError`, `loadError` — not bare `e`.
- Env access: `process.env.NEXT_PUBLIC_SUPABASE_URL`, `process.env.COMMUNICATION_ENCRYPTION_KEY` — never hardcode secrets.
- PascalCase type aliases (no `interface` in domain types): `CustomerRecord`, `CustomerPayload`, `ConsultationQueueRow`.
- `*Record` = persisted/DB-shaped row (often snake_case fields matching Postgres).
- `*Payload` = write DTO from the UI (camelCase: `outreachStatus`, `contactTags` in `src/lib/billing-types.ts`).
- Union literals from `as const` arrays: `export const CONSULT_STATUSES = [...] as const` then `export type ConsultStatus = (typeof CONSULT_STATUSES)[number]` (`src/lib/consultation-types.ts`).
- Props types colocated in the component file: `type ButtonProps`, `type EntityModalProps`, `type DataStateProps`.
- Prefer `type X = { ... }` over `interface`. Use `Readonly<{ children: ReactNode }>` on layout props (`src/app/layout.tsx`).
- Postgres columns are snake_case. Keep those names on `*Record` types (`client_id`, `created_at`, `is_active`).
- UI/API payloads use camelCase. Map at the query boundary (`createCustomer` in `src/lib/billing-queries.ts`).
- Mixed records exist (`CustomerRecord` has both `contact_tags` and `totalOrders`). When adding fields, snake_case for columns and camelCase only for computed client fields.

## Code Style

- No Prettier or EditorConfig in the repo. Match surrounding files:
- TypeScript: `strict: true`, `allowJs: false` (`tsconfig.json`). Do not add new `any` on mapped rows; prefer `Record<string, unknown>` as in `mapAutoReply` (`src/lib/communication-queries.ts`). Existing `row: any` in `src/lib/billing-queries.ts` and `src/lib/orderService.ts` is legacy — do not extend it.
- Script: `npm run lint` → `next lint` (`package.json`).
- No `eslint.config.*`, `.eslintrc*`, `eslint`, or `eslint-config-next` in `package.json`. Treat lint as undeclared until those deps/config are added. Do not rely on eslint-disable comments (none exist).
- Put `"use client";` as the first line of any file that uses hooks, events, or browser APIs (`src/hooks/*`, dashboard tabs, `src/contexts/app-context.tsx`).
- Keep query modules, types, and crypto server-safe (no `"use client"`) so both hooks and Route Handlers can import them.
- Route Handlers that need Node crypto set `export const runtime = "nodejs";` (`src/app/api/communication/whatsapp/webhook/route.ts`).
- Dashboard pages that must not be statically cached: `export const dynamic = "force-dynamic";` (`src/app/dashboard/[tab]/page.tsx`).
- Tailwind utility classes on elements. Compose with `cn()` from `src/lib/utils.ts` (filter falsy strings; not `clsx`/`tailwind-merge`).
- Tokens from `tailwind.config.ts`: `bg-card`, `text-text`, `border-border`, `text-muted-foreground`, `bg-primary`, `shadow-soft`, `rounded-xl`.
- Do not introduce a new CSS-in-JS library. Global tokens live in `src/app/globals.css` (referenced by Tailwind `hsl(var(--...))`).

## Import Organization

- Always import app code via `@/` mapped to `src/` (`tsconfig.json` `paths`). Example: `import { cn } from "@/lib/utils"`.
- Never use long relative hops (`../../../lib/...`) from `src/`.
- Use `import type { X }` for types-only. Mixed value+type from one module is allowed: `import { BILL_ORDER_SOURCE_POS, type ProductRecord } from "@/lib/billing-types"`.

## Error Handling

- Missing env / client: `throw new Error("Missing Supabase environment variables.");` after `getSupabaseClient()` is null. Duplicate this check via a local `getClient()` in each query file (`src/lib/billing-queries.ts`, `src/lib/consultation-queries.ts`).
- Supabase `{ data, error }`: if `error`, either `throw error` (billing/order) or wrap with `formatSupabaseError` via `raise`/`raiseQueryError` (communication/consultation). Prefer wrapping with a user-facing fallback string for new query modules:
- Hooks convert failures to `string | null` state:
- Auth UI: `error instanceof Error` then map known messages (`Invalid login credentials` → `Invalid credentials` in `src/components/login-form.tsx`). Use `formatAuthErrorMessage` / `isNetworkAuthError` from `src/lib/supabase.ts` for session flows (`src/contexts/app-context.tsx`).
- API routes: wrap the handler in try/catch, return `NextResponse.json({ error: message }, { status })`. Map message substrings to 401/400/500 (`src/app/api/communication/whatsapp/credentials/route.ts`). Do not leak stack traces to the client.
- Webhooks: log with a `[whatsapp-webhook]` prefix via `console.error`, return generic status text/JSON (`src/app/api/communication/whatsapp/webhook/route.ts`). Always verify signature before parsing business logic.
- Context contract: `useApp` / `useAuth` throw `"useApp must be used within AppProvider"` if used outside `AppProvider` (`src/contexts/app-context.tsx`).
- Timeouts: race with `withTimeout` (10s) for auth/client bootstrap (`src/contexts/app-context.tsx`).
- Storage: swallow `localStorage` failures (`src/hooks/use-persistent-state.ts`).
- List loads: ignore stale responses by comparing `requestId` to `requestIdRef` (`src/hooks/use-paged-list.ts`).
- Use `DataState` (`src/components/dashboard/billing/data-state.tsx`) for loading / error / empty list copy. Pass `error: string | null` and a specific `emptyLabel`.

## Logging

- Use `console.error("[scope] message", error)` for server/webhook failures. Scope tags: `[whatsapp-webhook]`.
- Do not `console.log` in UI or query modules.
- Never log access tokens, encryption keys, or raw webhook secrets.

## Comments

- Explain non-obvious control flow (stale-request guards, pagination caps) as in `src/hooks/use-paged-list.ts`.
- Document env/security constraints in short JSDoc (`src/lib/supabase.ts` `clearLocalSupabaseSession`, `src/lib/list-pagination.ts` `buildIlikeOrFilter`).
- Do not narrate obvious CRUD. Avoid emoji comments in new code (`src/components/ui/button.tsx` and `tailwind.config.ts` have existing emoji section markers — do not proliferate).
- One-liners on exported helpers when behavior is subtle (`useDebouncedValue`, `usePagedList`). Skip boilerplate `@param` blocks.

## Function Design

- Keep Route Handlers thin: auth + parse + one lib call (`src/app/api/communication/whatsapp/credentials/route.ts`).
- Put PostgREST and mapping in `src/lib/*-queries.ts`. Large query files are acceptable; split a new domain into its own pair rather than growing unrelated modules.
- Tab components may be large (forms + tables). Extract tables/modals into `src/components/dashboard/billing/` when reused (`CustomerTable`, `EntityModal`).
- Domain functions take `clientId: string` first, then entity ids, then payload objects.
- Options objects for optional flags: `fetchProducts(clientId, options?: { includeInactive?: boolean })`.
- Pagination: `ListPageParams` / `ListPageResult<T>` from `src/lib/list-pagination.ts`. New paged fetches should return `{ items, hasMore, totalCount }`.
- Queries return typed arrays/objects or `Promise<void>` for updates.
- Hooks return a bag: data, `loading`, `saving`, `error`, `refresh`, mutators (`src/hooks/use-customers.ts`).
- Prefer `never` helper for throw wrappers: `function raise(...): never`.

## Module Design

- Named exports for hooks, lib, and shared UI (`export function Button`, `export function useCustomers`).
- Default export for App Router pages and dashboard tab screens (`export default function ConsultationTab`). New reusable widgets use named exports.
- Config files (`next.config.ts`, `tailwind.config.ts`) use `export default`.
- None. Import the concrete file: `@/lib/billing-queries`, not `@/lib`.
- Every data query filters `.eq("client_id", clientId)` (or equivalent). Resolve `clientId` from `getClientIdForAuthUser` / `useAuth().clientId`, never from the URL as a trust boundary.
- Server API: `getAuthenticatedRequestClient(authorizationHeader)` in `src/lib/server/request-auth.ts` — Bearer token, `getUser`, then `clients.crm_user_id`.
- Browser: singleton `getSupabaseClient()` in `src/lib/supabase.ts`.
- Authenticated API: per-request `createClient` with `Authorization: Bearer` (`src/lib/server/request-auth.ts`).
- Admin/webhook: `src/lib/supabase-admin.ts` (service role) — only server-side.

<!-- gsd-conventions-end -->

<!-- gsd-architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- Multi-tenant isolation via `clients.crm_user_id` → `clientId`; every domain query filters by that id.
- Feature visibility is data-driven (`client_tab_access` + `tabs_info`), then filtered again by hardcoded module catalogs in `src/lib/module-navigation.ts`.
- Browser talks to Supabase directly with the anon key (RLS). Route handlers exist only where the browser must not hold secrets (WhatsApp credentials, Meta webhook).
- Dashboard is one client component that dynamically imports tab modules; App Router pages do not own feature UI.

## Layers

- Purpose: URL entry points and API handlers; almost no UI logic.
- Location: `src/app/`
- Contains: `layout.tsx`, `page.tsx`, `login/page.tsx`, `dashboard/page.tsx`, `dashboard/[tab]/page.tsx`, `api/communication/whatsapp/*/route.ts`, `globals.css`
- Depends on: `src/components/*`, `src/lib/providers/*`, `src/lib/server/*`
- Used by: Next.js runtime
- Purpose: Screens, chrome, and feature tabs.
- Location: `src/components/`
- Contains: `app-shell.tsx`, `login-form.tsx`, `ui/*`, `dashboard/*` (shell, sidebar, tabs, billing widgets)
- Depends on: `src/contexts/app-context.tsx`, `src/hooks/*`, `src/lib/*`
- Used by: `src/app/*` pages
- Purpose: Auth session, mapped `clientId`, permitted tabs, active tab id.
- Location: `src/contexts/app-context.tsx`
- Contains: `AppProvider`, `useApp`, `useAuth`, `useClient`
- Depends on: `src/lib/supabase.ts`, `src/lib/client-cache.ts`, `src/lib/tabs.ts`
- Used by: login, dashboard, any client component that needs tenant context
- Purpose: Per-feature loading/saving/error state; pagination wrappers.
- Location: `src/hooks/`
- Contains: `use-{entity}.ts`, `use-paged-list.ts`, `use-persistent-state.ts`, `use-debounced-value.ts`
- Depends on: `src/lib/*-queries.ts` (or `/api` fetch for WhatsApp secrets)
- Used by: tab components
- Purpose: Map rows, enforce `client_id`, throw formatted errors.
- Location: `src/lib/`
- Contains: `*-queries.ts`, `*-types.ts`, `orderService.ts`, analytics helpers, navigation/tab config
- Depends on: `getSupabaseClient()` except admin/crypto/provider paths
- Used by: hooks and a few tabs (e.g. `src/components/dashboard/tabs/billing-tab.tsx` calls `orderService` directly)
- Purpose: Encrypt secrets, impersonate or bypass user JWT for webhooks, call Meta Graph API.
- Location: `src/lib/server/`, `src/lib/supabase-admin.ts`, `src/lib/crypto/`, `src/lib/providers/`, `src/lib/communication-credentials.ts`
- Contains: Node `crypto`, service-role client, HMAC verification
- Depends on: env (`SUPABASE_SERVICE_ROLE_KEY`, `COMMUNICATION_ENCRYPTION_KEY`)
- Used by: `src/app/api/**` only — never import into `"use client"` modules
- Purpose: Postgres schema and RLS (applied in Supabase, not in this repo’s runtime).
- Location: `supabase/migrations/`
- Contains: SQL for WhatsApp credentials, auto-replies, customer contact fields
- Depends on: existing `clients` and related tables (not all migrations live in-repo)
- Used by: both anon and admin clients

## Data Flow

### Primary Request Path

### Authentication Path

### POS checkout path

### WhatsApp inbound path

### WhatsApp credentials path

- Global: React context (`AppProvider`) — session, `clientId`, tabs, `activeTabId`.
- Feature: local `useState` inside hooks; list pagination in `usePagedList`.
- Persistence: Supabase Auth storage; `localStorage` for last tab/module (`dashboard-page.tsx`) and `usePersistentState`.
- Module caches: `Map` in `src/lib/client-cache.ts` and `src/lib/tabs.ts` (process-lifetime, not invalidated across tabs except `forceRefresh`).

## Key Abstractions

- Purpose: Normalized, client-visible dashboard tab.
- Examples: `src/lib/types.ts`, produced by `src/lib/tabs.ts`
- Pattern: DB numeric keys (`001`…`014`) and aliases map to code keys (`customer`, `cafe-summary`, …)
- Purpose: Presentation catalog independent of DB tabs (`existing-tab` | `ai-insights` | `coming-soon`).
- Examples: `MODULES` in `src/lib/module-navigation.ts`
- Pattern: Sidebar is `getSidebarItemsForModule(moduleId, tabs)` — existing tabs hidden if not in `tabs`; coming-soon always shown
- Purpose: Keep PostgREST and row mapping out of JSX.
- Examples: `src/lib/billing-queries.ts` + `src/lib/billing-types.ts`; `src/lib/consultation-queries.ts` + `src/lib/consultation-types.ts`
- Pattern: `getClient()` → throw if missing env; `raise`/`formatSupabaseError` on PostgREST errors; always `.eq("client_id", clientId)`
- Purpose: Offset pagination with search reset.
- Examples: `src/lib/list-pagination.ts`, `src/hooks/use-paged-list.ts`, `src/components/ui/list-pagination-controls.tsx`
- Pattern: `fetchPage({ limit, offset })` returns `{ items, hasMore, totalCount }`
- Purpose: Shared loading / error / empty chrome for lists.
- Examples: `src/components/dashboard/billing/data-state.tsx`
- Pattern: Render this first; return `null` when there is data so the parent table can render
- Purpose: Isolate Meta/WhatsApp from generic communication types.
- Examples: `src/lib/providers/whatsapp/cloud-api.ts`, `src/lib/providers/whatsapp/webhook.ts`
- Pattern: Generic tables + `src/lib/communication-types.ts`; provider folder holds Graph API and HMAC details

## Entry Points

- Location: `src/app/layout.tsx`
- Triggers: Every page render
- Responsibilities: Metadata, `AppShell` / `AppProvider`
- Location: `src/app/page.tsx`
- Triggers: Direct visit or post-login `router.replace("/")`
- Responsibilities: Auth gate redirect
- Location: `src/app/login/page.tsx`
- Triggers: Unauthenticated users
- Responsibilities: Email/password form
- Location: `src/app/dashboard/page.tsx`, `src/app/dashboard/[tab]/page.tsx`
- Triggers: Authenticated navigation
- Responsibilities: Render `DashboardPage`; `[tab]` is a catch-all segment for both real tabs and coming-soon keys
- Location: `src/app/api/communication/whatsapp/webhook/route.ts`
- Triggers: Meta Cloud API
- Responsibilities: Verify + process inbound messages (`runtime = "nodejs"`)
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

### Boolean tab switchboard growth

### Importing the service-role client into the browser bundle

### Skipping `client_id` on writes

### Treating `coming-soon` as unimplemented when UI exists

## Error Handling

- Query files: `raise(error, "Unable to load …")` wrapping `formatSupabaseError` (`src/lib/communication-queries.ts`, `src/lib/consultation-queries.ts`).
- Missing env: throw `"Missing Supabase environment variables."` from `getClient()` helpers.
- Dashboard: `ClientFallback` when mapping fails (`src/components/dashboard/dashboard-page.tsx`).
- Webhook: `console.error("[whatsapp-webhook] …")` then 401/403/500 (`src/app/api/communication/whatsapp/webhook/route.ts`). Prefer 500 so Meta retries transient failures.
- Network auth: `isNetworkAuthError` clears local session and sends user to login (`src/lib/supabase.ts`, `src/contexts/app-context.tsx`).

## Cross-Cutting Concerns

<!-- gsd-architecture-end -->

<!-- gsd-skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.cursor/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- gsd-skills-end -->

<!-- gsd-workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- gsd-workflow-end -->

<!-- gsd-profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- gsd-profile-end -->
