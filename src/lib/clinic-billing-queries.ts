import { BILL_ORDER_SOURCE_CLINIC } from "@/lib/billing-types";
import {
  CLINIC_ALREADY_BILLED_MESSAGE,
  isClinicPaymentMode,
  isClinicPaymentStatus,
  type ClinicBillFilter,
  type ClinicBillItem,
  type ClinicBillPayload,
  type ClinicBillRecord,
  type ClinicPaymentMode,
  type CreatedClinicBill,
} from "@/lib/clinic-billing-types";
import { buildListRange, type ListPageParams, type ListPageResult } from "@/lib/list-pagination";
import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";

// Own select string: the shared cafe select must not depend on the clinic payment columns (D-12).
const CLINIC_BILL_SELECT =
  "id, order_id, customer_id, created_at, total_amount, discount, final_amount, payment_status, payment_mode, consultation_id, appointment_id, customers(name, phone), bill_items(id, quantity, price, total, products(name))";

function getClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }

  return supabase;
}

function raiseQueryError(error: unknown, fallback: string): never {
  throw new Error(formatSupabaseError(error, fallback));
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableText(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();
  return text === "" ? null : text;
}

/** PostgREST returns an embedded to-one relation as an object or a one-element array. */
function firstRecord(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate != null && typeof candidate === "object" ? (candidate as Record<string, unknown>) : null;
}

function mapClinicBillItem(item: Record<string, unknown>): ClinicBillItem {
  const product = firstRecord(item.products);
  return {
    id: String(item.id),
    productName: asNullableText(product?.name) ?? "Unknown item",
    quantity: asNumber(item.quantity),
    price: asNumber(item.price),
    total: asNumber(item.total),
  };
}

function mapClinicBillRow(row: Record<string, unknown>): ClinicBillRecord {
  const customer = firstRecord(row.customers);
  const billItems = Array.isArray(row.bill_items) ? (row.bill_items as Record<string, unknown>[]) : [];

  return {
    id: String(row.id),
    order_id: asNullableText(row.order_id),
    customer_id: asNullableText(row.customer_id),
    created_at: String(row.created_at ?? ""),
    total_amount: asNumber(row.total_amount),
    discount: asNumber(row.discount),
    final_amount: asNumber(row.final_amount),
    payment_status: isClinicPaymentStatus(row.payment_status) ? row.payment_status : null,
    payment_mode: isClinicPaymentMode(row.payment_mode) ? row.payment_mode : null,
    consultation_id: asNullableText(row.consultation_id),
    appointment_id: asNullableText(row.appointment_id),
    customerName: asNullableText(customer?.name),
    customerPhone: asNullableText(customer?.phone),
    items: billItems.map(mapClinicBillItem),
  };
}

export async function fetchClinicBillsPage(
  clientId: string,
  params: ListPageParams & { filter?: ClinicBillFilter },
): Promise<ListPageResult<ClinicBillRecord>> {
  const supabase = getClient();
  const { from, to } = buildListRange(params.offset, params.limit);

  let query = supabase
    .from("bills")
    .select(CLINIC_BILL_SELECT, { count: "exact" })
    .eq("client_id", clientId)
    .eq("order_source", BILL_ORDER_SOURCE_CLINIC);

  if (params.filter === "unpaid") {
    query = query.eq("payment_status", "unpaid");
  }

  const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error) {
    raiseQueryError(error, "Unable to load clinic bills.");
  }

  const items = (data ?? []).map((row) => mapClinicBillRow(row as unknown as Record<string, unknown>));
  const totalCount = count ?? null;
  return {
    items,
    hasMore: totalCount != null ? from + items.length < totalCount : items.length === params.limit,
    totalCount,
  };
}

