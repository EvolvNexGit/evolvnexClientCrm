"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase";

type ClientInfo = {
  id: string;
  crm_user_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  whattsapp_number: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  desc: string | null;
  is_completed: boolean;
  created_at: string | null;
};

const TASK_COLUMNS = "id, title, desc, is_completed, created_at";

export default function SummaryTab({ clientId }: { clientId: string }) {
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [clientInfoError, setClientInfoError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksSaving, setTasksSaving] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [descInput, setDescInput] = useState("");

  const totalTasks = tasks.length;
  const completedTasks = useMemo(() => tasks.filter((task) => task.is_completed).length, [tasks]);

  const completionRate = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  const hydrateTask = useCallback((row: any): TaskRow => {
    return {
      id: String(row.id),
      title: String(row.title ?? "Untitled"),
      desc: row.desc ?? null,
      is_completed: Boolean(row.is_completed),
      created_at: row.created_at ?? null,
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

      const { data, error } = await client
        .from("tasks")
        .select(TASK_COLUMNS)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const rows = (data ?? []).map(hydrateTask);
      setTasks(rows);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to load tasks.";
      setTasksError(reason);
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [clientId, hydrateTask]);

  useEffect(() => {
    let active = true;

    async function loadClientInfo() {
      const client = getSupabaseClient();
      if (!client) {
        if (active) {
          setClientInfoError("Missing Supabase environment variables.");
        }
        return;
      }

      try {
        setClientInfoError(null);
        const { data: clientRow, error: clientError } = await client
          .from("clients")
          .select("id, crm_user_id, primary_contact_id")
          .eq("id", clientId)
          .single();

        if (clientError) {
          throw clientError;
        }

        if (!active) {
          return;
        }

        let name: string | null = null;
        let email: string | null = null;
        let phone: string | null = null;
        let whattsapp_number: string | null = null;

        if (clientRow.primary_contact_id) {
          const { data: peopleRow, error: peopleError } = await client
            .from("people")
            .select("f_name, m_name, l_name, phone, email, whattsapp_number")
            .eq("id", clientRow.primary_contact_id)
            .single();

          if (peopleError) {
            throw peopleError;
          }

          const fullName = [peopleRow.f_name, peopleRow.m_name, peopleRow.l_name]
            .map((part) => String(part ?? "").trim())
            .filter((part) => part.length > 0)
            .join(" ");

          name = fullName || null;
          email = peopleRow.email ?? null;
          phone = peopleRow.phone ?? null;
          whattsapp_number = peopleRow.whattsapp_number ?? null;
        }

        setClientInfo({
          id: String(clientRow.id),
          crm_user_id: clientRow.crm_user_id ?? null,
          name,
          email,
          phone,
          whattsapp_number,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setClientInfoError(error instanceof Error ? error.message : "Unable to load client information.");
      }
    }

    void loadClientInfo();

    return () => {
      active = false;
    };
  }, [clientId]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = titleInput.trim();
    const desc = descInput.trim();

    if (!title) {
      setTasksError("Task title is required.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setTasksError("Missing Supabase environment variables.");
      return;
    }

    setTasksError(null);
    setTasksSaving(true);

    try {
      const payload = {
        client_id: clientId,
        title,
        desc: desc || null,
        is_completed: false,
      };

      const { data, error } = await client.from("tasks").insert(payload).select(TASK_COLUMNS).single();

      if (error) {
        throw error;
      }

      if (data) {
        setTasks((current) => [hydrateTask(data), ...current]);
      }

      setTitleInput("");
      setDescInput("");
    } catch (error) {
      setTasksError(error instanceof Error ? error.message : "Unable to add task.");
    } finally {
      setTasksSaving(false);
    }
  }

  async function toggleTask(task: TaskRow) {
    const client = getSupabaseClient();
    if (!client) {
      setTasksError("Missing Supabase environment variables.");
      return;
    }

    setTasksError(null);
    setTasksSaving(true);

    try {
      const { error } = await client
        .from("tasks")
        .update({ is_completed: !task.is_completed })
        .eq("id", task.id)
        .eq("client_id", clientId);

      if (error) {
        throw error;
      }

      setTasks((current) =>
        current.map((row) =>
          row.id === task.id
            ? {
                ...row,
                is_completed: !task.is_completed,
              }
            : row,
        ),
      );
    } catch (error) {
      setTasksError(error instanceof Error ? error.message : "Unable to update task.");
    } finally {
      setTasksSaving(false);
    }
  }

  function formatDate(value: string | null) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString();
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Client ID</h2>
          <p className="mt-2 text-sm text-text">{clientInfo?.id ?? clientId}</p>
        </article>
        <article className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">CRM User</h2>
          <p className="mt-2 text-sm text-text">{clientInfo?.crm_user_id ?? "-"}</p>
        </article>
        <article className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Task Completion</h2>
          <p className="mt-2 text-sm text-text">
            {completedTasks}/{totalTasks} ({completionRate}%)
          </p>
        </article>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-base font-semibold text-text">Basic Client Information</h3>
        {clientInfoError && <p className="mt-2 text-xs text-primary">{clientInfoError}</p>}
        {!clientInfoError && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
              <span className="block text-xs uppercase tracking-wide">Name</span>
              <span className="mt-1 block text-text">{clientInfo?.name ?? "-"}</span>
            </div>
            <div className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
              <span className="block text-xs uppercase tracking-wide">Email</span>
              <span className="mt-1 block text-text">{clientInfo?.email ?? "-"}</span>
            </div>
            <div className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
              <span className="block text-xs uppercase tracking-wide">Phone</span>
              <span className="mt-1 block text-text">{clientInfo?.phone ?? "-"}</span>
            </div>
            <div className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
              <span className="block text-xs uppercase tracking-wide">WhatsApp</span>
              <span className="mt-1 block text-text">{clientInfo?.whattsapp_number ?? "-"}</span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-text">Task Portal</h3>
          <Button type="button" variant="secondary" onClick={() => void refreshTasks()} disabled={tasksLoading || tasksSaving}>
            Refresh
          </Button>
        </div>

        <form className="mt-4 grid gap-3 sm:grid-cols-[1.2fr_2fr_auto]" onSubmit={(event) => void addTask(event)}>
          <input
            value={titleInput}
            onChange={(event) => setTitleInput(event.target.value)}
            placeholder="Task title"
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
          />
          <input
            value={descInput}
            onChange={(event) => setDescInput(event.target.value)}
            placeholder="Task description"
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
          />
          <Button type="submit" disabled={tasksSaving}>
            Add Task
          </Button>
        </form>

        {tasksError && <p className="mt-3 rounded-lg border border-primary/50 bg-primary/10 p-2 text-xs text-primary">{tasksError}</p>}

        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Done</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!tasksLoading && tasks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                    No tasks yet.
                  </td>
                </tr>
              )}
              {tasksLoading && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                    Loading tasks...
                  </td>
                </tr>
              )}
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={task.is_completed}
                      onChange={() => void toggleTask(task)}
                      disabled={tasksSaving}
                    />
                  </td>
                  <td className={task.is_completed ? "px-3 py-2 text-muted-foreground line-through" : "px-3 py-2 text-text"}>
                    {task.title}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{task.desc ?? "-"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatDate(task.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}