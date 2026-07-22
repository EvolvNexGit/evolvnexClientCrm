import { getSupabaseClient } from "@/lib/supabase";
import {
  buildListRange,
  LIST_PAGE_SHOW_ALL_MAX,
  sanitizeSearch,
  type ListPageParams,
  type ListPageResult,
} from "@/lib/list-pagination";

export type AppointmentRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  staff_name: string | null;
  location: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: "tentative" | "booked" | "cancelled" | "completed" | null;
  remark: string | null;
};

export type FetchAppointmentsPageParams = ListPageParams & {
  location?: string;
  status?: string;
  service?: string;
  staff?: string;
  dateFilter?: string;
  dateFilterMode?: "day" | "month" | "year";
  sortBy?: "date" | "status" | "service" | "location";
  sortOrder?: "asc" | "desc";
};

const APPOINTMENT_SELECT =
  "id, name, phone, email, service, staff_name, location, date, start_time, end_time, status, remark";

function getClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }
  return supabase;
}

function matchesDateFilter(
  appointmentDate: string | null,
  dateFilter: string | undefined,
  dateFilterMode: "day" | "month" | "year" | undefined,
) {
  if (!dateFilter) {
    return true;
  }

  if (!appointmentDate) {
    return false;
  }

  if (dateFilterMode === "day" || !dateFilterMode) {
    return appointmentDate === dateFilter;
  }

  return appointmentDate.startsWith(dateFilter);
}

function filterAppointments(rows: AppointmentRow[], params: FetchAppointmentsPageParams) {
  const search = sanitizeSearch(params.search)?.toLowerCase();

  return rows.filter((appointment) => {
    const matchesLocation = !params.location || params.location === "all" || appointment.location === params.location;
    const matchesStatus = !params.status || params.status === "all" || appointment.status === params.status;
    const matchesService = !params.service || params.service === "all" || appointment.service === params.service;
    const matchesStaff = !params.staff || params.staff === "all" || appointment.staff_name === params.staff;
    const matchesDate = matchesDateFilter(appointment.date, params.dateFilter, params.dateFilterMode);

    const matchesSearch =
      !search ||
      [
        appointment.name ?? "",
        appointment.phone ?? "",
        appointment.email ?? "",
        appointment.service ?? "",
        appointment.staff_name ?? "",
        appointment.location ?? "",
        appointment.status ?? "",
        appointment.remark ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);

    return matchesLocation && matchesStatus && matchesService && matchesStaff && matchesDate && matchesSearch;
  });
}

function sortAppointments(
  rows: AppointmentRow[],
  sortBy: FetchAppointmentsPageParams["sortBy"] = "date",
  sortOrder: FetchAppointmentsPageParams["sortOrder"] = "asc",
) {
  const direction = sortOrder === "desc" ? -1 : 1;

  return [...rows].sort((left, right) => {
    const leftValue = String(
      sortBy === "status"
        ? left.status ?? ""
        : sortBy === "service"
          ? left.service ?? ""
          : sortBy === "location"
            ? left.location ?? ""
            : `${left.date ?? ""} ${left.start_time ?? ""}`,
    );
    const rightValue = String(
      sortBy === "status"
        ? right.status ?? ""
        : sortBy === "service"
          ? right.service ?? ""
          : sortBy === "location"
            ? right.location ?? ""
            : `${right.date ?? ""} ${right.start_time ?? ""}`,
    );

    return leftValue.localeCompare(rightValue) * direction;
  });
}

export async function fetchAppointmentFilterOptions(clientId: string) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("location, service, staff_name, status")
    .eq("client_id", clientId)
    .range(0, LIST_PAGE_SHOW_ALL_MAX - 1);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<{
    location: string | null;
    service: string | null;
    staff_name: string | null;
    status: string | null;
  }>;

  return {
    locations: Array.from(new Set(rows.map((row) => row.location).filter((value): value is string => Boolean(value)))).sort(),
    services: Array.from(new Set(rows.map((row) => row.service).filter((value): value is string => Boolean(value)))).sort(),
    staff: Array.from(new Set(rows.map((row) => row.staff_name).filter((value): value is string => Boolean(value)))).sort(),
    statuses: Array.from(new Set(rows.map((row) => row.status).filter((value): value is string => Boolean(value)))).sort(),
  };
}

/**
 * Appointments use many client-side filters (date mode, search across fields).
 * Load a capped set (max 200), filter/sort, then slice for the page.
 */
export async function fetchAppointmentsPage(
  clientId: string,
  params: FetchAppointmentsPageParams = { limit: 12, offset: 0 },
): Promise<ListPageResult<AppointmentRow>> {
  const supabase = getClient();
  const { from, to } = buildListRange(params.offset, params.limit);

  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("client_id", clientId)
    .order("date", { ascending: true, nullsFirst: false })
    .order("start_time", { ascending: true, nullsFirst: false })
    .range(0, LIST_PAGE_SHOW_ALL_MAX - 1);

  if (error) {
    throw error;
  }

  const filtered = sortAppointments(
    filterAppointments((data ?? []) as AppointmentRow[], params),
    params.sortBy,
    params.sortOrder,
  );
  const items = filtered.slice(from, to + 1);

  return {
    items,
    hasMore: to + 1 < filtered.length,
    totalCount: filtered.length,
  };
}
