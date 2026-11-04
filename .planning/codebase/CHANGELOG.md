# Codebase Change Log (living blueprint)

Newest first. Each entry: what changed, files, contracts. Structural changes are also patched into STRUCTURE.md / ARCHITECTURE.md.

## 2026-11-04 — Sidebar labels driven by client_tab_access.display_name

**Problem:** Sidebar/drawer labels for existing tabs came from the static `MODULES` config ("Customers"), ignoring per-client names set in the DB (e.g. "Patients").

**Change:** `TabDefinition.customLabel` (src/lib/types.ts) is set in `normalizeTab` (src/lib/tabs.ts) from `client_tab_access.display_name` (null if empty). `getSidebarItemsForModule` (src/lib/module-navigation.ts) uses `customLabel ?? config.label` for `existing-tab` items. Static label remains the fallback only; no hardcoded patient naming. Specialty summary tabs still show "AI-Analytics".

**Files:** `src/lib/types.ts`, `src/lib/tabs.ts`, `src/lib/module-navigation.ts`

**Open:** Headings inside tab bodies (e.g. "customer" wording in forms, "Add customer") are still static copy; extend if the DB label should apply there too. Sidebar and mobile drawer share the resolved items, so both are covered.

## 2026-11-01 — Billing stock alerts + inventory unit safety

**Problem:** POS billing showed permanent red cards for stock issues; mixed units (l stock vs ml recipe) produced false "short by 190 l" because raw numbers were compared.

**Contracts introduced**
- `src/lib/inventory-units.ts` — unit families (weight g/kg, volume ml/l, count unit). Exports `INVENTORY_UNITS`, `getUnitFamily`, `areUnitsCompatible`, `getCompatibleUnits`, `convertQuantity` (null if incompatible), `convertQuantityRounded`, `describeUnitMismatch`. All unit logic must go through this module; no local `units` arrays.
- Recipe unit must be in the same family as the ingredient's stock unit. Enforced in UI (filtered dropdown) and in `inventory-queries.ts` (`createRecipe`/`updateRecipe` throw on mismatch).
- Ingredient unit may change only within its family when recipes use it (`updateIngredient` throws otherwise). `countRecipesForIngredient(clientId, ingredientId)` is exported.

**Behaviour changes**
- `orderService.validateInventory`: recipe qty converted to stock unit before comparing, aggregated per ingredient in stock unit. Incompatible units → one fix-recipe warning, no shortage maths. Message format: `Out of stock: X (short by N u)`, `Low stock: X (N u left)`. Checkout remains non-blocking.
- `billing-tab.tsx`: removed permanent warning cards and `isLowStock`/`isOutOfStock` state; new warnings (diffed vs previous cart) show via `StockAlertToast` (5s auto-dismiss, click to dismiss, max 3 lines + "+N more").
- `recipe-tab.tsx`: unit dropdown limited to ingredient's family; unit defaults to stock unit on ingredient pick; add-to-recipe blocked on mismatch; editing a legacy mismatched row resets unit to stock unit with a notice.
- `ingredient-tab.tsx`: when editing, unit change converts quantity+threshold within family; family change blocked (and options limited) when ingredient is used in recipes.

**Files**
- Added: `src/lib/inventory-units.ts`, `src/components/dashboard/billing/stock-alert-toast.tsx`
- Modified: `src/lib/orderService.ts`, `src/lib/inventory-queries.ts`, `src/components/dashboard/tabs/{billing,recipe,ingredient}-tab.tsx`

**Not done / open**
- DB RPC `create_order_with_inventory` is not in `supabase/migrations/`; unknown whether it converts units on stock deduction. Needs SQL review + migration (`convert_qty`, compat check).
- Legacy mismatched recipe rows are not yet badged in the Recipes list.
- `web-push` missing from local node_modules (tsc error, unrelated); run `npm install`.
