-- Disjoint enrollment and membership. Every signed-in member keeps the ordinary portal.
begin;
insert into auth.users(id,email,email_confirmed_at) values
  ('b1000000-0000-4000-8000-000000000001','pilot-owner@example.test',now()),
  ('b1000000-0000-4000-8000-000000000002','pilot-operator@example.test',now()),
  ('b1000000-0000-4000-8000-000000000003','pilot-outsider@example.test',now());
insert into owner_op.approved_users(user_id,email,approved_at) values
  ('b1000000-0000-4000-8000-000000000001','pilot-owner@example.test',now());
insert into public.rr_lease_operators(id,carrier_user_id,driver_user_id,company_name,driver_name,workspace_kind,share_bps) values
  ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null,'Pilot owner','Owner','carrier',10000),
  ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','Second workspace','Linked driver','leased',9200);

create function pg_temp.assert_pilot_denied(op uuid,rec uuid,stage uuid) returns void
language plpgsql security invoker as $$
declare stmt text;
begin
  assert public.rr_driver_tools_enabled(op)=false;
  assert not exists(select 1 from public.rr_driver_tool_records where operator_id=op);
  assert not exists(select 1 from rr_driver_finance_private.legacy_confirmations where operator_id=op);
  for stmt in select unnest(array[
    'select public.rr_driver_quarter_activity($1,date ''2025-10-01'')',
    'select * from public.rr_driver_quarter_legacy_loads($1,date ''2025-10-01'')',
    'select public.rr_driver_confirm_legacy_load($1,date ''2025-10-01'',''known'',''test'')',
    'select rr_driver_finance_private.confirm_legacy($1,date ''2025-10-01'',''known'',''test'')',
    'select public.rr_driver_save_record($1,gen_random_uuid(),''{"kind":"expense","record_date":"2025-10-01","description":"Unenrolled","amount_cents":1}'')',
    'select public.rr_driver_download_evidence($2)',
    'select public.rr_driver_download_evidence_chunk($2,0)',
    'select public.rr_driver_upload_begin($1,gen_random_uuid(),''{}'',4194305,repeat(''0'',64))',
    'select public.rr_driver_upload_chunk($3,8,''eA=='')',
    'select public.rr_driver_finish_upload($3)',
    'insert into public.rr_driver_tool_records(operator_id) values ($1)',
    'insert into rr_lease_private.driver_tools_pilot(operator_id,user_id) values($1,auth.uid())'
  ]) loop
    begin
      execute stmt using op,rec,stage;
      raise exception 'Unenrolled action succeeded: %',stmt;
    exception when insufficient_privilege then null; end;
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","email":"pilot-owner@example.test","role":"authenticated"}',true);
do $$begin
  assert (select count(*)=2 from public.rr_lease_operators);
  assert not has_function_privilege('anon','public.rr_driver_tools_enabled(uuid)','execute');
  assert not public.rr_driver_tools_enabled(null);
  perform pg_temp.assert_pilot_denied('b2000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid());
end $$;

reset role;
-- Temporarily enroll this actor in both synthetic workspaces to save fixtures, then restrict to one.
insert into rr_lease_private.driver_tools_pilot(operator_id,user_id) values
  ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001');
insert into rr_driver_finance_private.legacy_confirmations
  (operator_id,evidence_hash,legacy_key,broker_name,load_number,delivery_date,gross_cents,confirmed_by)
  values('b2000000-0000-4000-8000-000000000001','test','known','Synthetic','001','2025-10-01',1,'b1000000-0000-4000-8000-000000000001');
set local role authenticated;
do $$
declare
  op uuid; rec uuid; stage uuid; i int:=0;
  doc jsonb:='{"kind":"audit_document","record_date":"2025-10-01","description":"Pilot fixture","file_name":"audit.txt","mime_type":"text/plain"}';
begin
  for op in select id from public.rr_lease_operators order by id loop
    i:=i+1;
    assert public.rr_driver_tools_enabled(op);
    rec:=public.rr_driver_save_record(op,gen_random_uuid(),doc,'eA==');
    stage:=(public.rr_driver_upload_begin(op,gen_random_uuid(),doc,4194305,repeat('0',64))->>'upload_id')::uuid;
    perform public.rr_driver_upload_chunk(stage,8,'eA==');
    perform set_config('pilot.record'||i,rec::text,true);
    perform set_config('pilot.upload'||i,stage::text,true);
    assert public.rr_driver_download_evidence(rec)='eA==';
  end loop;
end $$;

-- Same workspace, real linked driver, different caller: enrollment never follows the carrier.
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","email":"pilot-operator@example.test","role":"authenticated"}',true);
do $$begin
  assert (select count(*)=1 from public.rr_lease_operators);
  perform pg_temp.assert_pilot_denied('b2000000-0000-4000-8000-000000000002',current_setting('pilot.record2')::uuid,current_setting('pilot.upload2')::uuid);
end $$;

reset role;
delete from rr_lease_private.driver_tools_pilot where operator_id='b2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","email":"pilot-owner@example.test","role":"authenticated"}',true);
do $$begin
  assert (select count(*)=2 from public.rr_lease_operators);
  assert public.rr_driver_tools_enabled('b2000000-0000-4000-8000-000000000001');
  assert (select count(*)=1 from public.rr_driver_tool_records);
  assert (select count(*)=1 from rr_driver_finance_private.legacy_confirmations);
  assert public.rr_driver_download_evidence_chunk(current_setting('pilot.record1')::uuid,0)='eA==';
  perform pg_temp.assert_pilot_denied('b2000000-0000-4000-8000-000000000002',current_setting('pilot.record2')::uuid,current_setting('pilot.upload2')::uuid);
end $$;

-- Pausing the pilot denies new access to existing evidence, confirmations and in-progress uploads.
reset role;
delete from rr_lease_private.driver_tools_pilot where operator_id='b2000000-0000-4000-8000-000000000001';
-- An enrollment alone cannot confer membership to an outsider.
insert into rr_lease_private.driver_tools_pilot values('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003');
set local role authenticated;
select pg_temp.assert_pilot_denied('b2000000-0000-4000-8000-000000000001',current_setting('pilot.record1')::uuid,current_setting('pilot.upload1')::uuid);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003","email":"pilot-outsider@example.test","role":"authenticated"}',true);
select pg_temp.assert_pilot_denied('b2000000-0000-4000-8000-000000000001',current_setting('pilot.record1')::uuid,current_setting('pilot.upload1')::uuid);
reset role;
do $$begin
  assert (select count(*)=2 from public.rr_driver_tool_records);
  assert (select count(*)=2 from rr_lease_private.driver_upload_chunks);
  assert (select count(*)=1 from rr_driver_finance_private.legacy_confirmations);
end $$;
rollback;
