import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";
import {
  buildIlikeOrFilter,
  buildListRange,
  sanitizeSearch,
  type ListPageParams,
  type ListPageResult,
} from "@/lib/list-pagination";
import {
  normalizePromoValidDays,
  type PromoApplyType,
  type PromoStatus,
  type PromoType,
  type PromotionPayload,
  type PromotionRecord,
  type PromotionTargetRecord,
  type PromotionUsageRecord,
} from "@/lib/promotion-types";

const PROMOTION_SELECT =
  "id, client_id, name, code, description, promo_type, apply_type, status, discount_percentage, discount_flat_amount, max_discount_amount, min_order_amount, total_usage_limit, usage_per_customer, current_usage_count, buy_quantity, get_quantity, buy_product_id, get_product_id, free_product_id, free_item_quantity, first_order_only, loyalty_members_only, subscription_required, valid_for_dine_in, valid_for_takeaway, valid_for_delivery, start_date, end_date, valid_days, start_time, end_time, can_stack, priority, is_public, banner_image_url, terms_conditions, created_by, created_at, updated_at, deleted_at";

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

function buildPromotionRow(clientId: string, payload: PromotionPayload) {
  return {
    client_id: clientId,
    name: payload.name.trim(),
    code: payload.code,
    description: payload.description,
    promo_type: payload.promoType,
    apply_type: payload.applyType,
    status: payload.status,
    discount_percentage: payload.discountPercentage,
    discount_flat_amount: payload.discountFlatAmount,
    max_discount_amount: payload.maxDiscountAmount,
    min_order_amount: payload.minOrderAmount,
    total_usage_limit: payload.totalUsageLimit,
    usage_per_customer: payload.usagePerCustomer,
    buy_quantity: payload.buyQuantity,
    get_quantity: payload.getQuantity,
    buy_product_id: payload.buyProductId,
    get_product_id: payload.getProductId,
    free_product_id: payload.freeProductId,
    free_item_quantity: payload.freeItemQuantity,
    first_order_only: payload.firstOrderOnly,
    loyalty_members_only: payload.loyaltyMembersOnly,
    subscription_required: payload.subscriptionRequired,
    valid_for_dine_in: payload.validForDineIn,
    valid_for_takeaway: payload.validForTakeaway,
    valid_for_delivery: payload.validForDelivery,
    start_date: payload.startDate,
    end_date: payload.endDate,
    valid_days: payload.validDays.length > 0 ? payload.validDays : null,
    start_time: payload.startTime,
    end_time: payload.endTime,
    can_stack: payload.canStack,
    priority: payload.priority,
    is_public: payload.isPublic,
    banner_image_url: payload.bannerImageUrl,
    terms_conditions: payload.termsConditions,
  };
}

function buildTargetRows(promotionId: string, payload: PromotionPayload) {
  const rows: Array<{
    promotion_id: string;
    product_id: string | null;
    product_types: string[] | null;
  }> = payload.targetProductIds.map((productId) => ({
    promotion_id: promotionId,
    product_id: productId,
    product_types: null,
  }));

  if (payload.targetProductTypes.length > 0) {
    rows.push({
      promotion_id: promotionId,
      product_id: null,
      product_types: payload.targetProductTypes,
    });
  }

  return rows;
}

