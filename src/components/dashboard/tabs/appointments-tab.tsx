"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  Edit3,
  Filter,
  Loader2,
  MapPin,
  Plus,
  Search,
  X,
} from "lucide-react";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagedList } from "@/hooks/use-paged-list";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  fetchAppointmentFilterOptions,
  fetchAppointmentsPage,
  type AppointmentRow,
} from "@/lib/appointment-queries";
import {
  formatAppointmentDuration,
  formatAppointmentTimeRange,
  formatUtcToIst,
} from "@/lib/time-utils";
import { getSupabaseClient } from "@/lib/supabase";

type AppointmentFormState = {
  name: string;
  phone: string;
  email: string;
  service: string;
  staff_name: string;
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

type ModalMode = "add" | "edit" | "reschedule" | null;

type GroupKey = "today" | "tomorrow" | "upcoming" | "past";

const initialForm: AppointmentFormState = {
  name: "",
  phone: "",
  email: "",
  service: "",
  staff_name: "",
  location: "",
  date: "",
  start_time: "",
  end_time: "",
  status: "tentative",
  remark: "",
};

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getInitials(name: string | null) {
  if (!name) {
    return "?";
  }

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function SearchableCreatableField({
  label,
  required,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const normalizedValue = value.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    const unique = Array.from(new Set(options.map((option) => option.trim()).filter(Boolean)));
    if (!normalizedValue) {
      return unique;
    }
    return unique.filter((option) => option.toLowerCase().includes(normalizedValue));
  }, [normalizedValue, options]);

  const exactMatch = options.some((option) => option.trim().toLowerCase() === normalizedValue);
  const canCreate = normalizedValue.length > 0 && !exactMatch;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedValue, open]);

  function selectOption(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <label className="relative space-y-1 text-sm text-muted-foreground">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <div ref={containerRef} className="relative">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
                setOpen(true);
                return;
              }

              if (event.key === "Escape") {
                setOpen(false);
                return;
              }

              const itemCount = filteredOptions.length + (canCreate ? 1 : 0);
              if (itemCount === 0) {
                return;
              }

              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) => (current + 1) % itemCount);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => (current - 1 + itemCount) % itemCount);
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (canCreate && activeIndex === filteredOptions.length) {
                  selectOption(value.trim());
                  return;
                }
                const option = filteredOptions[activeIndex];
                if (option) {
                  selectOption(option);
                } else if (canCreate) {
                  selectOption(value.trim());
                }
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
            className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted-foreground"
          />
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        {open && (
          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-soft">
            {filteredOptions.length === 0 && !canCreate ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No matches. Type to add a new value.</p>
            ) : (
              <ul role="listbox">
                {filteredOptions.map((option, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <li key={option}>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectOption(option);
                        }}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={
                          isActive
                            ? "flex w-full px-3 py-2 text-left text-sm bg-primary/10 text-primary"
                            : "flex w-full px-3 py-2 text-left text-sm text-text hover:bg-muted"
                        }
                      >
                        {option}
                      </button>
                    </li>
                  );
                })}
                {canCreate && (
                  <li>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectOption(value.trim());
                      }}
                      onMouseEnter={() => setActiveIndex(filteredOptions.length)}
                      className={
                        activeIndex === filteredOptions.length
                          ? "flex w-full flex-col items-start border-t border-border bg-primary/10 px-3 py-2 text-left"
                          : "flex w-full flex-col items-start border-t border-border px-3 py-2 text-left hover:bg-muted"
                      }
                    >
                      <span className="text-sm font-medium text-primary">Add “{value.trim()}”</span>
                      <span className="text-xs text-muted-foreground">Save as a new option</span>
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </label>
  );
}

function getGroupKey(date: string | null): GroupKey {
  if (!date) {
    return "upcoming";
  }

  const today = formatUtcToIst(new Date().toISOString()).slice(0, 10);
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatUtcToIst(tomorrowDate.toISOString()).slice(0, 10);

  if (date === today) {
    return "today";
  }

  if (date === tomorrow) {
    return "tomorrow";
  }

  return date < today ? "past" : "upcoming";
}

