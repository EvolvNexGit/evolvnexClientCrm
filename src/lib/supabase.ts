import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const rawSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

let supabaseClient: SupabaseClient | null = null;
let configError: string | null = null;

function normalizeSupabaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function validateSupabaseConfig(): { url: string; anonKey: string } | null {
  if (!rawSupabaseUrl || !rawSupabaseAnonKey) {
    configError =
      "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.";
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawSupabaseUrl);
  } catch {
    configError = "NEXT_PUBLIC_SUPABASE_URL is not a valid URL.";
    return null;
  }

  const isLocalDev = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";

  if (!isLocalDev && parsedUrl.protocol !== "https:") {
    configError = "NEXT_PUBLIC_SUPABASE_URL must use https://.";
    return null;
  }

  if (!isLocalDev && !parsedUrl.hostname.endsWith(".supabase.co")) {
    configError = "NEXT_PUBLIC_SUPABASE_URL should point to your *.supabase.co project URL.";
    return null;
  }

  configError = null;
  return {
    url: normalizeSupabaseUrl(rawSupabaseUrl),
    anonKey: rawSupabaseAnonKey,
  };
}

export function getSupabaseConfigError() {
  if (!configError && !supabaseClient) {
    validateSupabaseConfig();
  }
  return configError;
}

export function isNetworkAuthError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return true;
  }

  if (error instanceof Error) {
    return /failed to fetch|networkerror|network request failed|load failed/i.test(error.message);
  }

  return false;
}

export function formatAuthErrorMessage(error: unknown): string {
  if (isNetworkAuthError(error)) {
    return "Cannot reach Supabase. Check your internet connection, verify NEXT_PUBLIC_SUPABASE_URL in .env.local, and ensure the Supabase project is not paused.";
  }

  return formatSupabaseError(error, "Unable to complete authentication.");
}

export function formatSupabaseError(error: unknown, fallback = "An unexpected error occurred."): string {
  if (isNetworkAuthError(error)) {
    return "Cannot reach Supabase. Check your internet connection and verify NEXT_PUBLIC_SUPABASE_URL.";
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message.trim() : "";
    const details = typeof record.details === "string" ? record.details.trim() : "";
    const hint = typeof record.hint === "string" ? record.hint.trim() : "";
    const code = typeof record.code === "string" ? record.code.trim() : "";
    const parts = [message, details, hint].filter(Boolean);

    if (parts.length > 0) {
      return code ? `${parts.join(" ")} (${code})` : parts.join(" ");
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function getSupabaseClient() {
  const config = validateSupabaseConfig();
  if (!config) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabaseClient;
}

/** Clears a broken local session without requiring network access. */
export async function clearLocalSupabaseSession() {
  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Ignore — local storage may already be empty.
  }
}
