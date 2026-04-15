import { getSupabaseClient } from "@/lib/supabase";
import type {
  IngredientPayload,
  IngredientRecord,
  RecipePayload,
  RecipeRecord,
} from "@/lib/inventory-types";

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

export async function fetchIngredients(clientId: string): Promise<IngredientRecord[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select(
      "id, client_id, name, quantity, threshold, quantity_unit, seller_name, seller_phone, seller_email, created_at",
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    client_id: String(row.client_id),
    name: String(row.name ?? "Unnamed ingredient"),
    quantity: asNumber(row.quantity),
    threshold: row.threshold === null || row.threshold === undefined ? null : asNumber(row.threshold),
    quantity_unit: row.quantity_unit,
    seller_name: row.seller_name ?? null,
    seller_phone: row.seller_phone ?? null,
    seller_email: row.seller_email ?? null,
    created_at: row.created_at ?? "",
  }));
}

export async function createIngredient(clientId: string, payload: IngredientPayload): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from("ingredients").insert({
    client_id: clientId,
    name: payload.name,
    quantity: payload.quantity,
    threshold: payload.threshold ?? 0,
    quantity_unit: payload.quantity_unit,
    seller_name: payload.seller_name ?? null,
    seller_phone: payload.seller_phone ?? null,
    seller_email: payload.seller_email ?? null,
  });

  if (error) {
    throw error;
  }
}

export async function updateIngredient(
  clientId: string,
  ingredientId: string,
  payload: Partial<IngredientPayload>,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("ingredients")
    .update({
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.quantity !== undefined ? { quantity: payload.quantity } : {}),
      ...(payload.threshold !== undefined ? { threshold: payload.threshold ?? 0 } : {}),
      ...(payload.quantity_unit !== undefined ? { quantity_unit: payload.quantity_unit } : {}),
      ...(payload.seller_name !== undefined ? { seller_name: payload.seller_name } : {}),
      ...(payload.seller_phone !== undefined ? { seller_phone: payload.seller_phone } : {}),
      ...(payload.seller_email !== undefined ? { seller_email: payload.seller_email } : {}),
    })
    .eq("id", ingredientId)
    .eq("client_id", clientId);

  if (error) {
    throw error;
  }
}

export async function deleteIngredient(clientId: string, ingredientId: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from("ingredients").delete().eq("id", ingredientId).eq("client_id", clientId);

  if (error) {
    throw error;
  }
}

export async function fetchRecipes(clientId: string): Promise<RecipeRecord[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id, client_id, product_id, ingredient_id, quantity, quantity_unit, created_at, products(name), ingredients(name)",
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => {
    const productRaw = Array.isArray(row.products) ? row.products[0] : row.products;
    const ingredientRaw = Array.isArray(row.ingredients) ? row.ingredients[0] : row.ingredients;

    return {
      id: String(row.id),
      client_id: String(row.client_id),
      product_id: String(row.product_id),
      ingredient_id: String(row.ingredient_id),
      quantity: asNumber(row.quantity),
      quantity_unit: row.quantity_unit,
      created_at: row.created_at ?? "",
      productName: productRaw?.name ?? "Unknown product",
      ingredientName: ingredientRaw?.name ?? "Unknown ingredient",
    };
  });
}

export async function createRecipe(clientId: string, payload: RecipePayload): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from("recipes").insert({
    client_id: clientId,
    product_id: payload.product_id,
    ingredient_id: payload.ingredient_id,
    quantity: payload.quantity,
    quantity_unit: payload.quantity_unit,
  });

  if (error) {
    throw error;
  }
}

export async function updateRecipe(
  clientId: string,
  recipeId: string,
  payload: Partial<RecipePayload>,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("recipes")
    .update({
      ...(payload.product_id !== undefined ? { product_id: payload.product_id } : {}),
      ...(payload.ingredient_id !== undefined ? { ingredient_id: payload.ingredient_id } : {}),
      ...(payload.quantity !== undefined ? { quantity: payload.quantity } : {}),
      ...(payload.quantity_unit !== undefined ? { quantity_unit: payload.quantity_unit } : {}),
    })
    .eq("id", recipeId)
    .eq("client_id", clientId);

  if (error) {
    throw error;
  }
}

export async function deleteRecipe(clientId: string, recipeId: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from("recipes").delete().eq("id", recipeId).eq("client_id", clientId);

  if (error) {
    throw error;
  }
}
