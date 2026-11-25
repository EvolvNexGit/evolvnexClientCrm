/**
 * Tenant settings registry (client_settings, one jsonb document per (client_id, namespace)).
 * Deliberately import-free and limited to erasable TypeScript syntax (no enums, namespaces or parameter
 * properties) so Node can load this file directly for assertion checks without a test runner.
 *
 * The database accepts any well-formed namespace; this registry is the allow-list for reads and writes.
 * Readers run parse*: unknown keys dropped, wrong types and out-of-range values fall back to defaults, never throws.
 * Writers run validate*: strict, returns an error message instead of silently coercing.
 * Later waves add their own namespaces here (calendar_sync); none are stubbed now.
 */

export const DEFAULT_SCHEDULING_TIMEZONE = "Asia/Kolkata";
export const SCHEDULING_TIMEZONE_MAX_LENGTH = 64;

export type SchedulingSettings = {
  timezone: string;
};

export const DEFAULT_REMINDER_LEAD_MINUTES = 5;
export const REMINDER_LEAD_MIN_MINUTES = 1;
export const REMINDER_LEAD_MAX_MINUTES = 1440;

export type ReminderSettings = {
  lead_minutes: number;
};

export const PACKAGE_MISSED_DEFAULTS = ["rollover", "forfeit"] as const;
export type PackageMissedDefault = (typeof PACKAGE_MISSED_DEFAULTS)[number];
export const PACKAGE_LABEL_MAX_LENGTH = 30;
export const PACKAGE_ROLLOVER_EXTENSION_MAX_DAYS = 365;

export type PackageLabelSettings = {
  package: string;
  packages: string;
  session: string;
  sessions: string;
};

/**
 * packages namespace (Wave 3). The SQL function public.package_settings_for mirrors the parse rules and defaults of
 * missed_default, rollover_extends_validity_days (R-15) and forfeit_charges_per_visit (R-16); keep both in step.
 * Values that affect credit or money are snapshotted on the session row when used, so changing them never
 * rewrites past packages.
 */
export type PackageSettings = {
  missed_default: PackageMissedDefault;
  /** R-15: days a rollover adds to the package expiry (0 = expiry never moves). Integer 0..365. */
  rollover_extends_validity_days: number;
  /** R-16: whether a forfeited per-visit session is owed. */
  forfeit_charges_per_visit: boolean;
  labels: PackageLabelSettings;
};

const PACKAGE_LABEL_KEYS = ["package", "packages", "session", "sessions"] as const;
const PACKAGE_SETTINGS_KEYS = ["missed_default", "rollover_extends_validity_days", "forfeit_charges_per_visit", "labels"];

export const DEFAULT_PACKAGE_SETTINGS: PackageSettings = {
  missed_default: "rollover",
  rollover_extends_validity_days: 0,
  forfeit_charges_per_visit: true,
  labels: { package: "Package", packages: "Packages", session: "Session", sessions: "Sessions" },
};

export const CLIENT_SETTINGS_NAMESPACES = ["scheduling", "reminders", "packages"] as const;

export type ClientSettingsNamespace = (typeof CLIENT_SETTINGS_NAMESPACES)[number];

export type ClientSettingsMap = {
  scheduling: SchedulingSettings;
  reminders: ReminderSettings;
  packages: PackageSettings;
};

export const CLIENT_SETTINGS_DEFAULTS: ClientSettingsMap = {
  scheduling: { timezone: DEFAULT_SCHEDULING_TIMEZONE },
  reminders: { lead_minutes: DEFAULT_REMINDER_LEAD_MINUTES },
  packages: DEFAULT_PACKAGE_SETTINGS,
};

export type ClientSettingsValidation<T> = { ok: true; value: T } | { ok: false; error: string };

export function isClientSettingsNamespace(value: unknown): value is ClientSettingsNamespace {
  return typeof value === "string" && (CLIENT_SETTINGS_NAMESPACES as readonly string[]).includes(value);
}

