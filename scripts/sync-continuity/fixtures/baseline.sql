CREATE OR REPLACE FUNCTION road_ready_private.guard_active_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid; r road_ready_private.active_devices;
begin
 if u is null or new.user_id<>u then raise exception 'Account owner required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,110455));
 select * into r from road_ready_private.active_devices where user_id=u;
 if r.user_id is null or (r.device_id<>new.device_id or (r.session_id is not null and (s is distinct from r.session_id or not exists(select 1 from auth.sessions where id=s and user_id=u))) or r.receive_pending) then
  raise exception 'This device is no longer active or has not received the latest logbook. Sign in again.' using errcode='42501';
 end if;
 return new;
end;$function$;


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


CREATE OR REPLACE FUNCTION road_ready_private.patch_account(p_device uuid, p_expected bigint, p_patch jsonb, p_deleted jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 u uuid := auth.uid();
 r public.road_ready_account_workspaces;
 current_records jsonb;
 next_payload jsonb;
 changed jsonb;
 removed jsonb;
 deleted_keys text[];
 next_revision bigint;
begin
 if u is null or not coalesce((public.owner_op_access_v1()->>'approved')::boolean,false) then
  raise exception 'Account access required' using errcode='42501';
 end if;
 if not exists(select 1 from public.road_ready_backup_settings where user_id=u and record_sync_enabled) then
  raise exception 'Account synchronization is not enabled' using errcode='42501';
 end if;
 if p_device is null or p_expected is null or p_expected<1
    or jsonb_typeof(p_patch) is distinct from 'object'
    or jsonb_typeof(p_deleted) is distinct from 'array'
    or octet_length(p_patch::text)>16000000
    or exists(select 1 from jsonb_array_elements(p_deleted) d(value) where jsonb_typeof(d.value) is distinct from 'string') then
  raise exception 'Invalid account patch';
 end if;

 perform pg_advisory_xact_lock(hashtextextended(u::text,110455));
 select * into r from public.road_ready_account_workspaces where user_id=u for update;
 if r.revision is distinct from p_expected then
  return jsonb_build_object('conflict',true,'revision',coalesce(r.revision,0));
 end if;
 if r.payload->>'format' is distinct from 'road_ready_account_v1'
    or jsonb_typeof(r.payload->'records') is distinct from 'object' then
  raise exception 'Invalid account records';
 end if;

 current_records := r.payload->'records';
 select coalesce(array_agg(distinct d.key),'{}'::text[]) into deleted_keys
 from jsonb_array_elements_text(p_deleted) d(key);
 -- Deletion wins when a key occurs in both inputs, matching the old path.
 select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) into changed
 from jsonb_each(p_patch) e
 where not (e.key=any(deleted_keys)) and current_records->e.key is distinct from e.value;
 select coalesce(jsonb_agg(d.key order by d.key),'[]'::jsonb) into removed
 from unnest(deleted_keys) d(key) where current_records ? d.key;
 if changed='{}'::jsonb and removed='[]'::jsonb then
  return jsonb_build_object('revision',r.revision,'unchanged',true);
 end if;

 next_payload := jsonb_set(r.payload,'{records}',(current_records||changed)-deleted_keys);
 if octet_length(next_payload::text)>16000000 then raise exception 'Invalid account records'; end if;
 next_revision := r.revision+1;
 insert into public.road_ready_account_history(user_id,revision,device_id,payload)
 values(u,next_revision,p_device,jsonb_build_object(
  'format','road_ready_account_delta_v1','meta',r.payload-'records','set',changed,'remove',removed));
 -- The existing BEFORE UPDATE trigger still checks the live session, active
 -- device and completed handoff. Its failure rolls back the history insert.
 update public.road_ready_account_workspaces
 set revision=next_revision,device_id=p_device,payload=next_payload,updated_at=now()
 where user_id=u;
 return jsonb_build_object('revision',next_revision,'updated_at',now());
end;
$function$;

CREATE OR REPLACE FUNCTION public.road_ready_account_patch_v1(p_device uuid, p_expected bigint, p_patch jsonb, p_deleted jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select road_ready_private.patch_account(p_device,p_expected,p_patch,p_deleted);$function$;

