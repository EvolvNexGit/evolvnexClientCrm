"use client";

const PERMISSION_REQUESTED_KEY = "crm-order-notification-permission-requested";
const ORDER_IDS_KEY_PREFIX = "crm-order-notification-known-ids";
const MAX_STORED_ORDER_IDS = 400;

type BrowserWindowWithAudio = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

export type OrderNotificationPayload = {
  orderId: string;
  tableNumber?: string | null;
  finalAmount?: number | null;
};

function hasWindow() {
  return typeof window !== "undefined";
}

function canNotify() {
  return hasWindow() && "Notification" in window;
}

function getKnownOrderStorageKey(clientId: string) {
  return `${ORDER_IDS_KEY_PREFIX}-${clientId}`;
}

function formatAmount(value: number | null | undefined) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount)}`;
}

function persistKnownOrderIds(clientId: string, orderIds: Set<string>) {
  if (!hasWindow()) {
    return;
  }

  try {
    const limited = Array.from(orderIds).slice(-MAX_STORED_ORDER_IDS);
    window.sessionStorage.setItem(getKnownOrderStorageKey(clientId), JSON.stringify(limited));
  } catch {
    // no-op
  }
}

export function loadKnownOrderIds(clientId: string) {
  if (!hasWindow()) {
    return new Set<string>();
  }

  try {
    const raw = window.sessionStorage.getItem(getKnownOrderStorageKey(clientId));
    if (!raw) {
      return new Set<string>();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(
      parsed
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
        .slice(-MAX_STORED_ORDER_IDS),
    );
  } catch {
    return new Set<string>();
  }
}

export function saveKnownOrderIds(clientId: string, orderIds: Set<string>) {
  persistKnownOrderIds(clientId, orderIds);
}

export function requestNotificationPermissionOnce() {
  if (!canNotify()) {
    return;
  }

  if (window.Notification.permission !== "default") {
    return;
  }

  try {
    if (window.localStorage.getItem(PERMISSION_REQUESTED_KEY) === "1") {
      return;
    }

    window.localStorage.setItem(PERMISSION_REQUESTED_KEY, "1");
  } catch {
    return;
  }

  void window.Notification.requestPermission().catch(() => undefined);
}

export function playOrderAlertSound() {
  if (!hasWindow()) {
    return;
  }

  try {
    const browserWindow = window as BrowserWindowWithAudio;
    const AudioCtx = browserWindow.AudioContext ?? browserWindow.webkitAudioContext;
    if (!AudioCtx) {
      return;
    }

    const audioContext = new AudioCtx();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
    oscillator.onended = () => {
      void audioContext.close().catch(() => undefined);
    };
  } catch {
    // no-op
  }
}

export function showOrderNotification(payload: OrderNotificationPayload) {
  if (!canNotify()) {
    return;
  }

  if (window.Notification.permission !== "granted") {
    return;
  }

  const tableLabel = payload.tableNumber ? `Table ${payload.tableNumber}` : "Walk-in";
  const body = `${tableLabel} • ${formatAmount(payload.finalAmount)}`;

  try {
    const notification = new window.Notification("New Order", {
      body,
      tag: `new-order-${payload.orderId}`,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // no-op
  }
}

export function triggerOrderAlert(payload: OrderNotificationPayload) {
  playOrderAlertSound();
  showOrderNotification(payload);
}
