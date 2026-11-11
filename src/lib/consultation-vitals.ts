// Dependency-free on purpose: no imports and only erasable TypeScript, so a plain node smoke test can load it.

export const VITAL_KEYS = ["bp", "pulse", "temperature", "weight", "spo2"] as const;
export type VitalKey = (typeof VITAL_KEYS)[number];

export type ConsultationVitals = {
  bp?: string;
  pulse?: number;
  temperature?: number;
  weight?: number;
  spo2?: number;
};

export type VitalsFormInput = Record<VitalKey, string>;

export const EMPTY_VITALS_FORM: VitalsFormInput = {
  bp: "",
  pulse: "",
  temperature: "",
  weight: "",
  spo2: "",
};

export const VITAL_FIELDS: ReadonlyArray<{
  key: VitalKey;
  label: string;
  unit: string;
  placeholder: string;
}> = [
  { key: "bp", label: "BP", unit: "mmHg", placeholder: "120/80" },
  { key: "pulse", label: "Pulse", unit: "bpm", placeholder: "72" },
  { key: "temperature", label: "Temperature", unit: "°C", placeholder: "36.8" },
  { key: "weight", label: "Weight", unit: "kg", placeholder: "68" },
  { key: "spo2", label: "SpO2", unit: "%", placeholder: "98" },
];

type NumericVitalKey = Exclude<VitalKey, "bp">;

export const VITAL_RANGES: Record<NumericVitalKey, { min: number; max: number }> = {
  pulse: { min: 20, max: 300 },
  temperature: { min: 30, max: 45 },
  weight: { min: 0.5, max: 500 },
  spo2: { min: 50, max: 100 },
};

const BP_PATTERN = /^\d{2,3}\/\d{2,3}$/;

const NUMERIC_KEYS: ReadonlyArray<NumericVitalKey> = ["pulse", "temperature", "weight", "spo2"];

const NUMERIC_LABELS: Record<NumericVitalKey, string> = {
  pulse: "Pulse",
  temperature: "Temperature",
  weight: "Weight",
  spo2: "SpO2",
};

const NUMERIC_UNITS: Record<NumericVitalKey, string> = {
  pulse: " bpm",
  temperature: " °C (enter degrees Celsius)",
  weight: " kg",
  spo2: " %",
};

/** Read side for untrusted jsonb: keeps only known keys with the right JS type. */
export function parseVitals(raw: unknown): ConsultationVitals | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const vitals: ConsultationVitals = {};
  let kept = 0;

  if (typeof source.bp === "string" && BP_PATTERN.test(source.bp.trim())) {
    vitals.bp = source.bp.trim();
    kept += 1;
  }

  for (const key of NUMERIC_KEYS) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      vitals[key] = value;
      kept += 1;
    }
  }

  return kept > 0 ? vitals : null;
}

export function vitalsToForm(vitals: ConsultationVitals | null | undefined): VitalsFormInput {
  return {
    bp: vitals?.bp ?? "",
    pulse: vitals?.pulse === undefined ? "" : String(vitals.pulse),
    temperature: vitals?.temperature === undefined ? "" : String(vitals.temperature),
    weight: vitals?.weight === undefined ? "" : String(vitals.weight),
    spo2: vitals?.spo2 === undefined ? "" : String(vitals.spo2),
  };
}

export function normalizeVitals(
  form: VitalsFormInput,
): { ok: true; vitals: ConsultationVitals | null } | { ok: false; error: string } {
  const vitals: ConsultationVitals = {};
  let filled = 0;

  const bp = form.bp.trim();
  if (bp) {
    if (!BP_PATTERN.test(bp)) {
      return { ok: false, error: "BP must look like 120/80." };
    }
    vitals.bp = bp;
    filled += 1;
  }

  for (const key of NUMERIC_KEYS) {
    const text = form[key].trim();
    if (!text) {
      continue;
    }

    const { min, max } = VITAL_RANGES[key];
    const value = Number(text);
    if (!Number.isFinite(value) || value < min || value > max) {
      return {
        ok: false,
        error: `${NUMERIC_LABELS[key]} must be between ${min} and ${max}${NUMERIC_UNITS[key]}.`,
      };
    }
    vitals[key] = value;
    filled += 1;
  }

  return { ok: true, vitals: filled > 0 ? vitals : null };
}
