"use client";

import { Bell, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useOrderAlertSettings } from "@/contexts/order-alert-context";
import { cn } from "@/lib/utils";

const MAX_LISTED_REMINDERS = 10;

function describeWait(minutesUntil: number) {
  return minutesUntil <= 0 ? "Starting now" : `in ${minutesUntil} min`;
}

/** Bell for doctor tenants: badge counts appointments starting within 5 minutes; the panel lists the rest of today. */
export function AppointmentRemindersBell() {
  const { enabled, busy, error, reminders, dueSoonCount, remindersLoading, remindersError, setEnabled } =
    useOrderAlertSettings();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const listed = reminders.slice(0, MAX_LISTED_REMINDERS);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Appointment reminders"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card text-text hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {dueSoonCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-white">
            {dueSoonCount}
            <span className="sr-only"> appointments starting within 5 minutes</span>
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Appointment reminders"
          className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-3 text-text shadow-sm"
        >
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <h3 className="text-sm font-semibold text-text">Appointment reminders</h3>
            <Link
              href={"/dashboard/appointments" as never}
              onClick={() => setOpen(false)}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>

          {remindersLoading && reminders.length === 0 ? (
            <div className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading appointments...
            </div>
          ) : remindersError ? (
            <p role="alert" className="px-1 py-3 text-sm text-primary">
              {remindersError}
            </p>
          ) : listed.length === 0 ? (
            <p className="px-1 py-3 text-sm text-muted-foreground">No more appointments today.</p>
          ) : (
            <ul className="space-y-2">
              {listed.map((reminder) => (
                <li
                  key={reminder.id}
                  className={cn(
                    "rounded-xl border border-border bg-background px-3 py-2",
                    reminder.dueSoon && "border-l-4 border-l-primary",
                  )}
                >
                  <p className="truncate text-sm font-medium text-text">{reminder.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{reminder.service}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {reminder.timeLabel} · {describeWait(reminder.minutesUntil)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 border-t border-border pt-3">
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={busy}
              onClick={() => void setEnabled(!enabled)}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-1 text-left text-sm text-text hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>Alert 5 min before appointments</span>
              <span
                aria-hidden="true"
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors",
                  enabled ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    enabled ? "translate-x-6" : "translate-x-1",
                  )}
                />
              </span>
            </button>
            {error && (
              <p role="alert" className="px-1 pt-1 text-xs text-primary">
                {error}
              </p>
            )}
            <p className="px-1 pt-1 text-xs text-muted-foreground">Alerts work while this tab is open.</p>
          </div>
        </div>
      )}
    </div>
  );
}
