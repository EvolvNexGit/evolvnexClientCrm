export type PromoType =
  | "PERCENTAGE"
  | "FLAT"
  | "BUY_X_GET_Y"
  | "FREE_ITEM"
  | "FREE_DELIVERY"
  | "CASHBACK"
  | "LOYALTY"
  | "HAPPY_HOUR"
  | "FIRST_ORDER"
  | "SUBSCRIPTION";

export type PromoApplyType = "AUTO" | "COUPON";

export type PromoStatus = "ACTIVE" | "INACTIVE" | "SCHEDULED" | "EXPIRED";

/** ISO weekday numbers stored in promotions.valid_days (1 = Monday … 7 = Sunday). */
export const PROMO_VALID_DAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
] as const;

export type PromoValidDay = (typeof PROMO_VALID_DAY_OPTIONS)[number]["value"];

const PROMO_VALID_DAY_NAME_TO_VALUE: Record<string, PromoValidDay> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

export function normalizePromoValidDay(value: unknown): PromoValidDay | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7) {
    return value as PromoValidDay;
  }

  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 7) {
    return parsed as PromoValidDay;
  }

  const normalizedName = String(value ?? "").trim().toLowerCase();
  return PROMO_VALID_DAY_NAME_TO_VALUE[normalizedName] ?? null;
}

export function normalizePromoValidDays(values: unknown): PromoValidDay[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(values.map((value) => normalizePromoValidDay(value)).filter((value): value is PromoValidDay => value != null)),
  ).sort((left, right) => left - right);
}

export function formatPromoValidDay(value: PromoValidDay): string {
  return PROMO_VALID_DAY_OPTIONS.find((option) => option.value === value)?.label ?? String(value);
}

export type PromotionTargetRecord = {
  id: string;
  promotion_id: string;
  product_id: string | null;
  product_types: string[] | null;
  created_at: string;
};

export type PromotionUsageRecord = {
  id: string;
  promotion_id: string;
  customer_id: string | null;
  bill_id: string | null;
  discount_amount: number;
  used_at: string;
};

export type PromotionRecord = {
  id: string;
  client_id: string;
  name: string;
  code: string | null;
  description: string | null;
  promo_type: PromoType;
  apply_type: PromoApplyType;
  status: PromoStatus;
  discount_percentage: number | null;
  discount_flat_amount: number | null;
  max_discount_amount: number | null;
  min_order_amount: number | null;
  total_usage_limit: number | null;
  usage_per_customer: number | null;
  current_usage_count: number | null;
  buy_quantity: number | null;
  get_quantity: number | null;
  buy_product_id: string | null;
  get_product_id: string | null;
  free_product_id: string | null;
  free_item_quantity: number | null;
  first_order_only: boolean;
  loyalty_members_only: boolean;
  subscription_required: boolean;
  valid_for_dine_in: boolean;
  valid_for_takeaway: boolean;
  valid_for_delivery: boolean;
  start_date: string;
  end_date: string | null;
  valid_days: PromoValidDay[];
  start_time: string | null;
  end_time: string | null;
  can_stack: boolean;
  priority: number | null;
  is_public: boolean;
  banner_image_url: string | null;
  terms_conditions: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  targetProductIds: string[];
  targetProductTypes: string[];
  usageCount: number;
  usageDiscountTotal: number;
};

export type PromotionPayload = {
  name: string;
  code: string | null;
  description: string | null;
  promoType: PromoType;
  applyType: PromoApplyType;
  status: PromoStatus;
  discountPercentage: number | null;
  discountFlatAmount: number | null;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  totalUsageLimit: number | null;
  usagePerCustomer: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  buyProductId: string | null;
  getProductId: string | null;
  freeProductId: string | null;
  freeItemQuantity: number | null;
  firstOrderOnly: boolean;
  loyaltyMembersOnly: boolean;
  subscriptionRequired: boolean;
  validForDineIn: boolean;
  validForTakeaway: boolean;
  validForDelivery: boolean;
  startDate: string;
  endDate: string | null;
  validDays: PromoValidDay[];
  startTime: string | null;
  endTime: string | null;
  canStack: boolean;
  priority: number | null;
  isPublic: boolean;
  bannerImageUrl: string | null;
  termsConditions: string | null;
  targetProductIds: string[];
  targetProductTypes: string[];
};
