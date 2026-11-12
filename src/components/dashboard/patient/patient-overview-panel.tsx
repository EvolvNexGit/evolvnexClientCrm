"use client";

import { AlertTriangle } from "lucide-react";
import type { CustomerRecord } from "@/lib/billing-types";
import { formatPatientAge } from "@/lib/consultation-types";

type PatientOverviewPanelProps = {
  patient: CustomerRecord;
};

const NOT_RECORDED = "Not recorded";

function splitAllergies(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,;\n\r]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function textOrNotRecorded(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || NOT_RECORDED;
}

function formatDob(value: string | null | undefined): string {
  if (!value) return NOT_RECORDED;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

export function PatientOverviewPanel({ patient }: PatientOverviewPanelProps) {
  const allergies = splitAllergies(patient.allergies);

  const rows: Array<{ label: string; value: string }> = [
    { label: "Chronic conditions", value: textOrNotRecorded(patient.chronic_conditions) },
    { label: "Gender", value: textOrNotRecorded(patient.gender) },
    { label: "Blood group", value: textOrNotRecorded(patient.blood_group) },
    { label: "Age", value: formatPatientAge(patient.dob) },
    { label: "Date of birth", value: formatDob(patient.dob) },
    { label: "Phone", value: textOrNotRecorded(patient.phone) },
    { label: "Email", value: textOrNotRecorded(patient.email) },
    { label: "Notes", value: textOrNotRecorded(patient.notes) },
  ];

  return (
    <div className="space-y-5">
      <div role="note" className="rounded-2xl border border-border bg-background p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-text">
          <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden="true" />
          <span>Allergies</span>
        </div>
        {allergies.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {allergies.map((allergy, index) => (
              <li
                key={`${allergy}-${index}`}
                className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-sm font-semibold text-red-500"
              >
                {allergy}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{NOT_RECORDED}</p>
        )}
      </div>

      <dl className="space-y-4">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-base text-text">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
