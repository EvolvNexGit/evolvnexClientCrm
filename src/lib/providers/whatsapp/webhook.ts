import { createHmac, timingSafeEqual } from "crypto";
import {
  findClientIdByVerifyToken,
  getWhatsAppSecretsByPhoneNumberId,
} from "@/lib/communication-credentials";
import { normalizeTriggerText } from "@/lib/communication-types";
import { sendWhatsAppTextMessage } from "@/lib/providers/whatsapp/cloud-api";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type InboundTextMessage = {
  phoneNumberId: string;
  fromPhone: string;
  text: string;
  messageId: string;
  displayPhone?: string | null;
};

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function signatureMatches(rawBody: string, providedHex: string, appSecret: string): boolean {
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(providedHex, expected);
}

function collectPhoneNumberIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const entry = (payload as { entry?: unknown[] }).entry;
  if (!Array.isArray(entry)) {
    return [];
  }

  const ids = new Set<string>();

  for (const item of entry) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const changes = (item as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) {
      continue;
    }

    for (const change of changes) {
      if (!change || typeof change !== "object") {
        continue;
      }
      const value = (change as { value?: Record<string, unknown> }).value;
      const metadata = value?.metadata as { phone_number_id?: string } | undefined;
      if (metadata?.phone_number_id) {
        ids.add(metadata.phone_number_id);
      }
    }
  }

  return [...ids];
}

export async function verifyWhatsAppWebhookChallenge(params: {
  mode: string | null;
  verifyToken: string | null;
  challenge: string | null;
}): Promise<string | null> {
  if (params.mode !== "subscribe" || !params.verifyToken || !params.challenge) {
    return null;
  }

  const clientId = await findClientIdByVerifyToken(params.verifyToken);
  if (!clientId) {
    return null;
  }

  return params.challenge;
}

export async function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const provided = signatureHeader.slice("sha256=".length);
  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return false;
  }

  const phoneNumberIds = collectPhoneNumberIds(payload);
  for (const phoneNumberId of phoneNumberIds) {
    const account = await getWhatsAppSecretsByPhoneNumberId(phoneNumberId);
    if (!account) {
      continue;
    }
    if (signatureMatches(rawBody, provided, account.secrets.appSecret)) {
      return true;
    }
  }

  return false;
}

function extractInboundTextMessages(payload: unknown): InboundTextMessage[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const entry = (payload as { entry?: unknown[] }).entry;
  if (!Array.isArray(entry)) {
    return [];
  }

  const messages: InboundTextMessage[] = [];

  for (const item of entry) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const changes = (item as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) {
      continue;
    }

    for (const change of changes) {
      if (!change || typeof change !== "object") {
        continue;
      }
      const value = (change as { value?: Record<string, unknown> }).value;
      if (!value) {
        continue;
      }

      const metadata = value.metadata as { phone_number_id?: string; display_phone_number?: string } | undefined;
      const phoneNumberId = metadata?.phone_number_id;
      const inbound = value.messages;
      if (!phoneNumberId || !Array.isArray(inbound)) {
        continue;
      }

      for (const message of inbound) {
        if (!message || typeof message !== "object") {
          continue;
        }
        const msg = message as {
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
        };
        if (msg.type !== "text" || !msg.from || !msg.text?.body || !msg.id) {
          continue;
        }
        messages.push({
          phoneNumberId,
          fromPhone: msg.from,
          text: msg.text.body,
          messageId: msg.id,
          displayPhone: metadata?.display_phone_number ?? null,
        });
      }
    }
  }

  return messages;
}

async function findMatchingReply(
  clientId: string,
  inboundText: string,
): Promise<{ response_text: string } | null> {
  const supabase = getSupabaseAdminClient();
  const normalized = normalizeTriggerText(inboundText);

  const { data, error } = await supabase
    .from("communication_auto_replies")
    .select("trigger_text, response_text, match_mode")
    .eq("client_id", clientId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  for (const row of data ?? []) {
    const trigger = normalizeTriggerText(String(row.trigger_text ?? ""));
    if (!trigger) {
      continue;
    }
    if (row.match_mode === "contains") {
      if (normalized.includes(trigger)) {
        return { response_text: String(row.response_text ?? "") };
      }
    } else if (normalized === trigger) {
      return { response_text: String(row.response_text ?? "") };
    }
  }

  return null;
}

async function insertInboundIfNew(params: {
  clientId: string;
  fromPhone: string;
  toPhone?: string | null;
  body: string;
  providerMessageId: string;
  raw: unknown;
}): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("communication_message_events").insert({
    client_id: params.clientId,
    provider: "whatsapp",
    direction: "inbound",
    from_phone: params.fromPhone,
    to_phone: params.toPhone ?? null,
    body: params.body,
    provider_message_id: params.providerMessageId,
    status: "received",
    raw: params.raw ?? null,
  });

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return false;
    }
    throw error;
  }

  return true;
}

async function logMessageEvent(params: {
  clientId: string;
  direction: "inbound" | "outbound";
  fromPhone?: string | null;
  toPhone?: string | null;
  body?: string | null;
  providerMessageId?: string | null;
  status?: string | null;
  raw?: unknown;
}) {
  const supabase = getSupabaseAdminClient();
  await supabase.from("communication_message_events").insert({
    client_id: params.clientId,
    provider: "whatsapp",
    direction: params.direction,
    from_phone: params.fromPhone ?? null,
    to_phone: params.toPhone ?? null,
    body: params.body ?? null,
    provider_message_id: params.providerMessageId ?? null,
    status: params.status ?? null,
    raw: params.raw ?? null,
  });
}

export async function handleWhatsAppWebhookPayload(payload: unknown): Promise<{
  processed: number;
  replied: number;
}> {
  const inboundMessages = extractInboundTextMessages(payload);
  let processed = 0;
  let replied = 0;

  for (const message of inboundMessages) {
    const account = await getWhatsAppSecretsByPhoneNumberId(message.phoneNumberId);
    if (!account) {
      console.error("[whatsapp-webhook] No connected credentials for phone_number_id", message.phoneNumberId);
      continue;
    }

    const isNew = await insertInboundIfNew({
      clientId: account.clientId,
      fromPhone: message.fromPhone,
      toPhone: message.displayPhone,
      body: message.text,
      providerMessageId: message.messageId,
      raw: message,
    });
    if (!isNew) {
      continue;
    }
    processed += 1;

    const match = await findMatchingReply(account.clientId, message.text);
    if (!match?.response_text?.trim()) {
      continue;
    }

    const sendResult = await sendWhatsAppTextMessage({
      phoneNumberId: message.phoneNumberId,
      toPhone: message.fromPhone,
      body: match.response_text,
      accessToken: account.secrets.accessToken,
    });

    await logMessageEvent({
      clientId: account.clientId,
      direction: "outbound",
      fromPhone: message.displayPhone,
      toPhone: message.fromPhone,
      body: match.response_text,
      providerMessageId: sendResult.messageId,
      status: "sent",
      raw: sendResult.raw,
    });

    replied += 1;
  }

  return { processed, replied };
}
