"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
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

export default function IngredientTab({ clientId }: { clientId: string }) {
  const { ingredients, loading, saving, error, addIngredient, editIngredient, removeIngredient } = useIngredients(clientId);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<IngredientRecord | null>(null);
  const [pendingDeleteIngredient, setPendingDeleteIngredient] = useState<IngredientRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [form, setForm] = useState<IngredientFormState>(initialForm);

  const filteredIngredients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return ingredients;
    }

    return ingredients.filter((ingredient) => {
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
  }, [ingredients, searchQuery]);

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
          <h3 className="text-base font-semibold text-text">Ingredients</h3>
          <p className="text-sm text-muted-foreground">Manage ingredient inventory, supplier details, and thresholds.</p>
        </div>
        <Button type="button" onClick={openAdd}>
          Add Ingredient
        </Button>
      </div>

      <div>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by ingredient or supplier"
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
        emptyLabel={searchQuery ? "No ingredients match your search." : "No ingredients yet."}
      />

      {hasRows && !loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
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
              {filteredIngredients.map((ingredient) => (
                <tr key={ingredient.id} className="hover:bg-muted/40">
                  <td className="px-3 py-3 text-text">{ingredient.name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{formatNumber(ingredient.quantity)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{formatNumber(ingredient.threshold)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{ingredient.quantity_unit}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    <div>{ingredient.seller_name ?? "-"}</div>
                    <div className="text-xs">{ingredient.seller_phone ?? ingredient.seller_email ?? ""}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(ingredient)}
                        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-text"
                        disabled={saving}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteIngredient(ingredient)}
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

      <EntityModal open={isAddOpen} title="Add Ingredient" onClose={() => setIsAddOpen(false)}>
        <IngredientForm form={form} onChange={setForm} onSubmit={submitAdd} saving={saving} submitLabel="Create Ingredient" />
      </EntityModal>

      <EntityModal open={Boolean(editingIngredient)} title="Edit Ingredient" onClose={() => setEditingIngredient(null)}>
        <IngredientForm form={form} onChange={setForm} onSubmit={submitEdit} saving={saving} submitLabel="Save Changes" />
      </EntityModal>

      <EntityModal open={Boolean(pendingDeleteIngredient)} title="Confirm ingredient deletion" onClose={() => setPendingDeleteIngredient(null)}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
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
      <label className="block text-sm text-muted-foreground">
        <span className="mb-1 block">Name</span>
        <input
          required
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
        />
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
          <span className="mb-1 block">Threshold</span>
          <input
            min="0"
            step="0.01"
            type="number"
            value={form.threshold}
            onChange={(event) => onChange({ ...form, threshold: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
          />
        </label>
      </div>

      <label className="block text-sm text-muted-foreground">
        <span className="mb-1 block">Quantity unit</span>
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

      <label className="block text-sm text-muted-foreground">
        <span className="mb-1 block">Seller name</span>
        <input
          value={form.seller_name}
          onChange={(event) => onChange({ ...form, seller_name: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-muted-foreground">
          <span className="mb-1 block">Seller phone</span>
          <input
            value={form.seller_phone}
            onChange={(event) => onChange({ ...form, seller_phone: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
          />
        </label>

        <label className="block text-sm text-muted-foreground">
          <span className="mb-1 block">Seller email</span>
          <input
            type="email"
            value={form.seller_email}
            onChange={(event) => onChange({ ...form, seller_email: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
          />
        </label>
      </div>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
