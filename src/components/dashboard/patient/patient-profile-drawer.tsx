"use client";

import { useEffect } from "react";
import { PatientOverviewPanel } from "@/components/dashboard/patient/patient-overview-panel";
import type { CustomerRecord } from "@/lib/billing-types";
import { formatPatientAge, getPatientCode, getPatientInitials } from "@/lib/consultation-types";

type PatientProfileDrawerProps = {
  open: boolean;
  clientId: string;
  patient: CustomerRecord | null;
  onClose: () => void;
};

export function PatientProfileDrawer({ open, patient, onClose }: PatientProfileDrawerProps) {
  const isOpen = open && patient !== null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!open || !patient) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={onClose} role="presentation">
      <div
        className="flex h-full w-full min-w-0 flex-col border-l border-border bg-card shadow-soft sm:max-w-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-profile-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
              aria-hidden="true"
            >
              {getPatientInitials(patient.name)}
            </div>
            <div className="min-w-0">
              <h3 id="patient-profile-title" className="truncate text-lg font-semibold leading-snug text-text">
                {patient.name}
              </h3>
              <p className="truncate text-sm text-muted-foreground">
                {getPatientCode(patient.id)} · {formatPatientAge(patient.dob)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-text"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          <div key={patient.id}>
            <PatientOverviewPanel patient={patient} />
          </div>
        </div>
      </div>
    </div>
  );
}
