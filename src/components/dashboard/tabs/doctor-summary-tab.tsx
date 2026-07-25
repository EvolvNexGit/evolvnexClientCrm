"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronDown,
  Clock3,
  IndianRupee,
  Loader2,
  Package,
  RefreshCw,
  Stethoscope,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorSummary } from "@/hooks/use-doctor-summary";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  formatCount,
  formatInr,
  formatTrend,
} from "@/lib/doctor-summary-analytics";
import {
  formatIstDataTimestamp,
  type CafeSummaryRangePreset,
} from "@/lib/cafe-summary-time";

const RANGE_OPTIONS: { key: CafeSummaryRangePreset; label: string; shortLabel: string }[] = [
  { key: "today", label: "Today", shortLabel: "Today" },
  { key: "week", label: "This Week", shortLabel: "This Week" },
  { key: "month", label: "This Month", shortLabel: "This Month" },
  { key: "3months", label: "3 Months", shortLabel: "3M" },
  { key: "6months", label: "6 Months", shortLabel: "6M" },
];

const MOBILE_HOUR_TICKS = [0, 6, 12, 18, 23];

function getTrendLabel(preset: CafeSummaryRangePreset) {
  switch (preset) {
    case "today":
      return "vs yesterday";
    case "week":
      return "vs last week";
    case "month":
      return "vs last month";
    case "3months":
      return "vs previous 3 months";
    case "6months":
      return "vs previous 6 months";
    case "custom":
      return "vs previous period";
    default:
      return "vs previous period";
  }
}

