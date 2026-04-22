"use client";

import { ProductTable } from "@/components/dashboard/billing/product-table";
import { useProducts } from "@/hooks/use-products";

export default function ProductTab({ clientId }: { clientId: string }) {
  const productState = useProducts(clientId);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text">Billing CRM</h2>
          <p className="mt-1 text-sm text-muted-foreground">Client scope: {clientId}</p>
        </div>
      </div>

      <ProductTable
        products={productState.products}
        loading={productState.loading}
        saving={productState.saving}
        error={productState.error}
        onAdd={productState.addProduct}
        onEdit={productState.editProduct}
        onToggle={productState.toggleProduct}
      />
    </section>
  );
}