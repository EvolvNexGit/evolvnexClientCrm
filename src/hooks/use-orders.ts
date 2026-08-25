"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchActiveOrders, updateBillStatus } from "@/lib/billing-queries";
import type { TransactionRecord } from "@/lib/billing-types";
import { getSupabaseClient } from "@/lib/supabase";

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

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !clientId) {
      return;
    }

    const channel = supabase
      .channel(`orders-queue-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bills",
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId, refresh]);

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
