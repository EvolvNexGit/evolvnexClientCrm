"use client";

import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
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
  Trash2,
  X,
} from "lucide-react";
import {
  AppointmentsCalendar,
  getAppointmentStatusTone,
  type CalendarSlot,
} from "@/components/dashboard/appointments-calendar";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAppointmentsRange } from "@/hooks/use-appointments-range";
import { usePagedList } from "@/hooks/use-paged-list";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  createAppointment,
  fetchAppointmentFilterOptions,
  fetchAppointmentsPage,
  setAppointmentStatus,
  softDeleteAppointment,
  updateAppointment,
  type AppointmentPayload,
  type AppointmentRow,
  type AppointmentStatus,
} from "@/lib/appointment-queries";
import {
  TIME_STEP_SECONDS,
  clockToMinutes,
  findAppointmentConflicts,
  getAppointmentInterval,
  getWeekDates,
  minutesToClock,
  snapTimeToStep,
} from "@/lib/appointment-schedule";
import {
  formatAppointmentDuration,
  formatAppointmentTimeRange,
  formatUtcToIst,
} from "@/lib/time-utils";
import { fetchCustomersPage } from "@/lib/billing-queries";
import type { CustomerRecord } from "@/lib/billing-types";
import { formatSupabaseError } from "@/lib/supabase";

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

