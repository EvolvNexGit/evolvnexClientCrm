"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createIngredient,
  deleteIngredient,
  fetchIngredients,
  setAllIngredientQuantities,
  setAllIngredientQuantitiesToThreshold,
  setIngredientQuantity,
  updateIngredient,
} from "@/lib/inventory-queries";
import type { IngredientPayload, IngredientRecord } from "@/lib/inventory-types";

export function useIngredients(clientId: string) {
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const next = await fetchIngredients(clientId);
      setIngredients(next);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load ingredients.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addIngredient = useCallback(
    async (payload: IngredientPayload) => {
      setSaving(true);
      try {
        await createIngredient(clientId, payload);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const editIngredient = useCallback(
    async (ingredientId: string, payload: Partial<IngredientPayload>) => {
      setSaving(true);
      try {
        await updateIngredient(clientId, ingredientId, payload);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const removeIngredient = useCallback(
    async (ingredientId: string) => {
      setSaving(true);
      try {
        await deleteIngredient(clientId, ingredientId);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const resetIngredientStock = useCallback(
    async (ingredientId: string) => {
      setSaving(true);
      try {
        await setIngredientQuantity(clientId, ingredientId, 0);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const restockIngredientToThreshold = useCallback(
    async (ingredientId: string, threshold: number | null) => {
      setSaving(true);
      try {
        await setIngredientQuantity(clientId, ingredientId, threshold ?? 0);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const resetAllIngredientStock = useCallback(async () => {
    setSaving(true);
    try {
      await setAllIngredientQuantities(clientId, 0);
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [clientId, refresh]);

  const restockAllIngredientsToThreshold = useCallback(async () => {
    setSaving(true);
    try {
      await setAllIngredientQuantitiesToThreshold(clientId);
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [clientId, refresh]);

  return {
    ingredients,
    loading,
    saving,
    error,
    refresh,
    addIngredient,
    editIngredient,
    removeIngredient,
    resetIngredientStock,
    restockIngredientToThreshold,
    resetAllIngredientStock,
    restockAllIngredientsToThreshold,
  };
}