function TrendBadge({
  value,
  label,
  compact = false,
}: {
  value: number | null;
  label: string;
  compact?: boolean;
}) {
  const isPositive = (value ?? 0) >= 0;

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${compact ? "text-xs" : "text-sm"} ${
        isPositive ? "text-emerald-400" : "text-rose-400"
      }`}
    >
      {isPositive ? (
        <ArrowUpRight className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      ) : (
        <ArrowDownRight className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      )}
      <span>
        {formatTrend(value)}
        {compact ? <span className="ml-1 hidden sm:inline">{label}</span> : <span> {label}</span>}
      </span>
    </div>
  );
}

function KpiCard({
  title,
  value,
  trend,
  trendLabel,
  note,
  icon,
  iconClassName,
  className = "",
}: {
  title: string;
  value: string;
  trend?: number | null;
  trendLabel?: string;
  note?: string;
  icon: ReactNode;
  iconClassName: string;
  className?: string;
}) {
  return (
    <article className={`rounded-2xl border border-border bg-card p-3 shadow-soft sm:p-4 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground sm:text-sm">{title}</p>
          <p className="mt-1 truncate text-lg font-semibold text-text sm:mt-2 sm:text-2xl">{value}</p>
          {trendLabel && trend != null && (
            <div className="mt-1.5 sm:mt-2">
              <TrendBadge value={trend} label={trendLabel} compact />
            </div>
          )}
          {note && <p className="mt-1.5 text-xs text-muted-foreground sm:mt-2 sm:text-sm">{note}</p>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11 ${iconClassName}`}>
          {icon}
        </div>
      </div>
    </article>
  );
}

/**
 * Doctor / clinic AI-Analytics tab.
 * Tab key: `doctor-summary` (independent of cafe-summary / saloon-summary).
 */
export default function DoctorSummaryTab({ clientId }: { clientId: string }) {
  const [rangePreset, setRangePreset] = usePersistentState<CafeSummaryRangePreset>("doctor-summary-range", "today");
  const [customFrom, setCustomFrom] = usePersistentState("doctor-summary-custom-from", "");
  const [customTo, setCustomTo] = usePersistentState("doctor-summary-custom-to", "");
  const [location, setLocation] = usePersistentState("doctor-summary-location", "all");

  const selectedLocation = location === "all" ? null : location;

  const { analytics, loading, error, refreshedAt, refresh } = useDoctorSummary(
    clientId,
    rangePreset,
    { from: customFrom, to: customTo },
    selectedLocation,
  );

  const trendLabel = getTrendLabel(rangePreset);

  const statusPieData = useMemo(
    () => (analytics?.statusOverview ?? []).filter((slice) => slice.value > 0),
    [analytics],
  );

  const patientPieData = useMemo(
    () => (analytics?.patientMix ?? []).filter((slice) => slice.value > 0),
    [analytics],
  );

  return (
    <div className="-mx-1 space-y-4 sm:mx-0 sm:space-y-6">
      <div className="hidden flex-wrap items-center justify-end gap-4 lg:flex">
        {analytics && analytics.alerts.length > 0 && (
          <div className="relative rounded-xl border border-border bg-card p-2">
            <Bell className="h-5 w-5 text-text" />
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-white">
              {analytics.alerts.length}
            </span>
          </div>
        )}
      </div>

      <div className="relative lg:hidden">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Location</p>
            <p className="truncate text-base font-semibold text-text">
              {location === "all" ? "All Locations" : location}
            </p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
        <select
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Filter by location"
        >
          <option value="all">All Locations</option>
          {(analytics?.locations ?? []).map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative hidden lg:inline-flex">
            <span className="sr-only">Location</span>
            <select
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="appearance-none rounded-full border border-border bg-card py-2 pl-4 pr-9 text-sm text-text"
            >
              <option value="all">All Locations</option>
              {(analytics?.locations ?? []).map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </label>

          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setRangePreset(option.key)}
                className={`shrink-0 rounded-full px-3 py-2 text-xs font-medium transition sm:px-4 sm:text-sm ${
                  rangePreset === option.key
                    ? "bg-primary text-white"
                    : "border border-border bg-card text-muted-foreground hover:text-text"
                }`}
              >
                <span className="sm:hidden">{option.shortLabel}</span>
                <span className="hidden sm:inline">{option.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRangePreset("custom")}
              className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition sm:px-4 sm:text-sm ${
                rangePreset === "custom"
                  ? "bg-primary text-white"
                  : "border border-border bg-card text-muted-foreground hover:text-text"
              }`}
            >
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">Custom Range</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground sm:text-sm">
          <span className="min-w-0 truncate">
            {refreshedAt ? `Data as of: ${formatIstDataTimestamp(refreshedAt)}` : "Data refreshing…"}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-text disabled:opacity-50"
            aria-label="Refresh data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {rangePreset === "custom" && (
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-3 sm:flex sm:flex-wrap sm:items-end sm:gap-3 sm:p-4">
          <label className="text-sm text-muted-foreground">
            <span className="mb-1 block">From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-text sm:w-auto"
            />
          </label>
          <label className="text-sm text-muted-foreground">
            <span className="mb-1 block">To</span>
            <input
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-text sm:w-auto"
            />
          </label>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm text-primary">{error}</div>
      )}

      {loading && !analytics && (
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground">
          <span className="inline-flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading doctor analytics...
          </span>
        </div>
      )}

      {analytics && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5 xl:gap-4">
            <KpiCard
              title="Total Revenue"
              value={formatInr(analytics.kpis.revenue.value)}
              trend={analytics.kpis.revenue.changePercent}
              trendLabel={trendLabel}
              icon={<IndianRupee className="h-4 w-4 text-white sm:h-5 sm:w-5" />}
              iconClassName="bg-primary"
            />
            <KpiCard
              title="Total Appointments"
              value={formatCount(analytics.kpis.appointments.value)}
              trend={analytics.kpis.appointments.changePercent}
              trendLabel={trendLabel}
              icon={<CalendarDays className="h-4 w-4 text-white sm:h-5 sm:w-5" />}
              iconClassName="bg-orange-500"
            />
            <KpiCard
              title="Patients Served"
              value={formatCount(analytics.kpis.patientsServed.value)}
              trend={analytics.kpis.patientsServed.changePercent}
              trendLabel={trendLabel}
              icon={<Users className="h-4 w-4 text-white sm:h-5 sm:w-5" />}
              iconClassName="bg-violet-500"
            />
            <KpiCard
              title="New Patients"
              value={formatCount(analytics.kpis.newPatients.value)}
              trend={analytics.kpis.newPatients.changePercent}
              trendLabel={trendLabel}
              icon={<UserPlus className="h-4 w-4 text-white sm:h-5 sm:w-5" />}
              iconClassName="bg-emerald-500"
            />
            <KpiCard
              className="col-span-2 xl:col-span-1"
              title="Avg. Bill Value"
              value={formatInr(analytics.kpis.avgBill.value)}
              trend={analytics.kpis.avgBill.changePercent}
              trendLabel={trendLabel}
              note="From POS bills (no consultation-fee field)"
              icon={<IndianRupee className="h-4 w-4 text-white sm:h-5 sm:w-5" />}
              iconClassName="bg-sky-500"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <section className="rounded-2xl border border-border bg-card p-3 sm:p-4 xl:col-span-2">
              <div className="h-48 sm:h-72">
                {analytics.revenueHourly.some((point) => point.revenue > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.revenueHourly} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="doctorRevenueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                      <XAxis
                        dataKey="hour"
                        type="number"
                        domain={[0, 23]}
                        ticks={MOBILE_HOUR_TICKS}
                        tickFormatter={(hour) => analytics.revenueHourly[Number(hour)]?.label ?? String(hour)}
                        tick={{ fill: "#9ca3af", fontSize: 10 }}
                      />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} width={40} />
                      <Tooltip
                        contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 12 }}
                        formatter={(value) => formatInr(Number(value ?? 0))}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#ef4444" fill="url(#doctorRevenueFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No bill revenue in this period.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
              <div className="h-44">
                {statusPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusPieData} dataKey="value" nameKey="label" innerRadius={42} outerRadius={68}>
                        {statusPieData.map((slice) => (
                          <Cell key={slice.key} fill={slice.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No appointments in this period.
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                {analytics.statusOverview.map((slice) => (
                  <div key={slice.key} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                      {slice.label}
                    </span>
                    <span className="font-medium text-text">{formatCount(slice.value)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
              <div className="h-48">
                {analytics.appointmentsHourly.some((point) => point.appointments > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.appointmentsHourly} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                      <XAxis
                        dataKey="hour"
                        type="number"
                        domain={[0, 23]}
                        ticks={MOBILE_HOUR_TICKS}
                        tickFormatter={(hour) => analytics.appointmentsHourly[Number(hour)]?.label ?? String(hour)}
                        tick={{ fill: "#9ca3af", fontSize: 10 }}
                      />
                      <YAxis allowDecimals={false} tick={{ fill: "#9ca3af", fontSize: 10 }} width={28} />
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 12 }} />
                      <Bar dataKey="appointments" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No appointment timing data.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
              <div className="h-44">
                {patientPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={patientPieData} dataKey="value" nameKey="label" innerRadius={42} outerRadius={68}>
                        {patientPieData.map((slice) => (
                          <Cell key={slice.key} fill={slice.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No completed patients in this period.
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                {analytics.patientMix.map((slice) => (
                  <div key={slice.key} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                      {slice.label}
                    </span>
                    <span className="font-medium text-text">{formatCount(slice.value)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
              {analytics.topServices.length > 0 ? (
                <ol className="space-y-3">
                  {analytics.topServices.map((service, index) => (
                    <li key={service.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-text">
                        {index + 1}. {service.name}
                      </span>
                      <span className="font-medium text-muted-foreground">{formatCount(service.count)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No services in this period.</p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Ranked by appointment count (service fee not stored on appointments).</p>
            </section>
          </div>

          <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-end gap-3">
              <Link href={"/dashboard/appointments" as never} className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </div>
            {analytics.upcoming.length > 0 ? (
              <ul className="divide-y divide-border">
                {analytics.upcoming.map((appointment) => (
                  <li key={appointment.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text">{appointment.name}</p>
                      <p className="truncate text-muted-foreground">{appointment.service}</p>
                    </div>
                    <div className="shrink-0 text-right text-muted-foreground">
                      <p>{appointment.timeLabel}</p>
                      <p className="text-xs">{appointment.date}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
            )}
          </section>

          {analytics.alerts.length > 0 && (
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
              {analytics.alerts.map((alert) => (
                <article key={alert.id} className="rounded-2xl border border-border bg-card p-3 sm:p-4">
                  <div className="mb-2 flex items-center gap-2 text-text">
                    {alert.id === "low-stock" && <Package className="h-4 w-4 text-amber-400" />}
                    {alert.id === "pending-payments" && <IndianRupee className="h-4 w-4 text-primary" />}
                    {alert.id === "upcoming-appointments" && <Clock3 className="h-4 w-4 text-primary" />}
                    {!["low-stock", "pending-payments", "upcoming-appointments"].includes(alert.id) && (
                      <AlertTriangle className="h-4 w-4 text-primary" />
                    )}
                    <h4 className="text-sm font-semibold sm:text-base">{alert.title}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                  {alert.href && alert.hrefLabel && (
                    <Link href={alert.href as never} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
                      {alert.hrefLabel}
                    </Link>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
