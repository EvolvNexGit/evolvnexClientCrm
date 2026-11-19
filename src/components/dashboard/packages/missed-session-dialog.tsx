"use client";

import { useEffect, useState } from "react";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import type { PackageSettings } from "@/lib/client-settings-types";
import { PACKAGE_LIMITS, type MissedResolution } from "@/lib/package-types";
import { formatSupabaseError } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export type MissedSessionTarget = {
  sessionId: string;
  packageName: string;
  customerName: string | null;
  appointmentDate: string | null;
  /** cancelled (appointment cancelled) or no_show (marked missed). */
  reason: "cancelled" | "no_show" | null;
};

/**
 * Decision for one missed session (D-05): prompted every time, the tenant default is pre-selected (roll over unless
 * the tenant changed it) and the other option is an explicit override. Dismissing keeps the session undecided: it
 * never consumes credit and stays visible as Needs decision.
 */
export function MissedSessionDialog({
  target,
  settings,
  saving,
  onResolve,
  onDismiss,
}: {
  target: MissedSessionTarget | null;
  settings: PackageSettings;
  saving: boolean;
  onResolve: (sessionId: string, resolution: MissedResolution, note: string | null) => Promise<unknown>;
  onDismiss: () => void;
}) {
  const [choice, setChoice] = useState<MissedResolution>(settings.missed_default);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const labels = settings.labels;

  // Re-arm the default every time a new session is prompted.
  useEffect(() => {
    if (target) {
      setChoice(settings.missed_default);
      setNote("");
      setError(null);
    }
  }, [settings.missed_default, target]);

  async function handleConfirm() {
    if (!target || saving) {
      return;
    }
    if (note.trim().length > PACKAGE_LIMITS.noteMax) {
      setError(`Notes must be ${PACKAGE_LIMITS.noteMax} characters or fewer.`);
      return;
    }
    try {
      setError(null);
      await onResolve(target.sessionId, choice, note.trim() || null);
    } catch (resolveError) {
      setError(formatSupabaseError(resolveError, "Unable to save the decision."));
    }
  }

  const session = labels.session.toLowerCase();
  const extension = settings.rollover_extends_validity_days;
  const options: Array<{ value: MissedResolution; title: string; detail: string }> = [
    {
      value: "rollover",
      title: "Roll over",
      detail: `Keep the ${session}: it goes back to the ${labels.package.toLowerCase()} to book again.${
        extension > 0 ? ` The expiry moves ${extension} day${extension === 1 ? "" : "s"} later.` : ""
      }`,
    },
    {
      value: "forfeit",
      title: "Forfeit",
      detail: `The ${session} is used up and not given back.`,
    },
  ];

  return (
    <EntityModal open={Boolean(target)} title={`Missed ${session}`} onClose={onDismiss}>
      {target && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {target.customerName ? <span className="font-medium text-text">{target.customerName}</span> : "This customer"}{" "}
            {target.reason === "no_show" ? "missed" : "cancelled"} a {session}
            {target.appointmentDate ? ` on ${target.appointmentDate}` : ""} from{" "}
            <span className="font-medium text-text">{target.packageName}</span>. What should happen to it?
          </p>

          <fieldset className="space-y-2">
            <legend className="sr-only">Decision</legend>
            {options.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm",
                  choice === option.value ? "border-primary bg-primary/5" : "border-border bg-background",
                )}
              >
                <input
                  type="radio"
                  name="missed-session-decision"
                  value={option.value}
                  checked={choice === option.value}
                  onChange={() => setChoice(option.value)}
                  className="mt-1 h-4 w-4"
                />
                <span className="space-y-0.5">
                  <span className="block font-medium text-text">
                    {option.title}
                    {option.value === settings.missed_default ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(clinic default)</span>
                    ) : null}
                  </span>
                  <span className="block text-muted-foreground">{option.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="block space-y-1 text-sm text-muted-foreground">
            <span>Note (optional)</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={PACKAGE_LIMITS.noteMax}
              className="min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:text-sm"
            />
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onDismiss}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground hover:bg-muted sm:w-auto"
            >
              Decide later
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={saving}
              className="min-h-11 w-full rounded-xl border border-border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {saving ? "Saving..." : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </EntityModal>
  );
}
