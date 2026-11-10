/**
 * Pure scheduling helpers for the appointments calendar.
 * Deliberately import-free and limited to erasable TypeScript syntax (no enums, namespaces or
 * parameter properties) so Node can load this file directly for assertion checks without a test runner.
 */

export const TIME_STEP_MINUTES = 10;
export const TIME_STEP_SECONDS = TIME_STEP_MINUTES * 60;
export const DEFAULT_APPOINTMENT_MINUTES = 30;
export const CALENDAR_START_HOUR = 8;
export const CALENDAR_END_HOUR = 20;
export const CALENDAR_SLOT_HEIGHT_PX = 24;
export const UNASSIGNED_COLUMN_KEY = "__unassigned__";
export const UNASSIGNED_COLUMN_LABEL = "Unassigned";

/** Mirrors the Asia/Kolkata display used by time-utils. */
const IST_OFFSET_MINUTES = 330;
const MINUTES_PER_DAY = 1440;

export type ScheduleAppointment = {
  id: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  staff_name: string | null;
  status: string | null;
};

export type AppointmentInterval = { start: number; end: number };

/** Rounds an "HH:MM" value down to the slot grid so typed times stay on 10-minute marks. */
export function snapTimeToStep(value: string): string {
  const match = value.match(/^(\d{2}):(\d{2})/);
  if (!match) {
    return value;
  }
  const minutes = Math.floor(Number(match[2]) / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  return `${match[1]}:${String(minutes).padStart(2, "0")}`;
}

const TIME_ONLY_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

function parseZoneOffsetMinutes(zone: string | undefined): number {
  if (!zone || zone.toUpperCase() === "Z") {
    return 0;
  }
  const match = zone.match(/^([+-])(\d{2}):?(\d{2})?$/);
  if (!match) {
    return 0;
  }
  const total = Number(match[2]) * 60 + Number(match[3] ?? "0");
  return match[1] === "-" ? -total : total;
}

/**
 * Minutes after midnight for a stored appointment time. Time-only values (HH:MM, HH:MM:SS) are read as
 * wall-clock (the value the edit form shows); ISO timestamps are converted to IST. Unparseable input is null.
 */
export function clockToMinutes(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const input = value.trim();

  const timeOnly = input.match(TIME_ONLY_PATTERN);
  if (timeOnly) {
    const hours = Number(timeOnly[1]);
    const minutes = Number(timeOnly[2]);
    if (hours > 23 || minutes > 59) {
      return null;
    }
    return hours * 60 + minutes;
  }

  const iso = input.match(ISO_TIMESTAMP_PATTERN);
  if (iso) {
    const hours = Number(iso[1]);
    const minutes = Number(iso[2]);
    if (hours > 23 || minutes > 59) {
      return null;
    }
    const utcMinutes = hours * 60 + minutes - parseZoneOffsetMinutes(iso[4]);
    const istMinutes = utcMinutes + IST_OFFSET_MINUTES;
    return ((istMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  }

  return null;
}

export function minutesToClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Null when start is missing or unparseable; a missing or non-increasing end becomes one time step. */
export function getAppointmentInterval(a: {
  start_time: string | null;
  end_time: string | null;
}): AppointmentInterval | null {
  const start = clockToMinutes(a.start_time);
  if (start === null) {
    return null;
  }
  const parsedEnd = clockToMinutes(a.end_time);
  const end = parsedEnd !== null && parsedEnd > start ? parsedEnd : start + TIME_STEP_MINUTES;
  return { start, end: Math.min(end, MINUTES_PER_DAY) };
}

/** Default hours, widened to whole hours so no appointment is clipped or hidden. */
export function getVisibleRange(intervals: AppointmentInterval[]): { startMinutes: number; endMinutes: number } {
  let startMinutes = CALENDAR_START_HOUR * 60;
  let endMinutes = CALENDAR_END_HOUR * 60;

  for (const interval of intervals) {
    startMinutes = Math.min(startMinutes, Math.floor(interval.start / 60) * 60);
    endMinutes = Math.max(endMinutes, Math.ceil(interval.end / 60) * 60);
  }

  return {
    startMinutes: Math.max(0, startMinutes),
    endMinutes: Math.min(MINUTES_PER_DAY, endMinutes),
  };
}

export function buildSlotStarts(range: { startMinutes: number; endMinutes: number }): number[] {
  const slots: number[] = [];
  for (let minutes = range.startMinutes; minutes < range.endMinutes; minutes += TIME_STEP_MINUTES) {
    slots.push(minutes);
  }
  return slots;
}

export type StaffColumn = { key: string; label: string; staffName: string | null };

/** Distinct staff names (options plus appointments) sorted, then Unassigned when needed or when no staff exists. */
export function buildStaffColumns(
  staffOptions: string[],
  appointments: { staff_name: string | null }[],
): StaffColumn[] {
  const names = new Set<string>();
  let hasUnassigned = false;

  for (const option of staffOptions) {
    const name = option.trim();
    if (name) {
      names.add(name);
    }
  }
  for (const appointment of appointments) {
    const name = (appointment.staff_name ?? "").trim();
    if (name) {
      names.add(name);
    } else {
      hasUnassigned = true;
    }
  }

  const columns: StaffColumn[] = Array.from(names)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({ key: name, label: name, staffName: name }));

  if (hasUnassigned || columns.length === 0) {
    columns.push({ key: UNASSIGNED_COLUMN_KEY, label: UNASSIGNED_COLUMN_LABEL, staffName: null });
  }

  return columns;
}

export function splitScheduled<T extends ScheduleAppointment>(
  appointments: T[],
): { scheduled: T[]; unscheduled: T[] } {
  const scheduled: T[] = [];
  const unscheduled: T[] = [];
  for (const appointment of appointments) {
    if (getAppointmentInterval(appointment)) {
      scheduled.push(appointment);
    } else {
      unscheduled.push(appointment);
    }
  }
  return { scheduled, unscheduled };
}

export type LaidOutAppointment<T> = {
  item: T;
  interval: AppointmentInterval;
  lane: number;
  laneCount: number;
};

/**
 * Side-by-side lanes for one column. Sorted by start, end, id so input order never matters.
 * Intervals are half-open: an item starting exactly when another ends reuses its lane.
 */
export function layoutColumnAppointments<T extends ScheduleAppointment>(items: T[]): LaidOutAppointment<T>[] {
  const prepared: { item: T; interval: AppointmentInterval }[] = [];
  for (const item of items) {
    const interval = getAppointmentInterval(item);
    if (interval) {
      prepared.push({ item, interval });
    }
  }

  prepared.sort(
    (left, right) =>
      left.interval.start - right.interval.start ||
      left.interval.end - right.interval.end ||
      left.item.id.localeCompare(right.item.id),
  );

  const result: LaidOutAppointment<T>[] = [];
  let clusterStart = 0;
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  function closeCluster(upTo: number) {
    const laneCount = laneEnds.length;
    for (let index = clusterStart; index < upTo; index += 1) {
      result[index].laneCount = laneCount;
    }
  }

  for (const entry of prepared) {
    if (result.length > 0 && entry.interval.start >= clusterEnd) {
      closeCluster(result.length);
      clusterStart = result.length;
      clusterEnd = -1;
      laneEnds = [];
    }

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= entry.interval.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.interval.end);
    } else {
      laneEnds[lane] = entry.interval.end;
    }
    clusterEnd = Math.max(clusterEnd, entry.interval.end);
    result.push({ item: entry.item, interval: entry.interval, lane, laneCount: 1 });
  }

  closeCluster(result.length);
  return result;
}

