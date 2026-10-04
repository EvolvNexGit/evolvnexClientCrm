# Testing Patterns

**Analysis Date:** 2026-08-19

## Test Framework

**Runner:**
- Not detected. No `vitest`, `jest`, `playwright`, `@testing-library/*`, or `cypress` in `package.json`. No `vitest.config.*`, `jest.config.*`, or `playwright.config.*`.
- `package.json` scripts are `dev`, `build`, `start`, `lint`, `clean` only. There is no `test` / `test:watch` / `coverage` script.

**Assertion Library:**
- Not detected.

**Run Commands:**
```bash
# Not applicable — no test runner is installed.
npm run lint              # next lint (ESLint config/deps not present in package.json)
npm run build             # typecheck + Next production build (strict TypeScript)
```

Use `npm run build` as the current correctness gate (`typescript` `strict: true` in `tsconfig.json`). Do not invent a test command until a runner is added.

## Test File Organization

**Location:**
- Not detected. Zero `*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.spec.tsx` files. No `__tests__/`, `tests/`, or `e2e/` directories under the project root.

**Naming:**
- When adding tests, colocate next to the unit under test using kebab-case to match source:
  - `src/lib/list-pagination.ts` → `src/lib/list-pagination.test.ts`
  - `src/lib/crypto/secret-box.ts` → `src/lib/crypto/secret-box.test.ts`
  - `src/hooks/use-debounced-value.ts` → `src/hooks/use-debounced-value.test.ts`
- Route Handlers: `src/app/api/communication/whatsapp/webhook/route.test.ts` beside `route.ts`, or a dedicated `src/app/api/.../webhook.test.ts` that imports the handler.

**Structure:**
```
src/
  lib/
    list-pagination.ts
    list-pagination.test.ts      # add here
    crypto/
      secret-box.ts
      secret-box.test.ts
  hooks/
    use-customers.ts
    use-customers.test.ts
supabase/
  migrations/                    # no SQL test harness detected
```

Do not put tests under `graphify-out/` or `.next/`. `.gitignore` already ignores `coverage`.

## Test Structure

**Suite Organization:**
Not detected in-repo. When introducing a runner, group by exported function and behavior (happy path, missing env, Supabase `error` object, empty rows):

```typescript
import { describe, expect, it } from "vitest"; // example — not installed
import { sanitizeSearch, buildListRange } from "@/lib/list-pagination";

describe("sanitizeSearch", () => {
  it("returns undefined for blank input", () => {
    expect(sanitizeSearch("   ")).toBeUndefined();
  });

  it("trims non-empty search", () => {
    expect(sanitizeSearch("  ana  ")).toBe("ana");
  });
});
```

**Patterns:**
- Setup: none today. Prefer per-test setup over shared mutable module state (note `src/lib/client-cache.ts` uses a module-level `Map`, and `src/lib/supabase.ts` caches a singleton client).
- Teardown: reset module caches if tests import those files; otherwise tests will leak `clientId` mappings across cases.
- Assertion pattern: not established. Match TypeScript types from `*-types.ts` rather than snapshotting whole UI trees first.

## Mocking

**Framework:** Not detected.

**Patterns:**
No in-repo mocks. When testing query modules, mock `getSupabaseClient` from `@/lib/supabase` so tests never hit the network:

```typescript
// Prescriptive — not present in the repo
vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
  formatSupabaseError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));
```

Chainable query builder stub for PostgREST-style calls used in `src/lib/billing-queries.ts`:

```typescript
function mockQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  const self = () => query;
  for (const method of ["from", "select", "eq", "order", "range", "or", "in"]) {
    query[method] = self;
  }
  query.maybeSingle = async () => result;
  // thenable for await supabase.from()... 
  query.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return query;
}
```

**What to Mock:**
- `@/lib/supabase` `getSupabaseClient` / `getSupabaseConfigError`
- `fetch` for `src/hooks/use-whatsapp-auto-replies.ts` (`POST /api/communication/whatsapp/credentials`)
- `process.env.COMMUNICATION_ENCRYPTION_KEY` for `src/lib/crypto/secret-box.ts` (use a 64-char hex fixture in test env, never commit real keys)
- `src/lib/supabase-admin.ts` service-role client for webhook tests
- `crypto` timing: inject fixed IV only if the encrypt API is refactored; currently `randomBytes(12)` makes ciphertext non-deterministic — assert round-trip decrypt instead of snapshotting ciphertext

**What NOT to Mock:**
- Pure helpers: `src/lib/list-pagination.ts`, `src/lib/utils.ts` `cn()`, `src/lib/time-utils.ts`, `src/lib/communication-types.ts` `normalizeTriggerText`
- Type-only modules
- Tailwind / `cn()` class strings unless a component test asserts presence of a token

