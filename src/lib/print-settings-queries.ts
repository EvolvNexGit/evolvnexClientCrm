import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";
import {
  clampPrintMargins,
  type PrintSettingsPayload,
  type PrintSettingsRecord,
} from "@/lib/print-settings-types";

const PRINT_SETTINGS_SELECT = "client_id, header_mm, footer_mm, left_mm, right_mm, created_at, updated_at";

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

function mapPrintSettings(row: Record<string, unknown>): PrintSettingsRecord {
  return {
    client_id: String(row.client_id),
    header_mm: Number(row.header_mm),
    footer_mm: Number(row.footer_mm),
    left_mm: Number(row.left_mm),
    right_mm: Number(row.right_mm),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/** Returns null when the client has not saved settings yet; callers fall back to DEFAULT_PRINT_MARGINS. */
export async function fetchPrintSettings(clientId: string): Promise<PrintSettingsRecord | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("print_settings")
    .select(PRINT_SETTINGS_SELECT)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    raiseQueryError(error, "Unable to load print settings.");
  }

  return data ? mapPrintSettings(data as Record<string, unknown>) : null;
}

export async function savePrintSettings(
  clientId: string,
  payload: PrintSettingsPayload,
): Promise<PrintSettingsRecord> {
  const supabase = getClient();
  const margins = clampPrintMargins({
    header_mm: payload.headerMm,
    footer_mm: payload.footerMm,
    left_mm: payload.leftMm,
    right_mm: payload.rightMm,
  });

  const row = {
    ...margins,
    updated_at: new Date().toISOString(),
    // Tenancy: always the authenticated client id, written last (D-05).
    client_id: clientId,
  };

  const { data, error } = await supabase
    .from("print_settings")
    .upsert(row, { onConflict: "client_id" })
    .select(PRINT_SETTINGS_SELECT)
    .single();

  if (error) {
    raiseQueryError(error, "Unable to save print settings.");
  }

  return mapPrintSettings(data as Record<string, unknown>);
}
