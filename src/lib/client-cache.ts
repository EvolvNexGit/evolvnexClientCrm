import { getSupabaseClient } from "@/lib/supabase";

const clientCache = new Map<string, string | null>();

export async function getClientIdForAuthUser(authUserId: string): Promise<string | null> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }

  if (clientCache.has(authUserId)) {
    return clientCache.get(authUserId) ?? null;
  }

  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("crm_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const clientId = data?.id ?? null;
  clientCache.set(authUserId, clientId);
  return clientId;
}