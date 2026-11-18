"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchClientSettings, saveClientSettings } from "@/lib/client-settings-queries";
import {
  CLIENT_SETTINGS_DEFAULTS,
  type ClientSettingsMap,
  type ClientSettingsNamespace,
} from "@/lib/client-settings-types";
import { formatSupabaseError } from "@/lib/supabase";

const SETTINGS_CHANGED_EVENT = "client-settings-changed";

type SettingsChangedDetail = { clientId: string; namespace: ClientSettingsNamespace };

type UseClientSettingsOptions = {
  /** Optional re-fetch interval in milliseconds (the order alert provider uses this for cross-device refresh). */
  pollMs?: number;
  enabled?: boolean;
};

/**
 * One settings namespace for the signed-in tenant. Defaults apply until loaded and after a failed load.
 * Refreshes on window focus, on a same-tab change event after any save, and optionally on an interval.
 */
export function useClientSettings<N extends ClientSettingsNamespace>(
  clientId: string,
  namespace: N,
  options: UseClientSettingsOptions = {},
) {
  const { pollMs, enabled = true } = options;
  const [value, setValue] = useState<ClientSettingsMap[N]>(CLIENT_SETTINGS_DEFAULTS[namespace]);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ignore stale responses when the tenant changes or refreshes overlap.
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !clientId) {
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    try {
      setError(null);
      const next = await fetchClientSettings(clientId, namespace);
      if (requestId === requestIdRef.current) {
        setValue(next);
      }
    } catch (fetchError) {
      if (requestId === requestIdRef.current) {
        setError(formatSupabaseError(fetchError, "Unable to load settings."));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [clientId, enabled, namespace]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleFocus() {
      void refresh();
    }

    function handleChanged(event: Event) {
      const detail = (event as CustomEvent<SettingsChangedDetail>).detail;
      if (detail?.clientId === clientId && detail?.namespace === namespace) {
        void refresh();
      }
    }

    window.addEventListener("focus", handleFocus);
    window.addEventListener(SETTINGS_CHANGED_EVENT, handleChanged);
    const timer = pollMs && pollMs > 0 ? window.setInterval(() => void refresh(), pollMs) : null;

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, handleChanged);
      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [clientId, enabled, namespace, pollMs, refresh]);

  const save = useCallback(
    async (next: ClientSettingsMap[N]) => {
      setSaving(true);
      try {
        setError(null);
        const saved = await saveClientSettings(clientId, namespace, next);
        setValue(saved);
        window.dispatchEvent(
          new CustomEvent<SettingsChangedDetail>(SETTINGS_CHANGED_EVENT, { detail: { clientId, namespace } }),
        );
        return saved;
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to save settings."));
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [clientId, namespace],
  );

  return { value, loading, saving, error, save, refresh };
}
