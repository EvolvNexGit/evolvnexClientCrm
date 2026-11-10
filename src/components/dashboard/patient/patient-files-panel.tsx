"use client";

import { useEffect, useState } from "react";
import { DataState } from "@/components/dashboard/billing/data-state";
import { fetchPatientAttachments } from "@/lib/consultation-queries";
import type { ConsultationAttachmentRecord } from "@/lib/consultation-types";
import { formatUtcToIst } from "@/lib/time-utils";

type PatientFilesPanelProps = {
  clientId: string;
  patientId: string;
};

/** Only http(s) URLs become links; any other scheme (javascript:, data:) is shown as text. */
const SAFE_URL_PATTERN = /^https?:\/\//i;

export function PatientFilesPanel({ clientId, patientId }: PatientFilesPanelProps) {
  const [files, setFiles] = useState<ConsultationAttachmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cancelled flag: a slow response for a previous patient must never render here.
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPatientAttachments(clientId, patientId)
      .then((rows) => {
        if (!cancelled) {
          setFiles(rows);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setFiles([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load files.");
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
        empty={!loading && !error && files.length === 0}
        emptyLabel="No files attached to this patient's consultations yet."
      />
      {!loading &&
        !error &&
        files.map((file) => (
          <div
            key={file.id}
            className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-background p-4"
          >
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-text">{file.file_name || "Unnamed file"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatUtcToIst(file.uploaded_at)}</p>
              {!SAFE_URL_PATTERN.test(file.file_url) && file.file_url && (
                <p className="mt-1 break-all text-xs text-muted-foreground">{file.file_url}</p>
              )}
            </div>
            {SAFE_URL_PATTERN.test(file.file_url) && (
              <a
                href={file.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-border px-3 text-sm text-primary hover:bg-muted"
              >
                Open
              </a>
            )}
          </div>
        ))}
    </div>
  );
}
