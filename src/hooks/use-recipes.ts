"use client";

import { useCallback, useEffect, useState } from "react";
import { createRecipe, createRecipes, deleteRecipe, fetchRecipes, updateRecipe } from "@/lib/inventory-queries";
import type { RecipePayload, RecipeRecord } from "@/lib/inventory-types";

export function useRecipes(clientId: string) {
  const [recipes, setRecipes] = useState<RecipeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const next = await fetchRecipes(clientId);
      setRecipes(next);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load recipes.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addRecipe = useCallback(
    async (payload: RecipePayload) => {
      setSaving(true);
      try {
        await createRecipe(clientId, payload);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const addRecipes = useCallback(
    async (payloads: RecipePayload[]) => {
      setSaving(true);
      try {
        await createRecipes(clientId, payloads);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const editRecipe = useCallback(
    async (recipeId: string, payload: Partial<RecipePayload>) => {
      setSaving(true);
      try {
        await updateRecipe(clientId, recipeId, payload);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const removeRecipe = useCallback(
    async (recipeId: string) => {
      setSaving(true);
      try {
        await deleteRecipe(clientId, recipeId);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  return {
    recipes,
    loading,
    saving,
    error,
    refresh,
    addRecipe,
    addRecipes,
    editRecipe,
    removeRecipe,
  };
}
