-- Customer outreach status (Option A) + per-tenant encrypted WhatsApp credentials.
-- Drops unused webhook-events table (idempotency moves onto message_events).

alter table public.customers
  add column if not exists outreach_status text;

create index if not exists customers_client_outreach_status_idx
  on public.customers (client_id, outreach_status)
  where outreach_status is not null;

-- Encrypted WhatsApp secrets. Dashboard uses the signed-in user session (same as other CRM tables).
create table if not exists public.communication_whatsapp_credentials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  encrypted_payload text not null,
  verify_token_hash text not null,
  key_version integer not null default 1,
  has_access_token boolean not null default false,
  has_app_secret boolean not null default false,
  has_verify_token boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id),
  unique (verify_token_hash)
);

alter table public.communication_whatsapp_credentials enable row level security;

drop policy if exists communication_whatsapp_credentials_deny_authenticated
  on public.communication_whatsapp_credentials;
drop policy if exists communication_whatsapp_credentials_select
  on public.communication_whatsapp_credentials;
create policy communication_whatsapp_credentials_select
on public.communication_whatsapp_credentials
for select
to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists communication_whatsapp_credentials_write
  on public.communication_whatsapp_credentials;
create policy communication_whatsapp_credentials_write
on public.communication_whatsapp_credentials
for all
to authenticated
using (public.crm_can_access_client(client_id))
with check (public.crm_can_access_client(client_id));

grant select, insert, update, delete on public.communication_whatsapp_credentials to authenticated;

-- Idempotency on stored message ids; drop separate webhook table.
create unique index if not exists communication_message_events_provider_msg_idx
  on public.communication_message_events (provider, provider_message_id)
  where provider_message_id is not null;

drop table if exists public.communication_webhook_events;

-- Phone number ids must map to one tenant.
drop index if exists public.communication_provider_accounts_phone_number_id_idx;
create unique index if not exists communication_provider_accounts_phone_number_id_uidx
  on public.communication_provider_accounts (phone_number_id)
  where phone_number_id is not null;

drop policy if exists communication_provider_accounts_write
  on public.communication_provider_accounts;
create policy communication_provider_accounts_write
on public.communication_provider_accounts
for all
to authenticated
using (public.crm_can_access_client(client_id))
with check (public.crm_can_access_client(client_id));

grant select, insert, update, delete on public.communication_provider_accounts to authenticated;
