"use client";

import { CustomerTable } from "@/components/dashboard/billing/customer-table";
import { useCustomers } from "@/hooks/use-customers";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagedList } from "@/hooks/use-paged-list";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { fetchCustomersPage } from "@/lib/billing-queries";
import type { CustomerRecord } from "@/lib/billing-types";

export default function CustomerTab({ clientId }: { clientId: string }) {
  const customerState = useCustomers(clientId);
  const [searchQuery, setSearchQuery] = usePersistentState("customer-table-search", "");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const pagedCustomers = usePagedList<CustomerRecord>({
    resetKey: `${clientId}|${debouncedSearch}`,
    enabled: Boolean(clientId),
    fetchPage: ({ limit, offset }) =>
      fetchCustomersPage(clientId, { limit, offset, search: debouncedSearch }),
  });

  async function handleAdd(...args: Parameters<typeof customerState.addCustomer>) {
    const created = await customerState.addCustomer(...args);
    await pagedCustomers.refresh();
    return created;
  }

  async function handleEdit(...args: Parameters<typeof customerState.editCustomer>) {
    await customerState.editCustomer(...args);
    await pagedCustomers.refresh();
  }

  async function handleDelete(...args: Parameters<typeof customerState.removeCustomer>) {
    await customerState.removeCustomer(...args);
    await pagedCustomers.refresh();
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text">Billing CRM</h2>
          <p className="mt-1 text-base text-muted-foreground">Client scope: {clientId}</p>
        </div>
      </div>

      <CustomerTable
        customers={pagedCustomers.items}
        loading={pagedCustomers.loading}
        saving={customerState.saving}
        error={pagedCustomers.error ?? customerState.error}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        pagination={{
          totalCount: pagedCustomers.totalCount,
          hasMore: pagedCustomers.hasMore,
          loadingMore: pagedCustomers.loadingMore,
          onShowMore: () => void pagedCustomers.showMore(),
          onShowAll: () => void pagedCustomers.showAll(),
        }}
      />
    </section>
  );
}
