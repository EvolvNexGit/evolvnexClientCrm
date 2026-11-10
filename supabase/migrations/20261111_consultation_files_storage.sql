-- Private bucket for consultation files, tenant-scoped storage policies, and storage_path on attachments
-- (D-03, D-04, D-12). Additive and idempotent. RLS stays enabled; nothing is granted to anon or public.
-- Object path convention: <client_id>/<consultation_id>/<uuid>-<safe_name>
-- Applied to live through Supabase MCP execute_sql with these exact contents (never the CLI push:
-- the live migration table does not list repo files).
-- Apply to live BEFORE deploying code that selects these columns.

-- Part A: attachments. Legacy name+URL rows keep a null storage_path and stay valid (D-04).
alter table public.consultation_attachments
  add column if not exists storage_path text;

alter table public.consultation_attachments
  alter column file_url drop not null;

alter table public.consultation_attachments
  drop constraint if exists consultation_attachments_storage_path_client_chk;

alter table public.consultation_attachments
  add constraint consultation_attachments_storage_path_client_chk
  check (storage_path is null or storage_path like (client_id::text || '/%'));

-- Part B: private bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'consultation-files', 'consultation-files', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Part C: policies on storage.objects keyed on the first folder segment (the client id).
-- A non-uuid segment yields NULL, which means no access instead of an error. No update policy: the app never upserts.
drop policy if exists consultation_files_select on storage.objects;
create policy consultation_files_select
on storage.objects for select to authenticated
using (
  bucket_id = 'consultation-files'
  and public.crm_can_access_client(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid else null end
  )
);

drop policy if exists consultation_files_insert on storage.objects;
create policy consultation_files_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'consultation-files'
  and public.crm_can_access_client(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid else null end
  )
);

drop policy if exists consultation_files_delete on storage.objects;
create policy consultation_files_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'consultation-files'
  and public.crm_can_access_client(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid else null end
  )
);
