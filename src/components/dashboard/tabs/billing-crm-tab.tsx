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
  return (
    <>
      {activeSubTab === "customer" && <CustomerTab clientId={clientId} />}
      {activeSubTab === "product" && <ProductTab clientId={clientId} />}
      {activeSubTab === "transaction" && <TransactionTab clientId={clientId} />}
    </>
  );
}
