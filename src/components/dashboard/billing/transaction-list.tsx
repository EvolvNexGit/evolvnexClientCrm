"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DataState } from "@/components/dashboard/billing/data-state";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { usePersistentState } from "@/hooks/use-persistent-state";
import type { TransactionRecord } from "@/lib/billing-types";
import { formatUtcToIst } from "@/lib/time-utils";

type TransactionListProps = {
  transactions: TransactionRecord[];
  loading: boolean;
  error: string | null;
  onUpdateStatus?: (id: string, status: "pending" | "accepted" | "delivered") => Promise<void>;
};



function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function TransactionList({ transactions, loading, error, onUpdateStatus }: TransactionListProps) {
  // onUpdateStatus is optional; parent may provide it to persist status changes
  const [expanded, setExpanded] = usePersistentState<string[]>("transaction-list-expanded", []);
  const [searchQuery, setSearchQuery] = usePersistentState("transaction-list-search", "");
  const [customerFilter, setCustomerFilter] = usePersistentState("transaction-list-customer-filter", "all");
  const [dateFrom, setDateFrom] = usePersistentState("transaction-list-date-from", "");
  const [dateTo, setDateTo] = usePersistentState("transaction-list-date-to", "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<{
    id: string;
    oldStatus: string | null;
    newStatus: "pending" | "accepted" | "delivered";
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

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
    setExpanded((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function formatStatusLabel(value: string | null | undefined) {
    return value ? value.toUpperCase() : "(NONE)";
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-text">Transactions</h3>
          <p className="text-base text-muted-foreground">Bills with customer and product breakdown.</p>
        </div>
        <Button type="button" variant="secondary" onClick={exportTransactionsCsv} disabled={filteredTransactions.length === 0}>
          Export CSV
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-background p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-muted-foreground">
          <span className="mb-1 block">Search</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Bill ID, customer, product"
            className="w-full rounded-lg border border-border bg-card px-2 py-2 text-base text-text"
          />
        </label>

        <label className="text-sm text-muted-foreground">
          <span className="mb-1 block">Customer</span>
          <select
            value={customerFilter}
            onChange={(event) => setCustomerFilter(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-2 py-2 text-base text-text"
          >
            <option value="all">All</option>
            {customerOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-muted-foreground">
          <span className="mb-1 block">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-2 py-2 text-base text-text"
          />
        </label>

        <label className="text-sm text-muted-foreground">
          <span className="mb-1 block">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-2 py-2 text-base text-text"
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
            const isExpanded = expanded.includes(transaction.id);
            const displayCustomer = transaction.customerName ?? transaction.walk_in_name ?? "Walk-in";
            return (
              <article key={transaction.id} className="rounded-xl border border-border bg-background p-4">
                <button
                  type="button"
                  onClick={() => toggle(transaction.id)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Customer</div>
                      <div className="text-base font-medium text-text">{displayCustomer}</div>
                      <div className="text-sm text-muted-foreground">{transaction.customerPhone ?? "-"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Date</div>
                      <div className="text-base text-text">{formatUtcToIst(transaction.created_at)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Table Number</div>
                      <div className="text-base text-text">{transaction.table_number ?? "-"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</div>
                      <div className="text-base text-text">{formatCurrency(transaction.total_amount)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Discount</div>
                      <div className="text-base text-text">{formatCurrency(transaction.discount)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Final</div>
                      <div className="text-base font-semibold text-primary">{formatCurrency(transaction.final_amount)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</div>
                      <div className="mt-1 flex items-center gap-1">
                        {(["pending", "accepted", "delivered"] as const).map((s) => {
                          const active = transaction.status === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                e.stopPropagation();
                                if (!onUpdateStatus) return;
                                setPendingChange({ id: transaction.id, oldStatus: transaction.status ?? null, newStatus: s });
                                setConfirmOpen(true);
                              }}
                              className={
                                active
                                  ? "rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
                                  : "rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                              }
                            >
                              {s[0].toUpperCase() + s.slice(1)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition ${isExpanded ? "rotate-180" : "rotate-0"}`}
                  />
                </button>

                {isExpanded && (
                  <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                    <table className="min-w-full divide-y divide-border text-base">
                      <thead className="bg-muted text-left text-sm uppercase tracking-wide text-muted-foreground">
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

      <EntityModal
        open={confirmOpen}
        title="Confirm status change"
        onClose={() => {
          if (isUpdating) return;
          setConfirmOpen(false);
          setPendingChange(null);
        }}
      >
        <div className="space-y-4">
          <p>
            {pendingChange ? (
              <>
                Change status from <strong>{formatStatusLabel(pendingChange.oldStatus)}</strong> to{" "}
                <strong>{formatStatusLabel(pendingChange.newStatus)}</strong>?
              </>
            ) : (
              "Change status?"
            )}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { if (!isUpdating) { setConfirmOpen(false); setPendingChange(null); } }} disabled={isUpdating}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!pendingChange || !onUpdateStatus) return;
                setIsUpdating(true);
                try {
                  await onUpdateStatus(pendingChange.id, pendingChange.newStatus);
                } catch (err) {
                  // Show a simple alert on error
                  console.error(err);
                  // eslint-disable-next-line no-alert
                  alert(err instanceof Error ? err.message : "Unable to update status.");
                } finally {
                  setIsUpdating(false);
                  setConfirmOpen(false);
                  setPendingChange(null);
                }
              }}
              disabled={isUpdating}
            >
              {isUpdating ? "Changing..." : "Confirm"}
            </Button>
          </div>
        </div>
      </EntityModal>
    </div>
  );
}
