"use client";

import { TransactionList } from "@/components/dashboard/billing/transaction-list";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagedList } from "@/hooks/use-paged-list";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useTransactions } from "@/hooks/use-transactions";
import { fetchTransactionsPage } from "@/lib/billing-queries";
import type { TransactionRecord } from "@/lib/billing-types";
import { triggerOrderAlert } from "@/lib/order-notifications";

const TEST_NOTIFICATION_TABLE_NUMBER = "4";
const TEST_NOTIFICATION_AMOUNT = 420;

export default function TransactionTab({ clientId }: { clientId: string }) {
  // Kept for the realtime new-order alert side effect (subscribes to the bills table).
  useTransactions(clientId);

  const [searchQuery, setSearchQuery] = usePersistentState("transaction-list-search", "");
  const [dateFrom, setDateFrom] = usePersistentState("transaction-list-date-from", "");
  const [dateTo, setDateTo] = usePersistentState("transaction-list-date-to", "");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const pagedTransactions = usePagedList<TransactionRecord>({
    resetKey: `${clientId}|${debouncedSearch}|${dateFrom}|${dateTo}`,
    enabled: Boolean(clientId),
    fetchPage: ({ limit, offset }) =>
      fetchTransactionsPage(clientId, {
        limit,
        offset,
        search: debouncedSearch,
        dateFrom: dateFrom ? `${dateFrom}T00:00:00` : null,
        dateTo: dateTo ? `${dateTo}T23:59:59` : null,
      }),
  });

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text">Transactions</h2>
          <p className="mt-1 text-base text-muted-foreground">
            Read-only bill history. Order id on each row; expand for Bill id and line items.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            triggerOrderAlert({
              orderId: `test-${Date.now()}`,
              tableNumber: TEST_NOTIFICATION_TABLE_NUMBER,
              finalAmount: TEST_NOTIFICATION_AMOUNT,
            })
          }
        >
          Test Notification
        </Button>
      </div>

      <TransactionList
        transactions={pagedTransactions.items}
        loading={pagedTransactions.loading}
        error={pagedTransactions.error}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        pagination={{
          totalCount: pagedTransactions.totalCount,
          hasMore: pagedTransactions.hasMore,
          loadingMore: pagedTransactions.loadingMore,
          onShowMore: () => void pagedTransactions.showMore(),
          onShowAll: () => void pagedTransactions.showAll(),
        }}
      />
    </section>
  );
}
