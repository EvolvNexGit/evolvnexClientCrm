"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { useProducts } from "@/hooks/use-products";
import { useCustomers } from "@/hooks/use-customers";
import { usePromotions } from "@/hooks/use-promotions";
import { orderService, type CartItem } from "@/lib/orderService";
import type { CustomerPayload } from "@/lib/billing-types";
import type { PromotionRecord } from "@/lib/promotion-types";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatNumberInput(amount: number) {
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function parseDateOrNull(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getPromoDiscountAmount(
  promo: PromotionRecord,
  subtotal: number,
  cart: CartItem[],
  productsById: Map<string, { id: string; name: string; type: string | null; price: number }>,
) {
  switch (promo.promo_type) {
    case "PERCENTAGE": {
      const percentage = promo.discount_percentage ?? 0;
      const baseAmount = (subtotal * percentage) / 100;
      const cappedAmount = promo.max_discount_amount == null ? baseAmount : Math.min(baseAmount, promo.max_discount_amount);
      return Math.max(0, cappedAmount);
    }
    case "FLAT":
    case "CASHBACK":
      return Math.max(0, promo.discount_flat_amount ?? 0);
    case "FREE_ITEM": {
      const freeProduct = promo.free_product_id ? productsById.get(promo.free_product_id) : null;
      const unitPrice = freeProduct?.price ?? cart[0]?.unitPrice ?? 0;
      const quantity = promo.free_item_quantity ?? 0;
      return Math.max(0, unitPrice * quantity);
    }
    case "BUY_X_GET_Y": {
      const buyProduct = promo.buy_product_id ? productsById.get(promo.buy_product_id) : null;
      const targetProduct = promo.get_product_id ? productsById.get(promo.get_product_id) : buyProduct;
      const unitPrice = targetProduct?.price ?? cart[0]?.unitPrice ?? 0;
      const quantity = promo.get_quantity ?? 0;
      return Math.max(0, unitPrice * quantity);
    }
    case "FREE_DELIVERY":
      return 0;
    case "HAPPY_HOUR":
    case "FIRST_ORDER":
    case "LOYALTY":
    case "SUBSCRIPTION":
      if (promo.discount_percentage != null) {
        return Math.max(0, (subtotal * promo.discount_percentage) / 100);
      }
      if (promo.discount_flat_amount != null) {
        return Math.max(0, promo.discount_flat_amount);
      }
      return 0;
    default:
      return 0;
  }
}

function getPromoEligibilityReason(
  promo: PromotionRecord,
  subtotal: number,
  cart: CartItem[],
  productsById: Map<string, { id: string; name: string; type: string | null; price: number }>,
) {
  if (promo.status !== "ACTIVE") {
    return "Inactive";
  }

  const startDate = parseDateOrNull(promo.start_date);
  const endDate = parseDateOrNull(promo.end_date);
  const now = new Date();

  if (startDate && startDate > now) {
    return "Starts later";
  }

  if (endDate && endDate < now) {
    return "Expired";
  }

  if (promo.total_usage_limit != null && promo.current_usage_count != null && promo.current_usage_count >= promo.total_usage_limit) {
    return "Usage limit reached";
  }

  if (promo.min_order_amount != null && subtotal < promo.min_order_amount) {
    return `Min order ${formatCurrency(promo.min_order_amount)}`;
  }

  const cartProductIds = new Set(cart.map((item) => item.productId));
  const cartProductTypes = new Set(cart.map((item) => item.type).filter((value): value is string => Boolean(value)));

  if (promo.targetProductIds.length > 0 && !promo.targetProductIds.some((id) => cartProductIds.has(id))) {
    return "Not in cart";
  }

  if (promo.targetProductTypes.length > 0 && !promo.targetProductTypes.some((type) => cartProductTypes.has(type))) {
    return "Wrong product type";
  }

  const discountAmount = getPromoDiscountAmount(promo, subtotal, cart, productsById);
  if (discountAmount <= 0) {
    return "No discount value";
  }

  return null;
}

const BILLING_SESSION_KEY = (clientId: string) => `billing-session-${clientId}`;
const DEFAULT_WALK_IN_NAME = "Walkin";

function resolveWalkInName(name: string) {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_WALK_IN_NAME;
}

type BillingSessionState = {
  cart: CartItem[];
  billingMode: "customer" | "walk-in";
  customerId: string;
  customerSearchTerm: string;
  walkInName: string;
  walkInPhone: string;
  discountInput: string;
  selectedPromoId: string;
  discountMode: "manual" | "promos";
  productSearchTerm: string;
  selectedProductId: string;
  quantityInput: string;
  productTypeFilter: string;
  tableNumber: string;
};

function saveBillingSession(clientId: string, state: BillingSessionState) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(BILLING_SESSION_KEY(clientId), JSON.stringify(state));
    } catch {
      // Silently fail if localStorage is unavailable
    }
  }
}

