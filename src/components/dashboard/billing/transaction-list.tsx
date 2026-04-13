"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DataState } from "@/components/dashboard/billing/data-state";
import { Button } from "@/components/ui/button";
import type { TransactionRecord } from "@/lib/billing-types";

type TransactionListProps = {
  transactions: TransactionRecord[];
  loading: boolean;
  error: string | null;
};

function formatDate(value: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function TransactionList({ transactions, loading, error }: TransactionListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const customerOptions = useMemo(() => {
    const options = new Set<string>();
    transactions.forEach((transaction) => {
      const displayCustomer = transaction.customerName ?? transaction.walk_in_name ?? "Walk-in";
      options.add(displayCustomer);
    });
    return Array.from(options).sort((left, right) => left.localeCompare(right));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const displayCustomer = transaction.customerName ?? transaction.walk_in_name ?? "Walk-in";
      const txDate = transaction.created_at ? new Date(transaction.created_at) : null;

      const matchesCustomer = customerFilter === "all" || displayCustomer === customerFilter;

      const matchesDateFrom =
        !dateFrom ||
        (txDate ? txDate >= new Date(`${dateFrom}T00:00:00`) : false);

      const matchesDateTo =
        !dateTo ||
        (txDate ? txDate <= new Date(`${dateTo}T23:59:59`) : false);

      const productNames = transaction.items.map((item) => item.productName).join(" ").toLowerCase();
      const matchesSearch =
        !query ||
        [displayCustomer.toLowerCase(), transaction.id.toLowerCase(), productNames].some((value) =>
          value.includes(query),
        );

      return matchesCustomer && matchesDateFrom && matchesDateTo && matchesSearch;
    });
  }, [customerFilter, dateFrom, dateTo, searchQuery, transactions]);

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
      ["Bill ID", "Date", "Customer", "Phone", "Total", "Discount", "Final Amount", "Products"],
      ...filteredTransactions.map((transaction) => {
        const displayCustomer = transaction.customerName ?? transaction.walk_in_name ?? "Walk-in";
        const products = transaction.items
          .map((item) => `${item.productName} x${item.quantity}`)
          .join(" | ");

        return [
          transaction.id,
          transaction.created_at,
          displayCustomer,
          transaction.customerPhone ?? "",
          String(transaction.total_amount),
          String(transaction.discount),
          String(transaction.final_amount),
          products,
        ];
      }),
    ];
    downloadCsv("transactions.csv", rows);
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text">Transactions</h3>
          <p className="text-sm text-muted-foreground">Bills with customer and product breakdown.</p>
        </div>
        <Button type="button" variant="secondary" onClick={exportTransactionsCsv} disabled={filteredTransactions.length === 0}>
          Export CSV
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-background p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">Search</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Bill ID, customer, product"
            className="w-full rounded-lg border border-border bg-card px-2 py-2 text-sm text-text"
          />
        </label>

        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">Customer</span>
          <select
            value={customerFilter}
            onChange={(event) => setCustomerFilter(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-2 py-2 text-sm text-text"
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
          <span className="mb-1 block">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-2 py-2 text-sm text-text"
          />
        </label>

        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-2 py-2 text-sm text-text"
          />
        </label>
      </div>

      <DataState
        loading={loading}
        error={error}
        empty={!loading && !error && filteredTransactions.length === 0}
        emptyLabel={searchQuery || customerFilter !== "all" || dateFrom || dateTo ? "No transactions match your filters." : "No transactions found."}
      />

      {!loading && !error && filteredTransactions.length > 0 && (
        <div className="space-y-3">
          {filteredTransactions.map((transaction) => {
            const isExpanded = expanded.has(transaction.id);
            const displayCustomer = transaction.customerName ?? transaction.walk_in_name ?? "Walk-in";
            return (
              <article key={transaction.id} className="rounded-xl border border-border bg-background p-4">
                <button
                  type="button"
                  onClick={() => toggle(transaction.id)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Customer</div>
                      <div className="text-sm font-medium text-text">{displayCustomer}</div>
                      <div className="text-xs text-muted-foreground">{transaction.customerPhone ?? "-"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Date</div>
                      <div className="text-sm text-text">{formatDate(transaction.created_at)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</div>
                      <div className="text-sm text-text">{formatCurrency(transaction.total_amount)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Discount</div>
                      <div className="text-sm text-text">{formatCurrency(transaction.discount)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Final</div>
                      <div className="text-sm font-semibold text-primary">{formatCurrency(transaction.final_amount)}</div>
                    </div>
                  </div>

                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition ${isExpanded ? "rotate-180" : "rotate-0"}`}
                  />
                </button>

                {isExpanded && (
                  <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2">Qty</th>
                          <th className="px-3 py-2">Price</th>
                          <th className="px-3 py-2">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {transaction.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 text-text">{item.productName}</td>
                            <td className="px-3 py-2 text-muted-foreground">{item.quantity}</td>
                            <td className="px-3 py-2 text-muted-foreground">{formatCurrency(item.price)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{formatCurrency(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
