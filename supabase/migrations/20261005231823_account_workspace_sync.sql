-- Account-wide shared working copy, separate from manual immutable full backups.
create schema if not exists road_ready_private;
revoke all on schema road_ready_private from public;
grant usage on schema road_ready_private to authenticated;
create table if not exists public.road_ready_account_workspaces (
 user_id uuid primary key references auth.users(id), revision bigint not null check(revision>0),
 device_id uuid not null, payload jsonb not null, updated_at timestamptz not null default now()
);
create table if not exists public.road_ready_account_history (
 user_id uuid not null references auth.users(id), revision bigint not null,
 device_id uuid not null, payload jsonb not null, created_at timestamptz not null default now(),
 primary key(user_id,revision)
);
alter table public.road_ready_account_workspaces enable row level security;
alter table public.road_ready_account_history enable row level security;
revoke all on public.road_ready_account_workspaces,public.road_ready_account_history from anon,authenticated;
grant select on public.road_ready_account_workspaces,public.road_ready_account_history to authenticated;
create policy account_workspace_read on public.road_ready_account_workspaces for select to authenticated using(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>'approved')::boolean);
create policy account_history_read on public.road_ready_account_history for select to authenticated using(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>'approved')::boolean);
create or replace function road_ready_private.commit_account(p_device uuid,p_expected bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); current_revision bigint; current_payload jsonb;
begin
 if u is null or not coalesce((public.owner_op_access_v1()->>'approved')::boolean,false) then raise exception 'Account access required' using errcode='42501'; end if;
 if not exists(select 1 from public.road_ready_backup_settings where user_id=u and record_sync_enabled) then raise exception 'Account synchronization is not enabled' using errcode='42501'; end if;
 if p_device is null or p_expected is null or p_expected<0 or p_payload->>'format' is distinct from 'road_ready_account_v1' or jsonb_typeof(p_payload->'records') is distinct from 'object' or octet_length(p_payload::text)>16000000 then raise exception 'Invalid account records'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,110455));
 select revision,payload into current_revision,current_payload from public.road_ready_account_workspaces where user_id=u for update;
 if coalesce(current_revision,0)<>p_expected then return jsonb_build_object('conflict',true,'revision',coalesce(current_revision,0)); end if;
 if current_payload=p_payload then return jsonb_build_object('revision',current_revision,'unchanged',true); end if;
 current_revision:=coalesce(current_revision,0)+1;
 insert into public.road_ready_account_history(user_id,revision,device_id,payload) values(u,current_revision,p_device,p_payload);
 insert into public.road_ready_account_workspaces(user_id,revision,device_id,payload) values(u,current_revision,p_device,p_payload)
 on conflict(user_id) do update set revision=excluded.revision,device_id=excluded.device_id,payload=excluded.payload,updated_at=now();
 return jsonb_build_object('revision',current_revision,'updated_at',now());
end;$$;
revoke all on function road_ready_private.commit_account(uuid,bigint,jsonb) from public,anon;
grant execute on function road_ready_private.commit_account(uuid,bigint,jsonb) to authenticated;
create or replace function public.road_ready_account_commit_v1(p_device uuid,p_expected bigint,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$select road_ready_private.commit_account(p_device,p_expected,p_payload);$$;
revoke all on function public.road_ready_account_commit_v1(uuid,bigint,jsonb) from public,anon;
grant execute on function public.road_ready_account_commit_v1(uuid,bigint,jsonb) to authenticated;