export default function AppointmentsTab({ clientId }: { clientId: string }) {
  const [expandedIds, setExpandedIds] = usePersistentState<string[]>("appointments-tab-expanded-ids", []);
  const [locationFilter, setLocationFilter] = usePersistentState("appointments-tab-location-filter", "all");
  const [statusFilter, setStatusFilter] = usePersistentState("appointments-tab-status-filter", "all");
  const [serviceFilter, setServiceFilter] = usePersistentState("appointments-tab-service-filter", "all");
  const [staffFilter, setStaffFilter] = usePersistentState("appointments-tab-staff-filter", "all");
  const [searchQuery, setSearchQuery] = usePersistentState("appointments-tab-search-query", "");
  const [dateFilter, setDateFilter] = usePersistentState("appointments-tab-date-filter", "");
  const [dateFilterMode, setDateFilterMode] = usePersistentState<"day" | "month" | "year">(
    "appointments-tab-date-filter-mode",
    "day",
  );
  const [sortBy, setSortBy] = usePersistentState<"date" | "status" | "service" | "location">(
    "appointments-tab-sort-by",
    "date",
  );
  const [sortOrder, setSortOrder] = usePersistentState<"asc" | "desc">("appointments-tab-sort-order", "asc");
  const [showFilters, setShowFilters] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentRow | null>(null);
  const [addError, setAddError] = usePersistentState<string | null>("appointments-tab-add-error", null);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange | null>(null);
  const [statusChangeError, setStatusChangeError] = usePersistentState<string | null>("appointments-tab-status-change-error", null);
  const [form, setForm] = usePersistentState<AppointmentFormState>("appointments-tab-form", initialForm);
  const [filterOptions, setFilterOptions] = useState<{
    locations: string[];
    services: string[];
    staff: string[];
    statuses: string[];
  }>({ locations: [], services: [], staff: [], statuses: [] });
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const pagedAppointments = usePagedList<AppointmentRow>({
    resetKey: `${clientId}|${debouncedSearch}|${locationFilter}|${statusFilter}|${serviceFilter}|${staffFilter}|${dateFilter}|${dateFilterMode}|${sortBy}|${sortOrder}`,
    enabled: Boolean(clientId),
    fetchPage: ({ limit, offset }) =>
      fetchAppointmentsPage(clientId, {
        limit,
        offset,
        search: debouncedSearch,
        location: locationFilter,
        status: statusFilter,
        service: serviceFilter,
        staff: staffFilter,
        dateFilter: dateFilter || undefined,
        dateFilterMode,
        sortBy,
        sortOrder,
      }),
  });

  const loading = pagedAppointments.loading;
  const error = pagedAppointments.error;
  const displayedAppointments = pagedAppointments.items;

  function resetForm() {
    setForm(initialForm);
    setAddError(null);
  }

  function openAddModal() {
    setEditingAppointment(null);
    resetForm();
    setModalMode("add");
  }

  function openEditModal(appointment: AppointmentRow, mode: Exclude<ModalMode, "add" | null>) {
    setEditingAppointment(appointment);
    setForm({
      name: appointment.name ?? "",
      phone: appointment.phone ?? "",
      email: appointment.email ?? "",
      service: appointment.service ?? "",
      staff_name: appointment.staff_name ?? "",
      location: appointment.location ?? "",
      date: appointment.date ?? "",
      start_time: appointment.start_time ?? "",
      end_time: appointment.end_time ?? "",
      status: appointment.status ?? "tentative",
      remark: appointment.remark ?? "",
    });
    setModalMode(mode);
  }

  function clearAllFiltersAndSort() {
    setLocationFilter("all");
    setStatusFilter("all");
    setServiceFilter("all");
    setStaffFilter("all");
    setDateFilter("");
    setDateFilterMode("day");
    setSortBy("date");
    setSortOrder("asc");
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function handleSaveAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddError(null);

    const phoneDigits = form.phone.replace(/\D/g, "");

    if (!form.name.trim()) {
      setAddError("Customer name is required.");
      return;
    }

    if (!phoneDigits) {
      setAddError("Phone number is required.");
      return;
    }

    if (!/^\d{10}$/.test(phoneDigits)) {
      setAddError("Phone number must be exactly 10 digits.");
      return;
    }

    if (!form.service.trim()) {
      setAddError("Service is required.");
      return;
    }

    if (!form.date) {
      setAddError("Date is required.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setAddError("Missing Supabase environment variables.");
      return;
    }

    const payload = {
      name: toNullable(form.name),
      phone: phoneDigits,
      email: toNullable(form.email),
      service: toNullable(form.service),
      staff_name: toNullable(form.staff_name),
      location: toNullable(form.location),
      date: form.date,
      start_time: toNullable(form.start_time),
      end_time: toNullable(form.end_time),
      status: form.status,
      remark: toNullable(form.remark),
    };

    try {
      setIsSaving(true);

      if (!editingAppointment) {
        const { error: insertError } = await client
          .from("appointments")
          .insert({ client_id: clientId, ...payload });

        if (insertError) {
          throw insertError;
        }
      } else {
        const { error: updateError } = await client.from("appointments").update(payload).eq("id", editingAppointment.id);
        if (updateError) {
          throw updateError;
        }
      }

      await pagedAppointments.refresh();
      const options = await fetchAppointmentFilterOptions(clientId);
      const nextServices = Array.from(
        new Set([...options.services, form.service.trim()].filter(Boolean)),
      ).sort();
      const nextStaff = Array.from(
        new Set([...options.staff, form.staff_name.trim()].filter(Boolean)),
      ).sort();
      setFilterOptions({
        ...options,
        services: nextServices,
        staff: nextStaff,
      });

      setModalMode(null);
      setEditingAppointment(null);
      resetForm();
    } catch (saveError) {
      setAddError(saveError instanceof Error ? saveError.message : "Unable to save appointment.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(appointmentId: string, nextStatus: AppointmentRow["status"]) {
    if (updatingIds.has(appointmentId)) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    try {
      setUpdatingIds((current) => new Set(current).add(appointmentId));
      const { error: updateError } = await client.from("appointments").update({ status: nextStatus }).eq("id", appointmentId);

      if (updateError) {
        throw updateError;
      }

      await pagedAppointments.refresh();
    } catch (changeError) {
      setStatusChangeError(changeError instanceof Error ? changeError.message : "Failed to update appointment status.");
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

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const options = await fetchAppointmentFilterOptions(clientId);
        if (mounted) {
          setFilterOptions(options);
        }
      } catch {
        if (mounted) {
          setFilterOptions({ locations: [], services: [], staff: [], statuses: [] });
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [clientId]);

  const locationOptions = filterOptions.locations;
  const serviceOptions = filterOptions.services;
  const staffOptions = filterOptions.staff;
  const statusOptions = filterOptions.statuses as Array<NonNullable<AppointmentRow["status"]>>;

  const groupedAppointments = useMemo(() => {
    const groups: Record<GroupKey, AppointmentRow[]> = {
      today: [],
      tomorrow: [],
      upcoming: [],
      past: [],
    };

    displayedAppointments.forEach((appointment) => {
      groups[getGroupKey(appointment.date)].push(appointment);
    });

    return groups;
  }, [displayedAppointments]);

  const summaryCounts = useMemo(() => {
    const groups: Record<GroupKey, number> = {
      today: 0,
      tomorrow: 0,
      upcoming: 0,
      past: 0,
    };

    displayedAppointments.forEach((appointment) => {
      groups[getGroupKey(appointment.date)] += 1;
    });

    return groups;
  }, [displayedAppointments]);

  if (loading && displayedAppointments.length === 0) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-white/10 bg-[#080808] text-base text-white/60 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching appointments
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-500/40 bg-[#080808] p-6 text-base text-rose-400 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        Unable to load appointments: {error}
      </div>
    );
  }

  return (
    <section className="space-y-5 rounded-[28px] border border-white/10 bg-[#080808] p-5 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:p-6">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            aria-expanded={showFilters}
            className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${
              showFilters
                ? "border-red-500/40 bg-red-500/10 text-white"
                : "border-white/10 bg-black/30 text-white/80 hover:border-white/20 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            <Plus className="h-4 w-4" />
            Add appointment
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {[
          { key: "today" as const, label: "Today", accent: "bg-red-500", count: summaryCounts.today },
          { key: "tomorrow" as const, label: "Tomorrow", accent: "bg-purple-600", count: summaryCounts.tomorrow },
          { key: "upcoming" as const, label: "Upcoming", accent: "bg-blue-600", count: summaryCounts.upcoming },
          { key: "past" as const, label: "Total", accent: "bg-slate-700", count: pagedAppointments.totalCount ?? displayedAppointments.length },
        ].map((card) => (
          <article key={card.key} className="rounded-2xl border border-white/10 bg-[#111111] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.25)]">
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.accent}`}>
                <CalendarDays className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-sm text-white/60">{card.label}</div>
                <div className="text-3xl font-semibold text-white">{card.count}</div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {showFilters && (
        <div className="grid gap-3 rounded-2xl border border-white/10 bg-[#111111] p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="space-y-1 text-sm text-white/70 xl:col-span-2">
            <span className="block text-white/60">Search</span>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search or type new customer name"
                className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted-foreground"
              />
            </div>
          </label>

          <label className="space-y-1 text-sm text-white/70">
            <span className="block text-white/60">Location</span>
            <select
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-2 py-2 text-sm text-text"
            >
              <option value="all">All</option>
              {locationOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-white/70">
            <span className="block text-white/60">Date</span>
            <div className="space-y-2">
              <select
                value={dateFilterMode}
                onChange={(event) => {
                  setDateFilterMode(event.target.value as "day" | "month" | "year");
                  setDateFilter("");
                }}
                className="w-full rounded-xl border border-border bg-background px-2 py-2 text-sm text-text"
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
                  className="w-full rounded-xl border border-border bg-background px-2 py-2 text-sm text-text placeholder:text-muted-foreground"
                  aria-label="Filter by year"
                />
              ) : (
                <button
                  type="button"
                  onClick={openDatePicker}
                  className="inline-flex w-full items-center gap-2 rounded-xl border border-border bg-background px-2 py-2 text-left text-sm text-text"
                >
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <span>{dateFilter || (dateFilterMode === "day" ? "Select date" : "Select month")}</span>
                </button>
              )}

              {dateFilter && (
                <button
                  type="button"
                  onClick={() => setDateFilter("")}
                  className="rounded-xl border border-border bg-background px-2 py-2 text-sm text-muted-foreground"
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

          <label className="space-y-1 text-sm text-white/70">
            <span className="block text-white/60">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-2 py-2 text-sm text-text"
            >
              <option value="all">All</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-white/70">
            <span className="block text-white/60">Service</span>
            <select
              value={serviceFilter}
              onChange={(event) => setServiceFilter(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-2 py-2 text-sm text-text"
            >
              <option value="all">All</option>
              {serviceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-white/70">
            <span className="block text-white/60">Staff</span>
            <select
              value={staffFilter}
              onChange={(event) => setStaffFilter(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-2 py-2 text-sm text-text"
            >
              <option value="all">All</option>
              {staffOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-6">
            <div className="mb-1 text-sm text-white/60">Actions</div>
            <button
              type="button"
              onClick={clearAllFiltersAndSort}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-text hover:bg-muted"
            >
              Clear all filters and sorting
            </button>
          </div>
        </div>
      )}

      {statusChangeError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-400">
          {statusChangeError}
        </div>
      )}

      <div className="space-y-4">
        {displayedAppointments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#111111] p-6 text-base text-white/60">
            No appointments found for the selected filters.
          </div>
        ) : null}

        {(["today", "tomorrow", "upcoming", "past"] as const).map((groupKey) => {
          const groupItems = groupedAppointments[groupKey];
          if (groupItems.length === 0) {
            return null;
          }

          const groupLabel = groupKey.charAt(0).toUpperCase() + groupKey.slice(1);

          return (
            <section key={groupKey} className="space-y-3 rounded-2xl border border-white/10 bg-[#111111] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-white/80">
                  <CalendarDays className="h-4 w-4 text-red-500" />
                  <span className="font-semibold">{groupLabel}</span>
                  <span className="text-sm text-white/50">• {groupItems.length} appointments</span>
                </div>
                <button type="button" className="text-sm text-white/50 hover:text-white">
                  View all
                </button>
              </div>

              <div className="space-y-3">
                {groupItems.map((appointment) => {
                  const isExpanded = expandedIds.includes(appointment.id);
                  const statusTone =
                    appointment.status === "booked"
                      ? "bg-blue-500/20 text-blue-300"
                      : appointment.status === "completed"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : appointment.status === "cancelled"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-amber-500/20 text-amber-300";

                  return (
                    <article
                      key={appointment.id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-white/20 hover:bg-black/30"
                    >
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(appointment.id)}
                          className="grid flex-1 grid-cols-[96px_56px_1fr_240px_auto] items-center gap-4 text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-xl font-semibold text-white">
                              {formatAppointmentTimeRange(appointment.date, appointment.start_time, appointment.end_time)}
                            </div>
                          </div>

                          <div className="flex items-center justify-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                              {getInitials(appointment.name)}
                            </div>
                          </div>

                          <div className="min-w-0">
                            <div className="truncate text-base font-semibold text-white">
                              {appointment.name ?? "Unnamed appointment"}
                            </div>
                            <div className="truncate text-sm text-white/55">{appointment.phone ?? "-"}</div>
                          </div>

                          <div className="hidden min-w-0 lg:block">
                            <div className="truncate text-base font-semibold text-white">{appointment.service ?? "-"}</div>
                            <div className="flex items-center gap-1 text-sm text-white/55">
                              <MapPin className="h-3.5 w-3.5" />
                              {appointment.location ?? "-"}
                            </div>
                          </div>

                          <div className="flex items-center justify-end">
                            <span className={`rounded-xl px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusTone}`}>
                              {appointment.status ?? "tentative"}
                            </span>
                          </div>
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(appointment, "reschedule")}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:border-white/20 hover:text-white"
                            title="Reschedule"
                            aria-label="Reschedule appointment"
                          >
                            <Clock3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(appointment, "edit")}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:border-white/20 hover:text-white"
                            title="Edit"
                            aria-label="Edit appointment"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingStatusChange({
                                appointmentId: appointment.id,
                                appointmentName: appointment.name ?? "Unnamed appointment",
                                nextStatus: "cancelled",
                              });
                            }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:border-rose-500/30 hover:text-rose-300"
                            title="Cancel"
                            aria-label="Cancel appointment"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleExpanded(appointment.id)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:border-white/20 hover:text-white"
                            aria-label={isExpanded ? "Collapse details" : "Expand details"}
                          >
                            <ChevronDown className={`h-4 w-4 transition ${isExpanded ? "rotate-180" : "rotate-0"}`} />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 text-sm text-white/60 sm:grid-cols-2 lg:grid-cols-4">
                          <div>Customer: {appointment.name ?? "-"}</div>
                          <div>Phone: {appointment.phone ?? "-"}</div>
                          <div>Email: {appointment.email ?? "-"}</div>
                          <div>Service: {appointment.service ?? "-"}</div>
                          <div>Staff: {appointment.staff_name ?? "-"}</div>
                          <div>Location: {appointment.location ?? "-"}</div>
                          <div>Slot: {formatAppointmentDuration(appointment.start_time, appointment.end_time, appointment.date)}</div>
                          <div>Date: {appointment.date ?? "-"}</div>
                          <div className="sm:col-span-2 lg:col-span-4">Remark: {appointment.remark ?? "-"}</div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {displayedAppointments.length > 0 && (
        <ListPaginationControls
          loadedCount={pagedAppointments.items.length}
          totalCount={pagedAppointments.totalCount}
          hasMore={pagedAppointments.hasMore}
          loading={pagedAppointments.loadingMore}
          onShowMore={() => void pagedAppointments.showMore()}
          onShowAll={() => void pagedAppointments.showAll()}
          itemLabel="appointments"
        />
      )}

      <EntityModal
        open={modalMode !== null}
        title={modalMode === "reschedule" ? "Reschedule Appointment" : modalMode === "edit" ? "Edit Appointment" : "Add New Appointment"}
        contentClassName="sm:max-w-2xl"
        onClose={() => {
          setModalMode(null);
          setEditingAppointment(null);
          resetForm();
        }}
      >
        <form onSubmit={handleSaveAppointment} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-muted-foreground sm:col-span-2">
              <span>Customer *</span>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Search or type new customer name"
                  className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted-foreground"
                />
              </div>
            </label>

            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Phone *</span>
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value.replace(/\D/g, "").slice(0, 10),
                  }))
                }
                inputMode="numeric"
                pattern="\d{10}"
                maxLength={10}
                placeholder="10-digit phone number"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-muted-foreground"
              />
            </label>

            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Email</span>
              <input
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                type="email"
                placeholder="Email"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-muted-foreground"
              />
            </label>

            <SearchableCreatableField
              label="Service"
              required
              value={form.service}
              options={serviceOptions}
              placeholder="Search or add service"
              onChange={(service) => setForm((current) => ({ ...current, service }))}
            />

            <SearchableCreatableField
              label="Staff"
              value={form.staff_name}
              options={staffOptions}
              placeholder="Search or add staff"
              onChange={(staff_name) => setForm((current) => ({ ...current, staff_name }))}
            />

            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Location</span>
              <select
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
              >
                <option value="">Select location</option>
                {Array.from(
                  new Set(
                    [...(locationOptions ?? []), form.location].filter((value) => Boolean(value?.trim())),
                  ),
                ).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm text-muted-foreground sm:col-span-2">
              <span>Date *</span>
              <input
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                type="date"
                required
                className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:text-sm"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-muted-foreground">
                <span>Start time *</span>
                <input
                  value={form.start_time}
                  onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))}
                  type="time"
                  className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:text-sm"
                />
              </label>

              <label className="space-y-1 text-sm text-muted-foreground">
                <span>End time</span>
                <input
                  value={form.end_time}
                  onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))}
                  type="time"
                  className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:text-sm"
                />
              </label>
            </div>

            <label className="space-y-1 text-sm text-muted-foreground sm:col-span-2">
              <span>Duration</span>
              <input
                readOnly
                value={formatAppointmentDuration(form.start_time, form.end_time, form.date)}
                placeholder="Auto from time range"
                className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-muted-foreground"
              />
            </label>

            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Status *</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as AppointmentFormState["status"],
                  }))
                }
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
              >
                <option value="tentative">Tentative</option>
                <option value="booked">Booked</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Completed</option>
              </select>
            </label>

            <label className="space-y-1 text-sm text-muted-foreground sm:col-span-2">
              <span>Notes</span>
              <textarea
                value={form.remark}
                onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
                placeholder="Add notes about the appointment"
                className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-muted-foreground"
              />
            </label>
          </div>

          {addError && <p className="text-sm text-rose-400">{addError}</p>}

          <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-card px-4 pt-4 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:px-0 sm:pt-0">
            <button
              type="button"
              onClick={() => {
                setModalMode(null);
                setEditingAppointment(null);
                resetForm();
              }}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground hover:bg-muted sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="min-h-11 w-full rounded-xl border border-border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isSaving ? "Saving..." : "Save appointment"}
            </button>
          </div>
        </form>
      </EntityModal>

      <EntityModal open={Boolean(pendingStatusChange)} title="Confirm status change" onClose={() => setPendingStatusChange(null)}>
        <div className="space-y-4">
          <p className="text-base text-muted-foreground">
            Change status for <span className="font-semibold text-text">{pendingStatusChange?.appointmentName}</span> to{" "}
            <span className="font-semibold text-text">{pendingStatusChange?.nextStatus}</span>?
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setPendingStatusChange(null)}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground hover:bg-muted sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmStatusChange()}
              disabled={Boolean(pendingStatusChange && updatingIds.has(pendingStatusChange.appointmentId))}
              className="min-h-11 w-full rounded-xl border border-border bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {pendingStatusChange && updatingIds.has(pendingStatusChange.appointmentId) ? "Updating..." : "Confirm"}
            </button>
          </div>
        </div>
      </EntityModal>
    </section>
  );
}
