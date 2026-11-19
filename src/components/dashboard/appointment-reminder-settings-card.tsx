"use client";

import { CalendarClock } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useApp } from "@/contexts/app-context";
import { useOrderAlertSettings } from "@/contexts/order-alert-context";
import { useClientSettings } from "@/hooks/use-client-settings";
import {
  REMINDER_LEAD_MAX_MINUTES,
  REMINDER_LEAD_MIN_MINUTES,
  validateReminderSettings,
} from "@/lib/client-settings-types";
import { cn } from "@/lib/utils";

const LEAD_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 5, label: "5 min" },
  { minutes: 10, label: "10 min" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 1440, label: "1 day" },
];

/** Clinic-wide appointment reminder settings on My Profile; hidden when this tenant does not scan appointments. */
export function AppointmentReminderSettingsCard() {
  const { clientId } = useApp();
  const { remindersApplicable } = useOrderAlertSettings();
  const {
    value,
    loading,
    saving,
    error: settingsError,
    save,
  } = useClientSettings(clientId ?? "", "reminders", { enabled: remindersApplicable && Boolean(clientId) });
  const [draft, setDraft] = useState(String(value.lead_minutes));
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Follow the stored value after load, refresh or a change made on another device.
  useEffect(() => {
    setDraft(String(value.lead_minutes));
  }, [value.lead_minutes]);

  if (!remindersApplicable || !clientId) {
    return null;
  }

  const draftMinutes = draft.trim() === "" ? Number.NaN : Number(draft);
  const dirty = draftMinutes !== value.lead_minutes;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);

    const validation = validateReminderSettings({ lead_minutes: draftMinutes });
    if (!validation.ok) {
      setLocalError(validation.error);
      return;
    }

    setLocalError(null);
    try {
      await save(validation.value);
      setSaved(true);
    } catch {
      // The hook already exposes the failure through its error state.
    }
  }

  const error = localError ?? settingsError;

  return (
    <form className="rounded-2xl border border-border bg-card p-4" onSubmit={(event) => void handleSave(event)}>
      <h2 className="inline-flex items-center gap-2 text-base font-semibold text-text">
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        Appointment reminders
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        How long before an appointment to alert. This applies to every device of this clinic. Alerts still need to be
        turned On on each device above, because browser permission is per device.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Reminder lead time presets">
        {LEAD_PRESETS.map((preset) => (
          <button
            key={preset.minutes}
            type="button"
            aria-pressed={draftMinutes === preset.minutes}
            disabled={loading || saving}
            onClick={() => {
              setDraft(String(preset.minutes));
              setSaved(false);
              setLocalError(null);
            }}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border border-border px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 xl:min-h-0",
              draftMinutes === preset.minutes ? "bg-primary text-white" : "bg-background text-muted-foreground",
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block text-sm text-text sm:w-48">
          Custom (minutes, {REMINDER_LEAD_MIN_MINUTES} to {REMINDER_LEAD_MAX_MINUTES})
          <input
            type="number"
            inputMode="numeric"
            min={REMINDER_LEAD_MIN_MINUTES}
            max={REMINDER_LEAD_MAX_MINUTES}
            step={1}
            value={draft}
            disabled={loading || saving}
            onChange={(event) => {
              setDraft(event.target.value);
              setSaved(false);
              setLocalError(null);
            }}
            className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-text focus:outline-none focus:ring-2 focus:ring-primary xl:min-h-0 xl:py-2"
          />
        </label>
        <button
          type="submit"
          disabled={loading || saving || !dirty}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 xl:min-h-0 xl:py-2"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-primary">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="mt-3 text-sm text-text">
          Saved. Other devices pick this up within a few minutes.
        </p>
      )}
    </form>
  );
}
