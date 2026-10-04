-- Tenant-scoped prefilled message templates (provider-neutral)
-- Run in Supabase SQL editor or via db push. RLS enabled; never disable for convenience.

create table if not exists public.communication_message_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  body text not null,
  category text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communication_message_templates_client_updated_idx
  on public.communication_message_templates (client_id, updated_at desc);

alter table public.communication_message_templates enable row level security;

-- Reuse public.crm_can_access_client from prior communication migrations.

drop policy if exists communication_message_templates_select on public.communication_message_templates;
create policy communication_message_templates_select
on public.communication_message_templates for select to authenticated
using (public.crm_can_access_client(client_id));

drop policy if exists communication_message_templates_write on public.communication_message_templates;
create policy communication_message_templates_write
on public.communication_message_templates for all to authenticated
using (public.crm_can_access_client(client_id))
with check (public.crm_can_access_client(client_id));

grant select, insert, update, delete on public.communication_message_templates to authenticated;
