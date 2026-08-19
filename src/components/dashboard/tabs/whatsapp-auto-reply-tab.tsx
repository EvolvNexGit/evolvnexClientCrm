"use client";

import { useState } from "react";
import { Loader2, MessageSquareText, Plus, Save, Trash2 } from "lucide-react";
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
  const {
    replies,
    events,
    connection,
    loading,
    saving,
    error,
    addReply,
    editReply,
    removeReply,
    saveConnection,
  } = useWhatsAppAutoReplies(clientId);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);

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

  async function handleSaveConnection() {
    setConnectionMessage(null);
    try {
      await saveConnection({
        phoneNumberId: phoneNumberId || connection?.phoneNumberId || "",
        displayPhone: displayPhone || connection?.displayPhone || "",
        wabaId: wabaId || connection?.wabaId || "",
        accessToken,
        appSecret,
        verifyToken,
      });
      setAccessToken("");
      setAppSecret("");
      setVerifyToken("");
      setConnectionMessage("WhatsApp credentials saved. Tokens are encrypted and are not shown again.");
    } catch (saveError) {
      setConnectionMessage(saveError instanceof Error ? saveError.message : "Unable to save connection.");
    }
  }

  const isConnected =
    connection?.status === "connected" &&
    connection.hasAccessToken &&
    connection.hasAppSecret &&
    connection.hasVerifyToken;

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
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">WhatsApp Auto Replies</p>
            <h2 className="mt-2 text-2xl font-semibold text-text">Simple keyword → response map</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              When a customer sends a matching message (for example <span className="text-text">hi</span>), we reply
              with your configured text.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm">
            <p className="text-muted-foreground">Connection</p>
            <p className="mt-1 font-medium text-text">{isConnected ? "Connected" : "Not connected"}</p>
          </div>
        </div>
      </section>

      {(error || formError || connectionMessage) && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          {formError || connectionMessage || error}
        </div>
      )}

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-text">WhatsApp Cloud API credentials</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Each client stores its own token and app secret in the database (encrypted). Secrets are never returned to
          the browser after save.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-border px-3 py-1">
            Token {connection?.hasAccessToken ? "saved" : "missing"}
          </span>
          <span className="rounded-full border border-border px-3 py-1">
            App secret {connection?.hasAppSecret ? "saved" : "missing"}
          </span>
          <span className="rounded-full border border-border px-3 py-1">
            Verify token {connection?.hasVerifyToken ? "saved" : "missing"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm text-muted-foreground">
            <span>Phone number ID *</span>
            <input
              value={phoneNumberId || connection?.phoneNumberId || ""}
              onChange={(event) => setPhoneNumberId(event.target.value)}
              placeholder="Meta phone_number_id"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text outline-none"
            />
          </label>
          <label className="space-y-1 text-sm text-muted-foreground">
            <span>Display phone</span>
            <input
              value={displayPhone || connection?.displayPhone || ""}
              onChange={(event) => setDisplayPhone(event.target.value)}
              placeholder="+91..."
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text outline-none"
            />
          </label>
          <label className="space-y-1 text-sm text-muted-foreground sm:col-span-2">
            <span>WABA ID</span>
            <input
              value={wabaId || connection?.wabaId || ""}
              onChange={(event) => setWabaId(event.target.value)}
              placeholder="Optional WhatsApp Business Account id"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text outline-none"
            />
          </label>
          <label className="space-y-1 text-sm text-muted-foreground">
            <span>Access token {connection?.hasAccessToken ? "(leave blank to keep)" : "*"}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder={connection?.hasAccessToken ? "••••••••" : "Permanent access token"}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text outline-none"
            />
          </label>
          <label className="space-y-1 text-sm text-muted-foreground">
            <span>App secret {connection?.hasAppSecret ? "(leave blank to keep)" : "*"}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={appSecret}
              onChange={(event) => setAppSecret(event.target.value)}
              placeholder={connection?.hasAppSecret ? "••••••••" : "Meta app secret"}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text outline-none"
            />
          </label>
          <label className="space-y-1 text-sm text-muted-foreground sm:col-span-2">
            <span>Webhook verify token {connection?.hasVerifyToken ? "(leave blank to keep)" : "*"}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={verifyToken}
              onChange={(event) => setVerifyToken(event.target.value)}
              placeholder={connection?.hasVerifyToken ? "••••••••" : "Same value you enter in Meta webhook setup"}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text outline-none"
            />
          </label>
        </div>
        <div className="mt-4">
          <Button className="gap-2" disabled={saving} onClick={() => void handleSaveConnection()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save credentials
          </Button>
        </div>
      </section>

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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
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

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-text">Recent exchanges</h3>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No inbound/outbound WhatsApp events yet.</p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-text">
                    {event.direction === "inbound" ? "Customer" : "Bot"} · {event.from_phone || event.to_phone || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{event.body || "—"}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
