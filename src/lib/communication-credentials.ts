import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret, hashVerifyToken } from "@/lib/crypto/secret-box";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type WhatsAppCredentialSecrets = {
  accessToken: string;
  appSecret: string;
  verifyToken: string;
};

export type WhatsAppCredentialPublic = {
  clientId: string;
  phoneNumberId: string | null;
  displayPhone: string | null;
  wabaId: string | null;
  status: "disconnected" | "connected" | "error";
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  hasVerifyToken: boolean;
};

function mapPublicConnection(
  clientId: string,
  account: {
    phone_number_id?: string | null;
    display_phone?: string | null;
    waba_id?: string | null;
    status?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null,
): WhatsAppCredentialPublic {
  const metadata = account?.metadata ?? {};
  return {
    clientId,
    phoneNumberId: account?.phone_number_id ?? null,
    displayPhone: account?.display_phone ?? null,
    wabaId: account?.waba_id ?? null,
    status:
      account?.status === "connected" || account?.status === "error"
        ? account.status
        : "disconnected",
    hasAccessToken: Boolean(metadata.has_access_token),
    hasAppSecret: Boolean(metadata.has_app_secret),
    hasVerifyToken: Boolean(metadata.has_verify_token),
  };
}

async function loadExistingSecrets(
  supabase: SupabaseClient,
  clientId: string,
): Promise<WhatsAppCredentialSecrets | null> {
  const { data, error } = await supabase
    .from("communication_whatsapp_credentials")
    .select("encrypted_payload")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error || !data?.encrypted_payload) {
    return null;
  }

  try {
    return JSON.parse(decryptSecret(data.encrypted_payload)) as WhatsAppCredentialSecrets;
  } catch {
    return null;
  }
}

export async function saveWhatsAppCredentials(params: {
  supabase: SupabaseClient;
  clientId: string;
  phoneNumberId: string;
  displayPhone?: string | null;
  wabaId?: string | null;
  secrets: Partial<WhatsAppCredentialSecrets>;
}): Promise<WhatsAppCredentialPublic> {
  const phoneNumberId = params.phoneNumberId.trim();
  const existing = await loadExistingSecrets(params.supabase, params.clientId);
  const accessToken = params.secrets.accessToken?.trim() || existing?.accessToken || "";
  const appSecret = params.secrets.appSecret?.trim() || existing?.appSecret || "";
  const verifyToken = params.secrets.verifyToken?.trim() || existing?.verifyToken || "";

  if (!phoneNumberId) {
    throw new Error("WhatsApp phone number id is required.");
  }
  if (!accessToken) {
    throw new Error("Access token is required.");
  }
  if (!appSecret) {
    throw new Error("App secret is required.");
  }
  if (!verifyToken) {
    throw new Error("Verify token is required.");
  }

  const encryptedPayload = encryptSecret(
    JSON.stringify({
      accessToken,
      appSecret,
      verifyToken,
    } satisfies WhatsAppCredentialSecrets),
  );

  const { error: accountError } = await params.supabase.from("communication_provider_accounts").upsert(
    {
      client_id: params.clientId,
      provider: "whatsapp",
      phone_number_id: phoneNumberId,
      display_phone: params.displayPhone?.trim() || null,
      waba_id: params.wabaId?.trim() || null,
      status: "connected",
      metadata: {
        has_access_token: true,
        has_app_secret: true,
        has_verify_token: true,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id,provider" },
  );

  if (accountError) {
    if ((accountError as { code?: string }).code === "23505") {
      throw new Error("This WhatsApp phone number id is already linked to another client.");
    }
    throw accountError;
  }

  const { error: secretError } = await params.supabase.from("communication_whatsapp_credentials").upsert(
    {
      client_id: params.clientId,
      encrypted_payload: encryptedPayload,
      verify_token_hash: hashVerifyToken(verifyToken),
      has_access_token: true,
      has_app_secret: true,
      has_verify_token: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id" },
  );

  if (secretError) {
    if ((secretError as { code?: string }).code === "23505") {
      throw new Error("This verify token is already used by another client.");
    }
    throw secretError;
  }

  return getWhatsAppCredentialPublic(params.supabase, params.clientId);
}

export async function getWhatsAppCredentialPublic(
  supabase: SupabaseClient,
  clientId: string,
): Promise<WhatsAppCredentialPublic> {
  const { data: account, error } = await supabase
    .from("communication_provider_accounts")
    .select("phone_number_id, display_phone, waba_id, status, metadata")
    .eq("client_id", clientId)
    .eq("provider", "whatsapp")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return mapPublicConnection(clientId, account);
}

export async function disconnectWhatsAppCredentials(params: {
  supabase: SupabaseClient;
  clientId: string;
}): Promise<WhatsAppCredentialPublic> {
  const { error: credError } = await params.supabase
    .from("communication_whatsapp_credentials")
    .delete()
    .eq("client_id", params.clientId);

  if (credError) {
    throw credError;
  }

  const { error: accountError } = await params.supabase.from("communication_provider_accounts").upsert(
    {
      client_id: params.clientId,
      provider: "whatsapp",
      status: "disconnected",
      phone_number_id: null,
      display_phone: null,
      waba_id: null,
      metadata: {
        has_access_token: false,
        has_app_secret: false,
        has_verify_token: false,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id,provider" },
  );

  if (accountError) {
    throw accountError;
  }

  return getWhatsAppCredentialPublic(params.supabase, params.clientId);
}

async function decryptClientSecrets(clientId: string): Promise<WhatsAppCredentialSecrets> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("communication_whatsapp_credentials")
    .select("encrypted_payload")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data?.encrypted_payload) {
    throw new Error("WhatsApp credentials are not configured for this client.");
  }

  const parsed = JSON.parse(decryptSecret(data.encrypted_payload)) as WhatsAppCredentialSecrets;
  if (!parsed.accessToken || !parsed.appSecret || !parsed.verifyToken) {
    throw new Error("Stored WhatsApp credentials are incomplete.");
  }
  return parsed;
}

export async function findClientIdByVerifyToken(verifyToken: string): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("communication_whatsapp_credentials")
    .select("client_id")
    .eq("verify_token_hash", hashVerifyToken(verifyToken))
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data?.client_id ? String(data.client_id) : null;
}

export async function getWhatsAppSecretsByPhoneNumberId(phoneNumberId: string): Promise<{
  clientId: string;
  phoneNumberId: string;
  displayPhone: string | null;
  secrets: WhatsAppCredentialSecrets;
} | null> {
  const supabase = getSupabaseAdminClient();
  const { data: account, error } = await supabase
    .from("communication_provider_accounts")
    .select("client_id, phone_number_id, display_phone")
    .eq("provider", "whatsapp")
    .eq("phone_number_id", phoneNumberId)
    .eq("status", "connected")
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!account?.client_id) {
    return null;
  }

  const secrets = await decryptClientSecrets(String(account.client_id));
  return {
    clientId: String(account.client_id),
    phoneNumberId: String(account.phone_number_id),
    displayPhone: account.display_phone ?? null,
    secrets,
  };
}
