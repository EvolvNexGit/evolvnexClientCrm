"use client";

import { describeClinicPayment, type ClinicBillRecord } from "@/lib/clinic-billing-types";
import type { StandardPrintHeader } from "@/lib/doctor-print-profile-types";
import { formatUtcToIst } from "@/lib/time-utils";

type ClinicReceiptPrintProps = {
  bill: ClinicBillRecord;
  /** Printed clinic/doctor header for plain paper; null or absent keeps the body-only letterhead layout. */
  header?: StandardPrintHeader | null;
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

function ReceiptHeader({ header }: { header: StandardPrintHeader }) {
  const doctorLine = [nonBlank(header.doctorName), nonBlank(header.qualification)].filter(Boolean).join(", ");
  const idLine = [
    nonBlank(header.phone) ? `Phone: ${nonBlank(header.phone)}` : null,
    nonBlank(header.regNo) ? `Reg. No.: ${nonBlank(header.regNo)}` : null,
    nonBlank(header.gstNo) ? `GST: ${nonBlank(header.gstNo)}` : null,
  ]
    .filter(Boolean)
    .join("  |  ");

  if (!nonBlank(header.clinicName) && !doctorLine && !nonBlank(header.address) && !idLine) {
    return null;
  }

  return (
    <div className="break-inside-avoid border-b border-black pb-2 text-center text-[10pt] leading-snug text-black">
      {nonBlank(header.clinicName) ? <p className="text-[14pt] font-bold">{nonBlank(header.clinicName)}</p> : null}
      {doctorLine ? <p>{doctorLine}</p> : null}
      {nonBlank(header.address) ? <p className="whitespace-pre-line">{nonBlank(header.address)}</p> : null}
      {idLine ? <p>{idLine}</p> : null}
    </div>
  );
}

/**
 * Receipt: receipt number, date, patient, items, totals and one payment line. Body-only for
 * pre-printed letterhead by default; when a standard-template header is passed it is printed above
 * the body. No footer or consultation field. Explicit black on white because the app theme is dark
 * and this goes to paper.
 */
export function ClinicReceiptPrint({ bill, header }: ClinicReceiptPrintProps) {
  const patientName = nonBlank(bill.customerName) ?? "Patient";
  const receiptNumber = nonBlank(bill.order_id) ?? "-";
  const billDate = formatDateOnly(formatUtcToIst(bill.created_at).slice(0, 10));
  const paymentLine = describeClinicPayment(bill.payment_status, bill.payment_mode);

  return (
    <div className="space-y-4 text-[11pt] leading-snug text-black">
      {header ? <ReceiptHeader header={header} /> : null}
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
