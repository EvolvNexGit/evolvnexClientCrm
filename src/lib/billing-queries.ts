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

export async function createCustomer(clientId: string, payload: CustomerPayload): Promise<CustomerRecord> {
  const supabase = getClient();
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

export async function fetchTransactions(clientId: string): Promise<TransactionRecord[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("bills")
    .select(
      "id, created_at, total_amount, discount, final_amount, walk_in_name, customers(name, phone), bill_items(id, quantity, price, total, products(name))",
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => {
    const customerRaw = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const billItems = Array.isArray(row.bill_items) ? row.bill_items : [];

    return {
      id: String(row.id),
      created_at: row.created_at ?? "",
      total_amount: asNumber(row.total_amount),
      discount: asNumber(row.discount),
      final_amount: asNumber(row.final_amount),
      walk_in_name: row.walk_in_name ?? null,
      customerName: customerRaw?.name ?? null,
      customerPhone: customerRaw?.phone ?? null,
      items: billItems.map((item: any) => {
        const productRaw = Array.isArray(item.products) ? item.products[0] : item.products;
        return {
          id: String(item.id),
          quantity: asNumber(item.quantity),
          price: asNumber(item.price),
          total: asNumber(item.total),
          productName: productRaw?.name ?? "Unknown product",
        };
      }),
    };
  });
}
