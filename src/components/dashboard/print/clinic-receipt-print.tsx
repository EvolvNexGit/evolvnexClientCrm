"use client";

import { describeClinicPayment, type ClinicBillRecord } from "@/lib/clinic-billing-types";
import { formatUtcToIst } from "@/lib/time-utils";

type ClinicReceiptPrintProps = {
  bill: ClinicBillRecord;
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** Formats a stored YYYY-MM-DD without a Date parse of the ISO string, so no timezone can move the day. */
function formatDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return value;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function nonBlank(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null;
}

/**
 * Body-only receipt for pre-printed letterhead: receipt number, date, patient, items, totals and
 * one payment line. No clinic header, doctor block, footer or consultation field. Explicit black
 * on white because the app theme is dark and this goes to paper.
 */
export function ClinicReceiptPrint({ bill }: ClinicReceiptPrintProps) {
  const patientName = nonBlank(bill.customerName) ?? "Patient";
  const receiptNumber = nonBlank(bill.order_id) ?? "-";
  const billDate = formatDateOnly(formatUtcToIst(bill.created_at).slice(0, 10));
  const paymentLine = describeClinicPayment(bill.payment_status, bill.payment_mode);

  return (
    <div className="space-y-4 text-[11pt] leading-snug text-black">
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
        <span className="font-semibold">Receipt {receiptNumber}</span>
        <span>{billDate}</span>
      </div>

      <p className="font-semibold">{patientName}</p>

      <table className="w-full border-collapse text-left text-[10pt]">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1 pr-2 font-semibold">#</th>
            <th className="py-1 pr-2 font-semibold">Item</th>
            <th className="py-1 pr-2 text-right font-semibold">Qty</th>
            <th className="py-1 pr-2 text-right font-semibold">Rate</th>
            <th className="py-1 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((item, index) => (
            <tr key={item.id} className="break-inside-avoid border-b border-black align-top">
              <td className="py-1 pr-2">{index + 1}</td>
              <td className="py-1 pr-2">{item.productName}</td>
              <td className="py-1 pr-2 text-right">{item.quantity}</td>
              <td className="py-1 pr-2 text-right">{currencyFormatter.format(item.price)}</td>
              <td className="py-1 text-right">{currencyFormatter.format(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-56 break-inside-avoid space-y-1 text-[10pt]">
        <div className="flex justify-between gap-4">
          <span>Subtotal</span>
          <span>{currencyFormatter.format(bill.total_amount)}</span>
        </div>
        {bill.discount > 0 ? (
          <div className="flex justify-between gap-4">
            <span>Discount</span>
            <span>{currencyFormatter.format(bill.discount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 border-t border-black pt-1 text-[11pt] font-semibold">
          <span>Total</span>
          <span>{currencyFormatter.format(bill.final_amount)}</span>
        </div>
      </div>

      {paymentLine ? <p className="break-inside-avoid text-right font-semibold">{paymentLine}</p> : null}
    </div>
  );
}
