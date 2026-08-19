"use client";

import { useEffect, useRef } from "react";
import { fetchActiveOrders } from "@/lib/billing-queries";
import type { TransactionRecord } from "@/lib/billing-types";
import { isNotifiableOrderSource } from "@/lib/order-alert-policy";
import {
  loadKnownOrderIds,
  saveKnownOrderIds,
  triggerOrderAlert,
  unlockOrderAlertAudio,
} from "@/lib/order-notifications";
import { getSupabaseClient } from "@/lib/supabase";

const ALERT_POLL_MS = 8_000;

type PushMessagePayload = {
  orderId?: string;
  tableNumber?: string | null;
  finalAmount?: number | null;
};

type AlertPayload = {
  orderId: string;
  tableNumber?: string | null;
  finalAmount?: number | null;
};

function asInsertedBill(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function toAlertPayload(order: TransactionRecord): AlertPayload {
  return {
    orderId: order.id,
    tableNumber: order.table_number ?? null,
    finalAmount: order.final_amount,
  };
}

export function useOrderAlerts(clientId: string | null, enabled: boolean) {
  const knownOrderIdsRef = useRef<Set<string>>(new Set<string>());
  const hasHydratedRef = useRef(false);
  const pendingRealtimeRef = useRef<AlertPayload[]>([]);

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
    const supabase = getSupabaseClient();
    knownOrderIdsRef.current = loadKnownOrderIds(activeClientId);
    hasHydratedRef.current = false;
    pendingRealtimeRef.current = [];

    const rememberOrder = (orderId: string) => {
      knownOrderIdsRef.current.add(orderId);
      saveKnownOrderIds(activeClientId, knownOrderIdsRef.current);
    };

    const alertIfNew = (payload: AlertPayload) => {
      if (!payload.orderId || knownOrderIdsRef.current.has(payload.orderId)) {
        return;
      }

      rememberOrder(payload.orderId);
      triggerOrderAlert(payload);
    };

    const scanOrders = (orders: TransactionRecord[], mode: "hydrate" | "poll") => {
      for (const order of orders) {
        if (knownOrderIdsRef.current.has(order.id)) {
          continue;
        }

        if (!isNotifiableOrderSource(order.order_source) || mode === "hydrate") {
          rememberOrder(order.id);
          continue;
        }

        alertIfNew(toAlertPayload(order));
      }
    };

    const hydrateAndFlush = async () => {
      try {
        const orders = await fetchActiveOrders(activeClientId);
        scanOrders(orders, "hydrate");
      } catch {
        // Keep session IDs even if the queue fetch fails.
      } finally {
        hasHydratedRef.current = true;
        const pending = pendingRealtimeRef.current;
        pendingRealtimeRef.current = [];
        pending.forEach((payload) => alertIfNew(payload));
      }
    };

    void hydrateAndFlush();

    const intervalId = window.setInterval(() => {
      void fetchActiveOrders(activeClientId)
        .then((orders) => {
          if (!hasHydratedRef.current) {
            return;
          }

          scanOrders(orders, "poll");
        })
        .catch(() => undefined);
    }, ALERT_POLL_MS);

    const channel = supabase
      ?.channel(`order-alerts-${activeClientId}`)
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
          if (!orderId) {
            return;
          }

          if (!isNotifiableOrderSource(inserted?.order_source)) {
            rememberOrder(orderId);
            return;
          }

          const alertPayload: AlertPayload = {
            orderId,
            tableNumber: inserted?.table_number != null ? String(inserted.table_number) : null,
            finalAmount: Number(inserted?.final_amount ?? 0),
          };

          if (!hasHydratedRef.current) {
            pendingRealtimeRef.current.push(alertPayload);
            return;
          }

          alertIfNew(alertPayload);
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[order-alerts] realtime unavailable; polling will still detect new orders.", status);
        }
      });

    function onServiceWorkerMessage(event: MessageEvent<{ type?: string; payload?: PushMessagePayload }>) {
      if (event.data?.type !== "NEW_ORDER_PUSH") {
        return;
      }

      const orderId = String(event.data.payload?.orderId ?? "").trim();
      if (!orderId) {
        return;
      }

      alertIfNew({
        orderId,
        tableNumber: event.data.payload?.tableNumber ?? null,
        finalAmount: event.data.payload?.finalAmount ?? 0,
      });
    }

    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

    return () => {
      window.clearInterval(intervalId);
      if (supabase && channel) {
        void supabase.removeChannel(channel);
      }
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    };
  }, [clientId, enabled]);
}
