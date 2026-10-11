-- One owner of shared account writes. Existing writer is retained during rollout.
create table road_ready_private.active_devices (
 user_id uuid primary key references auth.users(id) on delete cascade,
 device_id uuid not null,
 session_id uuid,
 generation bigint not null default 0,
 receive_pending boolean not null default false,
 activated_at timestamptz not null default now()
);
create table road_ready_private.device_sessions (
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 device_id uuid not null,
 primary key(user_id,session_id)
);
alter table road_ready_private.active_devices enable row level security;
alter table road_ready_private.device_sessions enable row level security;
revoke all on road_ready_private.active_devices,road_ready_private.device_sessions from public,anon,authenticated;
insert into road_ready_private.active_devices(user_id,device_id)
 select user_id,device_id from public.road_ready_account_workspaces where device_id is not null;

create function road_ready_private.active_device(p_device uuid,p_takeover boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid; r road_ready_private.active_devices; previous_device uuid; incoming boolean;
begin
 if u is null or s is null or p_device is null or not coalesce((public.owner_op_access_v1()->>'approved')::boolean,false)
 or not exists(select 1 from auth.sessions where id=s and user_id=u) then raise exception 'A current approved session is required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,110455));
 select * into r from road_ready_private.active_devices where user_id=u for update;
 if r.session_id=s and r.device_id=p_device then
  return jsonb_build_object('active',true,'generation',r.generation,'receive',r.receive_pending);
 end if;
 -- A revoked session cannot reclaim ownership on refresh, retry or page resume.
 if exists(select 1 from road_ready_private.device_sessions where user_id=u and session_id=s) then return jsonb_build_object('active',false); end if;
 if r.user_id is not null and not coalesce(p_takeover,false) and (r.session_id is not null or r.device_id<>p_device) then return jsonb_build_object('active',false); end if;
 previous_device:=r.device_id;
 if previous_device is null then select device_id into previous_device from public.road_ready_account_workspaces where user_id=u; end if;
 incoming:=previous_device is not null and previous_device<>p_device;
 insert into road_ready_private.device_sessions(user_id,session_id,device_id) values(u,s,p_device);
 insert into road_ready_private.active_devices(user_id,device_id,session_id,generation,receive_pending)
 values(u,p_device,s,coalesce(r.generation,0)+1,incoming)
 on conflict(user_id) do update set device_id=excluded.device_id,session_id=excluded.session_id,generation=excluded.generation,receive_pending=excluded.receive_pending,activated_at=now()
 returning * into r;
 return jsonb_build_object('active',true,'generation',r.generation,'receive',r.receive_pending);
end;$$;
revoke all on function road_ready_private.active_device(uuid,boolean) from public,anon;
grant execute on function road_ready_private.active_device(uuid,boolean) to authenticated;
create function public.road_ready_active_device_v1(p_device uuid,p_takeover boolean default false)
returns jsonb language sql security invoker set search_path='' as $$select road_ready_private.active_device(p_device,p_takeover);$$;
revoke all on function public.road_ready_active_device_v1(uuid,boolean) from public,anon;
grant execute on function public.road_ready_active_device_v1(uuid,boolean) to authenticated;

create function road_ready_private.ack_device(p_device uuid,p_generation bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid;
begin
 if u is null or s is null or not exists(select 1 from auth.sessions where id=s and user_id=u) then raise exception 'Current session required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,110455));
 update road_ready_private.active_devices set receive_pending=false where user_id=u and session_id=s and device_id=p_device and generation=p_generation;
 return jsonb_build_object('active',found);
end;$$;
revoke all on function road_ready_private.ack_device(uuid,bigint) from public,anon;
grant execute on function road_ready_private.ack_device(uuid,bigint) to authenticated;
create function public.road_ready_ack_device_v1(p_device uuid,p_generation bigint)
returns jsonb language sql security invoker set search_path='' as $$select road_ready_private.ack_device(p_device,p_generation);$$;
revoke all on function public.road_ready_ack_device_v1(uuid,bigint) from public,anon;
grant execute on function public.road_ready_ack_device_v1(uuid,bigint) to authenticated;

create function road_ready_private.guard_active_account()
returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid; r road_ready_private.active_devices;
begin
 if u is null or new.user_id<>u then raise exception 'Account owner required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,110455));
 select * into r from road_ready_private.active_devices where user_id=u;
 if r.user_id is null or (r.device_id<>new.device_id or (r.session_id is not null and (s is distinct from r.session_id or not exists(select 1 from auth.sessions where id=s and user_id=u))) or r.receive_pending) then
  raise exception 'This device is no longer active or has not received the latest logbook. Sign in again.' using errcode='42501';
 end if;
 return new;
end;$$;
revoke all on function road_ready_private.guard_active_account() from public,anon,authenticated;
create trigger road_ready_active_account_write before insert or update on public.road_ready_account_workspaces
 for each row execute function road_ready_private.guard_active_account();
