export const CLINIC_PAYMENT_MODES = ["CASH", "UPI", "CARD", "OTHER"] as const;
export type ClinicPaymentMode = (typeof CLINIC_PAYMENT_MODES)[number];

export const CLINIC_PAYMENT_STATUSES = ["paid", "unpaid"] as const;
export type ClinicPaymentStatus = (typeof CLINIC_PAYMENT_STATUSES)[number];

export function isClinicPaymentMode(value: unknown): value is ClinicPaymentMode {
  return typeof value === "string" && (CLINIC_PAYMENT_MODES as readonly string[]).includes(value);
}

export function isClinicPaymentStatus(value: unknown): value is ClinicPaymentStatus {
  return typeof value === "string" && (CLINIC_PAYMENT_STATUSES as readonly string[]).includes(value);
}

/** One receipt payment line: "PAID - UPI", "PAID", "UNPAID", or an empty string when the status is unknown. */
export function describeClinicPayment(status: ClinicPaymentStatus | null, mode: ClinicPaymentMode | null): string {
  if (status === "paid") {
    return mode ? `PAID - ${mode}` : "PAID";
  }

  return status === "unpaid" ? "UNPAID" : "";
}

export type ClinicBillFilter = "unpaid" | "all";

export type ClinicBillItem = {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
};

export type ClinicBillRecord = {
  id: string;
  order_id: string | null;
  customer_id: string | null;
  created_at: string;
  total_amount: number;
  discount: number;
  final_amount: number;
  payment_status: ClinicPaymentStatus | null;
  payment_mode: ClinicPaymentMode | null;
  consultation_id: string | null;
  appointment_id: string | null;
  customerName: string | null;
  customerPhone: string | null;
  items: ClinicBillItem[];
};

export const CLINIC_BILL_MAX_ITEMS = 20;
export const CLINIC_BILL_MAX_QUANTITY = 99;
export const CLINIC_ALREADY_BILLED_MESSAGE = "This consultation is already billed.";
export const CLINIC_BILL_NOT_PAYABLE_MESSAGE = "Bill not found or already paid.";

/** Integer 1..99 from a trimmed digit string, otherwise null. */
export function parseQuantity(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,3}$/.test(text)) {
    return null;
  }

  const value = Number(text);
  return value >= 1 && value <= CLINIC_BILL_MAX_QUANTITY ? value : null;
}

/** Integer paise from up to nine digits with at most two decimals, otherwise null. */
export function parseMoneyInput(raw: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!match) {
    return null;
  }

  const rupees = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  return rupees * 100 + fraction;
}

export function toPaise(amount: number): number {
  return Math.round(amount * 100);
}

export type ClinicBillTotals = {
  subtotalPaise: number;
  discountPaise: number;
  totalPaise: number;
  error: string | null;
};

export function computeTotalsPaise(lines: { pricePaise: number; quantity: number }[], discountPaise: number): ClinicBillTotals {
  const subtotalPaise = lines.reduce((sum, line) => sum + line.pricePaise * line.quantity, 0);
  if (discountPaise > subtotalPaise) {
    return { subtotalPaise, discountPaise, totalPaise: subtotalPaise, error: "Discount cannot exceed the subtotal." };
  }

  return { subtotalPaise, discountPaise, totalPaise: subtotalPaise - discountPaise, error: null };
}

export type ClinicBillItemPayload = {
  productId: string;
  quantity: number;
};

export type ClinicBillPayload = {
  customerId: string;
  consultationId: string;
  items: ClinicBillItemPayload[];
  /** Flat discount in rupees. */
  discount: number;
  paymentStatus: ClinicPaymentStatus;
  paymentMode: ClinicPaymentMode | null;
};

export type CreatedClinicBill = {
  billId: string;
  orderId: string | null;
  totalAmount: number;
  discount: number;
  finalAmount: number;
  paymentStatus: ClinicPaymentStatus | null;
  paymentMode: ClinicPaymentMode | null;
};
