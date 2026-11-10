"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DataState } from "@/components/dashboard/billing/data-state";
import type { AppointmentRow } from "@/lib/appointment-queries";
import {
  CALENDAR_SLOT_HEIGHT_PX,
  DEFAULT_APPOINTMENT_MINUTES,
  TIME_STEP_MINUTES,
  addDays,
  buildSlotStarts,
  buildStaffColumns,
  getAppointmentInterval,
  getConflictingIds,
  getVisibleRange,
  getWeekDates,
  layoutColumnAppointments,
  minutesToClock,
  splitScheduled,
  staffKey,
} from "@/lib/appointment-schedule";
import { formatUtcToIst } from "@/lib/time-utils";
import { cn } from "@/lib/utils";

export type CalendarSlot = {
  date: string;
  startTime: string;
  endTime: string;
  staffName: string | null;
};

type AppointmentsCalendarProps = {
  mode: "day" | "week";
  date: string;
  appointments: AppointmentRow[];
  staffOptions: string[];
  loading: boolean;
  error: string | null;
  onDateChange: (date: string) => void;
  onSlotClick: (slot: CalendarSlot) => void;
  onCardClick: (appointment: AppointmentRow) => void;
  onAddClick: () => void;
  onRetry: () => void;
};

type GridColumn = {
  key: string;
  label: string;
  ariaLabel: string;
  date: string;
  staffName: string | null;
  rows: AppointmentRow[];
};

const ALL_STAFF_KEY = "__all__";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GUTTER_WIDTH = "3.5rem";
const DAY_COLUMN_MIN_WIDTH = "9rem";
const WEEK_COLUMN_MIN_WIDTH = "7rem";

/** Single source of status pill classes for the calendar cards and the list view. */
export function getAppointmentStatusTone(status: AppointmentRow["status"]) {
  return status === "booked"
    ? "bg-blue-500/15 text-blue-600"
    : status === "completed"
      ? "bg-emerald-500/15 text-emerald-600"
      : status === "cancelled"
        ? "bg-rose-500/15 text-rose-600"
        : "bg-amber-500/15 text-amber-600";
}

