"use client";

import { getSupabaseClient } from "@/lib/supabase";

const SERVICE_WORKER_PATH = "/sw.js";

function getVapidPublicKey() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  return key || null;
}

export function isWebPushConfigured() {
  return Boolean(getVapidPublicKey());
}

export function canUseWebPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

async function persistSubscription(clientId: string, subscription: PushSubscription, enabled: boolean) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }

  const json = subscription.toJSON();
  const endpoint = json.endpoint?.trim() ?? "";
  const p256dh = json.keys?.p256dh?.trim() ?? "";
  const auth = json.keys?.auth?.trim() ?? "";

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push subscription was missing endpoint keys.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("web_push_subscriptions").upsert(
    {
      client_id: clientId,
      user_id: user?.id ?? null,
      endpoint,
      p256dh,
      auth,
      enabled,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    throw error;
  }
}

export async function subscribeToOrderPush(clientId: string) {
  const vapidPublicKey = getVapidPublicKey();
  if (!vapidPublicKey || !canUseWebPush()) {
    return false;
  }

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH);
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  await persistSubscription(clientId, subscription, true);
  return true;
}

export async function unsubscribeFromOrderPush() {
  if (!canUseWebPush()) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) {
    return;
  }

  const endpoint = subscription.endpoint;
  const supabase = getSupabaseClient();
  if (supabase && endpoint) {
    await supabase.from("web_push_subscriptions").delete().eq("endpoint", endpoint);
  }

  await subscription.unsubscribe();
}
