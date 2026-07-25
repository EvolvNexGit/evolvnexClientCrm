import {
  buildIlikeOrFilter,
  buildListRange,
  LIST_PAGE_SHOW_ALL_MAX,
  sanitizeSearch,
  type ListPageParams,
  type ListPageResult,
} from "@/lib/list-pagination";
import { getSupabaseClient } from "@/lib/supabase";
import type {
  CustomerPayload,
  CustomerRecord,
  ProductPayload,
  ProductRecord,
  TransactionRecord,
} from "@/lib/billing-types";

function getClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }
  return supabase;
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCustomerValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export async function fetchCustomers(clientId: string): Promise<CustomerRecord[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, email, dob, created_at, bills(id, final_amount)")
    .eq("client_id", clientId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => {
    const bills = Array.isArray(row.bills) ? row.bills : [];
    const totalSpent = bills.reduce((sum: number, bill: any) => sum + asNumber(bill.final_amount), 0);

    return {
      id: String(row.id),
      name: String(row.name ?? "Unnamed"),
      phone: row.phone ?? null,
      email: row.email ?? null,
      dob: row.dob ?? null,
      created_at: row.created_at ?? "",
      totalOrders: bills.length,
      totalSpent,
    };
  });
}

export async function fetchCustomersPage(
  clientId: string,
  params: ListPageParams = { limit: 12, offset: 0 },
): Promise<ListPageResult<CustomerRecord>> {
  const supabase = getClient();
  const search = sanitizeSearch(params.search);
  const { from, to } = buildListRange(params.offset, params.limit);

  let query = supabase
    .from("customers")
    .select("id, name, phone, email, dob, created_at, bills(id, final_amount)", { count: "exact" })
    .eq("client_id", clientId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    const filter = buildIlikeOrFilter(["name", "phone", "email"], search);
    if (filter) {
      query = query.or(filter);
    }
  }

  const { data, error, count } = await query;
  if (error) {
    throw error;
  }

  const items = (data ?? []).map((row: any) => {
    const bills = Array.isArray(row.bills) ? row.bills : [];
    const totalSpent = bills.reduce((sum: number, bill: any) => sum + asNumber(bill.final_amount), 0);

    return {
      id: String(row.id),
      name: String(row.name ?? "Unnamed"),
      phone: row.phone ?? null,
      email: row.email ?? null,
      dob: row.dob ?? null,
      created_at: row.created_at ?? "",
      totalOrders: bills.length,
      totalSpent,
    } satisfies CustomerRecord;
  });

  const totalCount = count ?? null;
  return {
    items,
    hasMore: totalCount != null ? from + items.length < totalCount : items.length === params.limit,
    totalCount,
  };
}

export async function createCustomer(clientId: string, payload: CustomerPayload): Promise<CustomerRecord> {
  const supabase = getClient();
  const normalizedName = normalizeCustomerValue(payload.name);
  const normalizedPhone = normalizeCustomerValue(payload.phone);
  const normalizedEmail = normalizeCustomerValue(payload.email);
  const normalizedDob = normalizeCustomerValue(payload.dob);

  const { data: existingCustomers, error: existingError } = await supabase
    .from("customers")
    .select("id, name, phone, email, dob, created_at, is_active")
    .eq("client_id", clientId);

  if (existingError) {
    throw existingError;
  }

  const duplicateCustomer = (existingCustomers ?? []).find((customer: any) => {
    return (
      normalizeCustomerValue(customer.name) === normalizedName &&
      normalizeCustomerValue(customer.phone) === normalizedPhone &&
      normalizeCustomerValue(customer.email) === normalizedEmail &&
      normalizeCustomerValue(customer.dob) === normalizedDob
    );
  });

  if (duplicateCustomer) {
    throw new Error("Customer already exists with the same details.");
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      client_id: clientId,
      name: payload.name,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      dob: payload.dob ?? null,
    })
    .select("id, name, phone, email, dob, created_at")
    .single();

  if (error) {
    throw error;
  }

  const customer = data as CustomerRecord;

  return {
    ...customer,
    totalOrders: 0,
    totalSpent: 0,
  };
}

export async function updateCustomer(
  clientId: string,
  customerId: string,
  payload: Partial<CustomerPayload>,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("customers")
    .update({
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
      ...(payload.email !== undefined ? { email: payload.email } : {}),
      ...(payload.dob !== undefined ? { dob: payload.dob } : {}),
    })
    .eq("id", customerId)
    .eq("client_id", clientId);

  if (error) {
    throw error;
  }
}

export async function deleteCustomer(clientId: string, customerId: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("customers")
    .update({
      end_date: new Date().toISOString().slice(0, 10),
      is_active: false,
    })
    .eq("id", customerId)
    .eq("client_id", clientId);

  if (error) {
    throw error;
  }
}

