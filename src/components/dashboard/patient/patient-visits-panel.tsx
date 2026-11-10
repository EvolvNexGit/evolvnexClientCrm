"use client";

import { useEffect, useState } from "react";
import { Stethoscope } from "lucide-react";
import { DataState } from "@/components/dashboard/billing/data-state";
import { fetchPatientConsultationHistory } from "@/lib/consultation-queries";
import type { ConsultationHistoryItem } from "@/lib/consultation-types";

type PatientVisitsPanelProps = {
  clientId: string;
  patientId: string;
};

export function PatientVisitsPanel({ clientId, patientId }: PatientVisitsPanelProps) {
  const [visits, setVisits] = useState<ConsultationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cancelled flag: a slow response for a previous patient must never render here.
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPatientConsultationHistory(clientId, patientId)
      .then((rows) => {
        if (!cancelled) {
          setVisits(rows);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setVisits([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load visits.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, patientId]);

  return (
    <div className="space-y-3">
      <DataState
        loading={loading}
        error={error}
        empty={!loading && !error && visits.length === 0}
        emptyLabel="No consultation history for this patient yet."
      />
      {!loading &&
        !error &&
        visits.map((item) => (
          <div key={item.id} className="rounded-2xl border border-border bg-background p-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${item.ringTone} text-white`}>
                <Stethoscope className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{item.date}</p>
                    <h4 className="mt-1 text-sm font-semibold text-text">{item.title}</h4>
                    <p className={`mt-1 text-xs font-medium ${item.statusTone}`}>{item.status}</p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">{item.time}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
