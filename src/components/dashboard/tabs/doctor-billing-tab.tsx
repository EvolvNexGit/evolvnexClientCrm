"use client";

import { useState } from "react";
import { DataState } from "@/components/dashboard/billing/data-state";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import { useClinicBills } from "@/hooks/use-clinic-bills";
import type { ClinicBillFilter, ClinicBillRecord } from "@/lib/clinic-billing-types";
import { formatUtcToIst } from "@/lib/time-utils";
import { cn } from "@/lib/utils";

type DoctorBillingTabProps = {
  clientId: string;
};

const FILTERS: { key: ClinicBillFilter; label: string }[] = [
  { key: "unpaid", label: "Unpaid" },
  { key: "all", label: "All" },
];

const EMPTY_LABELS: Record<ClinicBillFilter, string> = {
  unpaid: "No unpaid bills.",
  all: "No clinic bills yet. Create one from a completed consultation.",
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function StatusPill({ bill }: { bill: ClinicBillRecord }) {
  const paid = bill.payment_status === "paid";
  const label = paid ? (bill.payment_mode ? `Paid · ${bill.payment_mode}` : "Paid") : "Unpaid";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold",
        paid
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-300",
      )}
    >
      {label}
    </span>
  );
}

export default function DoctorBillingTab({ clientId }: DoctorBillingTabProps) {
  const [filter, setFilter] = useState<ClinicBillFilter>("unpaid");
  const { items, loading, loadingMore, error, hasMore, totalCount, showMore, showAll } = useClinicBills(
    clientId,
    filter,
  );

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-text">Billing</h2>
        <p className="mt-1 text-sm text-muted-foreground">Bills for completed consultations</p>
      </section>

      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="flex min-w-0 items-center gap-4 overflow-x-auto border-b border-border px-4 pt-4 text-sm font-medium">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={cn(
                "min-h-11 shrink-0 pb-3 xl:min-h-0",
                filter === option.key
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-text",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="min-w-0 space-y-3 p-4">
          <DataState loading={loading} error={error} empty={items.length === 0} emptyLabel={EMPTY_LABELS[filter]} />

          {items.length > 0 && (
            <>
              <div className="space-y-3 xl:hidden">
                {items.map((bill) => (
                  <article key={bill.id} className="rounded-2xl border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-text">{bill.customerName ?? "Walk-in"}</p>
                        <p className="text-sm text-muted-foreground">Receipt {bill.order_id ?? "-"}</p>
                        <p className="text-sm text-muted-foreground">{formatUtcToIst(bill.created_at)}</p>
                      </div>
                      <StatusPill bill={bill} />
                    </div>
                    <p className="mt-3 text-lg font-semibold text-text">
                      {currencyFormatter.format(bill.final_amount)}
                    </p>
                  </article>
                ))}
              </div>

              <div className="hidden min-w-0 overflow-x-auto xl:block">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Receipt no.</th>
                      <th className="px-4 py-3">Patient</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((bill) => (
                      <tr key={bill.id} className="border-b border-border/60 text-sm text-text">
                        <td className="px-4 py-3">{bill.order_id ?? "-"}</td>
                        <td className="px-4 py-3">{bill.customerName ?? "Walk-in"}</td>
                        <td className="px-4 py-3">{formatUtcToIst(bill.created_at)}</td>
                        <td className="px-4 py-3 font-medium">{currencyFormatter.format(bill.final_amount)}</td>
                        <td className="px-4 py-3">
                          <StatusPill bill={bill} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <ListPaginationControls
            loadedCount={items.length}
            totalCount={totalCount}
            hasMore={hasMore}
            loading={loadingMore}
            onShowMore={() => void showMore()}
            onShowAll={() => void showAll()}
            itemLabel="bills"
          />
        </div>
      </section>
    </div>
  );
}
