"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  PACKAGE_LABEL_MAX_LENGTH,
  PACKAGE_ROLLOVER_EXTENSION_MAX_DAYS,
  validatePackageSettings,
  type PackageMissedDefault,
  type PackageSettings,
} from "@/lib/client-settings-types";
import { formatSupabaseError } from "@/lib/supabase";

type SettingsForm = {
  missedDefault: PackageMissedDefault;
  extensionDays: string;
  chargeForfeits: boolean;
  package: string;
  packages: string;
  session: string;
  sessions: string;
};

function toForm(value: PackageSettings): SettingsForm {
  return {
    missedDefault: value.missed_default,
    extensionDays: String(value.rollover_extends_validity_days),
    chargeForfeits: value.forfeit_charges_per_visit,
    ...value.labels,
  };
}

const inputClass =
  "w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text placeholder:text-muted-foreground sm:text-sm";

/**
 * Clinic-wide package settings (client_settings namespace packages): vocabulary, the missed-session default
 * (D-05), the rollover expiry extension (R-15) and whether forfeited per-visit sessions are charged (R-16).
 * Changes apply to future decisions only; past decisions keep the values snapshotted on their session rows.
 */
export function PackageSettingsSection({
  value,
  loading,
  saving,
  loadError,
  onSave,
}: {
  value: PackageSettings;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  onSave: (next: PackageSettings) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SettingsForm>(() => toForm(value));
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  // Reset only when the stored values actually change (a focus refresh with equal values keeps unsaved edits).
  const valueKey = JSON.stringify(value);
  useEffect(() => {
    setForm(toForm(JSON.parse(valueKey) as PackageSettings));
  }, [valueKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    const extension = /^\d{1,3}$/.test(form.extensionDays.trim()) ? Number(form.extensionDays.trim()) : Number.NaN;
    const candidate = {
      missed_default: form.missedDefault,
      rollover_extends_validity_days: extension,
      forfeit_charges_per_visit: form.chargeForfeits,
      labels: { package: form.package, packages: form.packages, session: form.session, sessions: form.sessions },
    };
    const validation = validatePackageSettings(candidate);
    if (!validation.ok) {
      setMessage({ tone: "error", text: validation.error });
      return;
    }

    try {
      setMessage(null);
      await onSave(validation.value);
      setMessage({ tone: "ok", text: "Saved. New decisions use these settings; past ones keep theirs." });
    } catch (saveError) {
      setMessage({ tone: "error", text: formatSupabaseError(saveError, "Unable to save settings.") });
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-text"
      >
        Settings
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <form onSubmit={handleSubmit} noValidate className="space-y-4 border-t border-border p-4">
          {loadError ? <p className="text-sm text-rose-400">{loadError} Showing defaults.</p> : null}
          {loading ? <p className="text-sm text-muted-foreground">Loading settings...</p> : null}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-text">When a {value.labels.session.toLowerCase()} is missed</legend>
            <p className="text-xs text-muted-foreground">
              The doctor is always asked. This choice is pre-selected; picking the other one is recorded as an override.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {(
                [
                  { key: "rollover", label: "Roll over (give it back)" },
                  { key: "forfeit", label: "Forfeit (use it up)" },
                ] as const
              ).map((option) => (
                <label
                  key={option.key}
                  className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-sm text-text"
                >
                  <input
                    type="radio"
                    name="package-missed-default"
                    checked={form.missedDefault === option.key}
                    onChange={() => setForm((current) => ({ ...current, missedDefault: option.key }))}
                    className="h-4 w-4"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Roll over extends expiry by (days)</span>
              <input
                value={form.extensionDays}
                onChange={(event) =>
                  setForm((current) => ({ ...current, extensionDays: event.target.value.replace(/\D/g, "").slice(0, 3) }))
                }
                inputMode="numeric"
                className={inputClass}
              />
              <span className="block text-xs">0 keeps the expiry unchanged. Up to {PACKAGE_ROLLOVER_EXTENSION_MAX_DAYS}.</span>
            </label>

            <label className="flex min-h-11 items-start gap-2 text-sm text-text sm:pt-6">
              <input
                type="checkbox"
                checked={form.chargeForfeits}
                onChange={(event) => setForm((current) => ({ ...current, chargeForfeits: event.target.checked }))}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Charge forfeited {value.labels.sessions.toLowerCase()} on pay-per-visit plans
                <span className="block text-xs text-muted-foreground">Recorded on each forfeit when it happens.</span>
              </span>
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-text">Words used on screen</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  { key: "package", label: "One package" },
                  { key: "packages", label: "Many packages" },
                  { key: "session", label: "One session" },
                  { key: "sessions", label: "Many sessions" },
                ] as const
              ).map((field) => (
                <label key={field.key} className="space-y-1 text-sm text-muted-foreground">
                  <span>{field.label}</span>
                  <input
                    value={form[field.key]}
                    onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                    maxLength={PACKAGE_LABEL_MAX_LENGTH}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          {message ? (
            <p className={message.tone === "error" ? "text-sm text-rose-400" : "text-sm text-emerald-600"}>{message.text}</p>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 w-full rounded-xl border border-border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {saving ? "Saving..." : "Save settings"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
