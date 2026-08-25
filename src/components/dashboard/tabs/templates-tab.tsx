"use client";

import { useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { useMessageTemplates } from "@/hooks/use-message-templates";
import type { MessageTemplateRecord } from "@/lib/communication-types";
import { cn } from "@/lib/utils";

type FormState = {
  title: string;
  body: string;
  category: string;
  notes: string;
};

const emptyForm: FormState = {
  title: "",
  body: "",
  category: "",
  notes: "",
};

export default function TemplatesTab({ clientId }: { clientId: string }) {
  const { templates, loading, saving, error, addTemplate, editTemplate, removeTemplate } =
    useMessageTemplates(clientId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  function selectTemplate(template: MessageTemplateRecord) {
    setSelectedId(template.id);
    setForm({
      title: template.title,
      body: template.body,
      category: template.category ?? "",
      notes: template.notes ?? "",
    });
    setFormError(null);
  }

  function handleNew() {
    setSelectedId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleSave() {
    setFormError(null);
    const payload = {
      title: form.title,
      body: form.body,
      category: form.category.trim() ? form.category : null,
      notes: form.notes.trim() ? form.notes : null,
    };

    try {
      if (selectedId) {
        await editTemplate(selectedId, payload);
      } else {
        await addTemplate(payload);
        handleNew();
      }
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Unable to save template.");
    }
  }

  async function handleDelete() {
    if (!selectedId) {
      return;
    }
    if (!window.confirm("Delete this template permanently? This cannot be undone.")) {
      return;
    }
    setFormError(null);
    try {
      await removeTemplate(selectedId);
      handleNew();
    } catch (deleteError) {
      setFormError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete template.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">LEADS</p>
            <h2 className="mt-2 text-2xl font-semibold text-text">Message templates</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage reusable plain-text message copy for your team. Inbox and send flows will use
              these later.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={handleNew} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            New
          </Button>
        </div>
      </section>

      {(error || formError) && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          {formError || error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <p className="mb-3 text-sm font-medium text-muted-foreground">Templates</p>
          <DataState
            loading={loading}
            error={null}
            empty={!loading && templates.length === 0}
            emptyLabel="No templates yet. Create one to get started."
          />
          {!loading && templates.length > 0 && (
            <ul className="max-h-[28rem] space-y-1 overflow-y-auto">
              {templates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => selectTemplate(template)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                      selectedId === template.id
                        ? "border-primary/50 bg-primary/10"
                        : "border-transparent hover:border-border hover:bg-background",
                    )}
                  >
                    <p className="truncate text-sm font-medium text-text">{template.title}</p>
                    {template.category ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {template.category}
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-text">
              {selectedId ? "Edit template" : "New template"}
            </h3>
            <div className="flex flex-wrap gap-2">
              {selectedId ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void handleDelete()}
                  disabled={saving}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              ) : null}
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Title *</span>
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="e.g. Welcome follow-up"
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text outline-none"
              />
            </label>
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Body *</span>
              <textarea
                value={form.body}
                onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
                placeholder="Plain text message body"
                rows={8}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none"
              />
            </label>
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Category</span>
              <input
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, category: event.target.value }))
                }
                placeholder="Optional category"
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text outline-none"
              />
            </label>
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Short description for your team"
                rows={3}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none"
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
