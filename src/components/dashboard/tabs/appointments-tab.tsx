"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type AppointmentRow = {
  id: string;
  client_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  location: string | null;
  staff_name: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: "tentative" | "booked" | "cancelled" | "completed" | null;
  remark: string | null;
  created_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  reminder_sent: boolean | null;
  reminder_sent_at: string | null;
  created_at: string | null;
};

export default function AppointmentsTab({ clientId }: { clientId: string }) {
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabaseClient = getSupabaseClient();

    if (!supabaseClient) {
      setError("Missing Supabase environment variables.");
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    async function loadAppointments() {
      try {
        setLoading(true);
        const client = supabaseClient;

        if (!client) {
          throw new Error("Missing Supabase environment variables.");
        }

        const { data, error } = await client
          .from("appointments")
          .select("*")
          .eq("client_id", clientId)
          .order("date", { ascending: true, nullsFirst: false })
          .order("start_time", { ascending: true, nullsFirst: false });

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        setAppointments((data ?? []) as AppointmentRow[]);
      } catch (fetchError) {
        if (!isMounted) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : "Unable to load appointments.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadAppointments();

    return () => {
      isMounted = false;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching appointments
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-white p-6 text-sm text-rose-700">
        Unable to load appointments: {error}
      </div>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Appointments</h2>
          <p className="mt-1 text-sm text-slate-500">Filtered by client_id and ready for RLS.</p>
        </div>
        <div className="text-xs text-slate-500">{appointments.length} record(s)</div>
      </div>

      <div className="mt-6 space-y-3">
        {appointments.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            No appointments found for this client.
          </div>
        )}

        {appointments.map((appointment) => (
          <article key={appointment.id} className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-950">{appointment.name ?? "Unnamed appointment"}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {appointment.date ?? "No date"} {appointment.start_time ? `at ${appointment.start_time}` : ""}
                </div>
              </div>
              <div className="rounded-full bg-white px-2 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-600">
                {appointment.status ?? "tentative"}
              </div>
            </div>

            <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
              <div>Service: {appointment.service ?? "-"}</div>
              <div>Staff: {appointment.staff_name ?? "-"}</div>
              <div>Location: {appointment.location ?? "-"}</div>
              <div>Phone: {appointment.phone ?? "-"}</div>
              <div>Email: {appointment.email ?? "-"}</div>
              <div>Client ID: {appointment.client_id}</div>
              <div>End Time: {appointment.end_time ?? "-"}</div>
              <div>Created By: {appointment.created_by ?? "-"}</div>
              <div>Created At: {appointment.created_at ?? "-"}</div>
              <div>Verified At: {appointment.verified_at ?? "-"}</div>
              <div>Verified By: {appointment.verified_by ?? "-"}</div>
              <div>Reminder Sent: {appointment.reminder_sent ? "Yes" : "No"}</div>
              <div>Reminder At: {appointment.reminder_sent_at ?? "-"}</div>
            </div>

            {appointment.remark && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                Remark: {appointment.remark}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}