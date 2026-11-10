"use client";

import { Printer } from "lucide-react";
import { useId, useState } from "react";
import { DataState } from "@/components/dashboard/billing/data-state";
import { ClinicReceiptPrint } from "@/components/dashboard/print/clinic-receipt-print";
import { PrintSheet } from "@/components/dashboard/print/print-sheet";
import { Button } from "@/components/ui/button";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import { useClinicBills } from "@/hooks/use-clinic-bills";
import { useClinicReceiptPrint } from "@/hooks/use-clinic-receipt-print";
import {
  CLINIC_PAYMENT_MODES,
  isClinicPaymentMode,
  type ClinicBillFilter,
  type ClinicBillRecord,
  type ClinicPaymentMode,
} from "@/lib/clinic-billing-types";
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

type MarkPaidPanelProps = {
  saving: boolean;
  error: string | null;
  onConfirm: (mode: ClinicPaymentMode) => void;
  onCancel: () => void;
};

/** Mounted per open bill, so the chosen mode resets every time a panel opens. */
function MarkPaidPanel({ saving, error, onConfirm, onCancel }: MarkPaidPanelProps) {
  const selectId = useId();
  const [mode, setMode] = useState("");

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="space-y-1">
        <label htmlFor={selectId} className="text-sm font-medium text-text">
          Payment mode
        </label>
        <select
          id={selectId}
          value={mode}
          onChange={(event) => setMode(event.target.value)}
          disabled={saving}
          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Select payment mode</option>
          {CLINIC_PAYMENT_MODES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="text-sm text-primary" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={saving || !isClinicPaymentMode(mode)}
          onClick={() => {
            if (isClinicPaymentMode(mode)) {
              onConfirm(mode);
            }
          }}
        >
          {saving ? "Saving..." : "Confirm"}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function DoctorBillingTab({ clientId }: DoctorBillingTabProps) {
  const [filter, setFilter] = useState<ClinicBillFilter>("unpaid");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    totalCount,
    saving,
    actionError,
    clearActionError,
    showMore,
    showAll,
    markPaid,
  } = useClinicBills(clientId, filter);
  const { printPayload, margins, ready, printingId, printBill } = useClinicReceiptPrint(clientId);

  const handleFilterChange = (next: ClinicBillFilter) => {
    setMarkingId(null);
    clearActionError();
    setFilter(next);
  };

  const handleOpenPanel = (billId: string) => {
    clearActionError();
    setMarkingId(billId);
  };

  const handleClosePanel = () => {
    clearActionError();
    setMarkingId(null);
  };

  const handleConfirmPaid = async (billId: string, mode: ClinicPaymentMode) => {
    const marked = await markPaid(billId, mode);
    if (marked) {
      setMarkingId(null);
    }
  };

  const renderPanel = (bill: ClinicBillRecord) => (
    <MarkPaidPanel
      saving={saving}
      error={actionError}
      onConfirm={(mode) => void handleConfirmPaid(bill.id, mode)}
      onCancel={handleClosePanel}
    />
  );

  const renderPrintButton = (bill: ClinicBillRecord) => (
    <Button
      variant="secondary"
      className="min-h-11 xl:min-h-0"
      disabled={!ready || printingId !== null}
      title={ready ? "Print receipt" : "Print settings are not loaded"}
      aria-label={`Print receipt ${bill.order_id ?? bill.id}`}
      onClick={() => void printBill(bill.id)}
    >
      <Printer className="h-4 w-4" />
    </Button>
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
              onClick={() => handleFilterChange(option.key)}
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
                  <article key={bill.id} className="space-y-3 rounded-2xl border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-text">{bill.customerName ?? "Walk-in"}</p>
                        <p className="text-sm text-muted-foreground">Receipt {bill.order_id ?? "-"}</p>
                        <p className="text-sm text-muted-foreground">{formatUtcToIst(bill.created_at)}</p>
                      </div>
                      <StatusPill bill={bill} />
                    </div>
                    <p className="text-lg font-semibold text-text">{currencyFormatter.format(bill.final_amount)}</p>
                    <div className="flex flex-wrap gap-2">
                      {renderPrintButton(bill)}
                      {bill.payment_status === "unpaid" && markingId !== bill.id && (
                        <Button variant="secondary" className="min-h-11 flex-1" onClick={() => handleOpenPanel(bill.id)}>
                          Mark paid
                        </Button>
                      )}
                    </div>
                    {markingId === bill.id && renderPanel(bill)}
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
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((bill) => (
                      <tr key={bill.id} className="border-b border-border/60 align-top text-sm text-text">
                        <td className="px-4 py-3">{bill.order_id ?? "-"}</td>
                        <td className="px-4 py-3">{bill.customerName ?? "Walk-in"}</td>
                        <td className="px-4 py-3">{formatUtcToIst(bill.created_at)}</td>
                        <td className="px-4 py-3 font-medium">{currencyFormatter.format(bill.final_amount)}</td>
                        <td className="px-4 py-3">
                          <StatusPill bill={bill} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-start gap-2">
                            {renderPrintButton(bill)}
                            {markingId === bill.id ? (
                              renderPanel(bill)
                            ) : bill.payment_status === "unpaid" ? (
                              <Button variant="secondary" onClick={() => handleOpenPanel(bill.id)}>
                                Mark paid
                              </Button>
                            ) : null}
                          </div>
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

      {printPayload ? (
        <PrintSheet margins={margins}>
          <ClinicReceiptPrint bill={printPayload} />
        </PrintSheet>
      ) : null}
    </div>
  );
}
