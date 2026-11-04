"use client";

import { useEffect } from "react";

export type StockAlert = {
  id: number;
  tone: "warning" | "danger";
  messages: string[];
};

const AUTO_DISMISS_MS = 5000;
const MAX_VISIBLE_MESSAGES = 3;

export function StockAlertToast({ alert, onDismiss }: { alert: StockAlert | null; onDismiss: () => void }) {
  const alertId = alert?.id;

  useEffect(() => {
    if (alertId === undefined) {
      return;
    }

    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [alertId, onDismiss]);

  if (!alert) {
    return null;
  }

  const visible = alert.messages.slice(0, MAX_VISIBLE_MESSAGES);
  const hiddenCount = alert.messages.length - visible.length;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      className={`fixed right-4 top-20 z-50 w-[min(22rem,calc(100vw-2rem))] cursor-pointer rounded-xl border p-3 text-sm shadow-lg backdrop-blur ${
        alert.tone === "danger"
          ? "border-rose-500/50 bg-rose-950/90 text-rose-200"
          : "border-amber-500/50 bg-amber-950/90 text-amber-200"
      }`}
    >
      <ul className="space-y-1">
        {visible.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
      {hiddenCount > 0 && <p className="mt-1 text-xs opacity-80">+{hiddenCount} more</p>}
    </div>
  );
}
