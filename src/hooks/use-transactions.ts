"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { fetchTransactions } from "@/lib/billing-queries";
import type { TransactionRecord } from "@/lib/billing-types";
import {
  loadKnownOrderIds,
  saveKnownOrderIds,
  triggerOrderAlert,
} from "@/lib/order-notifications";

export function useTransactions(clientId: string) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const knownOrderIdsRef = useRef<Set<string>>(new Set<string>());
  const hasHydratedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const next = await fetchTransactions(clientId);
      setTransactions(next);
      next.forEach((transaction) => {
        knownOrderIdsRef.current.add(transaction.id);
      });
      saveKnownOrderIds(clientId, knownOrderIdsRef.current);
      hasHydratedRef.current = true;
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load transactions.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    knownOrderIdsRef.current = loadKnownOrderIds(clientId);
    hasHydratedRef.current = false;
    void refresh();
  }, [clientId, refresh]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !clientId) {
      return;
    }

    const channel = supabase
      .channel(`transactions-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bills",
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const persistKnownOrders = () => {
            saveKnownOrderIds(clientId, knownOrderIdsRef.current);
          };

          if (payload.eventType !== "INSERT") {
            void refresh();
            return;
          }

          const inserted = payload.new as Record<string, unknown> | null;
          const orderId = inserted?.id != null ? String(inserted.id) : "";
          if (!orderId) {
            void refresh();
            return;
          }

          if (!hasHydratedRef.current) {
            knownOrderIdsRef.current.add(orderId);
            persistKnownOrders();
            void refresh();
            return;
          }

          if (knownOrderIdsRef.current.has(orderId)) {
            void refresh();
            return;
          }

          knownOrderIdsRef.current.add(orderId);
          persistKnownOrders();
          triggerOrderAlert({
            orderId,
            tableNumber: inserted?.table_number != null ? String(inserted.table_number) : null,
            finalAmount: Number(inserted?.final_amount ?? 0),
          });
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId, refresh]);

  return {
    transactions,
    loading,
    error,
    refresh,
  };
}
