import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";
import {
  isClientSettingsNamespace,
  parseClientSettings,
  validateClientSettings,
  type ClientSettingsMap,
  type ClientSettingsNamespace,
} from "@/lib/client-settings-types";

function getClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }

  return supabase;
}

function raiseQueryError(error: unknown, fallback: string): never {
  throw new Error(formatSupabaseError(error, fallback));
}

function assertNamespace(namespace: string): asserts namespace is ClientSettingsNamespace {
  if (!isClientSettingsNamespace(namespace)) {
    throw new Error(`Unknown settings namespace: ${namespace}.`);
  }
}

/** A missing row resolves to the namespace defaults; stored values always go through the registry parser. */
export async function fetchClientSettings<N extends ClientSettingsNamespace>(
  clientId: string,
  namespace: N,
): Promise<ClientSettingsMap[N]> {
  assertNamespace(namespace);
  const supabase = getClient();
  const { data, error } = await supabase
    .from("client_settings")
    .select("settings")
    .eq("client_id", clientId)
    .eq("namespace", namespace)
    .maybeSingle();

  if (error) {
    raiseQueryError(error, "Unable to load settings.");
  }

  return parseClientSettings(namespace, (data as { settings?: unknown } | null)?.settings ?? null);
}

/** Strict validation first, then upsert on (client_id, namespace); client_id is written last so input cannot override it. */
export async function saveClientSettings<N extends ClientSettingsNamespace>(
  clientId: string,
  namespace: N,
  value: ClientSettingsMap[N],
): Promise<ClientSettingsMap[N]> {
  assertNamespace(namespace);
  const validation = validateClientSettings(namespace, value);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const supabase = getClient();
  const { error } = await supabase
    .from("client_settings")
    .upsert({ namespace, settings: validation.value, client_id: clientId }, { onConflict: "client_id,namespace" });

  if (error) {
    raiseQueryError(error, "Unable to save settings.");
  }

  return validation.value;
}
