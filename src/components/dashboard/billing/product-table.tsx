"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import type { ProductPayload, ProductRecord } from "@/lib/billing-types";

type ProductTableProps = {
  products: ProductRecord[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  onAdd: (payload: ProductPayload) => Promise<void>;
  onEdit: (productId: string, payload: Partial<ProductPayload>) => Promise<void>;
  onToggle: (productId: string, isActive: boolean) => Promise<void>;
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function ProductTable({
  products,
  loading,
  error,
  saving,
  onAdd,
  onEdit,
  onToggle,
}: ProductTableProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [form, setForm] = useState<ProductFormState>(initialForm);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return products;
    }

    return products.filter((product) => {
      const haystack = [product.name, product.type ?? ""].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [products, searchQuery]);

  const hasRows = useMemo(() => filteredProducts.length > 0, [filteredProducts]);

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
      ...filteredProducts.map((product) => [
        product.name,
        String(product.price),
        product.type ?? "",
        product.is_active ? "Active" : "Inactive",
        product.created_at,
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
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text">Products</h3>
          <p className="text-sm text-muted-foreground">All products are listed, including deactivated entries.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={exportProductsCsv} disabled={filteredProducts.length === 0}>
            Export CSV
          </Button>
          <Button type="button" onClick={openAdd}>Add Product</Button>
        </div>
      </div>

      <div>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by name or type"
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
        emptyLabel={searchQuery ? "No products match your search." : "No products found."}
      />

      {hasRows && !loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Price</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-muted/40">
                  <td className="px-3 py-3 text-text">{product.name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{formatCurrency(product.price)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{product.type ?? "-"}</td>
                  <td className="px-3 py-3 text-muted-foreground">{product.is_active ? "Active" : "Inactive"}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(product)}
                        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-text"
                        disabled={saving}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void onToggle(product.id, !product.is_active)}
                        className={`rounded-md border px-2 py-1 text-xs ${
                          product.is_active
                            ? "border-primary/50 text-primary"
                            : "border-emerald-500/50 text-emerald-400"
                        }`}
                        disabled={saving}
                      >
                        {product.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EntityModal open={isAddOpen} title="Add Product" onClose={() => setIsAddOpen(false)}>
        <ProductForm
          form={form}
          onChange={setForm}
          onSubmit={submitAdd}
          saving={saving}
          submitLabel="Create Product"
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
}: {
  form: ProductFormState;
  onChange: (next: ProductFormState) => void;
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

      <label className="block text-sm text-muted-foreground">
        <span className="mb-1 block">Price</span>
        <input
          required
          min="0"
          step="0.01"
          type="number"
          value={form.price}
          onChange={(event) => onChange({ ...form, price: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
        />
      </label>

      <label className="block text-sm text-muted-foreground">
        <span className="mb-1 block">Type</span>
        <input
          value={form.type}
          onChange={(event) => onChange({ ...form, type: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
        />
      </label>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
