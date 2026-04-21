"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { useIngredients } from "@/hooks/use-ingredients";
import { useProducts } from "@/hooks/use-products";
import { useRecipes } from "@/hooks/use-recipes";
import type { InventoryUnit, RecipePayload, RecipeRecord } from "@/lib/inventory-types";

const units: InventoryUnit[] = ["g", "kg", "ml", "l", "unit"];

type RecipeFormState = {
  product_id: string;
  ingredient_id: string;
  quantity: string;
  quantity_unit: InventoryUnit;
};

type BulkRecipeRow = {
  id: string;
  ingredient_id: string;
  quantity: string;
  quantity_unit: InventoryUnit;
};

type SortOption = "product" | "ingredient" | "created_at";

const initialForm: RecipeFormState = {
  product_id: "",
  ingredient_id: "",
  quantity: "1",
  quantity_unit: "unit",
};

function createBulkRow(): BulkRecipeRow {
  return {
    id: crypto.randomUUID(),
    ingredient_id: "",
    quantity: "1",
    quantity_unit: "unit",
  };
}

function createInitialBulkRows(): BulkRecipeRow[] {
  return [createBulkRow()];
}

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

export default function RecipeTab({ clientId }: { clientId: string }) {
  const recipeState = useRecipes(clientId);
  const productState = useProducts(clientId);
  const ingredientState = useIngredients(clientId);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedIngredient, setSelectedIngredient] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("product");
  const [collapsedProducts, setCollapsedProducts] = useState<Record<string, boolean>>({});
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [bulkProductId, setBulkProductId] = useState("");
  const [bulkRows, setBulkRows] = useState<BulkRecipeRow[]>(createInitialBulkRows);
  const [editingRecipe, setEditingRecipe] = useState<RecipeRecord | null>(null);
  const [pendingDeleteRecipe, setPendingDeleteRecipe] = useState<RecipeRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [form, setForm] = useState<RecipeFormState>(initialForm);

  const loading = recipeState.loading || productState.loading || ingredientState.loading;
  const error = recipeState.error || productState.error || ingredientState.error;
  const saving = recipeState.saving;

  const productOptions = useMemo(
    () => [...productState.products].sort((a, b) => a.name.localeCompare(b.name)),
    [productState.products],
  );

  const ingredientOptions = useMemo(
    () => [...ingredientState.ingredients].sort((a, b) => a.name.localeCompare(b.name)),
    [ingredientState.ingredients],
  );

  const filteredRecipes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const next = recipeState.recipes.filter((recipe) => {
      const matchesSearch =
        !query ||
        [recipe.productName, recipe.ingredientName, recipe.quantity_unit, recipe.ingredientStockUnit]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesProduct = !selectedProduct || recipe.product_id === selectedProduct;
      const matchesIngredient = !selectedIngredient || recipe.ingredient_id === selectedIngredient;
      const matchesLowStock = !showLowStockOnly || isRecipeLowStock(recipe);

      return matchesSearch && matchesProduct && matchesIngredient && matchesLowStock;
    });

    next.sort((a, b) => {
      if (sortBy === "ingredient") {
        const ingredientCompare = a.ingredientName.localeCompare(b.ingredientName);
        if (ingredientCompare !== 0) {
          return ingredientCompare;
        }

        return a.productName.localeCompare(b.productName);
      }

      if (sortBy === "created_at") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      const productCompare = a.productName.localeCompare(b.productName);
      if (productCompare !== 0) {
        return productCompare;
      }

      return a.ingredientName.localeCompare(b.ingredientName);
    });

    return next;
  }, [recipeState.recipes, searchQuery, selectedProduct, selectedIngredient, showLowStockOnly, sortBy]);

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
    if (sortBy !== "created_at") {
      values.sort((a, b) => a.productName.localeCompare(b.productName));
    }

    return values;
  }, [filteredRecipes, sortBy]);

  const lowStockRecipeCount = useMemo(
    () => recipeState.recipes.filter((recipe) => isRecipeLowStock(recipe)).length,
    [recipeState.recipes],
  );

  const hasRows = groupedRecipes.length > 0;

  function resetForm() {
    setForm(initialForm);
    setActionError(null);
  }

  function resetBulkForm() {
    setBulkProductId("");
    setBulkRows(createInitialBulkRows());
    setActionError(null);
  }

  function openAdd() {
    if (productState.products.length === 0 || ingredientState.ingredients.length === 0) {
      setActionError("Add at least one active product and one ingredient before creating a recipe.");
      return;
    }

    resetBulkForm();
    setIsAddOpen(true);
  }

  function closeAdd() {
    setIsAddOpen(false);
    resetBulkForm();
  }

  function openEdit(recipe: RecipeRecord) {
    setActionError(null);
    setEditingRecipe(recipe);
    setForm({
      product_id: recipe.product_id,
      ingredient_id: recipe.ingredient_id,
      quantity: String(recipe.quantity),
      quantity_unit: recipe.quantity_unit,
    });
  }

  function addBulkRow() {
    setBulkRows((current) => [...current, createBulkRow()]);
  }

  function removeBulkRow(rowId: string) {
    setBulkRows((current) => (current.length === 1 ? current : current.filter((row) => row.id !== rowId)));
  }

  function updateBulkRow(rowId: string, nextRow: Partial<BulkRecipeRow>) {
    setBulkRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              ...nextRow,
            }
          : row,
      ),
    );
  }

  async function submitAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    try {
      if (!bulkProductId) {
        setActionError("Select a product before saving recipes.");
        return;
      }

      const normalizedRows = bulkRows.map((row) => ({
        ingredient_id: row.ingredient_id.trim(),
        quantity: Number(row.quantity),
        quantity_unit: row.quantity_unit,
      }));

      if (normalizedRows.some((row) => !row.ingredient_id)) {
        setActionError("Select an ingredient for every recipe row.");
        return;
      }

      if (normalizedRows.some((row) => !Number.isFinite(row.quantity) || row.quantity <= 0)) {
        setActionError("Enter a valid quantity for every recipe row.");
        return;
      }

      const duplicateIngredient = normalizedRows.findIndex(
        (row, index) => normalizedRows.findIndex((candidate) => candidate.ingredient_id === row.ingredient_id) !== index,
      );

      if (duplicateIngredient >= 0) {
        setActionError("Each ingredient can only be added once per product batch.");
        return;
      }

      await recipeState.addRecipes(
        normalizedRows.map((row) => ({
          product_id: bulkProductId,
          ingredient_id: row.ingredient_id,
          quantity: row.quantity,
          quantity_unit: row.quantity_unit,
        } satisfies RecipePayload)),
      );
      closeAdd();
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
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text">Recipes</h3>
          <p className="text-sm text-muted-foreground">Link products to ingredients with required quantities.</p>
        </div>
        <Button type="button" onClick={openAdd}>
          Add Recipe
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-background p-3 lg:grid-cols-2">
        <label className="block text-xs text-muted-foreground">
          <span className="mb-1 block">Search recipes</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by product, ingredient, or unit"
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-text"
          />
        </label>

        <label className="block text-xs text-muted-foreground">
          <span className="mb-1 block">Sort by</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortOption)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-text"
          >
            <option value="product">Product name</option>
            <option value="ingredient">Ingredient name</option>
            <option value="created_at">Created date</option>
          </select>
        </label>

        <SearchableSelect
          label="Product filter"
          allLabel="All products"
          searchPlaceholder="Search products"
          noResultsLabel="No products found"
          options={productOptions}
          selectedValue={selectedProduct}
          onChange={setSelectedProduct}
        />

        <SearchableSelect
          label="Ingredient filter"
          allLabel="All ingredients"
          searchPlaceholder="Search ingredients"
          noResultsLabel="No ingredients found"
          options={ingredientOptions}
          selectedValue={selectedIngredient}
          onChange={setSelectedIngredient}
        />

        <label className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground lg:col-span-2">
          <span>Show low stock recipes only</span>
          <input
            type="checkbox"
            checked={showLowStockOnly}
            onChange={(event) => setShowLowStockOnly(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
        </label>

        <div className="lg:col-span-2">
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
            Low stock recipes: {lowStockRecipeCount}
          </span>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-xs text-primary">{actionError}</div>
      )}

      <DataState
        loading={loading}
        error={error}
        empty={!loading && !error && !hasRows}
        emptyLabel={searchQuery || selectedProduct || selectedIngredient || showLowStockOnly ? "No recipes match current filters." : "No recipes yet."}
      />

      {hasRows && !loading && !error && (
        <div className="space-y-3">
          {groupedRecipes.map((group) => {
            const isCollapsed = Boolean(collapsedProducts[group.productId]);
            const lowStockInGroup = group.rows.filter((recipe) => isRecipeLowStock(recipe)).length;

            return (
              <div key={group.productId} className="rounded-xl border border-border bg-background">
                <button
                  type="button"
                  onClick={() => toggleProductGroup(group.productId)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-text">Product: {group.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.rows.length} ingredients
                      {lowStockInGroup > 0 ? `, ${lowStockInGroup} low stock` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{isCollapsed ? "Expand" : "Collapse"}</span>
                </button>

                {!isCollapsed && (
                  <ul className="space-y-2 border-t border-border px-3 py-3">
                    {group.rows.map((recipe) => {
                      const isNegative = isRecipeNegativeStock(recipe);
                      const isLowStock = isRecipeLowStock(recipe);

                      const rowTone = isNegative
                        ? "border-red-500/40 bg-red-500/10"
                        : isLowStock
                          ? "border-amber-500/40 bg-amber-500/10"
                          : "border-border bg-card";
                      const stockTone = isNegative
                        ? "text-red-400"
                        : isLowStock
                          ? "text-amber-400"
                          : "text-muted-foreground";

                      return (
                        <li key={recipe.id} className={`rounded-lg border px-3 py-3 ${rowTone}`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm text-text">
                                {recipe.ingredientName} ({formatQuantity(recipe.quantity)} {recipe.quantity_unit})
                              </p>
                              <p className={`text-xs ${stockTone}`}>
                                Stock: {formatQuantity(recipe.ingredientStock)} {recipe.ingredientStockUnit}
                                {isNegative ? " (negative)" : isLowStock ? " (below threshold)" : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openEdit(recipe)}
                                className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-text"
                                disabled={saving}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteRecipe(recipe)}
                                className="rounded-md border border-primary/50 px-2 py-1 text-xs text-primary"
                                disabled={saving}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <EntityModal open={isAddOpen} title="Add Recipes" onClose={closeAdd}>
        <BulkRecipeForm
          bulkProductId={bulkProductId}
          rows={bulkRows}
          ingredients={ingredientState.ingredients}
          products={productState.products}
          onAddRow={addBulkRow}
          onChangeProduct={setBulkProductId}
          onChangeRow={updateBulkRow}
          onRemoveRow={removeBulkRow}
          onSubmit={submitAdd}
          saving={saving}
          submitLabel="Save Recipes"
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
          <p className="text-sm text-muted-foreground">
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
    </div>
  );
}

function SearchableSelect({
  label,
  allLabel,
  searchPlaceholder,
  noResultsLabel,
  options,
  selectedValue,
  onChange,
}: {
  label: string;
  allLabel: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  options: Array<{ id: string; name: string }>;
  selectedValue: string;
  onChange: (value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedOption = useMemo(
    () => options.find((option) => option.id === selectedValue) ?? null,
    [options, selectedValue],
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => option.name.toLowerCase().includes(normalizedQuery));
  }, [options, normalizedQuery]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveIndex(0);
  }, [query, isOpen]);

  function openMenu() {
    setIsOpen(true);
    setQuery("");
    setActiveIndex(0);
  }

  function closeMenu() {
    setIsOpen(false);
    setQuery("");
  }

  function handleSelect(value: string) {
    onChange(value);
    closeMenu();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter")) {
      event.preventDefault();
      openMenu();
      return;
    }

    if (!isOpen) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredOptions.length > 0) {
        setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredOptions.length > 0) {
        setActiveIndex((current) => Math.max(current - 1, 0));
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option) {
        handleSelect(option.id);
      }
    }
  }

  const displayValue = isOpen ? query : selectedOption?.name ?? allLabel;

  return (
    <div ref={containerRef} className="space-y-2">
      <label className="block text-xs text-muted-foreground">
        <span className="mb-1 block">{label}</span>
        <div className="relative">
          <input
            value={displayValue}
            onFocus={openMenu}
            onClick={() => {
              if (!isOpen) {
                openMenu();
              }
            }}
            onChange={(event) => {
              if (!isOpen) {
                openMenu();
              }

              setQuery(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 pr-20 text-sm text-text"
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls={`${label.replace(/\s+/g, "-").toLowerCase()}-listbox`}
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleSelect("")}
              className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-text"
              aria-label={`Clear ${label.toLowerCase()}`}
            >
              ×
            </button>
            <button
              type="button"
              onClick={() => (isOpen ? closeMenu() : openMenu())}
              className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-text"
              aria-label={`Toggle ${label.toLowerCase()} options`}
            >
              ▼
            </button>
          </div>

          {isOpen && (
            <div
              id={`${label.replace(/\s+/g, "-").toLowerCase()}-listbox`}
              role="listbox"
              className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-card p-1 shadow-lg"
            >
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect("")}
                className={`w-full rounded-lg px-2 py-2 text-left text-sm ${
                  selectedValue === "" ? "bg-muted text-text" : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {allLabel}
              </button>

              {filteredOptions.length === 0 ? (
                <p className="px-2 py-2 text-sm text-muted-foreground">{noResultsLabel}</p>
              ) : (
                filteredOptions.map((option, index) => {
                  const isSelected = selectedValue === option.id;
                  const isActive = index === activeIndex;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelect(option.id)}
                      className={`w-full rounded-lg px-2 py-2 text-left text-sm ${
                        isActive || isSelected ? "bg-muted text-text" : "text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {option.name}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </label>
    </div>
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
      <label className="block text-sm text-muted-foreground">
        <span className="mb-1 block">Product</span>
        <select
          required
          value={form.product_id}
          onChange={(event) => onChange({ ...form, product_id: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
        >
          <option value="">Select product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm text-muted-foreground">
        <span className="mb-1 block">Ingredient</span>
        <select
          required
          value={form.ingredient_id}
          onChange={(event) => onChange({ ...form, ingredient_id: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
        >
          <option value="">Select ingredient</option>
          {ingredients.map((ingredient) => (
            <option key={ingredient.id} value={ingredient.id}>
              {ingredient.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-muted-foreground">
          <span className="mb-1 block">Quantity</span>
          <input
            required
            min="0"
            step="0.01"
            type="number"
            value={form.quantity}
            onChange={(event) => onChange({ ...form, quantity: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
          />
        </label>

        <label className="block text-sm text-muted-foreground">
          <span className="mb-1 block">Unit</span>
          <select
            value={form.quantity_unit}
            onChange={(event) => onChange({ ...form, quantity_unit: event.target.value as InventoryUnit })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
          >
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}

function BulkRecipeForm({
  bulkProductId,
  rows,
  products,
  ingredients,
  onAddRow,
  onChangeProduct,
  onChangeRow,
  onRemoveRow,
  onSubmit,
  saving,
  submitLabel,
}: {
  bulkProductId: string;
  rows: BulkRecipeRow[];
  products: Array<{ id: string; name: string }>;
  ingredients: Array<{ id: string; name: string }>;
  onAddRow: () => void;
  onChangeProduct: (productId: string) => void;
  onChangeRow: (rowId: string, nextRow: Partial<BulkRecipeRow>) => void;
  onRemoveRow: (rowId: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
      <label className="block text-sm text-muted-foreground">
        <span className="mb-1 block">Product</span>
        <select
          required
          value={bulkProductId}
          onChange={(event) => onChangeProduct(event.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
        >
          <option value="">Select product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-medium text-text">Ingredients</h4>
          <Button type="button" variant="secondary" onClick={onAddRow} disabled={saving}>
            + Add ingredient
          </Button>
        </div>

        {rows.map((row, index) => (
          <div key={row.id} className="rounded-xl border border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Ingredient row {index + 1}</span>
              <button
                type="button"
                onClick={() => onRemoveRow(row.id)}
                className="rounded-md border border-primary/50 px-2 py-1 text-xs text-primary"
                disabled={saving || rows.length === 1}
                aria-label="Remove ingredient row"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-sm text-muted-foreground">
                <span className="mb-1 block">Ingredient</span>
                <select
                  required
                  value={row.ingredient_id}
                  onChange={(event) => onChangeRow(row.id, { ingredient_id: event.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
                >
                  <option value="">Select ingredient</option>
                  {ingredients.map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.id}>
                      {ingredient.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-muted-foreground">
                  <span className="mb-1 block">Quantity</span>
                  <input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={row.quantity}
                    onChange={(event) => onChangeRow(row.id, { quantity: event.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
                  />
                </label>

                <label className="block text-sm text-muted-foreground">
                  <span className="mb-1 block">Unit</span>
                  <select
                    value={row.quantity_unit}
                    onChange={(event) => onChangeRow(row.id, { quantity_unit: event.target.value as InventoryUnit })}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
                  >
                    {units.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
