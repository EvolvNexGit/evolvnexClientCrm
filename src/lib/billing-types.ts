export type BillingSubTab = "customer" | "product" | "transaction";

export type CustomerRecord = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  dob: string | null;
  created_at: string;
  totalOrders: number;
  totalSpent: number;
};

export type CustomerPayload = {
  name: string;
  phone?: string | null;
  email?: string | null;
  dob?: string | null;
};

export type ProductRecord = {
  id: string;
  name: string;
  price: number;
  type: string | null;
  is_active: boolean;
  created_at: string;
};

export type ProductPayload = {
  name: string;
  price: number;
  type?: string | null;
};

export type TransactionItem = {
  id: string;
  quantity: number;
  price: number;
  total: number;
  productName: string;
};

export type TransactionRecord = {
  id: string;
  created_at: string;
  total_amount: number;
  discount: number;
  final_amount: number;
  walk_in_name: string | null;
  customerName: string | null;
  customerPhone: string | null;
  items: TransactionItem[];
};
