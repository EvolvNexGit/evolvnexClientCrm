-- WhatsApp Contacts (Option A): extra fields on customers. No separate contacts table.

alter table public.customers
  add column if not exists contact_tags text[] not null default '{}'::text[],
  add column if not exists contact_source text,
  add column if not exists last_activity_at timestamptz,
  add column if not exists is_blocked boolean not null default false,
  add column if not exists notes text,
  add column if not exists assigned_to text;

update public.customers
set last_activity_at = created_at
where last_activity_at is null;

create index if not exists customers_client_blocked_idx
  on public.customers (client_id, is_blocked)
  where is_active = true;

create index if not exists customers_client_source_idx
  on public.customers (client_id, contact_source)
  where contact_source is not null;

create index if not exists customers_contact_tags_gin_idx
  on public.customers using gin (contact_tags);
