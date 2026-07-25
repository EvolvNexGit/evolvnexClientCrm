import type { TransactionRecord } from "@/lib/billing-types";
import type { IngredientRecord } from "@/lib/inventory-types";
import {
  getIstHourLabel,
  getIstTodayYmd,
  isTimestampInRange,
  type CafeSummaryDateRange,
} from "@/lib/cafe-summary-time";
import { formatAppointmentTimeRange, parseDbTimestamp } from "@/lib/time-utils";

export type DoctorAppointmentStatus = "tentative" | "booked" | "cancelled" | "completed";

export type DoctorAppointmentRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  service: string | null;
  staff_name: string | null;
  location: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: DoctorAppointmentStatus | null;
};

export type DoctorTrendMetric = {
  value: number;
  previousValue: number;
  changePercent: number | null;
};

export type DoctorSummaryKpis = {
  revenue: DoctorTrendMetric;
  appointments: DoctorTrendMetric;
  patientsServed: DoctorTrendMetric;
  newPatients: DoctorTrendMetric;
  avgBill: DoctorTrendMetric;
};

export type DoctorHourlyPoint = {
  hour: number;
  label: string;
  revenue: number;
  appointments: number;
};

export type DoctorStatusSlice = {
  key: "completed" | "cancelled" | "upcoming";
  label: string;
  value: number;
  color: string;
};

export type DoctorPatientSlice = {
  key: "new" | "returning";
  label: string;
  value: number;
  color: string;
};

export type DoctorTopService = {
  name: string;
  count: number;
};

export type DoctorUpcomingAppointment = {
  id: string;
  name: string;
  service: string;
  timeLabel: string;
  date: string;
};

export type DoctorSummaryAlert = {
  id: string;
  title: string;
  message: string;
  href?: string;
  hrefLabel?: string;
};

export type DoctorSummaryAnalytics = {
  kpis: DoctorSummaryKpis;
  revenueHourly: DoctorHourlyPoint[];
  appointmentsHourly: DoctorHourlyPoint[];
  statusOverview: DoctorStatusSlice[];
  patientMix: DoctorPatientSlice[];
  topServices: DoctorTopService[];
  upcoming: DoctorUpcomingAppointment[];
  alerts: DoctorSummaryAlert[];
  locations: string[];
};

function buildTrend(currentValue: number, previousValue: number): DoctorTrendMetric {
  const changePercent =
    previousValue === 0 ? (currentValue > 0 ? 100 : 0) : ((currentValue - previousValue) / previousValue) * 100;

  return {
    value: currentValue,
    previousValue,
    changePercent,
  };
}

function patientKey(appointment: DoctorAppointmentRecord) {
  const phone = appointment.phone?.trim();
  if (phone) {
    return `phone:${phone.toLowerCase()}`;
  }

  const name = appointment.name?.trim();
  if (name) {
    return `name:${name.toLowerCase()}`;
  }

  return `id:${appointment.id}`;
}

function isYmdInRange(date: string | null | undefined, range: CafeSummaryDateRange) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const dayStart = new Date(`${date}T00:00:00+05:30`).getTime();
  return dayStart >= range.startMs && dayStart <= range.endMs;
}

function filterAppointments(appointments: DoctorAppointmentRecord[], range: CafeSummaryDateRange, location: string | null) {
  return appointments.filter((appointment) => {
    if (!isYmdInRange(appointment.date, range)) {
      return false;
    }

    if (location && (appointment.location?.trim() || "") !== location) {
      return false;
    }

    return true;
  });
}

function filterTransactions(transactions: TransactionRecord[], range: CafeSummaryDateRange) {
  return transactions.filter((transaction) => isTimestampInRange(transaction.created_at, range));
}

function getAppointmentHour(appointment: DoctorAppointmentRecord): number | null {
  if (!appointment.start_time) {
    return null;
  }

  const timeMatch = String(appointment.start_time).match(/(?:T|\s|^)(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    return Number.isFinite(hour) ? hour % 24 : null;
  }

  const parsed = parseDbTimestamp(appointment.start_time);
  if (!parsed) {
    return null;
  }

  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    }).format(parsed),
  );

  return Number.isFinite(hour) ? hour : null;
}

