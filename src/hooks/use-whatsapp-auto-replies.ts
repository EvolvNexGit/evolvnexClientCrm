"use client";

import { useCallback, useEffect, useState } from "react";
import { formatSupabaseError } from "@/lib/supabase";
import {
  createAutoReply,
  deleteAutoReply,
  ensureDefaultAutoReplies,
  updateAutoReply,
} from "@/lib/communication-queries";
import type {
  CommunicationAutoReply,
  CommunicationAutoReplyPayload,
} from "@/lib/communication-types";

export function useWhatsAppAutoReplies(clientId: string) {
  const [replies, setReplies] = useState<CommunicationAutoReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const nextReplies = await ensureDefaultAutoReplies(clientId);
      setReplies(nextReplies);
    } catch (fetchError) {
      setError(formatSupabaseError(fetchError, "Unable to load WhatsApp auto-replies."));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addReply = useCallback(
    async (payload: CommunicationAutoReplyPayload) => {
      setSaving(true);
      try {
        setError(null);
        await createAutoReply(clientId, payload);
        await refresh();
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to create auto-reply."));
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const editReply = useCallback(
    async (replyId: string, payload: CommunicationAutoReplyPayload) => {
      setSaving(true);
      try {
        setError(null);
        await updateAutoReply(clientId, replyId, payload);
        await refresh();
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to update auto-reply."));
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const removeReply = useCallback(
    async (replyId: string) => {
      setSaving(true);
      try {
        setError(null);
        await deleteAutoReply(clientId, replyId);
        await refresh();
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to delete auto-reply."));
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  return {
    replies,
    loading,
    saving,
    error,
    refresh,
    addReply,
    editReply,
    removeReply,
  };
}
