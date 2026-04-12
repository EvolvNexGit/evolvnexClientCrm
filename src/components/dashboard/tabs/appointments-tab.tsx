"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getAppointmentsByClientId, type AppointmentRow } from "@/lib/appointments";

export default function AppointmentsTab({ clientId }: { clientId: string }) {
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAppointments() {
      try {
        setLoading(true);
        setError(null);
        const data = await getAppointmentsByClientId(clientId);

        if (!isMounted) {
          return;
        }

        setAppointments(data);
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
          <article key={appointment.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-4">
            <div>
              <div className="text-sm font-medium text-slate-950">{appointment.title ?? "Untitled appointment"}</div>
              <div className="mt-1 text-xs text-slate-500">{appointment.scheduled_at ?? "No schedule time"}</div>
            </div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Client scoped</div>
          </article>
        ))}
      </div>
    </section>
  );
}