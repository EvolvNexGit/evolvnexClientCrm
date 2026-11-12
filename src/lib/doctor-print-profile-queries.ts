import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";
import {
  DOCTOR_PRINT_TEXT_LIMITS,
  isDoctorPrintMode,
  type DoctorPrintProfilePayload,
  type DoctorPrintProfileRecord,
} from "@/lib/doctor-print-profile-types";
import { clampPrintMargins, type PrintMarginKey } from "@/lib/print-settings-types";

const DOCTOR_PRINT_PROFILE_SELECT =
  "id, client_id, doctor_name, mode, clinic_name, doctor_display_name, qualification, address, phone, reg_no, gst_no, header_mm, footer_mm, left_mm, right_mm, is_default, created_at, updated_at";

const DOCTOR_PRINT_PROFILE_MAX_ROWS = 300;

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

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapDoctorPrintProfile(row: Record<string, unknown>): DoctorPrintProfileRecord {
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    doctor_name: String(row.doctor_name ?? ""),
    mode: isDoctorPrintMode(row.mode) ? row.mode : "letterhead",
    clinic_name: nullableText(row.clinic_name),
    doctor_display_name: nullableText(row.doctor_display_name),
    qualification: nullableText(row.qualification),
    address: nullableText(row.address),
    phone: nullableText(row.phone),
    reg_no: nullableText(row.reg_no),
    gst_no: nullableText(row.gst_no),
    header_mm: nullableNumber(row.header_mm),
    footer_mm: nullableNumber(row.footer_mm),
    left_mm: nullableNumber(row.left_mm),
    right_mm: nullableNumber(row.right_mm),
    is_default: row.is_default === true,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function cleanText(value: string, max: number, label: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new Error(`${label} must be ${max} characters or fewer.`);
  }

  return trimmed === "" ? null : trimmed;
}

function clampOptionalMargin(key: PrintMarginKey, value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return clampPrintMargins({ [key]: value })[key];
}

export async function fetchDoctorPrintProfiles(clientId: string): Promise<DoctorPrintProfileRecord[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("doctor_print_profiles")
    .select(DOCTOR_PRINT_PROFILE_SELECT)
    .eq("client_id", clientId)
    .order("doctor_name", { ascending: true })
    .range(0, DOCTOR_PRINT_PROFILE_MAX_ROWS - 1);

  if (error) {
    raiseQueryError(error, "Unable to load doctor print profiles.");
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapDoctorPrintProfile);
}

export async function saveDoctorPrintProfile(
  clientId: string,
  payload: DoctorPrintProfilePayload,
): Promise<DoctorPrintProfileRecord> {
  const supabase = getClient();
  const doctorName = payload.doctorName.trim();
  if (doctorName === "") {
    throw new Error("Choose a doctor before saving a profile.");
  }
  if (doctorName.length > DOCTOR_PRINT_TEXT_LIMITS.doctorName) {
    throw new Error(`Doctor name must be ${DOCTOR_PRINT_TEXT_LIMITS.doctorName} characters or fewer.`);
  }
  if (!isDoctorPrintMode(payload.mode)) {
    throw new Error("Choose a valid print template.");
  }

  const row = {
    doctor_name: doctorName,
    mode: payload.mode,
    clinic_name: cleanText(payload.clinicName, DOCTOR_PRINT_TEXT_LIMITS.clinicName, "Clinic name"),
    doctor_display_name: cleanText(
      payload.doctorDisplayName,
      DOCTOR_PRINT_TEXT_LIMITS.doctorDisplayName,
      "Doctor name on receipt",
    ),
    qualification: cleanText(payload.qualification, DOCTOR_PRINT_TEXT_LIMITS.qualification, "Qualification"),
    address: cleanText(payload.address, DOCTOR_PRINT_TEXT_LIMITS.address, "Address"),
    phone: cleanText(payload.phone, DOCTOR_PRINT_TEXT_LIMITS.phone, "Phone"),
    reg_no: cleanText(payload.regNo, DOCTOR_PRINT_TEXT_LIMITS.regNo, "Registration no."),
    gst_no: cleanText(payload.gstNo, DOCTOR_PRINT_TEXT_LIMITS.gstNo, "GST no."),
    header_mm: clampOptionalMargin("header_mm", payload.headerMm),
    footer_mm: clampOptionalMargin("footer_mm", payload.footerMm),
    left_mm: clampOptionalMargin("left_mm", payload.leftMm),
    right_mm: clampOptionalMargin("right_mm", payload.rightMm),
    is_default: payload.isDefault,
    updated_at: new Date().toISOString(),
    // Tenancy: always the authenticated client id, written last.
    client_id: clientId,
  };

  if (payload.isDefault) {
    const { error: clearError } = await supabase
      .from("doctor_print_profiles")
      .update({ is_default: false })
      .eq("client_id", clientId)
      .eq("is_default", true)
      .neq("doctor_name", doctorName);

    if (clearError) {
      raiseQueryError(clearError, "Unable to save doctor print profile.");
    }
  }

  const { data, error } = await supabase
    .from("doctor_print_profiles")
    .upsert(row, { onConflict: "client_id,doctor_name" })
    .select(DOCTOR_PRINT_PROFILE_SELECT)
    .single();

  if (error) {
    raiseQueryError(error, "Unable to save doctor print profile.");
  }

  return mapDoctorPrintProfile(data as Record<string, unknown>);
}

export async function deleteDoctorPrintProfile(clientId: string, profileId: string): Promise<void> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("doctor_print_profiles")
    .delete()
    .eq("client_id", clientId)
    .eq("id", profileId)
    .select("id");

  if (error) {
    raiseQueryError(error, "Unable to remove doctor print profile.");
  }

  if (!data || data.length === 0) {
    throw new Error("Profile not found.");
  }
}
