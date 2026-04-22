# Graph Report - E:\projects\evolvnexClientCrm  (2026-04-23)

## Corpus Check
- 39 files · ~18,595 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 146 nodes · 159 edges · 33 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]

## God Nodes (most connected - your core abstractions)
1. `getClient()` - 11 edges
2. `getClient()` - 10 edges
3. `getSupabaseClient()` - 8 edges
4. `handleCustomerKeyDown()` - 5 edges
5. `resetForm()` - 4 edges
6. `resetForm()` - 4 edges
7. `BillingCrmTab()` - 4 edges
8. `handleBillingModeChange()` - 4 edges
9. `resetForm()` - 4 edges
10. `resetForm()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `loadClientInfo()` --calls--> `getSupabaseClient()`  [INFERRED]
  E:\projects\evolvnexClientCrm\src\components\dashboard\tabs\summary-tab.tsx → E:\projects\evolvnexClientCrm\src\lib\supabase.ts
- `addTask()` --calls--> `getSupabaseClient()`  [INFERRED]
  E:\projects\evolvnexClientCrm\src\components\dashboard\tabs\summary-tab.tsx → E:\projects\evolvnexClientCrm\src\lib\supabase.ts
- `toggleTask()` --calls--> `getSupabaseClient()`  [INFERRED]
  E:\projects\evolvnexClientCrm\src\components\dashboard\tabs\summary-tab.tsx → E:\projects\evolvnexClientCrm\src\lib\supabase.ts
- `getClient()` --calls--> `getSupabaseClient()`  [INFERRED]
  E:\projects\evolvnexClientCrm\src\lib\billing-queries.ts → E:\projects\evolvnexClientCrm\src\lib\supabase.ts
- `getClientIdForAuthUser()` --calls--> `getSupabaseClient()`  [INFERRED]
  E:\projects\evolvnexClientCrm\src\lib\client-cache.ts → E:\projects\evolvnexClientCrm\src\lib\supabase.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.17
Nodes (10): focusCustomerByPrefix(), handleBillingModeChange(), handleCustomerInputChange(), handleCustomerKeyDown(), openCustomerCombobox(), openCustomerModal(), openPrefilledCustomerModal(), resetCustomerForm() (+2 more)

### Community 1 - "Community 1"
Cohesion: 0.18
Nodes (6): getClientIdForAuthUser(), getClient(), addTask(), loadClientInfo(), toggleTask(), getSupabaseClient()

### Community 2 - "Community 2"
Cohesion: 0.24
Nodes (8): confirmDeleteCustomer(), downloadCsv(), exportCustomersCsv(), handleDelete(), openAdd(), resetForm(), submitAdd(), submitEdit()

### Community 3 - "Community 3"
Cohesion: 0.3
Nodes (10): createCustomer(), createProduct(), deleteCustomer(), fetchCustomers(), fetchProducts(), fetchTransactions(), getClient(), setProductActive() (+2 more)

### Community 4 - "Community 4"
Cohesion: 0.33
Nodes (9): createIngredient(), createRecipe(), deleteIngredient(), deleteRecipe(), fetchIngredients(), fetchRecipes(), getClient(), updateIngredient() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.33
Nodes (6): downloadCsv(), exportProductsCsv(), openAdd(), resetForm(), submitAdd(), submitEdit()

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (4): BillingCrmTab(), useCustomers(), useProducts(), useTransactions()

### Community 7 - "Community 7"
Cohesion: 0.36
Nodes (4): openAdd(), resetForm(), submitAdd(), submitEdit()

### Community 8 - "Community 8"
Cohesion: 0.43
Nodes (4): openAdd(), resetForm(), submitAdd(), submitEdit()

### Community 9 - "Community 9"
Cohesion: 0.4
Nodes (2): downloadCsv(), exportTransactionsCsv()

### Community 10 - "Community 10"
Cohesion: 0.67
Nodes (0): 

### Community 11 - "Community 11"
Cohesion: 0.67
Nodes (0): 

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 12`** (2 nodes): `layout.tsx`, `RootLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (2 nodes): `page.tsx`, `HomePage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (2 nodes): `page.tsx`, `DashboardRoute()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (2 nodes): `page.tsx`, `LoginPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (2 nodes): `AppShell()`, `app-shell.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (2 nodes): `login-form.tsx`, `handleSubmit()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `DataState()`, `data-state.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (2 nodes): `entity-modal.tsx`, `EntityModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `AppointmentsTab()`, `appointments-tab.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `Button()`, `button.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `use-ingredients.ts`, `useIngredients()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `use-recipes.ts`, `useRecipes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `tabs.ts`, `getTabs()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `utils.ts`, `cn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `postcss.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `tailwind.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `billing-types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `inventory-types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getSupabaseClient()` connect `Community 1` to `Community 3`, `Community 4`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `getClient()` connect `Community 3` to `Community 1`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `getClient()` connect `Community 4` to `Community 1`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `getSupabaseClient()` (e.g. with `loadClientInfo()` and `addTask()`) actually correct?**
  _`getSupabaseClient()` has 7 INFERRED edges - model-reasoned connections that need verification._