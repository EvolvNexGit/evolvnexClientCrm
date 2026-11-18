/**
 * Tenant settings registry (client_settings, one jsonb document per (client_id, namespace)).
 * Deliberately import-free and limited to erasable TypeScript syntax (no enums, namespaces or parameter
 * properties) so Node can load this file directly for assertion checks without a test runner.
 *
 * The database accepts any well-formed namespace; this registry is the allow-list for reads and writes.
 * Readers run parse*: unknown keys dropped, wrong types and out-of-range values fall back to defaults, never throws.
 * Writers run validate*: strict, returns an error message instead of silently coercing.
 * Later waves add their own namespaces here (reminders, packages, calendar_sync); none are stubbed now.
 */

export const DEFAULT_SCHEDULING_TIMEZONE = "Asia/Kolkata";
export const SCHEDULING_TIMEZONE_MAX_LENGTH = 64;

export type SchedulingSettings = {
  timezone: string;
};

export const CLIENT_SETTINGS_NAMESPACES = ["scheduling"] as const;

export type ClientSettingsNamespace = (typeof CLIENT_SETTINGS_NAMESPACES)[number];

export type ClientSettingsMap = {
  scheduling: SchedulingSettings;
};

export const CLIENT_SETTINGS_DEFAULTS: ClientSettingsMap = {
  scheduling: { timezone: DEFAULT_SCHEDULING_TIMEZONE },
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

/** Reader entry point for any registered namespace; never throws. */
export function parseClientSettings<N extends ClientSettingsNamespace>(
  namespace: N,
  raw: unknown,
): ClientSettingsMap[N] {
  switch (namespace) {
    case "scheduling":
      return parseSchedulingSettings(raw) as ClientSettingsMap[N];
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
    default:
      return { ok: false, error: "Unknown settings namespace." };
  }
}
