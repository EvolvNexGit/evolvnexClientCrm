import { parseDbTimestamp } from "@/lib/time-utils";

export type CafeSummaryRangePreset = "today" | "week" | "month" | "3months" | "6months" | "custom";

export type CafeSummaryDateRange = {
  startMs: number;
  endMs: number;
};

export type CafeSummaryRangePair = {
  current: CafeSummaryDateRange;
  previous: CafeSummaryDateRange;
};

type IstYmd = { year: number; month: number; day: number };

function getIstYmd(date: Date): IstYmd {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? 0),
    month: Number(parts.find((part) => part.type === "month")?.value ?? 0),
    day: Number(parts.find((part) => part.type === "day")?.value ?? 0),
  };
}

function toIsoYmd({ year, month, day }: IstYmd) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function istDayStartMs(ymd: IstYmd) {
  return new Date(`${toIsoYmd(ymd)}T00:00:00+05:30`).getTime();
}

function istDayEndMs(ymd: IstYmd) {
  return new Date(`${toIsoYmd(ymd)}T23:59:59.999+05:30`).getTime();
}

function addDays(ymd: IstYmd, days: number): IstYmd {
  const date = new Date(istDayStartMs(ymd));
  date.setUTCDate(date.getUTCDate() + days);
  return getIstYmd(date);
}

function startOfWeekMonday(ymd: IstYmd): IstYmd {
  const date = new Date(istDayStartMs(ymd));
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short" }).format(date);
  const offset: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return addDays(ymd, -(offset[weekday] ?? 0));
}

function startOfMonth(ymd: IstYmd): IstYmd {
  return { year: ymd.year, month: ymd.month, day: 1 };
}

function endOfMonth(ymd: IstYmd): IstYmd {
  const nextMonth = ymd.month === 12 ? { year: ymd.year + 1, month: 1, day: 1 } : { year: ymd.year, month: ymd.month + 1, day: 1 };
  const lastDay = addDays(nextMonth, -1);
  return lastDay;
}

function shiftMonth(ymd: IstYmd, delta: number): IstYmd {
  const date = new Date(Date.UTC(ymd.year, ymd.month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: 1 };
}

function rangeFromYmd(start: IstYmd, end: IstYmd): CafeSummaryDateRange {
  return { startMs: istDayStartMs(start), endMs: istDayEndMs(end) };
}

function previousRange(current: CafeSummaryDateRange): CafeSummaryDateRange {
  const duration = current.endMs - current.startMs + 1;
  return {
    startMs: current.startMs - duration,
    endMs: current.endMs - duration,
  };
}

export function resolveCafeSummaryRanges(
  preset: CafeSummaryRangePreset,
  custom?: { from: string; to: string },
  now = new Date(),
): CafeSummaryRangePair {
  const today = getIstYmd(now);

  if (preset === "custom" && custom?.from && custom?.to) {
    const fromParts = custom.from.split("-").map(Number);
    const toParts = custom.to.split("-").map(Number);
    const current = rangeFromYmd(
      { year: fromParts[0], month: fromParts[1], day: fromParts[2] },
      { year: toParts[0], month: toParts[1], day: toParts[2] },
    );
    return { current, previous: previousRange(current) };
  }

  if (preset === "custom") {
    const current = rangeFromYmd(today, today);
    return { current, previous: rangeFromYmd(addDays(today, -1), addDays(today, -1)) };
  }

  if (preset === "today") {
    const current = rangeFromYmd(today, today);
    const yesterday = addDays(today, -1);
    return { current, previous: rangeFromYmd(yesterday, yesterday) };
  }

  if (preset === "week") {
    const weekStart = startOfWeekMonday(today);
    const current = rangeFromYmd(weekStart, today);
    const prevWeekEnd = addDays(weekStart, -1);
    const prevWeekStart = addDays(prevWeekEnd, -6);
    return { current, previous: rangeFromYmd(prevWeekStart, prevWeekEnd) };
  }

  if (preset === "month") {
    const monthStart = startOfMonth(today);
    const current = rangeFromYmd(monthStart, today);
    const prevMonthEnd = addDays(monthStart, -1);
    const prevMonthStart = startOfMonth(prevMonthEnd);
    return { current, previous: rangeFromYmd(prevMonthStart, prevMonthEnd) };
  }

  if (preset === "3months") {
    const monthStart = startOfMonth(shiftMonth(today, -2));
    const current = rangeFromYmd(monthStart, today);
    const prevBlockEnd = addDays(monthStart, -1);
    const prevBlockStart = startOfMonth(shiftMonth(prevBlockEnd, -2));
    return { current, previous: rangeFromYmd(prevBlockStart, prevBlockEnd) };
  }

  const monthStart = startOfMonth(shiftMonth(today, -5));
  const current = rangeFromYmd(monthStart, today);
  const prevBlockEnd = addDays(monthStart, -1);
  const prevBlockStart = startOfMonth(shiftMonth(prevBlockEnd, -5));
  return { current, previous: rangeFromYmd(prevBlockStart, prevBlockEnd) };
}

export function isTimestampInRange(value: string | Date | null | undefined, range: CafeSummaryDateRange) {
  const parsed = parseDbTimestamp(value);
  if (!parsed) {
    return false;
  }

  const ms = parsed.getTime();
  return ms >= range.startMs && ms <= range.endMs;
}

export function getIstHourLabel(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

export function getIstHour(value: string | Date | null | undefined): number | null {
  const parsed = parseDbTimestamp(value);
  if (!parsed) {
    return null;
  }

  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    }).format(parsed),
  );

  return Number.isFinite(hour) ? hour : null;
}

export function formatIstDataTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

export function getIstTodayYmd(now = new Date()) {
  return toIsoYmd(getIstYmd(now));
}
