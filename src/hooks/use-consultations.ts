"use client";

import { useCallback, useEffect, useState } from "react";
import { formatSupabaseError } from "@/lib/supabase";
import {
  addConsultationAttachment,
  buildConsultationQueueStats,
  createConsultation,
  deleteConsultationAttachment,
  fetchConsultationById,
  fetchConsultationQueue,
  fetchPatientConsultationHistory,
  setConsultationStatus,
  startConsultationFromAppointment,
  updateConsultation,
} from "@/lib/consultation-queries";
import type {
  ConsultationAttachmentInput,
  ConsultationDetail,
  ConsultationHistoryItem,
  ConsultationPayload,
  ConsultationQueueRow,
  ConsultationQueueStats,
  ConsultStatus,
} from "@/lib/consultation-types";

const EMPTY_STATS: ConsultationQueueStats = {
  todaysConsults: 0,
  waiting: 0,
  inProgress: 0,
  completedToday: 0,
  walkIns: 0,
};

export function useConsultations(clientId: string) {
  const [queueRows, setQueueRows] = useState<ConsultationQueueRow[]>([]);
  const [stats, setStats] = useState<ConsultationQueueStats>(EMPTY_STATS);
  const [activeConsultation, setActiveConsultation] = useState<ConsultationDetail | null>(null);
  const [patientHistory, setPatientHistory] = useState<ConsultationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const nextRows = await fetchConsultationQueue(clientId);
      setQueueRows(nextRows);
      setStats(buildConsultationQueueStats(nextRows));
    } catch (fetchError) {
      setError(formatSupabaseError(fetchError, "Unable to load consultations."));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  const loadConsultation = useCallback(
    async (consultationId: string) => {
      setDetailLoading(true);
      try {
        setError(null);
        const detail = await fetchConsultationById(clientId, consultationId);
        setActiveConsultation(detail);

        if (detail?.patient_id) {
          const history = await fetchPatientConsultationHistory(
            clientId,
            detail.patient_id,
            consultationId,
          );
          setPatientHistory(history);
        } else {
          setPatientHistory([]);
        }

        return detail;
      } catch (fetchError) {
        setError(formatSupabaseError(fetchError, "Unable to load consultation details."));
        return null;
      } finally {
        setDetailLoading(false);
      }
    },
    [clientId],
  );

  const startConsultation = useCallback(
    async (row: ConsultationQueueRow) => {
      setSaving(true);
      try {
        setError(null);

        if (row.source === "appointment") {
          if (!row.appointmentId) {
            throw new Error("Appointment id is missing for this queue row.");
          }
          const consultationId = await startConsultationFromAppointment(clientId, row.appointmentId);
          await refreshQueue();
          return loadConsultation(consultationId);
        }

        if (row.status !== "In Progress" && row.status !== "Completed") {
          await setConsultationStatus(clientId, row.id, "IN_PROGRESS");
          await refreshQueue();
        }

        return loadConsultation(row.id);
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to start consultation."));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [clientId, loadConsultation, refreshQueue],
  );

  const saveConsultation = useCallback(
    async (consultationId: string, payload: Partial<ConsultationPayload>, status?: ConsultStatus) => {
      setSaving(true);
      try {
        setError(null);
        await updateConsultation(clientId, consultationId, {
          ...payload,
          ...(status ? { status } : {}),
        });
        await Promise.all([refreshQueue(), loadConsultation(consultationId)]);
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to save consultation."));
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [clientId, loadConsultation, refreshQueue],
  );

  const completeConsultation = useCallback(
    async (consultationId: string, payload: Partial<ConsultationPayload>) => {
      await saveConsultation(consultationId, payload, "COMPLETED");
    },
    [saveConsultation],
  );

  const cancelConsultation = useCallback(
    async (consultationId: string) => {
      setSaving(true);
      try {
        setError(null);
        await setConsultationStatus(clientId, consultationId, "CANCELLED");
        setActiveConsultation(null);
        setPatientHistory([]);
        await refreshQueue();
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to cancel consultation."));
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [clientId, refreshQueue],
  );

  const addConsultation = useCallback(
    async (payload: ConsultationPayload) => {
      setSaving(true);
      try {
        setError(null);
        const consultationId = await createConsultation(clientId, {
          ...payload,
          status: payload.status ?? "IN_PROGRESS",
        });
        await refreshQueue();
        return loadConsultation(consultationId);
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to create consultation."));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [clientId, loadConsultation, refreshQueue],
  );

  const attachFile = useCallback(
    async (consultationId: string, payload: ConsultationAttachmentInput) => {
      setSaving(true);
      try {
        setError(null);
        await addConsultationAttachment(clientId, consultationId, payload);
        await loadConsultation(consultationId);
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to add attachment."));
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [clientId, loadConsultation],
  );

  const removeAttachment = useCallback(
    async (consultationId: string, attachmentId: string) => {
      setSaving(true);
      try {
        setError(null);
        await deleteConsultationAttachment(clientId, attachmentId);
        await loadConsultation(consultationId);
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to remove attachment."));
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [clientId, loadConsultation],
  );

  const clearActiveConsultation = useCallback(() => {
    setActiveConsultation(null);
    setPatientHistory([]);
  }, []);

  return {
    queueRows,
    stats,
    activeConsultation,
    patientHistory,
    loading,
    detailLoading,
    saving,
    error,
    refreshQueue,
    loadConsultation,
    startConsultation,
    saveConsultation,
    completeConsultation,
    cancelConsultation,
    addConsultation,
    attachFile,
    removeAttachment,
    clearActiveConsultation,
  };
}
