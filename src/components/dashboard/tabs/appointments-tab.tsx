"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Loader2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";

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

type AppointmentFormState = {
  name: string;
  phone: string;
  email: string;
  service: string;
  location: string;
  date: string;
  start_time: string;
  end_time: string;
  status: "tentative" | "booked" | "cancelled" | "completed";
  remark: string;
};

type PendingStatusChange = {
  appointmentId: string;
  appointmentName: string;
  nextStatus: "tentative" | "booked" | "cancelled" | "completed";
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
  const [dateFilterMode, setDateFilterMode] = useState<"day" | "month" | "year">("day");
  const [sortBy, setSortBy] = useState<"date" | "status" | "service" | "location">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange | null>(null);
  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);
  const [newAppointment, setNewAppointment] = useState<AppointmentFormState>({
    name: "",
    phone: "",
    email: "",
    service: "",
    location: "",
    date: "",
    start_time: "",
    end_time: "",
    status: "tentative",
    remark: "",
  });
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  function toNullable(value: string) {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function resetNewAppointmentForm() {
    setNewAppointment({
      name: "",
      phone: "",
      email: "",
      service: "",
      location: "",
      date: "",
      start_time: "",
      end_time: "",
      status: "tentative",
      remark: "",
    });
  }

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
    if (dateFilterMode === "year") {
      return;
    }

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
    setDateFilterMode("day");
    setSortBy("date");
    setSortOrder("asc");
  }

  async function handleAddAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddError(null);

    if (!newAppointment.date) {
      setAddError("Date is required.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setAddError("Missing Supabase environment variables.");
      return;
    }

    try {
      setIsSaving(true);

      const payload = {
        client_id: clientId,
        name: toNullable(newAppointment.name),
        phone: toNullable(newAppointment.phone),
        email: toNullable(newAppointment.email),
        service: toNullable(newAppointment.service),
        location: toNullable(newAppointment.location),
        date: newAppointment.date,
        start_time: toNullable(newAppointment.start_time),
        end_time: toNullable(newAppointment.end_time),
        status: newAppointment.status,
        remark: toNullable(newAppointment.remark),
      };

      const { data, error } = await client
        .from("appointments")
        .insert(payload)
        .select("id, name, phone, email, service, location, date, start_time, end_time, status, remark")
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        setAppointments((current) => [data as AppointmentRow, ...current]);
      }

      resetNewAppointmentForm();
      setShowAddForm(false);
    } catch (saveError) {
      setAddError(saveError instanceof Error ? saveError.message : "Unable to add appointment.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(appointmentId: string, newStatus: AppointmentRow["status"]) {
    if (updatingIds.has(appointmentId)) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    try {
      setUpdatingIds((current) => new Set(current).add(appointmentId));

      const { error } = await client
        .from("appointments")
        .update({ status: newStatus })
        .eq("id", appointmentId);

      if (error) {
        throw error;
      }

      setAppointments((current) =>
        current.map((apt) => (apt.id === appointmentId ? { ...apt, status: newStatus } : apt)),
      );
    } catch (err) {
      setStatusChangeError(err instanceof Error ? err.message : "Failed to update appointment status.");
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(appointmentId);
        return next;
      });
    }
  }

  async function confirmStatusChange() {
    if (!pendingStatusChange) {
      return;
    }

    const { appointmentId, nextStatus } = pendingStatusChange;
    await handleStatusChange(appointmentId, nextStatus);
    setPendingStatusChange(null);
  }

  function matchesDateFilter(appointmentDate: string | null) {
    if (!dateFilter) {
      return true;
    }

    if (!appointmentDate) {
      return false;
    }

    if (dateFilterMode === "day") {
      return appointmentDate === dateFilter;
    }

    if (dateFilterMode === "month") {
      return appointmentDate.startsWith(dateFilter);
    }

    return appointmentDate.startsWith(dateFilter);
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
      const matchesDate = matchesDateFilter(appointment.date);
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
  }, [appointments, dateFilter, dateFilterMode, locationFilter, serviceFilter, sortBy, sortOrder, statusFilter]);

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-border bg-card text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching appointments
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-500/40 bg-card p-6 text-sm text-rose-400">
        Unable to load appointments: {error}
      </div>
    );
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-6 text-foreground shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Appointments</h2>
          <p className="mt-1 text-sm text-muted-foreground">Filtered by client_id and ready for RLS.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">{displayedAppointments.length} / {appointments.length} record(s)</div>
          <button
            type="button"
            onClick={() => {
              setAddError(null);
              setShowAddForm((current) => !current);
            }}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
          >
            {showAddForm ? "Close" : "Add appointment"}
          </button>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddAppointment} className="mt-4 rounded-2xl border border-border bg-muted/40 p-4 text-foreground">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input
              value={newAppointment.name}
              onChange={(event) => setNewAppointment((current) => ({ ...current, name: event.target.value }))}
              placeholder="Name"
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
            />
            <input
              value={newAppointment.phone}
              onChange={(event) => setNewAppointment((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Phone"
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
            />
            <input
              value={newAppointment.email}
              onChange={(event) => setNewAppointment((current) => ({ ...current, email: event.target.value }))}
              type="email"
              placeholder="Email"
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
            />
            <input
              value={newAppointment.service}
              onChange={(event) => setNewAppointment((current) => ({ ...current, service: event.target.value }))}
              placeholder="Service"
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
            />
            <input
              value={newAppointment.location}
              onChange={(event) => setNewAppointment((current) => ({ ...current, location: event.target.value }))}
              placeholder="Location"
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
            />
            <select
              value={newAppointment.status}
              onChange={(event) =>
                setNewAppointment((current) => ({
                  ...current,
                  status: event.target.value as "tentative" | "booked" | "cancelled" | "completed",
                }))
              }
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground"
            >
              <option value="tentative">tentative</option>
              <option value="booked">booked</option>
              <option value="cancelled">cancelled</option>
              <option value="completed">completed</option>
            </select>
            <input
              value={newAppointment.date}
              onChange={(event) => setNewAppointment((current) => ({ ...current, date: event.target.value }))}
              type="date"
              required
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground"
            />
            <input
              value={newAppointment.start_time}
              onChange={(event) => setNewAppointment((current) => ({ ...current, start_time: event.target.value }))}
              type="time"
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground"
            />
            <input
              value={newAppointment.end_time}
              onChange={(event) => setNewAppointment((current) => ({ ...current, end_time: event.target.value }))}
              type="time"
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground"
            />
            <textarea
              value={newAppointment.remark}
              onChange={(event) => setNewAppointment((current) => ({ ...current, remark: event.target.value }))}
              placeholder="Remark"
              className="min-h-20 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground sm:col-span-2 lg:col-span-3"
            />
          </div>

          {addError && <p className="mt-3 text-xs text-rose-700">{addError}</p>}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl border border-border bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save appointment"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddError(null);
                resetNewAppointmentForm();
              }}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground hover:bg-muted"
            >
              Reset form
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">Location</span>
          <select
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-2 py-2 text-xs text-foreground"
          >
            <option value="all">All</option>
            {locationOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">Date</span>
          <div className="space-y-2">
            <select
              value={dateFilterMode}
              onChange={(event) => {
                setDateFilterMode(event.target.value as "day" | "month" | "year");
                setDateFilter("");
              }}
              className="w-full rounded-xl border border-border bg-background px-2 py-2 text-xs text-foreground"
            >
              <option value="day">Day</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>

            {dateFilterMode === "year" ? (
              <input
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="YYYY"
                className="w-full rounded-xl border border-border bg-background px-2 py-2 text-xs text-foreground placeholder:text-muted-foreground"
                aria-label="Filter by year"
              />
            ) : (
              <button
                type="button"
                onClick={openDatePicker}
                className="inline-flex w-full items-center gap-2 rounded-xl border border-border bg-background px-2 py-2 text-left text-xs text-foreground"
              >
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span>
                  {dateFilter || (dateFilterMode === "day" ? "Select date" : "Select month")}
                </span>
              </button>
            )}

            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter("")}
                className="rounded-xl border border-border bg-background px-2 py-2 text-xs text-muted-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {dateFilterMode !== "year" && (
            <input
              ref={dateInputRef}
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              type={dateFilterMode === "day" ? "date" : "month"}
              className="sr-only"
              aria-label={dateFilterMode === "day" ? "Select date" : "Select month"}
            />
          )}
        </label>

        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-2 py-2 text-xs text-foreground"
          >
            <option value="all">All</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">Service</span>
          <select
            value={serviceFilter}
            onChange={(event) => setServiceFilter(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-2 py-2 text-xs text-foreground"
          >
            <option value="all">All</option>
            {serviceOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">Sort By</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as "date" | "status" | "service" | "location")}
            className="w-full rounded-xl border border-border bg-background px-2 py-2 text-xs text-foreground"
          >
            <option value="date">Date</option>
            <option value="status">Status</option>
            <option value="service">Service</option>
            <option value="location">Location</option>
          </select>
        </label>

        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">Sort Order</span>
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as "asc" | "desc")}
            className="w-full rounded-xl border border-border bg-background px-2 py-2 text-xs text-foreground"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>

        <div className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3 xl:col-span-6">
          <span className="mb-1 block">Actions</span>
          <button
            type="button"
            onClick={clearAllFiltersAndSort}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
          >
            Clear all filters and sorting
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {statusChangeError && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-400">
            {statusChangeError}
          </div>
        )}

        {displayedAppointments.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            No appointments found for the selected filters.
          </div>
        )}

        {displayedAppointments.map((appointment) => {
          const isExpanded = expandedIds.has(appointment.id);
          return (
            <article key={appointment.id} className="rounded-2xl bg-muted/40 p-4">
              <button
                type="button"
                onClick={() => toggleExpanded(appointment.id)}
                className="flex w-full items-center justify-between gap-4 text-left"
              >
                <div className="grid flex-1 grid-cols-2 gap-3 text-xs text-muted-foreground lg:grid-cols-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Name</div>
                    <div className="text-sm font-semibold text-foreground">{appointment.name ?? "Unnamed appointment"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Date</div>
                    <div className="text-sm text-foreground">{appointment.date ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Slot</div>
                    <div className="text-sm text-foreground">{getSlot(appointment.start_time, appointment.end_time)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Status</div>
                    <select
                      value={appointment.status ?? "tentative"}
                      onChange={(event) => {
                        event.stopPropagation();
                        setStatusChangeError(null);
                        setPendingStatusChange({
                          appointmentId: appointment.id,
                          appointmentName: appointment.name ?? "Unnamed appointment",
                          nextStatus: event.target.value as "tentative" | "booked" | "cancelled" | "completed",
                        });
                      }}
                      disabled={updatingIds.has(appointment.id)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="tentative">tentative</option>
                      <option value="booked">booked</option>
                      <option value="cancelled">cancelled</option>
                      <option value="completed">completed</option>
                    </select>
                  </div>
                </div>

                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${isExpanded ? "rotate-180" : "rotate-0"}`} />
              </button>

              {isExpanded && (
                <div className="mt-4 grid gap-2 border-t border-border pt-4 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
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

      <EntityModal
        open={Boolean(pendingStatusChange)}
        title="Confirm status change"
        onClose={() => setPendingStatusChange(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Change status for <span className="font-semibold text-text">{pendingStatusChange?.appointmentName}</span> to{" "}
            <span className="font-semibold text-text">{pendingStatusChange?.nextStatus}</span>?
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingStatusChange(null)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmStatusChange()}
              disabled={Boolean(pendingStatusChange && updatingIds.has(pendingStatusChange.appointmentId))}
              className="rounded-xl border border-border bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingStatusChange && updatingIds.has(pendingStatusChange.appointmentId) ? "Updating..." : "Confirm"}
            </button>
          </div>
        </div>
      </EntityModal>
    </section>
  );
}