import { BILL_ORDER_SOURCE_CLINIC } from "@/lib/billing-types";
import {
  isClinicPaymentMode,
  isClinicPaymentStatus,
  type ClinicBillFilter,
  type ClinicBillItem,
  type ClinicBillRecord,
  type ClinicPaymentMode,
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
