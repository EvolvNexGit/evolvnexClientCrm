export type InventoryUnit = "g" | "kg" | "ml" | "l" | "unit";

export type IngredientRecord = {
  id: string;
  client_id: string;
  name: string;
  quantity: number;
  threshold: number | null;
  quantity_unit: InventoryUnit;
  seller_name: string | null;
  seller_phone: string | null;
  seller_email: string | null;
  created_at: string;
};

export type IngredientPayload = {
  name: string;
  quantity: number;
  threshold?: number | null;
  quantity_unit: InventoryUnit;
  seller_name?: string | null;
  seller_phone?: string | null;
  seller_email?: string | null;
};

export type RecipeRecord = {
  id: string;
  client_id: string;
  product_id: string;
  ingredient_id: string;
  quantity: number;
  quantity_unit: InventoryUnit;
  created_at: string;
  productName: string;
  ingredientName: string;
  ingredientStock: number;
  ingredientThreshold: number | null;
  ingredientStockUnit: InventoryUnit;
};

export type RecipePayload = {
  product_id: string;
  ingredient_id: string;
  quantity: number;
  quantity_unit: InventoryUnit;
};
