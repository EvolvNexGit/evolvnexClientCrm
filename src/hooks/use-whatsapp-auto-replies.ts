"use client";

import { useCallback, useEffect, useState } from "react";
import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";
import {
  createAutoReply,
  deleteAutoReply,
  ensureDefaultAutoReplies,
  fetchRecentMessageEvents,
  fetchWhatsAppConnection,
  updateAutoReply,
} from "@/lib/communication-queries";
import type {
  CommunicationAutoReply,
  CommunicationAutoReplyPayload,
  CommunicationMessageEvent,
  WhatsAppConnectionPublic,
  WhatsAppCredentialsPayload,
} from "@/lib/communication-types";

async function getAccessToken(): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("You need to sign in again to save WhatsApp credentials.");
  }
  return data.session.access_token;
}

async function saveWhatsAppConnection(
  payload: WhatsAppCredentialsPayload,
): Promise<WhatsAppConnectionPublic> {
  const token = await getAccessToken();
  const response = await fetch("/api/communication/whatsapp/credentials", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => null)) as
    | { connection?: WhatsAppConnectionPublic; error?: string }
    | null;

  if (!response.ok || !body?.connection) {
    throw new Error(body?.error || "Unable to update WhatsApp connection.");
  }

  return body.connection;
}

export function useWhatsAppAutoReplies(clientId: string) {
  const [replies, setReplies] = useState<CommunicationAutoReply[]>([]);
  const [events, setEvents] = useState<CommunicationMessageEvent[]>([]);
  const [connection, setConnection] = useState<WhatsAppConnectionPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [nextReplies, nextEvents, nextConnection] = await Promise.all([
        ensureDefaultAutoReplies(clientId),
        fetchRecentMessageEvents(clientId),
        fetchWhatsAppConnection(clientId),
      ]);
      setReplies(nextReplies);
      setEvents(nextEvents);
      setConnection(nextConnection);
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

  const saveConnection = useCallback(async (payload: WhatsAppCredentialsPayload) => {
    setSaving(true);
    try {
      setError(null);
      const nextConnection = await saveWhatsAppConnection(payload);
      setConnection(nextConnection);
    } catch (saveError) {
      setError(formatSupabaseError(saveError, "Unable to save WhatsApp connection."));
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    replies,
    events,
    connection,
    loading,
    saving,
    error,
    refresh,
    addReply,
    editReply,
    removeReply,
    saveConnection,
  };
}
