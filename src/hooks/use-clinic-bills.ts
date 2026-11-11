"use client";

import { useCallback, useState } from "react";
import { fetchClinicBillsPage, markClinicBillPaid } from "@/lib/clinic-billing-queries";
import type { ClinicBillFilter, ClinicBillRecord, ClinicPaymentMode } from "@/lib/clinic-billing-types";
import { usePagedList } from "@/hooks/use-paged-list";

export function useClinicBills(clientId: string, filter: ClinicBillFilter) {
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { items, loading, loadingMore, error, hasMore, totalCount, refresh, showMore, showAll } =
    usePagedList<ClinicBillRecord>({
      resetKey: `${clientId}:${filter}`,
      clearOnKeyChange: true,
      fetchPage: ({ limit, offset }) => fetchClinicBillsPage(clientId, { limit, offset, filter }),
    });

  const markPaid = useCallback(
    async (billId: string, mode: ClinicPaymentMode): Promise<boolean> => {
      setSaving(true);
      setActionError(null);
      try {
        await markClinicBillPaid(clientId, billId, mode);
        await refresh();
        return true;
      } catch (saveError) {
        setActionError(saveError instanceof Error ? saveError.message : "Unable to mark the bill paid.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const clearActionError = useCallback(() => setActionError(null), []);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    totalCount,
    saving,
    actionError,
    clearActionError,
    refresh,
    showMore,
    showAll,
    markPaid,
  };
}
