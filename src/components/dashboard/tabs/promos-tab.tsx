"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagedList } from "@/hooks/use-paged-list";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useProducts } from "@/hooks/use-products";
import { usePromotions } from "@/hooks/use-promotions";
import type { ProductRecord } from "@/lib/billing-types";
import { fetchPromotionSummary, fetchPromotionsPage } from "@/lib/promotion-queries";
import type {
  PromoApplyType,
  PromoStatus,
  PromoType,
  PromoValidDay,
  PromotionPayload,
  PromotionRecord,
} from "@/lib/promotion-types";
import { formatPromoValidDay, PROMO_VALID_DAY_OPTIONS } from "@/lib/promotion-types";
import { formatSupabaseError } from "@/lib/supabase";
import { formatUtcToIst } from "@/lib/time-utils";

const PROMO_TYPE_OPTIONS: PromoType[] = [
  "PERCENTAGE",
  "FLAT",
  "BUY_X_GET_Y",
  "FREE_ITEM",
  "FREE_DELIVERY",
  "CASHBACK",
  "LOYALTY",
  "HAPPY_HOUR",
  "FIRST_ORDER",
  "SUBSCRIPTION",
];

const PROMO_APPLY_OPTIONS: PromoApplyType[] = ["AUTO", "COUPON"];
const PROMO_STATUS_OPTIONS: (PromoStatus | "all")[] = ["all", "ACTIVE", "SCHEDULED", "INACTIVE", "EXPIRED"];

type PromotionFormState = {
  name: string;
  code: string;
  description: string;
  promoType: PromoType;
  applyType: PromoApplyType;
  status: PromoStatus;
  discountPercentage: string;
  discountFlatAmount: string;
  maxDiscountAmount: string;
  minOrderAmount: string;
  totalUsageLimit: string;
  usagePerCustomer: string;
  buyQuantity: string;
  getQuantity: string;
  buyProductId: string;
  getProductId: string;
  freeProductId: string;
  freeItemQuantity: string;
  firstOrderOnly: boolean;
  loyaltyMembersOnly: boolean;
  subscriptionRequired: boolean;
  validForDineIn: boolean;
  validForTakeaway: boolean;
  validForDelivery: boolean;
  startDate: string;
  endDate: string;
  validDays: PromoValidDay[];
  startTime: string;
  endTime: string;
  canStack: boolean;
  priority: string;
  isPublic: boolean;
  bannerImageUrl: string;
  termsConditions: string;
  targetProductIds: string[];
  targetProductTypes: string[];
};

type PromotionModalProps = {
  open: boolean;
  mode: "create" | "edit";
  promotion: PromotionRecord | null;
  products: ProductRecord[];
  productTypes: string[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: PromotionPayload) => Promise<void>;
};

