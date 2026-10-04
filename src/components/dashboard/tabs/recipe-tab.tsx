"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronRight, Download, Filter, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useIngredients } from "@/hooks/use-ingredients";
import { usePagedList } from "@/hooks/use-paged-list";
import { useProducts } from "@/hooks/use-products";
import { useRecipes } from "@/hooks/use-recipes";
import { fetchRecipesPage } from "@/lib/inventory-queries";
import type { InventoryUnit, RecipePayload, RecipeRecord } from "@/lib/inventory-types";
import { formatUtcToIst } from "@/lib/time-utils";

const units: InventoryUnit[] = ["g", "kg", "ml", "l", "unit"];

type RecipeFormState = {
  product_id: string;
  ingredient_id: string;
  quantity: string;
  quantity_unit: InventoryUnit;
  items?: Array<{ ingredient_id: string; quantity: string; quantity_unit: InventoryUnit; name?: string }>;
};

// Sort dropdown removed; recipes always sort by product then ingredient

const initialForm: RecipeFormState = {
  product_id: "",
  ingredient_id: "",
  quantity: "1",
  quantity_unit: "unit",
  items: [],
};

function isRecipeLowStock(recipe: RecipeRecord) {
  return recipe.ingredientThreshold !== null && recipe.ingredientStock < recipe.ingredientThreshold;
}

