-- Recruiting has its own records and a dedicated intake-only credential.
create table public.road_ready_recruiting_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.road_ready_recruiting_intake_key (
  singleton boolean primary key default true check (singleton),
  secret_sha256 text not null check (secret_sha256 ~ '^[0-9a-f]{64}$')
);
create table public.road_ready_recruiting_applications (
  id uuid primary key,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  details jsonb not null check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 10000)
);
create index recruiting_source_time on public.road_ready_recruiting_applications (source_hash, created_at);
create index recruiting_latest on public.road_ready_recruiting_applications (created_at desc, id desc);
create index recruiting_unread on public.road_ready_recruiting_applications (id) where reviewed_at is null;
alter table public.road_ready_recruiting_reviewers enable row level security;
alter table public.road_ready_recruiting_intake_key enable row level security;
alter table public.road_ready_recruiting_applications enable row level security;
revoke all on public.road_ready_recruiting_reviewers, public.road_ready_recruiting_intake_key,
  public.road_ready_recruiting_applications from public, anon, authenticated, service_role;
grant select (user_id) on public.road_ready_recruiting_reviewers to authenticated;
grant select (id, created_at, reviewed_at, details) on public.road_ready_recruiting_applications to authenticated;
create policy recruiting_own_membership on public.road_ready_recruiting_reviewers for select to authenticated
  using (user_id = (select auth.uid()) and (select (public.owner_op_access_v1()->>'approved')::boolean));
create policy recruiting_owner_inbox on public.road_ready_recruiting_applications for select to authenticated
  using (exists (select 1 from public.road_ready_recruiting_reviewers where user_id = (select auth.uid())));

-- Provision the verified carrier reviewer and intake-key digest per deployment.
-- Only the server environment holds the raw key.
create function public.road_ready_submit_recruiting(p_id uuid, p_source_hash text, p_details jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  provided_key text := current_setting('request.headers', true)::jsonb->>'x-recruiting-key';
  existing_details jsonb;
begin
  if provided_key is null or length(provided_key) <> 64 or not exists (
    select 1 from public.road_ready_recruiting_intake_key
    where secret_sha256 = encode(sha256(convert_to(provided_key, 'UTF8')), 'hex')
  ) then
    raise insufficient_privilege;
  end if;

  -- Serialize the bounded quota check across instances, including simultaneous retries.
  perform pg_advisory_xact_lock(hashtextextended(p_source_hash, 0));
  select details into existing_details from public.road_ready_recruiting_applications where id = p_id;
  if found then
    return case when existing_details = p_details then 'accepted' else 'conflict' end;
  end if;
  if (select count(*) from public.road_ready_recruiting_applications where source_hash = p_source_hash
      and created_at >= now() - interval '1 hour') >= 5 then
    return 'limited';
  end if;
  insert into public.road_ready_recruiting_applications(id, source_hash, details)
    values(p_id, p_source_hash, p_details) on conflict (id) do nothing;
  if not found then
    select details into existing_details from public.road_ready_recruiting_applications where id = p_id;
    if existing_details is distinct from p_details then return 'conflict'; end if;
  end if;
  return 'accepted';
end;
$$;
revoke all on function public.road_ready_submit_recruiting(uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.road_ready_submit_recruiting(uuid,text,jsonb) to anon;

create function public.road_ready_review_recruiting(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.road_ready_recruiting_reviewers where user_id = (select auth.uid()))
    or not coalesce((public.owner_op_access_v1()->>'approved')::boolean, false) then
    raise insufficient_privilege;
  end if;
  update public.road_ready_recruiting_applications set reviewed_at = now() where id = p_id and reviewed_at is null;
  return exists (select 1 from public.road_ready_recruiting_applications where id = p_id);
end;
$$;
revoke all on function public.road_ready_review_recruiting(uuid) from public, anon, authenticated, service_role;
grant execute on function public.road_ready_review_recruiting(uuid) to authenticated;
