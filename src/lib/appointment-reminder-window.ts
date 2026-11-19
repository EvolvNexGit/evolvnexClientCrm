/**
 * Pure reminder-window math: "now" in the clinic time zone, how many days ahead to look, and which
 * appointments are due. Deliberately import-free and limited to erasable TypeScript syntax (no enums,
 * namespaces or parameter properties) so Node can load this file directly for assertion checks.
 * Clock parsing is copied in minimal form from appointment-schedule.ts to keep this module import-free.
 */

const MINUTES_PER_DAY = 1440;
const FALLBACK_TIME_ZONE = "Asia/Kolkata";
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

export type ZonedNow = {
  /** Local calendar date in the zone, YYYY-MM-DD. */
  date: string;
  /** Minutes after local midnight in the zone. */
  minutes: number;
};

export type ReminderInputRow = {
  id: string;
  name: string;
  service: string;
  /** Appointment date, YYYY-MM-DD (clinic wall clock). */
  date: string | null;
  /** Start time as "HH:MM" wall clock in the clinic zone. */
  timeLabel: string;
  status: string | null;
};

export type AppointmentReminder = {
  id: string;
  name: string;
  service: string;
  /** Appointment date; part of the fired key so a multi-day look-ahead never refires on the next day. */
  date: string;
  /** Whole days after the clinic's today: 0 today, 1 tomorrow. */
  dayOffset: number;
  timeLabel: string;
  /** Minutes from now, including whole days; 1380 means 23 hours away. */
  minutesUntil: number;
  dueSoon: boolean;
};

function toUtcMidnight(date: string): number | null {
  const match = date.match(ISO_DATE_PATTERN);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }

  return parsed.getTime();
}

/** Calendar date plus whole days (YYYY-MM-DD in, YYYY-MM-DD out); invalid input is returned unchanged. */
export function shiftIsoDate(date: string, days: number): string {
  const base = toUtcMidnight(date);
  if (base === null) {
    return date;
  }

  return new Date(base + days * MINUTES_PER_DAY * 60_000).toISOString().slice(0, 10);
}

function clockToMinutes(value: string): number | null {
  const match = value.trim().match(CLOCK_PATTERN);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function readZonedParts(instant: Date, timeZone: string): ZonedNow | null {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hours = Number(get("hour"));
  const minutes = Number(get("minute"));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    // Some engines print midnight as 24 even with h23; fold it back into the same day.
    minutes: (hours % 24) * 60 + minutes,
  };
}

/** Local date and minutes after midnight for an instant in an IANA zone. An unusable zone falls back to Asia/Kolkata. */
export function zonedNow(instant: Date, timeZone: string): ZonedNow {
  try {
    const zoned = readZonedParts(instant, timeZone);
    if (zoned) {
      return zoned;
    }
  } catch {
    // Invalid zone: fall through to the default.
  }

  const fallback = readZonedParts(instant, FALLBACK_TIME_ZONE);
  return fallback ?? { date: instant.toISOString().slice(0, 10), minutes: 0 };
}

/**
 * Extra days after today to fetch so every appointment inside the lead window is seen.
 * Lead 5 -> 0, 1440 -> 1, 1500 -> 2. With nowMinutes, a short lead near midnight (23:58 plus 5 minutes)
 * also reaches into tomorrow.
 */
export function getReminderHorizonDays(leadMinutes: number, nowMinutes = 0): number {
  if (!Number.isFinite(leadMinutes) || leadMinutes <= 0) {
    return 0;
  }

  const wholeDays = leadMinutes < MINUTES_PER_DAY ? 0 : Math.ceil(leadMinutes / MINUTES_PER_DAY);
  const crossesMidnight = Math.floor((Math.max(0, nowMinutes) + leadMinutes) / MINUTES_PER_DAY);
  return Math.max(wholeDays, crossesMidnight);
}

/**
 * Upcoming appointments sorted soonest first. Cancelled and completed rows, rows with an unusable date or
 * time, and starts already in the past are skipped. dueSoon is minutesUntil > 0 and <= leadMinutes.
 */
export function computeReminders(input: {
  nowDate: string;
  nowMinutes: number;
  rows: ReminderInputRow[];
  leadMinutes: number;
}): AppointmentReminder[] {
  const todayMs = toUtcMidnight(input.nowDate);
  if (todayMs === null) {
    return [];
  }

  const reminders: AppointmentReminder[] = [];
  for (const row of input.rows) {
    if (!row.date || row.status === "cancelled" || row.status === "completed") {
      continue;
    }

    const rowMs = toUtcMidnight(row.date);
    const startMinutes = clockToMinutes(row.timeLabel);
    if (rowMs === null || startMinutes === null) {
      continue;
    }

    const dayOffset = Math.round((rowMs - todayMs) / (MINUTES_PER_DAY * 60_000));
    const minutesUntil = dayOffset * MINUTES_PER_DAY + startMinutes - input.nowMinutes;
    if (minutesUntil < 0) {
      continue;
    }

    reminders.push({
      id: row.id,
      name: row.name,
      service: row.service,
      date: row.date,
      dayOffset,
      timeLabel: row.timeLabel,
      minutesUntil,
      dueSoon: minutesUntil > 0 && minutesUntil <= input.leadMinutes,
    });
  }

  reminders.sort((left, right) => left.minutesUntil - right.minutesUntil);
  return reminders;
}

/** "15 minutes", "1 hour", "1 day"; values that do not divide evenly stay in minutes. */
export function formatLeadLabel(minutes: number): string {
  const safe = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
  const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

  if (safe > 0 && safe % MINUTES_PER_DAY === 0) {
    return plural(safe / MINUTES_PER_DAY, "day");
  }

  if (safe > 0 && safe % 60 === 0) {
    return plural(safe / 60, "hour");
  }

  return plural(safe, "minute");
}

/** "in 12 min", "in 2 h 5 min" waits for the bell; "Starting now" at zero. */
export function describeWait(minutesUntil: number): string {
  if (minutesUntil <= 0) {
    return "Starting now";
  }

  if (minutesUntil < 60) {
    return `in ${minutesUntil} min`;
  }

  const hours = Math.floor(minutesUntil / 60);
  const rest = minutesUntil % 60;
  return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`;
}
