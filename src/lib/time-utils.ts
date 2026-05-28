/** Fixes values like `2026-06-11T02:00:00:00Z` → `2026-06-11T02:00:00Z`. */
export function normalizeAppointmentTimestamp(value: string): string {
  return value.trim().replace(/(T\d{2}:\d{2}:\d{2}):\d{2}(Z)$/i, "$1$2");
}

export function parseAppointmentDateTime(value: string, date?: string | null): Date | null {
  const input = normalizeAppointmentTimestamp(value);

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(input)) {
    if (!date) {
      return null;
    }

    const time = input.length === 5 ? `${input}:00` : input;
    const combined = new Date(`${date}T${time}Z`);
    return Number.isNaN(combined.getTime()) ? null : combined;
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateToIstTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Display an appointment time as `HH:mm` in IST. */
export function formatUtcToIstTime(
  value: string | Date | null | undefined,
  options?: { date?: string | null },
): string {
  if (!value) {
    return "-";
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "-" : formatDateToIstTime(value);
  }

  const parsed = parseAppointmentDateTime(String(value), options?.date);
  if (parsed) {
    return formatDateToIstTime(parsed);
  }

  const match = String(value).match(/(?:T|\s|^)(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }

  return "-";
}

export function formatAppointmentTimeRange(
  date: string | null,
  startTime: string | null,
  endTime?: string | null,
): string {
  if (!startTime) {
    return "-";
  }

  const startPart = formatUtcToIstTime(startTime, { date });
  if (!endTime) {
    return startPart;
  }

  const endPart = formatUtcToIstTime(endTime, { date });
  return `${startPart} - ${endPart}`;
}

/** Whole minutes elapsed since `createdAt` (for kitchen queue badges). */
export function getElapsedMinutes(createdAt: string | Date | null | undefined, nowMs = Date.now()): number {
  if (!createdAt) {
    return 0;
  }

  const start = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  if (Number.isNaN(start)) {
    return 0;
  }

  return Math.max(0, Math.floor((nowMs - start) / 60_000));
}

/** Time only in IST, e.g. `08:30 PM`. */
export function formatUtcToIstTimeLabel(value: string | Date | null | undefined): string {
  if (!value) {
    return "-";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Live elapsed time since `createdAt` (e.g. `2m 15s`, `1h 3m 5s`). */
export function formatElapsedSince(createdAt: string | Date | null | undefined, nowMs = Date.now()): string {
  if (!createdAt) {
    return "--";
  }

  const start = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  if (Number.isNaN(start)) {
    return "--";
  }

  const totalSeconds = Math.max(0, Math.floor((nowMs - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export function formatAppointmentDuration(
  startTime: string | null,
  endTime: string | null,
  date?: string | null,
): string {
  if (!startTime || !endTime) {
    return "-";
  }

  const start = parseAppointmentDateTime(startTime, date ?? null);
  const end = parseAppointmentDateTime(endTime, date ?? null);

  let minutes: number;

  if (start && end) {
    minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  } else {
    const [startHours = 0, startMinutes = 0] = startTime.split(":").map(Number);
    const [endHours = 0, endMinutes = 0] = endTime.split(":").map(Number);
    minutes = endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
  }

  if (minutes <= 0) {
    return "-";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${remainingMinutes}m`;
}

export function formatUtcToIst(value: string | Date | null | undefined, opts?: { withSeconds?: boolean }) {
  if (!value) return "-";

  const date = typeof value === "string" ? new Date(value) : value;
  if (!date || Number.isNaN(date.getTime())) return String(value);

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: opts?.withSeconds ? "2-digit" : undefined,
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const second = opts?.withSeconds ? get("second") : "";

  // Return in ISO-like format: YYYY-MM-DD HH:mm[:ss]
  return `${year}-${month}-${day} ${hour}:${minute}${opts?.withSeconds ? `:${second}` : ""}`;
}

export default formatUtcToIst;
