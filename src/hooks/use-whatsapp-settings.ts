"use client";

import { useCallback, useEffect, useState } from "react";
import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";
import { fetchWhatsAppConnection } from "@/lib/communication-queries";
import type { WhatsAppConnectionPublic, WhatsAppCredentialsPayload } from "@/lib/communication-types";

async function getAccessToken(): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("You need to sign in again to manage WhatsApp credentials.");
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

async function disconnectWhatsAppConnection(): Promise<WhatsAppConnectionPublic> {
  const token = await getAccessToken();
  const response = await fetch("/api/communication/whatsapp/credentials", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const body = (await response.json().catch(() => null)) as
    | { connection?: WhatsAppConnectionPublic; error?: string }
    | null;

  if (!response.ok || !body?.connection) {
    throw new Error(body?.error || "Unable to disconnect WhatsApp.");
  }

  return body.connection;
}

export function useWhatsAppSettings(clientId: string) {
  const [connection, setConnection] = useState<WhatsAppConnectionPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const nextConnection = await fetchWhatsAppConnection(clientId);
      setConnection(nextConnection);
    } catch (fetchError) {
      setError(formatSupabaseError(fetchError, "Unable to load WhatsApp settings."));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveCredentials = useCallback(async (payload: WhatsAppCredentialsPayload) => {
    setSaving(true);
    try {
      setError(null);
      const nextConnection = await saveWhatsAppConnection(payload);
      setConnection(nextConnection);
      return nextConnection;
    } catch (saveError) {
      setError(formatSupabaseError(saveError, "Unable to save WhatsApp credentials."));
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setSaving(true);
    try {
      setError(null);
      const nextConnection = await disconnectWhatsAppConnection();
      setConnection(nextConnection);
      return nextConnection;
    } catch (disconnectError) {
      setError(formatSupabaseError(disconnectError, "Unable to disconnect WhatsApp."));
      throw disconnectError;
    } finally {
      setSaving(false);
    }
  }, []);

  const isConnected =
    connection?.status === "connected" &&
    connection.hasAccessToken &&
    connection.hasAppSecret &&
    connection.hasVerifyToken;

  return {
    connection,
    loading,
    saving,
    error,
    isConnected,
    refresh,
    saveCredentials,
    disconnect,
  };
}
