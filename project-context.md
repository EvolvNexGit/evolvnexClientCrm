# Project Context Map

This file is the human-readable companion to [project-context.json](project-context.json). It focuses on the highest-value entry points so future search can start from the right places.

## Regeneration

- Run `npm run context:regenerate` after major refactors.
- Run `npm run context:verify` in CI to enforce context integrity.
- Run `npm run context:check` in CI for one-step regenerate + verify.
- The generator updates node-level search hints in [project-context.json](project-context.json): exported symbols and key table names.
- The generator updates section freshness metadata (`sectionMetadata`) per section.
- `lastUpdated` now changes only when that specific section content changes.
- Each section stores a `contentHash` used for change detection.

## CI Verification

- `npm run context:verify` fails when `sectionMetadata` is missing or incomplete.
- It fails when any section `contentHash` is stale relative to the section content.
- It fails when any edge endpoint does not exist in either `entryPoints[].id` or `nodes[].id`.
- `npm run context:check` runs regeneration first, then strict verification.

## Entry Points

- [src/app/layout.tsx](src/app/layout.tsx) wraps the app in [AppShell](src/components/app-shell.tsx).
- [src/app/page.tsx](src/app/page.tsx) redirects based on auth state.
- [src/app/login/page.tsx](src/app/login/page.tsx) renders the login route.
- [src/app/dashboard/page.tsx](src/app/dashboard/page.tsx) mounts the dashboard shell.

## Core Flow

1. [src/components/app-shell.tsx](src/components/app-shell.tsx) mounts [AppProvider](src/contexts/app-context.tsx).
2. [src/contexts/app-context.tsx](src/contexts/app-context.tsx) loads Supabase session state, resolves `authId`, maps it to `clientId`, and loads tabs.
3. [src/lib/client-cache.ts](src/lib/client-cache.ts) maps auth users to clients.
4. [src/lib/tabs.ts](src/lib/tabs.ts) returns the visible tab list.
5. [src/components/dashboard/dashboard-page.tsx](src/components/dashboard/dashboard-page.tsx) renders the selected tab.

## Feature Areas

### Billing

- [src/components/dashboard/tabs/billing-tab.tsx](src/components/dashboard/tabs/billing-tab.tsx) handles billing workflow and order calculations through [src/lib/orderService.ts](src/lib/orderService.ts).
- [src/components/dashboard/tabs/billing-crm-tab.tsx](src/components/dashboard/tabs/billing-crm-tab.tsx) combines customers, products, and transactions.
- [src/hooks/use-customers.ts](src/hooks/use-customers.ts), [src/hooks/use-products.ts](src/hooks/use-products.ts), and [src/hooks/use-transactions.ts](src/hooks/use-transactions.ts) sit on top of [src/lib/billing-queries.ts](src/lib/billing-queries.ts).
- [src/lib/billing-types.ts](src/lib/billing-types.ts) defines the billing record and payload shapes.

### Inventory

- [src/hooks/use-ingredients.ts](src/hooks/use-ingredients.ts) and [src/hooks/use-recipes.ts](src/hooks/use-recipes.ts) sit on top of [src/lib/inventory-queries.ts](src/lib/inventory-queries.ts).
- [src/lib/inventory-types.ts](src/lib/inventory-types.ts) defines ingredient and recipe shapes.
- Recipes connect products to ingredients in the inventory model.

### Summary

- [src/components/dashboard/tabs/summary-tab.tsx](src/components/dashboard/tabs/summary-tab.tsx) reads client metadata and tasks directly from Supabase.
- It is the clearest example of a tab that bypasses the query-helper layer.

## Shared Modules

- [src/lib/supabase.ts](src/lib/supabase.ts) creates the Supabase client.
- [src/components/ui/button.tsx](src/components/ui/button.tsx) is the main shared UI primitive.
- [src/lib/types.ts](src/lib/types.ts) carries tab and client-related shared types.

## Dependency Notes

- `clientId` is the main scoping key across the app.
- Dashboard state is tab-driven, not route-driven.
- Billing uses hooks plus query helpers, while summary reads directly from Supabase.
- `src/lib/orderService.ts` is important to billing logic and should be treated as a first-class dependency when tracing checkout behavior.

## Search Starts

- Auth and client resolution: [src/contexts/app-context.tsx](src/contexts/app-context.tsx)
- Tab selection: [src/lib/tabs.ts](src/lib/tabs.ts)
- Dashboard rendering: [src/components/dashboard/dashboard-page.tsx](src/components/dashboard/dashboard-page.tsx)
- Billing flow: [src/components/dashboard/tabs/billing-tab.tsx](src/components/dashboard/tabs/billing-tab.tsx)
- Billing CRM flow: [src/components/dashboard/tabs/billing-crm-tab.tsx](src/components/dashboard/tabs/billing-crm-tab.tsx)
- Inventory flow: [src/lib/inventory-queries.ts](src/lib/inventory-queries.ts)

## Open Questions

- [src/lib/orderService.ts](src/lib/orderService.ts) should be verified if you want a complete billing graph.
- The appointments tab may still need a deeper backend review.
- The tab cache currently always returns the default tab list, so feature gating is not yet visible in the code.
