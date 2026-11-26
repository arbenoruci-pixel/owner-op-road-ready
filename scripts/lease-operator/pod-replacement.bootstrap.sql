-- Minimal local Supabase-compatible Auth/Storage catalog for an EMPTY
-- PostgreSQL 17 CI service. Only synthetic identities are used; no hosted
-- project or real data is connected. Do not apply this to Supabase.
do $$ begin
 if current_database()<>'rr_step2a_audit' then raise exception 'Wrong disposable database'; end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(
 id uuid primary key, aud text, role text, email text unique,
 email_confirmed_at timestamptz, is_anonymous boolean not null default false,
 raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz
);
create function auth.uid() returns uuid
language sql stable set search_path='' as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
   nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
grant usage on schema public to anon,authenticated,service_role;
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,user_metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,service_role;
grant select on storage.objects to authenticated;
grant all on storage.objects,storage.buckets to service_role;
