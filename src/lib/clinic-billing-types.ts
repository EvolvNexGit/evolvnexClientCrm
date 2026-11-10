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