/** Reads one stored clinic bill of this client; the receipt is always built from this re-fetch. Null when no row matches. */
export async function fetchClinicBillById(clientId: string, billId: string): Promise<ClinicBillRecord | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("bills")
    .select(CLINIC_BILL_SELECT)
    .eq("client_id", clientId)
    .eq("id", billId)
    .eq("order_source", BILL_ORDER_SOURCE_CLINIC)
    .maybeSingle();

  if (error) {
    raiseQueryError(error, "Unable to load the bill.");
  }

  return data ? mapClinicBillRow(data as unknown as Record<string, unknown>) : null;
}

/** Marks one unpaid clinic bill of this client paid. Zero or many rows updated is an error. */
export async function markClinicBillPaid(clientId: string, billId: string, mode: ClinicPaymentMode): Promise<void> {
  if (!isClinicPaymentMode(mode)) {
    throw new Error("Choose a payment mode.");
  }

  const supabase = getClient();
  const { data, error } = await supabase
    .from("bills")
    .update({ payment_status: "paid", payment_mode: mode })
    .eq("client_id", clientId)
    .eq("id", billId)
    .eq("order_source", BILL_ORDER_SOURCE_CLINIC)
    .eq("payment_status", "unpaid")
    .select("id");

  if (error) {
    raiseQueryError(error, "Unable to mark the bill paid.");
  }

  if (!data || data.length !== 1) {
    throw new Error("Bill not found or already paid.");
  }
}

/** Maps bill id to payment_status for this client's bills since sinceIso that are not paid. No row cap here, so PostgREST's default row limit applies. */
export async function fetchNonPaidBillStatusesSince(clientId: string, sinceIso: string): Promise<Map<string, string>> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("bills")
    .select("id, payment_status")
    .eq("client_id", clientId)
    .gte("created_at", sinceIso)
    .neq("payment_status", "paid");

  if (error) {
    raiseQueryError(error, "Unable to load bill payment status.");
  }

  const statuses = new Map<string, string>();
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    statuses.set(String(row.id), String(row.payment_status ?? ""));
  }

  return statuses;
}

function mapCreateBillError(error: unknown): string {
  const record = error != null && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";

  if (code === "23505") {
    return CLINIC_ALREADY_BILLED_MESSAGE;
  }

  if (code === "42501") {
    return "You do not have access to bill this consultation.";
  }

  if (code === "P0002") {
    return "The patient or consultation was not found, or the consultation is not completed.";
  }

  if (code === "22023") {
    if (message.includes("Invalid items")) {
      return "One of the selected items is no longer available. Reload and try again.";
    }

    if (message.includes("Invalid discount")) {
      return "The discount is not valid for this bill.";
    }

    if (message.includes("Invalid payment")) {
      return "Choose Paid with a payment mode, or Unpaid.";
    }
  }

  return formatSupabaseError(error, "Unable to create the bill.");
}

/**
 * Creates a clinic bill through the invoker function. Only ids, quantities, a flat discount and the payment
 * choice are sent; the database decides prices, totals, the appointment link, source and status (D-03).
 */
export async function createClinicBill(clientId: string, payload: ClinicBillPayload): Promise<CreatedClinicBill> {
  const supabase = getClient();
  const { data, error } = await supabase.rpc("create_clinic_bill", {
    p_client_id: clientId,
    p_customer_id: payload.customerId,
    p_consultation_id: payload.consultationId,
    p_items: payload.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
    p_discount: payload.discount,
    p_payment_status: payload.paymentStatus,
    p_payment_mode: payload.paymentStatus === "paid" ? payload.paymentMode : null,
  });

  if (error) {
    throw new Error(mapCreateBillError(error));
  }

  const result = data != null && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  const billId = asNullableText(result?.bill_id);
  if (!result || !billId) {
    throw new Error("The bill was not created.");
  }

  return {
    billId,
    orderId: asNullableText(result.order_id),
    totalAmount: asNumber(result.total_amount),
    discount: asNumber(result.discount),
    finalAmount: asNumber(result.final_amount),
    paymentStatus: isClinicPaymentStatus(result.payment_status) ? result.payment_status : null,
    paymentMode: isClinicPaymentMode(result.payment_mode) ? result.payment_mode : null,
  };
}
