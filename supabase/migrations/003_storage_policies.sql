-- Owner-Op Road Ready — Supabase Storage bucket and policies for Digital Wallet

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-documents',
  'driver-documents',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "driver_documents_select_own"
on storage.objects
for select
using (
  bucket_id = 'driver-documents'
  and exists (
    select 1
    from public.drivers d
    where d.user_id = auth.uid()
      and (storage.foldername(name))[1] = d.id::text
  )
);

create policy "driver_documents_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'driver-documents'
  and exists (
    select 1
    from public.drivers d
    where d.user_id = auth.uid()
      and (storage.foldername(name))[1] = d.id::text
  )
);

create policy "driver_documents_update_own"
on storage.objects
for update
using (
  bucket_id = 'driver-documents'
  and exists (
    select 1
    from public.drivers d
    where d.user_id = auth.uid()
      and (storage.foldername(name))[1] = d.id::text
  )
)
with check (
  bucket_id = 'driver-documents'
  and exists (
    select 1
    from public.drivers d
    where d.user_id = auth.uid()
      and (storage.foldername(name))[1] = d.id::text
  )
);