function loadBillingSession(clientId: string): BillingSessionState | null {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(BILLING_SESSION_KEY(clientId));
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Silently fail if parsing fails
    }
  }
  return null;
}

function clearBillingSession(clientId: string) {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(BILLING_SESSION_KEY(clientId));
    } catch {
      // Silently fail
    }
  }
}

export default function BillingTab({ clientId }: { clientId: string }) {
  const productState = useProducts(clientId);
  const customerState = useCustomers(clientId);
  const promotionState = usePromotions(clientId);

  // Load initial state from session
  const storedSession = loadBillingSession(clientId);

  const [productSearchTerm, setProductSearchTerm] = useState(storedSession?.productSearchTerm ?? "");
  const [isProductListOpen, setIsProductListOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(storedSession?.selectedProductId ?? "");
  const [quantityInput, setQuantityInput] = useState(storedSession?.quantityInput ?? "1");
  const [productTypeFilter, setProductTypeFilter] = useState(storedSession?.productTypeFilter ?? "");
  const [discountInput, setDiscountInput] = useState(storedSession?.discountInput ?? "0");
  const [tableNumber, setTableNumber] = useState(storedSession?.tableNumber ?? "");
  const [billingMode, setBillingMode] = useState<"customer" | "walk-in">(storedSession?.billingMode ?? "walk-in");
  const [customerId, setCustomerId] = useState(storedSession?.customerId ?? "");
  const [customerSearchTerm, setCustomerSearchTerm] = useState(storedSession?.customerSearchTerm ?? "");
  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);
  const [customerActiveIndex, setCustomerActiveIndex] = useState(0);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerPayload>({
    name: "",
    phone: "",
    email: "",
    dob: "",
  });
  const [walkInName, setWalkInName] = useState(storedSession?.walkInName ?? "");
  const [walkInPhone, setWalkInPhone] = useState(storedSession?.walkInPhone ?? "");
  const [cart, setCart] = useState<CartItem[]>(storedSession?.cart ?? []);
  const [cartActionError, setCartActionError] = useState<string | null>(null);
  const [inventoryWarnings, setInventoryWarnings] = useState<string[]>([]);
  const [isLowStock, setIsLowStock] = useState(false);
  const [isOutOfStock, setIsOutOfStock] = useState(false);
  const [isCreatingBill, setIsCreatingBill] = useState(false);
  const [createBillMessage, setCreateBillMessage] = useState<string | null>(null);
  const [selectedPromoId, setSelectedPromoId] = useState(storedSession?.selectedPromoId ?? "");
  const [discountMode, setDiscountMode] = useState<"manual" | "promos">(storedSession?.discountMode ?? "manual");

  const loading = productState.loading || customerState.loading || promotionState.loading;
  const loadError = productState.error || customerState.error || promotionState.error;

  const productsById = useMemo(
    () => new Map(productState.products.map((product) => [product.id, product] as const)),
    [productState.products],
  );

  const filteredProducts = useMemo(() => {
    const query = productSearchTerm.trim().toLowerCase();
    let results = productState.products;

    // Filter by type if selected
    if (productTypeFilter) {
      results = results.filter((product) => product.type === productTypeFilter);
    }

    if (query) {
      results = results.filter((product) => {
        const haystack = [product.name, product.type ?? ""].join(" ").toLowerCase();
        return haystack.includes(query);
      });
    }

    // Sort alphabetically by name
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }, [productState.products, productSearchTerm, productTypeFilter]);

  const filteredCustomers = useMemo(() => {
    const query = customerSearchTerm.trim().toLowerCase();

    if (!query) {
      return customerState.customers;
    }

    return customerState.customers.filter((customer) => {
      const haystack = [customer.name, customer.phone ?? "", customer.email ?? ""].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [customerSearchTerm, customerState.customers]);

  const selectedCustomer = useMemo(
    () => customerState.customers.find((customer) => customer.id === customerId) ?? null,
    [customerId, customerState.customers],
  );

  const subtotal = useMemo(() => orderService.calculateTotals(cart, 0).subtotal, [cart]);

  const eligiblePromotions = useMemo(() => {
    return promotionState.promotions
      .filter((promotion) => getPromoEligibilityReason(promotion, subtotal, cart, productsById) == null)
      .sort((left, right) => {
        const leftPriority = left.priority ?? 0;
        const rightPriority = right.priority ?? 0;
        if (leftPriority !== rightPriority) {
          return rightPriority - leftPriority;
        }

        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      });
  }, [cart, productsById, promotionState.promotions, subtotal]);

  const selectedPromotion = useMemo(
    () => promotionState.promotions.find((promotion) => promotion.id === selectedPromoId) ?? null,
    [promotionState.promotions, selectedPromoId],
  );

  const selectedPromoDiscount = useMemo(() => {
    if (!selectedPromotion) {
      return 0;
    }

    return getPromoDiscountAmount(selectedPromotion, subtotal, cart, productsById);
  }, [cart, productsById, selectedPromotion, subtotal]);

  const discountValue = Number(discountInput || 0);
  const totals = useMemo(() => orderService.calculateTotals(cart, discountValue), [cart, discountValue]);

  const customerInputRef = useRef<HTMLInputElement | null>(null);
  const customerListboxId = "billing-customer-listbox";
  const customerTypeaheadBufferRef = useRef("");
  const customerTypeaheadTimerRef = useRef<number | null>(null);

  function handleBillingModeChange(nextMode: "customer" | "walk-in") {
    setBillingMode(nextMode);
    setCartActionError(null);
    setCreateBillMessage(null);

    if (nextMode === "customer") {
      setWalkInName("");
      setWalkInPhone("");
      return;
    }

    setCustomerId("");
    setCustomerSearchTerm("");
  }

  function clearSelectedPromo() {
    setSelectedPromoId("");
  }

  function applyPromo(promotion: PromotionRecord) {
    const discountAmount = getPromoDiscountAmount(promotion, subtotal, cart, productsById);
    setSelectedPromoId(promotion.id);
    setDiscountInput(formatNumberInput(discountAmount));
    setDiscountMode("manual");
    setCartActionError(null);
    setCreateBillMessage(null);
  }

  function openCustomerCombobox() {
    if (billingMode !== "customer") {
      handleBillingModeChange("customer");
    }

    setIsCustomerListOpen(true);
  }

  function selectCustomer(customer: (typeof customerState.customers)[number]) {
    setBillingMode("customer");
    setCustomerId(customer.id);
    setCustomerSearchTerm(customer.name);
    setCustomerActiveIndex(0);
    setIsCustomerListOpen(false);
    setCartActionError(null);
    setCreateBillMessage(null);
  }

  function openCustomerModal() {
    setCartActionError(null);
    setCreateBillMessage(null);
    resetCustomerForm();
    setIsCustomerModalOpen(true);
  }

  function openPrefilledCustomerModal(prefillName = "") {
    openCustomerModal();
    setCustomerForm((current) => ({ ...current, name: prefillName }));
  }

  function handleCustomerInputChange(value: string) {
    if (billingMode !== "customer") {
      handleBillingModeChange("customer");
    }

    setCustomerSearchTerm(value);
    setCustomerId("");
    setCustomerActiveIndex(0);
    setIsCustomerListOpen(true);
  }

  function focusCustomerByPrefix(prefix: string) {
    const normalizedPrefix = prefix.trim().toLowerCase();

    if (!normalizedPrefix) {
      return;
    }

    const matchIndex = filteredCustomers.findIndex((customer) => customer.name.toLowerCase().startsWith(normalizedPrefix));
    if (matchIndex === -1) {
      return;
    }

    setCustomerActiveIndex(matchIndex);
    setIsCustomerListOpen(true);
  }

  function handleCustomerKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (billingMode !== "customer") {
      handleBillingModeChange("customer");
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsCustomerListOpen(true);
      setCustomerActiveIndex((current) => Math.min(current + 1, Math.max(filteredCustomers.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsCustomerListOpen(true);
      setCustomerActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      if (isCustomerListOpen && filteredCustomers[customerActiveIndex]) {
        event.preventDefault();
        selectCustomer(filteredCustomers[customerActiveIndex]);
        return;
      }

      if (isCustomerListOpen && canCreateCustomerFromDropdown) {
        event.preventDefault();
        openPrefilledCustomerModal(customerCreateSuggestion);
        setIsCustomerListOpen(false);
      }
      return;
    }

    if (event.key === "Escape") {
      setIsCustomerListOpen(false);
      customerTypeaheadBufferRef.current = "";
      if (customerTypeaheadTimerRef.current) {
        window.clearTimeout(customerTypeaheadTimerRef.current);
        customerTypeaheadTimerRef.current = null;
      }
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const nextPrefix = `${customerTypeaheadBufferRef.current}${event.key}`.toLowerCase();
      customerTypeaheadBufferRef.current = nextPrefix;

      if (customerTypeaheadTimerRef.current) {
        window.clearTimeout(customerTypeaheadTimerRef.current);
      }

      customerTypeaheadTimerRef.current = window.setTimeout(() => {
        customerTypeaheadBufferRef.current = "";
        customerTypeaheadTimerRef.current = null;
      }, 650);

      focusCustomerByPrefix(nextPrefix);
    }
  }

  useEffect(() => {
    setCustomerActiveIndex((current) => {
      if (filteredCustomers.length === 0) {
        return 0;
      }

      return Math.min(current, filteredCustomers.length - 1);
    });
  }, [filteredCustomers.length]);

  useEffect(() => {
    return () => {
      if (customerTypeaheadTimerRef.current) {
        window.clearTimeout(customerTypeaheadTimerRef.current);
      }
    };
  }, []);

  function resetCustomerForm() {
    setCustomerForm({
      name: "",
      phone: "",
      email: "",
      dob: "",
    });
  }

  async function submitCustomerForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCartActionError(null);

    try {
      const createdCustomer = await customerState.addCustomer({
        name: customerForm.name.trim(),
        phone: customerForm.phone?.trim() || null,
        email: customerForm.email?.trim() || null,
        dob: customerForm.dob || null,
      });

      setBillingMode("customer");
      setCustomerId(createdCustomer.id);
      setCustomerSearchTerm(createdCustomer.name);
      setIsCustomerModalOpen(false);
      resetCustomerForm();
    } catch (error) {
      setCartActionError(error instanceof Error ? error.message : "Unable to add customer.");
    }
  }

  const customerCreateSuggestion = customerSearchTerm.trim();
  const canCreateCustomerFromDropdown = billingMode === "customer" && customerCreateSuggestion.length > 0 && filteredCustomers.length === 0;

  useEffect(() => {
    let active = true;

    async function runValidation() {
      try {
        const result = await orderService.validateInventory(cart);

        if (!active) {
          return;
        }

        setIsLowStock(result.isLowStock);
        setIsOutOfStock(result.isOutOfStock);
        setInventoryWarnings(result.warnings);
      } catch (error) {
        if (!active) {
          return;
        }

        setInventoryWarnings([
          error instanceof Error ? error.message : "Unable to validate inventory for current cart.",
        ]);
        setIsLowStock(false);
        setIsOutOfStock(false);
      }
    }

    void runValidation();

    return () => {
      active = false;
    };
  }, [cart]);

  // Save billing session to localStorage whenever state changes
  useEffect(() => {
    const sessionState: BillingSessionState = {
      cart,
      billingMode,
      customerId,
      customerSearchTerm,
      walkInName,
      walkInPhone,
      discountInput,
      selectedPromoId,
      discountMode,
      productSearchTerm,
      selectedProductId,
      quantityInput,
      productTypeFilter,
      tableNumber,
    };
    saveBillingSession(clientId, sessionState);
  }, [
    cart,
    billingMode,
    customerId,
    customerSearchTerm,
    walkInName,
    walkInPhone,
    discountInput,
    selectedPromoId,
    discountMode,
    productSearchTerm,
    selectedProductId,
    quantityInput,
    productTypeFilter,
    tableNumber,
    clientId,
  ]);

  useEffect(() => {
    if (!selectedPromotion) {
      return;
    }

    setDiscountInput(formatNumberInput(selectedPromoDiscount));
  }, [selectedPromoDiscount, selectedPromotion]);

  function handleAddToCart() {
    setCartActionError(null);
    setCreateBillMessage(null);

    const selectedProduct = productState.products.find((product) => product.id === selectedProductId);
    if (!selectedProduct) {
      setCartActionError("Select a product to add.");
      return;
    }

    const quantity = Math.max(1, Number(quantityInput || 1));

    let nextCart = orderService.addItem(cart, selectedProduct);
    if (quantity > 1) {
      nextCart = orderService.updateQuantity(nextCart, selectedProduct.id, quantity);
    }

    setCart(nextCart);
    setProductSearchTerm("");
    setSelectedProductId("");
    setQuantityInput("1");
    setIsProductListOpen(false);

    if (selectedPromoId) {
      const nextPromotion = promotionState.promotions.find((promotion) => promotion.id === selectedPromoId) ?? null;
      if (nextPromotion) {
        const nextSubtotal = orderService.calculateTotals(nextCart, 0).subtotal;
        setDiscountInput(formatNumberInput(getPromoDiscountAmount(nextPromotion, nextSubtotal, nextCart, productsById)));
      }
    }
  }

  function increaseQuantity(productId: string) {
    const row = cart.find((item) => item.productId === productId);
    if (!row) {
      return;
    }

    setCart(orderService.updateQuantity(cart, productId, row.quantity + 1));
  }

  function decreaseQuantity(productId: string) {
    const row = cart.find((item) => item.productId === productId);
    if (!row) {
      return;
    }

    setCart(orderService.updateQuantity(cart, productId, row.quantity - 1));
  }

  function removeItem(productId: string) {
    setCart(orderService.removeItem(cart, productId));
  }

  function handleManualDiscountChange(value: string) {
    clearSelectedPromo();
    setDiscountInput(value);
  }

  function getPromoBadge(promo: PromotionRecord) {
    if (promo.promo_type === "PERCENTAGE" && promo.discount_percentage != null) {
      return `${promo.discount_percentage}% off`;
    }

    if ((promo.promo_type === "FLAT" || promo.promo_type === "CASHBACK") && promo.discount_flat_amount != null) {
      return formatCurrency(promo.discount_flat_amount);
    }

    if (promo.promo_type === "FREE_ITEM" && promo.free_item_quantity != null) {
      return `${promo.free_item_quantity} free item${promo.free_item_quantity > 1 ? "s" : ""}`;
    }

    return titleCase(promo.promo_type);
  }

  async function handleCreateBill() {
    setCartActionError(null);
    setCreateBillMessage(null);

    try {
      setIsCreatingBill(true);
      const result = await orderService.createOrder(
        cart,
        Number(discountInput || 0),
        billingMode === "customer" ? customerId || null : null,
        {
          name: billingMode === "walk-in" ? resolveWalkInName(walkInName) : null,
          phone: billingMode === "walk-in" ? walkInPhone.trim() || null : null,
        },
        tableNumber || null,
      );

      setCreateBillMessage(`Bill ${result.billId} created successfully.`);
      setCart([]);
      setDiscountInput("0");
      setSelectedPromoId("");
      setDiscountMode("manual");
      setTableNumber("");
      setBillingMode("walk-in");
      setCustomerId("");
      setCustomerSearchTerm("");
      setWalkInName("");
      setWalkInPhone("");
      clearBillingSession(clientId);
    } catch (error) {
      setCartActionError(error instanceof Error ? error.message : "Unable to create bill.");
    } finally {
      setIsCreatingBill(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-xl font-semibold text-text">Billing</h2>
        <p className="mt-1 text-base text-muted-foreground">POS-style billing with live totals and inventory warnings.</p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-sm text-primary">{loadError}</div>
      )}

      {cartActionError && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-sm text-primary">{cartActionError}</div>
      )}

      {createBillMessage && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">{createBillMessage}</div>
      )}

      <div className="grid gap-3 rounded-xl border border-border bg-background p-3 lg:grid-cols-[1fr_2fr_120px_auto]">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Type</label>
          <select
            value={productTypeFilter}
            onChange={(event) => {
              setProductTypeFilter(event.target.value);
              setProductSearchTerm("");
              setSelectedProductId("");
              setIsProductListOpen(false);
            }}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-base text-text"
          >
            <option value="">All Types</option>
            {Array.from(new Set(productState.products.map((p) => p.type).filter((type): type is string => type !== null))).sort().map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 relative">
          <label className="text-sm text-muted-foreground">Product</label>
          <input
            value={productSearchTerm}
            onChange={(event) => {
              setProductSearchTerm(event.target.value);
              setIsProductListOpen(true);
            }}
            onFocus={() => setIsProductListOpen(true)}
            onBlur={() => setTimeout(() => setIsProductListOpen(false), 200)}
            placeholder="Search product by name..."
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-base text-text"
          />
          {isProductListOpen && filteredProducts.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-10 max-h-60 overflow-y-auto">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSelectedProductId(product.id);
                    setProductSearchTerm(`${product.name}${product.type ? ` (${product.type})` : ""}`);
                    setIsProductListOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-muted text-base text-text border-b border-border last:border-b-0"
                >
                  {product.name} {product.type ? `(${product.type})` : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Quantity</label>
          <input
            value={quantityInput}
            onChange={(event) => setQuantityInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddToCart();
              }
            }}
            min="1"
            type="number"
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-base text-text"
          />
        </div>

        <div className="flex items-end">
          <Button type="button" onClick={handleAddToCart} className="w-full" disabled={loading}>
            Add
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-base">
            <thead className="bg-muted text-left text-sm uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Quantity</th>
                <th className="px-3 py-3">Price</th>
                <th className="px-3 py-3">Total</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cart.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-base text-muted-foreground">
                    Cart is empty.
                  </td>
                </tr>
              )}
              {cart.map((item) => (
                <tr key={item.productId} className="hover:bg-muted/40">
                  <td className="px-3 py-3 text-text">{item.name}</td>
                  <td className="px-3 py-3">
                    <input
                      value={item.quantity}
                      onChange={(event) =>
                        setCart(orderService.updateQuantity(cart, item.productId, Number(event.target.value || 0)))
                      }
                      min="0"
                      type="number"
                      className="w-20 rounded-md border border-border bg-background px-2 py-1 text-base text-text"
                    />
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{formatCurrency(item.unitPrice * item.quantity)}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => increaseQuantity(item.productId)}
                        className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:text-text"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => decreaseQuantity(item.productId)}
                        className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:text-text"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        className="rounded-md border border-primary/50 px-2 py-1 text-sm text-primary"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-background p-4">
          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Bill for</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleBillingModeChange("customer")}
                className={
                  billingMode === "customer"
                    ? "rounded-xl border border-primary bg-primary/10 px-3 py-2 text-base font-medium text-primary"
                    : "rounded-xl border border-border bg-background px-3 py-2 text-base text-text hover:bg-muted"
                }
              >
                Customer
              </button>
              <button
                type="button"
                onClick={() => handleBillingModeChange("walk-in")}
                className={
                  billingMode === "walk-in"
                    ? "rounded-xl border border-primary bg-primary/10 px-3 py-2 text-base font-medium text-primary"
                    : "rounded-xl border border-border bg-background px-3 py-2 text-base text-text hover:bg-muted"
                }
              >
                Walk-in
              </button>
            </div>

            {billingMode === "customer" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block flex-1 text-sm text-muted-foreground">
                    Customer
                    <div className="relative mt-1">
                      <input
                        ref={customerInputRef}
                        value={customerSearchTerm}
                        onChange={(event) => handleCustomerInputChange(event.target.value)}
                        onFocus={openCustomerCombobox}
                        onKeyDown={handleCustomerKeyDown}
                        onBlur={() => {
                          window.setTimeout(() => setIsCustomerListOpen(false), 120);
                        }}
                        placeholder="Search by name, phone, or email"
                        role="combobox"
                        aria-expanded={isCustomerListOpen}
                        aria-controls={customerListboxId}
                        aria-autocomplete="list"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-20 text-base text-text"
                      />
                      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                        {selectedCustomer ? "Selected" : "Search"}
                      </div>
                    </div>
                  </label>
                  <Button type="button" variant="secondary" onClick={openCustomerModal}>
                    Add Customer
                  </Button>
                </div>

                {isCustomerListOpen && (
                  <div className="max-h-56 overflow-auto rounded-xl border border-border bg-card shadow-soft">
                    <ul id={customerListboxId} role="listbox" className="py-1">
                      {filteredCustomers.length === 0 ? (
                        <li className="px-2 py-2">
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              openPrefilledCustomerModal(customerCreateSuggestion);
                              setIsCustomerListOpen(false);
                            }}
                            className="flex w-full flex-col items-start rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-left hover:bg-primary/10"
                          >
                            <span className="text-base font-medium text-primary">Create new customer</span>
                            <span className="text-sm text-muted-foreground">
                              {customerCreateSuggestion ? `Add "${customerCreateSuggestion}" as a new customer.` : "Add a new customer from this search."}
                            </span>
                          </button>
                        </li>
                      ) : (
                        filteredCustomers.map((customer, index) => {
                          const isActive = index === customerActiveIndex;
                          const isSelected = customer.id === customerId;

                          return (
                            <li
                              key={customer.id}
                              role="option"
                              aria-selected={isSelected}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                selectCustomer(customer);
                              }}
                              onMouseEnter={() => setCustomerActiveIndex(index)}
                              className={
                                isActive
                                  ? "cursor-pointer px-3 py-2 text-base bg-primary/10 text-primary"
                                  : "cursor-pointer px-3 py-2 text-base text-text hover:bg-muted"
                              }
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-medium">{customer.name}</span>
                                {isSelected && <span className="text-sm text-muted-foreground">Selected</span>}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {[customer.phone, customer.email].filter(Boolean).join(" • ") || "No contact details"}
                              </div>
                            </li>
                          );
                        })
                      )}
                      {canCreateCustomerFromDropdown && (
                        <li className="px-2 py-2">
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              openPrefilledCustomerModal(customerCreateSuggestion);
                              setIsCustomerListOpen(false);
                            }}
                            className="flex w-full flex-col items-start rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-left hover:bg-primary/10"
                          >
                            <span className="text-base font-medium text-primary">Create new customer</span>
                            <span className="text-sm text-muted-foreground">Add "{customerCreateSuggestion}" as a new customer.</span>
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {selectedCustomer && customerId && (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                    <span>
                      Selected customer: <span className="font-medium text-text">{selectedCustomer.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerId("");
                        setCustomerSearchTerm("");
                        setIsCustomerListOpen(true);
                        customerInputRef.current?.focus();
                      }}
                      className="font-medium text-primary hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Optional — leave name blank to use <span className="font-medium text-text">{DEFAULT_WALK_IN_NAME}</span>.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-sm text-muted-foreground">
                    Walk-in name
                    <input
                      value={walkInName}
                      onChange={(event) => setWalkInName(event.target.value)}
                      placeholder={DEFAULT_WALK_IN_NAME}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text placeholder:text-muted-foreground"
                    />
                  </label>
                  <label className="block text-sm text-muted-foreground">
                    Walk-in phone
                    <input
                      value={walkInPhone}
                      onChange={(event) => setWalkInPhone(event.target.value)}
                      placeholder="Optional"
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text placeholder:text-muted-foreground"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-card p-3 text-base">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDiscountMode("manual")}
                className={
                  discountMode === "manual"
                    ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                    : "rounded-full border border-border bg-background px-3 py-1 text-sm text-text"
                }
              >
                Manual discount
              </button>
              <button
                type="button"
                onClick={() => setDiscountMode("promos")}
                className={
                  discountMode === "promos"
                    ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                    : "rounded-full border border-border bg-background px-3 py-1 text-sm text-text"
                }
              >
                Eligible promos
              </button>
            </div>

            {discountMode === "promos" ? (
              <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                {eligiblePromotions.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No eligible promos for the current cart.</div>
                ) : (
                  eligiblePromotions.map((promotion) => {
                    const discountAmount = getPromoDiscountAmount(promotion, subtotal, cart, productsById);
                    const isSelected = promotion.id === selectedPromoId;

                    return (
                      <button
                        key={promotion.id}
                        type="button"
                        onClick={() => applyPromo(promotion)}
                        className={
                          isSelected
                            ? "flex w-full flex-col items-start gap-1 rounded-xl border border-primary bg-primary/10 px-3 py-3 text-left"
                            : "flex w-full flex-col items-start gap-1 rounded-xl border border-border bg-card px-3 py-3 text-left hover:bg-muted/50"
                        }
                      >
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="font-medium text-text">{promotion.name}</span>
                          <span className="rounded-full border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                            {getPromoBadge(promotion)}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {promotion.code ? `${promotion.code} • ` : ""}
                          {formatCurrency(discountAmount)} discount
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <label className="flex items-center justify-between text-muted-foreground">
                <span>Discount</span>
                <input
                  value={discountInput}
                  onChange={(event) => handleManualDiscountChange(event.target.value)}
                  min="0"
                  step="0.01"
                  type="number"
                  className="w-28 rounded-md border border-border bg-background px-2 py-1 text-right text-base text-text"
                />
              </label>
            )}

            {selectedPromotion && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm text-primary">
                Applied promo: <span className="font-medium">{selectedPromotion.name}</span> ({formatCurrency(selectedPromoDiscount)})
              </div>
            )}

            {selectedPromotion && (
              <button
                type="button"
                onClick={() => {
                  clearSelectedPromo();
                  setDiscountInput("0");
                }}
                className="text-left text-sm text-muted-foreground hover:text-text"
              >
                Clear applied promo
              </button>
            )}

            {discountMode === "manual" && (
              <div className="text-xs text-muted-foreground">Use a promo from the promos tab or enter a manual discount.</div>
            )}

            <label className="flex items-center justify-between text-muted-foreground">
              <span>Table Number</span>
              <input
                value={tableNumber}
                onChange={(event) => setTableNumber(event.target.value)}
                type="text"
                placeholder="Optional"
                className="w-28 rounded-md border border-border bg-background px-2 py-1 text-right text-base text-text"
              />
            </label>
            <div className="flex items-center justify-between border-t border-border pt-2 text-text">
              <span>Final total</span>
              <span className="text-lg font-semibold">{formatCurrency(totals.finalTotal)}</span>
            </div>
          </div>

          {inventoryWarnings.length > 0 && (
            <div className="space-y-2">
              {inventoryWarnings.map((warning, index) => (
                <div
                  key={`${warning}-${index}`}
                  className={
                    isOutOfStock
                      ? "rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-400"
                      : isLowStock
                        ? "rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-300"
                        : "rounded-lg border border-border bg-card p-2 text-sm text-muted-foreground"
                  }
                >
                  {warning}
                </div>
              ))}
            </div>
          )}

          <Button type="button" onClick={() => void handleCreateBill()} className="w-full">
            {isCreatingBill ? "Creating Bill..." : "Create Bill"}
          </Button>
        </div>
      </div>

      <EntityModal open={isCustomerModalOpen} title="Add Customer" onClose={() => setIsCustomerModalOpen(false)}>
        <form className="space-y-3" onSubmit={(event) => void submitCustomerForm(event)}>
          <label className="block text-base text-muted-foreground">
            <span className="mb-1 block">Name</span>
            <input
              required
              value={customerForm.name}
              onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            />
          </label>

          <label className="block text-base text-muted-foreground">
            <span className="mb-1 block">Phone</span>
            <input
              value={customerForm.phone ?? ""}
              onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            />
          </label>

          <label className="block text-base text-muted-foreground">
            <span className="mb-1 block">Email</span>
            <input
              type="email"
              value={customerForm.email ?? ""}
              onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            />
          </label>

          <label className="block text-base text-muted-foreground">
            <span className="mb-1 block">Date of birth</span>
            <input
              type="date"
              value={customerForm.dob ?? ""}
              onChange={(event) => setCustomerForm((current) => ({ ...current, dob: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            />
          </label>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setIsCustomerModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Customer</Button>
          </div>
        </form>
      </EntityModal>
    </section>
  );
}
