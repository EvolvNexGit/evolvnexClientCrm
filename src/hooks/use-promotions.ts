"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPromotion,
  fetchPromotions,
  setPromotionStatus,
  updatePromotion,
} from "@/lib/promotion-queries";
import type { PromotionPayload, PromotionRecord, PromoStatus } from "@/lib/promotion-types";

export function usePromotions(clientId: string) {
  const [promotions, setPromotions] = useState<PromotionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const next = await fetchPromotions(clientId);
      setPromotions(next);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load promotions.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addPromotion = useCallback(
    async (payload: PromotionPayload) => {
      setSaving(true);
      try {
        await createPromotion(clientId, payload);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const editPromotion = useCallback(
    async (promotionId: string, payload: PromotionPayload) => {
      setSaving(true);
      try {
        await updatePromotion(clientId, promotionId, payload);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const changePromotionStatus = useCallback(
    async (promotionId: string, status: PromoStatus) => {
      setSaving(true);
      try {
        await setPromotionStatus(clientId, promotionId, status);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  return {
    promotions,
    loading,
    saving,
    error,
    refresh,
    addPromotion,
    editPromotion,
    changePromotionStatus,
  };
}
