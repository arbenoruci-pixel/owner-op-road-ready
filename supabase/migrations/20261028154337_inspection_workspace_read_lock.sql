-- Inspection copies are immutable files, separate from the editable archive.
-- Bind exactly the reviewed client snapshot; never SELECT the latest day files
-- after uploads and accidentally combine different devices or revisions.
create or replace function public.owner_op_create_inspection_snapshot_v1(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='8s' set lock_timeout='3s'
as $$
declare
 u uuid:=auth.uid(); active jsonb; revision bigint; sid uuid; dt date; finish date;
 captured timestamptz; zone text; item jsonb; file owner_op.files; current_file uuid;
 expected jsonb; selected jsonb; actual integer;
begin
 if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>65536 then raise exception 'Invalid inspection request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,110455));
 active:=public.road_ready_active_device_v1((p_payload->>'device_id')::uuid,false);
 if coalesce((active->>'active')::boolean,false) is not true or coalesce((active->>'receive')::boolean,true) then
  raise exception 'This device has not received the latest logbook' using errcode='PT409';
 end if;
 -- Account writes use the same per-user advisory lock above. SELECT FOR SHARE
 -- would require UPDATE rights intentionally unavailable to authenticated users.
 select w.revision into revision from public.road_ready_account_workspaces w where w.user_id=u;
 if revision is null or revision is distinct from (p_payload->>'expected_revision')::bigint then
  raise exception 'Account records changed. Create the inspection link again.' using errcode='PT409';
 end if;
 zone:=p_payload->>'home_timezone';
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'Invalid home-terminal timezone'; end if;
 captured:=(p_payload->>'captured_at')::timestamptz; finish:=(p_payload->>'end_day')::date;
 if captured is null or captured>now()+interval '2 minutes' or captured<now()-interval '15 minutes' or finish is distinct from (captured at time zone zone)::date then raise exception 'Invalid inspection capture time'; end if;
 if jsonb_typeof(p_payload->'logs') is distinct from 'array' or jsonb_array_length(p_payload->'logs')<>8 then raise exception 'Exactly eight log dates are required'; end if;
 expected:=p_payload->'expected_archive'; selected:=coalesce(p_payload->'wallet_keys','[]'::jsonb);
 if jsonb_typeof(expected) is distinct from 'object' or jsonb_typeof(selected)<>'array' or jsonb_array_length(selected)>50 then raise exception 'Invalid inspection references'; end if;
 if jsonb_typeof(p_payload->'profile') is distinct from 'object' then raise exception 'Invalid inspection profile'; end if;
 for n in 0..7 loop
  item:=p_payload->'logs'->n; dt:=finish-7+n;
  if item->>'day' is distinct from dt::text or not(expected ? dt::text) then raise exception 'Inspection dates do not match'; end if;
  select * into file from owner_op.files f where f.user_id=u and f.id=(item->>'file_id')::uuid and f.category='log_archive';
  if not found or file.sha256 is distinct from item->>'sha256' or file.mime_type<>'application/gzip' then raise exception 'Inspection file verification failed' using errcode='42501'; end if;
  select d.current_file_id into current_file from owner_op.log_days d where d.user_id=u and d.log_date=dt for share;
  if current_file is distinct from (expected->>dt::text)::uuid then raise exception 'Saved log changed. Create the inspection link again.' using errcode='PT409'; end if;
 end loop;
 select count(*) into actual from owner_op.wallet_documents w where w.user_id=u and w.document_key in(select jsonb_array_elements_text(selected));
 if actual<>jsonb_array_length(selected) then raise exception 'A selected document is unavailable'; end if;
 insert into owner_op.inspection_shares(user_id,token_sha256,starts_on,ends_on,home_timezone,profile_snapshot,expires_at)
 values(u,p_payload->>'token_sha256',finish-7,finish,zone,(p_payload->'profile')||jsonb_build_object('inspectionCapturedAt',p_payload->>'captured_at','inspectionVersion',1),now()+interval '4 hours') returning id into sid;
 insert into owner_op.inspection_items(user_id,share_id,item_key,kind,file_id,label,log_date,metadata)
 select u,sid,'log:'||(x->>'day'),'log',(x->>'file_id')::uuid,'Daily log '||(x->>'day'),(x->>'day')::date,jsonb_build_object('snapshot_version',1,'captured_at',p_payload->>'captured_at','account_revision',revision)
 from jsonb_array_elements(p_payload->'logs') x;
 insert into owner_op.inspection_items(user_id,share_id,item_key,kind,file_id,label,metadata)
 select u,sid,'wallet:'||w.document_key,'wallet',w.file_id,left(coalesce(w.metadata->>'title',w.document_key),250),w.metadata
 from owner_op.wallet_documents w where w.user_id=u and w.document_key in(select jsonb_array_elements_text(selected));
 return jsonb_build_object('id',sid,'starts_on',finish-7,'ends_on',finish,'captured_at',p_payload->>'captured_at','expires_at',now()+interval '4 hours','log_count',8,'document_count',actual);
end $$;
revoke all on function public.owner_op_create_inspection_snapshot_v1(jsonb) from public,anon;
grant execute on function public.owner_op_create_inspection_snapshot_v1(jsonb) to authenticated;