function emptyHourly(): DoctorHourlyPoint[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: getIstHourLabel(hour),
    revenue: 0,
    appointments: 0,
  }));
}

function buildRevenueHourly(transactions: TransactionRecord[]): DoctorHourlyPoint[] {
  const buckets = emptyHourly();

  for (const transaction of transactions) {
    const parsed = parseDbTimestamp(transaction.created_at);
    if (!parsed) {
      continue;
    }

    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        hour12: false,
      }).format(parsed),
    );

    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      continue;
    }

    buckets[hour].revenue += transaction.final_amount;
  }

  return buckets;
}

function buildAppointmentHourly(appointments: DoctorAppointmentRecord[]): DoctorHourlyPoint[] {
  const buckets = emptyHourly();

  for (const appointment of appointments) {
    const hour = getAppointmentHour(appointment);
    if (hour == null || hour < 0 || hour > 23) {
      continue;
    }

    buckets[hour].appointments += 1;
  }

  return buckets;
}

function firstSeenDateByPatient(appointments: DoctorAppointmentRecord[]) {
  const map = new Map<string, string>();

  for (const appointment of appointments) {
    if (!appointment.date) {
      continue;
    }

    const key = patientKey(appointment);
    const existing = map.get(key);
    if (!existing || appointment.date < existing) {
      map.set(key, appointment.date);
    }
  }

  return map;
}

function isIngredientLowStock(ingredient: IngredientRecord) {
  return ingredient.threshold !== null && ingredient.quantity < ingredient.threshold;
}

