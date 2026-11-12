"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAppointmentFilterOptions } from "@/lib/appointment-queries";
import {
  deleteDoctorPrintProfile,
  fetchDoctorPrintProfiles,
  saveDoctorPrintProfile,
} from "@/lib/doctor-print-profile-queries";
import type { DoctorPrintProfilePayload, DoctorPrintProfileRecord } from "@/lib/doctor-print-profile-types";
import { formatSupabaseError } from "@/lib/supabase";

export function useDoctorPrintProfiles(clientId: string) {
  const [profiles, setProfiles] = useState<DoctorPrintProfileRecord[]>([]);
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [nextProfiles, options] = await Promise.all([
        fetchDoctorPrintProfiles(clientId),
        fetchAppointmentFilterOptions(clientId),
      ]);
      setProfiles(nextProfiles);
      setStaffNames(options.staff);
    } catch (fetchError) {
      setError(formatSupabaseError(fetchError, "Unable to load doctor profiles."));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (payload: DoctorPrintProfilePayload) => {
      setSaving(true);
      try {
        setSaveError(null);
        await saveDoctorPrintProfile(clientId, payload);
        setProfiles(await fetchDoctorPrintProfiles(clientId));
      } catch (failure) {
        setSaveError(formatSupabaseError(failure, "Unable to save doctor profile."));
        throw failure;
      } finally {
        setSaving(false);
      }
    },
    [clientId],
  );

  const remove = useCallback(
    async (profileId: string) => {
      setSaving(true);
      try {
        setSaveError(null);
        await deleteDoctorPrintProfile(clientId, profileId);
        setProfiles(await fetchDoctorPrintProfiles(clientId));
      } catch (failure) {
        setSaveError(formatSupabaseError(failure, "Unable to remove doctor profile."));
        throw failure;
      } finally {
        setSaving(false);
      }
    },
    [clientId],
  );

  // Staff names from appointments plus any profile name (a profile may outlive its appointments), deduped case-insensitively.
  const doctorNames = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const name of [...staffNames, ...profiles.map((profile) => profile.doctor_name)]) {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (trimmed !== "" && !byKey.has(key)) {
        byKey.set(key, trimmed);
      }
    }

    return Array.from(byKey.values()).sort((left, right) => left.localeCompare(right));
  }, [staffNames, profiles]);

  return { profiles, doctorNames, loading, error, saving, saveError, refresh, save, remove };
}