function defaultStartDateTime() {
  const date = new Date();
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function createEmptyPromotionForm(): PromotionFormState {
  return {
    name: "",
    code: "",
    description: "",
    promoType: "PERCENTAGE",
    applyType: "AUTO",
    status: "ACTIVE",
    discountPercentage: "10",
    discountFlatAmount: "",
    maxDiscountAmount: "",
    minOrderAmount: "",
    totalUsageLimit: "",
    usagePerCustomer: "1",
    buyQuantity: "",
    getQuantity: "",
    buyProductId: "",
    getProductId: "",
    freeProductId: "",
    freeItemQuantity: "",
    firstOrderOnly: false,
    loyaltyMembersOnly: false,
    subscriptionRequired: false,
    validForDineIn: true,
    validForTakeaway: true,
    validForDelivery: true,
    startDate: defaultStartDateTime(),
    endDate: "",
    validDays: [],
    startTime: "",
    endTime: "",
    canStack: false,
    priority: "0",
    isPublic: true,
    bannerImageUrl: "",
    termsConditions: "",
    targetProductIds: [],
    targetProductTypes: [],
  };
}

function toLocalDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function promotionToForm(promotion: PromotionRecord): PromotionFormState {
  return {
    name: promotion.name,
    code: promotion.code ?? "",
    description: promotion.description ?? "",
    promoType: promotion.promo_type,
    applyType: promotion.apply_type,
    status: promotion.status,
    discountPercentage: promotion.discount_percentage == null ? "" : String(promotion.discount_percentage),
    discountFlatAmount: promotion.discount_flat_amount == null ? "" : String(promotion.discount_flat_amount),
    maxDiscountAmount: promotion.max_discount_amount == null ? "" : String(promotion.max_discount_amount),
    minOrderAmount: promotion.min_order_amount == null ? "" : String(promotion.min_order_amount),
    totalUsageLimit: promotion.total_usage_limit == null ? "" : String(promotion.total_usage_limit),
    usagePerCustomer: promotion.usage_per_customer == null ? "" : String(promotion.usage_per_customer),
    buyQuantity: promotion.buy_quantity == null ? "" : String(promotion.buy_quantity),
    getQuantity: promotion.get_quantity == null ? "" : String(promotion.get_quantity),
    buyProductId: promotion.buy_product_id ?? "",
    getProductId: promotion.get_product_id ?? "",
    freeProductId: promotion.free_product_id ?? "",
    freeItemQuantity: promotion.free_item_quantity == null ? "" : String(promotion.free_item_quantity),
    firstOrderOnly: promotion.first_order_only,
    loyaltyMembersOnly: promotion.loyalty_members_only,
    subscriptionRequired: promotion.subscription_required,
    validForDineIn: promotion.valid_for_dine_in,
    validForTakeaway: promotion.valid_for_takeaway,
    validForDelivery: promotion.valid_for_delivery,
    startDate: toLocalDateTime(promotion.start_date),
    endDate: toLocalDateTime(promotion.end_date),
    validDays: promotion.valid_days,
    startTime: promotion.start_time ?? "",
    endTime: promotion.end_time ?? "",
    canStack: promotion.can_stack,
    priority: promotion.priority == null ? "0" : String(promotion.priority),
    isPublic: promotion.is_public,
    bannerImageUrl: promotion.banner_image_url ?? "",
    termsConditions: promotion.terms_conditions ?? "",
    targetProductIds: promotion.targetProductIds,
    targetProductTypes: promotion.targetProductTypes,
  };
}

function parseNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoDateTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatDateRange(startDate: string, endDate: string | null) {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  const startLabel = Number.isNaN(start.getTime()) ? startDate : formatUtcToIst(startDate, { withSeconds: false });
  const endLabel = end && !Number.isNaN(end.getTime()) ? formatUtcToIst(endDate, { withSeconds: false }) : null;

  return endLabel ? `${startLabel} - ${endLabel}` : `${startLabel} onward`;
}

function getTargetSummary(promotion: PromotionRecord, productsById: Map<string, ProductRecord>) {
  const productNames = promotion.targetProductIds.map((productId) => productsById.get(productId)?.name ?? productId);
  const productTypes = promotion.targetProductTypes.map((type) => titleCase(type));

  if (productNames.length === 0 && productTypes.length === 0) {
    return "All products";
  }

  const pieces: string[] = [];
  if (productNames.length > 0) {
    pieces.push(`${productNames.length} product${productNames.length > 1 ? "s" : ""}`);
  }
  if (productTypes.length > 0) {
    pieces.push(`${productTypes.length} type${productTypes.length > 1 ? "s" : ""}`);
  }

  return pieces.join(" + ");
}

function PromotionModal({ open, mode, promotion, products, productTypes, saving, onClose, onSubmit }: PromotionModalProps) {
  const [form, setForm] = useState<PromotionFormState>(createEmptyPromotionForm());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setError(null);
    setForm(promotion ? promotionToForm(promotion) : createEmptyPromotionForm());
  }, [open, promotion]);

  function updateField<K extends keyof PromotionFormState>(field: K, value: PromotionFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleDay(day: PromoValidDay) {
    setForm((current) => ({
      ...current,
      validDays: current.validDays.includes(day)
        ? current.validDays.filter((item) => item !== day)
        : [...current.validDays, day],
    }));
  }

  function toggleProductTarget(productId: string) {
    setForm((current) => ({
      ...current,
      targetProductIds: current.targetProductIds.includes(productId)
        ? current.targetProductIds.filter((id) => id !== productId)
        : [...current.targetProductIds, productId],
    }));
  }

  function toggleProductTypeTarget(productType: string) {
    setForm((current) => ({
      ...current,
      targetProductTypes: current.targetProductTypes.includes(productType)
        ? current.targetProductTypes.filter((type) => type !== productType)
        : [...current.targetProductTypes, productType],
    }));
  }

  function validateForm() {
    if (!form.name.trim()) {
      return "Promotion name is required.";
    }

    if (form.applyType === "COUPON" && !form.code.trim()) {
      return "Coupon promotions need a code.";
    }

    if (!form.startDate.trim()) {
      return "Start date is required.";
    }

    if (form.endDate.trim() && new Date(form.endDate) < new Date(form.startDate)) {
      return "End date must be after start date.";
    }

    switch (form.promoType) {
      case "PERCENTAGE":
        if (parseNullableNumber(form.discountPercentage) == null) {
          return "Percentage promotions need a discount percentage.";
        }
        break;
      case "FLAT":
      case "CASHBACK":
        if (parseNullableNumber(form.discountFlatAmount) == null) {
          return "This promotion needs a flat amount.";
        }
        break;
      case "BUY_X_GET_Y":
        if (parseNullableNumber(form.buyQuantity) == null || parseNullableNumber(form.getQuantity) == null) {
          return "Buy X Get Y promotions need both quantities.";
        }
        break;
      case "FREE_ITEM":
        if (!form.freeProductId || parseNullableNumber(form.freeItemQuantity) == null) {
          return "Free item promotions need a free product and quantity.";
        }
        break;
      default:
        break;
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload: PromotionPayload = {
      name: form.name.trim(),
      code: parseNullableText(form.code)?.toUpperCase() ?? null,
      description: parseNullableText(form.description),
      promoType: form.promoType,
      applyType: form.applyType,
      status: form.status,
      discountPercentage: parseNullableNumber(form.discountPercentage),
      discountFlatAmount: parseNullableNumber(form.discountFlatAmount),
      maxDiscountAmount: parseNullableNumber(form.maxDiscountAmount),
      minOrderAmount: parseNullableNumber(form.minOrderAmount),
      totalUsageLimit: parseNullableNumber(form.totalUsageLimit),
      usagePerCustomer: parseNullableNumber(form.usagePerCustomer),
      buyQuantity: parseNullableNumber(form.buyQuantity),
      getQuantity: parseNullableNumber(form.getQuantity),
      buyProductId: parseNullableText(form.buyProductId),
      getProductId: parseNullableText(form.getProductId),
      freeProductId: parseNullableText(form.freeProductId),
      freeItemQuantity: parseNullableNumber(form.freeItemQuantity),
      firstOrderOnly: form.firstOrderOnly,
      loyaltyMembersOnly: form.loyaltyMembersOnly,
      subscriptionRequired: form.subscriptionRequired,
      validForDineIn: form.validForDineIn,
      validForTakeaway: form.validForTakeaway,
      validForDelivery: form.validForDelivery,
      startDate: toIsoDateTime(form.startDate) ?? new Date().toISOString(),
      endDate: toIsoDateTime(form.endDate),
      validDays: form.validDays,
      startTime: parseNullableText(form.startTime),
      endTime: parseNullableText(form.endTime),
      canStack: form.canStack,
      priority: parseNullableNumber(form.priority),
      isPublic: form.isPublic,
      bannerImageUrl: parseNullableText(form.bannerImageUrl),
      termsConditions: parseNullableText(form.termsConditions),
      targetProductIds: form.targetProductIds,
      targetProductTypes: form.targetProductTypes,
    };

    try {
      await onSubmit(payload);
      onClose();
    } catch (submitError) {
      setError(formatSupabaseError(submitError, "Unable to save promotion."));
    }
  }

  const fieldClass = "w-full rounded-lg border border-border bg-card px-3 py-2 text-base text-text";
  const checkboxClass = "h-4 w-4 rounded border-border text-primary focus:ring-primary";

  return (
    <EntityModal
      open={open}
      title={mode === "create" ? "New promotion" : `Edit ${promotion?.name ?? "promotion"}`}
      onClose={onClose}
      contentClassName="sm:max-w-6xl"
    >
      <form className="space-y-6" onSubmit={handleSubmit}>
        {error && <div className="rounded-xl border border-primary/50 bg-primary/10 p-3 text-sm text-primary">{error}</div>}

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm text-muted-foreground">
            <span className="mb-1 block">Name *</span>
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} className={fieldClass} required />
          </label>

          <label className="text-sm text-muted-foreground">
            <span className="mb-1 block">Code{form.applyType === "COUPON" ? " *" : ""}</span>
            <input value={form.code} onChange={(event) => updateField("code", event.target.value)} className={fieldClass} placeholder="SAVE20" />
          </label>

          <label className="text-sm text-muted-foreground lg:col-span-2">
            <span className="mb-1 block">Description</span>
            <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} rows={3} className={fieldClass} />
          </label>

          <label className="text-sm text-muted-foreground">
            <span className="mb-1 block">Promotion type</span>
            <select value={form.promoType} onChange={(event) => updateField("promoType", event.target.value as PromoType)} className={fieldClass}>
              {PROMO_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{titleCase(option)}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-muted-foreground">
            <span className="mb-1 block">Apply type</span>
            <select value={form.applyType} onChange={(event) => updateField("applyType", event.target.value as PromoApplyType)} className={fieldClass}>
              {PROMO_APPLY_OPTIONS.map((option) => (
                <option key={option} value={option}>{titleCase(option)}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-muted-foreground">
            <span className="mb-1 block">Status</span>
            <select value={form.status} onChange={(event) => updateField("status", event.target.value as PromoStatus)} className={fieldClass}>
              {PROMO_STATUS_OPTIONS.filter((option): option is PromoStatus => option !== "all").map((option) => (
                <option key={option} value={option}>{titleCase(option)}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-muted-foreground">
            <span className="mb-1 block">Priority</span>
            <input value={form.priority} onChange={(event) => updateField("priority", event.target.value)} className={fieldClass} inputMode="numeric" />
          </label>

          <div className="flex items-end gap-3 rounded-xl border border-border bg-background p-3">
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={form.isPublic} onChange={(event) => updateField("isPublic", event.target.checked)} className={checkboxClass} />
              Public
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={form.canStack} onChange={(event) => updateField("canStack", event.target.checked)} className={checkboxClass} />
              Stackable
            </label>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-background p-4">
          <div>
            <h4 className="text-base font-semibold text-text">Discount and usage</h4>
            <p className="text-sm text-muted-foreground">Set the offer math and any usage rules.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Discount percentage</span>
              <input value={form.discountPercentage} onChange={(event) => updateField("discountPercentage", event.target.value)} className={fieldClass} inputMode="decimal" />
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Flat amount</span>
              <input value={form.discountFlatAmount} onChange={(event) => updateField("discountFlatAmount", event.target.value)} className={fieldClass} inputMode="decimal" />
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Max discount</span>
              <input value={form.maxDiscountAmount} onChange={(event) => updateField("maxDiscountAmount", event.target.value)} className={fieldClass} inputMode="decimal" />
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Min order amount</span>
              <input value={form.minOrderAmount} onChange={(event) => updateField("minOrderAmount", event.target.value)} className={fieldClass} inputMode="decimal" />
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Total usage limit</span>
              <input value={form.totalUsageLimit} onChange={(event) => updateField("totalUsageLimit", event.target.value)} className={fieldClass} inputMode="numeric" />
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Usage per customer</span>
              <input value={form.usagePerCustomer} onChange={(event) => updateField("usagePerCustomer", event.target.value)} className={fieldClass} inputMode="numeric" />
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Buy quantity</span>
              <input value={form.buyQuantity} onChange={(event) => updateField("buyQuantity", event.target.value)} className={fieldClass} inputMode="numeric" />
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Get quantity</span>
              <input value={form.getQuantity} onChange={(event) => updateField("getQuantity", event.target.value)} className={fieldClass} inputMode="numeric" />
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Buy product</span>
              <select value={form.buyProductId} onChange={(event) => updateField("buyProductId", event.target.value)} className={fieldClass}>
                <option value="">None</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Get product</span>
              <select value={form.getProductId} onChange={(event) => updateField("getProductId", event.target.value)} className={fieldClass}>
                <option value="">None</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Free product</span>
              <select value={form.freeProductId} onChange={(event) => updateField("freeProductId", event.target.value)} className={fieldClass}>
                <option value="">None</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Free item quantity</span>
              <input value={form.freeItemQuantity} onChange={(event) => updateField("freeItemQuantity", event.target.value)} className={fieldClass} inputMode="numeric" />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={form.firstOrderOnly} onChange={(event) => updateField("firstOrderOnly", event.target.checked)} className={checkboxClass} />
              First order only
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={form.loyaltyMembersOnly} onChange={(event) => updateField("loyaltyMembersOnly", event.target.checked)} className={checkboxClass} />
              Loyalty members only
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={form.subscriptionRequired} onChange={(event) => updateField("subscriptionRequired", event.target.checked)} className={checkboxClass} />
              Subscription required
            </label>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-background p-4">
          <div>
            <h4 className="text-base font-semibold text-text">Schedule and channels</h4>
            <p className="text-sm text-muted-foreground">Control when and where the promotion applies.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Start date *</span>
              <input type="datetime-local" value={form.startDate} onChange={(event) => updateField("startDate", event.target.value)} className={fieldClass} required />
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">End date</span>
              <input type="datetime-local" value={form.endDate} onChange={(event) => updateField("endDate", event.target.value)} className={fieldClass} />
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">Start time</span>
              <input type="time" value={form.startTime} onChange={(event) => updateField("startTime", event.target.value)} className={fieldClass} />
            </label>

            <label className="text-sm text-muted-foreground">
              <span className="mb-1 block">End time</span>
              <input type="time" value={form.endTime} onChange={(event) => updateField("endTime", event.target.value)} className={fieldClass} />
            </label>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-text">Valid days</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {PROMO_VALID_DAY_OPTIONS.map((day) => (
                <label key={day.value} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-text">
                  <input type="checkbox" checked={form.validDays.includes(day.value)} onChange={() => toggleDay(day.value)} className={checkboxClass} />
                  {day.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={form.validForDineIn} onChange={(event) => updateField("validForDineIn", event.target.checked)} className={checkboxClass} />
              Dine-in
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={form.validForTakeaway} onChange={(event) => updateField("validForTakeaway", event.target.checked)} className={checkboxClass} />
              Takeaway
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={form.validForDelivery} onChange={(event) => updateField("validForDelivery", event.target.checked)} className={checkboxClass} />
              Delivery
            </label>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-border bg-background p-4">
            <div>
              <h4 className="text-base font-semibold text-text">Product targets</h4>
              <p className="text-sm text-muted-foreground">Leave empty to apply to all products.</p>
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border bg-card p-3">
              {products.length === 0 ? (
                <div className="text-sm text-muted-foreground">No products found.</div>
              ) : (
                products.map((product) => (
                  <label key={product.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-text hover:bg-muted/50">
                    <span>
                      <span className="block font-medium">{product.name}</span>
                      <span className="block text-xs text-muted-foreground">{product.type ?? "No type"}</span>
                    </span>
                    <input type="checkbox" checked={form.targetProductIds.includes(product.id)} onChange={() => toggleProductTarget(product.id)} className={checkboxClass} />
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-background p-4">
            <div>
              <h4 className="text-base font-semibold text-text">Product type targets</h4>
              <p className="text-sm text-muted-foreground">Filter promotions to product families.</p>
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border bg-card p-3">
              {productTypes.length === 0 ? (
                <div className="text-sm text-muted-foreground">No product types available.</div>
              ) : (
                productTypes.map((productType) => (
                  <label key={productType} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-text hover:bg-muted/50">
                    <span>
                      <span className="block font-medium">{titleCase(productType)}</span>
                      <span className="block text-xs text-muted-foreground">Target this product type</span>
                    </span>
                    <input type="checkbox" checked={form.targetProductTypes.includes(productType)} onChange={() => toggleProductTypeTarget(productType)} className={checkboxClass} />
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-background p-4">
          <div>
            <h4 className="text-base font-semibold text-text">Media and terms</h4>
            <p className="text-sm text-muted-foreground">Optional banner and policy copy for the offer detail view.</p>
          </div>

          <label className="block text-sm text-muted-foreground">
            <span className="mb-1 block">Banner image URL</span>
            <input value={form.bannerImageUrl} onChange={(event) => updateField("bannerImageUrl", event.target.value)} className={fieldClass} />
          </label>

          <label className="block text-sm text-muted-foreground">
            <span className="mb-1 block">Terms and conditions</span>
            <textarea value={form.termsConditions} onChange={(event) => updateField("termsConditions", event.target.value)} rows={4} className={fieldClass} />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : mode === "create" ? "Create promotion" : "Save changes"}
          </Button>
        </div>
      </form>
    </EntityModal>
  );
}

function getStatusClass(status: PromoStatus) {
  if (status === "ACTIVE") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700";
  }

  if (status === "SCHEDULED") {
    return "border-sky-500/40 bg-sky-500/10 text-sky-700";
  }

  if (status === "EXPIRED") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700";
  }

  return "border-border bg-muted text-muted-foreground";
}

export default function PromosTab({ clientId }: { clientId: string }) {
  const promotionState = usePromotions(clientId);
  const productState = useProducts(clientId, { includeInactive: true });
  const [searchTerm, setSearchTerm] = usePersistentState("promos-tab-search-term", "");
  const [statusFilter, setStatusFilter] = usePersistentState<PromoStatus | "all">("promos-tab-status-filter", "all");
  const [typeFilter, setTypeFilter] = usePersistentState<PromoType | "all">("promos-tab-type-filter", "all");
  const [applyFilter, setApplyFilter] = usePersistentState<PromoApplyType | "all">("promos-tab-apply-filter", "all");
  const [sortBy, setSortBy] = usePersistentState<"priority" | "newest" | "ending">("promos-tab-sort-by", "priority");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<PromotionRecord | null>(null);
  const [summary, setSummary] = useState({ total: 0, active: 0, scheduled: 0, redemptions: 0 });

  const debouncedSearch = useDebouncedValue(searchTerm, 300);

  const pagedPromotions = usePagedList<PromotionRecord>({
    resetKey: `${clientId}|${debouncedSearch}|${statusFilter}|${typeFilter}|${applyFilter}|${sortBy}`,
    enabled: Boolean(clientId),
    fetchPage: ({ limit, offset }) =>
      fetchPromotionsPage(clientId, {
        limit,
        offset,
        search: debouncedSearch,
        status: statusFilter,
        promoType: typeFilter,
        applyType: applyFilter,
        sortBy,
      }),
  });

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const next = await fetchPromotionSummary(clientId);
        if (mounted) {
          setSummary(next);
        }
      } catch {
        if (mounted) {
          setSummary({ total: 0, active: 0, scheduled: 0, redemptions: 0 });
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [clientId]);

  const productsById = useMemo(() => new Map(productState.products.map((product) => [product.id, product])), [productState.products]);

  const filteredPromotions = pagedPromotions.items;

  async function handleSubmit(payload: PromotionPayload) {
    if (editingPromotion) {
      await promotionState.editPromotion(editingPromotion.id, payload);
      await pagedPromotions.refresh();
      return;
    }

    await promotionState.addPromotion(payload);
    await pagedPromotions.refresh();
  }

  async function handleToggleStatus(promotion: PromotionRecord) {
    const nextStatus: PromoStatus = promotion.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const confirmed = window.confirm(`${nextStatus === "INACTIVE" ? "Deactivate" : "Reactivate"} ${promotion.name}?`);

    if (!confirmed) {
      return;
    }

    await promotionState.changePromotionStatus(promotion.id, nextStatus);
    await pagedPromotions.refresh();
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <Button
          type="button"
          onClick={() => {
            setEditingPromotion(null);
            setIsModalOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add promotion
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="text-sm text-muted-foreground">Total promos</div>
          <div className="mt-2 text-2xl font-semibold text-text">{summary.total}</div>
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="text-sm text-muted-foreground">Active</div>
          <div className="mt-2 text-2xl font-semibold text-text">{summary.active}</div>
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="text-sm text-muted-foreground">Scheduled</div>
          <div className="mt-2 text-2xl font-semibold text-text">{summary.scheduled}</div>
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="text-sm text-muted-foreground">Redemptions</div>
          <div className="mt-2 text-2xl font-semibold text-text">{summary.redemptions}</div>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-background p-3 xl:grid-cols-4">
        <label className="text-sm text-muted-foreground xl:col-span-2">
          <span className="mb-1 flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search
          </span>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Name, code, type, target"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-base text-text"
          />
        </label>

        <label className="text-sm text-muted-foreground">
          <span className="mb-1 block">Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PromoStatus | "all")} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-base text-text">
            {PROMO_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>{option === "all" ? "All" : titleCase(option)}</option>
            ))}
          </select>
        </label>

        <label className="text-sm text-muted-foreground">
          <span className="mb-1 block">Type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as PromoType | "all")} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-base text-text">
            <option value="all">All</option>
            {PROMO_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{titleCase(option)}</option>
            ))}
          </select>
        </label>

        <label className="text-sm text-muted-foreground">
          <span className="mb-1 block">Apply</span>
          <select value={applyFilter} onChange={(event) => setApplyFilter(event.target.value as PromoApplyType | "all")} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-base text-text">
            <option value="all">All</option>
            {PROMO_APPLY_OPTIONS.map((option) => (
              <option key={option} value={option}>{titleCase(option)}</option>
            ))}
          </select>
        </label>

        <label className="text-sm text-muted-foreground xl:col-span-2">
          <span className="mb-1 block">Sort by</span>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as "priority" | "newest" | "ending")} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-base text-text">
            <option value="priority">Priority</option>
            <option value="newest">Newest</option>
            <option value="ending">Ending soonest</option>
          </select>
        </label>
      </div>

      <DataState
        loading={pagedPromotions.loading && filteredPromotions.length === 0}
        error={pagedPromotions.error ?? promotionState.error}
        empty={!pagedPromotions.loading && !pagedPromotions.error && filteredPromotions.length === 0}
        emptyLabel={searchTerm || statusFilter !== "all" || typeFilter !== "all" || applyFilter !== "all" ? "No promotions match your filters." : "No promotions found."}
      />

      {!pagedPromotions.error && filteredPromotions.length > 0 && (
        <div className="space-y-3">
          {filteredPromotions.map((promotion) => {
            const targetSummary = getTargetSummary(promotion, productsById);
            const usageCount = promotion.usageCount || promotion.current_usage_count || 0;
            const usageLimit = promotion.total_usage_limit;
            const usageLabel = usageLimit == null ? `${usageCount} redemptions` : `${usageCount}/${usageLimit} redemptions`;

            return (
              <article key={promotion.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-text">{promotion.name}</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusClass(promotion.status)}`}>{titleCase(promotion.status)}</span>
                      {promotion.code && (
                        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {promotion.code}
                        </span>
                      )}
                      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {promotion.is_public ? "Public" : "Private"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      <span>{titleCase(promotion.promo_type)}</span>
                      <span>•</span>
                      <span>{titleCase(promotion.apply_type)}</span>
                      <span>•</span>
                      <span>{usageLabel}</span>
                      <span>•</span>
                      <span>{targetSummary}</span>
                    </div>
                    {promotion.description && <p className="max-w-3xl text-sm text-muted-foreground">{promotion.description}</p>}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={() => {
                      setEditingPromotion(promotion);
                      setIsModalOpen(true);
                    }}>
                      Edit
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void handleToggleStatus(promotion)}>
                      {promotion.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                    <div className="text-xs uppercase tracking-wide">Validity</div>
                    <div className="mt-1 text-text">{formatDateRange(promotion.start_date, promotion.end_date)}</div>
                    {promotion.start_time || promotion.end_time ? (
                      <div className="mt-1 text-xs">{promotion.start_time ?? "--:--"} - {promotion.end_time ?? "--:--"}</div>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                    <div className="text-xs uppercase tracking-wide">Discount</div>
                    <div className="mt-1 text-text">
                      {promotion.promo_type === "PERCENTAGE" && promotion.discount_percentage != null && `${promotion.discount_percentage}%`}
                      {(promotion.promo_type === "FLAT" || promotion.promo_type === "CASHBACK") && promotion.discount_flat_amount != null && formatMoney(promotion.discount_flat_amount)}
                      {promotion.promo_type === "BUY_X_GET_Y" && promotion.buy_quantity != null && promotion.get_quantity != null && `Buy ${promotion.buy_quantity} get ${promotion.get_quantity}`}
                      {promotion.promo_type === "FREE_ITEM" && promotion.free_item_quantity != null && `Free item x${promotion.free_item_quantity}`}
                      {(promotion.promo_type === "FREE_DELIVERY" || promotion.promo_type === "LOYALTY" || promotion.promo_type === "HAPPY_HOUR" || promotion.promo_type === "FIRST_ORDER" || promotion.promo_type === "SUBSCRIPTION") && titleCase(promotion.promo_type)}
                    </div>
                    {promotion.max_discount_amount != null && <div className="mt-1 text-xs">Cap: {formatMoney(promotion.max_discount_amount)}</div>}
                  </div>

                  <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                    <div className="text-xs uppercase tracking-wide">Rules</div>
                    <div className="mt-1 text-text">
                      {promotion.first_order_only && <span className="mr-2 inline-block">First order</span>}
                      {promotion.loyalty_members_only && <span className="mr-2 inline-block">Loyalty only</span>}
                      {promotion.subscription_required && <span className="mr-2 inline-block">Subscription required</span>}
                    </div>
                    <div className="mt-1 text-xs">Days: {promotion.valid_days.length > 0 ? promotion.valid_days.map(formatPromoValidDay).join(", ") : "Any"}</div>
                  </div>

                  <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                    <div className="text-xs uppercase tracking-wide">Usage and priority</div>
                    <div className="mt-1 text-text">Priority {promotion.priority ?? 0}</div>
                    <div className="mt-1 text-xs">{formatMoney(promotion.usageDiscountTotal)} redeemed value</div>
                    <div className="mt-1 text-xs">Per customer: {promotion.usage_per_customer ?? 0}</div>
                  </div>
                </div>

                {promotion.banner_image_url && (
                  <div className="mt-3 text-sm text-muted-foreground">
                    Banner: <a href={promotion.banner_image_url} target="_blank" rel="noreferrer" className="text-primary underline">{promotion.banner_image_url}</a>
                  </div>
                )}
              </article>
            );
          })}

          <ListPaginationControls
            loadedCount={pagedPromotions.items.length}
            totalCount={pagedPromotions.totalCount}
            hasMore={pagedPromotions.hasMore}
            loading={pagedPromotions.loadingMore}
            onShowMore={() => void pagedPromotions.showMore()}
            onShowAll={() => void pagedPromotions.showAll()}
            itemLabel="promotions"
          />
        </div>
      )}

      <PromotionModal
        open={isModalOpen}
        mode={editingPromotion ? "edit" : "create"}
        promotion={editingPromotion}
        products={productState.products}
        productTypes={productState.productTypes}
        saving={promotionState.saving}
        onClose={() => {
          setIsModalOpen(false);
          setEditingPromotion(null);
        }}
        onSubmit={handleSubmit}
      />
    </section>
  );
}
