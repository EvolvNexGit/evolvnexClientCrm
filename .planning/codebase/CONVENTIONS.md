# Coding Conventions

**Analysis Date:** 2026-08-19

## Naming Patterns

**Files:**
- Use kebab-case for almost all TypeScript/React files: `use-customers.ts`, `billing-queries.ts`, `contacts-tab.tsx`, `secret-box.ts`.
- Pair a domain query module with a types module: `{domain}-queries.ts` + `{domain}-types.ts` (examples: `src/lib/billing-queries.ts` + `src/lib/billing-types.ts`, `src/lib/consultation-queries.ts` + `src/lib/consultation-types.ts`, `src/lib/communication-queries.ts` + `src/lib/communication-types.ts`).
- Dashboard screens live as `*-tab.tsx` under `src/components/dashboard/tabs/`.
- Next.js App Router pages are `page.tsx` / `layout.tsx`; Route Handlers are `route.ts` (see `src/app/api/communication/whatsapp/credentials/route.ts`).
- Exception: `src/lib/orderService.ts` is camelCase. Do not copy this; new lib modules stay kebab-case.
- SQL migrations: `supabase/migrations/YYYYMMDD_snake_description.sql` (example: `supabase/migrations/20260817_customer_contact_fields.sql`).

**Directories:**
- `src/app/` — App Router routes only.
- `src/components/` — UI; nest by area (`dashboard/`, `dashboard/tabs/`, `dashboard/billing/`, `ui/`).
- `src/hooks/` — client data/state hooks.
- `src/lib/` — Supabase queries, types, providers, crypto, pagination.
- `src/lib/providers/whatsapp/` — WhatsApp Cloud API and webhook parsing.
- `src/lib/server/` — request-scoped server helpers (`src/lib/server/request-auth.ts`).
- `src/contexts/` — React context providers.
- `src/lib/crypto/` — encryption helpers (`src/lib/crypto/secret-box.ts`).

**Functions:**
- Named exports, camelCase: `fetchCustomers`, `createCustomer`, `getAuthenticatedRequestClient`, `formatSupabaseError`.
- Query CRUD verbs: `fetch*` / `fetch*Page`, `create*`, `update*`, `delete*` / `remove*` in hooks (`src/hooks/use-customers.ts`).
- Row mappers: `mapCustomer`, `mapPatient`, `mapAutoReply` — private unless reused.
- Local helpers in query files: `getClient()`, `asNumber()`, `raise()` / `raiseQueryError()`.
- Hooks: `use{Name}` matching the file: `useCustomers` in `src/hooks/use-customers.ts`.
- Event handlers in components: `handleSubmit`, `handle*` (see `src/components/login-form.tsx`).

**Variables:**
- camelCase for JS locals and hook state: `clientId`, `setSaving`, `nextReplies`.
- SCREAMING_SNAKE for module constants: `LIST_PAGE_INITIAL` (`src/lib/list-pagination.ts`), `CONSULTATION_SELECT` (`src/lib/consultation-queries.ts`), `REQUEST_TIMEOUT_MS` (`src/contexts/app-context.tsx`).
- Catch bindings describe the failure: `fetchError`, `saveError`, `loadError` — not bare `e`.
- Env access: `process.env.NEXT_PUBLIC_SUPABASE_URL`, `process.env.COMMUNICATION_ENCRYPTION_KEY` — never hardcode secrets.

**Types:**
- PascalCase type aliases (no `interface` in domain types): `CustomerRecord`, `CustomerPayload`, `ConsultationQueueRow`.
- `*Record` = persisted/DB-shaped row (often snake_case fields matching Postgres).
- `*Payload` = write DTO from the UI (camelCase: `outreachStatus`, `contactTags` in `src/lib/billing-types.ts`).
- Union literals from `as const` arrays: `export const CONSULT_STATUSES = [...] as const` then `export type ConsultStatus = (typeof CONSULT_STATUSES)[number]` (`src/lib/consultation-types.ts`).
- Props types colocated in the component file: `type ButtonProps`, `type EntityModalProps`, `type DataStateProps`.
- Prefer `type X = { ... }` over `interface`. Use `Readonly<{ children: ReactNode }>` on layout props (`src/app/layout.tsx`).

**Database / JSON fields:**
- Postgres columns are snake_case. Keep those names on `*Record` types (`client_id`, `created_at`, `is_active`).
- UI/API payloads use camelCase. Map at the query boundary (`createCustomer` in `src/lib/billing-queries.ts`).
- Mixed records exist (`CustomerRecord` has both `contact_tags` and `totalOrders`). When adding fields, snake_case for columns and camelCase only for computed client fields.

