-- Disposable role-based integration test, after all lease and driver-tools migrations.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('a0100000-0000-4000-8000-000000000001','tool-carrier@example.test',now()),
 ('a0100000-0000-4000-8000-000000000002','tool-driver-a@example.test',now()),
 ('a0100000-0000-4000-8000-000000000003','tool-driver-b@example.test',now()),
 ('a0100000-0000-4000-8000-000000000004','tool-outsider@example.test',now());
insert into public.rr_lease_operators(id,carrier_user_id,driver_user_id,company_name,driver_name) values
 ('a0200000-0000-4000-8000-000000000001','a0100000-0000-4000-8000-000000000001','a0100000-0000-4000-8000-000000000002','Test A','Driver A'),
 ('a0200000-0000-4000-8000-000000000002','a0100000-0000-4000-8000-000000000001','a0100000-0000-4000-8000-000000000003','Test B','Driver B');

-- Enroll the synthetic actors used by this general behavior fixture.
insert into rr_lease_private.driver_tools_pilot(operator_id,user_id)
  select id,carrier_user_id from public.rr_lease_operators where id in ('a0200000-0000-4000-8000-000000000001','a0200000-0000-4000-8000-000000000002')
  union all
  select id,driver_user_id from public.rr_lease_operators where id in ('a0200000-0000-4000-8000-000000000001','a0200000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  op uuid:='a0200000-0000-4000-8000-000000000001';
  op_b uuid:='a0200000-0000-4000-8000-000000000002';
  first_key uuid:=gen_random_uuid(); alias_key uuid:=gen_random_uuid(); row_id uuid; other_id uuid;
  raw bytea:=convert_to(E'ELD export\r\nDate,Event\r\n2025-09-30,OFF\r\n','UTF8');
  orig text:=encode(raw,'base64');
  doc jsonb:='{"kind":"logbook","record_date":"2025-10-02","description":"Quarter source","coverage_start":"2025-07-01","coverage_end":"2025-09-30","file_name":"ELD.csv","mime_type":"text/csv"}';
  miles jsonb:='{"kind":"mileage","record_date":"2025-09-30","description":"Quarter miles, truck 6","unit":"6","jurisdiction":"TX","miles":254.123,"taxable_miles":0,"file_name":"miles.csv","mime_type":"text/csv"}';
  fuel jsonb:='{"kind":"fuel","record_date":"2025-09-30","description":"Fuel","gallons":101.005,"jurisdiction":"TX","file_name":"receipt.txt","mime_type":"text/plain"}';
  bad jsonb; huge text;
begin
  assert not has_table_privilege(current_user,'public.rr_driver_tool_records','INSERT,UPDATE,DELETE,TRUNCATE');
  assert not has_schema_privilege(current_user,'rr_lease_private','usage');
  assert not has_function_privilege('anon','public.rr_driver_save_record(uuid,uuid,jsonb,text)','execute');
  assert not has_function_privilege('anon','public.rr_driver_download_evidence(uuid)','execute');

  row_id:=public.rr_driver_save_record(op,first_key,doc,orig);
  assert (select r.coverage_start='2025-07-01' and r.coverage_end='2025-09-30' and r.created_by=auth.uid() and
      r.byte_size=octet_length(raw) and r.sha256=encode(sha256(raw),'hex') and r.request_id=first_key
    from public.rr_driver_tool_records r where r.id=row_id);
  assert decode(public.rr_driver_download_evidence(row_id),'base64')=raw;
  assert row_id=public.rr_driver_save_record(op,first_key,doc,orig);
  assert row_id=public.rr_driver_save_record(op,alias_key,doc,orig);
  assert row_id=public.rr_driver_save_record(op,alias_key,doc,orig);
  begin
    perform public.rr_driver_save_record(op,alias_key,doc||'{"description":"Changed"}',orig);
    raise exception 'Altered retry accepted';
  exception when unique_violation then null; end;
  begin
    perform public.rr_driver_save_record(op,gen_random_uuid(),doc||'{"record_date":"2025-11-30"}',orig);
    raise exception 'Same document duplicated with different details';
  exception when unique_violation then null; end;
  begin
    perform public.rr_driver_save_record(op,first_key,doc,encode(raw||raw,'base64'));
    raise exception 'Original bytes replaced';
  exception when unique_violation then null; end;
  assert (select count(*)=1 from public.rr_driver_tool_records);
  perform set_config('test.tools_record',row_id::text,true);

  other_id:=public.rr_driver_save_record(op,gen_random_uuid(),miles,orig);
  assert other_id=public.rr_driver_save_record(op,gen_random_uuid(),miles,orig);
  assert other_id<>public.rr_driver_save_record(op,gen_random_uuid(),miles||'{"jurisdiction":"OK","taxable_miles":120}',orig);
  assert other_id<>public.rr_driver_save_record(op,gen_random_uuid(),miles||'{"unit":"7"}',orig);
  assert other_id<>public.rr_driver_save_record(op,gen_random_uuid(),miles||'{"record_date":"2025-09-29"}',orig);
  begin
    perform public.rr_driver_save_record(op,gen_random_uuid(),miles||'{"miles":1}',orig);
    raise exception 'Conflicting same document/jurisdiction/unit/day accepted';
  exception when unique_violation then null; end;
  other_id:=public.rr_driver_save_record(op,gen_random_uuid(),fuel,orig);
  assert (select fuel_type='unknown' and fuel_tax_paid='unknown' and unit is null from public.rr_driver_tool_records where id=other_id);
  assert other_id<>public.rr_driver_save_record(op,gen_random_uuid(),fuel||'{"fuel_type":"def","fuel_tax_paid":"no","gallons":4}',orig);
  begin
    perform public.rr_driver_save_record(op,gen_random_uuid(),fuel||'{"record_date":"2025-10-01","fuel_type":"diesel"}',orig);
    raise exception 'Original counted twice as propulsion fuel';
  exception when unique_violation then null; end;
  perform public.rr_driver_save_record(op,gen_random_uuid(),'{"kind":"expense","amount_cents":2500,"record_date":"2025-11-01","description":"Toll","expense_category":"Tolls"}');
  perform public.rr_driver_save_record(op,gen_random_uuid(),'{"kind":"maintenance","vendor":"Test shop","odometer":2000,"next_service_odometer":2500,"next_service_date":"2027-02-08","record_date":"2025-11-01","description":"Inspection"}');
  perform public.rr_driver_save_record(op,gen_random_uuid(),doc||'{"kind":"ifta_filing"}',orig);
  perform public.rr_driver_save_record(op,gen_random_uuid(),doc||'{"kind":"audit_document"}',orig);

  -- Reconcile one monetary total per receipt, even across distinct kinds and request keys.
  declare
    receipt text:=encode(convert_to('priced source original','UTF8'),'base64');
    dollars jsonb:='{"kind":"expense","record_date":"2025-09-30","description":"Receipt total","amount_cents":2500,"file_name":"cost.txt","mime_type":"text/plain"}';
    priced_id uuid; detail_id uuid;
  begin
    priced_id:=public.rr_driver_save_record(op,gen_random_uuid(),dollars,receipt);
    assert priced_id=public.rr_driver_save_record(op,gen_random_uuid(),dollars,receipt);
    begin
      perform public.rr_driver_save_record(op,gen_random_uuid(),fuel||'{"amount_cents":2500}',receipt);
      raise exception 'Receipt counted as both expense and fuel';
    exception when unique_violation then
      assert sqlerrm like 'This original already has a recorded amount%';
    end;
    detail_id:=public.rr_driver_save_record(op,gen_random_uuid(),fuel,receipt);
    assert detail_id<>priced_id;
    assert detail_id=public.rr_driver_save_record(op,gen_random_uuid(),fuel,receipt);
    assert priced_id<>public.rr_driver_save_record(op,gen_random_uuid(),dollars,encode(convert_to('separate priced original','UTF8'),'base64'));
    assert (select sum(amount_cents)=5000 from public.rr_driver_tool_records where description='Receipt total');
  end;


  for bad in select value from jsonb_array_elements('[
    {"kind":"logbook","record_date":"2025-09-30","description":"Missing original"},
    {"kind":"expense","record_date":"2025-09-30","description":"Missing amount"},
    {"kind":"mileage","record_date":"2025-09-30","description":"Missing state","miles":6},
    {"kind":"mileage","record_date":"2025-09-30","description":"Bad state","miles":6,"jurisdiction":"ZZ"},
    {"kind":"mileage","record_date":"2025-09-30","description":"Higher taxable","miles":6,"taxable_miles":7,"jurisdiction":"TX"},
    {"kind":"fuel","record_date":"2025-09-30","description":"Negative","gallons":-1,"jurisdiction":"TX"},
    {"kind":"fuel","record_date":"2025-09-30","description":"Extra decimals","gallons":1.0001,"jurisdiction":"TX"},
    {"kind":"fuel","record_date":"2025-09-30","description":"Unknown enum","gallons":2,"jurisdiction":"TX","fuel_tax_paid":"maybe"},
    {"kind":"maintenance","record_date":"2025-09-30","description":"Odometer reversed","odometer":3000,"next_service_odometer":2999},
    {"kind":"maintenance","record_date":"2025-09-30","description":"Bad date","next_service_date":"2020-01-01"},
    {"kind":"expense","record_date":"2025-09-30","description":"Fractional cents","amount_cents":0.4},
    {"kind":"expense","record_date":"2025-09-30","description":"Spoof actor","amount_cents":5,"created_by":"a0100000-0000-4000-8000-000000000001"},
    {"kind":"expense","record_date":"infinity","description":"Bad date","amount_cents":5},
    {"kind":"expense","record_date":"9999-10-10","description":"Future date","amount_cents":5}
  ]') loop
    begin
      perform public.rr_driver_save_record(op,gen_random_uuid(),bad);
      raise exception 'Malformed record accepted: %',bad;
    exception when check_violation or data_exception or not_null_violation then null; end;
  end loop;
  -- Use a fresh original so inconsistent document metadata hits the underlying constraints.
  for bad in select value from jsonb_array_elements('[
    {"coverage_end":null}, {"coverage_end":"2025-06-30"}, {"coverage_end":"9999-12-31"},
    {"mime_type":"application/pdf"}, {"file_name":"../x"}, {"mime_type":"application/javascript"}
  ]') loop
    begin
      perform public.rr_driver_save_record(op,gen_random_uuid(),doc||bad,encode(convert_to('fresh bytes','UTF8'),'base64'));
      raise exception 'Malformed evidence accepted: %',bad;
    exception when check_violation or data_exception then null; end;
  end loop;
  begin
    perform public.rr_driver_save_record(op,gen_random_uuid(),doc,encode(decode('ff','hex'),'base64'));
    raise exception 'Invalid UTF-8 accepted';
  exception when data_exception then null; end;
  huge:=replace(encode(convert_to(repeat('x',4194304),'UTF8'),'base64'),chr(10),'');
  other_id:=public.rr_driver_save_record(op,gen_random_uuid(),doc,huge);
  assert public.rr_driver_download_evidence(other_id)=huge;
  begin
    perform public.rr_driver_save_record(op,gen_random_uuid(),doc,huge||'AAAA');
    raise exception 'Oversized input accepted';
  exception when data_exception then null; end;
  begin
    perform public.rr_driver_save_record(op_b,gen_random_uuid(),doc,orig);
    raise exception 'Cross-workspace insert allowed';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"a0100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare raw bytea:=convert_to(E'ELD export\r\nDate,Event\r\n2025-09-30,OFF\r\n','UTF8'); rec uuid;
begin
  assert not exists(select 1 from public.rr_driver_tool_records);
  begin
    perform public.rr_driver_download_evidence(current_setting('test.tools_record')::uuid);
    raise exception 'Peer could download a known ID';
  exception when insufficient_privilege then null; end;
  rec:=public.rr_driver_save_record('a0200000-0000-4000-8000-000000000002',gen_random_uuid(),
    '{"kind":"logbook","record_date":"2025-10-02","description":"Independent copy","file_name":"ELD.csv","mime_type":"text/csv"}',encode(raw,'base64'));
  assert rec<>current_setting('test.tools_record')::uuid;
  assert (select count(*)=1 from public.rr_driver_tool_records);
end $$;

select set_config('request.jwt.claims','{"sub":"a0100000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$begin
  assert not exists(select 1 from public.rr_driver_tool_records);
  begin
    perform public.rr_driver_download_evidence(current_setting('test.tools_record')::uuid);
    raise exception 'Unrelated user could retrieve an original';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"a0100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$begin
  assert (select count(distinct operator_id)=2 from public.rr_driver_tool_records);
  assert public.rr_driver_download_evidence(current_setting('test.tools_record')::uuid) is not null;
  perform public.rr_driver_save_record('a0200000-0000-4000-8000-000000000001',gen_random_uuid(),
    '{"kind":"expense","record_date":"2025-10-02","description":"Carrier added evidence","amount_cents":100}');
  assert not exists(select 1 from public.rr_lease_settlements);
  assert not exists(select 1 from public.rr_lease_adjustments);
  assert not exists(select 1 from public.rr_lease_owner_expenses);
end $$;
reset role;
do $$begin
  -- Shared bytes never cross operator ownership. Failed writes left no orphaned content.
  assert (select count(*)=5 from rr_lease_private.driver_tool_files);
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  op uuid:='a0200000-0000-4000-8000-000000000001';
  other_op uuid:='a0200000-0000-4000-8000-000000000002';
  req uuid:=gen_random_uuid(); upload uuid; row_id uuid; response jsonb; replay jsonb;
  doc jsonb:='{"kind":"logbook","record_date":"2025-09-30","description":"Full-size export","file_name":"ELD.csv","mime_type":"text/csv"}';
  -- Vary every slice so ordering and integrity can be tested at the exact 32 MiB maximum.
  raw bytea; digest text; i integer; piece text; alternate text; bad_upload uuid;
begin
  select convert_to(string_agg(repeat(chr(32+j),524288),'' order by j),'UTF8') into raw from generate_series(0,63) j;
  digest:=encode(sha256(raw),'hex');
  assert octet_length(raw)=33554432;
  assert not has_function_privilege('anon','public.rr_driver_upload_begin(uuid,uuid,jsonb,integer,text)','execute');
  assert not has_function_privilege('anon','public.rr_driver_download_evidence_chunk(uuid,integer)','execute');
  assert not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='rr_lease_private'
    and p.proname in ('driver_tool_save','driver_upload_lock') and has_function_privilege(current_user,p.oid,'execute'));
  begin
    perform public.rr_driver_upload_begin(other_op,req,doc,33554432,digest);
    raise exception 'Foreign workspace can start an upload';
  exception when insufficient_privilege then null; end;
  begin
    perform public.rr_driver_upload_begin(op,req,doc,33554433,digest);
    raise exception 'Upload larger than 32 MiB accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.rr_driver_upload_begin(op,req,doc,4194304,digest);
    raise exception 'Small file created large-upload staging';
  exception when invalid_parameter_value then null; end;
  response:=public.rr_driver_upload_begin(op,req,doc,33554432,digest);
  upload:=(response->>'upload_id')::uuid;
  assert response->'received'='[]'::jsonb and response->>'record_id' is null;
  piece:=replace(encode(substr(raw,63*524288+1,524288),'base64'),chr(10),'');
  assert public.rr_driver_upload_chunk(upload,63,piece)=63;
  assert public.rr_driver_upload_chunk(upload,63,piece)=63;
  replay:=public.rr_driver_upload_begin(op,req,doc,33554432,digest);
  assert replay->'received'='[63]'::jsonb and replay->>'upload_id'=upload::text;
  begin
    perform public.rr_driver_upload_begin(op,req,doc||'{"description":"Changed"}',33554432,digest);
    raise exception 'Staging metadata overwritten';
  exception when unique_violation then null; end;
  begin
    perform public.rr_driver_upload_chunk(upload,63,replace(encode(substr(raw,1,524288),'base64'),chr(10),''));
    raise exception 'Staged chunk overwritten';
  exception when unique_violation then null; end;
  begin
    perform public.rr_driver_upload_chunk(upload,64,piece);
    raise exception 'Out-of-range staged chunk accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.rr_driver_upload_chunk(upload,4,'eA==');
    raise exception 'Short staged chunk accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.rr_driver_finish_upload(upload);
    raise exception 'Incomplete original visible';
  exception when invalid_parameter_value then null; end;
  assert not exists(select 1 from public.rr_driver_tool_records where request_id=req);
  for i in reverse 62..0 loop
    piece:=replace(encode(substr(raw,1+i*524288,524288),'base64'),chr(10),'');
    assert public.rr_driver_upload_chunk(upload,i,piece)=i;
  end loop;
  row_id:=public.rr_driver_finish_upload(upload);
  assert public.rr_driver_finish_upload(upload)=row_id;
  replay:=public.rr_driver_upload_begin(op,req,doc,33554432,digest);
  assert replay->>'record_id'=row_id::text and replay->'received'='[]'::jsonb;
  assert (select byte_size=33554432 and sha256=digest from public.rr_driver_tool_records where id=row_id);
  for i in 0..63 loop
    assert decode(public.rr_driver_download_evidence_chunk(row_id,i),'base64')=substr(raw,1+i*524288,524288);
  end loop;
  begin
    perform public.rr_driver_download_evidence_chunk(row_id,64);
    raise exception 'Out-of-range read accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.rr_driver_download_evidence(row_id);
    raise exception 'Single large unbounded download accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('test.tools_large',row_id::text,true);

  req:=gen_random_uuid();
  bad_upload:=(public.rr_driver_upload_begin(op,req,doc,4194305,repeat('0',64))->>'upload_id')::uuid;
  for i in 0..7 loop
    assert public.rr_driver_upload_chunk(bad_upload,i,piece)=i;
  end loop;
  assert public.rr_driver_upload_chunk(bad_upload,8,'eA==')=8;
  begin
    perform public.rr_driver_finish_upload(bad_upload);
    raise exception 'Unverified checksum accepted';
  exception when invalid_parameter_value then null; end;
  assert not exists(select 1 from public.rr_driver_tool_records where request_id=req);
  perform set_config('test.tools_pending',bad_upload::text,true);
  perform set_config('test.tools_expired_request',req::text,true);
  for i in 1..3 loop perform public.rr_driver_upload_begin(op,gen_random_uuid(),doc,4194305,digest); end loop;
  begin
    perform public.rr_driver_upload_begin(op,gen_random_uuid(),doc,4194305,digest);
    raise exception 'Unbounded pending uploads';
  exception when invalid_parameter_value then null; end;
end $$;

-- Even the carrier who can read a driver's completed original cannot modify that driver's staging.
select set_config('request.jwt.claims','{"sub":"a0100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$begin
  assert public.rr_driver_download_evidence_chunk(current_setting('test.tools_large')::uuid,0) is not null;
  begin
    perform public.rr_driver_finish_upload(current_setting('test.tools_pending')::uuid);
    raise exception 'Carrier can finish someone else''s upload';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"a0100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$begin
  begin
    perform public.rr_driver_download_evidence_chunk(current_setting('test.tools_large')::uuid,0);
    raise exception 'Peer can read large original';
  exception when insufficient_privilege then null; end;
  begin
    perform public.rr_driver_upload_chunk(current_setting('test.tools_pending')::uuid,8,'eA==');
    raise exception 'Peer can write stage';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
update rr_lease_private.driver_uploads set touched_at=now()-interval '25 hours' where id=current_setting('test.tools_pending')::uuid;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare stage jsonb;
begin
  begin
    perform public.rr_driver_upload_chunk(current_setting('test.tools_pending')::uuid,8,'eA==');
    raise exception 'Expired stage still usable';
  exception when invalid_parameter_value then null; end;
  stage:=public.rr_driver_upload_begin('a0200000-0000-4000-8000-000000000001',current_setting('test.tools_expired_request')::uuid,
    '{"kind":"logbook","record_date":"2025-09-30","description":"Full-size export","file_name":"ELD.csv","mime_type":"text/csv"}',4194305,repeat('0',64));
  assert stage->'received'='[]'::jsonb and stage->>'upload_id'<>current_setting('test.tools_pending');
end $$;
reset role;
do $$begin
  assert not exists(select 1 from rr_lease_private.driver_upload_chunks), 'Completed and expired staging bytes must be reclaimed';
  assert (select count(*)=1 from rr_lease_private.driver_uploads where record_id is not null);
end $$;
rollback;
