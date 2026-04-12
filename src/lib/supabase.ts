import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let supabaseClient: SupabaseClient | null = null;

function validateConfig(): string | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return "Missing Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).";
  }
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `NEXT_PUBLIC_SUPABASE_URL must be an http or https URL (got "${parsed.protocol}").`;
    }
  } catch {
    return `NEXT_PUBLIC_SUPABASE_URL is not a valid URL: "${supabaseUrl}".`;
  }
  return null;
}

export function getSupabaseConfigError(): string | null {
  return validateConfig();
}

export function getSupabaseClient(): SupabaseClient | null {
  if (validateConfig() !== null) {
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