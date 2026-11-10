"use client";

import { useMemo } from "react";
import { DataState } from "@/components/dashboard/billing/data-state";
import type { AppointmentRow } from "@/lib/appointment-queries";
import {
  CALENDAR_SLOT_HEIGHT_PX,
  DEFAULT_APPOINTMENT_MINUTES,
  TIME_STEP_MINUTES,
  buildSlotStarts,
  buildStaffColumns,
  getAppointmentInterval,
  getVisibleRange,
  layoutColumnAppointments,
  minutesToClock,
  splitScheduled,
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
  date: string;
  appointments: AppointmentRow[];
  staffOptions: string[];
  loading: boolean;
  error: string | null;
  onDateChange: (date: string) => void;
  onSlotClick: (slot: CalendarSlot) => void;
  onCardClick: (appointment: AppointmentRow) => void;
};

type GridColumn = {
  key: string;
  label: string;
  date: string;
  staffName: string | null;
  rows: AppointmentRow[];
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GUTTER_WIDTH = "3.5rem";
const DAY_COLUMN_MIN_WIDTH = "9rem";

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

function formatDateHeading(date: string) {
  if (!ISO_DATE_PATTERN.test(date)) {
    return date;
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

export function AppointmentsCalendar({
  date,
  appointments,
  staffOptions,
  loading,
  error,
  onDateChange,
  onSlotClick,
  onCardClick,
}: AppointmentsCalendarProps) {
  const visibleRows = useMemo(() => appointments.filter((appointment) => appointment.date === date), [appointments, date]);

  const { scheduled, unscheduled } = useMemo(() => splitScheduled(visibleRows), [visibleRows]);

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

  const columns = useMemo<GridColumn[]>(
    () =>
      buildStaffColumns(staffOptions, visibleRows).map((column) => ({
        key: column.key,
        label: column.label,
        date,
        staffName: column.staffName,
        rows: scheduled.filter((appointment) =>
          column.staffName === null ? rowStaffKey(appointment) === "" : rowStaffKey(appointment) === column.staffName,
        ),
      })),
    [staffOptions, visibleRows, scheduled, date],
  );

  const gridTemplateColumns = `${GUTTER_WIDTH} repeat(${columns.length}, minmax(${DAY_COLUMN_MIN_WIDTH}, 1fr))`;
  const gridMinWidth = `calc(${GUTTER_WIDTH} + ${columns.length} * ${DAY_COLUMN_MIN_WIDTH})`;
  const hourMarks = slotStarts.filter((minutes) => minutes % 60 === 0);

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
        <h3 className="mr-auto text-base font-semibold text-text">{formatDateHeading(date)}</h3>
        <button
          type="button"
          onClick={() => onDateChange(getTodayIst())}
          className="min-h-11 rounded-xl border border-border bg-background px-4 text-sm font-medium text-text hover:bg-muted"
        >
          Today
        </button>
        <input
          type="date"
          value={date}
          onChange={(event) => handleDateInput(event.target.value)}
          aria-label="Select calendar date"
          className="min-h-11 rounded-xl border border-border bg-background px-3 text-base text-text sm:text-sm"
        />
      </div>

      <DataState loading={loading && appointments.length === 0} error={error} empty={false} emptyLabel="" />

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
              className="sticky top-0 z-20 truncate border-b border-r border-border bg-card px-2 py-2 text-center text-sm font-semibold text-text"
              title={column.label}
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
                      aria-label={`Book ${column.label} at ${minutesToClock(minutes)}`}
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

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onCardClick(item)}
                      aria-label={`Edit appointment for ${appointmentLabel(item)} at ${minutesToClock(interval.start)}`}
                      className="absolute overflow-hidden rounded-lg border border-border bg-card text-left shadow-soft"
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
                        <div className="truncate">{appointmentLabel(item)}</div>
                        {item.service ? <div className="truncate opacity-80">{item.service}</div> : null}
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
