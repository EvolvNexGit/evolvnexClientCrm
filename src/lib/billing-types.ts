export type BillingSubTab = "customer" | "product" | "transaction";

export const BILL_ORDER_TYPES = ["Dine-In", "Take-Away", "Delivery"] as const;
export type BillOrderType = (typeof BILL_ORDER_TYPES)[number];
export const BILL_ORDER_SOURCE_POS = "POS" as const;

export type CustomerRecord = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  dob: string | null;
  outreach_status: string | null;
  contact_tags: string[];
  contact_source: string | null;
  last_activity_at: string | null;
  is_blocked: boolean;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  totalOrders: number;
  totalSpent: number;
};

export type CustomerPayload = {
  name: string;
  phone?: string | null;
  email?: string | null;
  dob?: string | null;
  outreachStatus?: string | null;
  contactTags?: string[];
  contactSource?: string | null;
  isBlocked?: boolean;
  notes?: string | null;
  assignedTo?: string | null;
};

export type ContactStats = {
  total: number;
  active: number;
  newThisMonth: number;
  blocked: number;
};

export type ContactAudienceGroup = {
  label: string;
  count: number;
};

export const CONTACT_SOURCE_OPTIONS = ["Campaign", "Walk-in", "Website", "Referral"] as const;

export type ProductRecord = {
  id: string;
  client_id: string;
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
  order_id: string | null;
  customer_id: string | null;
  created_at: string;
  total_amount: number;
  discount: number;
  final_amount: number;
  walk_in_name: string | null;
  customerName: string | null;
  customerPhone: string | null;
  table_number?: string | null;
  order_source?: string | null;
  order_type?: string | null;
  status?: "pending" | "accepted" | "delivered" | null;
  items: TransactionItem[];
};
