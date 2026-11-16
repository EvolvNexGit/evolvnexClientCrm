-- Drop the retired WhatsApp / communication feature tables.
--
-- APPLY ONLY AFTER the code removal from branch chore/remove-whatsapp-communication is
-- deployed. The previous app build still reads and writes these tables.
--
-- This file is NOT applied to any Supabase project by the change that adds it. Run it by
-- hand (SQL editor or MCP) after deploy, as earlier migrations in this repo were applied.
--
-- DESTRUCTIVE AND IRREVERSIBLE: stored auto replies, message templates, message events and
-- encrypted provider credentials are lost.
--
-- communication_webhook_events was already dropped in
-- 20260817_customer_status_whatsapp_credentials.sql.
--
-- Policies and indexes are removed together with their tables. The shared function
-- crm_can_access_client() is intentionally kept (other tables use it).
--
-- tabs_info rows 019 and 020 and client_tab_access rows are left in place; the app ignores them.
--
-- Single statement (atomic). Deliberately no dependent-object removal: an unexpected
-- dependent object makes the drop fail loudly instead of being removed silently.

drop table if exists
  public.communication_auto_replies,
  public.communication_message_events,
  public.communication_message_templates,
  public.communication_provider_accounts,
  public.communication_whatsapp_credentials;
