"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { useWhatsAppAutoReplies } from "@/hooks/use-whatsapp-auto-replies";
import type { AutoReplyMatchMode, CommunicationAutoReply } from "@/lib/communication-types";
import { cn } from "@/lib/utils";

type FormState = {
  triggerText: string;
  responseText: string;
  matchMode: AutoReplyMatchMode;
  isActive: boolean;
};

const emptyForm: FormState = {
  triggerText: "",
  responseText: "",
  matchMode: "exact",
  isActive: true,
};

const PREVIEW_MAX_LENGTH = 100;
const PANEL_TRANSITION_MS = 300;

function replyPreview(reply: CommunicationAutoReply): string {
  const text = reply.response_text.trim();
  if (!text) {
    return "No reply text configured.";
  }
  return text.length <= PREVIEW_MAX_LENGTH ? text : `${text.slice(0, PREVIEW_MAX_LENGTH)}…`;
}

export default function WhatsAppAutoReplyTab({ clientId }: { clientId: string }) {
  const { replies, loading, saving, error, addReply, editReply, removeReply } =
    useWhatsAppAutoReplies(clientId);

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

  function openEditor(reply?: CommunicationAutoReply) {
    if (reply) {
      setSelectedId(reply.id);
      setForm({
        triggerText: reply.trigger_text,
        responseText: reply.response_text,
        matchMode: reply.match_mode,
        isActive: reply.is_active,
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
    try {
      if (selectedId) {
        await editReply(selectedId, form);
      } else {
        await addReply({ ...form, sortOrder: replies.length });
        closeEditor();
      }
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Unable to save reply map.");
    }
  }

  async function handleDelete() {
    if (!selectedId) {
      return;
    }
    if (!window.confirm("Delete this auto-reply permanently? This cannot be undone.")) {
      return;
    }
    setFormError(null);
    try {
      await removeReply(selectedId);
      closeEditor();
    } catch (deleteError) {
      setFormError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete auto-reply.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">LEADS</p>
            <h2 className="mt-2 text-2xl font-semibold text-text">Auto replies</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure keyword triggers and automatic WhatsApp responses for incoming messages.
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
        <p className="mb-4 text-center text-sm font-medium text-muted-foreground">Reply mappings</p>
        <DataState
          loading={loading}
          error={null}
          empty={!loading && replies.length === 0}
          emptyLabel="No auto-replies yet. Create one to get started."
        />
        {!loading && replies.length > 0 && (
          <ul className="mx-auto flex w-full max-w-2xl flex-col gap-3">
            {replies.map((reply) => (
              <li key={reply.id}>
                <button
                  type="button"
                  onClick={() => openEditor(reply)}
                  className="w-full rounded-2xl border border-border bg-background px-4 py-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-base font-semibold text-text">“{reply.trigger_text}”</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                        {reply.match_mode}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs",
                          reply.is_active
                            ? "border-primary/40 text-primary"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {reply.is_active ? "Active" : "Off"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{replyPreview(reply)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {panelOpen ? (
        <div className="fixed inset-0 z-40" role="presentation" onClick={closeEditor}>
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
            aria-labelledby="auto-reply-editor-title"
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
                <h3 id="auto-reply-editor-title" className="truncate text-lg font-semibold text-text">
                  {selectedId ? "Edit auto-reply" : "New auto-reply"}
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
                  <span>When customer sends *</span>
                  <input
                    value={form.triggerText}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, triggerText: event.target.value }))
                    }
                    placeholder="hi"
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text outline-none"
                  />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  <span>Match mode</span>
                  <select
                    value={form.matchMode}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        matchMode: event.target.value === "contains" ? "contains" : "exact",
                      }))
                    }
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text"
                  >
                    <option value="exact">Exact match</option>
                    <option value="contains">Contains</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  <span>We reply with *</span>
                  <textarea
                    value={form.responseText}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, responseText: event.target.value }))
                    }
                    placeholder="Hello! Following are our offered services..."
                    rows={8}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, isActive: event.target.checked }))
                    }
                  />
                  Active
                </label>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
