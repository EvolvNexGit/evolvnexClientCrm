"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { mapTransactionRowToRecord, TRANSACTION_SELECT_QUERY } from "@/lib/billing-queries";
import type { TransactionRecord } from "@/lib/billing-types";

export function useRealtimeTransactions(initialTransactions: TransactionRecord[], clientId: string) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>(initialTransactions);
  const transactionsRef = useRef<TransactionRecord[]>(initialTransactions);

  useEffect(() => {
    setTransactions(initialTransactions);
    transactionsRef.current = initialTransactions;
  }, [initialTransactions]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !clientId) {
      return;
    }

    const channel = supabase
      .channel("realtime-bills")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bills",
          filter: `client_id=eq.${clientId}`,
        },
        async (payload) => {
          const newBillId = payload.new?.id;
          if (!newBillId) {
            return;
          }

          const billId = String(newBillId);
          if (transactionsRef.current.some((transaction) => transaction.id === billId)) {
            return;
          }

          const { data, error } = await supabase
            .from("bills")
            .select(TRANSACTION_SELECT_QUERY)
            .eq("client_id", clientId)
            .eq("id", billId)
            .maybeSingle();

          if (error || !data) {
            return;
          }

          const nextTransaction = mapTransactionRowToRecord(data);
          setTransactions((current) => {
            if (current.some((transaction) => transaction.id === nextTransaction.id)) {
              return current;
            }
            const updated = [nextTransaction, ...current];
            transactionsRef.current = updated;
            return updated;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId]);

  return transactions;
}