/** True when the runtime can construct an Intl.DateTimeFormat for this IANA zone. */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const zone = value.trim();
  if (zone.length === 0 || zone.length > SCHEDULING_TIMEZONE_MAX_LENGTH) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Never throws: null, non-objects, unknown keys and invalid zones all resolve to defaults. */
export function parseSchedulingSettings(raw: unknown): SchedulingSettings {
  const source = isPlainObject(raw) ? raw : {};
  const timezone = isValidTimeZone(source.timezone) ? source.timezone.trim() : DEFAULT_SCHEDULING_TIMEZONE;
  return { timezone };
}

/** Strict: an invalid zone or any unknown key is an error, nothing is coerced. */
export function validateSchedulingSettings(input: unknown): ClientSettingsValidation<SchedulingSettings> {
  if (!isPlainObject(input)) {
    return { ok: false, error: "Scheduling settings must be an object." };
  }

  for (const key of Object.keys(input)) {
    if (key !== "timezone") {
      return { ok: false, error: `Unknown scheduling setting: ${key}.` };
    }
  }

  if (!isValidTimeZone(input.timezone)) {
    return { ok: false, error: "Choose a valid time zone." };
  }

  return { ok: true, value: { timezone: input.timezone.trim() } };
}

/** Never throws: wrong types fall back to the default, numbers are rounded and clamped to 1..1440. */
export function parseReminderSettings(raw: unknown): ReminderSettings {
  const source = isPlainObject(raw) ? raw : {};
  const lead = source.lead_minutes;
  if (typeof lead !== "number" || !Number.isFinite(lead)) {
    return { lead_minutes: DEFAULT_REMINDER_LEAD_MINUTES };
  }

  return {
    lead_minutes: Math.min(REMINDER_LEAD_MAX_MINUTES, Math.max(REMINDER_LEAD_MIN_MINUTES, Math.round(lead))),
  };
}

/** Strict: lead_minutes must be an integer from 1 to 1440 and no other key is accepted. */
export function validateReminderSettings(input: unknown): ClientSettingsValidation<ReminderSettings> {
  if (!isPlainObject(input)) {
    return { ok: false, error: "Reminder settings must be an object." };
  }

  for (const key of Object.keys(input)) {
    if (key !== "lead_minutes") {
      return { ok: false, error: `Unknown reminder setting: ${key}.` };
    }
  }

  const lead = input.lead_minutes;
  if (
    typeof lead !== "number" ||
    !Number.isInteger(lead) ||
    lead < REMINDER_LEAD_MIN_MINUTES ||
    lead > REMINDER_LEAD_MAX_MINUTES
  ) {
    return {
      ok: false,
      error: `Reminder lead time must be a whole number of minutes from ${REMINDER_LEAD_MIN_MINUTES} to ${REMINDER_LEAD_MAX_MINUTES}.`,
    };
  }

  return { ok: true, value: { lead_minutes: lead } };
}

function isPackageLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= PACKAGE_LABEL_MAX_LENGTH;
}

/** Never throws: each key falls back to its default on a wrong type; the extension is rounded and clamped to 0..365. */
export function parsePackageSettings(raw: unknown): PackageSettings {
  const source = isPlainObject(raw) ? raw : {};
  const defaults = DEFAULT_PACKAGE_SETTINGS;

  const missedDefault =
    source.missed_default === "rollover" || source.missed_default === "forfeit"
      ? source.missed_default
      : defaults.missed_default;

  const extension = source.rollover_extends_validity_days;
  const extensionDays =
    typeof extension === "number" && Number.isFinite(extension)
      ? Math.min(PACKAGE_ROLLOVER_EXTENSION_MAX_DAYS, Math.max(0, Math.round(extension)))
      : defaults.rollover_extends_validity_days;

  const charge =
    typeof source.forfeit_charges_per_visit === "boolean"
      ? source.forfeit_charges_per_visit
      : defaults.forfeit_charges_per_visit;

  const rawLabels = isPlainObject(source.labels) ? source.labels : {};
  const labels: PackageLabelSettings = { ...defaults.labels };
  for (const key of PACKAGE_LABEL_KEYS) {
    const value = rawLabels[key];
    if (isPackageLabel(value)) {
      labels[key] = value.trim();
    }
  }

  return {
    missed_default: missedDefault,
    rollover_extends_validity_days: extensionDays,
    forfeit_charges_per_visit: charge,
    labels,
  };
}

