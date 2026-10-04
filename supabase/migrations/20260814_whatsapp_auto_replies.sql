-- Phase 1: static WhatsApp auto-reply map (keyword → response)
-- Run in Supabase SQL editor. RLS enabled; never disable for convenience.

create table if not exists public.communication_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null default 'whatsapp',
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connected', 'error')),
  phone_number_id text,
  display_phone text,
  waba_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, provider)
);

create index if not exists communication_provider_accounts_phone_number_id_idx
  on public.communication_provider_accounts (phone_number_id)
  where phone_number_id is not null;

create table if not exists public.communication_auto_replies (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  trigger_text text not null,
  response_text text not null,
  match_mode text not null default 'exact'
    check (match_mode in ('exact', 'contains')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communication_auto_replies_client_id_idx
  on public.communication_auto_replies (client_id, is_active, sort_order);

create table if not exists public.communication_message_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null default 'whatsapp',
  direction text not null check (direction in ('inbound', 'outbound')),
  from_phone text,
  to_phone text,
  body text,
  provider_message_id text,
  status text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists communication_message_events_client_created_idx
  on public.communication_message_events (client_id, created_at desc);

create table if not exists public.communication_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'whatsapp',
  external_event_id text not null,
  payload jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, external_event_id)
);

-- RLS
alter table public.communication_provider_accounts enable row level security;
alter table public.communication_auto_replies enable row level security;
alter table public.communication_message_events enable row level security;
alter table public.communication_webhook_events enable row level security;

-- Reuse crm_can_access_client if present; otherwise create a minimal helper.
create or replace function public.crm_can_access_client(target_client_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = target_client_id
      and c.crm_user_id = auth.uid()
  );
$$;

grant execute on function public.crm_can_access_client(uuid) to authenticated;

drop policy if exists communication_provider_accounts_select on public.communication_provider_accounts;
create policy communication_provider_accounts_select
on public.communication_provider_accounts for select to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists communication_provider_accounts_write on public.communication_provider_accounts;
create policy communication_provider_accounts_write
on public.communication_provider_accounts for all to authenticated
using (public.crm_can_access_client(client_id))
with check (public.crm_can_access_client(client_id));

drop policy if exists communication_auto_replies_select on public.communication_auto_replies;
create policy communication_auto_replies_select
on public.communication_auto_replies for select to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists communication_auto_replies_write on public.communication_auto_replies;
create policy communication_auto_replies_write
on public.communication_auto_replies for all to authenticated
using (public.crm_can_access_client(client_id))
with check (public.crm_can_access_client(client_id));

drop policy if exists communication_message_events_select on public.communication_message_events;
create policy communication_message_events_select
on public.communication_message_events for select to authenticated
using (public.crm_can_access_client(client_id));

-- Webhook events: no authenticated client access (server/service role only)
drop policy if exists communication_webhook_events_deny_all on public.communication_webhook_events;
create policy communication_webhook_events_deny_all
on public.communication_webhook_events for all to authenticated
using (false)
with check (false);

grant select, insert, update, delete on public.communication_provider_accounts to authenticated;
grant select, insert, update, delete on public.communication_auto_replies to authenticated;
grant select on public.communication_message_events to authenticated;

-- Default starter map (applied per client by app on first open if empty):
-- trigger "hi" → greeting + offered services text (seeded from UI/API, not here)