export function buildDoctorSummaryAnalytics(input: {
  appointments: DoctorAppointmentRecord[];
  transactions: TransactionRecord[];
  ingredients: IngredientRecord[];
  currentRange: CafeSummaryDateRange;
  previousRange: CafeSummaryDateRange;
  location: string | null;
}): DoctorSummaryAnalytics {
  const locations = [
    ...new Set(
      input.appointments
        .map((appointment) => appointment.location?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => left.localeCompare(right));

  const currentAppointments = filterAppointments(input.appointments, input.currentRange, input.location);
  const previousAppointments = filterAppointments(input.appointments, input.previousRange, input.location);
  const currentTransactions = filterTransactions(input.transactions, input.currentRange);
  const previousTransactions = filterTransactions(input.transactions, input.previousRange);

  const firstSeen = firstSeenDateByPatient(input.appointments);

  const currentCompleted = currentAppointments.filter((appointment) => appointment.status === "completed");
  const previousCompleted = previousAppointments.filter((appointment) => appointment.status === "completed");

  const currentPatients = new Set(currentCompleted.map(patientKey));
  const previousPatients = new Set(previousCompleted.map(patientKey));

  let currentNew = 0;
  let previousNew = 0;

  for (const key of currentPatients) {
    const firstDate = firstSeen.get(key);
    if (firstDate && isYmdInRange(firstDate, input.currentRange)) {
      currentNew += 1;
    }
  }

  for (const key of previousPatients) {
    const firstDate = firstSeen.get(key);
    if (firstDate && isYmdInRange(firstDate, input.previousRange)) {
      previousNew += 1;
    }
  }

  const currentReturning = Math.max(0, currentPatients.size - currentNew);
  const currentRevenue = currentTransactions.reduce((sum, transaction) => sum + transaction.final_amount, 0);
  const previousRevenue = previousTransactions.reduce((sum, transaction) => sum + transaction.final_amount, 0);
  const currentOrders = currentTransactions.length;
  const previousOrders = previousTransactions.length;

  const cancelled = currentAppointments.filter((appointment) => appointment.status === "cancelled").length;
  const completed = currentCompleted.length;
  const upcomingInPeriod = currentAppointments.filter(
    (appointment) => appointment.status === "tentative" || appointment.status === "booked",
  ).length;

  const serviceCounts = new Map<string, number>();
  for (const appointment of currentAppointments) {
    const service = appointment.service?.trim() || "Unspecified service";
    serviceCounts.set(service, (serviceCounts.get(service) ?? 0) + 1);
  }

  const topServices = [...serviceCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  const today = getIstTodayYmd();
  const upcoming = input.appointments
    .filter((appointment) => {
      if (!appointment.date || appointment.date < today) {
        return false;
      }

      if (appointment.status !== "tentative" && appointment.status !== "booked") {
        return false;
      }

      if (input.location && (appointment.location?.trim() || "") !== input.location) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      const dateCompare = String(left.date).localeCompare(String(right.date));
      if (dateCompare !== 0) {
        return dateCompare;
      }

      return String(left.start_time ?? "").localeCompare(String(right.start_time ?? ""));
    })
    .slice(0, 8)
    .map((appointment) => ({
      id: appointment.id,
      name: appointment.name?.trim() || "Patient",
      service: appointment.service?.trim() || "Consultation",
      timeLabel: formatAppointmentTimeRange(appointment.date, appointment.start_time, appointment.end_time),
      date: appointment.date ?? "",
    }));

  const alerts: DoctorSummaryAlert[] = [];
  const lowStock = input.ingredients.filter(isIngredientLowStock);

  if (lowStock.length > 0) {
    alerts.push({
      id: "low-stock",
      title: "Low Stock",
      message: lowStock
        .slice(0, 3)
        .map((item) => item.name)
        .join(", "),
      href: "/dashboard/ingredients",
      hrefLabel: "View inventory",
    });
  }

  const pendingPayments = currentTransactions.filter((transaction) => transaction.status === "pending");
  if (pendingPayments.length > 0) {
    const pendingTotal = pendingPayments.reduce((sum, transaction) => sum + transaction.final_amount, 0);
    alerts.push({
      id: "pending-payments",
      title: "Pending Payments",
      message: `${formatInr(pendingTotal)} from ${pendingPayments.length} bill${pendingPayments.length === 1 ? "" : "s"}`,
      href: "/dashboard/transaction",
      hrefLabel: "View transactions",
    });
  }

  if (upcoming.length > 0) {
    alerts.push({
      id: "upcoming-appointments",
      title: "Upcoming Appointments",
      message: `${upcoming.length} appointment${upcoming.length === 1 ? "" : "s"} scheduled ahead`,
      href: "/dashboard/appointments",
      hrefLabel: "View all",
    });
  }

  return {
    kpis: {
      revenue: buildTrend(currentRevenue, previousRevenue),
      appointments: buildTrend(currentAppointments.length, previousAppointments.length),
      patientsServed: buildTrend(currentPatients.size, previousPatients.size),
      newPatients: buildTrend(currentNew, previousNew),
      avgBill: buildTrend(
        currentOrders === 0 ? 0 : currentRevenue / currentOrders,
        previousOrders === 0 ? 0 : previousRevenue / previousOrders,
      ),
    },
    revenueHourly: buildRevenueHourly(currentTransactions),
    appointmentsHourly: buildAppointmentHourly(currentAppointments),
    statusOverview: [
      { key: "completed", label: "Completed", value: completed, color: "#22c55e" },
      { key: "cancelled", label: "Cancelled", value: cancelled, color: "#ef4444" },
      { key: "upcoming", label: "Upcoming", value: upcomingInPeriod, color: "#3b82f6" },
    ],
    patientMix: [
      { key: "new", label: "New Patients", value: currentNew, color: "#22c55e" },
      { key: "returning", label: "Returning Patients", value: currentReturning, color: "#3b82f6" },
    ],
    topServices,
    upcoming,
    alerts,
    locations,
  };
}

export function formatInr(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function formatTrend(changePercent: number | null) {
  if (changePercent == null) {
    return "0.0%";
  }

  const sign = changePercent > 0 ? "+" : "";
  return `${sign}${changePercent.toFixed(1)}%`;
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}
