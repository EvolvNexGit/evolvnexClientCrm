-- Soft delete for appointments: rows are hidden from the app, never removed.
alter table public.appointments
  add column if not exists deleted_at timestamptz;

create index if not exists appointments_client_active_idx
  on public.appointments (client_id, date)
  where deleted_at is null;
