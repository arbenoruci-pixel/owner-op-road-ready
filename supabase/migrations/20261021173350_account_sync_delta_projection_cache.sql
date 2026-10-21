do $guard$ begin if (select md5(prosrc) from pg_proc where oid='road_ready_private.commit_account(uuid,bigint,jsonb)'::regprocedure) <> '98cc240ee397092c51e83a6970e61e3e' then raise exception 'Account sync function changed since review'; end if; end $guard$;
-- Reuse each records object during delta comparison. Repeated extraction of
-- the full archive for every key caused statement timeouts on large accounts.
-- Authorization, locking, immutable history and optimistic revisions are retained.
CREATE OR REPLACE FUNCTION road_ready_private.commit_account(p_device uuid, p_expected bigint, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); current_revision bigint; current_payload jsonb; current_records jsonb; incoming_records jsonb; history_payload jsonb; changed jsonb; removed jsonb;
begin
 if u is null or not coalesce((public.owner_op_access_v1()->>'approved')::boolean,false) then raise exception 'Account access required' using errcode='42501'; end if;
 if not exists(select 1 from public.road_ready_backup_settings where user_id=u and record_sync_enabled) then raise exception 'Account synchronization is not enabled' using errcode='42501'; end if;
 if p_device is null or p_expected is null or p_expected<0 or p_payload->>'format' is distinct from 'road_ready_account_v1' or jsonb_typeof(p_payload->'records') is distinct from 'object' or octet_length(p_payload::text)>16000000 then raise exception 'Invalid account records'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,110455));
 select revision,payload into current_revision,current_payload from public.road_ready_account_workspaces where user_id=u for update;
 if coalesce(current_revision,0)<>p_expected then return jsonb_build_object('conflict',true,'revision',coalesce(current_revision,0)); end if;
 if current_payload=p_payload then return jsonb_build_object('revision',current_revision,'unchanged',true); end if;
 if current_revision is null then history_payload:=p_payload; else
 current_records := current_payload->'records';
 incoming_records := p_payload->'records';
 select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) into changed from jsonb_each(incoming_records) e where current_records->e.key is distinct from e.value;
 select coalesce(jsonb_agg(e.key),'[]'::jsonb) into removed from jsonb_object_keys(current_records) e(key) where not (incoming_records ? e.key);
 history_payload:=jsonb_build_object('format','road_ready_account_delta_v1','meta',p_payload-'records','set',changed,'remove',removed);
 end if;
 current_revision:=coalesce(current_revision,0)+1;
 insert into public.road_ready_account_history(user_id,revision,device_id,payload) values(u,current_revision,p_device,history_payload);
 insert into public.road_ready_account_workspaces(user_id,revision,device_id,payload) values(u,current_revision,p_device,p_payload)
 on conflict(user_id) do update set revision=excluded.revision,device_id=excluded.device_id,payload=excluded.payload,updated_at=now();
 return jsonb_build_object('revision',current_revision,'updated_at',now());
end;$function$;
