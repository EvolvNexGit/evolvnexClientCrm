export type OrderAlertPayload = {
  orderId: string;
  tableNumber?: string | null;
  finalAmount?: number | null;
};

export type OrderAlertCopy = {
  title: string;
  body: string;
  tag: string;
  url: string;
  orderId: string;
  tableNumber: string | null;
  finalAmount: number;
};

export function formatOrderAlertAmount(value: number | null | undefined) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount)}`;
}

export function getOrdersAlertPath() {
  return "/dashboard/orders";
}

export function buildOrderAlertCopy(payload: OrderAlertPayload): OrderAlertCopy {
  const tableLabel = payload.tableNumber ? `Table ${payload.tableNumber}` : "Walk-in";
  const finalAmount = Number.isFinite(Number(payload.finalAmount)) ? Number(payload.finalAmount) : 0;

  return {
    title: "New Order",
    body: `${tableLabel} • ${formatOrderAlertAmount(finalAmount)}`,
    tag: `new-order-${payload.orderId}`,
    url: getOrdersAlertPath(),
    orderId: payload.orderId,
    tableNumber: payload.tableNumber ?? null,
    finalAmount,
  };
}
