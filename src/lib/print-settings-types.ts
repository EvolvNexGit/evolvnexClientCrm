export type PrintMargins = {
  header_mm: number;
  footer_mm: number;
  left_mm: number;
  right_mm: number;
};

export type PrintMarginKey = keyof PrintMargins;

export type PrintSettingsRecord = PrintMargins & {
  client_id: string;
  created_at: string;
  updated_at: string;
};

export type PrintSettingsPayload = {
  headerMm: number;
  footerMm: number;
  leftMm: number;
  rightMm: number;
};

export const PRINT_MARGIN_KEYS = ["header_mm", "footer_mm", "left_mm", "right_mm"] as const;

/** Bounds mirror the CHECK constraints on public.print_settings (D-12). */
export const PRINT_MARGIN_LIMITS_MM: Record<PrintMarginKey, { min: number; max: number; label: string }> = {
  header_mm: { min: 0, max: 100, label: "Header" },
  footer_mm: { min: 0, max: 100, label: "Footer" },
  left_mm: { min: 0, max: 50, label: "Left" },
  right_mm: { min: 0, max: 50, label: "Right" },
};

export const DEFAULT_PRINT_MARGINS: PrintMargins = {
  header_mm: 0,
  footer_mm: 0,
  left_mm: 0,
  right_mm: 0,
};

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampMarginValue(key: PrintMarginKey, raw: unknown): number {
  const parsed = typeof raw === "number" || typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  const { min, max } = PRINT_MARGIN_LIMITS_MM[key];
  return roundOneDecimal(Math.min(max, Math.max(min, parsed)));
}

/** Turns any unknown input into four finite numbers inside the bounds; only these numbers may reach CSS. */
export function clampPrintMargins(input: Partial<Record<PrintMarginKey, unknown>> | null | undefined): PrintMargins {
  const source = input ?? {};
  return {
    header_mm: clampMarginValue("header_mm", source.header_mm),
    footer_mm: clampMarginValue("footer_mm", source.footer_mm),
    left_mm: clampMarginValue("left_mm", source.left_mm),
    right_mm: clampMarginValue("right_mm", source.right_mm),
  };
}

export function parseMarginMm(
  key: PrintMarginKey,
  raw: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const { min, max, label } = PRINT_MARGIN_LIMITS_MM[key];
  const rangeError = `${label} must be between ${min} and ${max} mm.`;
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: 0 };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return { ok: false, error: rangeError };
  }

  return { ok: true, value: roundOneDecimal(parsed) };
}

export function parseMarginsForm(
  form: Record<PrintMarginKey, string>,
): { ok: true; margins: PrintMargins } | { ok: false; errors: Partial<Record<PrintMarginKey, string>> } {
  const errors: Partial<Record<PrintMarginKey, string>> = {};
  const margins: PrintMargins = { ...DEFAULT_PRINT_MARGINS };

  for (const key of PRINT_MARGIN_KEYS) {
    const result = parseMarginMm(key, form[key]);
    if (result.ok) {
      margins[key] = result.value;
    } else {
      errors[key] = result.error;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, margins };
}

export function marginsToForm(margins: PrintMargins): Record<PrintMarginKey, string> {
  return {
    header_mm: String(margins.header_mm),
    footer_mm: String(margins.footer_mm),
    left_mm: String(margins.left_mm),
    right_mm: String(margins.right_mm),
  };
}
