"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createCustomer,
  deleteCustomer,
  fetchCustomers,
  updateCustomer,
} from "@/lib/billing-queries";
import type { CustomerPayload, CustomerRecord } from "@/lib/billing-types";

export function useCustomers(clientId: string) {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const next = await fetchCustomers(clientId);
      setCustomers(next);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addCustomer = useCallback(
    async (payload: CustomerPayload) => {
      setSaving(true);
      try {
        const createdCustomer = await createCustomer(clientId, payload);
        await refresh();
        return createdCustomer;
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const editCustomer = useCallback(
    async (customerId: string, payload: Partial<CustomerPayload>) => {
      setSaving(true);
      try {
        await updateCustomer(clientId, customerId, payload);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const removeCustomer = useCallback(
    async (customerId: string) => {
      setSaving(true);
      try {
        await deleteCustomer(clientId, customerId);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  return {
    customers,
    loading,
    saving,
    error,
    refresh,
    addCustomer,
    editCustomer,
    removeCustomer,
  };
}