## Fixtures and Factories

**Test Data:**
Not detected. Build fixtures from existing types:

```typescript
import type { CustomerRecord } from "@/lib/billing-types";

export function makeCustomer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: "cust-1",
    name: "Ada Lovelace",
    phone: "+15555550100",
    email: null,
    dob: null,
    outreach_status: null,
    contact_tags: [],
    contact_source: null,
    last_activity_at: null,
    is_blocked: false,
    notes: null,
    assigned_to: null,
    created_at: "2026-08-01T00:00:00.000Z",
    totalOrders: 0,
    totalSpent: 0,
    ...overrides,
  };
}
```

**Location:**
- Colocate small factories in the test file.
- If reused across domains, add `src/lib/test-fixtures/` only after a runner exists — do not create that folder before tests land.

**SQL:**
- Migrations in `supabase/migrations/` have no automated apply/test. Manual verification against a Supabase project is the current practice. Do not embed production credentials in tests.

## Coverage

**Requirements:** None enforced. `coverage` is listed in `.gitignore` but no coverage tool is configured.

**View Coverage:**
```bash
# Not applicable until a runner with coverage is added
```

**Priority order if tests are introduced:**
1. Pure functions (`src/lib/list-pagination.ts`, `src/lib/crypto/secret-box.ts` round-trip, `normalizeTriggerText` in `src/lib/communication-types.ts`)
2. Webhook signature/challenge (`src/lib/providers/whatsapp/webhook.ts`)
3. Query error wrapping (`raise` in `src/lib/communication-queries.ts`)
4. Request auth (`src/lib/server/request-auth.ts`) — missing token, missing client row
5. Hooks (`usePagedList` stale-request ignore) with React Testing Library — last, because they need a DOM runner

## Test Types

**Unit Tests:**
- Not used. Highest value: pagination, crypto, trigger matching, `formatSupabaseError` / `isNetworkAuthError` in `src/lib/supabase.ts`.

**Integration Tests:**
- Not used. Query modules (`src/lib/billing-queries.ts`, `src/lib/consultation-queries.ts`) talk to Supabase directly. An integration suite would need a local/test project and env vars from `.env.example` names only (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Never read `.env` files in tests committed to git.

**E2E Tests:**
- Not used. No Playwright/Cypress. Manual UAT is implied by `npm run dev` in `README.md`.
- Browser-critical flows if E2E is added later: login (`src/components/login-form.tsx`), dashboard tab routes (`src/app/dashboard/[tab]/page.tsx`), contacts pagination (`src/components/dashboard/tabs/contacts-tab.tsx`), WhatsApp credentials POST (`src/app/api/communication/whatsapp/credentials/route.ts`).

**Typecheck as test substitute:**
- `tsc` via `next build` with `strict: true` is the only automated check besides (unconfigured) lint.
- `next.config.ts` sets `typedRoutes: true` — keep `href` values typed; broken routes fail the build.

## Common Patterns

**Async Testing:**
Not detected. Query and hook code is async. When writing tests, always `await` mutators (`addCustomer`, `refresh`) and assert `error` / `loading` transitions. For `usePagedList`, issue overlapping `loadInitial` calls and assert the stale `requestId` path does not clobber newer data (`src/hooks/use-paged-list.ts`).

**Error Testing:**
Not detected. Mirror production branches:
- `getSupabaseClient()` null → message `Missing Supabase environment variables.`
- PostgREST `error` set → thrown `Error` with `formatSupabaseError` fallback
- API: missing Bearer → `Missing access token.` (`src/lib/server/request-auth.ts`) mapped to 401 in `credentials/route.ts`
- Webhook: invalid `x-hub-signature-256` → 401 (`src/app/api/communication/whatsapp/webhook/route.ts`)
- Login: `Invalid login credentials` → UI `Invalid credentials` (`src/components/login-form.tsx`)

**UI component tests:**
Not detected. `DataState` (`src/components/dashboard/billing/data-state.tsx`) is the smallest presentational contract (loading / error / empty / null). Start component tests there before tab screens.

**CI:**
- No `.github/workflows` detected. Tests would not run in CI until a workflow is added. Do not assume GitHub Actions coverage.

**How to add a runner (when a phase requires tests):**
1. Add Vitest (unit) aligned with Vite/Next 15, or Jest if the team standardizes on it — neither is chosen yet.
2. Add `test` script in `package.json`.
3. Keep `"use client"` modules in hook/component tests with a JSDOM environment.
4. Do not test `src/app/globals.css` or Tailwind config.
5. Exclude `graphify-out/` from any test glob.

---

*Testing analysis: 2026-08-19*
