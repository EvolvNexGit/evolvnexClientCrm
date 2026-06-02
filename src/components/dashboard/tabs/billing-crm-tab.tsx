"use client";

import dynamic from "next/dynamic";
import type { BillingSubTab } from "@/lib/billing-types";

const CustomerTab = dynamic(() => import("@/components/dashboard/tabs/customer-tab"));
const ProductTab = dynamic(() => import("@/components/dashboard/tabs/product-tab"));
const TransactionTab = dynamic(() => import("@/components/dashboard/tabs/transaction-tab"));

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
