-- Isolated CI database only. Auth tables are created by real GoTrue, not mocked.
do $$begin if current_database()<>'rr_step2b_auth' then raise exception 'Wrong DB';end if;end$$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator noinherit login password 'local-rest-only';
grant anon,authenticated,service_role to authenticator;
create schema auth;
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,user_metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,service_role;
grant select on storage.objects to authenticated;
grant all on storage.objects,storage.buckets to service_role;
grant usage on schema public,auth to anon,authenticated,service_role;
create function auth.uid() returns uuid language sql stable set search_path='' as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
grant execute on function auth.uid() to anon,authenticated,service_role;
