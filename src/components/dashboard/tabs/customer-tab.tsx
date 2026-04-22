"use client";

import { CustomerTable } from "@/components/dashboard/billing/customer-table";
import { useCustomers } from "@/hooks/use-customers";

export default function CustomerTab({ clientId }: { clientId: string }) {
  const customerState = useCustomers(clientId);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text">Billing CRM</h2>
          <p className="mt-1 text-sm text-muted-foreground">Client scope: {clientId}</p>
        </div>
      </div>

      <CustomerTable
        customers={customerState.customers}
        loading={customerState.loading}
        saving={customerState.saving}
        error={customerState.error}
        onAdd={customerState.addCustomer}
        onEdit={customerState.editCustomer}
        onDelete={customerState.removeCustomer}
      />
    </section>
  );
}