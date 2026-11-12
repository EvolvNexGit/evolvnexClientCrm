"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatSupabaseError } from "@/lib/supabase";
import { fetchPrintSettings, savePrintSettings } from "@/lib/print-settings-queries";
import {
  clampPrintMargins,
  type PrintSettingsPayload,
  type PrintSettingsRecord,
} from "@/lib/print-settings-types";

export function usePrintSettings(clientId: string) {
  const [settings, setSettings] = useState<PrintSettingsRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSettings(await fetchPrintSettings(clientId));
    } catch (fetchError) {
      setError(formatSupabaseError(fetchError, "Unable to load print settings."));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (payload: PrintSettingsPayload) => {
      setSaving(true);
      try {
        setSaveError(null);
        setSettings(await savePrintSettings(clientId, payload));
      } catch (failure) {
        setSaveError(formatSupabaseError(failure, "Unable to save print settings."));
        throw failure;
      } finally {
        setSaving(false);
      }
    },
    [clientId],
  );

  const margins = useMemo(() => clampPrintMargins(settings), [settings]);

  return {
    settings,
    margins,
    hasSavedSettings: settings !== null,
    // False while loading or after a failed load, so print never silently uses defaulted margins.
    ready: !loading && error === null,
    loading,
    saving,
    error,
    saveError,
    refresh,
    save,
  };
}
