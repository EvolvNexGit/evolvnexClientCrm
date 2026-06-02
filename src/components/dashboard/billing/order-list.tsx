"use client";

import { useMemo, useState } from "react";
import { DataState } from "@/components/dashboard/billing/data-state";
import { OrderWaitBadge } from "@/components/dashboard/billing/order-wait-badge";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import type { TransactionRecord } from "@/lib/billing-types";
import { formatUtcToIstTimeLabel, parseDbTimestamp } from "@/lib/time-utils";

type OrderListProps = {
  orders: TransactionRecord[];
  loading: boolean;
  error: string | null;
  onUpdateStatus: (id: string, status: "pending" | "accepted" | "delivered") => Promise<void>;
};

type OrderStatus = "pending" | "accepted" | "delivered";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function getServiceType(order: TransactionRecord) {
  return order.table_number ? "Dine in" : "Takeaway";
}

function isQrOrder(order: TransactionRecord) {
  return Boolean(order.table_number);
}

function formatStatusLabel(value: string | null | undefined) {
  return value ? value.toUpperCase() : "(NONE)";
}

function statusPillClass(status: OrderStatus | null | undefined) {
  switch (status) {
    case "accepted":
      return "bg-orange-400 text-black hover:bg-orange-300";
    case "delivered":
      return "bg-emerald-500 text-black hover:bg-emerald-400";
    case "pending":
    default:
      return "bg-yellow-400 text-black hover:bg-yellow-300";
  }
}

function OrderCard({
  order,
  onStatusClick,
}: {
  order: TransactionRecord;
  onStatusClick: (order: TransactionRecord) => void;
}) {
  const serviceType = getServiceType(order);
  const qrOrder = isQrOrder(order);
  const currentStatus = (order.status ?? "pending") as OrderStatus;
  const orderId = order.order_id?.trim();

  return (
    <article className="w-[min(100%,17.5rem)] shrink-0 snap-start">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#141414] shadow-soft">
        <div className="flex items-center justify-between gap-3 bg-[#1f1f1f] px-4 py-2.5">
          <span className="text-sm font-semibold tracking-wide text-primary">{qrOrder ? "QR" : "POS"}</span>
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-sm font-medium text-white">{serviceType}</span>
            <OrderWaitBadge createdAt={order.created_at} />
          </div>
        </div>

        <div className="space-y-4 px-4 pb-4 pt-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-3xl font-bold leading-none tracking-tight text-white">{formatCurrency(order.final_amount)}</p>
            <div className="text-right">
              {orderId ? (
                <>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-white/45">Order id</p>
                  <p className="truncate text-sm font-medium text-white/90" title={orderId}>
                    {orderId}
                  </p>
                </>
              ) : null}
              <p className={`text-sm text-white/55 ${orderId ? "mt-0.5" : ""}`}>
                {formatUtcToIstTimeLabel(order.created_at)}
              </p>
            </div>
          </div>

          <ul className="min-h-[4.5rem] space-y-1.5 border-t border-white/10 pt-3">
            {order.items.map((item) => (
              <li key={item.id} className="text-sm leading-snug text-white/70">
                {item.quantity} x {item.productName}
              </li>
            ))}
          </ul>

          {order.table_number && (
            <p className="text-xs font-medium uppercase tracking-wide text-white/45">Table {order.table_number}</p>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => onStatusClick(order)}
              className={`rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wider transition ${statusPillClass(currentStatus)}`}
            >
              {currentStatus}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function OrderList({ orders, loading, error, onUpdateStatus }: OrderListProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<TransactionRecord | null>(null);
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const sortedOrders = useMemo(
    () =>
      [...orders].sort(
        (left, right) =>
          (parseDbTimestamp(left.created_at)?.getTime() ?? 0) - (parseDbTimestamp(right.created_at)?.getTime() ?? 0),
      ),
    [orders],
  );

  function openStatusModal(order: TransactionRecord) {
    setUpdateError(null);
    setSelectedOrder(order);
    setPendingStatus((order.status ?? "pending") as OrderStatus);
    setConfirmOpen(true);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm font-medium text-primary">
        Air Menu Orders, via Table QR · last 24 hours
      </p>

      <DataState
        loading={loading}
        error={error}
        empty={!loading && !error && sortedOrders.length === 0}
        emptyLabel="No open orders in the last 24 hours."
      />

      {updateError && <p className="text-sm text-rose-400">{updateError}</p>}

      {!loading && !error && sortedOrders.length > 0 && (
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2 snap-x snap-mandatory">
          {sortedOrders.map((order) => (
            <OrderCard key={order.id} order={order} onStatusClick={openStatusModal} />
          ))}
        </div>
      )}

      <EntityModal
        open={confirmOpen}
        title="Update order status"
        contentClassName="sm:max-w-md"
        onClose={() => {
          if (isUpdating) {
            return;
          }
          setConfirmOpen(false);
          setSelectedOrder(null);
          setPendingStatus(null);
        }}
      >
        <div className="space-y-4">
          {selectedOrder && (
            <p className="text-sm text-muted-foreground">
              {selectedOrder.order_id?.trim() ? `${selectedOrder.order_id.trim()} · ` : ""}
              {getServiceType(selectedOrder)} · {formatCurrency(selectedOrder.final_amount)}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {(["pending", "accepted", "delivered"] as const).map((status) => {
              const active = pendingStatus === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setPendingStatus(status)}
                  className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                    active ? statusPillClass(status) : "border border-border bg-background text-muted-foreground"
                  }`}
                >
                  {status}
                </button>
              );
            })}
          </div>

          {pendingStatus === "delivered" && (
            <p className="text-sm text-amber-200/90">Delivered orders are removed from the active queue.</p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => {
                if (!isUpdating) {
                  setConfirmOpen(false);
                  setSelectedOrder(null);
                  setPendingStatus(null);
                }
              }}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-11 w-full sm:w-auto"
              disabled={isUpdating || !selectedOrder || !pendingStatus}
              onClick={async () => {
                if (!selectedOrder || !pendingStatus) {
                  return;
                }

                setIsUpdating(true);
                setUpdateError(null);
                try {
                  await onUpdateStatus(selectedOrder.id, pendingStatus);
                  setConfirmOpen(false);
                  setSelectedOrder(null);
                  setPendingStatus(null);
                } catch (statusError) {
                  setUpdateError(
                    statusError instanceof Error ? statusError.message : "Unable to update order status.",
                  );
                } finally {
                  setIsUpdating(false);
                }
              }}
            >
              {isUpdating ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </EntityModal>
    </div>
  );
}
