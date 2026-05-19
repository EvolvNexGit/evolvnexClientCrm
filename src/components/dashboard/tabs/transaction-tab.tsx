"use client";

import { TransactionList } from "@/components/dashboard/billing/transaction-list";
import { useTransactions } from "@/hooks/use-transactions";
import { updateBillStatus } from "@/lib/billing-queries";

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