## Code Style

**Formatting:**
- No Prettier or EditorConfig in the repo. Match surrounding files:
  - Double quotes
  - Semicolons
  - 2-space indent
  - Trailing commas on multiline argument/object lists
  - Max line width informal (~100–120); wrap long Tailwind `className` strings
- TypeScript: `strict: true`, `allowJs: false` (`tsconfig.json`). Do not add new `any` on mapped rows; prefer `Record<string, unknown>` as in `mapAutoReply` (`src/lib/communication-queries.ts`). Existing `row: any` in `src/lib/billing-queries.ts` and `src/lib/orderService.ts` is legacy — do not extend it.

**Linting:**
- Script: `npm run lint` → `next lint` (`package.json`).
- No `eslint.config.*`, `.eslintrc*`, `eslint`, or `eslint-config-next` in `package.json`. Treat lint as undeclared until those deps/config are added. Do not rely on eslint-disable comments (none exist).

**Client vs server:**
- Put `"use client";` as the first line of any file that uses hooks, events, or browser APIs (`src/hooks/*`, dashboard tabs, `src/contexts/app-context.tsx`).
- Keep query modules, types, and crypto server-safe (no `"use client"`) so both hooks and Route Handlers can import them.
- Route Handlers that need Node crypto set `export const runtime = "nodejs";` (`src/app/api/communication/whatsapp/webhook/route.ts`).
- Dashboard pages that must not be statically cached: `export const dynamic = "force-dynamic";` (`src/app/dashboard/[tab]/page.tsx`).

**Styling:**
- Tailwind utility classes on elements. Compose with `cn()` from `src/lib/utils.ts` (filter falsy strings; not `clsx`/`tailwind-merge`).
- Tokens from `tailwind.config.ts`: `bg-card`, `text-text`, `border-border`, `text-muted-foreground`, `bg-primary`, `shadow-soft`, `rounded-xl`.
- Do not introduce a new CSS-in-JS library. Global tokens live in `src/app/globals.css` (referenced by Tailwind `hsl(var(--...))`).

## Import Organization

**Order:**
1. `"use client";` when required
2. React / Next (`react`, `next/navigation`, `next/server`)
3. Third-party (`@supabase/supabase-js`, `lucide-react`)
4. `@/components/...`
5. `@/hooks/...`
6. `@/lib/...` (value imports, then `type` imports from the same module when split)
7. `@/contexts/...`

Example (`src/components/dashboard/tabs/contacts-tab.tsx`): React → lucide → `Button`/`DataState` → hooks → `billing-queries` → `billing-types` → `time-utils`.

**Path Aliases:**
- Always import app code via `@/` mapped to `src/` (`tsconfig.json` `paths`). Example: `import { cn } from "@/lib/utils"`.
- Never use long relative hops (`../../../lib/...`) from `src/`.

**Type imports:**
- Use `import type { X }` for types-only. Mixed value+type from one module is allowed: `import { BILL_ORDER_SOURCE_POS, type ProductRecord } from "@/lib/billing-types"`.

## Error Handling

**Patterns:**
- Missing env / client: `throw new Error("Missing Supabase environment variables.");` after `getSupabaseClient()` is null. Duplicate this check via a local `getClient()` in each query file (`src/lib/billing-queries.ts`, `src/lib/consultation-queries.ts`).
- Supabase `{ data, error }`: if `error`, either `throw error` (billing/order) or wrap with `formatSupabaseError` via `raise`/`raiseQueryError` (communication/consultation). Prefer wrapping with a user-facing fallback string for new query modules:
  ```typescript
  if (error) {
    throw new Error(formatSupabaseError(error, "Unable to load auto-replies."));
  }
  ```
- Hooks convert failures to `string | null` state:
  ```typescript
  } catch (fetchError) {
    setError(fetchError instanceof Error ? fetchError.message : "Unable to load customers.");
  }
  ```
  Prefer `formatSupabaseError(fetchError, "Unable to load …")` when the source is PostgREST (`src/hooks/use-whatsapp-auto-replies.ts`).
