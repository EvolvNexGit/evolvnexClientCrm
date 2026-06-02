"use client";

import { OrderList } from "@/components/dashboard/billing/order-list";
import { useOrders } from "@/hooks/use-orders";

export default function OrdersTab({ clientId }: { clientId: string }) {
  const orderState = useOrders(clientId);

  return (
    <OrderList
      orders={orderState.orders}
      loading={orderState.loading}
      error={orderState.error}
      onUpdateStatus={orderState.updateStatus}
    />
  );
}
