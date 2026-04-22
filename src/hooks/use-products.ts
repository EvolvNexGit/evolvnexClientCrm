"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createProduct,
  fetchProducts,
  setProductActive,
  updateProduct,
} from "@/lib/billing-queries";
import type { ProductPayload, ProductRecord } from "@/lib/billing-types";

type UseProductsOptions = {
  includeInactive?: boolean;
};

export function useProducts(clientId: string, options?: UseProductsOptions) {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const next = await fetchProducts(clientId, { includeInactive: options?.includeInactive });
      setProducts(next);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }, [clientId, options?.includeInactive]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addProduct = useCallback(
    async (payload: ProductPayload) => {
      setSaving(true);
      try {
        await createProduct(clientId, payload);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const editProduct = useCallback(
    async (productId: string, payload: Partial<ProductPayload>) => {
      setSaving(true);
      try {
        await updateProduct(clientId, productId, payload);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const toggleProduct = useCallback(
    async (productId: string, isActive: boolean) => {
      setSaving(true);
      try {
        await setProductActive(clientId, productId, isActive);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  return {
    products,
    loading,
    saving,
    error,
    refresh,
    addProduct,
    editProduct,
    toggleProduct,
  };
}
