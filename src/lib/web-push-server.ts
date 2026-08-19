import webpush from "web-push";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildOrderAlertCopy, type OrderAlertPayload } from "@/lib/order-alert-format";
import { isNotifiableOrderSource } from "@/lib/order-alert-policy";

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@evolvnex.com";

  if (!publicKey || !privateKey) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

export function isClosedBrowserPushConfigured() {
  return Boolean(getVapidConfig());
}

function asBillRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

export function extractInsertedBill(payload: Record<string, unknown>) {
  return asBillRecord(payload.record) ?? asBillRecord(payload.new) ?? null;
}

export function shouldSendOrderPush(bill: Record<string, unknown>) {
  return isNotifiableOrderSource(bill.order_source);
}

export function billToAlertPayload(bill: Record<string, unknown>): OrderAlertPayload | null {
  const orderId = bill.id != null ? String(bill.id) : "";
  if (!orderId) {
    return null;
  }

  return {
    orderId,
    tableNumber: bill.table_number != null ? String(bill.table_number) : null,
    finalAmount: Number(bill.final_amount ?? 0),
  };
}

export async function sendNewOrderPush(clientId: string, payload: OrderAlertPayload) {
  const vapid = getVapidConfig();
  if (!vapid) {
    return { sent: 0, skipped: "not_configured" as const };
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("web_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("client_id", clientId)
    .eq("enabled", true);

  if (error) {
    throw error;
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[];
  const copy = buildOrderAlertCopy(payload);
  let sent = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(copy),
      );
      sent += 1;
    } catch (pushError) {
      const statusCode =
        pushError && typeof pushError === "object" && "statusCode" in pushError
          ? Number((pushError as { statusCode?: unknown }).statusCode)
          : 0;

      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("web_push_subscriptions").delete().eq("id", subscription.id);
      }
    }
  }

  return { sent, skipped: null };
}
