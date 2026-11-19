/**
 * Tenant settings registry (client_settings, one jsonb document per (client_id, namespace)).
 * Deliberately import-free and limited to erasable TypeScript syntax (no enums, namespaces or parameter
 * properties) so Node can load this file directly for assertion checks without a test runner.
 *
 * The database accepts any well-formed namespace; this registry is the allow-list for reads and writes.
 * Readers run parse*: unknown keys dropped, wrong types and out-of-range values fall back to defaults, never throws.
 * Writers run validate*: strict, returns an error message instead of silently coercing.
 * Later waves add their own namespaces here (packages, calendar_sync); none are stubbed now.
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

export const CLIENT_SETTINGS_NAMESPACES = ["scheduling", "reminders"] as const;

export type ClientSettingsNamespace = (typeof CLIENT_SETTINGS_NAMESPACES)[number];

export type ClientSettingsMap = {
  scheduling: SchedulingSettings;
  reminders: ReminderSettings;
};

export const CLIENT_SETTINGS_DEFAULTS: ClientSettingsMap = {
  scheduling: { timezone: DEFAULT_SCHEDULING_TIMEZONE },
  reminders: { lead_minutes: DEFAULT_REMINDER_LEAD_MINUTES },
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
    default:
      return { ok: false, error: "Unknown settings namespace." };
  }
}
