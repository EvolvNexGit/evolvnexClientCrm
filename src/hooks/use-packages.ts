"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  attachPackageSession,
  detachPackageSession,
  fetchCustomerPackages,
  fetchPackageDetail,
  sellPackage,
  type PackageWithSessions,
} from "@/lib/package-queries";
import type { PackageStatus, SellPackagePayload } from "@/lib/package-types";
import { formatSupabaseError } from "@/lib/supabase";

/** Same-tab signal so every package view (tab, drawer, appointment form) refreshes after any ledger change. */
export const PACKAGES_CHANGED_EVENT = "packages-changed";

export function notifyPackagesChanged(clientId: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<{ clientId: string }>(PACKAGES_CHANGED_EVENT, { detail: { clientId } }));
  }
}

function usePackagesChangedListener(clientId: string, enabled: boolean, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleChanged(event: Event) {
      const detail = (event as CustomEvent<{ clientId: string }>).detail;
      if (detail?.clientId === clientId) {
        onChangeRef.current();
      }
    }

    window.addEventListener(PACKAGES_CHANGED_EVENT, handleChanged);
    return () => window.removeEventListener(PACKAGES_CHANGED_EVENT, handleChanged);
  }, [clientId, enabled]);
}

type UsePackagesOptions = {
  statuses?: PackageStatus[];
  /** Only one customer's packages (appointment form). */
  customerId?: string | null;
  enabled?: boolean;
};

/** Tenant packages with their sessions; mutators refresh the list and broadcast a change event. */
export function usePackages(clientId: string, options: UsePackagesOptions = {}) {
  const { statuses, customerId, enabled = true } = options;
  const statusKey = statuses?.join(",") ?? "";
  const [packages, setPackages] = useState<PackageWithSessions[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ignore stale responses when the tenant or filters change mid-flight.
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !clientId || customerId === "") {
      setPackages([]);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      setError(null);
      const next = await fetchCustomerPackages(clientId, {
        statuses: statusKey ? (statusKey.split(",") as PackageStatus[]) : undefined,
        customerId: customerId ?? undefined,
      });
      if (requestId === requestIdRef.current) {
        setPackages(next);
      }
    } catch (fetchError) {
      if (requestId === requestIdRef.current) {
        setError(formatSupabaseError(fetchError, "Unable to load packages."));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [clientId, customerId, enabled, statusKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePackagesChangedListener(clientId, enabled, () => void refresh());

  const sell = useCallback(
    async (payload: SellPackagePayload) => {
      setSaving(true);
      try {
        setError(null);
        const packageId = await sellPackage(clientId, payload);
        notifyPackagesChanged(clientId);
        return packageId;
      } finally {
        setSaving(false);
      }
    },
    [clientId],
  );

  return { packages, loading, saving, error, refresh, sell };
}

/** One package and its sessions for the detail drawer. */
export function usePackageDetail(clientId: string, packageId: string | null) {
  const [pkg, setPkg] = useState<PackageWithSessions | null>(null);
  const [loading, setLoading] = useState(Boolean(packageId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!clientId || !packageId) {
      setPkg(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      setError(null);
      const next = await fetchPackageDetail(clientId, packageId);
      if (requestId === requestIdRef.current) {
        setPkg(next);
        if (!next) {
          setError("Package not found.");
        }
      }
    } catch (fetchError) {
      if (requestId === requestIdRef.current) {
        setError(formatSupabaseError(fetchError, "Unable to load the package."));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [clientId, packageId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePackagesChangedListener(clientId, Boolean(packageId), () => void refresh());

  /** Runs one ledger mutation; failures surface as a thrown, already user-facing message. */
  const runMutation = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      setSaving(true);
      try {
        const result = await action();
        notifyPackagesChanged(clientId);
        return result;
      } finally {
        setSaving(false);
      }
    },
    [clientId],
  );

  const attach = useCallback(
    (appointmentId: string) => {
      if (!packageId) {
        return Promise.reject(new Error("Package not found."));
      }
      return runMutation(() => attachPackageSession(clientId, packageId, appointmentId));
    },
    [clientId, packageId, runMutation],
  );

  const detach = useCallback(
    (sessionId: string, note?: string | null) => runMutation(() => detachPackageSession(clientId, sessionId, note)),
    [clientId, runMutation],
  );

  return { pkg, loading, saving, error, refresh, attach, detach, runMutation };
}
