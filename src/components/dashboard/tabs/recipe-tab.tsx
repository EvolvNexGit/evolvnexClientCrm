"use client";

import { useMemo, useState } from "react";
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

const initialForm: RecipeFormState = {
  product_id: "",
  ingredient_id: "",
  quantity: "1",
  quantity_unit: "unit",
};

export default function RecipeTab({ clientId }: { clientId: string }) {
  const recipeState = useRecipes(clientId);
  const productState = useProducts(clientId);
  const ingredientState = useIngredients(clientId);

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<RecipeRecord | null>(null);
  const [pendingDeleteRecipe, setPendingDeleteRecipe] = useState<RecipeRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [form, setForm] = useState<RecipeFormState>(initialForm);

  const loading = recipeState.loading || productState.loading || ingredientState.loading;
  const error = recipeState.error || productState.error || ingredientState.error;
  const saving = recipeState.saving;

  const filteredRecipes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return recipeState.recipes;
    }

    return recipeState.recipes.filter((recipe) => {
      const haystack = [recipe.productName, recipe.ingredientName, recipe.quantity_unit].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [recipeState.recipes, searchQuery]);

  const hasRows = filteredRecipes.length > 0;

  function resetForm() {
    setForm(initialForm);
    setActionError(null);
  }

  function openAdd() {
    if (productState.products.length === 0 || ingredientState.ingredients.length === 0) {
      setActionError("Add at least one active product and one ingredient before creating a recipe.");
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
    });
  }

  async function submitAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    try {
      await recipeState.addRecipe({
        product_id: form.product_id,
        ingredient_id: form.ingredient_id,
        quantity: Number(form.quantity),
        quantity_unit: form.quantity_unit,
      } satisfies RecipePayload);
      setIsAddOpen(false);
      resetForm();
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

      <div>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by product, ingredient, or unit"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
        />
      </div>

      {actionError && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-xs text-primary">{actionError}</div>
      )}

      <DataState
        loading={loading}
        error={error}
        empty={!loading && !error && !hasRows}
        emptyLabel={searchQuery ? "No recipes match your search." : "No recipes yet."}
      />

      {hasRows && !loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Ingredient</th>
                <th className="px-3 py-3">Quantity</th>
                <th className="px-3 py-3">Unit</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRecipes.map((recipe) => (
                <tr key={recipe.id} className="hover:bg-muted/40">
                  <td className="px-3 py-3 text-text">{recipe.productName}</td>
                  <td className="px-3 py-3 text-muted-foreground">{recipe.ingredientName}</td>
                  <td className="px-3 py-3 text-muted-foreground">{recipe.quantity}</td>
                  <td className="px-3 py-3 text-muted-foreground">{recipe.quantity_unit}</td>
                  <td className="px-3 py-3">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
