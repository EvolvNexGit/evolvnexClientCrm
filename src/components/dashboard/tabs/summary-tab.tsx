"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Moon, Sun, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme-context";
import { getSupabaseClient } from "@/lib/supabase";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { formatUtcToIst } from "@/lib/time-utils";

type ClientInfo = {
  id: string;
  crm_user_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_number: string | null;
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
  const { theme, setTheme } = useTheme();
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [clientInfoError, setClientInfoError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksSaving, setTasksSaving] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [titleInput, setTitleInput] = usePersistentState("summary-tab-title-input", "");
  const [descInput, setDescInput] = usePersistentState("summary-tab-desc-input", "");
  const [hiddenTaskIds, setHiddenTaskIds] = usePersistentState<string[]>("summary-tab-hidden-task-ids", []);

  const visibleTasks = useMemo(
    () => tasks.filter((task) => !hiddenTaskIds.includes(task.id)),
    [hiddenTaskIds, tasks],
  );

  const totalTasks = visibleTasks.length;
  const completedTasks = useMemo(() => visibleTasks.filter((task) => task.is_completed).length, [visibleTasks]);

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
      setTasks(rows.filter((row) => !hiddenTaskIds.includes(row.id)));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to load tasks.";
      setTasksError(reason);
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [clientId, hiddenTaskIds, hydrateTask]);

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
        let whatsapp_number: string | null = null;

        if (clientRow.primary_contact_id) {
          const { data: peopleRow, error: peopleError } = await client
            .from("people")
            .select("f_name, m_name, l_name, phone, email, whatsapp_number")
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
          whatsapp_number = peopleRow.whatsapp_number ?? null;
        }

        setClientInfo({
          id: String(clientRow.id),
          crm_user_id: clientRow.crm_user_id ?? null,
          name,
          email,
          phone,
          whatsapp_number,
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

  async function deleteTask(task: TaskRow) {
    setTasksError(null);
    setHiddenTaskIds((current) => (current.includes(task.id) ? current : [...current, task.id]));
    setTasks((current) => current.filter((row) => row.id !== task.id));
  }

  // display dates in IST using shared helper

  return (
    <section className="space-y-4">
      <div>
        <h1 className="enx-page-title">My Profile</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Manage your account settings and workspace preferences.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <article className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Completed tasks</p>
          <p className="mt-2 text-base text-text">
            {completedTasks}/{totalTasks} ({completionRate}%)
          </p>
        </article>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        {clientInfoError && <p className="text-sm text-primary">{clientInfoError}</p>}
        {!clientInfoError && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-3 text-base text-muted-foreground">
              <span className="block text-sm uppercase tracking-wide">Name</span>
              <span className="mt-1 block text-text">{clientInfo?.name ?? "-"}</span>
            </div>
            <div className="rounded-xl border border-border bg-background p-3 text-base text-muted-foreground">
              <span className="block text-sm uppercase tracking-wide">Email</span>
              <span className="mt-1 block text-text">{clientInfo?.email ?? "-"}</span>
            </div>
            <div className="rounded-xl border border-border bg-background p-3 text-base text-muted-foreground">
              <span className="block text-sm uppercase tracking-wide">Phone</span>
              <span className="mt-1 block text-text">{clientInfo?.phone ?? "-"}</span>
            </div>
            <div className="rounded-xl border border-border bg-background p-3 text-base text-muted-foreground">
              <span className="block text-sm uppercase tracking-wide">WhatsApp</span>
              <span className="mt-1 block text-text">{clientInfo?.whatsapp_number ?? "-"}</span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-text">Appearance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Switch between dark and light. Saved on this device.
            </p>
          </div>
          <div
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background p-1"
            role="group"
            aria-label="Theme preference"
          >
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                theme === "dark" ? "bg-primary text-white" : "text-muted-foreground"
              }`}
              aria-pressed={theme === "dark"}
              title="Dark mode"
              onClick={() => setTheme("dark")}
            >
              <Moon className="h-3.5 w-3.5" />
              Dark
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                theme === "light" ? "bg-primary text-white" : "text-muted-foreground"
              }`}
              aria-pressed={theme === "light"}
              title="Light mode"
              onClick={() => setTheme("light")}
            >
              <Sun className="h-3.5 w-3.5" />
              Light
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => void refreshTasks()} disabled={tasksLoading || tasksSaving}>
            Refresh
          </Button>
        </div>

        <form className="mt-4 grid gap-3 md:grid-cols-[1.2fr_2fr_auto]" onSubmit={(event) => void addTask(event)}>
          <input
            value={titleInput}
            onChange={(event) => setTitleInput(event.target.value)}
            placeholder="Task title"
            className="rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
          />
          <input
            value={descInput}
            onChange={(event) => setDescInput(event.target.value)}
            placeholder="Task description"
            className="rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
          />
          <Button type="submit" disabled={tasksSaving}>
            Add Task
          </Button>
        </form>

        {tasksError && <p className="mt-3 rounded-lg border border-primary/50 bg-primary/10 p-2 text-sm text-primary">{tasksError}</p>}

        <div className="mt-4 space-y-3 xl:hidden">
          {visibleTasks.map((task) => (
            <article key={task.id} className="rounded-xl border border-border bg-background p-3">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={task.is_completed} onChange={() => void toggleTask(task)} disabled={tasksSaving} className="mt-1 h-4 w-4" />
                <span className={task.is_completed ? "min-w-0 text-muted-foreground line-through" : "min-w-0 text-text"}>
                  <span className="block font-medium">{task.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{task.desc ?? "-"}</span>
                </span>
              </label>
              <Button type="button" variant="secondary" onClick={() => void deleteTask(task)} disabled={tasksSaving} className="mt-3 w-full">
                Delete
              </Button>
            </article>
          ))}
        </div>
        <div className="mt-4 hidden overflow-x-auto rounded-xl border border-border xl:block">
          <table className="min-w-full divide-y divide-border text-base">
            <thead className="bg-muted text-left text-sm uppercase tracking-wide text-muted-foreground">
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
                  <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                    No tasks yet.
                  </td>
                </tr>
              )}
              {tasksLoading && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                    Loading tasks...
                  </td>
                </tr>
              )}
              {visibleTasks.map((task) => (
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
                  <td className="px-3 py-2 text-muted-foreground">{formatUtcToIst(task.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void deleteTask(task)}
                      disabled={tasksSaving}
                      className="inline-flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
