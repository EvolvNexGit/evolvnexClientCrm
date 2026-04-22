"use client";

import type { BillingSubTab } from "@/lib/billing-types";
import CustomerTab from "@/components/dashboard/tabs/customer-tab";
import ProductTab from "@/components/dashboard/tabs/product-tab";
import TransactionTab from "@/components/dashboard/tabs/transaction-tab";

export default function BillingCrmTab({
  clientId,
  activeSubTab,
}: {
  clientId: string;
  activeSubTab: BillingSubTab;
}) {
  const customerState = useCustomers(clientId);
  const productState = useProducts(clientId, { includeInactive: true });
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
    <>
      {activeSubTab === "customer" && <CustomerTab clientId={clientId} />}
      {activeSubTab === "product" && <ProductTab clientId={clientId} />}
      {activeSubTab === "transaction" && <TransactionTab clientId={clientId} />}
    </>
  );
}
