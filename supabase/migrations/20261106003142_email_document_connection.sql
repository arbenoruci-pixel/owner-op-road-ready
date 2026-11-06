-- New email-only records. Existing loads, documents, signed logs and wallet
-- originals are not migrated or edited.
create table public.road_ready_email_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  connection_id uuid not null,
  revision integer not null default 0 check (revision >= 0),
  pending_hash text check (pending_hash is null or pending_hash ~ '^[a-f0-9]{64}$'),
  sealed_cache text check (sealed_cache is null or octet_length(sealed_cache) <= 1000000),
  created_at timestamptz not null default now()
);
create table public.road_ready_email_imports (
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null check (length(account_id) between 1 and 2048),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  message_id text not null check (length(message_id) between 1 and 2048),
  attachment_id text not null check (length(attachment_id) between 1 and 2048),
  document_id text not null check (length(document_id) between 1 and 200),
  imported_at timestamptz not null default now(),
  primary key (owner_id, account_id, sha256)
);
alter table public.road_ready_email_connections enable row level security;
alter table public.road_ready_email_imports enable row level security;
revoke all on public.road_ready_email_connections, public.road_ready_email_imports from public, anon, authenticated;
grant select, insert, update, delete on public.road_ready_email_connections to authenticated;
grant select, insert on public.road_ready_email_imports to authenticated;
create policy owner_email_connection on public.road_ready_email_connections for all to authenticated
  using (owner_id = (select auth.uid()) and (select (public.owner_op_access_v1()->>'approved')::boolean))
  with check (owner_id = (select auth.uid()) and (select (public.owner_op_access_v1()->>'approved')::boolean));
create policy owner_email_import_read on public.road_ready_email_imports for select to authenticated
  using (owner_id = (select auth.uid()) and (select (public.owner_op_access_v1()->>'approved')::boolean));
create policy owner_email_import_write on public.road_ready_email_imports for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select (public.owner_op_access_v1()->>'approved')::boolean));
comment on column public.road_ready_email_connections.sealed_cache is 'AES-256-GCM encrypted MSAL cache, bound to Road Ready owner and connection generation. Decryption key exists only in server environment.';
