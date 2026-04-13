"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Loader2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type AppointmentRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  location: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: "tentative" | "booked" | "cancelled" | "completed" | null;
  remark: string | null;
};

export default function AppointmentsTab({ clientId }: { clientId: string }) {
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "status" | "service" | "location">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function getSlot(startTime: string | null, endTime: string | null) {
    function formatTime(value: string | null) {
      if (!value) {
        return "-";
      }

      const [hours = "00", minutes = "00"] = value.split(":");
      return `${hours}:${minutes}`;
    }

    if (!startTime && !endTime) {
      return "-";
    }

    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
  }

  function openDatePicker() {
    const input = dateInputRef.current;
    if (!input) {
      return;
    }

    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker();
      return;
    }

    input.focus();
    input.click();
  }

  function clearAllFiltersAndSort() {
    setLocationFilter("all");
    setStatusFilter("all");
    setServiceFilter("all");
    setDateFilter("");
    setSortBy("date");
    setSortOrder("asc");
  }

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
          .select("id, name, phone, email, service, location, date, start_time, end_time, status, remark")
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

  const locationOptions = useMemo(
    () => Array.from(new Set(appointments.map((item) => item.location).filter((item): item is string => Boolean(item)))),
    [appointments],
  );

  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          appointments
            .map((item) => item.status)
            .filter((item): item is NonNullable<AppointmentRow["status"]> => Boolean(item)),
        ),
      ),
    [appointments],
  );

  const serviceOptions = useMemo(
    () => Array.from(new Set(appointments.map((item) => item.service).filter((item): item is string => Boolean(item)))),
    [appointments],
  );

  const displayedAppointments = useMemo(() => {
    const filtered = appointments.filter((appointment) => {
      const matchesLocation = locationFilter === "all" || appointment.location === locationFilter;
      const matchesStatus = statusFilter === "all" || appointment.status === statusFilter;
      const matchesService = serviceFilter === "all" || appointment.service === serviceFilter;
      const matchesDate = !dateFilter || appointment.date === dateFilter;
      return matchesLocation && matchesStatus && matchesService && matchesDate;
    });

    const sorted = [...filtered].sort((a, b) => {
      const direction = sortOrder === "asc" ? 1 : -1;

      if (sortBy === "date") {
        const left = a.date ?? "";
        const right = b.date ?? "";
        return left.localeCompare(right) * direction;
      }

      if (sortBy === "status") {
        const left = a.status ?? "";
        const right = b.status ?? "";
        return left.localeCompare(right) * direction;
      }

      if (sortBy === "service") {
        const left = a.service ?? "";
        const right = b.service ?? "";
        return left.localeCompare(right) * direction;
      }

      const left = a.location ?? "";
      const right = b.location ?? "";
      return left.localeCompare(right) * direction;
    });

    return sorted;
  }, [appointments, dateFilter, locationFilter, serviceFilter, sortBy, sortOrder, statusFilter]);

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
        <div className="text-xs text-slate-500">{displayedAppointments.length} / {appointments.length} record(s)</div>
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="text-xs text-slate-600">
          <span className="mb-1 block">Location</span>
          <select
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
          >
            <option value="all">All</option>
            {locationOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-600">
          <span className="mb-1 block">Date</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openDatePicker}
              className="inline-flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2 text-left text-xs text-slate-700"
            >
              <CalendarDays className="h-4 w-4 text-slate-500" />
              <span>{dateFilter || "Select date"}</span>
            </button>
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter("")}
                className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-600"
              >
                Clear
              </button>
            )}
          </div>
          <input
            ref={dateInputRef}
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            type="date"
            className="sr-only"
            aria-label="Select date"
          />
        </label>

        <label className="text-xs text-slate-600">
          <span className="mb-1 block">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
          >
            <option value="all">All</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-600">
          <span className="mb-1 block">Service</span>
          <select
            value={serviceFilter}
            onChange={(event) => setServiceFilter(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
          >
            <option value="all">All</option>
            {serviceOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-600">
          <span className="mb-1 block">Sort By</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as "date" | "status" | "service" | "location")}
            className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
          >
            <option value="date">Date</option>
            <option value="status">Status</option>
            <option value="service">Service</option>
            <option value="location">Location</option>
          </select>
        </label>

        <label className="text-xs text-slate-600">
          <span className="mb-1 block">Sort Order</span>
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as "asc" | "desc")}
            className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>

        <div className="text-xs text-slate-600 sm:col-span-2 lg:col-span-3 xl:col-span-6">
          <span className="mb-1 block">Actions</span>
          <button
            type="button"
            onClick={clearAllFiltersAndSort}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Clear all filters and sorting
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {displayedAppointments.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            No appointments found for the selected filters.
          </div>
        )}

        {displayedAppointments.map((appointment) => {
          const isExpanded = expandedIds.has(appointment.id);
          return (
            <article key={appointment.id} className="rounded-2xl bg-slate-50 p-4">
              <button
                type="button"
                onClick={() => toggleExpanded(appointment.id)}
                className="flex w-full items-center justify-between gap-4 text-left"
              >
                <div className="grid flex-1 grid-cols-2 gap-3 text-xs text-slate-600 lg:grid-cols-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Name</div>
                    <div className="text-sm font-semibold text-slate-950">{appointment.name ?? "Unnamed appointment"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Date</div>
                    <div className="text-sm text-slate-800">{appointment.date ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Slot</div>
                    <div className="text-sm text-slate-800">{getSlot(appointment.start_time, appointment.end_time)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Status</div>
                    <div className="text-sm text-slate-800">{appointment.status ?? "tentative"}</div>
                  </div>
                </div>

                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${isExpanded ? "rotate-180" : "rotate-0"}`} />
              </button>

              {isExpanded && (
                <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                  <div>ID: {appointment.id}</div>
                  <div>Phone: {appointment.phone ?? "-"}</div>
                  <div>Email: {appointment.email ?? "-"}</div>
                  <div>Service: {appointment.service ?? "-"}</div>
                  <div>Location: {appointment.location ?? "-"}</div>
                  <div>Remark: {appointment.remark ?? "-"}</div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}