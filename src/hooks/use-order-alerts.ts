"use client";

import { useEffect, useRef } from "react";
import { fetchActiveOrders } from "@/lib/billing-queries";
import { isNotifiableOrderSource } from "@/lib/order-alert-policy";
import {
  loadKnownOrderIds,
  saveKnownOrderIds,
  triggerOrderAlert,
  unlockOrderAlertAudio,
} from "@/lib/order-notifications";
import { getSupabaseClient } from "@/lib/supabase";

type PushMessagePayload = {
  orderId?: string;
  tableNumber?: string | null;
  finalAmount?: number | null;
};

function asInsertedBill(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

export function useOrderAlerts(clientId: string | null, enabled: boolean) {
  const knownOrderIdsRef = useRef<Set<string>>(new Set<string>());
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !clientId) {
      return;
    }

    unlockOrderAlertAudio();

    function unlockOnGesture() {
      unlockOrderAlertAudio();
    }

    window.addEventListener("pointerdown", unlockOnGesture, { once: true });
    window.addEventListener("keydown", unlockOnGesture, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockOnGesture);
      window.removeEventListener("keydown", unlockOnGesture);
    };
  }, [clientId, enabled]);

  useEffect(() => {
    if (!enabled || !clientId) {
      return;
    }

    const activeClientId = clientId;
    let cancelled = false;
    knownOrderIdsRef.current = loadKnownOrderIds(activeClientId);
    hasHydratedRef.current = false;

    async function hydrateKnownOrders() {
      try {
        const orders = await fetchActiveOrders(activeClientId);
        if (cancelled) {
          return;
        }

        orders.forEach((order) => {
          knownOrderIdsRef.current.add(order.id);
        });
        saveKnownOrderIds(activeClientId, knownOrderIdsRef.current);
      } catch {
        // Keep session IDs even if the queue fetch fails.
      } finally {
        if (!cancelled) {
          hasHydratedRef.current = true;
        }
      }
    }

    void hydrateKnownOrders();

    return () => {
      cancelled = true;
    };
  }, [clientId, enabled]);

  useEffect(() => {
    if (!enabled || !clientId) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    const activeClientId = clientId;
    const rememberOrder = (orderId: string) => {
      knownOrderIdsRef.current.add(orderId);
      saveKnownOrderIds(activeClientId, knownOrderIdsRef.current);
    };

    const alertIfNew = (
      payload: { orderId: string; tableNumber?: string | null; finalAmount?: number | null },
      source: "realtime" | "push",
    ) => {
      if (knownOrderIdsRef.current.has(payload.orderId)) {
        return;
      }

      if (source === "realtime" && !hasHydratedRef.current) {
        rememberOrder(payload.orderId);
        return;
      }

      rememberOrder(payload.orderId);
      triggerOrderAlert(payload);
    };

    const channel = supabase
      .channel(`order-alerts-${activeClientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bills",
          filter: `client_id=eq.${activeClientId}`,
        },
        (payload) => {
          const inserted = asInsertedBill(payload.new);
          const orderId = inserted?.id != null ? String(inserted.id) : "";
          if (!orderId || !isNotifiableOrderSource(inserted?.order_source)) {
            if (orderId) {
              rememberOrder(orderId);
            }
            return;
          }

          alertIfNew(
            {
              orderId,
              tableNumber: inserted?.table_number != null ? String(inserted.table_number) : null,
              finalAmount: Number(inserted?.final_amount ?? 0),
            },
            "realtime",
          );
        },
      )
      .subscribe();

    function onServiceWorkerMessage(event: MessageEvent<{ type?: string; payload?: PushMessagePayload }>) {
      if (event.data?.type !== "NEW_ORDER_PUSH") {
        return;
      }

      const orderId = String(event.data.payload?.orderId ?? "").trim();
      if (!orderId) {
        return;
      }

      alertIfNew(
        {
          orderId,
          tableNumber: event.data.payload?.tableNumber ?? null,
          finalAmount: event.data.payload?.finalAmount ?? 0,
        },
        "push",
      );
    }

    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

    return () => {
      void supabase.removeChannel(channel);
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    };
  }, [clientId, enabled]);
}
