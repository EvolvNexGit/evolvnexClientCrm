"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAppointmentsRange } from "@/lib/appointment-queries";
import {
  computeReminders,
  getReminderHorizonDays,
  shiftIsoDate,
  zonedNow,
  type AppointmentReminder,
} from "@/lib/appointment-reminder-window";
import { DEFAULT_REMINDER_LEAD_MINUTES, DEFAULT_SCHEDULING_TIMEZONE } from "@/lib/client-settings-types";
import { playOrderAlertSound, showAppNotification } from "@/lib/order-notifications";
import { formatSupabaseError } from "@/lib/supabase";
import { formatUtcToIstTime } from "@/lib/time-utils";

export const APPOINTMENT_REMINDER_SCAN_MS = 30_000;

const FIRED_KEY_PREFIX = "crm-appointment-reminder-fired";
const MAX_FIRED_KEYS = 400;

export type { AppointmentReminder };

function firedStorageKey(clientId: string) {
  return `${FIRED_KEY_PREFIX}-${clientId}`;
}

function loadFiredKeys(clientId: string) {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(firedStorageKey(clientId)) ?? "[]");
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(
      parsed
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
        .slice(-MAX_FIRED_KEYS),
    );
  } catch {
    return new Set<string>();
  }
}

function saveFiredKeys(clientId: string, keys: Set<string>) {
  try {
    window.localStorage.setItem(firedStorageKey(clientId), JSON.stringify(Array.from(keys).slice(-MAX_FIRED_KEYS)));
  } catch {
    // no-op
  }
}

export type AppointmentReminderOptions = {
  /** Clinic-wide lead time from the reminders settings namespace; defaults to the registry default. */
  leadMinutes?: number;
  /** Clinic IANA time zone from the scheduling settings namespace; defaults to Asia/Kolkata. */
  timeZone?: string;
};

/**
 * Scans upcoming appointments every 30s, using "now" in the clinic time zone and looking ahead across midnight
 * when the lead time needs it. Rows starting within the clinic lead time alert once (sound + browser
 * notification) while the opt-in is on; the fired set lives in localStorage so a reload does not refire.
 */
export function useAppointmentReminders(
  clientId: string | null,
  alertsEnabled: boolean,
  options: AppointmentReminderOptions = {},
) {
  const [reminders, setReminders] = useState<AppointmentReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref, not an effect dependency: toggling the opt-in must not restart the scan timer.
  const alertsEnabledRef = useRef(alertsEnabled);
  alertsEnabledRef.current = alertsEnabled;
  // Same for the lead time: a settings change is picked up on the next scan without restarting the timer.
  const leadMinutesRef = useRef(options.leadMinutes ?? DEFAULT_REMINDER_LEAD_MINUTES);
  leadMinutesRef.current = options.leadMinutes ?? DEFAULT_REMINDER_LEAD_MINUTES;
  const timeZoneRef = useRef(options.timeZone ?? DEFAULT_SCHEDULING_TIMEZONE);
  timeZoneRef.current = options.timeZone ?? DEFAULT_SCHEDULING_TIMEZONE;

  useEffect(() => {
    if (!clientId) {
      setReminders([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let latestRequest = 0;
    setLoading(true);

    async function scan(activeClientId: string) {
      const requestId = ++latestRequest;
      const leadMinutes = leadMinutesRef.current;
      const now = zonedNow(new Date(), timeZoneRef.current);
      const horizonDays = getReminderHorizonDays(leadMinutes, now.minutes);

      try {
        const rows = await fetchAppointmentsRange(
          activeClientId,
          now.date,
          shiftIsoDate(now.date, horizonDays),
        );
        if (cancelled || requestId !== latestRequest) {
          return;
        }

        const next = computeReminders({
          nowDate: now.date,
          nowMinutes: now.minutes,
          leadMinutes,
          rows: rows.flatMap((row) =>
            row.start_time
              ? [
                  {
                    id: row.id,
                    name: row.name?.trim() || "Patient",
                    service: row.service?.trim() || "Appointment",
                    date: row.date,
                    timeLabel: formatUtcToIstTime(row.start_time, { date: row.date }),
                    status: row.status,
                  },
                ]
              : [],
          ),
        });
        setReminders(next);
        setError(null);

        const due = next.filter((reminder) => reminder.dueSoon);
        if (!alertsEnabledRef.current || due.length === 0) {
          return;
        }

        // The key includes the appointment date and start time so a rescheduled slot can fire again, and a
        // look-ahead alert for tomorrow does not fire a second time when tomorrow becomes today.
        const fired = loadFiredKeys(activeClientId);
        let changed = false;
        for (const reminder of due) {
          const key = `${reminder.id}|${reminder.date}|${reminder.timeLabel}`;
          if (fired.has(key)) {
            continue;
          }

          fired.add(key);
          changed = true;
          playOrderAlertSound();
          showAppNotification({
            title: "Appointment soon",
            body: `${reminder.name} • ${reminder.service} • ${reminder.timeLabel}`,
            tag: `appointment-reminder-${reminder.id}`,
            url: "/dashboard/appointments",
          });
        }

        if (changed) {
          saveFiredKeys(activeClientId, fired);
        }
      } catch (scanError) {
        if (!cancelled && requestId === latestRequest) {
          setError(formatSupabaseError(scanError, "Unable to load appointment reminders."));
        }
      } finally {
        if (!cancelled && requestId === latestRequest) {
          setLoading(false);
        }
      }
    }

    void scan(clientId);
    const timer = window.setInterval(() => void scan(clientId), APPOINTMENT_REMINDER_SCAN_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [clientId]);

  const dueSoonCount = reminders.filter((reminder) => reminder.dueSoon).length;

  return { reminders, dueSoonCount, loading, error };
}
