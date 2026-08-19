"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MoreVertical, RotateCcw, PackagePlus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useIngredients } from "@/hooks/use-ingredients";
import { usePagedList } from "@/hooks/use-paged-list";
import { fetchIngredientsPage } from "@/lib/inventory-queries";
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

type MenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "accent";
  separatorBefore?: boolean;
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

function ActionsMenu({
  items,
  align = "right",
  label = "Open actions",
  disabled = false,
}: {
  items: MenuItem[];
  align?: "left" | "right";
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const visibleItems = items.filter(Boolean);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className="relative inline-flex" ref={rootRef}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted/60 hover:text-text disabled:cursor-not-allowed disabled:opacity-40 ${
          open ? "border-border bg-muted/70 text-text" : ""
        }`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-2 min-w-[220px] overflow-hidden rounded-2xl border border-border/80 bg-card/95 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-md ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {visibleItems.map((item) => (
            <div key={item.id}>
              {item.separatorBefore && <div className="my-1.5 h-px bg-border/70" />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) {
                    return;
                  }
                  setOpen(false);
                  item.onClick();
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.tone === "danger"
                    ? "text-primary hover:bg-primary/10"
                    : item.tone === "accent"
                      ? "text-text hover:bg-muted/70"
                      : "text-text hover:bg-muted/70"
                }`}
              >
                {item.icon && <span className="opacity-80">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IngredientTab({ clientId }: { clientId: string }) {
  const {
    ingredients,
    loading,
    saving,
    error,
    addIngredient,
    editIngredient,
    removeIngredient,
    resetIngredientStock,
    restockIngredientToThreshold,
    resetAllIngredientStock,
    restockAllIngredientsToThreshold,
  } = useIngredients(clientId);
  const [searchQuery, setSearchQuery] = usePersistentState("ingredient-tab-search", "");
  const [showLowStockOnly, setShowLowStockOnly] = usePersistentState("ingredient-tab-show-low-stock-only", false);
  const [showStockTools, setShowStockTools] = usePersistentState("ingredient-tab-show-stock-tools", true);
  const [isAddOpen, setIsAddOpen] = usePersistentState("ingredient-tab-is-add-open", false);
  const [editingIngredient, setEditingIngredient] = usePersistentState<IngredientRecord | null>(
    "ingredient-tab-editing-ingredient",
    null,
  );
  const [pendingDeleteIngredient, setPendingDeleteIngredient] = usePersistentState<IngredientRecord | null>(
    "ingredient-tab-pending-delete",
    null,
  );
  const [pendingStockAction, setPendingStockAction] = usePersistentState<
    | null
    | { type: "reset-all" }
    | { type: "restock-all" }
    | { type: "reset-one"; ingredient: IngredientRecord }
    | { type: "restock-one"; ingredient: IngredientRecord }
  >("ingredient-tab-pending-stock-action", null);
  const [actionError, setActionError] = usePersistentState<string | null>("ingredient-tab-action-error", null);
  const [form, setForm] = usePersistentState<IngredientFormState>("ingredient-tab-form", initialForm);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const pagedIngredients = usePagedList<IngredientRecord>({
    resetKey: `${clientId}|${debouncedSearch}|${showLowStockOnly ? "1" : "0"}`,
    enabled: Boolean(clientId),
    fetchPage: ({ limit, offset }) =>
      fetchIngredientsPage(clientId, {
        limit,
        offset,
        search: debouncedSearch,
        lowStockOnly: showLowStockOnly,
      }),
  });

  const displayedIngredients = pagedIngredients.items;

  const lowStockIngredients = useMemo(
    () => ingredients.filter((ingredient) => isIngredientNeedsRestock(ingredient)),
    [ingredients],
  );

  const hasRows = displayedIngredients.length > 0;

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
      await pagedIngredients.refresh();
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
      await pagedIngredients.refresh();
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
      await pagedIngredients.refresh();
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Unable to delete ingredient.");
    }
  }

  async function confirmStockAction() {
    if (!pendingStockAction) {
      return;
    }

    setActionError(null);

    try {
      if (pendingStockAction.type === "reset-all") {
        await resetAllIngredientStock();
      } else if (pendingStockAction.type === "restock-all") {
        await restockAllIngredientsToThreshold();
      } else if (pendingStockAction.type === "reset-one") {
        await resetIngredientStock(pendingStockAction.ingredient.id);
      } else {
        await restockIngredientToThreshold(
          pendingStockAction.ingredient.id,
          pendingStockAction.ingredient.threshold,
        );
      }

      setPendingStockAction(null);
      await pagedIngredients.refresh();
    } catch (stockError) {
      setActionError(stockError instanceof Error ? stockError.message : "Unable to update ingredient stock.");
    }
  }

  const stockActionTitle =
    pendingStockAction?.type === "reset-all"
      ? "Reset all stock to 0"
      : pendingStockAction?.type === "restock-all"
        ? "Set all stock to threshold"
        : pendingStockAction?.type === "reset-one"
          ? "Reset ingredient stock to 0"
          : pendingStockAction?.type === "restock-one"
            ? "Set ingredient stock to threshold"
            : "Confirm stock update";

  const stockActionDescription =
    pendingStockAction?.type === "reset-all"
      ? `Set quantity to 0 for all ${ingredients.length} ingredient${ingredients.length === 1 ? "" : "s"}?`
      : pendingStockAction?.type === "restock-all"
        ? `Set each ingredient quantity to its threshold for all ${ingredients.length} ingredient${ingredients.length === 1 ? "" : "s"}?`
        : pendingStockAction?.type === "reset-one"
          ? `Set quantity of ${pendingStockAction.ingredient.name} to 0?`
          : pendingStockAction?.type === "restock-one"
            ? `Set quantity of ${pendingStockAction.ingredient.name} to its threshold (${formatNumber(pendingStockAction.ingredient.threshold)} ${pendingStockAction.ingredient.quantity_unit})?`
            : "";

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          {showStockTools && (
            <ActionsMenu
              label="Bulk stock actions"
              disabled={saving || ingredients.length === 0}
              items={[
                {
                  id: "reset-all",
                  label: "Reset all to 0",
                  icon: <RotateCcw className="h-4 w-4" />,
                  onClick: () => setPendingStockAction({ type: "reset-all" }),
                  disabled: ingredients.length === 0,
                },
                {
                  id: "restock-all",
                  label: "Restock all to threshold",
                  icon: <PackagePlus className="h-4 w-4" />,
                  tone: "accent",
                  onClick: () => setPendingStockAction({ type: "restock-all" }),
                  disabled: ingredients.length === 0,
                },
              ]}
            />
          )}
          <Button type="button" onClick={openAdd}>
            Add Ingredient
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by ingredient or supplier"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:max-w-xl"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showLowStockOnly}
              onChange={(event) => setShowLowStockOnly(event.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Low stock only
          </label>
          <label className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showStockTools}
              onChange={(event) => setShowStockTools(event.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Show stock tools
          </label>
        </div>
      </div>

      {lowStockIngredients.length > 0 && (
        <p className="text-sm text-primary">
          {lowStockIngredients.length} ingredient{lowStockIngredients.length === 1 ? "" : "s"} below threshold or out of stock
        </p>
      )}

      {actionError && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-sm text-primary">{actionError}</div>
      )}

      {!loading && !error && lowStockIngredients.length > 0 && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-text">
          <p className="font-medium text-primary">Low ingredient warning</p>
          <p className="mt-1 text-muted-foreground">
            {lowStockIngredients.length} ingredient{lowStockIngredients.length === 1 ? "" : "s"} need restocking:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-text">
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
        loading={pagedIngredients.loading && !hasRows}
        error={pagedIngredients.error}
        empty={!pagedIngredients.loading && !pagedIngredients.error && !hasRows}
        emptyLabel={
          searchQuery || showLowStockOnly
            ? "No ingredients match your filters."
            : "No ingredients yet."
        }
      />

      {hasRows && !pagedIngredients.error && (
        <>
        <div className="space-y-3 xl:hidden">
          {displayedIngredients.map((ingredient) => {
            const lowStock = isIngredientLowStock(ingredient);
            const outOfStock = isIngredientOutOfStock(ingredient);
            const rowMenuItems: MenuItem[] = [
              ...(showStockTools
                ? [
                    {
                      id: `reset-${ingredient.id}`,
                      label: "Reset to 0",
                      icon: <RotateCcw className="h-4 w-4" />,
                      onClick: () => setPendingStockAction({ type: "reset-one", ingredient }),
                      disabled: saving || ingredient.quantity === 0,
                    },
                    {
                      id: `restock-${ingredient.id}`,
                      label: "Set to threshold",
                      icon: <PackagePlus className="h-4 w-4" />,
                      tone: "accent" as const,
                      onClick: () => setPendingStockAction({ type: "restock-one", ingredient }),
                      disabled: saving || ingredient.quantity === (ingredient.threshold ?? 0),
                    },
                  ]
                : []),
              {
                id: `edit-${ingredient.id}`,
                label: "Edit",
                icon: <Pencil className="h-4 w-4" />,
                onClick: () => openEdit(ingredient),
                disabled: saving,
                separatorBefore: showStockTools,
              },
              {
                id: `delete-${ingredient.id}`,
                label: "Delete",
                icon: <Trash2 className="h-4 w-4" />,
                tone: "danger",
                onClick: () => setPendingDeleteIngredient(ingredient),
                disabled: saving,
              },
            ];

            return (
              <article key={ingredient.id} className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-text">{ingredient.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatNumber(ingredient.quantity)} {ingredient.quantity_unit}
                      {ingredient.threshold !== null ? ` · threshold ${formatNumber(ingredient.threshold)}` : ""}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{ingredient.seller_name ?? "-"}</p>
                  </div>
                  <ActionsMenu label={`Actions for ${ingredient.name}`} disabled={saving} items={rowMenuItems} />
                </div>
                {outOfStock ? (
                  <span className="mt-2 inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Out of stock</span>
                ) : lowStock ? (
                  <span className="mt-2 inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Low stock</span>
                ) : null}
              </article>
            );
          })}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-border xl:block">
          <table className="min-w-full divide-y divide-border text-base">
            <thead className="bg-muted text-left text-sm uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Quantity</th>
                <th className="px-3 py-3">Threshold</th>
                <th className="px-3 py-3">Unit</th>
                <th className="px-3 py-3">Seller</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayedIngredients.map((ingredient) => {
                const lowStock = isIngredientLowStock(ingredient);
                const outOfStock = isIngredientOutOfStock(ingredient);
                const rowMenuItems: MenuItem[] = [
                  ...(showStockTools
                    ? [
                        {
                          id: `reset-${ingredient.id}`,
                          label: "Reset to 0",
                          icon: <RotateCcw className="h-4 w-4" />,
                          onClick: () => setPendingStockAction({ type: "reset-one", ingredient }),
                          disabled: saving || ingredient.quantity === 0,
                        },
                        {
                          id: `restock-${ingredient.id}`,
                          label: "Set to threshold",
                          icon: <PackagePlus className="h-4 w-4" />,
                          tone: "accent" as const,
                          onClick: () => setPendingStockAction({ type: "restock-one", ingredient }),
                          disabled: saving || ingredient.quantity === (ingredient.threshold ?? 0),
                        },
                      ]
                    : []),
                  {
                    id: `edit-${ingredient.id}`,
                    label: "Edit",
                    icon: <Pencil className="h-4 w-4" />,
                    onClick: () => openEdit(ingredient),
                    disabled: saving,
                    separatorBefore: showStockTools,
                  },
                  {
                    id: `delete-${ingredient.id}`,
                    label: "Delete",
                    icon: <Trash2 className="h-4 w-4" />,
                    tone: "danger",
                    onClick: () => setPendingDeleteIngredient(ingredient),
                    disabled: saving,
                  },
                ];

                return (
                <tr
                  key={ingredient.id}
                  className={
                    outOfStock || lowStock
                      ? "bg-primary/10 hover:bg-primary/15"
                      : "hover:bg-muted/40"
                  }
                >
                  <td className="px-3 py-3 text-text">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{ingredient.name}</span>
                      {outOfStock ? (
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          Out of stock
                        </span>
                      ) : lowStock ? (
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
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
                    <div className="flex justify-end">
                      <ActionsMenu label={`Actions for ${ingredient.name}`} disabled={saving} items={rowMenuItems} />
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      <ListPaginationControls
        loadedCount={displayedIngredients.length}
        totalCount={pagedIngredients.totalCount}
        hasMore={pagedIngredients.hasMore}
        loading={pagedIngredients.loadingMore}
        onShowMore={() => void pagedIngredients.showMore()}
        onShowAll={() => void pagedIngredients.showAll()}
        itemLabel="ingredients"
      />

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

      <EntityModal open={Boolean(pendingStockAction)} title={stockActionTitle} onClose={() => setPendingStockAction(null)}>
        <div className="space-y-4">
          <p className="text-base text-muted-foreground">{stockActionDescription}</p>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPendingStockAction(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmStockAction()} disabled={saving}>
              {saving ? "Updating..." : "Confirm"}
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
