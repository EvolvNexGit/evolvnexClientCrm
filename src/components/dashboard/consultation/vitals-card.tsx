"use client";

import { Activity } from "lucide-react";
import { VITAL_FIELDS, type VitalsFormInput } from "@/lib/consultation-vitals";

type VitalsCardProps = {
  value: VitalsFormInput;
  onChange: (next: VitalsFormInput) => void;
  error: string | null;
  disabled?: boolean;
};

export function VitalsCard({ value, onChange, error, disabled }: VitalsCardProps) {
  return (
    <section id="consult-vitals" className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text">Vitals</h3>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {VITAL_FIELDS.map((field) => (
          <label key={field.key} className="block min-w-0 space-y-1.5">
            <span className="text-xs text-muted-foreground">
              {field.label} ({field.unit})
            </span>
            <input
              type="text"
              inputMode={field.key === "bp" ? "text" : "decimal"}
              maxLength={7}
              value={value[field.key]}
              placeholder={field.placeholder}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none placeholder:text-muted-foreground"
            />
          </label>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-primary">
          {error}
        </p>
      )}
    </section>
  );
}
