-- Retain a full initial generation and subsequent immutable deltas.
create or replace function road_ready_private.commit_account(p_device uuid,p_expected bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); current_revision bigint; current_payload jsonb; history_payload jsonb; changed jsonb; removed jsonb;
begin
 if u is null or not coalesce((public.owner_op_access_v1()->>'approved')::boolean,false) then raise exception 'Account access required' using errcode='42501'; end if;
 if not exists(select 1 from public.road_ready_backup_settings where user_id=u and record_sync_enabled) then raise exception 'Account synchronization is not enabled' using errcode='42501'; end if;
 if p_device is null or p_expected is null or p_expected<0 or p_payload->>'format' is distinct from 'road_ready_account_v1' or jsonb_typeof(p_payload->'records') is distinct from 'object' or octet_length(p_payload::text)>16000000 then raise exception 'Invalid account records'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,110455));
 select revision,payload into current_revision,current_payload from public.road_ready_account_workspaces where user_id=u for update;
 if coalesce(current_revision,0)<>p_expected then return jsonb_build_object('conflict',true,'revision',coalesce(current_revision,0)); end if;
 if current_payload=p_payload then return jsonb_build_object('revision',current_revision,'unchanged',true); end if;
 if current_revision is null then history_payload:=p_payload; else
 select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) into changed from jsonb_each(p_payload->'records') e where current_payload->'records'->e.key is distinct from e.value;
 select coalesce(jsonb_agg(e.key),'[]'::jsonb) into removed from jsonb_object_keys(current_payload->'records') e(key) where not (p_payload->'records' ? e.key);
 history_payload:=jsonb_build_object('format','road_ready_account_delta_v1','meta',p_payload-'records','set',changed,'remove',removed);
 end if;
 current_revision:=coalesce(current_revision,0)+1;
 insert into public.road_ready_account_history(user_id,revision,device_id,payload) values(u,current_revision,p_device,history_payload);
 insert into public.road_ready_account_workspaces(user_id,revision,device_id,payload) values(u,current_revision,p_device,p_payload)
 on conflict(user_id) do update set revision=excluded.revision,device_id=excluded.device_id,payload=excluded.payload,updated_at=now();
 return jsonb_build_object('revision',current_revision,'updated_at',now());
end;$$;

create or replace function road_ready_private.patch_account(p_device uuid,p_expected bigint,p_patch jsonb,p_deleted jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.road_ready_account_workspaces; records jsonb; k text;
begin
 if u is null or not coalesce((public.owner_op_access_v1()->>'approved')::boolean,false) then raise exception 'Account access required' using errcode='42501'; end if;
 if p_expected is null or p_expected<1 or jsonb_typeof(p_patch) is distinct from 'object' or jsonb_typeof(p_deleted) is distinct from 'array' or octet_length(p_patch::text)>16000000 then raise exception 'Invalid account patch'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,110455));
 select * into r from public.road_ready_account_workspaces where user_id=u for update;
 if r.revision is distinct from p_expected then return jsonb_build_object('conflict',true,'revision',coalesce(r.revision,0)); end if;
 records:=(r.payload->'records')||p_patch;
 for k in select jsonb_array_elements_text(p_deleted) loop records:=records-k; end loop;
 return road_ready_private.commit_account(p_device,p_expected,jsonb_set(r.payload,'{records}',records));
end;$$;
revoke all on function road_ready_private.patch_account(uuid,bigint,jsonb,jsonb) from public,anon;
grant execute on function road_ready_private.patch_account(uuid,bigint,jsonb,jsonb) to authenticated;
create or replace function public.road_ready_account_patch_v1(p_device uuid,p_expected bigint,p_patch jsonb,p_deleted jsonb default '[]'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select road_ready_private.patch_account(p_device,p_expected,p_patch,p_deleted);$$;
revoke all on function public.road_ready_account_patch_v1(uuid,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.road_ready_account_patch_v1(uuid,bigint,jsonb,jsonb) to authenticated;
