"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchActiveOrders, updateBillStatus } from "@/lib/billing-queries";
import type { TransactionRecord } from "@/lib/billing-types";

const ORDERS_POLL_MS = 15_000;

export function useOrders(clientId: string) {
  const [orders, setOrders] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const next = await fetchActiveOrders(clientId);
      setOrders(next);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      void refresh();
    }, ORDERS_POLL_MS);

    return () => clearInterval(intervalId);
  }, [refresh]);

  const updateStatus = useCallback(
    async (billId: string, status: "pending" | "accepted" | "delivered") => {
      await updateBillStatus(clientId, billId, status);

      if (status === "delivered") {
        setOrders((current) => current.filter((order) => order.id !== billId));
        return;
      }

      setOrders((current) =>
        current.map((order) => (order.id === billId ? { ...order, status } : order)),
      );
    },
    [clientId],
  );

  return {
    orders,
    loading,
    error,
    refresh,
    updateStatus,
  };
}
