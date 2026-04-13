"use client";

import { useMemo } from "react";
import { CustomerTable } from "@/components/dashboard/billing/customer-table";
import { ProductTable } from "@/components/dashboard/billing/product-table";
import { TransactionList } from "@/components/dashboard/billing/transaction-list";
import { useCustomers } from "@/hooks/use-customers";
import { useProducts } from "@/hooks/use-products";
import { useTransactions } from "@/hooks/use-transactions";
import type { BillingSubTab } from "@/lib/billing-types";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export default function BillingCrmTab({
  clientId,
  activeSubTab,
}: {
  clientId: string;
  activeSubTab: BillingSubTab;
}) {
  const customerState = useCustomers(clientId);
  const productState = useProducts(clientId);
  const transactionState = useTransactions(clientId);

  const analytics = useMemo(() => {
    const totalCustomers = customerState.customers.length;
    const totalBills = transactionState.transactions.length;
    const totalRevenue = transactionState.transactions.reduce(
      (sum, transaction) => sum + transaction.final_amount,
      0,
    );

    const customerSpend = new Map<string, number>();
    transactionState.transactions.forEach((transaction) => {
      if (!transaction.customerName) {
        return;
      }

      const previous = customerSpend.get(transaction.customerName) ?? 0;
      customerSpend.set(transaction.customerName, previous + transaction.final_amount);
    });

    const topCustomers = Array.from(customerSpend.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 3);

    return {
      totalCustomers,
      totalBills,
      totalRevenue,
      topCustomers,
    };
  }, [customerState.customers, transactionState.transactions]);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text">Billing CRM</h2>
          <p className="mt-1 text-sm text-muted-foreground">Client scope: {clientId}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-border bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Customers</div>
          <div className="mt-2 text-xl font-semibold text-text">{analytics.totalCustomers}</div>
        </article>
        <article className="rounded-xl border border-border bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Revenue</div>
          <div className="mt-2 text-xl font-semibold text-primary">{formatCurrency(analytics.totalRevenue)}</div>
        </article>
        <article className="rounded-xl border border-border bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Bills</div>
          <div className="mt-2 text-xl font-semibold text-text">{analytics.totalBills}</div>
        </article>
        <article className="rounded-xl border border-border bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Top Customers</div>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {analytics.topCustomers.length === 0 && <div>No customer spend data yet.</div>}
            {analytics.topCustomers.map((customer) => (
              <div key={customer.name} className="flex items-center justify-between gap-2">
                <span className="truncate text-text">{customer.name}</span>
                <span>{formatCurrency(customer.amount)}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      {activeSubTab === "customer" && (
        <CustomerTable
          customers={customerState.customers}
          loading={customerState.loading}
          saving={customerState.saving}
          error={customerState.error}
          onAdd={customerState.addCustomer}
          onEdit={customerState.editCustomer}
          onDelete={customerState.removeCustomer}
        />
      )}

      {activeSubTab === "product" && (
        <ProductTable
          products={productState.products}
          loading={productState.loading}
          saving={productState.saving}
          error={productState.error}
          onAdd={productState.addProduct}
          onEdit={productState.editProduct}
          onToggle={productState.toggleProduct}
        />
      )}

      {activeSubTab === "transaction" && (
        <TransactionList
          transactions={transactionState.transactions}
          loading={transactionState.loading}
          error={transactionState.error}
        />
      )}
    </section>
  );
}
