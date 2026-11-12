import {
  clampPrintMargins,
  parseMarginMm,
  type PrintMarginKey,
  type PrintMargins,
} from "@/lib/print-settings-types";

export const DOCTOR_PRINT_MODES = ["letterhead", "standard"] as const;
export type DoctorPrintMode = (typeof DOCTOR_PRINT_MODES)[number];

export function isDoctorPrintMode(value: unknown): value is DoctorPrintMode {
  return typeof value === "string" && (DOCTOR_PRINT_MODES as readonly string[]).includes(value);
}

export type DoctorPrintProfileRecord = {
  id: string;
  client_id: string;
  doctor_name: string;
  mode: DoctorPrintMode;
  clinic_name: string | null;
  doctor_display_name: string | null;
  qualification: string | null;
  address: string | null;
  phone: string | null;
  reg_no: string | null;
  gst_no: string | null;
  header_mm: number | null;
  footer_mm: number | null;
  left_mm: number | null;
  right_mm: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type DoctorPrintProfilePayload = {
  doctorName: string;
  mode: DoctorPrintMode;
  clinicName: string;
  doctorDisplayName: string;
  qualification: string;
  address: string;
  phone: string;
  regNo: string;
  gstNo: string;
  headerMm: number | null;
  footerMm: number | null;
  leftMm: number | null;
  rightMm: number | null;
  isDefault: boolean;
};

export type StandardPrintHeader = {
  clinicName: string | null;
  doctorName: string | null;
  qualification: string | null;
  address: string | null;
  phone: string | null;
  regNo: string | null;
  gstNo: string | null;
};

export type ResolvedPrintProfile = {
  mode: DoctorPrintMode;
  margins: PrintMargins;
  header: StandardPrintHeader | null;
  source: "doctor" | "default" | "letterhead";
};

/** Length caps mirror the CHECK constraints on public.doctor_print_profiles. */
export const DOCTOR_PRINT_TEXT_LIMITS = {
  doctorName: 200,
  clinicName: 200,
  doctorDisplayName: 200,
  qualification: 200,
  address: 500,
  phone: 200,
  regNo: 200,
  gstNo: 200,
} as const;

/** Plain paper needs a printable margin; the print page rule removes browser margins. */
export const STANDARD_PRINT_MARGINS: PrintMargins = {
  header_mm: 10,
  footer_mm: 10,
  left_mm: 12,
  right_mm: 12,
};

/** Blank means "use the default" (null); anything else is validated like a normal margin. */
export function parseOptionalMargin(
  key: PrintMarginKey,
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw.trim() === "") {
    return { ok: true, value: null };
  }

  return parseMarginMm(key, raw);
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Picks the print profile for a receipt: the doctor's own profile, else the client's default profile,
 * else the plain letterhead behaviour (unchanged when nothing is configured). A default profile only
 * contributes clinic-level header fields so one doctor's name, qualification or registration number
 * never prints on another doctor's receipt.
 */
export function resolvePrintProfile(input: {
  doctorName: string | null | undefined;
  profiles: DoctorPrintProfileRecord[];
  letterheadMargins: PrintMargins;
}): ResolvedPrintProfile {
  const { doctorName, profiles, letterheadMargins } = input;
  const wanted = normalizeName(doctorName);

  const doctorProfile = wanted ? profiles.find((profile) => normalizeName(profile.doctor_name) === wanted) : undefined;
  const defaultProfile = profiles.find((profile) => profile.is_default);
  const profile = doctorProfile ?? defaultProfile;

  if (!profile) {
    return {
      mode: "letterhead",
      margins: clampPrintMargins(letterheadMargins),
      header: null,
      source: "letterhead",
    };
  }

  const source = doctorProfile ? "doctor" : "default";
  const base = profile.mode === "standard" ? STANDARD_PRINT_MARGINS : letterheadMargins;
  const margins = clampPrintMargins({
    header_mm: profile.header_mm ?? base.header_mm,
    footer_mm: profile.footer_mm ?? base.footer_mm,
    left_mm: profile.left_mm ?? base.left_mm,
    right_mm: profile.right_mm ?? base.right_mm,
  });

  if (profile.mode !== "standard") {
    return { mode: profile.mode, margins, header: null, source };
  }

  const clinicOnly = source === "default";
  const header: StandardPrintHeader = {
    clinicName: blankToNull(profile.clinic_name),
    doctorName: clinicOnly ? null : blankToNull(profile.doctor_display_name) ?? blankToNull(profile.doctor_name),
    qualification: clinicOnly ? null : blankToNull(profile.qualification),
    address: blankToNull(profile.address),
    phone: blankToNull(profile.phone),
    regNo: clinicOnly ? null : blankToNull(profile.reg_no),
    gstNo: blankToNull(profile.gst_no),
  };

  return { mode: "standard", margins, header, source };
}
