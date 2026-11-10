"use client";

import { fetchClinicBillsPage } from "@/lib/clinic-billing-queries";
import type { ClinicBillFilter, ClinicBillRecord } from "@/lib/clinic-billing-types";
import { usePagedList } from "@/hooks/use-paged-list";

export function useClinicBills(clientId: string, filter: ClinicBillFilter) {
  const { items, loading, loadingMore, error, hasMore, totalCount, refresh, showMore, showAll } =
    usePagedList<ClinicBillRecord>({
      resetKey: `${clientId}:${filter}`,
      fetchPage: ({ limit, offset }) => fetchClinicBillsPage(clientId, { limit, offset, filter }),
    });

  return { items, loading, loadingMore, error, hasMore, totalCount, refresh, showMore, showAll };
}
