-- Run with an approved owner's claims supplied by the operator. Always rolls back.
-- Replace :owner / :claims before execution; synthetic device and records never persist.
begin;
update public.road_ready_backup_settings set record_sync_enabled=true where user_id=:'owner';
select set_config('request.jwt.claims', :'claims',true);
set local role authenticated;
do $$
declare d uuid:='00000000-0000-4000-8000-000000000451';a uuid:='00000000-0000-4000-8000-000000000001';b uuid:='00000000-0000-4000-8000-000000000002';x jsonb;
begin
 perform public.road_ready_record_sync_v1(d,a,'begin');
 x:=public.road_ready_record_sync_v1(d,b,'begin');if x->>'busy'<>'true' then raise exception 'Competing run was not blocked';end if;
 perform public.road_ready_record_sync_v1(d,a,'batch','[{"record_key":"business/loads/test","kind":"business_loads","locator":{"store":"business","bucket":"loads","id":"test"},"data":{"id":"test","loadNo":"TEST-451","broker":"Before"},"payload_hash":"one","load_no":"TEST-451"}]');
 perform public.road_ready_record_sync_v1(d,a,'finish','[]',1);
 perform public.road_ready_record_sync_v1(d,b,'begin');
 perform public.road_ready_record_sync_v1(d,b,'batch','[{"record_key":"business/loads/test","payload_hash":"one"}]');
 perform public.road_ready_record_sync_v1(d,b,'finish','[]',1);
 if (select count(*) from public.road_ready_record_history where device_id=d)<>1 then raise exception 'Unchanged record added history';end if;
 perform public.road_ready_record_sync_v1(d,a,'begin');
 perform public.road_ready_record_sync_v1(d,a,'batch','[{"record_key":"business/loads/test","kind":"business_loads","locator":{"store":"business","bucket":"loads","id":"test"},"data":{"id":"test","loadNo":"TEST-451","broker":"After"},"payload_hash":"two","load_no":"TEST-451"}]');
 begin perform public.road_ready_record_sync_v1(d,a,'finish','[]',2);raise exception 'Wrong count accepted';exception when others then if sqlerrm<>'Synchronization count does not match' then raise;end if;end;
 begin perform public.road_ready_record_sync_v1(d,b,'finish','[]',1);raise exception 'Stale run accepted';exception when others then if sqlerrm<>'A newer synchronization has started' then raise;end if;end;
 begin perform public.road_ready_record_sync_v1(d,a,'batch','[{"record_key":"business/loads/test","payload_hash":"wrong"}]');raise exception 'Wrong hash accepted';exception when others then if sqlerrm<>'Cached record needs a full refresh' then raise;end if;end;
 perform public.road_ready_record_sync_v1(d,a,'finish','[]',1);
 if (select count(*) from public.road_ready_record_history where device_id=d)<>2 then raise exception 'History missing';end if;
 if (select revision from public.road_ready_records where device_id=d)<>2 then raise exception 'Revision wrong';end if;
 begin delete from public.road_ready_records where device_id=d;raise exception 'Delete granted';exception when insufficient_privilege then null;end;
 begin insert into public.road_ready_records(user_id,device_id,record_key,kind,origin,data,payload_hash) values('00000000-0000-4000-8000-000000000099',d,'foreign','settings','device','{}','foreign');raise exception 'Cross-account write granted';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$declare uid uuid:=auth.uid();d uuid:='00000000-0000-4000-8000-000000000451';begin
 perform owner_op.queue_record_correction_v1(uid,d,'business/loads/test',2,'{"broker":"Corrected"}','Synthetic metadata correction');
 begin perform owner_op.queue_record_correction_v1(uid,d,'business/loads/test',1,'{"broker":"Old"}','Synthetic stale correction');raise exception 'Stale revision accepted';exception when others then if sqlerrm<>'Refresh the device record before correcting it' then raise;end if;end;
 begin perform owner_op.queue_record_correction_v1(uid,d,'business/loads/test',2,'{"id":"bad"}','Synthetic forbidden correction');raise exception 'Identity edit accepted';exception when others then if sqlerrm not like 'Field % must use its original app workflow' then raise;end if;end;
end $$;
set local role authenticated;
do $$declare d uuid:='00000000-0000-4000-8000-000000000451';begin
 begin update public.road_ready_corrections set patch='{"broker":"Tampered"}' where device_id=d;raise exception 'Patch editing granted';exception when insufficient_privilege then null;end;
 update public.road_ready_corrections set status='applied',result='{"synthetic":true}',applied_at=now() where device_id=d;
 if (select count(*) from public.road_ready_correction_history where correction_id in(select id from public.road_ready_corrections where device_id=d))<>2 then raise exception 'Correction audit missing';end if;
 begin update public.road_ready_corrections set status='pending' where device_id=d;raise exception 'Completed correction changed';exception when others then if sqlerrm<>'Completed correction is immutable; queue a new correction to undo' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000099","email":"unapproved@example.test"}',true);
set local role authenticated;
do $$begin if exists(select 1 from public.road_ready_records where device_id='00000000-0000-4000-8000-000000000451') then raise exception 'Cross-account read granted';end if;end $$;
rollback;
