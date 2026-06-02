"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useIngredients } from "@/hooks/use-ingredients";
import type { IngredientPayload, IngredientRecord, InventoryUnit } from "@/lib/inventory-types";

const units: InventoryUnit[] = ["g", "kg", "ml", "l", "unit"];

type IngredientFormState = {
  name: string;
  quantity: string;
  threshold: string;
  quantity_unit: InventoryUnit;
  seller_name: string;
  seller_phone: string;
  seller_email: string;
};

const initialForm: IngredientFormState = {
  name: "",
  quantity: "0",
  threshold: "0",
  quantity_unit: "unit",
  seller_name: "",
  seller_phone: "",
  seller_email: "",
};

function formatNumber(value: number | null) {
  if (value === null || value === undefined) {
    return "-";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function isIngredientLowStock(ingredient: IngredientRecord) {
  return ingredient.threshold !== null && ingredient.quantity < ingredient.threshold;
}

function isIngredientOutOfStock(ingredient: IngredientRecord) {
  return ingredient.quantity <= 0;
}

function isIngredientNeedsRestock(ingredient: IngredientRecord) {
  return isIngredientLowStock(ingredient) || isIngredientOutOfStock(ingredient);
}

export default function IngredientTab({ clientId }: { clientId: string }) {
  const { ingredients, loading, saving, error, addIngredient, editIngredient, removeIngredient } = useIngredients(clientId);
  const [searchQuery, setSearchQuery] = usePersistentState("ingredient-tab-search", "");
  const [showLowStockOnly, setShowLowStockOnly] = usePersistentState("ingredient-tab-show-low-stock-only", false);
  const [isAddOpen, setIsAddOpen] = usePersistentState("ingredient-tab-is-add-open", false);
  const [editingIngredient, setEditingIngredient] = usePersistentState<IngredientRecord | null>(
    "ingredient-tab-editing-ingredient",
    null,
  );
  const [pendingDeleteIngredient, setPendingDeleteIngredient] = usePersistentState<IngredientRecord | null>(
    "ingredient-tab-pending-delete",
    null,
  );
  const [actionError, setActionError] = usePersistentState<string | null>("ingredient-tab-action-error", null);
  const [form, setForm] = usePersistentState<IngredientFormState>("ingredient-tab-form", initialForm);

  const filteredIngredients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return ingredients.filter((ingredient) => {
      if (showLowStockOnly && !isIngredientNeedsRestock(ingredient)) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        ingredient.name,
        ingredient.seller_name ?? "",
        ingredient.seller_phone ?? "",
        ingredient.seller_email ?? "",
        ingredient.quantity_unit,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [ingredients, searchQuery, showLowStockOnly]);

  const lowStockIngredients = useMemo(
    () => ingredients.filter((ingredient) => isIngredientNeedsRestock(ingredient)),
    [ingredients],
  );

  const hasRows = filteredIngredients.length > 0;

  function resetForm() {
    setForm(initialForm);
    setActionError(null);
  }

  function openAdd() {
    resetForm();
    setIsAddOpen(true);
  }

  function openEdit(ingredient: IngredientRecord) {
    setActionError(null);
    setEditingIngredient(ingredient);
    setForm({
      name: ingredient.name,
      quantity: String(ingredient.quantity),
      threshold: String(ingredient.threshold ?? 0),
      quantity_unit: ingredient.quantity_unit,
      seller_name: ingredient.seller_name ?? "",
      seller_phone: ingredient.seller_phone ?? "",
      seller_email: ingredient.seller_email ?? "",
    });
  }

  async function submitAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    try {
      await addIngredient({
        name: form.name.trim(),
        quantity: Number(form.quantity),
        threshold: Number(form.threshold || 0),
        quantity_unit: form.quantity_unit,
        seller_name: form.seller_name.trim() || null,
        seller_phone: form.seller_phone.trim() || null,
        seller_email: form.seller_email.trim() || null,
      });
      setIsAddOpen(false);
      resetForm();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Unable to add ingredient.");
    }
  }

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingIngredient) {
      return;
    }

    setActionError(null);

    try {
      await editIngredient(editingIngredient.id, {
        name: form.name.trim(),
        quantity: Number(form.quantity),
        threshold: Number(form.threshold || 0),
        quantity_unit: form.quantity_unit,
        seller_name: form.seller_name.trim() || null,
        seller_phone: form.seller_phone.trim() || null,
        seller_email: form.seller_email.trim() || null,
      });
      setEditingIngredient(null);
      resetForm();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Unable to update ingredient.");
    }
  }

  async function confirmDeleteIngredient() {
    if (!pendingDeleteIngredient) {
      return;
    }

    setActionError(null);

    try {
      await removeIngredient(pendingDeleteIngredient.id);
      setPendingDeleteIngredient(null);
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Unable to delete ingredient.");
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-text">Ingredients</h3>
          <p className="text-base text-muted-foreground">Manage ingredient inventory, supplier details, and thresholds.</p>
        </div>
        <Button type="button" onClick={openAdd}>
          Add Ingredient
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by ingredient or supplier"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:max-w-xl"
        />
        <label className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showLowStockOnly}
            onChange={(event) => setShowLowStockOnly(event.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Low stock only
        </label>
      </div>

      {lowStockIngredients.length > 0 && (
        <p className="text-sm text-amber-300">
          {lowStockIngredients.length} ingredient{lowStockIngredients.length === 1 ? "" : "s"} below threshold or out of stock
        </p>
      )}

      {actionError && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-sm text-primary">{actionError}</div>
      )}

      {!loading && !error && lowStockIngredients.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
          <p className="font-medium text-amber-200">Low ingredient warning</p>
          <p className="mt-1">
            {lowStockIngredients.length} ingredient{lowStockIngredients.length === 1 ? "" : "s"} need restocking:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-amber-200/90">
            {lowStockIngredients.map((ingredient) => (
              <li key={ingredient.id}>
                {ingredient.name} — {formatNumber(ingredient.quantity)} {ingredient.quantity_unit}
                {ingredient.threshold !== null ? ` (threshold ${formatNumber(ingredient.threshold)})` : ""}
                {isIngredientOutOfStock(ingredient) ? " · out of stock" : " · below threshold"}
              </li>
            ))}
          </ul>
        </div>
      )}

      <DataState
        loading={loading}
        error={error}
        empty={!loading && !error && !hasRows}
        emptyLabel={
          searchQuery || showLowStockOnly
            ? "No ingredients match your filters."
            : "No ingredients yet."
        }
      />

      {hasRows && !loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-base">
            <thead className="bg-muted text-left text-sm uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Quantity</th>
                <th className="px-3 py-3">Threshold</th>
                <th className="px-3 py-3">Unit</th>
                <th className="px-3 py-3">Seller</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredIngredients.map((ingredient) => {
                const lowStock = isIngredientLowStock(ingredient);
                const outOfStock = isIngredientOutOfStock(ingredient);

                return (
                <tr
                  key={ingredient.id}
                  className={
                    outOfStock
                      ? "bg-rose-500/10 hover:bg-rose-500/15"
                      : lowStock
                        ? "bg-amber-500/10 hover:bg-amber-500/15"
                        : "hover:bg-muted/40"
                  }
                >
                  <td className="px-3 py-3 text-text">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{ingredient.name}</span>
                      {outOfStock ? (
                        <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-300">
                          Out of stock
                        </span>
                      ) : lowStock ? (
                        <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                          Low stock
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className={`px-3 py-3 ${outOfStock || lowStock ? "font-medium text-text" : "text-muted-foreground"}`}>
                    {formatNumber(ingredient.quantity)}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{formatNumber(ingredient.threshold)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{ingredient.quantity_unit}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    <div>{ingredient.seller_name ?? "-"}</div>
                    <div className="text-sm">{ingredient.seller_phone ?? ingredient.seller_email ?? ""}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(ingredient)}
                        className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:text-text"
                        disabled={saving}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteIngredient(ingredient)}
                        className="rounded-md border border-primary/50 px-2 py-1 text-sm text-primary"
                        disabled={saving}
                      >
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
      )}

      <EntityModal open={isAddOpen} title="Add Ingredient" onClose={() => setIsAddOpen(false)}>
        <IngredientForm form={form} onChange={setForm} onSubmit={submitAdd} saving={saving} submitLabel="Create Ingredient" />
      </EntityModal>

      <EntityModal open={Boolean(editingIngredient)} title="Edit Ingredient" onClose={() => setEditingIngredient(null)}>
        <IngredientForm form={form} onChange={setForm} onSubmit={submitEdit} saving={saving} submitLabel="Save Changes" />
      </EntityModal>

      <EntityModal open={Boolean(pendingDeleteIngredient)} title="Confirm ingredient deletion" onClose={() => setPendingDeleteIngredient(null)}>
        <div className="space-y-4">
          <p className="text-base text-muted-foreground">
            Delete ingredient <span className="font-semibold text-text">{pendingDeleteIngredient?.name}</span>? This action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPendingDeleteIngredient(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmDeleteIngredient()} disabled={saving}>
              {saving ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </EntityModal>
    </div>
  );
}

function IngredientForm({
  form,
  onChange,
  onSubmit,
  saving,
  submitLabel,
}: {
  form: IngredientFormState;
  onChange: (next: IngredientFormState) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
      <label className="block text-base text-muted-foreground">
        <span className="mb-1 block">Name</span>
        <input
          required
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-base text-muted-foreground">
          <span className="mb-1 block">Quantity</span>
          <input
            required
            min="0"
            step="0.01"
            type="number"
            value={form.quantity}
            onChange={(event) => onChange({ ...form, quantity: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
          />
        </label>

        <label className="block text-base text-muted-foreground">
          <span className="mb-1 block">Threshold</span>
          <input
            min="0"
            step="0.01"
            type="number"
            value={form.threshold}
            onChange={(event) => onChange({ ...form, threshold: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
          />
        </label>
      </div>

      <label className="block text-base text-muted-foreground">
        <span className="mb-1 block">Quantity unit</span>
        <select
          value={form.quantity_unit}
          onChange={(event) => onChange({ ...form, quantity_unit: event.target.value as InventoryUnit })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
        >
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-base text-muted-foreground">
        <span className="mb-1 block">Seller name</span>
        <input
          value={form.seller_name}
          onChange={(event) => onChange({ ...form, seller_name: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-base text-muted-foreground">
          <span className="mb-1 block">Seller phone</span>
          <input
            value={form.seller_phone}
            onChange={(event) => onChange({ ...form, seller_phone: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
          />
        </label>

        <label className="block text-base text-muted-foreground">
          <span className="mb-1 block">Seller email</span>
          <input
            type="email"
            value={form.seller_email}
            onChange={(event) => onChange({ ...form, seller_email: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
          />
        </label>
      </div>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
