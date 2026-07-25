"use client";

import { useMemo, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { DataState } from "@/components/dashboard/billing/data-state";
import { Button } from "@/components/ui/button";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import { usePersistentState } from "@/hooks/use-persistent-state";
import type { TransactionRecord } from "@/lib/billing-types";
import { formatUtcToIst, formatUtcToIstDayMonth } from "@/lib/time-utils";

type TransactionListProps = {
  transactions: TransactionRecord[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  pagination: {
    totalCount: number | null;
    hasMore: boolean;
    loadingMore: boolean;
    onShowMore: () => void;
    onShowAll: () => void;
  };
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatStatusLabel(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusBadgeClass(status: TransactionRecord["status"]) {
  switch (status) {
    case "accepted":
      return "bg-orange-400/20 text-orange-300 ring-1 ring-orange-400/40";
    case "delivered":
      return "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40";
    case "pending":
    default:
      return "bg-yellow-400/20 text-yellow-200 ring-1 ring-yellow-400/40";
  }
}

function TransactionField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm text-text">{children}</div>
    </div>
  );
}

export function TransactionList({
  transactions,
  loading,
  error,
  searchQuery,
  onSearchChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  pagination,
}: TransactionListProps) {
  const [expanded, setExpanded] = usePersistentState<string[]>("transaction-list-expanded", []);
  const [customerFilter, setCustomerFilter] = usePersistentState("transaction-list-customer-filter", "all");

  const customerOptions = useMemo(() => {
    const options = new Set<string>();
    transactions.forEach((transaction) => {
      const displayCustomer = transaction.customerName ?? transaction.walk_in_name ?? "Walk-in";
      options.add(displayCustomer);
    });
    return Array.from(options).sort((left, right) => left.localeCompare(right));
  }, [transactions]);

  // Customer filter applies within the currently loaded page only (search/date range are
  // applied server-side via the page fetch); a distinct customer may require "Show more" first.
  const filteredTransactions = useMemo(() => {
    if (customerFilter === "all") {
      return transactions;
    }

    return transactions.filter((transaction) => {
      const displayCustomer = transaction.customerName ?? transaction.walk_in_name ?? "Walk-in";
      return displayCustomer === customerFilter;
    });
  }, [customerFilter, transactions]);

  function downloadCsv(filename: string, rows: string[][]) {
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportTransactionsCsv() {
    const rows = [
      ["Bill ID", "Date", "Customer", "Phone", "Total", "Discount", "Final Amount", "Status", "Products"],
      ...filteredTransactions.map((transaction) => {
        const displayCustomer = transaction.customerName ?? transaction.walk_in_name ?? "Walk-in";
        const products = transaction.items.map((item) => `${item.productName} x${item.quantity}`).join(" | ");

        return [
          transaction.id,
          formatUtcToIst(transaction.created_at),
          displayCustomer,
          transaction.customerPhone ?? "",
          String(transaction.total_amount),
          String(transaction.discount),
          String(transaction.final_amount),
          formatStatusLabel(transaction.status),
          products,
        ];
      }),
    ];
    downloadCsv("transactions.csv", rows);
  }

  function toggle(id: string) {
    setExpanded((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={exportTransactionsCsv}
          disabled={filteredTransactions.length === 0}
          className="h-8 px-3 text-sm"
        >
          Export CSV
        </Button>
      </div>

      <div className="grid gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted-foreground">
          <span className="mb-0.5 block">Search</span>
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Bill ID, customer, product"
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-text"
          />
        </label>

        <label className="text-xs text-muted-foreground">
          <span className="mb-0.5 block">Customer</span>
          <select
            value={customerFilter}
            onChange={(event) => setCustomerFilter(event.target.value)}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-text"
          >
            <option value="all">All</option>
            {customerOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted-foreground">
          <span className="mb-0.5 block">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-text"
          />
        </label>

        <label className="text-xs text-muted-foreground">
          <span className="mb-0.5 block">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => onDateToChange(event.target.value)}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-text"
          />
        </label>
      </div>

      <DataState
        loading={loading && filteredTransactions.length === 0}
        error={error}
        empty={!loading && !error && filteredTransactions.length === 0}
        emptyLabel={
          searchQuery || customerFilter !== "all" || dateFrom || dateTo
            ? "No transactions match your filters."
            : "No transactions found."
        }
      />

      {!error && filteredTransactions.length > 0 && (
        <div className="space-y-2">
          {filteredTransactions.map((transaction) => {
            const isExpanded = expanded.includes(transaction.id);
            const displayCustomer = transaction.customerName ?? transaction.walk_in_name ?? "Walk-in";
            const orderId = transaction.order_id?.trim();

            return (
              <article key={transaction.id} className="rounded-lg border border-border bg-background px-2.5 py-2">
                <div className="flex items-start gap-2 border-b border-border/60 pb-2">
                  {orderId ? (
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Order id</div>
                      <p className="mt-0.5 truncate font-mono text-sm font-semibold text-text" title={orderId}>
                        {orderId}
                      </p>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1" />
                  )}

                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(transaction.status)}`}
                  >
                    {formatStatusLabel(transaction.status)}
                  </span>

                  <button
                    type="button"
                    onClick={() => toggle(transaction.id)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-text"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? "Collapse items" : "Expand items"}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-6">
                  <TransactionField label="Customer" className="col-span-2 sm:col-span-1">
                    <span className="font-medium">{displayCustomer}</span>
                  </TransactionField>
                  <TransactionField label="Date">{formatUtcToIstDayMonth(transaction.created_at)}</TransactionField>
                  <TransactionField label="Table">{transaction.table_number ?? "—"}</TransactionField>
                  <TransactionField label="Total">{formatCurrency(transaction.total_amount)}</TransactionField>
                  <TransactionField label="Disc.">{formatCurrency(transaction.discount)}</TransactionField>
                  <TransactionField label="Final">
                    <span className="font-semibold text-primary">{formatCurrency(transaction.final_amount)}</span>
                  </TransactionField>
                </div>

                {isExpanded && (
                  <div className="mt-2 space-y-2">
                    <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Bill id</div>
                      <p className="mt-0.5 break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
                        {transaction.id}
                      </p>
                    </div>
                    <div className="overflow-x-auto rounded-md border border-border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/60 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">Product</th>
                          <th className="px-2 py-1.5 font-medium">Qty</th>
                          <th className="px-2 py-1.5 font-medium">Price</th>
                          <th className="px-2 py-1.5 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {transaction.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-2 py-1.5 text-text">{item.productName}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{item.quantity}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{formatCurrency(item.price)}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{formatCurrency(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ListPaginationControls
        loadedCount={transactions.length}
        totalCount={pagination.totalCount}
        hasMore={pagination.hasMore}
        loading={pagination.loadingMore}
        onShowMore={pagination.onShowMore}
        onShowAll={pagination.onShowAll}
        itemLabel="transactions"
      />
    </div>
  );
}
