-- Small edits previously rebuilt the workspace and then diffed all 1,500+
-- records again in commit_account. That held the device lock until the API
-- timed out. Build the same immutable delta from the explicit patch instead.
-- This migration changes no saved records, auth policy, grant or trigger.
do $guard$
begin
 if (select md5(prosrc) from pg_proc
     where oid='road_ready_private.patch_account(uuid,bigint,jsonb,jsonb)'::regprocedure)
    <> '98cd416ec47d65e643b8849c45261f59' then
  raise exception 'Account patch function changed since review';
 end if;
end;
$guard$;

create or replace function road_ready_private.patch_account(
 p_device uuid, p_expected bigint, p_patch jsonb, p_deleted jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $function$
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
