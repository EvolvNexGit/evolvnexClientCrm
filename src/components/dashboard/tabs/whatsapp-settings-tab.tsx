"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, Save, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWhatsAppSettings } from "@/hooks/use-whatsapp-settings";
import { cn } from "@/lib/utils";

const WEBHOOK_PATH = "/api/communication/whatsapp/webhook";

export default function WhatsAppSettingsTab({ clientId }: { clientId: string }) {
  const { connection, loading, saving, error, isConnected, saveCredentials, disconnect } =
    useWhatsAppSettings(clientId);

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    if (!connection) {
      return;
    }
    setPhoneNumberId(connection.phoneNumberId ?? "");
  }, [connection]);

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}${WEBHOOK_PATH}`);
  }, []);

  async function handleSave() {
    setFormMessage(null);
    try {
      await saveCredentials({
        phoneNumberId: phoneNumberId.trim(),
        accessToken,
        appSecret,
        verifyToken,
      });
      setAccessToken("");
      setAppSecret("");
      setVerifyToken("");
      setFormMessage("WhatsApp credentials saved. Secrets are encrypted and are not shown again.");
    } catch {
      // error surfaced via hook
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect WhatsApp and remove stored credentials for this client?")) {
      return;
    }
    setFormMessage(null);
    try {
      await disconnect();
      setPhoneNumberId("");
      setAccessToken("");
      setAppSecret("");
      setVerifyToken("");
      setFormMessage("WhatsApp disconnected. Stored credentials were removed.");
    } catch {
      // error surfaced via hook
    }
  }

  async function handleCopyWebhook() {
    if (!webhookUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setFormMessage("Webhook URL copied to clipboard.");
    } catch {
      setFormMessage("Unable to copy webhook URL.");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-2xl border border-border bg-card text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading WhatsApp settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">LEADS</p>
            <h2 className="mt-2 text-2xl font-semibold text-text">WhatsApp Settings</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect your tenant to the official WhatsApp Cloud API. Secrets are encrypted and never
              shown again after save.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm">
            <p className="text-muted-foreground">Connection</p>
            <p
              className={cn(
                "mt-1 font-medium",
                isConnected ? "text-primary" : "text-text",
              )}
            >
              {isConnected ? "Connected" : "Not connected"}
            </p>
          </div>
        </div>
      </section>

      {(error || formMessage) && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            error
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground",
          )}
        >
          {error || formMessage}
        </div>
      )}

      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-text">Webhook URL</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste this callback URL in your Meta app webhook configuration. Use the same verify token
          you enter below.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            readOnly
            value={webhookUrl}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-text outline-none"
          />
          <Button type="button" variant="secondary" onClick={() => void handleCopyWebhook()}>
            <Copy className="mr-2 h-4 w-4" />
            Copy
          </Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-text">Cloud API credentials</h3>
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

        <div className="mt-4 grid gap-3">
          <label className="space-y-1 text-sm text-muted-foreground">
            <span>Phone number ID *</span>
            <input
              value={phoneNumberId}
              onChange={(event) => setPhoneNumberId(event.target.value)}
              placeholder="Meta phone_number_id"
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
          <label className="space-y-1 text-sm text-muted-foreground">
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

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save credentials
          </Button>
          {isConnected ? (
            <Button type="button" variant="secondary" disabled={saving} onClick={() => void handleDisconnect()}>
              <Unplug className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
