"use client";

import { useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWhatsAppAutoReplies } from "@/hooks/use-whatsapp-auto-replies";
import type { AutoReplyMatchMode, CommunicationAutoReply } from "@/lib/communication-types";

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

export default function WhatsAppAutoReplyTab({ clientId }: { clientId: string }) {
  const { replies, loading, saving, error, addReply, editReply, removeReply } =
    useWhatsAppAutoReplies(clientId);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function startEdit(reply: CommunicationAutoReply) {
    setEditingId(reply.id);
    setForm({
      triggerText: reply.trigger_text,
      responseText: reply.response_text,
      matchMode: reply.match_mode,
      isActive: reply.is_active,
    });
    setFormError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleSaveReply() {
    setFormError(null);
    try {
      if (editingId) {
        await editReply(editingId, form);
      } else {
        await addReply({ ...form, sortOrder: replies.length });
      }
      resetForm();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Unable to save reply map.");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-2xl border border-border bg-card text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading auto-reply map...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(error || formError) && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          {formError || error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-text">{editingId ? "Edit mapping" : "Add mapping"}</h3>
            {editingId && (
              <Button variant="secondary" onClick={resetForm}>
                Cancel edit
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <label className="block space-y-1 text-sm text-muted-foreground">
              <span>When customer sends *</span>
              <input
                value={form.triggerText}
                onChange={(event) => setForm((current) => ({ ...current, triggerText: event.target.value }))}
                placeholder="hi"
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text outline-none"
              />
            </label>

            <label className="block space-y-1 text-sm text-muted-foreground">
              <span>Match mode</span>
              <select
                value={form.matchMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    matchMode: event.target.value === "contains" ? "contains" : "exact",
                  }))
                }
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text"
              >
                <option value="exact">Exact match</option>
                <option value="contains">Contains</option>
              </select>
            </label>

            <label className="block space-y-1 text-sm text-muted-foreground">
              <span>We reply with *</span>
              <textarea
                rows={7}
                value={form.responseText}
                onChange={(event) => setForm((current) => ({ ...current, responseText: event.target.value }))}
                placeholder="Hello! Following are our offered services..."
                className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none"
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              Active
            </label>

            <Button className="gap-2" disabled={saving} onClick={() => void handleSaveReply()}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingId ? (
                <Save className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {editingId ? "Update mapping" : "Add mapping"}
            </Button>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-semibold text-text">Current map</h3>
          <div className="mt-4 space-y-3">
            {replies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No mappings yet.</p>
            ) : (
              replies.map((reply) => (
                <div key={reply.id} className="rounded-2xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        {reply.match_mode} · {reply.is_active ? "active" : "off"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-text">“{reply.trigger_text}”</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{reply.response_text}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="secondary" className="h-9 px-3" onClick={() => startEdit(reply)}>
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-9 w-9 p-0"
                        disabled={saving}
                        onClick={() => void removeReply(reply.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
