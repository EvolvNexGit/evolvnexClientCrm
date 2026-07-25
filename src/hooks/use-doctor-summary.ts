"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchTransactionsSince } from "@/lib/billing-queries";
import {
  buildDoctorSummaryAnalytics,
  type DoctorAppointmentRecord,
  type DoctorAppointmentStatus,
  type DoctorSummaryAnalytics,
} from "@/lib/doctor-summary-analytics";
import {
  resolveCafeSummaryRanges,
  type CafeSummaryRangePreset,
} from "@/lib/cafe-summary-time";
import { fetchIngredients } from "@/lib/inventory-queries";
import { getSupabaseClient } from "@/lib/supabase";

type CustomRange = {
  from: string;
  to: string;
};

const APPOINTMENT_COLUMNS =
  "id, name, phone, service, staff_name, location, date, start_time, end_time, status";

function normalizeStatus(value: unknown): DoctorAppointmentStatus | null {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "tentative" || status === "booked" || status === "cancelled" || status === "completed") {
    return status;
  }

  return null;
}

function mapAppointment(row: Record<string, unknown>): DoctorAppointmentRecord {
  return {
    id: String(row.id),
    name: (row.name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    service: (row.service as string | null) ?? null,
    staff_name: (row.staff_name as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    date: (row.date as string | null) ?? null,
    start_time: (row.start_time as string | null) ?? null,
    end_time: (row.end_time as string | null) ?? null,
    status: normalizeStatus(row.status),
  };
}

export function useDoctorSummary(
  clientId: string,
  preset: CafeSummaryRangePreset,
  customRange: CustomRange,
  location: string | null,
) {
  const [analytics, setAnalytics] = useState<DoctorSummaryAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const ranges = useMemo(
    () => resolveCafeSummaryRanges(preset, customRange),
    [customRange.from, customRange.to, preset],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("Missing Supabase environment variables.");
      }

      const sinceIso = new Date(ranges.previous.startMs).toISOString();
      const [{ data: appointmentRows, error: appointmentError }, transactions, ingredients] = await Promise.all([
        supabase
          .from("appointments")
          .select(APPOINTMENT_COLUMNS)
          .eq("client_id", clientId)
          .order("date", { ascending: true }),
        fetchTransactionsSince(clientId, sinceIso),
        fetchIngredients(clientId),
      ]);

      if (appointmentError) {
        throw appointmentError;
      }

      const appointments = (appointmentRows ?? []).map((row) => mapAppointment(row as Record<string, unknown>));

      setAnalytics(
        buildDoctorSummaryAnalytics({
          appointments,
          transactions,
          ingredients,
          currentRange: ranges.current,
          previousRange: ranges.previous,
          location,
        }),
      );
      setRefreshedAt(new Date());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to load doctor analytics.");
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [clientId, location, ranges.current, ranges.previous]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    analytics,
    loading,
    error,
    refreshedAt,
    refresh,
  };
}
