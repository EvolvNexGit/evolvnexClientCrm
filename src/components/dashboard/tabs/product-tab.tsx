"use client";

import { ProductTable } from "@/components/dashboard/billing/product-table";
import { useProducts } from "@/hooks/use-products";

export default function ProductTab({ clientId }: { clientId: string }) {
  const productState = useProducts(clientId, { includeInactive: true });
  return (
    <section className="space-y-5">
      <ProductTable
        products={productState.products}
        productTypes={productState.productTypes}
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
