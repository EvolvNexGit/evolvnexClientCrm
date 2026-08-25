"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";
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

const PREVIEW_MAX_LENGTH = 100;
const PANEL_TRANSITION_MS = 300;

function templatePreview(template: MessageTemplateRecord): string {
  const notes = template.notes?.trim();
  if (notes) {
    return notes.length <= PREVIEW_MAX_LENGTH
      ? notes
      : `${notes.slice(0, PREVIEW_MAX_LENGTH)}…`;
  }

  const body = template.body.trim();
  if (!body) {
    return "No message body yet.";
  }
  return body.length <= PREVIEW_MAX_LENGTH
    ? body
    : `${body.slice(0, PREVIEW_MAX_LENGTH)}…`;
}

export default function TemplatesTab({ clientId }: { clientId: string }) {
  const { templates, loading, saving, error, addTemplate, editTemplate, removeTemplate } =
    useMessageTemplates(clientId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);

  useEffect(() => {
    if (!panelOpen) {
      setPanelVisible(false);
      return;
    }

    setPanelVisible(false);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelVisible(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [panelOpen]);

  function openEditor(template?: MessageTemplateRecord) {
    if (template) {
      setSelectedId(template.id);
      setForm({
        title: template.title,
        body: template.body,
        category: template.category ?? "",
        notes: template.notes ?? "",
      });
    } else {
      setSelectedId(null);
      setForm(emptyForm);
    }
    setFormError(null);
    setPanelOpen(true);
  }

  function closeEditor() {
    setPanelVisible(false);
    window.setTimeout(() => {
      setPanelOpen(false);
      setSelectedId(null);
      setForm(emptyForm);
      setFormError(null);
    }, PANEL_TRANSITION_MS);
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
        closeEditor();
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
      closeEditor();
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
          <Button type="button" variant="secondary" onClick={() => openEditor()} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            New
          </Button>
        </div>
      </section>

      {(error || formError) && !panelOpen && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          {formError || error}
        </div>
      )}

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <p className="mb-4 text-center text-sm font-medium text-muted-foreground">Templates</p>
        <DataState
          loading={loading}
          error={null}
          empty={!loading && templates.length === 0}
          emptyLabel="No templates yet. Create one to get started."
        />
        {!loading && templates.length > 0 && (
          <ul className="mx-auto flex w-full max-w-2xl flex-col gap-3">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => openEditor(template)}
                  className="w-full rounded-2xl border border-border bg-background px-4 py-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-base font-semibold text-text">{template.title}</p>
                    {template.category ? (
                      <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                        {template.category}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {templatePreview(template)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {panelOpen ? (
        <div
          className="fixed inset-0 z-40"
          role="presentation"
          onClick={closeEditor}
        >
          <div
            className={cn(
              "absolute inset-0 bg-black/60 transition-opacity duration-300",
              panelVisible ? "opacity-100" : "opacity-0",
            )}
          />
          <aside
            className={cn(
              "fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-soft transition-transform duration-300 ease-out",
              panelVisible ? "translate-x-0" : "translate-x-full",
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-text"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h3 id="template-editor-title" className="truncate text-lg font-semibold text-text">
                  {selectedId ? "Edit template" : "New template"}
                </h3>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
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

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              {formError ? (
                <div className="mb-4 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
                  {formError}
                </div>
              ) : null}

              <div className="grid gap-3">
                <label className="space-y-1 text-sm text-muted-foreground">
                  <span>Title *</span>
                  <input
                    value={form.title}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder="e.g. Welcome follow-up"
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text outline-none"
                  />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  <span>Body *</span>
                  <textarea
                    value={form.body}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, body: event.target.value }))
                    }
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
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                    placeholder="Short description for your team"
                    rows={3}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none"
                  />
                </label>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
