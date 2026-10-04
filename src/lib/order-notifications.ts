"use client";

import { buildOrderAlertCopy, type OrderAlertPayload } from "@/lib/order-alert-format";

const ORDER_IDS_KEY_PREFIX = "crm-order-notification-known-ids";
const MAX_STORED_ORDER_IDS = 400;
const ALERT_TONE_FREQUENCY_HZ = 880;
const ALERT_TONE_MIN_GAIN = 0.0001;
const ALERT_TONE_MAX_GAIN = 0.18;
const ALERT_TONE_ATTACK_SECONDS = 0.01;
const ALERT_TONE_DECAY_SECONDS = 0.28;
const ALERT_TONE_TOTAL_SECONDS = 0.3;

type BrowserWindowWithAudio = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

export type { OrderAlertPayload as OrderNotificationPayload };

let sharedAudioContext: AudioContext | null = null;

function hasWindow() {
  return typeof window !== "undefined";
}

function canNotify() {
  return hasWindow() && "Notification" in window;
}

function getKnownOrderStorageKey(clientId: string) {
  return `${ORDER_IDS_KEY_PREFIX}-${clientId}`;
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

function getAudioContext() {
  if (!hasWindow()) {
    return null;
  }

  const browserWindow = window as BrowserWindowWithAudio;
  const AudioCtx = browserWindow.AudioContext ?? browserWindow.webkitAudioContext;
  if (!AudioCtx) {
    return null;
  }

  if (!sharedAudioContext) {
    sharedAudioContext = new AudioCtx();
  }

  return sharedAudioContext;
}

export function unlockOrderAlertAudio() {
  const audioContext = getAudioContext();
  if (!audioContext) {
    return;
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume().catch(() => undefined);
  }
}

export function playOrderAlertSound() {
  const audioContext = getAudioContext();
  if (!audioContext) {
    return;
  }

  try {
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => undefined);
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(ALERT_TONE_FREQUENCY_HZ, now);
    gain.gain.setValueAtTime(ALERT_TONE_MIN_GAIN, now);
    gain.gain.exponentialRampToValueAtTime(ALERT_TONE_MAX_GAIN, now + ALERT_TONE_ATTACK_SECONDS);
    gain.gain.exponentialRampToValueAtTime(ALERT_TONE_MIN_GAIN, now + ALERT_TONE_DECAY_SECONDS);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + ALERT_TONE_TOTAL_SECONDS);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {
    // no-op
  }
}

export function showOrderNotification(payload: OrderAlertPayload) {
  if (!canNotify() || window.Notification.permission !== "granted") {
    return;
  }

  const copy = buildOrderAlertCopy(payload);

  try {
    const notification = new window.Notification(copy.title, {
      body: copy.body,
      tag: copy.tag,
    });

    notification.onclick = () => {
      window.focus();
      window.location.assign(copy.url);
      notification.close();
    };
  } catch {
    // no-op
  }
}

export function triggerOrderAlert(
  payload: OrderAlertPayload,
  options?: { playSound?: boolean; showNotification?: boolean },
) {
  if (options?.playSound !== false) {
    playOrderAlertSound();
  }

  if (options?.showNotification !== false) {
    showOrderNotification(payload);
  }
}
