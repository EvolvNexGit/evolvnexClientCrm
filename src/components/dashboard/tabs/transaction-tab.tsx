"use client";

import { TransactionList } from "@/components/dashboard/billing/transaction-list";
import { Button } from "@/components/ui/button";
import { useTransactions } from "@/hooks/use-transactions";
import { updateBillStatus } from "@/lib/billing-queries";
import { triggerOrderAlert } from "@/lib/order-notifications";

export default function TransactionTab({ clientId }: { clientId: string }) {
  const transactionState = useTransactions(clientId);

  async function handleUpdateStatus(id: string, status: "pending" | "accepted" | "delivered") {
    try {
      await updateBillStatus(clientId, id, status);
      await transactionState.refresh();
    } catch (err) {
      throw err;
    }
  }


  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text">Billing CRM</h2>
          <p className="mt-1 text-base text-muted-foreground">Client scope: {clientId}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            triggerOrderAlert({
              orderId: `test-${Date.now()}`,
              tableNumber: "4",
              finalAmount: 420,
            })
          }
        >
          Test Notification
        </Button>
      </div>

      <TransactionList
        transactions={transactionState.transactions}
        loading={transactionState.loading}
        error={transactionState.error}
        onUpdateStatus={handleUpdateStatus}
      />
    </section>
  );
}
