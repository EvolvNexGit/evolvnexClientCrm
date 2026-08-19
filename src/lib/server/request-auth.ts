import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export async function getAuthenticatedRequestClient(authorizationHeader: string | null): Promise<{
  userId: string;
  clientId: string;
  supabase: SupabaseClient;
}> {
  const token = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    throw new Error("Missing access token.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user?.id) {
    throw new Error("Invalid or expired session.");
  }

  const { data: clientRow, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("crm_user_id", user.id)
    .maybeSingle();

  if (clientError) {
    throw clientError;
  }

  if (!clientRow?.id) {
    throw new Error("No client is linked to this account.");
  }

  return { userId: user.id, clientId: String(clientRow.id), supabase };
}
