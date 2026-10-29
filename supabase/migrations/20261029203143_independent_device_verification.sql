-- Preserve all saved records and the existing single-writer/handoff policy.
do $guard$
begin
 if (select md5(prosrc) from pg_proc where oid='road_ready_private.active_device(uuid,boolean)'::regprocedure) <> '8204a17af3f71c4945218f985661c0ee'
 or (select md5(prosrc) from pg_proc where oid='road_ready_private.guard_active_account()'::regprocedure) <> '57163b8aa9f25d35e033016114e32d8e'
 or (select md5(prosrc) from pg_proc where oid='road_ready_private.patch_account(uuid,bigint,jsonb,jsonb)'::regprocedure) <> 'af1ab93d73fd4fdc8fc97b8247d48e64'
 then raise exception 'Device/sync function changed since review'; end if;
end;
$guard$;

CREATE OR REPLACE FUNCTION road_ready_private.active_device(p_device uuid, p_takeover boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid; r road_ready_private.active_devices; previous_device uuid; incoming boolean;
begin
 if u is null or s is null or p_device is null or not coalesce((public.owner_op_access_v1()->>'approved')::boolean,false)
 or not exists(select 1 from auth.sessions where id=s and user_id=u) then raise exception 'A current approved session is required' using errcode='42501'; end if;
 -- A heartbeat observes committed ownership; it never changes ownership.
 -- Keep it independent of the account-write lock held while large JSON/files sync.
 -- Takeovers and write guards below still serialize on the original lock.
 select * into r from road_ready_private.active_devices where user_id=u;
 if r.session_id=s and r.device_id=p_device then
  return jsonb_build_object('active',true,'generation',r.generation,'receive',r.receive_pending);
 end if;
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
end;$function$;

-- This bounded exemption applies only to a large account patch, not to other
-- API calls. The client has a 45-second transport deadline. A competing writer
-- yields promptly instead of queueing behind a long upload.
alter function public.road_ready_account_patch_v1(uuid,bigint,jsonb,jsonb)
 set statement_timeout = '25s';
alter function public.road_ready_account_patch_v1(uuid,bigint,jsonb,jsonb)
 set lock_timeout = '2s';
notify pgrst, 'reload schema';
