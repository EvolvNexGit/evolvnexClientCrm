export const ORDER_ALERTS_ENABLED_KEY = "crm-order-alerts-enabled";
export const ORDER_ALERTS_CHANGED_EVENT = "crm-order-alerts-changed";

function hasWindow() {
  return typeof window !== "undefined";
}

export function readOrderAlertsEnabled() {
  if (!hasWindow()) {
    return false;
  }

  try {
    return window.localStorage.getItem(ORDER_ALERTS_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistOrderAlertsEnabled(enabled: boolean) {
  if (!hasWindow()) {
    return;
  }

  try {
    window.localStorage.setItem(ORDER_ALERTS_ENABLED_KEY, enabled ? "1" : "0");
    window.dispatchEvent(new Event(ORDER_ALERTS_CHANGED_EVENT));
  } catch {
    // no-op
  }
}
