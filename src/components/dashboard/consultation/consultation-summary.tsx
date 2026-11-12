"use client";

import type { ReactNode } from "react";
import type { ConsultationDetail } from "@/lib/consultation-types";
import { VITAL_FIELDS } from "@/lib/consultation-vitals";

export function SummarySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-background p-4">
      <h5 className="text-xs xl:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h5>
      <div className="mt-2 text-sm text-text">{children}</div>
    </section>
  );
}

const text = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

/** Read-only recap of a consultation, shared by the history summary and the completed-consult view. */
export function ConsultationSummaryBody({ detail }: { detail: ConsultationDetail }) {
  const vitalChips = VITAL_FIELDS.flatMap((field) => {
    const value = detail.vitals?.[field.key];
    return value === undefined ? [] : [{ key: field.key, label: `${field.label} ${value} ${field.unit}` }];
  });
  const sections: Array<{ title: string; value: string | null }> = [
    { title: "Symptoms / Findings", value: text(detail.findings) },
    { title: "Assessment", value: text(detail.assessment) },
    { title: "Advice", value: text(detail.advice) },
    { title: "Medication notes", value: text(detail.medication_notes) },
    { title: "Exercise notes", value: text(detail.exercise_notes) },
    { title: "Treatment plan", value: text(detail.treatment_plan) },
    { title: "Other notes", value: text(detail.other_notes) },
  ];
  const hasContent =
    vitalChips.length > 0 ||
    sections.some((section) => section.value) ||
    detail.medications.length > 0 ||
    detail.exercises.length > 0 ||
    Boolean(detail.followup_date) ||
    Boolean(text(detail.followup_notes));

  return (
    <>
      {!hasContent && <p className="text-sm text-muted-foreground">No notes were recorded for this visit.</p>}

      {vitalChips.length > 0 && (
        <SummarySection title="Vitals">
          <ul className="flex flex-wrap gap-2">
            {vitalChips.map((chip) => (
              <li key={chip.key} className="rounded-full border border-border px-3 py-1 text-xs">
                {chip.label}
              </li>
            ))}
          </ul>
        </SummarySection>
      )}

      {sections.map(
        (section) =>
          section.value && (
            <SummarySection key={section.title} title={section.title}>
              <p className="whitespace-pre-wrap">{section.value}</p>
            </SummarySection>
          ),
      )}

      {detail.medications.length > 0 && (
        <SummarySection title="Medications">
          <ul className="space-y-2">
            {detail.medications.map((medication) => (
              <li key={medication.id}>
                <p className="font-medium">{medication.medicine_name}</p>
                <p className="text-xs text-muted-foreground">
                  {[medication.dosage, medication.frequency, medication.duration].filter(Boolean).join(" · ") || "—"}
                </p>
                {medication.instructions && <p className="text-xs text-muted-foreground">{medication.instructions}</p>}
              </li>
            ))}
          </ul>
        </SummarySection>
      )}

      {detail.exercises.length > 0 && (
        <SummarySection title="Exercises">
          <ul className="space-y-2">
            {detail.exercises.map((exercise) => (
              <li key={exercise.id}>
                <p className="font-medium">{exercise.exercise_name}</p>
                {exercise.instructions && <p className="text-xs text-muted-foreground">{exercise.instructions}</p>}
              </li>
            ))}
          </ul>
        </SummarySection>
      )}

      {(detail.followup_date || text(detail.followup_notes)) && (
        <SummarySection title="Follow-up">
          {detail.followup_date && <p>{detail.followup_date}</p>}
          {text(detail.followup_notes) && (
            <p className="whitespace-pre-wrap text-muted-foreground">{text(detail.followup_notes)}</p>
          )}
        </SummarySection>
      )}
    </>
  );
}
