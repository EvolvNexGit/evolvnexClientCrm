"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  Clock3,
  IndianRupee,
  LineChart,
  Loader2,
  Package,
  RefreshCw,
  ShoppingBag,
  Tag,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/app-context";
import { useCafeSummary } from "@/hooks/use-cafe-summary";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  formatCount,
  formatInr,
  formatTrend,
} from "@/lib/cafe-summary-analytics";
import {
  formatIstDataTimestamp,
  type CafeSummaryRangePreset,
} from "@/lib/cafe-summary-time";
import { getSupabaseClient } from "@/lib/supabase";
import { formatUtcToIst } from "@/lib/time-utils";

type TaskRow = {
  id: string;
  title: string;
  desc: string | null;
  is_completed: boolean;
  created_at: string | null;
};

type TaskFilter = "all" | "pending" | "done";

const TASK_COLUMNS = "id, title, desc, is_completed, created_at";

const RANGE_OPTIONS: { key: CafeSummaryRangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "3months", label: "3 Months" },
  { key: "6months", label: "6 Months" },
  { key: "custom", label: "Custom Range" },
];

const CUSTOMER_COLORS = ["#ef4444", "#6b7280"];

function truncateId(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
}

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

function TrendBadge({ value, label }: { value: number | null; label: string }) {
  const isPositive = (value ?? 0) >= 0;

  return (
    <div className={`inline-flex items-center gap-1 text-sm ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
      {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
      <span>{formatTrend(value)} {label}</span>
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
}: {
  title: string;
  value: string;
  trend?: number | null;
  trendLabel?: string;
  note?: string;
  icon: ReactNode;
  iconClassName: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-text">{value}</p>
          {trendLabel && trend != null && <div className="mt-2"><TrendBadge value={trend} label={trendLabel} /></div>}
          {note && <p className="mt-2 text-sm text-muted-foreground">{note}</p>}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-full ${iconClassName}`}>{icon}</div>
      </div>
    </article>
  );
}