function parseIsoDate(date: string) {
  if (!ISO_DATE_PATTERN.test(date)) {
    return null;
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions) {
  const parsed = parseIsoDate(date);
  return parsed ? parsed.toLocaleDateString("en-GB", { timeZone: "UTC", ...options }) : date;
}

function getTodayIst() {
  return formatUtcToIst(new Date().toISOString()).slice(0, 10);
}

function appointmentLabel(appointment: AppointmentRow) {
  return appointment.name?.trim() || "Unnamed appointment";
}

function rowStaffKey(appointment: AppointmentRow) {
  return (appointment.staff_name ?? "").trim();
}

function matchesStaff(appointment: AppointmentRow, staffName: string | null) {
  return staffName === null ? rowStaffKey(appointment) === "" : staffKey(appointment.staff_name) === staffKey(staffName);
}

export function AppointmentsCalendar({
  mode,
  date,
  appointments,
  staffOptions,
  loading,
  error,
  onDateChange,
  onSlotClick,
  onCardClick,
  onAddClick,
  onRetry,
}: AppointmentsCalendarProps) {
  const [selectedStaffKey, setSelectedStaffKey] = useState(ALL_STAFF_KEY);
  const isWeek = mode === "week";

  const visibleDates = useMemo(() => (isWeek ? getWeekDates(date) : [date]), [isWeek, date]);

  // Rows outside the visible dates are ignored defensively (also hides the previous window while a new one loads).
  const windowRows = useMemo(
    () => appointments.filter((appointment) => appointment.date !== null && visibleDates.includes(appointment.date)),
    [appointments, visibleDates],
  );

  const staffColumns = useMemo(() => buildStaffColumns(staffOptions, windowRows), [staffOptions, windowRows]);
  const conflictingIds = useMemo(() => getConflictingIds(windowRows), [windowRows]);

  const effectiveStaffKey =
    staffColumns.some((column) => column.key === selectedStaffKey) ? selectedStaffKey : ALL_STAFF_KEY;
  const selectedStaff = staffColumns.find((column) => column.key === effectiveStaffKey) ?? null;

  const { scheduled: allScheduled, unscheduled } = useMemo(() => splitScheduled(windowRows), [windowRows]);

  const scheduled = useMemo(
    () =>
      selectedStaff
        ? allScheduled.filter((appointment) => matchesStaff(appointment, selectedStaff.staffName))
        : allScheduled,
    [allScheduled, selectedStaff],
  );

  const range = useMemo(
    () =>
      getVisibleRange(
        scheduled.flatMap((appointment) => {
          const interval = getAppointmentInterval(appointment);
          return interval ? [interval] : [];
        }),
      ),
    [scheduled],
  );

  const slotStarts = useMemo(() => buildSlotStarts(range), [range]);
  const gridHeight = slotStarts.length * CALENDAR_SLOT_HEIGHT_PX;
  const todayIst = getTodayIst();

  const columns = useMemo<GridColumn[]>(() => {
    if (isWeek) {
      return visibleDates.map((columnDate) => ({
        key: columnDate,
        label: formatDate(columnDate, { weekday: "short", day: "numeric" }),
        ariaLabel: formatDate(columnDate, { weekday: "short", day: "numeric", month: "short" }),
        date: columnDate,
        staffName: selectedStaff?.staffName ?? null,
        rows: scheduled.filter((appointment) => appointment.date === columnDate),
      }));
    }

    // Day view: one column for the date; the doctor filter narrows it and each card names its doctor.
    return [
      {
        key: date,
        label: formatDate(date, { weekday: "short", day: "numeric" }),
        ariaLabel: formatDate(date, { weekday: "short", day: "numeric", month: "short" }),
        date,
        staffName: selectedStaff?.staffName ?? null,
        rows: scheduled,
      },
    ];
  }, [isWeek, visibleDates, selectedStaff, scheduled, date]);

  const columnMinWidth = isWeek ? WEEK_COLUMN_MIN_WIDTH : DAY_COLUMN_MIN_WIDTH;
  const gridTemplateColumns = `${GUTTER_WIDTH} repeat(${columns.length}, minmax(${columnMinWidth}, 1fr))`;
  const gridMinWidth = `calc(${GUTTER_WIDTH} + ${columns.length} * ${columnMinWidth})`;
  const hourMarks = slotStarts.filter((minutes) => minutes % 60 === 0);
  const stepDays = isWeek ? 7 : 1;

  const heading = isWeek
    ? `${formatDate(visibleDates[0], { day: "numeric", month: "short" })} - ${formatDate(visibleDates[visibleDates.length - 1], {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`
    : formatDate(date, { weekday: "long", day: "numeric", month: "short", year: "numeric" });

  function handleDateInput(value: string) {
    if (ISO_DATE_PATTERN.test(value)) {
      onDateChange(value);
    }
  }

  function handleSlotClick(column: GridColumn, startMinutes: number) {
    onSlotClick({
      date: column.date,
      startTime: minutesToClock(startMinutes),
      endTime: minutesToClock(Math.min(startMinutes + DEFAULT_APPOINTMENT_MINUTES, 24 * 60 - 1)),
      staffName: column.staffName,
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-base font-semibold text-text">{heading}</h3>
        <button
          type="button"
          onClick={() => onDateChange(addDays(date, -stepDays))}
          aria-label={isWeek ? "Previous week" : "Previous day"}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-background text-text hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDateChange(todayIst)}
          className="min-h-11 rounded-xl border border-border bg-background px-4 text-sm font-medium text-text hover:bg-muted"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => onDateChange(addDays(date, stepDays))}
          aria-label={isWeek ? "Next week" : "Next day"}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-background text-text hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={date}
          onChange={(event) => handleDateInput(event.target.value)}
          aria-label="Select calendar date"
          className="min-h-11 rounded-xl border border-border bg-background px-3 text-base text-text sm:text-sm"
        />
      </div>

      {staffColumns.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by doctor">
          <button
            type="button"
            aria-pressed={effectiveStaffKey === ALL_STAFF_KEY}
            onClick={() => setSelectedStaffKey(ALL_STAFF_KEY)}
            className={cn(
              "min-h-11 rounded-full border px-4 text-sm font-medium",
              effectiveStaffKey === ALL_STAFF_KEY
                ? "border-primary/40 bg-primary/10 text-text"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-text",
            )}
          >
            All doctors
          </button>
          {staffColumns.map((column) => (
            <button
              key={column.key}
              type="button"
              aria-pressed={effectiveStaffKey === column.key}
              onClick={() => setSelectedStaffKey(column.key)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-medium",
                effectiveStaffKey === column.key
                  ? "border-primary/40 bg-primary/10 text-text"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-text",
              )}
            >
              {column.label}
            </button>
          ))}
        </div>
      )}

      {conflictingIds.size > 0 && (
        <p className="text-xs text-amber-600">Amber outline: overlapping bookings for the same staff</p>
      )}

      <DataState
        loading={loading && windowRows.length === 0}
        error={error}
        empty={!loading && !error && windowRows.length === 0}
        emptyLabel={isWeek ? "No appointments this week" : "No appointments today"}
      />

      {error && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-xl border border-border bg-background px-4 text-sm font-medium text-text hover:bg-muted"
        >
          Retry
        </button>
      )}

      {!loading && !error && windowRows.length === 0 && (
        <button
          type="button"
          onClick={onAddClick}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Add appointment
        </button>
      )}

      {unscheduled.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="mb-2 text-sm font-medium text-muted-foreground">
            Unscheduled ({unscheduled.length}) - no start time
          </div>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((appointment) => (
              <button
                key={appointment.id}
                type="button"
                onClick={() => onCardClick(appointment)}
                className="min-h-11 rounded-xl border border-border bg-card px-3 text-left text-sm text-text hover:bg-muted"
              >
                <span className="font-semibold">{appointmentLabel(appointment)}</span>
                {appointment.service ? <span className="text-muted-foreground"> - {appointment.service}</span> : null}
                {isWeek && appointment.date ? (
                  <span className="text-muted-foreground"> ({formatDate(appointment.date, { weekday: "short", day: "numeric" })})</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="min-w-0 max-w-full overflow-auto rounded-xl border border-border bg-card max-h-[70vh]">
        <div className="grid" style={{ gridTemplateColumns, minWidth: gridMinWidth }}>
          <div className="sticky left-0 top-0 z-30 border-b border-r border-border bg-card" />
          {columns.map((column) => (
            <div
              key={`head-${column.key}`}
              className={cn(
                "sticky top-0 z-20 truncate border-b border-r border-border bg-card px-2 py-2 text-center text-sm font-semibold",
                isWeek && column.date === todayIst ? "text-primary" : "text-text",
              )}
              title={column.ariaLabel}
            >
              {column.label}
            </div>
          ))}

          <div className="sticky left-0 z-10 border-r border-border bg-card" style={{ height: gridHeight }}>
            <div className="relative h-full">
              {hourMarks.map((minutes) => (
                <span
                  key={minutes}
                  className="absolute right-1 text-[11px] leading-none text-muted-foreground"
                  style={{ top: ((minutes - range.startMinutes) / TIME_STEP_MINUTES) * CALENDAR_SLOT_HEIGHT_PX + 2 }}
                >
                  {minutesToClock(minutes)}
                </span>
              ))}
            </div>
          </div>

          {columns.map((column) => {
            const laidOut = layoutColumnAppointments(column.rows);

            return (
              <div
                key={`body-${column.key}`}
                className="relative border-r border-border"
                style={{ height: gridHeight }}
              >
                <div className="flex flex-col">
                  {slotStarts.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => handleSlotClick(column, minutes)}
                      aria-label={`Book ${column.ariaLabel} at ${minutesToClock(minutes)}`}
                      className={cn(
                        "block w-full border-t hover:bg-primary/10 focus-visible:bg-primary/10",
                        minutes % 60 === 0 ? "border-border" : "border-border/30",
                      )}
                      style={{ height: CALENDAR_SLOT_HEIGHT_PX }}
                    />
                  ))}
                </div>

                {laidOut.map(({ item, interval, lane, laneCount }) => {
                  const top = ((interval.start - range.startMinutes) / TIME_STEP_MINUTES) * CALENDAR_SLOT_HEIGHT_PX;
                  const height = Math.max(
                    ((interval.end - interval.start) / TIME_STEP_MINUTES) * CALENDAR_SLOT_HEIGHT_PX,
                    CALENDAR_SLOT_HEIGHT_PX,
                  );
                  const staffLabel = rowStaffKey(item) || "Unassigned";
                  const isCancelled = item.status === "cancelled";
                  const hasOverlap = conflictingIds.has(item.id);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onCardClick(item)}
                      aria-label={`Edit appointment for ${appointmentLabel(item)} at ${minutesToClock(interval.start)}${
                        hasOverlap ? `, overlaps another booking for staff ${staffLabel}` : ""
                      }`}
                      className={cn(
                        "absolute overflow-hidden rounded-lg border border-border bg-card text-left shadow-soft",
                        isCancelled && "opacity-60",
                        hasOverlap && "ring-2 ring-amber-500",
                      )}
                      style={{
                        top,
                        height: height - 2,
                        left: `${(lane / laneCount) * 100}%`,
                        width: `${100 / laneCount}%`,
                      }}
                    >
                      <div className={cn("h-full w-full px-1.5 py-0.5 text-xs leading-tight", getAppointmentStatusTone(item.status))}>
                        <div className="truncate font-semibold">
                          {minutesToClock(interval.start)}-{minutesToClock(interval.end)}
                        </div>
                        <div className={cn("truncate", isCancelled && "line-through")}>{appointmentLabel(item)}</div>
                        {item.service ? <div className="truncate opacity-80">{item.service}</div> : null}
                        <div className="truncate opacity-80">{staffLabel}</div>
                        {hasOverlap ? <div className="truncate text-[10px] font-semibold uppercase">Overlap</div> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