function mapPromotion(
  row: any,
  targetRows: PromotionTargetRecord[],
  usageRows: PromotionUsageRecord[],
): PromotionRecord {
  const matchingTargets = targetRows.filter((target) => target.promotion_id === row.id);
  const matchingUsages = usageRows.filter((usage) => usage.promotion_id === row.id);

  return {
    id: String(row.id),
    client_id: String(row.client_id),
    name: String(row.name ?? "Unnamed promotion"),
    code: row.code ?? null,
    description: row.description ?? null,
    promo_type: row.promo_type,
    apply_type: row.apply_type,
    status: row.status,
    discount_percentage: row.discount_percentage == null ? null : asNumber(row.discount_percentage),
    discount_flat_amount: row.discount_flat_amount == null ? null : asNumber(row.discount_flat_amount),
    max_discount_amount: row.max_discount_amount == null ? null : asNumber(row.max_discount_amount),
    min_order_amount: row.min_order_amount == null ? null : asNumber(row.min_order_amount),
    total_usage_limit: row.total_usage_limit == null ? null : asNumber(row.total_usage_limit),
    usage_per_customer: row.usage_per_customer == null ? null : asNumber(row.usage_per_customer),
    current_usage_count: row.current_usage_count == null ? null : asNumber(row.current_usage_count),
    buy_quantity: row.buy_quantity == null ? null : asNumber(row.buy_quantity),
    get_quantity: row.get_quantity == null ? null : asNumber(row.get_quantity),
    buy_product_id: row.buy_product_id ?? null,
    get_product_id: row.get_product_id ?? null,
    free_product_id: row.free_product_id ?? null,
    free_item_quantity: row.free_item_quantity == null ? null : asNumber(row.free_item_quantity),
    first_order_only: Boolean(row.first_order_only),
    loyalty_members_only: Boolean(row.loyalty_members_only),
    subscription_required: Boolean(row.subscription_required),
    valid_for_dine_in: Boolean(row.valid_for_dine_in),
    valid_for_takeaway: Boolean(row.valid_for_takeaway),
    valid_for_delivery: Boolean(row.valid_for_delivery),
    start_date: row.start_date ?? "",
    end_date: row.end_date ?? null,
    valid_days: Array.isArray(row.valid_days) ? normalizePromoValidDays(row.valid_days) : [],
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    can_stack: Boolean(row.can_stack),
    priority: row.priority == null ? null : asNumber(row.priority),
    is_public: Boolean(row.is_public),
    banner_image_url: row.banner_image_url ?? null,
    terms_conditions: row.terms_conditions ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
    deleted_at: row.deleted_at ?? null,
    targetProductIds: Array.from(
      new Set(
        matchingTargets
          .map((target) => target.product_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ),
    targetProductTypes: Array.from(
      new Set(
        matchingTargets
          .flatMap((target) => target.product_types ?? [])
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    ),
    usageCount: matchingUsages.length,
    usageDiscountTotal: matchingUsages.reduce((sum, usage) => sum + usage.discount_amount, 0),
  };
}

async function replacePromotionTargets(promotionId: string, payload: PromotionPayload) {
  const supabase = getClient();

  const { error: deleteError } = await supabase
    .from("promotion_targets")
    .delete()
    .eq("promotion_id", promotionId);

  if (deleteError) {
    throw deleteError;
  }

  const rows = buildTargetRows(promotionId, payload);
  if (rows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("promotion_targets").insert(rows);
  if (insertError) {
    throw insertError;
  }
}

export async function fetchPromotions(clientId: string): Promise<PromotionRecord[]> {
  const supabase = getClient();

  const { data: promotionRows, error: promotionError } = await supabase
    .from("promotions")
    .select(PROMOTION_SELECT)
    .eq("client_id", clientId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (promotionError) {
    throw promotionError;
  }

  const promotionIds = (promotionRows ?? []).map((row: any) => String(row.id));

  const [{ data: targetRows, error: targetError }, { data: usageRows, error: usageError }] = await Promise.all([
    promotionIds.length > 0
      ? supabase
          .from("promotion_targets")
          .select("id, promotion_id, product_id, product_types, created_at")
          .in("promotion_id", promotionIds)
      : Promise.resolve({ data: [], error: null as unknown as Error | null }),
    promotionIds.length > 0
      ? supabase
          .from("promotion_usages")
          .select("id, promotion_id, customer_id, bill_id, discount_amount, used_at")
          .in("promotion_id", promotionIds)
      : Promise.resolve({ data: [], error: null as unknown as Error | null }),
  ]);

  if (targetError) {
    throw targetError;
  }

  if (usageError) {
    throw usageError;
  }

  const normalizedTargets = (targetRows ?? []).map((row: any) => ({
    id: String(row.id),
    promotion_id: String(row.promotion_id),
    product_id: row.product_id ?? null,
    product_types: Array.isArray(row.product_types)
      ? row.product_types.map((item: any) => String(item).trim()).filter(Boolean)
      : null,
    created_at: row.created_at ?? "",
  })) as PromotionTargetRecord[];

  const normalizedUsages = (usageRows ?? []).map((row: any) => ({
    id: String(row.id),
    promotion_id: String(row.promotion_id),
    customer_id: row.customer_id ?? null,
    bill_id: row.bill_id ?? null,
    discount_amount: asNumber(row.discount_amount),
    used_at: row.used_at ?? "",
  })) as PromotionUsageRecord[];

  return (promotionRows ?? []).map((row: any) => mapPromotion(row, normalizedTargets, normalizedUsages));
}

export type FetchPromotionsPageParams = ListPageParams & {
  status?: PromoStatus | "all";
  promoType?: PromoType | "all";
  applyType?: PromoApplyType | "all";
  sortBy?: "priority" | "newest" | "ending";
};

export async function fetchPromotionSummary(clientId: string): Promise<{
  total: number;
  active: number;
  scheduled: number;
  redemptions: number;
}> {
  const supabase = getClient();

  const [totalRes, activeRes, scheduledRes, usageRes] = await Promise.all([
    supabase.from("promotions").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    supabase
      .from("promotions")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("status", "ACTIVE"),
    supabase
      .from("promotions")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("status", "SCHEDULED"),
    supabase.from("promotions").select("current_usage_count").eq("client_id", clientId),
  ]);

  if (totalRes.error) {
    throw totalRes.error;
  }
  if (activeRes.error) {
    throw activeRes.error;
  }
  if (scheduledRes.error) {
    throw scheduledRes.error;
  }
  if (usageRes.error) {
    throw usageRes.error;
  }

  const redemptions = (usageRes.data ?? []).reduce(
    (sum, row: any) => sum + asNumber(row.current_usage_count),
    0,
  );

  return {
    total: totalRes.count ?? 0,
    active: activeRes.count ?? 0,
    scheduled: scheduledRes.count ?? 0,
    redemptions,
  };
}

export async function fetchPromotionsPage(
  clientId: string,
  params: FetchPromotionsPageParams = { limit: 12, offset: 0 },
): Promise<ListPageResult<PromotionRecord>> {
  const supabase = getClient();
  const search = sanitizeSearch(params.search);
  const { from, to } = buildListRange(params.offset, params.limit);
  const sortBy = params.sortBy ?? "priority";

  let query = supabase
    .from("promotions")
    .select(PROMOTION_SELECT, { count: "exact" })
    .eq("client_id", clientId);

  if (sortBy === "newest") {
    query = query.order("created_at", { ascending: false });
  } else if (sortBy === "ending") {
    query = query.order("end_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("priority", { ascending: false }).order("created_at", { ascending: false });
  }

  query = query.range(from, to);

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params.promoType && params.promoType !== "all") {
    query = query.eq("promo_type", params.promoType);
  }

  if (params.applyType && params.applyType !== "all") {
    query = query.eq("apply_type", params.applyType);
  }

  if (search) {
    const filter = buildIlikeOrFilter(["name", "code", "description"], search);
    if (filter) {
      query = query.or(filter);
    }
  }

  const { data: promotionRows, error: promotionError, count } = await query;

  if (promotionError) {
    throw promotionError;
  }

  const promotionIds = (promotionRows ?? []).map((row: any) => String(row.id));

  const [{ data: targetRows, error: targetError }, { data: usageRows, error: usageError }] = await Promise.all([
    promotionIds.length > 0
      ? supabase
          .from("promotion_targets")
          .select("id, promotion_id, product_id, product_types, created_at")
          .in("promotion_id", promotionIds)
      : Promise.resolve({ data: [], error: null as unknown as Error | null }),
    promotionIds.length > 0
      ? supabase
          .from("promotion_usages")
          .select("id, promotion_id, customer_id, bill_id, discount_amount, used_at")
          .in("promotion_id", promotionIds)
      : Promise.resolve({ data: [], error: null as unknown as Error | null }),
  ]);

  if (targetError) {
    throw targetError;
  }

  if (usageError) {
    throw usageError;
  }

  const normalizedTargets = (targetRows ?? []).map((row: any) => ({
    id: String(row.id),
    promotion_id: String(row.promotion_id),
    product_id: row.product_id ?? null,
    product_types: Array.isArray(row.product_types)
      ? row.product_types.map((item: any) => String(item).trim()).filter(Boolean)
      : null,
    created_at: row.created_at ?? "",
  })) as PromotionTargetRecord[];

  const normalizedUsages = (usageRows ?? []).map((row: any) => ({
    id: String(row.id),
    promotion_id: String(row.promotion_id),
    customer_id: row.customer_id ?? null,
    bill_id: row.bill_id ?? null,
    discount_amount: asNumber(row.discount_amount),
    used_at: row.used_at ?? "",
  })) as PromotionUsageRecord[];

  const items = (promotionRows ?? []).map((row: any) => mapPromotion(row, normalizedTargets, normalizedUsages));
  const totalCount = count ?? null;

  return {
    items,
    hasMore: totalCount != null ? from + items.length < totalCount : items.length === params.limit,
    totalCount,
  };
}

export async function createPromotion(clientId: string, payload: PromotionPayload): Promise<void> {
  const supabase = getClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const insertRow = {
    ...buildPromotionRow(clientId, payload),
    current_usage_count: 0,
    created_by: user?.id ?? null,
  };

  const { data, error } = await supabase.from("promotions").insert(insertRow).select("id");

  if (error) {
    raiseQueryError(error, "Unable to create promotion.");
  }

  const promotionId = String(data?.[0]?.id ?? "");
  if (!promotionId) {
    raiseQueryError(null, "Promotion was created but no id was returned. Check Supabase RLS select policies.");
  }

  const targetRows = buildTargetRows(promotionId, payload);
  if (targetRows.length > 0) {
    const { error: targetError } = await supabase.from("promotion_targets").insert(targetRows);
    if (targetError) {
      raiseQueryError(targetError, "Unable to save promotion targets.");
    }
  }
}

export async function updatePromotion(
  clientId: string,
  promotionId: string,
  payload: PromotionPayload,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("promotions")
    .update({
      ...buildPromotionRow(clientId, payload),
      deleted_at: payload.status === "INACTIVE" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", promotionId)
    .eq("client_id", clientId);

  if (error) {
    throw error;
  }

  await replacePromotionTargets(promotionId, payload);
}

export async function setPromotionStatus(clientId: string, promotionId: string, status: PromoStatus): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("promotions")
    .update({
      status,
      deleted_at: status === "INACTIVE" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", promotionId)
    .eq("client_id", clientId);

  if (error) {
    throw error;
  }
}
