"use client";

import { useCallback, useEffect, useState } from "react";
import { formatSupabaseError } from "@/lib/supabase";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  fetchMessageTemplates,
  updateMessageTemplate,
} from "@/lib/communication-queries";
import type { MessageTemplatePayload, MessageTemplateRecord } from "@/lib/communication-types";

export function useMessageTemplates(clientId: string) {
  const [templates, setTemplates] = useState<MessageTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const nextTemplates = await fetchMessageTemplates(clientId);
      setTemplates(nextTemplates);
    } catch (fetchError) {
      setError(formatSupabaseError(fetchError, "Unable to load message templates."));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addTemplate = useCallback(
    async (payload: MessageTemplatePayload) => {
      setSaving(true);
      try {
        setError(null);
        await createMessageTemplate(clientId, payload);
        await refresh();
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to create message template."));
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const editTemplate = useCallback(
    async (templateId: string, payload: MessageTemplatePayload) => {
      setSaving(true);
      try {
        setError(null);
        await updateMessageTemplate(clientId, templateId, payload);
        await refresh();
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to update message template."));
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  const removeTemplate = useCallback(
    async (templateId: string) => {
      setSaving(true);
      try {
        setError(null);
        await deleteMessageTemplate(clientId, templateId);
        await refresh();
      } catch (saveError) {
        setError(formatSupabaseError(saveError, "Unable to delete message template."));
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [clientId, refresh],
  );

  return {
    templates,
    loading,
    saving,
    error,
    refresh,
    addTemplate,
    editTemplate,
    removeTemplate,
  };
}
