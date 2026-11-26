-- Run against a disposable database with the RoadReady migrations applied.
begin;
do $test$
declare carrier uuid:=gen_random_uuid(); driver uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); solo uuid:=gen_random_uuid(); shipment uuid:=gen_random_uuid(); test_job record; n int; dest text:='https://web.push.apple.com/rollback-only-'||gen_random_uuid()::text;
begin
  if has_function_privilege('authenticated','public.rr_load_push_claim()','execute') or has_function_privilege('anon','public.rr_load_push_worker_config(text,jsonb)','execute') then raise exception 'Worker privilege isolation failed'; end if;
  insert into auth.users(id) values(carrier),(driver);
  insert into public.rr_lease_operators(id,carrier_user_id,driver_user_id,company_name,driver_name,workspace_kind) values(op,carrier,driver,'Rollback test carrier','Rollback test driver','leased');
  perform set_config('request.jwt.claim.sub',driver::text,true);
  perform public.rr_load_push_subscribe(op,jsonb_build_object('endpoint',dest,'keys',jsonb_build_object('p256dh',repeat('A',87),'auth',repeat('A',22))));
  insert into public.rr_lease_loads(id,operator_id,load_number,broker_name,status,share_bps) values(shipment,op,'rollback-test','Rollback test','staging',9200);
  if exists(select 1 from rr_lease_private.load_push_queue where load_id=shipment) then raise exception 'Staging triggered push'; end if;
  update public.rr_lease_loads set status='assigned' where id=shipment;
  update public.rr_lease_loads set status='assigned' where id=shipment;
  update public.rr_lease_loads set status='picked_up' where id=shipment;
  select count(*) into n from rr_lease_private.load_push_queue where load_id=shipment;
  if n<>1 then raise exception 'Expected one job, got %',n; end if;
  select * into strict test_job from public.rr_load_push_claim() j where j.load_id=shipment;
  if test_job.endpoint<>dest then raise exception 'Wrong target'; end if;
  perform public.rr_load_push_finish(test_job.job,test_job.token,503);
  if not exists(select 1 from rr_lease_private.load_push_queue where id=test_job.job and lease is null and due_at>now() and done_at is null) then raise exception 'Retry missing';end if;
  update rr_lease_private.load_push_queue set due_at=now() where id=test_job.job;
  select * into strict test_job from public.rr_load_push_claim() j where j.load_id=shipment;
  perform public.rr_load_push_finish(test_job.job,test_job.token,201);
  if not exists(select 1 from rr_lease_private.load_push_queue where id=test_job.job and done_at is not null and result='accepted' and attempts=2) then raise exception 'Completion missing';end if;
  perform public.rr_load_push_unsubscribe(dest);
  if exists(select 1 from rr_lease_private.load_push_devices where endpoint=dest) then raise exception 'Opt out failed';end if;
end $test$;
rollback;
