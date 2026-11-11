"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAppointmentsRange, type AppointmentRow } from "@/lib/appointment-queries";
import { formatSupabaseError } from "@/lib/supabase";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type UseAppointmentsRangeOptions = {
  clientId: string;
  fromDate: string;
  toDate: string;
  enabled: boolean;
};

/** Loads one inclusive date range for the calendar. A request id guard drops responses that arrive out of order. */
export function useAppointmentsRange({ clientId, fromDate, toDate, enabled }: UseAppointmentsRangeOptions) {
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const paramsRef = useRef({ clientId, fromDate, toDate, enabled });
  paramsRef.current = { clientId, fromDate, toDate, enabled };

  const load = useCallback(async () => {
    const params = paramsRef.current;
    const requestId = ++requestIdRef.current;

    if (
      !params.enabled ||
      !params.clientId ||
      !ISO_DATE_PATTERN.test(params.fromDate) ||
      !ISO_DATE_PATTERN.test(params.toDate)
    ) {
      setAppointments([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rows = await fetchAppointmentsRange(params.clientId, params.fromDate, params.toDate);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setAppointments(rows);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(formatSupabaseError(loadError, "Unable to load appointments."));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, clientId, fromDate, toDate, enabled]);

  return { appointments, loading, error, refresh: load };
}
