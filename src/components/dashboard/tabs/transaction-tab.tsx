"use client";

import { TransactionList } from "@/components/dashboard/billing/transaction-list";
import { Button } from "@/components/ui/button";
import { useTransactions } from "@/hooks/use-transactions";
import { triggerOrderAlert } from "@/lib/order-notifications";

const TEST_NOTIFICATION_TABLE_NUMBER = "4";
const TEST_NOTIFICATION_AMOUNT = 420;

export default function TransactionTab({ clientId }: { clientId: string }) {
  const transactionState = useTransactions(clientId);

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
        transactions={transactionState.transactions}
        loading={transactionState.loading}
        error={transactionState.error}
      />
    </section>
  );
}
