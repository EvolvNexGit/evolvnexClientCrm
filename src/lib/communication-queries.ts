import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";
import {
  DEFAULT_AUTO_REPLY_RESPONSE,
  DEFAULT_AUTO_REPLY_TRIGGER,
  normalizeTriggerText,
  type CommunicationAutoReply,
  type CommunicationAutoReplyPayload,
  type CommunicationMessageEvent,
  type WhatsAppConnectionPublic,
} from "@/lib/communication-types";

function getClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }
  return supabase;
}

function raise(error: unknown, fallback: string): never {
  throw new Error(formatSupabaseError(error, fallback));
}

function mapAutoReply(row: Record<string, unknown>): CommunicationAutoReply {
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    trigger_text: String(row.trigger_text ?? ""),
    response_text: String(row.response_text ?? ""),
    match_mode: row.match_mode === "contains" ? "contains" : "exact",
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function fetchAutoReplies(clientId: string): Promise<CommunicationAutoReply[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("communication_auto_replies")
    .select("*")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    raise(error, "Unable to load auto-replies.");
  }

  return (data ?? []).map((row) => mapAutoReply(row as Record<string, unknown>));
}

export async function ensureDefaultAutoReplies(clientId: string): Promise<CommunicationAutoReply[]> {
  const existing = await fetchAutoReplies(clientId);
  if (existing.length > 0) {
    return existing;
  }

  await createAutoReply(clientId, {
    triggerText: DEFAULT_AUTO_REPLY_TRIGGER,
    responseText: DEFAULT_AUTO_REPLY_RESPONSE,
    matchMode: "exact",
    isActive: true,
    sortOrder: 0,
  });

  return fetchAutoReplies(clientId);
}

export async function createAutoReply(
  clientId: string,
  payload: CommunicationAutoReplyPayload,
): Promise<void> {
  const supabase = getClient();
  const trigger = normalizeTriggerText(payload.triggerText);
  const response = payload.responseText.trim();

  if (!trigger) {
    throw new Error("Trigger text is required.");
  }
  if (!response) {
    throw new Error("Response text is required.");
  }

  const { error } = await supabase.from("communication_auto_replies").insert({
    client_id: clientId,
    trigger_text: trigger,
    response_text: response,
    match_mode: payload.matchMode,
    is_active: payload.isActive,
    sort_order: payload.sortOrder ?? 0,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    raise(error, "Unable to create auto-reply.");
  }
}

export async function updateAutoReply(
  clientId: string,
  replyId: string,
  payload: CommunicationAutoReplyPayload,
): Promise<void> {
  const supabase = getClient();
  const trigger = normalizeTriggerText(payload.triggerText);
  const response = payload.responseText.trim();

  if (!trigger) {
    throw new Error("Trigger text is required.");
  }
  if (!response) {
    throw new Error("Response text is required.");
  }

  const { error } = await supabase
    .from("communication_auto_replies")
    .update({
      trigger_text: trigger,
      response_text: response,
      match_mode: payload.matchMode,
      is_active: payload.isActive,
      sort_order: payload.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", clientId)
    .eq("id", replyId);

  if (error) {
    raise(error, "Unable to update auto-reply.");
  }
}

export async function deleteAutoReply(clientId: string, replyId: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("communication_auto_replies")
    .delete()
    .eq("client_id", clientId)
    .eq("id", replyId);

  if (error) {
    raise(error, "Unable to delete auto-reply.");
  }
}

export async function fetchRecentMessageEvents(
  clientId: string,
  limit = 20,
): Promise<CommunicationMessageEvent[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("communication_message_events")
    .select("id, client_id, provider, direction, from_phone, to_phone, body, provider_message_id, status, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    raise(error, "Unable to load message events.");
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    client_id: String(row.client_id),
    provider: String(row.provider ?? "whatsapp"),
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    from_phone: row.from_phone ?? null,
    to_phone: row.to_phone ?? null,
    body: row.body ?? null,
    provider_message_id: row.provider_message_id ?? null,
    status: row.status ?? null,
    created_at: String(row.created_at ?? ""),
  }));
}

export async function fetchWhatsAppConnection(clientId: string): Promise<WhatsAppConnectionPublic> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("communication_provider_accounts")
    .select("phone_number_id, display_phone, waba_id, status, metadata")
    .eq("client_id", clientId)
    .eq("provider", "whatsapp")
    .maybeSingle();

  if (error) {
    raise(error, "Unable to load WhatsApp connection.");
  }

  const metadata =
    data?.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : {};

  return {
    clientId,
    phoneNumberId: data?.phone_number_id ?? null,
    displayPhone: data?.display_phone ?? null,
    wabaId: data?.waba_id ?? null,
    status:
      data?.status === "connected" || data?.status === "error" ? data.status : "disconnected",
    hasAccessToken: Boolean(metadata.has_access_token),
    hasAppSecret: Boolean(metadata.has_app_secret),
    hasVerifyToken: Boolean(metadata.has_verify_token),
  };
}