export async function fetchProducts(clientId: string, options?: { includeInactive?: boolean }): Promise<ProductRecord[]> {
  const supabase = getClient();
  let query = supabase
    .from("products")
    .select("id, client_id, name, price, type, is_active, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    client_id: String(row.client_id),
    name: String(row.name ?? "Unnamed product"),
    price: asNumber(row.price),
    type: row.type ?? null,
    is_active: Boolean(row.is_active),
    created_at: row.created_at ?? "",
  }));
}

export type FetchProductsPageParams = ListPageParams & {
  includeInactive?: boolean;
  type?: string | null;
  activeOnly?: boolean;
  /** Explicit status filter, takes precedence over activeOnly/includeInactive when set. */
  status?: "active" | "inactive" | "all";
};

export async function fetchProductsPage(
  clientId: string,
  params: FetchProductsPageParams = { limit: 12, offset: 0 },
): Promise<ListPageResult<ProductRecord>> {
  const supabase = getClient();
  const search = sanitizeSearch(params.search);
  const { from, to } = buildListRange(params.offset, params.limit);

  let query = supabase
    .from("products")
    .select("id, client_id, name, price, type, is_active, created_at", { count: "exact" })
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params.status === "active" || (params.status == null && params.activeOnly)) {
    query = query.eq("is_active", true);
  } else if (params.status === "inactive") {
    query = query.eq("is_active", false);
  }
  // "all" (or no status/activeOnly/includeInactive constraint) leaves both statuses visible.

  if (params.type) {
    query = query.eq("type", params.type);
  }

  if (search) {
    const filter = buildIlikeOrFilter(["name", "type"], search);
    if (filter) {
      query = query.or(filter);
    }
  }

  const { data, error, count } = await query;
  if (error) {
    throw error;
  }

  const items = (data ?? []).map((row: any) => ({
    id: String(row.id),
    client_id: String(row.client_id),
    name: String(row.name ?? "Unnamed product"),
    price: asNumber(row.price),
    type: row.type ?? null,
    is_active: Boolean(row.is_active),
    created_at: row.created_at ?? "",
  })) as ProductRecord[];

  const totalCount = count ?? null;
  return {
    items,
    hasMore: totalCount != null ? from + items.length < totalCount : items.length === params.limit,
    totalCount,
  };
}

export async function fetchProductTypes(clientId: string): Promise<string[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("products")
    .select("type")
    .eq("client_id", clientId)
    .not("type", "is", null)
    .order("type", { ascending: true });

  if (error) {
    throw error;
  }

  // Get unique types
  const uniqueTypes = [...new Set((data ?? []).map((row: any) => String(row.type ?? "").trim()).filter(Boolean))];
  return uniqueTypes;
}

export async function createProduct(clientId: string, payload: ProductPayload): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from("products").insert({
    client_id: clientId,
    name: payload.name,
    price: payload.price,
    type: payload.type ?? null,
    is_active: true,
  });

  if (error) {
    throw error;
  }
}

export async function updateProduct(
  clientId: string,
  productId: string,
  payload: Partial<ProductPayload>,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("products")
    .update({
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.price !== undefined ? { price: payload.price } : {}),
      ...(payload.type !== undefined ? { type: payload.type } : {}),
    })
    .eq("id", productId)
    .eq("client_id", clientId);

  if (error) {
    throw error;
  }
}

export async function setProductActive(
  clientId: string,
  productId: string,
  isActive: boolean,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", productId)
    .eq("client_id", clientId);

  if (error) {
    throw error;
  }
}

const BILL_TRANSACTION_SELECT =
  "id, order_id, customer_id, order_source, order_type, created_at, total_amount, discount, final_amount, walk_in_name, status, table_number, customers(name, phone), bill_items(id, quantity, price, total, products(name))";

export const ORDERS_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function normalizeBillStatus(val: unknown): TransactionRecord["status"] {
  if (val == null) {
    return null;
  }

  const status = String(val).trim().toLowerCase();
  if (status === "pending" || status === "accepted" || status === "delivered") {
    return status;
  }

  return null;
}