export default function CafeSummaryTab({ clientId }: { clientId: string }) {
  const { authId } = useApp();
  const [rangePreset, setRangePreset] = usePersistentState<CafeSummaryRangePreset>("cafe-summary-range", "today");
  const [customFrom, setCustomFrom] = usePersistentState("cafe-summary-custom-from", "");
  const [customTo, setCustomTo] = usePersistentState("cafe-summary-custom-to", "");
  const [taskFilter, setTaskFilter] = usePersistentState<TaskFilter>("cafe-summary-task-filter", "all");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksSaving, setTasksSaving] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [titleInput, setTitleInput] = usePersistentState("cafe-summary-task-title", "");

  const { analytics, loading, error, refreshedAt, refresh } = useCafeSummary(clientId, rangePreset, {
    from: customFrom,
    to: customTo,
  });

  const trendLabel = getTrendLabel(rangePreset);

  const customerPieData = useMemo(() => {
    if (!analytics) {
      return [];
    }

    return [
      { name: "New Customers", value: analytics.customers.newCustomers.value },
      { name: "Returning Customers", value: analytics.customers.returningCustomers.value },
    ].filter((entry) => entry.value > 0);
  }, [analytics]);

  const filteredTasks = useMemo(() => {
    if (taskFilter === "pending") {
      return tasks.filter((task) => !task.is_completed);
    }

    if (taskFilter === "done") {
      return tasks.filter((task) => task.is_completed);
    }

    return tasks;
  }, [taskFilter, tasks]);

  const hydrateTask = useCallback((row: Record<string, unknown>): TaskRow => {
    return {
      id: String(row.id),
      title: String(row.title ?? "Untitled"),
      desc: (row.desc as string | null) ?? null,
      is_completed: Boolean(row.is_completed),
      created_at: (row.created_at as string | null) ?? null,
    };
  }, []);

  const refreshTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);

    try {
      const client = getSupabaseClient();
      if (!client) {
        throw new Error("Missing Supabase environment variables.");
      }

      const { data, error: fetchError } = await client
        .from("tasks")
        .select(TASK_COLUMNS)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      setTasks((data ?? []).map((row) => hydrateTask(row as Record<string, unknown>)));
    } catch (taskError) {
      setTasksError(taskError instanceof Error ? taskError.message : "Unable to load tasks.");
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [clientId, hydrateTask]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = titleInput.trim();
    if (!title) {
      return;
    }

    setTasksSaving(true);
    setTasksError(null);

    try {
      const client = getSupabaseClient();
      if (!client) {
        throw new Error("Missing Supabase environment variables.");
      }

      const { data, error: insertError } = await client
        .from("tasks")
        .insert({ client_id: clientId, title, desc: null, is_completed: false })
        .select(TASK_COLUMNS)
        .single();

      if (insertError) {
        throw insertError;
      }

      if (data) {
        setTasks((current) => [hydrateTask(data as Record<string, unknown>), ...current]);
      }

      setTitleInput("");
    } catch (taskError) {
      setTasksError(taskError instanceof Error ? taskError.message : "Unable to add task.");
    } finally {
      setTasksSaving(false);
    }
  }

  async function toggleTask(task: TaskRow) {
    setTasksSaving(true);
    setTasksError(null);

    try {
      const client = getSupabaseClient();
      if (!client) {
        throw new Error("Missing Supabase environment variables.");
      }

      const nextCompleted = !task.is_completed;
      const { error: updateError } = await client
        .from("tasks")
        .update({ is_completed: nextCompleted })
        .eq("id", task.id);

      if (updateError) {
        throw updateError;
      }

      setTasks((current) =>
        current.map((entry) => (entry.id === task.id ? { ...entry, is_completed: nextCompleted } : entry)),
      );
    } catch (taskError) {
      setTasksError(taskError instanceof Error ? taskError.message : "Unable to update task.");
    } finally {
      setTasksSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            Auth ID: <span className="font-medium text-text">{truncateId(authId)}</span>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            Client ID: <span className="font-medium text-text">{truncateId(clientId)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {analytics && analytics.alerts.length > 0 && (
            <div className="relative rounded-xl border border-border bg-card p-2">
              <Bell className="h-5 w-5 text-text" />
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-white">
                {analytics.alerts.length}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setRangePreset(option.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                rangePreset === option.key
                  ? "bg-primary text-white"
                  : "border border-border bg-card text-muted-foreground hover:text-text"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {refreshedAt && <span>Data as of: {formatIstDataTimestamp(refreshedAt)}</span>}
          <Button type="button" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {rangePreset === "custom" && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
          <label className="text-sm text-muted-foreground">
            <span className="mb-1 block">From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-text"
            />
          </label>
          <label className="text-sm text-muted-foreground">
            <span className="mb-1 block">To</span>
            <input
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-text"
            />
          </label>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm text-primary">{error}</div>
      )}

      {loading && !analytics && (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading cafe summary...
          </span>
        </div>
      )}

      {analytics && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              title="Total Revenue"
              value={formatInr(analytics.kpis.revenue.value)}
              trend={analytics.kpis.revenue.changePercent}
              trendLabel={trendLabel}
              icon={<IndianRupee className="h-5 w-5 text-white" />}
              iconClassName="bg-primary"
            />
            <KpiCard
              title="Total Orders"
              value={formatCount(analytics.kpis.orders.value)}
              trend={analytics.kpis.orders.changePercent}
              trendLabel={trendLabel}
              icon={<ShoppingBag className="h-5 w-5 text-white" />}
              iconClassName="bg-orange-500"
            />
            <KpiCard
              title="Total Customers"
              value={formatCount(analytics.kpis.customers.value)}
              trend={analytics.kpis.customers.changePercent}
              trendLabel={trendLabel}
              icon={<Users className="h-5 w-5 text-white" />}
              iconClassName="bg-violet-500"
            />
            <KpiCard
              title="Avg. Bill Value"
              value={formatInr(analytics.kpis.avgBill.value)}
              trend={analytics.kpis.avgBill.changePercent}
              trendLabel={trendLabel}
              icon={<LineChart className="h-5 w-5 text-white" />}
              iconClassName="bg-sky-500"
            />
            <KpiCard
              title="Discount Given"
              value={formatInr(analytics.kpis.discount.value)}
              note={`${analytics.kpis.discountPercentOfRevenue.toFixed(1)}% of revenue`}
              icon={<Tag className="h-5 w-5 text-white" />}
              iconClassName="bg-amber-500"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <section className="rounded-2xl border border-border bg-card p-4 xl:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-text">Sales Trend</h3>
                <span className="rounded-lg border border-border bg-background px-3 py-1 text-sm text-muted-foreground">
                  Area
                </span>
              </div>
              <div className="h-72">
                {analytics.hourly.some((point) => point.revenue > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.hourly}>
                      <defs>
                        <linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                      <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} interval={2} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 12 }}
                        formatter={(value) => formatInr(Number(value ?? 0))}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#ef4444" fill="url(#salesTrendFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No sales in this period.
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>Total Revenue {formatInr(analytics.kpis.revenue.value)}</span>
                <TrendBadge value={analytics.kpis.revenue.changePercent} label={trendLabel} />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-text">Top Selling Items</h3>
                <span className="rounded-lg border border-border bg-background px-3 py-1 text-sm text-muted-foreground">
                  By Quantity
                </span>
              </div>
              {analytics.topItems.length > 0 ? (
                <ol className="space-y-3">
                  {analytics.topItems.map((item, index) => (
                    <li key={item.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-text">
                        {index + 1}. {item.name}
                      </span>
                      <span className="font-medium text-muted-foreground">{formatCount(item.quantity)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No item sales in this period.</p>
              )}
              <Link href={"/dashboard/product" as never} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
                View all items
              </Link>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-4">
              <h3 className="mb-4 text-lg font-semibold text-text">Customer Overview</h3>
              <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-center">
                <div className="h-44">
                  {customerPieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={customerPieData} dataKey="value" innerRadius={48} outerRadius={72} paddingAngle={2}>
                          {customerPieData.map((entry, index) => (
                            <Cell key={entry.name} fill={CUSTOMER_COLORS[index % CUSTOMER_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 12 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No registered customers in this period.
                    </div>
                  )}
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">New Customers</div>
                    <div className="font-semibold text-text">
                      {formatCount(analytics.customers.newCustomers.value)}
                    </div>
                    <TrendBadge value={analytics.customers.newCustomers.changePercent} label={trendLabel} />
                  </div>
                  <div>
                    <div className="text-muted-foreground">Returning Customers</div>
                    <div className="font-semibold text-text">
                      {formatCount(analytics.customers.returningCustomers.value)}
                    </div>
                    <TrendBadge value={analytics.customers.returningCustomers.changePercent} label={trendLabel} />
                  </div>
                  <div>
                    <div className="text-muted-foreground">Walk-in Customers</div>
                    <div className="font-semibold text-text">
                      {formatCount(analytics.customers.walkInCustomers.value)} ({analytics.customers.walkInSharePercent.toFixed(0)}%)
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {trendLabel} {analytics.customers.previousWalkInSharePercent.toFixed(0)}%
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-text">Orders by Time of Day</h3>
                <span className="rounded-lg border border-border bg-background px-3 py-1 text-sm text-muted-foreground">
                  Bar Chart
                </span>
              </div>
              <div className="h-56">
                {analytics.hourly.some((point) => point.orders > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.hourly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                      <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} interval={2} />
                      <YAxis allowDecimals={false} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 12 }}
                      />
                      <Bar dataKey="orders" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No orders in this period.
                  </div>
                )}
              </div>
            </section>
          </div>

          {analytics.alerts.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {analytics.alerts.map((alert) => (
                <article key={alert.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="mb-2 flex items-center gap-2 text-text">
                    {alert.id === "low-stock" && <Package className="h-4 w-4 text-amber-400" />}
                    {alert.id === "peak-hours" && <Clock3 className="h-4 w-4 text-primary" />}
                    {alert.id === "high-discount" && <Tag className="h-4 w-4 text-amber-400" />}
                    {alert.id === "appointments" && <CalendarDays className="h-4 w-4 text-primary" />}
                    {!["low-stock", "peak-hours", "high-discount", "appointments"].includes(alert.id) && (
                      <AlertTriangle className="h-4 w-4 text-primary" />
                    )}
                    <h4 className="font-semibold">{alert.title}</h4>
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

          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-text">Task Portal</h3>
              <div className="flex flex-wrap gap-2">
                {(["all", "pending", "done"] as TaskFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setTaskFilter(filter)}
                    className={`rounded-full px-4 py-2 text-sm capitalize ${
                      taskFilter === filter
                        ? "bg-primary text-white"
                        : "border border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <form className="mt-4 flex flex-wrap gap-3" onSubmit={(event) => void addTask(event)}>
              <input
                value={titleInput}
                onChange={(event) => setTitleInput(event.target.value)}
                placeholder="Add a new task..."
                className="min-w-[240px] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-text"
              />
              <Button type="submit" disabled={tasksSaving}>
                Add Task
              </Button>
            </form>

            {tasksError && (
              <p className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-2 text-sm text-primary">{tasksError}</p>
            )}

            <div className="mt-4 space-y-2">
              {tasksLoading && (
                <p className="text-sm text-muted-foreground">Loading tasks...</p>
              )}
              {!tasksLoading && filteredTasks.length === 0 && (
                <p className="text-sm text-muted-foreground">No tasks in this view.</p>
              )}
              {filteredTasks.map((task) => (
                <label
                  key={task.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={task.is_completed}
                    onChange={() => void toggleTask(task)}
                    disabled={tasksSaving}
                  />
                  <span className={task.is_completed ? "flex-1 text-muted-foreground line-through" : "flex-1 text-text"}>
                    {task.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatUtcToIst(task.created_at)}</span>
                </label>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