function isRecipeNegativeStock(recipe: RecipeRecord) {
  return recipe.ingredientStock < 0;
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function RecipeTab({ clientId }: { clientId: string }) {
  const recipeState = useRecipes(clientId);
  const productState = useProducts(clientId);
  const ingredientState = useIngredients(clientId);

  const [searchQuery, setSearchQuery] = usePersistentState("recipe-tab-search", "");
  // product/ingredient name filters removed — keep UI simpler
  const [productTypeFilter, setProductTypeFilter] = usePersistentState("recipe-tab-product-type-filter", "");
  const [showLowStockOnly, setShowLowStockOnly] = usePersistentState("recipe-tab-show-low-stock-only", false);
  const [collapsedProducts, setCollapsedProducts] = usePersistentState<Record<string, boolean>>("recipe-tab-collapsed-products", {});
  const [isAddOpen, setIsAddOpen] = usePersistentState("recipe-tab-is-add-open", false);
  const [editingRecipe, setEditingRecipe] = usePersistentState<RecipeRecord | null>("recipe-tab-editing-recipe", null);
  const [pendingDeleteRecipe, setPendingDeleteRecipe] = usePersistentState<RecipeRecord | null>(
    "recipe-tab-pending-delete-recipe",
    null,
  );
  const [actionError, setActionError] = usePersistentState<string | null>("recipe-tab-action-error", null);
  const [form, setForm] = usePersistentState<RecipeFormState>("recipe-tab-form", initialForm);

  const saving = recipeState.saving;

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const pagedRecipes = usePagedList<RecipeRecord>({
    resetKey: `${clientId}|${debouncedSearch}|${showLowStockOnly ? "1" : "0"}|${productTypeFilter}`,
    enabled: Boolean(clientId),
    fetchPage: ({ limit, offset }) =>
      fetchRecipesPage(clientId, {
        limit,
        offset,
        search: debouncedSearch,
        lowStockOnly: showLowStockOnly,
        productTypeFilter: productTypeFilter || null,
      }),
  });

  const loading = pagedRecipes.loading || productState.loading || ingredientState.loading;
  const error = pagedRecipes.error || productState.error || ingredientState.error;

  const productTypes = useMemo(() => {
    const types = [
      ...new Set(
        productState.products
          .map((p) => p.type)
          .filter((type): type is string => Boolean(type)),
      ),
    ];
    return types.sort((a, b) => a.localeCompare(b));
  }, [productState.products]);
  const ingredientOptions = useMemo(
    () => [...ingredientState.ingredients].sort((a, b) => a.name.localeCompare(b.name)),
    [ingredientState.ingredients],
  );

  // Displayed rows are already filtered and paginated server-side (see fetchRecipesPage).
  const displayedRecipes = pagedRecipes.items;

  const filteredRecipes = useMemo(() => {
    const next = [...displayedRecipes];
    next.sort((a, b) => {
      const productCompare = a.productName.localeCompare(b.productName);
      if (productCompare !== 0) {
        return productCompare;
      }

      return a.ingredientName.localeCompare(b.ingredientName);
    });

    return next;
  }, [displayedRecipes]);

  const groupedRecipes = useMemo(() => {
    const groups = new Map<string, { productId: string; productName: string; rows: RecipeRecord[] }>();

    filteredRecipes.forEach((recipe) => {
      const existing = groups.get(recipe.product_id);
      if (existing) {
        existing.rows.push(recipe);
        return;
      }

      groups.set(recipe.product_id, {
        productId: recipe.product_id,
        productName: recipe.productName,
        rows: [recipe],
      });
    });

    const values = Array.from(groups.values());
    values.sort((a, b) => a.productName.localeCompare(b.productName));

    return values;
  }, [filteredRecipes]);

  const lowStockRecipeCount = useMemo(
    () => recipeState.recipes.filter((recipe) => isRecipeLowStock(recipe)).length,
    [recipeState.recipes],
  );

  const hasRows = groupedRecipes.length > 0;

  function handleDownloadCsv() {
    const rows = [
      ["product_name", "ingredient_name", "quantity", "quantity_unit", "ingredient_stock", "ingredient_stock_unit", "status", "created_at"],
      ...filteredRecipes.map((recipe) => [
        recipe.productName,
        recipe.ingredientName,
        formatQuantity(recipe.quantity),
        recipe.quantity_unit,
        formatQuantity(recipe.ingredientStock),
        recipe.ingredientStockUnit,
        isRecipeNegativeStock(recipe) ? "negative" : isRecipeLowStock(recipe) ? "low_stock" : "normal",
        formatUtcToIst(recipe.created_at),
      ]),
    ];

    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`recipes-${clientId}-${dateStamp}.csv`, rows);
  }

  function getRowTone(recipe: RecipeRecord) {
    if (isRecipeNegativeStock(recipe)) {
      return {
        border: "border-primary/40",
        bg: "bg-primary/10",
        text: "text-primary",
        badge: "NEGATIVE",
      };
    }

    if (isRecipeLowStock(recipe)) {
      return {
        border: "border-primary/40",
        bg: "bg-primary/10",
        text: "text-primary",
        badge: "LOW STOCK",
      };
    }

    return {
      border: "border-border",
      bg: "bg-background",
      text: "text-muted-foreground",
    };
  }

  function resetForm() {
    setForm(initialForm);
    setActionError(null);
  }

  function openAdd() {
    if (productState.products.length === 0 || ingredientState.ingredients.length === 0) {
      setActionError("Add at least one product and one ingredient before creating a recipe.");
      return;
    }

    resetForm();
    setIsAddOpen(true);
  }

  function openEdit(recipe: RecipeRecord) {
    setActionError(null);
    setEditingRecipe(recipe);
    setForm({
      product_id: recipe.product_id,
      ingredient_id: recipe.ingredient_id,
      quantity: String(recipe.quantity),
      quantity_unit: recipe.quantity_unit,
      items: [],
    });
  }

  async function submitAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    try {
      // Support submitting multiple ingredients at once when items present
      if (form.items && form.items.length > 0) {
        for (const item of form.items) {
          await recipeState.addRecipe({
            product_id: form.product_id,
            ingredient_id: item.ingredient_id,
            quantity: Number(item.quantity),
            quantity_unit: item.quantity_unit,
          } satisfies RecipePayload);
        }
      } else {
        await recipeState.addRecipe({
          product_id: form.product_id,
          ingredient_id: form.ingredient_id,
          quantity: Number(form.quantity),
          quantity_unit: form.quantity_unit,
        } satisfies RecipePayload);
      }
      setIsAddOpen(false);
      resetForm();
      await pagedRecipes.refresh();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Unable to add recipe.");
    }
  }

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingRecipe) {
      return;
    }

    setActionError(null);

    try {
      await recipeState.editRecipe(editingRecipe.id, {
        product_id: form.product_id,
        ingredient_id: form.ingredient_id,
        quantity: Number(form.quantity),
        quantity_unit: form.quantity_unit,
      });
      setEditingRecipe(null);
      resetForm();
      await pagedRecipes.refresh();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Unable to update recipe.");
    }
  }

  async function confirmDeleteRecipe() {
    if (!pendingDeleteRecipe) {
      return;
    }

    setActionError(null);

    try {
      await recipeState.removeRecipe(pendingDeleteRecipe.id);
      setPendingDeleteRecipe(null);
      await pagedRecipes.refresh();
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Unable to delete recipe.");
    }
  }

  function toggleProductGroup(productId: string) {
    setCollapsedProducts((current) => ({
      ...current,
      [productId]: !current[productId],
    }));
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-4 text-text sm:p-5">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-text"
            aria-label="Download displayed recipes as CSV"
            title="Download CSV"
          >
            <Download className="h-5 w-5" />
          </button>
          <Button type="button" onClick={openAdd} className="h-11 rounded-2xl px-6 text-base font-semibold">
            <Plus className="mr-2 h-4 w-4" />
            Add recipe
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.7fr_0.8fr_0.8fr_0.8fr]">
        <label className="relative block text-sm text-muted-foreground">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by recipe or ingredient name or type"
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-text placeholder:text-muted-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          />
        </label>

        {/* Sort dropdown removed; results are ordered by product then ingredient */}

        <label className="relative block text-sm text-muted-foreground">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={productTypeFilter}
            onChange={(event) => setProductTypeFilter(event.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-text outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All types</option>
            {productTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {/* Status filter removed - show recipes regardless of product active state */}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showLowStockOnly}
            onChange={(event) => setShowLowStockOnly(event.target.checked)}
            className="h-4 w-4 rounded border-border bg-transparent accent-primary"
          />
          Show low stock recipes only
        </label>

        <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          Low stock recipes: {lowStockRecipeCount}
        </span>
      </div>

      {actionError && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm text-primary">{actionError}</div>
      )}

      <DataState
        loading={loading && !hasRows}
        error={error}
        empty={!loading && !error && !hasRows}
        emptyLabel={searchQuery || showLowStockOnly ? "No recipes match current filters." : "No recipes yet."}
      />

      {hasRows && !error && (
        <div className="space-y-4">
          {groupedRecipes.map((group) => {
            const isCollapsed = Boolean(collapsedProducts[group.productId]);
            const lowStockInGroup = group.rows.filter((recipe) => isRecipeLowStock(recipe)).length;

            return (
              <div key={group.productId} className="overflow-hidden rounded-2xl border border-border bg-background">
                <button
                  type="button"
                  onClick={() => toggleProductGroup(group.productId)}
                  className="flex w-full items-center justify-between gap-4 border-b border-border px-4 py-4 text-left transition hover:bg-muted/40"
                >
                  <div>
                    <p className="text-base font-semibold text-text">{group.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {group.rows.length} ingredients{lowStockInGroup > 0 ? `, ${lowStockInGroup} low stock` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {lowStockInGroup > 0 ? (
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                        Needs attention
                      </span>
                    ) : null}
                    {isCollapsed ? <ChevronRight className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="min-w-0">
                    <div className="space-y-3 p-3 xl:hidden">
                      {group.rows.map((recipe) => {
                        const rowTone = getRowTone(recipe);
                        return (
                          <div key={recipe.id} className={`rounded-xl border border-border p-3 ${rowTone.bg}`}>
                            <p className="font-medium text-text">{recipe.ingredientName}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Qty {formatQuantity(recipe.quantity)} {recipe.quantity_unit} · Stock {formatQuantity(recipe.ingredientStock)} {recipe.ingredientStockUnit}
                            </p>
                            <div className="mt-3 flex gap-2">
                              <button type="button" onClick={() => openEdit(recipe)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm text-text" disabled={saving}>Edit</button>
                              <button type="button" onClick={() => setPendingDeleteRecipe(recipe)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-primary/30 text-sm text-primary" disabled={saving}>Delete</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="hidden overflow-x-auto xl:block">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-muted text-left uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Ingredient</th>
                          <th className="px-4 py-3">Quantity</th>
                          <th className="px-4 py-3">Stock</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {group.rows.map((recipe) => {
                          const rowTone = getRowTone(recipe);

                          return (
                            <tr key={recipe.id} className={`${rowTone.bg} hover:bg-muted/40`}>
                              <td className="px-4 py-4">
                                <div className="font-medium text-text">{recipe.ingredientName}</div>
                                <div className="text-xs text-muted-foreground">Product: {recipe.productName}</div>
                              </td>
                              <td className="px-4 py-4 text-muted-foreground">
                                {formatQuantity(recipe.quantity)} {recipe.quantity_unit}
                              </td>
                              <td className="px-4 py-4 text-muted-foreground">
                                {formatQuantity(recipe.ingredientStock)} {recipe.ingredientStockUnit}
                              </td>
                              <td className="px-4 py-4">
                                {rowTone.badge ? (
                                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${rowTone.border} ${rowTone.bg} ${rowTone.text}`}>
                                    {rowTone.badge}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(recipe)}
                                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-text"
                                    disabled={saving}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteRecipe(recipe)}
                                    className="inline-flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition hover:bg-primary/15"
                                    disabled={saving}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasRows && !error && (
        <ListPaginationControls
          loadedCount={pagedRecipes.items.length}
          totalCount={pagedRecipes.totalCount}
          hasMore={pagedRecipes.hasMore}
          loading={pagedRecipes.loadingMore}
          onShowMore={() => void pagedRecipes.showMore()}
          onShowAll={() => void pagedRecipes.showAll()}
          itemLabel="recipes"
        />
      )}

      <EntityModal open={isAddOpen} title="Add Recipe" onClose={() => setIsAddOpen(false)}>
        <RecipeForm
          form={form}
          products={productState.products}
          ingredients={ingredientState.ingredients}
          onChange={setForm}
          onSubmit={submitAdd}
          saving={saving}
          submitLabel="Create Recipe"
        />
      </EntityModal>

      <EntityModal open={Boolean(editingRecipe)} title="Edit Recipe" onClose={() => setEditingRecipe(null)}>
        <RecipeForm
          form={form}
          products={productState.products}
          ingredients={ingredientState.ingredients}
          onChange={setForm}
          onSubmit={submitEdit}
          saving={saving}
          submitLabel="Save Changes"
        />
      </EntityModal>

      <EntityModal open={Boolean(pendingDeleteRecipe)} title="Confirm recipe deletion" onClose={() => setPendingDeleteRecipe(null)}>
        <div className="space-y-4">
          <p className="text-base text-muted-foreground">
            Delete recipe for <span className="font-semibold text-text">{pendingDeleteRecipe?.productName}</span> and{' '}
            <span className="font-semibold text-text">{pendingDeleteRecipe?.ingredientName}</span>? This action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPendingDeleteRecipe(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmDeleteRecipe()} disabled={saving}>
              {saving ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </EntityModal>
    </section>
  );
}

function RecipeForm({
  form,
  products,
  ingredients,
  onChange,
  onSubmit,
  saving,
  submitLabel,
}: {
  form: RecipeFormState;
  products: Array<{ id: string; name: string }>;
  ingredients: Array<{ id: string; name: string }>;
  onChange: (next: RecipeFormState) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
      <label className="hidden block text-base text-muted-foreground">
        <span className="mb-1 block">Product</span>
        <select
          required
          value={form.product_id}
          onChange={(event) => onChange({ ...form, product_id: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
        >
          <option value="">Select product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <label className="block text-base text-muted-foreground">
          <span className="mb-1 block">Add Ingredient</span>
          <div className="flex items-center gap-3">
            <select
              value={form.ingredient_id}
              onChange={(event) => onChange({ ...form, ingredient_id: event.target.value })}
              className="hidden flex-1 rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            >
              <option value="">Select ingredient to add</option>
              {ingredients.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name}
                </option>
              ))}
            </select>

            <input
              min="0"
              step="0.01"
              type="number"
              value={form.quantity}
              onChange={(event) => onChange({ ...form, quantity: event.target.value })}
              placeholder="Quantity"
              className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            />

            <select
              value={form.quantity_unit}
              onChange={(event) => onChange({ ...form, quantity_unit: event.target.value as InventoryUnit })}
              className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            >
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                if (!form.ingredient_id) return;
                const ingredient = ingredients.find((i) => i.id === form.ingredient_id);
                const nextItems = [...(form.items ?? [])];
                nextItems.push({
                  ingredient_id: form.ingredient_id,
                  quantity: form.quantity,
                  quantity_unit: form.quantity_unit,
                  name: ingredient?.name,
                });
                onChange({ ...form, items: nextItems, ingredient_id: "", quantity: "1" });
              }}
              className="ml-2 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Add Ingredient to recipe
            </button>
          </div>
        </label>

        {/* Items table */}
        {(form.items && form.items.length > 0) && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Ingredient</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {form.items!.map((it, idx) => (
                  <tr key={`${it.ingredient_id}-${idx}`} className="bg-background">
                    <td className="px-4 py-4">{it.name ?? ingredients.find((i) => i.id === it.ingredient_id)?.name}</td>
                    <td className="px-4 py-4">{it.quantity}</td>
                    <td className="px-4 py-4">{it.quantity_unit}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          const next = (form.items ?? []).filter((_, i) => i !== idx);
                          onChange({ ...form, items: next });
                        }}
                        className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
