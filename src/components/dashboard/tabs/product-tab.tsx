"use client";

import { ProductTable } from "@/components/dashboard/billing/product-table";
import { useProducts } from "@/hooks/use-products";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagedList } from "@/hooks/use-paged-list";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { fetchProductsPage } from "@/lib/billing-queries";
import type { ProductRecord } from "@/lib/billing-types";

export default function ProductTab({ clientId }: { clientId: string }) {
  const productState = useProducts(clientId, { includeInactive: true });
  const [searchQuery, setSearchQuery] = usePersistentState("product-table-search", "");
  const [statusFilter, setStatusFilter] = usePersistentState("product-table-status-filter", "");
  const [productTypeFilter, setProductTypeFilter] = usePersistentState("product-table-type-filter", "");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const resetKey = `${clientId}|${debouncedSearch}|${statusFilter}|${productTypeFilter}`;

  const pagedProducts = usePagedList<ProductRecord>({
    resetKey,
    enabled: Boolean(clientId),
    fetchPage: ({ limit, offset }) =>
      fetchProductsPage(clientId, {
        limit,
        offset,
        search: debouncedSearch,
        status: statusFilter === "active" || statusFilter === "inactive" ? statusFilter : "all",
        type: productTypeFilter || null,
      }),
  });

  async function handleAdd(...args: Parameters<typeof productState.addProduct>) {
    await productState.addProduct(...args);
    await pagedProducts.refresh();
  }

  async function handleEdit(...args: Parameters<typeof productState.editProduct>) {
    await productState.editProduct(...args);
    await pagedProducts.refresh();
  }

  async function handleToggle(...args: Parameters<typeof productState.toggleProduct>) {
    await productState.toggleProduct(...args);
    await pagedProducts.refresh();
  }

  return (
    <section className="space-y-5">
      <ProductTable
        products={pagedProducts.items}
        productTypes={productState.productTypes}
        loading={pagedProducts.loading}
        saving={productState.saving}
        error={pagedProducts.error ?? productState.error}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        productTypeFilter={productTypeFilter}
        onProductTypeFilterChange={setProductTypeFilter}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onToggle={handleToggle}
        pagination={{
          totalCount: pagedProducts.totalCount,
          hasMore: pagedProducts.hasMore,
          loadingMore: pagedProducts.loadingMore,
          onShowMore: () => void pagedProducts.showMore(),
          onShowAll: () => void pagedProducts.showAll(),
        }}
      />
    </section>
  );
}
