"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAppointmentsRange } from "@/lib/appointment-queries";
import { clockToMinutes } from "@/lib/appointment-schedule";
import { playOrderAlertSound, showAppNotification } from "@/lib/order-notifications";
import { formatSupabaseError } from "@/lib/supabase";
import { formatUtcToIst, formatUtcToIstTime } from "@/lib/time-utils";

export const APPOINTMENT_REMINDER_LEAD_MINUTES = 5;
export const APPOINTMENT_REMINDER_SCAN_MS = 30_000;

const FIRED_KEY_PREFIX = "crm-appointment-reminder-fired";
const MAX_FIRED_KEYS = 400;

export type AppointmentReminder = {
  id: string;
  name: string;
  service: string;
  timeLabel: string;
  minutesUntil: number;
  dueSoon: boolean;
};

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

/**
 * Scans today's appointments (IST) every 30s. Rows starting within 5 minutes alert once (sound + browser
 * notification) while the opt-in is on; the fired set lives in localStorage so a reload does not refire.
 */
export function useAppointmentReminders(clientId: string | null, alertsEnabled: boolean) {
  const [reminders, setReminders] = useState<AppointmentReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref, not an effect dependency: toggling the opt-in must not restart the scan timer.
  const alertsEnabledRef = useRef(alertsEnabled);
  alertsEnabledRef.current = alertsEnabled;

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
      const nowIst = formatUtcToIst(new Date());
      const today = nowIst.slice(0, 10);
      const nowMinutes = clockToMinutes(nowIst.slice(11, 16));

      try {
        const rows = await fetchAppointmentsRange(activeClientId, today, today);
        if (cancelled || requestId !== latestRequest || nowMinutes === null) {
          return;
        }

        const next: AppointmentReminder[] = [];
        for (const row of rows) {
          if (!row.start_time || row.status === "cancelled" || row.status === "completed") {
            continue;
          }

          const timeLabel = formatUtcToIstTime(row.start_time, { date: row.date });
          const startMinutes = clockToMinutes(timeLabel);
          if (startMinutes === null) {
            continue;
          }

          const minutesUntil = startMinutes - nowMinutes;
          if (minutesUntil < 0) {
            continue;
          }

          next.push({
            id: row.id,
            name: row.name?.trim() || "Patient",
            service: row.service?.trim() || "Appointment",
            timeLabel,
            minutesUntil,
            dueSoon: minutesUntil > 0 && minutesUntil <= APPOINTMENT_REMINDER_LEAD_MINUTES,
          });
        }

        next.sort((left, right) => left.minutesUntil - right.minutesUntil);
        setReminders(next);
        setError(null);

        const due = next.filter((reminder) => reminder.dueSoon);
        if (!alertsEnabledRef.current || due.length === 0) {
          return;
        }

        // The key includes date and start time so a rescheduled slot can fire again.
        const fired = loadFiredKeys(activeClientId);
        let changed = false;
        for (const reminder of due) {
          const key = `${reminder.id}|${today}|${reminder.timeLabel}`;
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
