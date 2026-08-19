"use client";

import { Bell } from "lucide-react";
import { useOrderAlertSettings } from "@/contexts/order-alert-context";

export function OrderAlertSettingsCard() {
  const { enabled, busy, statusLabel, error, setEnabled, testAlert } = useOrderAlertSettings();

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-text">
            <Bell className="h-4 w-4" />
            Order alerts
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sound and browser notification when an Air Menu order arrives. POS billing is ignored.
          </p>
          <p className="mt-2 text-sm text-text">{statusLabel}</p>
          {error && <p className="mt-2 text-sm text-primary">{error}</p>}
        </div>
        <div
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background p-1"
          role="group"
          aria-label="Order alerts"
        >
          <button
            type="button"
            className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium ${
              !enabled ? "bg-primary text-white" : "text-muted-foreground"
            }`}
            aria-pressed={!enabled}
            disabled={busy}
            onClick={() => void setEnabled(false)}
          >
            Off
          </button>
          <button
            type="button"
            className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium ${
              enabled ? "bg-primary text-white" : "text-muted-foreground"
            }`}
            aria-pressed={enabled}
            disabled={busy}
            onClick={() => void setEnabled(true)}
          >
            On
          </button>
        </div>
      </div>
      <div className="mt-4">
        <button
          type="button"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
          disabled={busy}
          onClick={() => void testAlert()}
        >
          Test sound and notification
        </button>
      </div>
    </div>
  );
}