function normalizeOrderText(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function mapBillRowToTransaction(row: Record<string, unknown>): TransactionRecord {
  const customerRaw = Array.isArray(row.customers)
    ? (row.customers[0] as Record<string, unknown>)
    : (row.customers as Record<string, unknown> | null);
  const billItems = Array.isArray(row.bill_items) ? row.bill_items : [];

  return {
    id: String(row.id),
    order_id: row.order_id != null && String(row.order_id).trim() !== "" ? String(row.order_id) : null,
    customer_id: row.customer_id != null && String(row.customer_id).trim() !== "" ? String(row.customer_id) : null,
    created_at: String(row.created_at ?? ""),
    total_amount: asNumber(row.total_amount),
    discount: asNumber(row.discount),
    final_amount: asNumber(row.final_amount),
    table_number: (row.table_number as string | null) ?? null,
    order_source: normalizeOrderText(row.order_source),
    order_type: normalizeOrderText(row.order_type),
    status: normalizeBillStatus(row.status),
    walk_in_name: (row.walk_in_name as string | null) ?? null,
    customerName: (customerRaw?.name as string | null) ?? null,
    customerPhone: (customerRaw?.phone as string | null) ?? null,
    items: billItems.map((item: Record<string, unknown>) => {
      const productRaw = Array.isArray(item.products)
        ? (item.products[0] as Record<string, unknown>)
        : (item.products as Record<string, unknown> | null);

      return {
        id: String(item.id),
        quantity: asNumber(item.quantity),
        price: asNumber(item.price),
        total: asNumber(item.total),
        productName: (productRaw?.name as string | null) ?? "Unknown product",
      };
    }),
  };
}

export async function fetchTransactions(clientId: string): Promise<TransactionRecord[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("bills")
    .select(BILL_TRANSACTION_SELECT)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapBillRowToTransaction(row as Record<string, unknown>));
}

export type FetchTransactionsPageParams = ListPageParams & {
  dateFrom?: string | null;
  dateTo?: string | null;
};

export async function fetchTransactionsPage(
  clientId: string,
  params: FetchTransactionsPageParams = { limit: 12, offset: 0 },
): Promise<ListPageResult<TransactionRecord>> {
  const supabase = getClient();
  const search = sanitizeSearch(params.search);
  const { from, to } = buildListRange(params.offset, params.limit);

  // Customer/product names live on joins; when searching, load a capped set and filter client-side.
  if (search) {
    let query = supabase
      .from("bills")
      .select(BILL_TRANSACTION_SELECT)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .range(0, LIST_PAGE_SHOW_ALL_MAX - 1);

    if (params.dateFrom) {
      query = query.gte("created_at", params.dateFrom);
    }
    if (params.dateTo) {
      query = query.lte("created_at", params.dateTo);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const needle = search.toLowerCase();
    const filtered = (data ?? [])
      .map((row) => mapBillRowToTransaction(row as Record<string, unknown>))
      .filter((transaction) => {
        const haystack = [
          transaction.id,
          transaction.order_id ?? "",
          transaction.customerName ?? "",
          transaction.walk_in_name ?? "",
          transaction.customerPhone ?? "",
          transaction.status ?? "",
          transaction.order_type ?? "",
          transaction.table_number ?? "",
          ...transaction.items.map((item) => item.productName),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      });

    const items = filtered.slice(from, to + 1);
    return {
      items,
      hasMore: to + 1 < filtered.length,
      totalCount: filtered.length,
    };
  }

  let query = supabase
    .from("bills")
    .select(BILL_TRANSACTION_SELECT, { count: "exact" })
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params.dateFrom) {
    query = query.gte("created_at", params.dateFrom);
  }
  if (params.dateTo) {
    query = query.lte("created_at", params.dateTo);
  }

  const { data, error, count } = await query;
  if (error) {
    throw error;
  }

  const items = (data ?? []).map((row) => mapBillRowToTransaction(row as Record<string, unknown>));
  const totalCount = count ?? null;
  return {
    items,
    hasMore: totalCount != null ? from + items.length < totalCount : items.length === params.limit,
    totalCount,
  };
}

export async function fetchTransactionsSince(
  clientId: string,
  sinceIso: string,
): Promise<TransactionRecord[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("bills")
    .select(BILL_TRANSACTION_SELECT)
    .eq("client_id", clientId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapBillRowToTransaction(row as Record<string, unknown>));
}

function isDeliveredStatus(status: TransactionRecord["status"]): boolean {
  return String(status ?? "").trim().toLowerCase() === "delivered";
}

/** Active bills from the last 24 hours (not delivered), newest first. */
export async function fetchActiveOrders(clientId: string): Promise<TransactionRecord[]> {
  const supabase = getClient();
  const since = new Date(Date.now() - ORDERS_LOOKBACK_MS).toISOString();

  const { data, error } = await supabase
    .from("bills")
    .select(BILL_TRANSACTION_SELECT)
    .eq("client_id", clientId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((row) => mapBillRowToTransaction(row as Record<string, unknown>))
    .filter((transaction) => !isDeliveredStatus(transaction.status));
}

export async function updateBillStatus(clientId: string, billId: string, status: "pending" | "accepted" | "delivered") {
  const supabase = getClient();
  const dbStatus = (function mapToDb(s: string) {
    const key = String(s ?? "").trim().toLowerCase();
    if (key === "pending") return "PENDING";
    if (key === "accepted") return "ACCEPTED";
    if (key === "delivered") return "DELIVERED";
    return s;
  })(status);

  const { error } = await supabase
    .from("bills")
    .update({ status: dbStatus })
    .eq("client_id", clientId)
    .eq("id", billId);

  if (error) {
    throw error;
  }
}


