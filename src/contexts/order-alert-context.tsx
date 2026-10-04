"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApp } from "@/contexts/app-context";
import { useOrderAlerts } from "@/hooks/use-order-alerts";
import {
  persistOrderAlertsEnabled,
  readOrderAlertsEnabled,
  ORDER_ALERTS_CHANGED_EVENT,
} from "@/lib/order-alert-preference";
import { unlockOrderAlertAudio, triggerOrderAlert } from "@/lib/order-notifications";
import {
  canUseWebPush,
  isWebPushConfigured,
  subscribeToOrderPush,
  unsubscribeFromOrderPush,
} from "@/lib/web-push-client";

type NotificationPermissionState = NotificationPermission | "unsupported";

type OrderAlertContextValue = {
  enabled: boolean;
  busy: boolean;
  permission: NotificationPermissionState;
  pushReady: boolean;
  pushConfigured: boolean;
  error: string | null;
  statusLabel: string;
  setEnabled: (enabled: boolean) => Promise<void>;
  testAlert: () => Promise<void>;
};

const OrderAlertContext = createContext<OrderAlertContextValue | null>(null);

function readPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return window.Notification.permission;
}

function buildStatusLabel(input: {
  enabled: boolean;
  permission: NotificationPermissionState;
  pushReady: boolean;
  pushConfigured: boolean;
  canPush: boolean;
}) {
  if (!input.enabled) {
    return "Off";
  }

  if (input.permission === "unsupported") {
    return "On requested, but this browser does not support notifications.";
  }

  if (input.permission === "denied") {
    return "Blocked by this browser. Allow notifications in site settings, then turn On again.";
  }

  if (input.permission !== "granted") {
    return "Waiting for browser permission.";
  }

  if (input.pushReady) {
    return "On · this browser will alert for Air Menu orders, including when CRM is closed.";
  }

  if (!input.pushConfigured) {
    return "On · alerts while CRM is open. Closed-browser push is not configured on this deployment.";
  }

  if (!input.canPush) {
    return "On · alerts while CRM is open. This browser does not support closed-browser push.";
  }

  return "On · alerts while CRM is open.";
}

export function OrderAlertProvider({ children }: { children: ReactNode }) {
  const { clientId, user } = useApp();
  const [enabled, setEnabledState] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionState>("unsupported");
  const [pushReady, setPushReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pushConfigured = isWebPushConfigured();
  const canPush = canUseWebPush();

  const refreshPermission = useCallback(() => {
    const nextPermission = readPermission();
    setPermission(nextPermission);
    if (nextPermission !== "granted" && readOrderAlertsEnabled()) {
      persistOrderAlertsEnabled(false);
      setEnabledState(false);
      setPushReady(false);
    }
  }, []);

  useEffect(() => {
    const stored = readOrderAlertsEnabled();
    const nextPermission = readPermission();
    setPermission(nextPermission);
    if (stored && nextPermission !== "granted") {
      persistOrderAlertsEnabled(false);
      setEnabledState(false);
    } else {
      setEnabledState(stored);
    }

    function onPreferenceChange() {
      setEnabledState(readOrderAlertsEnabled());
    }

    window.addEventListener(ORDER_ALERTS_CHANGED_EVENT, onPreferenceChange);
    window.addEventListener("storage", onPreferenceChange);

    let permissionStatus: PermissionStatus | null = null;
    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "notifications" as PermissionName })
        .then((status) => {
          permissionStatus = status;
          status.onchange = () => refreshPermission();
        })
        .catch(() => undefined);
    }

    return () => {
      window.removeEventListener(ORDER_ALERTS_CHANGED_EVENT, onPreferenceChange);
      window.removeEventListener("storage", onPreferenceChange);
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, [refreshPermission]);

  const setEnabled = useCallback(
    async (nextEnabled: boolean) => {
      if (!clientId || !user) {
        setError("Sign in before changing order alerts.");
        return;
      }

      setBusy(true);
      setError(null);

      try {
        if (!nextEnabled) {
          persistOrderAlertsEnabled(false);
          setEnabledState(false);
          setPushReady(false);
          await unsubscribeFromOrderPush().catch(() => undefined);
          return;
        }

        if (!("Notification" in window)) {
          throw new Error("This browser does not support notifications.");
        }

        unlockOrderAlertAudio();
        const nextPermission = await window.Notification.requestPermission();
        setPermission(nextPermission);

        if (nextPermission !== "granted") {
          persistOrderAlertsEnabled(false);
          setEnabledState(false);
          setPushReady(false);
          setError("Browser permission is required to turn order alerts on.");
          return;
        }

        persistOrderAlertsEnabled(true);
        setEnabledState(true);

        try {
          const subscribed = await subscribeToOrderPush(clientId);
          setPushReady(subscribed);
        } catch {
          setPushReady(false);
        }
      } catch (enableError) {
        persistOrderAlertsEnabled(false);
        setEnabledState(false);
        setPushReady(false);
        setError(enableError instanceof Error ? enableError.message : "Unable to update order alerts.");
      } finally {
        setBusy(false);
      }
    },
    [clientId, user],
  );

  const testAlert = useCallback(async () => {
    setError(null);

    if (!("Notification" in window)) {
      setError("This browser does not support notifications.");
      return;
    }

    unlockOrderAlertAudio();
    const nextPermission =
      window.Notification.permission === "granted"
        ? window.Notification.permission
        : await window.Notification.requestPermission();
    setPermission(nextPermission);

    if (nextPermission !== "granted") {
      setError("Allow notifications in the browser prompt to hear and see a test alert.");
      return;
    }

    persistOrderAlertsEnabled(true);
    setEnabledState(true);

    triggerOrderAlert({
      orderId: `test-${Date.now()}`,
      tableNumber: "Test",
      finalAmount: 0,
    });
  }, []);

  useEffect(() => {
    if (!enabled || !clientId || !user || permission !== "granted") {
      return;
    }

    let cancelled = false;
    void subscribeToOrderPush(clientId)
      .then((subscribed) => {
        if (!cancelled) {
          setPushReady(subscribed);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPushReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, enabled, permission, user]);

  useOrderAlerts(clientId, enabled && Boolean(user));

  const statusLabel = useMemo(
    () =>
      buildStatusLabel({
        enabled,
        permission,
        pushReady,
        pushConfigured,
        canPush,
      }),
    [canPush, enabled, permission, pushConfigured, pushReady],
  );

  const value = useMemo(
    () => ({
      enabled,
      busy,
      permission,
      pushReady,
      pushConfigured,
      error,
      statusLabel,
      setEnabled,
      testAlert,
    }),
    [busy, enabled, error, permission, pushConfigured, pushReady, setEnabled, statusLabel, testAlert],
  );

  return <OrderAlertContext.Provider value={value}>{children}</OrderAlertContext.Provider>;
}

export function useOrderAlertSettings() {
  const context = useContext(OrderAlertContext);
  if (!context) {
    throw new Error("useOrderAlertSettings must be used within OrderAlertProvider.");
  }

  return context;
}
