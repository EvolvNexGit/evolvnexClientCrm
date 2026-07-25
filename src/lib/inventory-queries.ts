import { getSupabaseClient } from "@/lib/supabase";
import {
  buildIlikeOrFilter,
  buildListRange,
  LIST_PAGE_SHOW_ALL_MAX,
  sanitizeSearch,
  type ListPageParams,
  type ListPageResult,
} from "@/lib/list-pagination";
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

function mapIngredientRow(row: any): IngredientRecord {
  return {
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
  };
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

  return (data ?? []).map(mapIngredientRow);
}

export async function fetchIngredientsPage(
  clientId: string,
  params: ListPageParams & { lowStockOnly?: boolean } = { limit: 12, offset: 0 },
): Promise<ListPageResult<IngredientRecord>> {
  const supabase = getClient();
  const search = sanitizeSearch(params.search);
  const { from, to } = buildListRange(params.offset, params.limit);

  // Low-stock needs row-level comparison; load a capped page then filter client-side.
  if (params.lowStockOnly) {
    const all = await fetchIngredients(clientId);
    const filtered = all.filter((ingredient) => {
      const matchesSearch =
        !search ||
        [ingredient.name, ingredient.seller_name ?? "", ingredient.seller_phone ?? "", ingredient.seller_email ?? "", ingredient.quantity_unit]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase());
      const needsRestock =
        ingredient.quantity <= 0 || (ingredient.threshold !== null && ingredient.quantity < ingredient.threshold);
      return matchesSearch && needsRestock;
    });
    const items = filtered.slice(from, to + 1);
    return {
      items,
      hasMore: to + 1 < filtered.length,
      totalCount: filtered.length,
    };
  }

  let query = supabase
    .from("ingredients")
    .select(
      "id, client_id, name, quantity, threshold, quantity_unit, seller_name, seller_phone, seller_email, created_at",
      { count: "exact" },
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    const filter = buildIlikeOrFilter(
      ["name", "seller_name", "seller_phone", "seller_email"],
      search,
    );
    if (filter) {
      query = query.or(filter);
    }
  }

  const { data, error, count } = await query;
  if (error) {
    throw error;
  }

  const items = (data ?? []).map(mapIngredientRow);
  const totalCount = count ?? null;
  return {
    items,
    hasMore: totalCount != null ? from + items.length < totalCount : items.length === params.limit,
    totalCount,
  };
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

export async function setIngredientQuantity(
  clientId: string,
  ingredientId: string,
  quantity: number,
): Promise<void> {
  await updateIngredient(clientId, ingredientId, { quantity });
}

/** Sets every ingredient for the client to the given quantity (e.g. 0). */
export async function setAllIngredientQuantities(clientId: string, quantity: number): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("ingredients")
    .update({ quantity })
    .eq("client_id", clientId);

  if (error) {
    throw error;
  }
}

/** Sets each ingredient's quantity to its own threshold (minimum required stock). */
export async function setAllIngredientQuantitiesToThreshold(clientId: string): Promise<void> {
  const ingredients = await fetchIngredients(clientId);

  await Promise.all(
    ingredients.map((ingredient) =>
      updateIngredient(clientId, ingredient.id, {
        quantity: ingredient.threshold ?? 0,
      }),
    ),
  );
}

function mapRecipeRow(row: any): RecipeRecord {
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
    productType: productRaw?.type ?? null,
    ingredientName: ingredientRaw?.name ?? "Unknown ingredient",
    ingredientStock: asNumber(ingredientRaw?.quantity),
    ingredientThreshold:
      ingredientRaw?.threshold === null || ingredientRaw?.threshold === undefined
        ? null
        : asNumber(ingredientRaw.threshold),
    ingredientStockUnit: ingredientRaw?.quantity_unit ?? row.quantity_unit,
  };
}

export async function fetchRecipes(clientId: string): Promise<RecipeRecord[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id, client_id, product_id, ingredient_id, quantity, quantity_unit, created_at, products(name, type), ingredients(name, quantity, threshold, quantity_unit)",
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRecipeRow);
}

export type FetchRecipesPageParams = ListPageParams & {
  productTypeFilter?: string | null;
  lowStockOnly?: boolean;
};

function matchesRecipeFilters(
  recipe: RecipeRecord,
  search: string | undefined,
  lowStockOnly: boolean | undefined,
  productTypeFilter: string | null | undefined,
) {
  const matchesSearch =
    !search ||
    [recipe.productName, recipe.ingredientName, recipe.quantity_unit, recipe.ingredientStockUnit]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());

  const matchesLowStock =
    !lowStockOnly ||
    (recipe.ingredientThreshold !== null && recipe.ingredientStock < recipe.ingredientThreshold);

  const matchesType = !productTypeFilter || recipe.productType === productTypeFilter;

  return matchesSearch && matchesLowStock && matchesType;
}

/**
 * Recipes joined against products/ingredients don't support server-side text search across the
 * joined names via PostgREST easily, so when a search or low-stock filter is active we load a
 * capped set (up to LIST_PAGE_SHOW_ALL_MAX) and filter/paginate client-side. Without filters we
 * use a plain range-based page for efficiency.
 */
export async function fetchRecipesPage(
  clientId: string,
  params: FetchRecipesPageParams = { limit: 12, offset: 0 },
): Promise<ListPageResult<RecipeRecord>> {
  const search = sanitizeSearch(params.search);
  const { from, to } = buildListRange(params.offset, params.limit);
  const needsClientFilter = Boolean(search) || Boolean(params.lowStockOnly) || Boolean(params.productTypeFilter);

  if (!needsClientFilter) {
    const supabase = getClient();
    const { data, error, count } = await supabase
      .from("recipes")
      .select(
        "id, client_id, product_id, ingredient_id, quantity, quantity_unit, created_at, products(name, type), ingredients(name, quantity, threshold, quantity_unit)",
        { count: "exact" },
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    const items = (data ?? []).map(mapRecipeRow);
    const totalCount = count ?? null;
    return {
      items,
      hasMore: totalCount != null ? from + items.length < totalCount : items.length === params.limit,
      totalCount,
    };
  }

  // Load a capped set (with product type context) and filter/paginate client-side.
  const all = await fetchRecipes(clientId);
  const filtered = all.filter((recipe) =>
    matchesRecipeFilters(recipe, search, params.lowStockOnly, params.productTypeFilter),
  );
  const capped = filtered.slice(0, LIST_PAGE_SHOW_ALL_MAX);
  const items = capped.slice(from, to + 1);

  return {
    items,
    hasMore: to + 1 < capped.length,
    totalCount: filtered.length,
  };
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
