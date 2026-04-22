import { getSupabaseClient } from "@/lib/supabase";
import type { ProductRecord } from "@/lib/billing-types";
import type { InventoryUnit } from "@/lib/inventory-types";

export type CartItem = {
  productId: string;
  clientId: string;
  name: string;
  type: string | null;
  unitPrice: number;
  quantity: number;
};

export type WalkInDetails = {
  name?: string | null;
  phone?: string | null;
};

type InventoryValidation = {
  isLowStock: boolean;
  isOutOfStock: boolean;
  warnings: string[];
};

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

function normalizeQuantity(quantity: number) {
  if (!Number.isFinite(quantity)) {
    return 1;
  }

  return Math.max(0, Math.floor(quantity));
}

function extractOrderResult(data: unknown) {
  const payload = Array.isArray(data) ? data[0] : data;

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const rawBillId = record.bill_id ?? record.billId ?? record.id;
  const rawTotal = record.total ?? record.final_total ?? record.finalTotal;

  if (rawBillId == null) {
    return null;
  }

  return {
    billId: String(rawBillId),
    total: asNumber(rawTotal),
  };
}

export const orderService = {
  addItem(cart: CartItem[], product: ProductRecord): CartItem[] {
    const existingIndex = cart.findIndex((item) => item.productId === product.id);

    if (existingIndex >= 0) {
      return cart.map((item, index) =>
        index === existingIndex
          ? {
              ...item,
              quantity: item.quantity + 1,
            }
          : item,
      );
    }

    return [
      ...cart,
      {
        productId: product.id,
        clientId: product.client_id,
        name: product.name,
        type: product.type,
        unitPrice: product.price,
        quantity: 1,
      },
    ];
  },

  updateQuantity(cart: CartItem[], productId: string, quantity: number): CartItem[] {
    const normalized = normalizeQuantity(quantity);

    if (normalized <= 0) {
      return cart.filter((item) => item.productId !== productId);
    }

    return cart.map((item) =>
      item.productId === productId
        ? {
            ...item,
            quantity: normalized,
          }
        : item,
    );
  },

  removeItem(cart: CartItem[], productId: string): CartItem[] {
    return cart.filter((item) => item.productId !== productId);
  },

  calculateTotals(cart: CartItem[], discount: number) {
    const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const safeDiscount = Math.max(0, asNumber(discount));
    const finalTotal = Math.max(0, subtotal - safeDiscount);

    return {
      subtotal,
      finalTotal,
    };
  },

  async validateInventory(cart: CartItem[]): Promise<InventoryValidation> {
    if (cart.length === 0) {
      return {
        isLowStock: false,
        isOutOfStock: false,
        warnings: [],
      };
    }

    const clientId = cart[0]?.clientId;
    if (!clientId) {
      return {
        isLowStock: false,
        isOutOfStock: false,
        warnings: [],
      };
    }

    const supabase = getClient();
    const productIds = Array.from(new Set(cart.map((item) => item.productId)));

    const { data: recipes, error: recipesError } = await supabase
      .from("recipes")
      .select("product_id, ingredient_id, quantity, quantity_unit")
      .eq("client_id", clientId)
      .in("product_id", productIds);

    if (recipesError) {
      throw recipesError;
    }

    const recipeRows = recipes ?? [];
    const ingredientIds = Array.from(new Set(recipeRows.map((row: any) => String(row.ingredient_id))));

    if (ingredientIds.length === 0) {
      return {
        isLowStock: false,
        isOutOfStock: false,
        warnings: [],
      };
    }

    const { data: ingredients, error: ingredientsError } = await supabase
      .from("ingredients")
      .select("id, name, quantity, threshold, quantity_unit")
      .eq("client_id", clientId)
      .in("id", ingredientIds);

    if (ingredientsError) {
      throw ingredientsError;
    }

    const ingredientMap = new Map<string, { name: string; quantity: number; threshold: number; unit: InventoryUnit }>();

    (ingredients ?? []).forEach((ingredient: any) => {
      ingredientMap.set(String(ingredient.id), {
        name: String(ingredient.name ?? "Unknown ingredient"),
        quantity: asNumber(ingredient.quantity),
        threshold: asNumber(ingredient.threshold),
        unit: ingredient.quantity_unit as InventoryUnit,
      });
    });

    const requiredByIngredient = new Map<string, { required: number; unit: InventoryUnit }>();

    cart.forEach((cartItem) => {
      recipeRows
        .filter((row: any) => String(row.product_id) === cartItem.productId)
        .forEach((row: any) => {
          const ingredientId = String(row.ingredient_id);
          const recipeQty = asNumber(row.quantity);
          const recipeUnit = row.quantity_unit as InventoryUnit;

          const previous = requiredByIngredient.get(ingredientId);
          if (!previous) {
            requiredByIngredient.set(ingredientId, {
              required: recipeQty * cartItem.quantity,
              unit: recipeUnit,
            });
            return;
          }

          requiredByIngredient.set(ingredientId, {
            required: previous.required + recipeQty * cartItem.quantity,
            unit: previous.unit,
          });
        });
    });

    const warnings: string[] = [];
    let isLowStock = false;
    let isOutOfStock = false;

    requiredByIngredient.forEach((requiredInfo, ingredientId) => {
      const stock = ingredientMap.get(ingredientId);

      if (!stock) {
        warnings.push("Ingredient stock data missing for one recipe item.");
        isOutOfStock = true;
        return;
      }

      if (stock.unit !== requiredInfo.unit) {
        warnings.push(
          `Unit mismatch for ${stock.name} (${stock.unit} stock vs ${requiredInfo.unit} recipe). Validation may be inaccurate.`,
        );
      }

      const remaining = stock.quantity - requiredInfo.required;

      if (remaining < 0) {
        isOutOfStock = true;
        warnings.push(`Insufficient stock: ${stock.name} short by ${Math.abs(remaining).toFixed(2)} ${stock.unit}.`);
        return;
      }

      if (remaining < stock.threshold) {
        isLowStock = true;
        warnings.push(`Low stock warning: ${stock.name} will drop to ${remaining.toFixed(2)} ${stock.unit}.`);
      }
    });

    return {
      isLowStock,
      isOutOfStock,
      warnings,
    };
  },

  async createOrder(
    cart: CartItem[],
    discount: number,
    customerId: string | null,
    walkInDetails: WalkInDetails,
  ) {
    if (cart.length === 0) {
      throw new Error("Cart is empty.");
    }

    const clientId = cart[0]?.clientId;
    if (!clientId) {
      throw new Error("Missing client context for order creation.");
    }

    const supabase = getClient();
    const totals = this.calculateTotals(cart, discount);

    // Keep the warning path warm without blocking checkout when stock is low or negative.
    try {
      await this.validateInventory(cart);
    } catch {
      // Ignore validation errors here and let billing continue.
    }

    const { data, error } = await supabase.rpc("create_order_with_inventory", {
      p_client_id: clientId,
      p_customer_id: customerId,
      p_walk_in_name: walkInDetails.name ?? null,
      p_walk_in_phone: walkInDetails.phone ?? null,
      p_discount: Math.max(0, asNumber(discount)),
      p_items: cart.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        price: item.unitPrice,
      })),
    });

    if (error) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message ?? "Unable to create order.")
          : "Unable to create order.";

      throw new Error(message);
    }

    const orderResult = extractOrderResult(data);
    if (!orderResult) {
      throw new Error("Order created but RPC response was missing the bill identifier.");
    }

    return {
      billId: orderResult.billId,
      subtotal: totals.subtotal,
      finalTotal: orderResult.total > 0 ? orderResult.total : totals.finalTotal,
    };
  },
};
