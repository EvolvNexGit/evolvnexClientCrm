import { BILL_ORDER_SOURCE_POS } from "@/lib/billing-types";

/** POS checkout is placed by staff in this CRM — do not alert. Air Menu and later delivery apps do. */
export function isNotifiableOrderSource(orderSource: unknown): boolean {
  const source = String(orderSource ?? "").trim().toUpperCase();
  if (!source) {
    return true;
  }

  return source !== BILL_ORDER_SOURCE_POS.toUpperCase();
}
