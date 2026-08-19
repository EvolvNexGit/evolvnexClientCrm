"use client";

import { useState } from "react";
import { Download, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import { RecordCard, ResponsiveRecordList } from "@/components/ui/responsive";
import { usePersistentState } from "@/hooks/use-persistent-state";
import type { ProductPayload, ProductRecord } from "@/lib/billing-types";
import { formatUtcToIst } from "@/lib/time-utils";

type ProductTableProps = {
  products: ProductRecord[];
  productTypes: string[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  productTypeFilter: string;
  onProductTypeFilterChange: (value: string) => void;
  onAdd: (payload: ProductPayload) => Promise<void>;
  onEdit: (productId: string, payload: Partial<ProductPayload>) => Promise<void>;
  onToggle: (productId: string, isActive: boolean) => Promise<void>;
  pagination: {
    totalCount: number | null;
    hasMore: boolean;
    loadingMore: boolean;
    onShowMore: () => void;
    onShowAll: () => void;
  };
};

type ProductFormState = {
  name: string;
  price: string;
  type: string;
};

const initialForm: ProductFormState = {
  name: "",
  price: "",
  type: "",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function ProductTable({
  products,
  productTypes,
  loading,
  error,
  saving,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  productTypeFilter,
  onProductTypeFilterChange,
  onAdd,
  onEdit,
  onToggle,
  pagination,
}: ProductTableProps) {
  const [isAddOpen, setIsAddOpen] = usePersistentState("product-table-is-add-open", false);
  const [editingProduct, setEditingProduct] = usePersistentState<ProductRecord | null>(
    "product-table-editing-product",
    null,
  );
  const [form, setForm] = usePersistentState<ProductFormState>("product-table-form", initialForm);
  const [actionError, setActionError] = usePersistentState<string | null>("product-table-action-error", null);

  const hasRows = products.length > 0;

  function downloadCsv(filename: string, rows: string[][]) {
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportProductsCsv() {
    const rows = [
      ["Name", "Price", "Type", "Status", "Created"],
      ...products.map((product) => [
        product.name,
        String(product.price),
        product.type ?? "",
        product.is_active ? "Active" : "Inactive",
        formatUtcToIst(product.created_at),
      ]),
    ];
    downloadCsv("products.csv", rows);
  }

  function resetForm() {
    setForm(initialForm);
    setActionError(null);
  }

  function openAdd() {
    resetForm();
    setIsAddOpen(true);
  }

  function openEdit(product: ProductRecord) {
    setActionError(null);
    setEditingProduct(product);
    setForm({
      name: product.name,
      price: String(product.price),
      type: product.type ?? "",
    });
  }

  async function submitAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    try {
      await onAdd({
        name: form.name.trim(),
        price: Number(form.price),
        type: form.type.trim() || null,
      });
      setIsAddOpen(false);
      resetForm();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Unable to add product.");
    }
  }

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingProduct) {
      return;
    }

    setActionError(null);

    try {
      await onEdit(editingProduct.id, {
        name: form.name.trim(),
        price: Number(form.price),
        type: form.type.trim() || null,
      });
      setEditingProduct(null);
      resetForm();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Unable to update product.");
    }
  }

  return (
    <div className="space-y-4 rounded-[28px] border border-white/10 bg-[#080808] p-5 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:p-6">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={exportProductsCsv}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            aria-label="Download products CSV"
            title="Download CSV"
          >
            <Download className="h-5 w-5" />
          </button>
          <Button type="button" onClick={openAdd} className="h-11 rounded-2xl bg-red-600 px-6 text-base font-semibold text-white hover:bg-red-500">
            Add product
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.7fr_0.8fr_0.8fr]">
        <label className="relative block text-sm text-white/70">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by product name or type"
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-text placeholder:text-muted-foreground outline-none transition focus:border-red-500/60 focus:ring-2 focus:ring-red-500/20"
          />
        </label>

        <label className="relative block text-sm text-white/70">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <select
            value={productTypeFilter}
            onChange={(e) => onProductTypeFilterChange(e.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-text outline-none transition focus:border-red-500/60 focus:ring-2 focus:ring-red-500/20"
          >
            <option value="">All types</option>
            {productTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="relative block text-sm text-white/70">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-text outline-none transition focus:border-red-500/60 focus:ring-2 focus:ring-red-500/20"
          >
            <option value="">Status</option>
            <option value="active">Active</option>
            <option value="inactive">Not Active</option>
          </select>
        </label>
      </div>

      {actionError && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-sm text-primary">{actionError}</div>
      )}

      <DataState
        loading={loading && !hasRows}
        error={error}
        empty={!loading && !error && !hasRows}
        emptyLabel={searchQuery ? "No products match your search." : "No products found."}
      />

      {hasRows && !error && (
        <ResponsiveRecordList
          cards={products.map((product) => (
            <RecordCard key={product.id} className="border-white/10 bg-[#101010]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{product.name}</p>
                  <p className="mt-1 text-sm text-white/55">{product.type ?? "-"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-white">{formatCurrency(product.price)}</p>
                  <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${
                    product.is_active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}>{product.is_active ? "ACTIVE" : "NOT ACTIVE"}</span>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(product)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-sm font-semibold text-white/80"
                  disabled={saving}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void onToggle(product.id, !product.is_active)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/10 text-sm font-semibold text-white/80"
                  disabled={saving}
                >
                  {product.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </RecordCard>
          ))}
          table={
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-base">
            <thead className="bg-black/20 text-left text-sm uppercase tracking-[0.2em] text-white/45">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Price</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-4">
                    <div className="font-medium text-white">{product.name}</div>
                    <div className="text-xs text-white/55">{product.type ?? "-"}</div>
                  </td>
                  <td className="px-4 py-4 text-white/80">{formatCurrency(product.price)}</td>
                  <td className="px-4 py-4 text-white/70">{product.type ?? "-"}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      product.is_active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"
                    }`}>{product.is_active ? "ACTIVE" : "NOT ACTIVE"}</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end items-center gap-2 min-w-[160px]">
                      <button
                        type="button"
                        onClick={() => openEdit(product)}
                        className="inline-flex items-center justify-center w-24 gap-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/70 transition hover:border-white/20 hover:text-white"
                        disabled={saving}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void onToggle(product.id, !product.is_active)}
                        className={`inline-flex items-center justify-center w-24 gap-1 rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                          product.is_active ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-white/10 bg-black/10 text-white/80"
                        }`}
                        disabled={saving}
                      >
                        {product.is_active ? "DEACTIVATE" : "ACTIVATE"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          }
        />
      )}

      <ListPaginationControls
        loadedCount={products.length}
        totalCount={pagination.totalCount}
        hasMore={pagination.hasMore}
        loading={pagination.loadingMore}
        onShowMore={pagination.onShowMore}
        onShowAll={pagination.onShowAll}
        itemLabel="products"
      />

      <EntityModal open={isAddOpen} title="Add Product" onClose={() => setIsAddOpen(false)}>
        <ProductForm
          form={form}
          onChange={setForm}
          onSubmit={submitAdd}
          saving={saving}
          submitLabel="Create Product"
          availableTypes={productTypes}
        />
      </EntityModal>

      <EntityModal
        open={Boolean(editingProduct)}
        title="Edit Product"
        onClose={() => setEditingProduct(null)}
      >
        <ProductForm
          form={form}
          onChange={setForm}
          onSubmit={submitEdit}
          saving={saving}
          submitLabel="Save Changes"
          availableTypes={productTypes}
        />
      </EntityModal>
    </div>
  );
}

function ProductForm({
  form,
  onChange,
  onSubmit,
  saving,
  submitLabel,
  availableTypes,
}: {
  form: ProductFormState;
  onChange: (next: ProductFormState) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  saving: boolean;
  submitLabel: string;
  availableTypes: string[];
}) {
  const [showNewTypeInput, setShowNewTypeInput] = useState(false);

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

      <label className="block text-base text-muted-foreground">
        <span className="mb-1 block">Price</span>
        <input
          required
          min="0"
          step="0.01"
          type="number"
          value={form.price}
          onChange={(event) => onChange({ ...form, price: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
        />
      </label>

      <div className="space-y-2">
        <label className="block text-base text-muted-foreground">
          <span className="mb-1 block">Type</span>
          {!showNewTypeInput ? (
            <div className="flex gap-2">
              <select
                value={form.type}
                onChange={(event) => onChange({ ...form, type: event.target.value })}
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
              >
                <option value="">Select a type...</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewTypeInput(true)}
                className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:text-text"
              >
                + New
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                autoFocus
                value={form.type}
                onChange={(event) => onChange({ ...form, type: event.target.value })}
                placeholder="Enter new type"
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
              />
              <button
                type="button"
                onClick={() => {
                  setShowNewTypeInput(false);
                  onChange({ ...form, type: "" });
                }}
                className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:text-text"
              >
                Cancel
              </button>
            </div>
          )}
        </label>
      </div>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
