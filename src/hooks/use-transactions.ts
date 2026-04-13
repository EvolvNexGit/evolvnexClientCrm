"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchTransactions } from "@/lib/billing-queries";
import type { TransactionRecord } from "@/lib/billing-types";

export function useTransactions(clientId: string) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const next = await fetchTransactions(clientId);
      setTransactions(next);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load transactions.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    transactions,
    loading,
    error,
    refresh,
  };
}
