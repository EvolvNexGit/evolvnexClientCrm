import { getConfigError, getSupabaseClient } from "@/lib/supabase";

export type AppointmentRow = {
  id: string;
  title: string | null;
  scheduled_at: string | null;
};

export async function getAppointmentsByClientId(clientId: string) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error(getConfigError() ?? "Missing Supabase environment variables.");
  }

  const { data, error } = await supabase
    .from("appointments")
    .select("id, title, scheduled_at")
    .eq("client_id", clientId)
    .order("scheduled_at", { ascending: true })
    .limit(25);

  if (error) {
    throw error;
  }

  return (data ?? []) as AppointmentRow[];
}