-- Keep the established session, generation, write and acknowledgement checks.
-- A regular sign-in, including an older client requesting takeover, cannot move
-- a driver's logbook to another installation.
alter function road_ready_private.active_device(uuid,boolean) rename to activate_claimed_device;
revoke all on function road_ready_private.activate_claimed_device(uuid,boolean) from public, anon, authenticated;

create function road_ready_private.checked_logbook_device(p_device uuid, p_login boolean, p_transfer_generation bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  sid uuid := (auth.jwt()->>'session_id')::uuid;
  holder road_ready_private.active_devices;
  previous_device uuid;
begin
  select * into holder from road_ready_private.active_devices where user_id = owner_id;
  if holder.device_id = p_device and holder.session_id = sid then
    return road_ready_private.activate_claimed_device(p_device, false);
  end if;
  if owner_id is null or sid is null or p_device is null
    or not coalesce((public.owner_op_access_v1()->>'approved')::boolean,false)
    or not exists (select 1 from auth.sessions where id=sid and user_id=owner_id) then
    raise exception 'A current approved session is required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,110455));
  select * into holder from road_ready_private.active_devices where user_id=owner_id for update;
  if exists (select 1 from road_ready_private.device_sessions where user_id=owner_id and session_id=sid) then
    return road_ready_private.activate_claimed_device(p_device,false);
  end if;
  previous_device := holder.device_id;
  if previous_device is null then
    select device_id into previous_device from public.road_ready_account_workspaces where user_id=owner_id;
  end if;
  if previous_device is not null and previous_device <> p_device
    and p_transfer_generation is distinct from coalesce(holder.generation,0) then
    return jsonb_build_object('active',false,'transferRequired',true,'generation',coalesce(holder.generation,0));
  end if;
  return road_ready_private.activate_claimed_device(p_device, p_login or p_transfer_generation is not null);
end;
$$;
revoke all on function road_ready_private.checked_logbook_device(uuid,boolean,bigint) from public, anon;
grant execute on function road_ready_private.checked_logbook_device(uuid,boolean,bigint) to authenticated;

create function road_ready_private.active_device(p_device uuid,p_takeover boolean)
returns jsonb language sql security invoker set search_path='' as $$
  select road_ready_private.checked_logbook_device(p_device,p_takeover,null);
$$;
revoke all on function road_ready_private.active_device(uuid,boolean) from public,anon;
grant execute on function road_ready_private.active_device(uuid,boolean) to authenticated;
create or replace function public.road_ready_active_device_v1(p_device uuid,p_takeover boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
  select road_ready_private.active_device(p_device,p_takeover);
$$;
create function public.road_ready_transfer_logbook_v1(p_device uuid,p_generation bigint)
returns jsonb language sql security invoker set search_path='' as $$
  select road_ready_private.checked_logbook_device(p_device,false,p_generation);
$$;
revoke all on function public.road_ready_transfer_logbook_v1(uuid,bigint) from public,anon;
grant execute on function public.road_ready_transfer_logbook_v1(uuid,bigint) to authenticated;
notify pgrst, 'reload schema';