/** Strict: every key required, no unknown keys, integer extension 0..365, labels trimmed 1..30 characters. */
export function validatePackageSettings(input: unknown): ClientSettingsValidation<PackageSettings> {
  if (!isPlainObject(input)) {
    return { ok: false, error: "Package settings must be an object." };
  }

  for (const key of Object.keys(input)) {
    if (!PACKAGE_SETTINGS_KEYS.includes(key)) {
      return { ok: false, error: `Unknown package setting: ${key}.` };
    }
  }

  const missedDefault = input.missed_default;
  if (missedDefault !== "rollover" && missedDefault !== "forfeit") {
    return { ok: false, error: "Choose roll over or forfeit as the default for missed sessions." };
  }

  const extension = input.rollover_extends_validity_days;
  if (
    typeof extension !== "number" ||
    !Number.isInteger(extension) ||
    extension < 0 ||
    extension > PACKAGE_ROLLOVER_EXTENSION_MAX_DAYS
  ) {
    return {
      ok: false,
      error: `Expiry extension must be a whole number of days from 0 to ${PACKAGE_ROLLOVER_EXTENSION_MAX_DAYS}.`,
    };
  }

  const charge = input.forfeit_charges_per_visit;
  if (typeof charge !== "boolean") {
    return { ok: false, error: "Choose whether forfeited per-visit sessions are charged." };
  }

  const labelSource = input.labels;
  if (!isPlainObject(labelSource)) {
    return { ok: false, error: "Labels must be an object." };
  }
  for (const key of Object.keys(labelSource)) {
    if (!(PACKAGE_LABEL_KEYS as readonly string[]).includes(key)) {
      return { ok: false, error: `Unknown label: ${key}.` };
    }
  }
  const labels: PackageLabelSettings = { ...DEFAULT_PACKAGE_SETTINGS.labels };
  for (const key of PACKAGE_LABEL_KEYS) {
    const value = labelSource[key];
    if (!isPackageLabel(value)) {
      return { ok: false, error: `Each label must be 1 to ${PACKAGE_LABEL_MAX_LENGTH} characters.` };
    }
    labels[key] = value.trim();
  }

  return {
    ok: true,
    value: {
      missed_default: missedDefault,
      rollover_extends_validity_days: extension,
      forfeit_charges_per_visit: charge,
      labels,
    },
  };
}

/** Reader entry point for any registered namespace; never throws. */
export function parseClientSettings<N extends ClientSettingsNamespace>(
  namespace: N,
  raw: unknown,
): ClientSettingsMap[N] {
  switch (namespace) {
    case "scheduling":
      return parseSchedulingSettings(raw) as ClientSettingsMap[N];
    case "reminders":
      return parseReminderSettings(raw) as ClientSettingsMap[N];
    case "packages":
      return parsePackageSettings(raw) as ClientSettingsMap[N];
    default:
      return CLIENT_SETTINGS_DEFAULTS[namespace];
  }
}

/** Writer entry point for any registered namespace. */
export function validateClientSettings<N extends ClientSettingsNamespace>(
  namespace: N,
  input: unknown,
): ClientSettingsValidation<ClientSettingsMap[N]> {
  switch (namespace) {
    case "scheduling":
      return validateSchedulingSettings(input) as ClientSettingsValidation<ClientSettingsMap[N]>;
    case "reminders":
      return validateReminderSettings(input) as ClientSettingsValidation<ClientSettingsMap[N]>;
    case "packages":
      return validatePackageSettings(input) as ClientSettingsValidation<ClientSettingsMap[N]>;
    default:
      return { ok: false, error: "Unknown settings namespace." };
  }
}