/** Customer name input with server-side suggestions; selecting fills name/phone/email, free text still allowed. */
function CustomerPickerField({
  clientId,
  value,
  onTyping,
  onSelect,
}: {
  clientId: string;
  value: string;
  onTyping: (value: string) => void;
  onSelect: (customer: CustomerRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<CustomerRecord[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debouncedValue = useDebouncedValue(value, 250);

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
    if (!open || !clientId) {
      setLoading(false);
      return;
    }
    // Ignore stale responses when the query changes mid-flight.
    let cancelled = false;
    setLoading(true);
    fetchCustomersPage(clientId, { limit: 8, offset: 0, search: debouncedValue })
      .then((result) => {
        if (!cancelled) {
          setSuggestions(result.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, debouncedValue, open]);

  // -1 = nothing highlighted, so Enter keeps typed free text unless the user arrowed to a suggestion.
  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  function pick(customer: CustomerRecord) {
    onSelect(customer);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={value}
          onChange={(event) => {
            onTyping(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            } else if (event.key === "ArrowDown" && suggestions.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => (current + 1) % suggestions.length);
            } else if (event.key === "ArrowUp" && suggestions.length > 0) {
              event.preventDefault();
              setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              if (activeIndex >= 0 && suggestions[activeIndex]) {
                pick(suggestions[activeIndex]);
              } else {
                setOpen(false);
              }
            }
          }}
          placeholder="Search or type new customer name"
          autoComplete="off"
          className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted-foreground"
        />
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-soft">
          {suggestions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {loading ? "Searching..." : "No matching customers. Keep typing to add a new one."}
            </p>
          ) : (
            <ul role="listbox">
              {suggestions.map((customer, index) => (
                <li key={customer.id} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(customer)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-text hover:bg-muted ${
                      index === activeIndex ? "bg-muted" : ""
                    }`}
                  >
                    <span className="truncate">{customer.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{customer.phone ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
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
  const [expandedIds, setExpandedIds] = usePersistentState<string[]>(`appointments-tab-expanded-ids:${clientId}`, []);
  const [locationFilter, setLocationFilter] = usePersistentState(`appointments-tab-location-filter:${clientId}`, "all");
  const [statusFilter, setStatusFilter] = usePersistentState(`appointments-tab-status-filter:${clientId}`, "all");
  const [serviceFilter, setServiceFilter] = usePersistentState(`appointments-tab-service-filter:${clientId}`, "all");
  const [staffFilter, setStaffFilter] = usePersistentState(`appointments-tab-staff-filter:${clientId}`, "all");
  const [searchQuery, setSearchQuery] = usePersistentState(`appointments-tab-search-query:${clientId}`, "");
  const [dateFilter, setDateFilter] = usePersistentState(`appointments-tab-date-filter:${clientId}`, "");
  const [dateFilterMode, setDateFilterMode] = usePersistentState<"day" | "month" | "year">(
    `appointments-tab-date-filter-mode:${clientId}`,
    "day",
  );
  const [sortBy, setSortBy] = usePersistentState<"date" | "status" | "service" | "location">(
    `appointments-tab-sort-by:${clientId}`,
    "date",
  );
  const [sortOrder, setSortOrder] = usePersistentState<"asc" | "desc">(`appointments-tab-sort-order:${clientId}`, "asc");
  const [showFilters, setShowFilters] = useState(false);
  // Date option picked but no value entered yet (a preset or typed value would otherwise hide the input).
  const [pendingDateKind, setPendingDateKind] = useState<"day" | "month" | "year" | null>(null);
  const [viewMode, setViewMode] = usePersistentState<"list" | "day" | "week">(`appointments-tab-view-mode:${clientId}`, "list");
  const [calendarDate, setCalendarDate] = useState(() => formatUtcToIst(new Date().toISOString()).slice(0, 10));
  // Only today's group starts open; the rest stay collapsed until toggled.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<GroupKey, boolean>>({
    today: false,
    tomorrow: true,
    upcoming: true,
    past: true,
  });
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const moreOptionsId = useId();
  const filtersPanelId = useId();
  const dateFilterLabelId = useId();
  const [editingAppointment, setEditingAppointment] = useState<AppointmentRow | null>(null);
  const [addError, setAddError] = usePersistentState<string | null>(`appointments-tab-add-error:${clientId}`, null);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [statusChangeError, setStatusChangeError] = usePersistentState<string | null>(`appointments-tab-status-change-error:${clientId}`, null);
  const [form, setForm] = usePersistentState<AppointmentFormState>(`appointments-tab-form:${clientId}`, initialForm);
  const [filterOptions, setFilterOptions] = useState<{
    locations: string[];
    services: string[];
    staff: string[];
    statuses: string[];
  }>({ locations: [], services: [], staff: [], statuses: [] });

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

  const weekDates = useMemo(() => getWeekDates(calendarDate), [calendarDate]);
  const rangeFromDate = viewMode === "week" ? weekDates[0] : calendarDate;
  const rangeToDate = viewMode === "week" ? weekDates[weekDates.length - 1] : calendarDate;

  const rangeAppointments = useAppointmentsRange({
    clientId,
    fromDate: rangeFromDate,
    toDate: rangeToDate,
    enabled: viewMode !== "list" && Boolean(clientId),
  });

  // Advisory double-booking check (D-04): loads the modal date's own appointments so the List view and date edits are covered.
  const modalDayAppointments = useAppointmentsRange({
    clientId,
    fromDate: form.date,
    toDate: form.date,
    enabled: modalMode !== null && Boolean(clientId),
  });
  const slotConflicts = useMemo(
    () =>
      modalMode === null
        ? []
        : findAppointmentConflicts(
            {
              id: editingAppointment?.id ?? null,
              date: toNullable(form.date),
              start_time: toNullable(form.start_time),
              end_time: toNullable(form.end_time),
              staff_name: toNullable(form.staff_name),
              status: form.status,
            },
            modalDayAppointments.appointments,
          ),
    [
      modalMode,
      editingAppointment,
      form.date,
      form.start_time,
      form.end_time,
      form.staff_name,
      form.status,
      modalDayAppointments.appointments,
    ],
  );

  const loading = pagedAppointments.loading;
  const error = pagedAppointments.error;
  const displayedAppointments = pagedAppointments.items;

  // Optional fields stay collapsed unless the form being opened already carries a value, so edit, reschedule and slot-prefilled opens never hide data.
  useEffect(() => {
    if (modalMode === null) {
      return;
    }

    setShowMoreOptions(
      Boolean(
        form.email.trim() ||
          form.staff_name.trim() ||
          form.location.trim() ||
          form.end_time.trim() ||
          form.remark.trim() ||
          form.status !== "tentative",
      ),
    );
  }, [modalMode]);

  function resetForm() {
    setForm(initialForm);
    setAddError(null);
  }

  function openAddModal() {
    setEditingAppointment(null);
    resetForm();
    setModalMode("add");
  }

  /** Calendar slot click: same add modal and form state, prefilled from the slot (no second form). */
  function openAddModalFromSlot(slot: CalendarSlot) {
    setEditingAppointment(null);
    setAddError(null);
    setForm({
      ...initialForm,
      date: slot.date,
      start_time: slot.startTime,
      end_time: slot.endTime,
      staff_name: slot.staffName ?? "",
    });
    setModalMode("add");
  }

  /** Empty calendar state: same add modal with only the visible date prefilled. */
  function openAddModalForCalendarDate() {
    setEditingAppointment(null);
    setAddError(null);
    setForm({ ...initialForm, date: calendarDate });
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
    setPendingDateKind(null);
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
    if (isSaving) {
      return;
    }
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

    // noValidate skips the browser checks, so email and time-range rules are enforced here.
    const emailValue = form.email.trim();
    if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      setShowMoreOptions(true);
      setAddError("Enter a valid email address.");
      return;
    }

    const startMinutes = clockToMinutes(form.start_time);
    if (startMinutes === null) {
      setAddError("Start time is required.");
      return;
    }

    if (form.end_time.trim()) {
      const endMinutes = clockToMinutes(form.end_time);
      if (endMinutes === null || endMinutes <= startMinutes) {
        setShowMoreOptions(true);
        setAddError("End time must be after the start time.");
        return;
      }
    }

    // Reuse an existing option's spelling so the same name never splits into two staff/service values.
    const matchOptionCasing = (value: string, options: string[]) =>
      options.find((option) => option.trim().toLowerCase() === value.trim().toLowerCase())?.trim() ?? value;

    const payload: AppointmentPayload = {
      name: toNullable(form.name),
      phone: phoneDigits,
      email: toNullable(form.email),
      service: toNullable(matchOptionCasing(form.service, serviceOptions)),
      staff_name: toNullable(matchOptionCasing(form.staff_name, staffOptions)),
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
        await createAppointment(clientId, payload);
      } else {
        await updateAppointment(clientId, editingAppointment.id, payload);
      }
    } catch (saveError) {
      // Only a failed write keeps the modal open; a retry after a successful write would duplicate the row.
      setAddError(formatSupabaseError(saveError, "Unable to save appointment."));
      setIsSaving(false);
      return;
    }

    setModalMode(null);
    setEditingAppointment(null);
    resetForm();
    setIsSaving(false);

    // Follow-up refreshes are best-effort; the write already succeeded.
    const savedService = payload.service;
    const savedStaff = payload.staff_name;
    void Promise.allSettled([
      pagedAppointments.refresh(),
      rangeAppointments.refresh(),
      fetchAppointmentFilterOptions(clientId).then((options) => {
        setFilterOptions({
          ...options,
          services: Array.from(new Set([...options.services, savedService ?? ""].filter(Boolean))).sort(),
          staff: Array.from(new Set([...options.staff, savedStaff ?? ""].filter(Boolean))).sort(),
        });
      }),
    ]);
  }

  async function handleStatusChange(appointmentId: string, nextStatus: AppointmentStatus) {
    if (updatingIds.has(appointmentId)) {
      return;
    }

    try {
      setUpdatingIds((current) => new Set(current).add(appointmentId));
      await setAppointmentStatus(clientId, appointmentId, nextStatus);

      await pagedAppointments.refresh();
      await rangeAppointments.refresh();
    } catch (changeError) {
      setStatusChangeError(formatSupabaseError(changeError, "Failed to update appointment status."));
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

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError(null);
      await softDeleteAppointment(clientId, pendingDelete.id);
      await pagedAppointments.refresh();
      setPendingDelete(null);
    } catch (removeError) {
      setDeleteError(removeError instanceof Error ? removeError.message : "Unable to delete appointment.");
    } finally {
      setIsDeleting(false);
    }
  }

  const todayIst = formatUtcToIst(new Date().toISOString()).slice(0, 10);
  const tomorrowIst = formatUtcToIst(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()).slice(0, 10);
  const datePreset: "all" | "today" | "tomorrow" | "day" | "month" | "year" =
    pendingDateKind ??
    (!dateFilter
      ? "all"
      : dateFilterMode !== "day"
        ? dateFilterMode
        : dateFilter === todayIst
          ? "today"
          : dateFilter === tomorrowIst
            ? "tomorrow"
            : "day");

  function handleDatePresetChange(preset: string) {
    if (preset === "today" || preset === "tomorrow") {
      setPendingDateKind(null);
      setDateFilterMode("day");
      setDateFilter(preset === "today" ? todayIst : tomorrowIst);
    } else if (preset === "day" || preset === "month" || preset === "year") {
      setPendingDateKind(preset);
      setDateFilterMode(preset);
      setDateFilter("");
    } else {
      setPendingDateKind(null);
      setDateFilterMode("day");
      setDateFilter("");
    }
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
  const activeFilterCount =
    [locationFilter, statusFilter, serviceFilter, staffFilter].filter((value) => value !== "all").length +
    (dateFilter ? 1 : 0);

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

  if (viewMode === "list" && loading && displayedAppointments.length === 0) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-border bg-card text-base text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching appointments
        </span>
      </div>
    );
  }

  if (viewMode === "list" && error) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-card p-6 text-base text-primary">
        Unable to load appointments: {error}
      </div>
    );
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-4 text-text sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <div
          role="group"
          aria-label="Appointments view"
          className="inline-flex w-full overflow-hidden rounded-2xl border border-border bg-background sm:w-auto"
        >
          {(
            [
              { key: "list", label: "List" },
              { key: "day", label: "Day" },
              { key: "week", label: "Week" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={viewMode === option.key}
              onClick={() => setViewMode(option.key)}
              className={`min-h-11 flex-1 px-4 text-sm font-semibold transition sm:flex-none ${
                viewMode === option.key
                  ? "bg-primary/10 text-text"
                  : "text-muted-foreground hover:bg-muted hover:text-text"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90 sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Add appointment
          </button>
        </div>
      </div>

      {viewMode === "list" && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { key: "today" as const, label: "Today", accent: "bg-red-500", count: summaryCounts.today },
            { key: "tomorrow" as const, label: "Tomorrow", accent: "bg-purple-600", count: summaryCounts.tomorrow },
            { key: "upcoming" as const, label: "Upcoming", accent: "bg-blue-600", count: summaryCounts.upcoming },
            { key: "past" as const, label: "Total", accent: "bg-slate-700", count: pagedAppointments.totalCount ?? displayedAppointments.length },
          ].map((card) => (
            <article key={card.key} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.accent}`}>
                  <CalendarDays className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">{card.label}</div>
                  <div className="enx-kpi-value text-text">{card.count}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {viewMode === "list" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-h-11 min-w-0 flex-1 basis-48 items-center gap-2 rounded-xl border border-border bg-background px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search appointments"
              placeholder="Search appointments"
              className="min-h-11 w-full bg-transparent text-sm text-text outline-none placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            aria-expanded={showFilters}
            aria-controls={filtersPanelId}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
              showFilters
                ? "border-primary bg-muted text-text"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-text"
            }`}
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          {(activeFilterCount > 0 || searchQuery.trim() !== "") && (
            <button
              type="button"
              onClick={() => {
                clearAllFiltersAndSort();
                setSearchQuery("");
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-medium text-text hover:bg-muted"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      )}

      {viewMode === "list" && showFilters && (
        <div id={filtersPanelId} className="grid gap-3 rounded-2xl border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-sm text-muted-foreground">
              <span className="block text-muted-foreground">Location</span>
              <select
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text"
              >
                <option value="all">All</option>
                {locationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

          <div role="group" aria-labelledby={dateFilterLabelId} className="space-y-1 text-sm text-muted-foreground">
            <span id={dateFilterLabelId} className="block text-muted-foreground">
              Date
            </span>
            <div className="space-y-2">
              <select
                value={datePreset}
                aria-labelledby={dateFilterLabelId}
                onChange={(event) => handleDatePresetChange(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text"
              >
                <option value="all">All dates</option>
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
                <option value="day">Custom date</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>

              {datePreset === "year" ? (
                <input
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="YYYY"
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text placeholder:text-muted-foreground"
                  aria-label="Filter by year"
                />
              ) : datePreset === "day" || datePreset === "month" ? (
                <input
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value)}
                  type={datePreset === "day" ? "date" : "month"}
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text"
                  aria-label={datePreset === "day" ? "Select date" : "Select month"}
                />
              ) : null}
            </div>
          </div>

            <label className="space-y-1 text-sm text-muted-foreground">
              <span className="block text-muted-foreground">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text"
              >
                <option value="all">All</option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm text-muted-foreground">
              <span className="block text-muted-foreground">Service</span>
              <select
                value={serviceFilter}
                onChange={(event) => setServiceFilter(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text"
              >
                <option value="all">All</option>
                {serviceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm text-muted-foreground">
              <span className="block text-muted-foreground">Staff</span>
              <select
                value={staffFilter}
                onChange={(event) => setStaffFilter(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text"
              >
                <option value="all">All</option>
                {staffOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
        </div>
      )}

      {statusChangeError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-400">
          {statusChangeError}
        </div>
      )}

      {viewMode === "list" && (
        <div className="space-y-4">
          {displayedAppointments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background p-6 text-base text-muted-foreground">
              No appointments found for the selected filters.
            </div>
          ) : null}

          {(["today", "tomorrow", "upcoming", "past"] as const).map((groupKey) => {
            const groupItems = groupedAppointments[groupKey];
            if (groupItems.length === 0) {
              return null;
            }

            const groupLabel = groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
            const isGroupCollapsed = collapsedGroups[groupKey];

            return (
              <section key={groupKey} className="space-y-3 rounded-2xl border border-border bg-background p-4">
                <button
                  type="button"
                  aria-expanded={!isGroupCollapsed}
                  onClick={() => setCollapsedGroups((current) => ({ ...current, [groupKey]: !current[groupKey] }))}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2 text-text">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{groupLabel}</span>
                    <span className="text-sm text-muted-foreground">• {groupItems.length} appointments</span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition ${isGroupCollapsed ? "-rotate-90" : "rotate-0"}`}
                  />
                </button>

                <div className={isGroupCollapsed ? "hidden" : "space-y-3"}>
                  {groupItems.map((appointment) => {
                    const isExpanded = expandedIds.includes(appointment.id);
                    const statusTone = getAppointmentStatusTone(appointment.status);

                    return (
                      <article
                        key={appointment.id}
                        className="rounded-2xl border border-border bg-card p-4 transition hover:bg-muted/60"
                      >
                        <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(appointment.id)}
                            className="flex min-w-0 flex-1 flex-col gap-3 text-left xl:flex-row xl:items-center xl:gap-4"
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-text">
                                {getInitials(appointment.name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-text">
                                  {formatAppointmentTimeRange(appointment.date, appointment.start_time, appointment.end_time)}
                                </div>
                                <div className="truncate font-semibold text-text">
                                  {appointment.name ?? "Unnamed appointment"}
                                </div>
                                <div className="truncate text-sm text-muted-foreground">{appointment.phone ?? "-"}</div>
                                <div className="mt-1 truncate text-sm text-muted-foreground xl:hidden">
                                  {appointment.service ?? "-"}
                                </div>
                              </div>
                              <span className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${statusTone}`}>
                                {appointment.status ?? "tentative"}
                              </span>
                            </div>

                            <div className="hidden min-w-0 xl:block xl:w-56">
                              <div className="truncate text-base font-semibold text-text">{appointment.service ?? "-"}</div>
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5" />
                                {appointment.location ?? "-"}
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-2 self-end xl:self-auto">
                            <button
                              type="button"
                              onClick={() => openEditModal(appointment, "reschedule")}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:text-text"
                              title="Reschedule"
                              aria-label="Reschedule appointment"
                            >
                              <Clock3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(appointment, "edit")}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:text-text"
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
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:border-rose-500/30 hover:text-rose-600"
                              title="Cancel"
                              aria-label="Cancel appointment"
                            >
                              <X className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setPendingDelete({ id: appointment.id, name: appointment.name ?? "Unnamed appointment" });
                              }}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:border-rose-500/30 hover:text-rose-600"
                              title="Delete"
                              aria-label="Delete appointment"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleExpanded(appointment.id)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:text-text"
                              aria-label={isExpanded ? "Collapse details" : "Expand details"}
                            >
                              <ChevronDown className={`h-4 w-4 transition ${isExpanded ? "rotate-180" : "rotate-0"}`} />
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-4 grid gap-2 border-t border-border pt-4 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
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
      )}

      {viewMode !== "list" && (
        <AppointmentsCalendar
          mode={viewMode === "week" ? "week" : "day"}
          date={calendarDate}
          appointments={rangeAppointments.appointments}
          staffOptions={staffOptions}
          loading={rangeAppointments.loading}
          error={rangeAppointments.error}
          onDateChange={setCalendarDate}
          onSlotClick={openAddModalFromSlot}
          onCardClick={(appointment) => openEditModal(appointment, "edit")}
          onAddClick={openAddModalForCalendarDate}
          onRetry={() => void rangeAppointments.refresh()}
        />
      )}

      {viewMode === "list" && displayedAppointments.length > 0 && (
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
        {/* noValidate: older appointments may have off-step times; handleSaveAppointment validates required fields. */}
        <form onSubmit={handleSaveAppointment} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1 text-sm text-muted-foreground sm:col-span-2">
              <span>Customer *</span>
              <CustomerPickerField
                clientId={clientId}
                value={form.name}
                onTyping={(name) => setForm((current) => ({ ...current, name }))}
                onSelect={(customer) =>
                  setForm((current) => ({
                    ...current,
                    name: customer.name,
                    phone: (customer.phone ?? "").replace(/\D/g, "").slice(-10),
                    email: customer.email ?? current.email,
                  }))
                }
              />
            </div>

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

            <SearchableCreatableField
              label="Service"
              required
              value={form.service}
              options={serviceOptions}
              placeholder="Search or add service"
              onChange={(service) => setForm((current) => ({ ...current, service }))}
            />

            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Date *</span>
              <input
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                type="date"
                required
                className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:text-sm"
              />
            </label>

            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Start time *</span>
              <input
                value={form.start_time}
                onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))}
                onBlur={() => setForm((current) => ({ ...current, start_time: snapTimeToStep(current.start_time) }))}
                type="time"
                step={TIME_STEP_SECONDS}
                className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:text-sm"
              />
            </label>

            <button
              type="button"
              onClick={() => setShowMoreOptions((current) => !current)}
              aria-expanded={showMoreOptions}
              aria-controls={moreOptionsId}
              className="inline-flex min-h-11 items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-text hover:bg-muted sm:col-span-2"
            >
              More options
              <ChevronDown className={`h-4 w-4 transition-transform ${showMoreOptions ? "rotate-180" : ""}`} />
            </button>

            <div id={moreOptionsId} className={`${showMoreOptions ? "grid" : "hidden"} grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2`}>
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

              <label className="space-y-1 text-sm text-muted-foreground">
                <span>End time</span>
                <input
                  value={form.end_time}
                  onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))}
                  onBlur={() => setForm((current) => ({ ...current, end_time: snapTimeToStep(current.end_time) }))}
                  type="time"
                  step={TIME_STEP_SECONDS}
                  className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:text-sm"
                />
              </label>

              <label className="space-y-1 text-sm text-muted-foreground">
                <span>Duration</span>
                <input
                  readOnly
                  value={formatAppointmentDuration(form.start_time, form.end_time, form.date)}
                  placeholder="Auto from time range"
                  className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-muted-foreground"
                />
              </label>

              <label className="space-y-1 text-sm text-muted-foreground">
                <span>Status</span>
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
          </div>

          {slotConflicts.length > 0 && (
            <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600">
              <p className="font-semibold">Possible double booking</p>
              {slotConflicts.slice(0, 3).map((conflict) => {
                const interval = getAppointmentInterval(conflict);
                return (
                  <p key={conflict.id}>
                    Staff already has {conflict.name?.trim() || "another appointment"}
                    {interval ? ` from ${minutesToClock(interval.start)} to ${minutesToClock(interval.end)}` : ""} on {conflict.date}
                  </p>
                );
              })}
              {slotConflicts.length > 3 && <p>+{slotConflicts.length - 3} more</p>}
              <p>You can still save.</p>
            </div>
          )}

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

      <EntityModal open={Boolean(pendingDelete)} title="Delete appointment" onClose={() => setPendingDelete(null)}>
        <div className="space-y-4">
          <p className="text-base text-muted-foreground">
            Delete appointment for <span className="font-semibold text-text">{pendingDelete?.name}</span>? It will be removed from the list.
          </p>
          {deleteError && <p className="text-sm text-rose-600">{deleteError}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground hover:bg-muted sm:w-auto"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={isDeleting}
              className="min-h-11 w-full rounded-xl border border-rose-600 bg-rose-600 px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </EntityModal>
    </section>
  );
}
