import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let supabaseClient: SupabaseClient | null = null;

function resolveConfigError(): string | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return "Missing Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY).";
  }

  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `Invalid NEXT_PUBLIC_SUPABASE_URL: URL must use http or https (got "${parsed.protocol}").`;
    }
  } catch {
    return `Invalid NEXT_PUBLIC_SUPABASE_URL: "${supabaseUrl}" is not a valid URL.`;
  }

  return null;
}

const _configError = resolveConfigError();

export function getConfigError(): string | null {
  return _configError;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (_configError !== null) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabaseClient;
}