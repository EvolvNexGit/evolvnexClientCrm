"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCustomers, fetchTransactionsSince } from "@/lib/billing-queries";
import {
  buildCafeSummaryAnalytics,
  type CafeSummaryAnalytics,
} from "@/lib/cafe-summary-analytics";
import {
  getIstTodayYmd,
  resolveCafeSummaryRanges,
  type CafeSummaryRangePreset,
} from "@/lib/cafe-summary-time";
import { fetchIngredients } from "@/lib/inventory-queries";
import { getSupabaseClient } from "@/lib/supabase";

type CustomRange = {
  from: string;
  to: string;
};

export function useCafeSummary(clientId: string, preset: CafeSummaryRangePreset, customRange: CustomRange) {
  const [analytics, setAnalytics] = useState<CafeSummaryAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const ranges = useMemo(
    () => resolveCafeSummaryRanges(preset, customRange),
    [customRange.from, customRange.to, preset],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const sinceIso = new Date(ranges.previous.startMs).toISOString();
      const [transactions, customers, ingredients] = await Promise.all([
        fetchTransactionsSince(clientId, sinceIso),
        fetchCustomers(clientId),
        fetchIngredients(clientId),
      ]);

      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("Missing Supabase environment variables.");
      }

      const today = getIstTodayYmd();
      const { count, error: appointmentsError } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("date", today)
        .in("status", ["tentative", "booked"]);

      if (appointmentsError) {
        throw appointmentsError;
      }

      const nextAnalytics = buildCafeSummaryAnalytics({
        transactions,
        customers,
        ingredients,
        appointmentsToday: count ?? 0,
        currentRange: ranges.current,
        previousRange: ranges.previous,
      });

      setAnalytics(nextAnalytics);
      setRefreshedAt(new Date());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to load cafe summary.");
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [clientId, ranges.current, ranges.previous]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    analytics,
    loading,
    error,
    refreshedAt,
    refresh,
    ranges,
  };
}