export type ConflictCandidate = {
  id: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  staff_name: string | null;
  status: string | null;
};

function isCancelled(status: string | null): boolean {
  return (status ?? "").trim().toLowerCase() === "cancelled";
}

/**
 * Existing appointments that overlap the candidate for the same staff and date (advisory only).
 * Half-open intervals: back-to-back bookings do not clash. Cancelled bookings and the candidate's own id are ignored.
 * Sorted by start, end, id; inputs are never mutated.
 */
export function findAppointmentConflicts<T extends ScheduleAppointment>(
  candidate: ConflictCandidate,
  existing: T[],
): T[] {
  const staff = (candidate.staff_name ?? "").trim();
  if (!staff || !candidate.date || isCancelled(candidate.status)) {
    return [];
  }
  const interval = getAppointmentInterval(candidate);
  if (!interval) {
    return [];
  }

  const matches: { item: T; interval: AppointmentInterval }[] = [];
  for (const item of existing) {
    if (
      (item.staff_name ?? "").trim() !== staff ||
      item.date !== candidate.date ||
      isCancelled(item.status) ||
      (candidate.id !== null && item.id === candidate.id)
    ) {
      continue;
    }
    const itemInterval = getAppointmentInterval(item);
    if (itemInterval && interval.start < itemInterval.end && itemInterval.start < interval.end) {
      matches.push({ item, interval: itemInterval });
    }
  }

  matches.sort(
    (left, right) =>
      left.interval.start - right.interval.start ||
      left.interval.end - right.interval.end ||
      left.item.id.localeCompare(right.item.id),
  );
  return matches.map((entry) => entry.item);
}

const ISO_DATE_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcDate(date: string): Date | null {
  const match = date.match(ISO_DATE_PARTS);
  if (!match) {
    return null;
  }
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** YYYY-MM-DD in and out; UTC date arithmetic so the machine time zone never shifts the result. */
export function addDays(date: string, days: number): string {
  const parsed = toUtcDate(date);
  if (!parsed) {
    return date;
  }
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** The seven dates Monday to Sunday of the week containing the date (Sunday ends its week). */
export function getWeekDates(date: string): string[] {
  const parsed = toUtcDate(date);
  if (!parsed) {
    return [date];
  }
  const daysSinceMonday = (parsed.getUTCDay() + 6) % 7;
  const monday = addDays(date, -daysSinceMonday);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}
