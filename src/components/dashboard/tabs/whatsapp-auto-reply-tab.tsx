"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { LeadsTabHeader } from "@/components/dashboard/leads/leads-tab-header";
import { SlideEditorPanel, useSlideEditorPanel } from "@/components/dashboard/leads/slide-editor-panel";
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
  const { panelVisible, closeWithAnimation } = useSlideEditorPanel(panelOpen);

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
    closeWithAnimation(() => {
      setPanelOpen(false);
      setSelectedId(null);
      setForm(emptyForm);
      setFormError(null);
    });
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
      <LeadsTabHeader
        title="Auto replies"
        description="Configure keyword triggers and automatic WhatsApp responses for incoming messages."
        action={
          <Button type="button" variant="secondary" onClick={() => openEditor()} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            New
          </Button>
        }
      />

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

      <SlideEditorPanel
        open={panelOpen}
        panelVisible={panelVisible}
        title={selectedId ? "Edit auto-reply" : "New auto-reply"}
        titleId="auto-reply-editor-title"
        saving={saving}
        canDelete={Boolean(selectedId)}
        formError={formError}
        onClose={closeEditor}
        onSave={() => void handleSave()}
        onDelete={() => void handleDelete()}
      >
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
      </SlideEditorPanel>
    </div>
  );
}
