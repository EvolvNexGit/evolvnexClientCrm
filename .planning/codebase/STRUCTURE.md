# Codebase Structure

**Analysis Date:** 2026-08-19

## Directory Layout

```
evolvnexClientCrm/
├── src/
│   ├── app/                      # Next.js App Router (routes + API)
│   │   ├── api/communication/whatsapp/
│   │   │   ├── webhook/          # Meta inbound webhook
│   │   │   └── credentials/      # Save encrypted WhatsApp secrets
│   │   ├── dashboard/            # /dashboard and /dashboard/[tab]
│   │   ├── login/                # /login
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx              # / redirect gate
│   ├── components/
│   │   ├── ui/                   # Primitive widgets (button, pagination)
│   │   ├── dashboard/
│   │   │   ├── tabs/             # One file per dashboard screen
│   │   │   ├── billing/          # Shared POS/CRM list/modal widgets
│   │   │   ├── dashboard-page.tsx
│   │   │   ├── dynamic-sidebar.tsx
│   │   │   ├── top-navigation.tsx
│   │   │   ├── user-menu.tsx
│   │   │   └── coming-soon-tab.tsx
│   │   ├── app-shell.tsx
│   │   └── login-form.tsx
│   ├── contexts/                 # AppProvider (auth + tenant)
│   ├── hooks/                    # Feature hooks + list helpers
│   └── lib/
│       ├── providers/whatsapp/   # Cloud API + webhook processor
│       ├── server/               # Request JWT → client_id
│       ├── crypto/               # AES-GCM secret box
│       ├── *-queries.ts          # PostgREST access
│       ├── *-types.ts            # Domain types
│       └── navigation/tab helpers
├── supabase/migrations/          # Incremental SQL
├── public/                       # Static assets (if present)
├── graphify-out/                 # Generated graph artifacts (not app runtime)
├── .planning/                    # GSD docs (this map lives in codebase/)
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── tsconfig.json                 # `@/*` → `src/*`
├── package.json
├── .env.example                  # Public env names only
└── README.md
```

## Directory Purposes

**`src/app/`:**
- Purpose: Next.js file-based routes. Keep pages thin.
- Contains: `layout.tsx`, route `page.tsx` files, Route Handlers under `api/`, `globals.css`
- Key files: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/[tab]/page.tsx`, `src/app/api/communication/whatsapp/webhook/route.ts`, `src/app/api/communication/whatsapp/credentials/route.ts`

**`src/components/`:**
- Purpose: All React UI. No barrel `index.ts` files — import concrete paths.
- Contains: Shell, login, dashboard chrome, tabs, billing widgets, tiny `ui/` kit
- Key files: `src/components/app-shell.tsx`, `src/components/login-form.tsx`, `src/components/dashboard/dashboard-page.tsx`

**`src/components/dashboard/tabs/`:**
- Purpose: Feature screens. Default export, `"use client"`, props `{ clientId: string }` (CRM sub-tabs also take `activeSubTab` on `billing-crm-tab.tsx`).
- Contains: `summary-tab.tsx`, `cafe-summary-tab.tsx`, `doctor-summary-tab.tsx`, `appointments-tab.tsx`, `consultation-tab.tsx`, `subscription-tab.tsx`, `billing-tab.tsx`, `orders-tab.tsx`, `promos-tab.tsx`, `ingredient-tab.tsx`, `recipe-tab.tsx`, `customer-tab.tsx`, `product-tab.tsx`, `transaction-tab.tsx`, `billing-crm-tab.tsx`, `contacts-tab.tsx`, `whatsapp-auto-reply-tab.tsx`
- Key files: `src/components/dashboard/tabs/billing-tab.tsx` (POS), `src/components/dashboard/tabs/consultation-tab.tsx`

**`src/components/dashboard/billing/`:**
- Purpose: Reusable list/modal chrome used by POS and CRM lists (not billing-only despite the folder name).
- Contains: `data-state.tsx`, `entity-modal.tsx`, `customer-table.tsx`, `product-table.tsx`, `order-list.tsx`, `transaction-list.tsx`, `order-wait-badge.tsx`
- Key files: `src/components/dashboard/billing/data-state.tsx`, `src/components/dashboard/billing/entity-modal.tsx`

**`src/components/ui/`:**
- Purpose: Cross-app primitives.
- Contains: `button.tsx`, `list-pagination-controls.tsx`
- Key files: `src/components/ui/button.tsx`

**`src/contexts/`:**
- Purpose: Single global React context.
- Contains: `app-context.tsx` only
- Key files: `src/contexts/app-context.tsx`

**`src/hooks/`:**
- Purpose: Client-side data + UI persistence. One hook per domain aggregate, plus shared list utilities.
- Contains: `use-customers.ts`, `use-products.ts`, `use-orders.ts`, `use-transactions.ts`, `use-promotions.ts`, `use-ingredients.ts`, `use-recipes.ts`, `use-consultations.ts`, `use-cafe-summary.ts`, `use-doctor-summary.ts`, `use-whatsapp-auto-replies.ts`, `use-paged-list.ts`, `use-persistent-state.ts`, `use-debounced-value.ts`
- Key files: `src/hooks/use-paged-list.ts`, `src/hooks/use-whatsapp-auto-replies.ts`

**`src/lib/`:**
- Purpose: Types, queries, navigation, Supabase clients, analytics, providers.
- Contains: domain `*-queries.ts` / `*-types.ts`, `tabs.ts`, `module-navigation.ts`, `dashboard-tab-routes.ts`, `supabase.ts`, `supabase-admin.ts`, `orderService.ts`, `list-pagination.ts`, `client-cache.ts`, `utils.ts`, `time-utils.ts`
- Key files: `src/lib/tabs.ts`, `src/lib/module-navigation.ts`, `src/lib/billing-queries.ts`, `src/lib/supabase.ts`

**`src/lib/providers/`:**
- Purpose: Third-party adapters. Keep Graph API details here, not in tabs.
- Contains: `whatsapp/cloud-api.ts`, `whatsapp/webhook.ts`
- Key files: `src/lib/providers/whatsapp/cloud-api.ts`

**`src/lib/server/`:**
- Purpose: Code that must run only in Route Handlers / server modules.
- Contains: `request-auth.ts`
- Key files: `src/lib/server/request-auth.ts`

**`src/lib/crypto/`:**
- Purpose: Server-side encryption helpers.
- Contains: `secret-box.ts`
- Key files: `src/lib/crypto/secret-box.ts`

**`supabase/migrations/`:**
- Purpose: SQL applied to the hosted project (also runnable in SQL editor).
- Contains: `20260814_whatsapp_auto_replies.sql`, `20260817_customer_status_whatsapp_credentials.sql`, `20260817_customer_contact_fields.sql`
- Key files: `supabase/migrations/20260814_whatsapp_auto_replies.sql`

**`.planning/`:**
- Purpose: GSD planning and codebase maps.
- Contains: `codebase/ARCHITECTURE.md`, `codebase/STRUCTURE.md` (this file)
- Key files: `.planning/codebase/ARCHITECTURE.md`

**`graphify-out/`:**
- Purpose: Generated knowledge-graph HTML/JSON; not imported by the app.
- Contains: `graph.html`, `graph.json`, `cache/`
- Key files: `graphify-out/GRAPH_REPORT.md`

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root layout + `AppShell`
- `src/app/page.tsx`: Auth redirect
- `src/app/login/page.tsx`: Login
- `src/app/dashboard/page.tsx`: Dashboard home (AI Insights URL)
- `src/app/dashboard/[tab]/page.tsx`: All other dashboard URLs
- `src/app/api/communication/whatsapp/webhook/route.ts`: Meta webhook
- `src/app/api/communication/whatsapp/credentials/route.ts`: Save WhatsApp secrets

**Configuration:**
- `package.json`: Next 15, React 19, Supabase JS, Tailwind, Recharts
- `tsconfig.json`: `strict`, paths `@/*` → `src/*`
- `next.config.ts`: `typedRoutes: true`
- `tailwind.config.ts`: Design tokens / theme
- `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, comments for `COMMUNICATION_ENCRYPTION_KEY`, `WHATSAPP_API_VERSION`, `SUPABASE_SERVICE_ROLE_KEY`
- `.env` / `.env.local`: Present in local setups — never read or commit contents

**Core Logic:**
- `src/contexts/app-context.tsx`: Session + tenant bootstrap
- `src/lib/tabs.ts`: Tab access mapping
- `src/lib/module-navigation.ts`: Module catalog
- `src/lib/dashboard-tab-routes.ts`: Path helpers
- `src/components/dashboard/dashboard-page.tsx`: Shell + tab switchboard
- `src/lib/billing-queries.ts`: Customers, products, bills/orders
- `src/lib/orderService.ts`: POS cart and checkout
- `src/lib/consultation-queries.ts`: Consultations / queue
- `src/lib/communication-queries.ts`: Auto-replies (anon)
- `src/lib/communication-credentials.ts`: Encrypted credential I/O
- `src/lib/providers/whatsapp/webhook.ts`: Inbound auto-reply pipeline

**Testing:**
- Not detected — no `*.test.*` / `*.spec.*` and no test runner script in `package.json`. New tests should be added as `src/**/__tests__/` or colocated `*.test.ts` only after a runner is introduced.

## Naming Conventions

**Files:**
- React components: kebab-case + suffix describing role — `consultation-tab.tsx`, `order-list.tsx`, `login-form.tsx`
- Hooks: `use-{noun}.ts` — `use-customers.ts`, `use-paged-list.ts`
- Queries: `{domain}-queries.ts` — `billing-queries.ts`, `inventory-queries.ts`
- Types: `{domain}-types.ts` — `billing-types.ts`, `communication-types.ts`
- Exception: `src/lib/orderService.ts` uses camelCase (treat as the POS domain service; do not add more camelCase lib files)
- App Router: Next conventions — `page.tsx`, `layout.tsx`, `route.ts`, dynamic `[tab]`
- Migrations: `YYYYMMDD_snake_description.sql` under `supabase/migrations/`

**Directories:**
- kebab-case: `whatsapp-auto-reply-tab.tsx` lives in `tabs/`; API nested by domain `api/communication/whatsapp/`
- Providers: `src/lib/providers/{vendor}/`

**Symbols:**
- Components: PascalCase default exports for tabs (`export default function ConsultationTab`)
- Hooks: camelCase `useCustomers`
- Query functions: `fetchX`, `createX`, `updateX`, `deleteX` (see `src/lib/billing-queries.ts`)
- Types: PascalCase `CustomerRecord`, `TabDefinition`
- Tab **keys**: kebab or singular nouns matching `src/lib/tabs.ts` (`cafe-summary`, `customer`, `ingredients`)
- Path alias: `@/components/...`, `@/lib/...`, `@/hooks/...`, `@/contexts/...`

## Where to Add New Code

**New dashboard feature (DB-backed tab):**
- Types: `src/lib/{domain}-types.ts`
- Queries: `src/lib/{domain}-queries.ts` using `getSupabaseClient()` and `.eq("client_id", clientId)`
- Hook: `src/hooks/use-{domain}.ts` (`"use client"`)
- UI: `src/components/dashboard/tabs/{name}-tab.tsx` — `export default function …({ clientId }: { clientId: string })`
- Register dynamic import + render branch in `src/components/dashboard/dashboard-page.tsx`
- URL: add key to `DASHBOARD_TAB_ROUTES` in `src/lib/dashboard-tab-routes.ts`
- Nav: add `existing-tab` item with `tabKey` in `MODULES` (`src/lib/module-navigation.ts`)
- DB key mapping: `DB_KEY_TO_CODE_KEY` / aliases in `src/lib/tabs.ts` if the row uses a numeric or aliased key
- SQL: `supabase/migrations/YYYYMMDD_*.sql` when schema changes
- Tests: Not applicable until a runner exists

**New coming-soon nav stub:**
- Add `kind: "coming-soon"` + `pathKey` in `src/lib/module-navigation.ts`
- Add path in `src/lib/dashboard-tab-routes.ts`
- Shell already renders `ComingSoonTab` for unknown coming-soon keys

**New Route Handler (secrets, webhooks, RPCs the browser must not call):**
- `src/app/api/{domain}/{action}/route.ts` with `export const runtime = "nodejs"` when using Node `crypto`
- Auth users: `getAuthenticatedRequestClient` from `src/lib/server/request-auth.ts`
- Service role: `getSupabaseAdminClient` from `src/lib/supabase-admin.ts` only on the server
- Keep browser hook using `fetch` + Bearer token (pattern: `src/hooks/use-whatsapp-auto-replies.ts`)

**New WhatsApp / messaging provider function:**
- Implementation: `src/lib/providers/whatsapp/` (or `src/lib/providers/{name}/`)
- Shared types: `src/lib/communication-types.ts`
- Do not import Meta types into tab JSX

**New shared list UI:**
- Pagination math: `src/lib/list-pagination.ts`
- Hook: `src/hooks/use-paged-list.ts`
- Controls: `src/components/ui/list-pagination-controls.tsx`
- Empty/error: `src/components/dashboard/billing/data-state.tsx`

**New POS cart behavior:**
- Extend `src/lib/orderService.ts`; keep checkout UI in `src/components/dashboard/tabs/billing-tab.tsx`

**Utilities:**
- Class names: `cn` in `src/lib/utils.ts`
- Timezone labels: `src/lib/time-utils.ts`
- localStorage-backed UI state: `src/hooks/use-persistent-state.ts`

**Do not:**
- Put feature UI in `src/app/` beyond thin `page.tsx` wrappers
- Import `src/lib/supabase-admin.ts` or `src/lib/crypto/secret-box.ts` from `src/components` or `src/hooks`
- Add a `src/pages/` directory (App Router only)
- Follow the stale tree in `README.md` (`app/components`, `app/pages`) — the live tree is `src/`

## Special Directories

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (`.gitignore`)

**`node_modules/`:**
- Purpose: npm packages
- Generated: Yes
- Committed: No

**`graphify-out/`:**
- Purpose: Offline graphify HTML/JSON
- Generated: Yes (tooling)
- Committed: Present in the workspace; not part of the Next runtime

**`.planning/`:**
- Purpose: GSD artifacts and codebase maps
- Generated: Partially (agents write here)
- Committed: Per project GSD policy

**`supabase/migrations/`:**
- Purpose: Schema deltas
- Generated: No — author by hand
- Committed: Yes

**`.vscode/`:**
- Purpose: Editor / MCP settings
- Generated: No
- Committed: Present (`settings.json`, `mcp.json`)

---

*Structure analysis: 2026-08-19*