- Auth UI: `error instanceof Error` then map known messages (`Invalid login credentials` → `Invalid credentials` in `src/components/login-form.tsx`). Use `formatAuthErrorMessage` / `isNetworkAuthError` from `src/lib/supabase.ts` for session flows (`src/contexts/app-context.tsx`).
- API routes: wrap the handler in try/catch, return `NextResponse.json({ error: message }, { status })`. Map message substrings to 401/400/500 (`src/app/api/communication/whatsapp/credentials/route.ts`). Do not leak stack traces to the client.
- Webhooks: log with a `[whatsapp-webhook]` prefix via `console.error`, return generic status text/JSON (`src/app/api/communication/whatsapp/webhook/route.ts`). Always verify signature before parsing business logic.
- Context contract: `useApp` / `useAuth` throw `"useApp must be used within AppProvider"` if used outside `AppProvider` (`src/contexts/app-context.tsx`).
- Timeouts: race with `withTimeout` (10s) for auth/client bootstrap (`src/contexts/app-context.tsx`).
- Storage: swallow `localStorage` failures (`src/hooks/use-persistent-state.ts`).
- List loads: ignore stale responses by comparing `requestId` to `requestIdRef` (`src/hooks/use-paged-list.ts`).

**UI empty/error:**
- Use `DataState` (`src/components/dashboard/billing/data-state.tsx`) for loading / error / empty list copy. Pass `error: string | null` and a specific `emptyLabel`.

## Logging

**Framework:** `console` only. No Sentry, pino, or logger package.

**Patterns:**
- Use `console.error("[scope] message", error)` for server/webhook failures. Scope tags: `[whatsapp-webhook]`.
- Do not `console.log` in UI or query modules.
- Never log access tokens, encryption keys, or raw webhook secrets.

## Comments

**When to Comment:**
- Explain non-obvious control flow (stale-request guards, pagination caps) as in `src/hooks/use-paged-list.ts`.
- Document env/security constraints in short JSDoc (`src/lib/supabase.ts` `clearLocalSupabaseSession`, `src/lib/list-pagination.ts` `buildIlikeOrFilter`).
- Do not narrate obvious CRUD. Avoid emoji comments in new code (`src/components/ui/button.tsx` and `tailwind.config.ts` have existing emoji section markers — do not proliferate).

**JSDoc/TSDoc:**
- One-liners on exported helpers when behavior is subtle (`useDebouncedValue`, `usePagedList`). Skip boilerplate `@param` blocks.

## Function Design

**Size:**
- Keep Route Handlers thin: auth + parse + one lib call (`src/app/api/communication/whatsapp/credentials/route.ts`).
- Put PostgREST and mapping in `src/lib/*-queries.ts`. Large query files are acceptable; split a new domain into its own pair rather than growing unrelated modules.
- Tab components may be large (forms + tables). Extract tables/modals into `src/components/dashboard/billing/` when reused (`CustomerTable`, `EntityModal`).

**Parameters:**
- Domain functions take `clientId: string` first, then entity ids, then payload objects.
- Options objects for optional flags: `fetchProducts(clientId, options?: { includeInactive?: boolean })`.
- Pagination: `ListPageParams` / `ListPageResult<T>` from `src/lib/list-pagination.ts`. New paged fetches should return `{ items, hasMore, totalCount }`.

**Return Values:**
- Queries return typed arrays/objects or `Promise<void>` for updates.
- Hooks return a bag: data, `loading`, `saving`, `error`, `refresh`, mutators (`src/hooks/use-customers.ts`).
- Prefer `never` helper for throw wrappers: `function raise(...): never`.

## Module Design

**Exports:**
- Named exports for hooks, lib, and shared UI (`export function Button`, `export function useCustomers`).
- Default export for App Router pages and dashboard tab screens (`export default function ConsultationTab`). New reusable widgets use named exports.
- Config files (`next.config.ts`, `tailwind.config.ts`) use `export default`.

**Barrel Files:**
- None. Import the concrete file: `@/lib/billing-queries`, not `@/lib`.

**Client scoping:**
- Every data query filters `.eq("client_id", clientId)` (or equivalent). Resolve `clientId` from `getClientIdForAuthUser` / `useAuth().clientId`, never from the URL as a trust boundary.
- Server API: `getAuthenticatedRequestClient(authorizationHeader)` in `src/lib/server/request-auth.ts` — Bearer token, `getUser`, then `clients.crm_user_id`.

**Supabase client:**
- Browser: singleton `getSupabaseClient()` in `src/lib/supabase.ts`.
- Authenticated API: per-request `createClient` with `Authorization: Bearer` (`src/lib/server/request-auth.ts`).
- Admin/webhook: `src/lib/supabase-admin.ts` (service role) — only server-side.

**New feature checklist:**
1. Types in `src/lib/{domain}-types.ts`
2. Queries in `src/lib/{domain}-queries.ts` with `getClient()` + mapper
3. Hook in `src/hooks/use-{domain}.ts` (`"use client"`, loading/error/refresh)
4. Tab or widget under `src/components/dashboard/`
5. If a secret or Meta callback is needed: Route Handler under `src/app/api/` + `runtime = "nodejs"`

---

*Convention analysis: 2026-08-19*
