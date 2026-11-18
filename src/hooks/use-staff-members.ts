"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createStaffMember,
  fetchStaffMembers,
  setStaffMemberActive,
  updateStaffMember,
} from "@/lib/staff-member-queries";
import type { StaffMemberPayload, StaffMemberRecord } from "@/lib/staff-member-types";
import { formatSupabaseError } from "@/lib/supabase";

type UseStaffMembersOptions = {
  /** Only active bookable staff (appointment pickers and calendar columns). */
  bookableOnly?: boolean;
  /** Include deactivated staff (Staff tab). */
  includeInactive?: boolean;
  /** Skip loading entirely (for example while the form that needs staff is closed). */
  enabled?: boolean;
};

export function useStaffMembers(clientId: string, options: UseStaffMembersOptions = {}) {
  const { bookableOnly = false, includeInactive = false, enabled = true } = options;
  const [staffMembers, setStaffMembers] = useState<StaffMemberRecord[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ignore stale responses when the tenant or filters change mid-flight.
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !clientId) {
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      setError(null);
      const next = await fetchStaffMembers(clientId, { bookableOnly, includeInactive });
      if (requestId === requestIdRef.current) {
        setStaffMembers(next);
      }
    } catch (fetchError) {
      if (requestId === requestIdRef.current) {
        setError(formatSupabaseError(fetchError, "Unable to load staff members."));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [bookableOnly, clientId, enabled, includeInactive]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runMutation = useCallback(
    async <T,>(action: () => Promise<T>, fallback: string): Promise<T> => {
      setSaving(true);
      try {
        setError(null);
        const result = await action();
        await refresh();
        return result;
      } catch (failure) {
        setError(formatSupabaseError(failure, fallback));
        throw failure;
      } finally {
        setSaving(false);
      }
    },
    [refresh],
  );

  const create = useCallback(
    (payload: StaffMemberPayload) =>
      runMutation(() => createStaffMember(clientId, payload), "Unable to add staff member."),
    [clientId, runMutation],
  );

  const update = useCallback(
    (staffMemberId: string, payload: StaffMemberPayload) =>
      runMutation(() => updateStaffMember(clientId, staffMemberId, payload), "Unable to update staff member."),
    [clientId, runMutation],
  );

  const setActive = useCallback(
    (staffMemberId: string, isActive: boolean) =>
      runMutation(() => setStaffMemberActive(clientId, staffMemberId, isActive), "Unable to update staff member."),
    [clientId, runMutation],
  );

  return { staffMembers, loading, saving, error, refresh, create, update, setActive };
}
