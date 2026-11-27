-- Run after the repository migrations in a disposable DB with Supabase auth roles.
begin;
insert into auth.users(id,email,email_confirmed_at) values
  ('ab011000-0000-4000-8000-000000000001','maintenance-office@example.invalid',now()),
  ('ab011000-0000-4000-8000-000000000002','maintenance-driver@example.invalid',now()),
  ('ab011000-0000-4000-8000-000000000003','maintenance-other@example.invalid',now());
insert into public.rr_lease_operators(id,carrier_user_id,driver_user_id,company_name,driver_name) values
  ('ac011000-0000-4000-8000-000000000001','ab011000-0000-4000-8000-000000000001','ab011000-0000-4000-8000-000000000002','Fixture Carrier','Fixture Driver');
create function pg_temp.receipt_user(actor uuid) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
$$;
do $$
declare
  op constant uuid:='ac011000-0000-4000-8000-000000000001';
  driver constant uuid:='ab011000-0000-4000-8000-000000000002';
  office constant uuid:='ab011000-0000-4000-8000-000000000001';
  outsider constant uuid:='ab011000-0000-4000-8000-000000000003';
  request_id uuid:=gen_random_uuid();
  repeat_id uuid:=gen_random_uuid();
  fuzzy_key uuid:=gen_random_uuid();
  legacy_id uuid;
  saved uuid;
  reply jsonb;
  history_row jsonb;
  bytes_ bytea:=convert_to('%PDF-1.7'||repeat(' synthetic repair receipt ',3600),'UTF8');
  base64_ text:=replace(encode(bytes_,'base64'),chr(10),'');
  original2 text:=replace(encode(bytes_||convert_to('file two','UTF8'),'base64'),chr(10),'');
  form jsonb:='{"kind":"maintenance","record_date":"2026-01-02","description":"Brake repair","vendor":"Demo Truck Shop","unit":"16","expense_category":"service","amount_cents":12600,"odometer":628102,"next_service_odometer":640000,"file_name":"invoice.pdf","mime_type":"application/pdf"}';
  service jsonb:='{"kind":"maintenance","record_date":"2026-01-01","description":"Check brakes","expense_category":"service","amount_cents":null}';
  line_receipt jsonb:='{"mode":"itemized","assetType":"trailer","invoiceNumber":"D-145","payer":"driver","paidCents":6000,"balanceDueCents":6600,"subtotalCents":12000,"taxCents":600,"totalCents":12600,"totalConfirmed":false,"lines":[{"description":"Shop labor","quantity":1.5,"unitPriceCents":8000,"amountCents":12000},{"description":"Parts","quantity":1,"unitPriceCents":600,"amountCents":600},{"description":"Discount","quantity":1,"unitPriceCents":-600,"amountCents":-600}]}';
  service_receipt jsonb:='{"mode":"service_only","invoiceNumber":null,"payer":"unknown","paidCents":null,"balanceDueCents":null,"subtotalCents":null,"taxCents":null,"totalCents":null,"lines":[],"totalConfirmed":false}';
  bad jsonb;
  id_ uuid;
begin
  assert not has_function_privilege('anon','public.rr_lease_save_maintenance_receipt(uuid,uuid,jsonb,text,jsonb,boolean)','EXECUTE');
  assert not has_function_privilege('authenticated','rr_lease_private.validate_maintenance_receipt(jsonb)','EXECUTE');
  assert not has_table_privilege('authenticated','rr_lease_private.maintenance_receipts','SELECT');
  set local role authenticated;
  perform pg_temp.receipt_user(driver);
  -- Earlier callers can continue creating and replaying the same manual record.
  id_:=gen_random_uuid();
  legacy_id:=public.rr_lease_step3_save_maintenance(op,id_,service,null);
  assert public.rr_lease_step3_save_maintenance(op,id_,service,null)=legacy_id;
  assert (select value->'receipt'='null'::jsonb from public.rr_lease_maintenance_receipt_history(op) value where value->>'id'=legacy_id::text);
  -- A reviewed original is persisted with one cost, unchanged bytes, signed item discounts and split payment.
  reply:=public.rr_lease_save_maintenance_receipt(op,request_id,form,base64_,line_receipt);
  assert reply->>'status'='saved' and reply->>'recordDate'='2026-01-02'; saved:=(reply->>'recordId')::uuid;
  assert decode(public.rr_lease_step3_maintenance_original(saved),'base64')=bytes_;
  reply:=public.rr_lease_save_maintenance_receipt(op,request_id,form,base64_,line_receipt);
  assert reply->>'status'='already_saved' and reply->>'recordId'=saved::text;
  -- A different camera filename or corrected OCR cannot silently change or duplicate an original.
  reply:=public.rr_lease_save_maintenance_receipt(op,repeat_id,form||'{"file_name":"renamed.pdf"}',base64_,line_receipt||'{"payer":"carrier"}');
  assert reply->>'status'='already_saved' and reply->>'recordId'=saved::text;
  begin
    perform public.rr_lease_save_maintenance_receipt(op,repeat_id,form,original2,line_receipt);
    raise exception 'Previously used key accepted a new original';
  exception when unique_violation then null; end;
  -- Duplicate review is case/space tolerant and has no side effects until explicitly confirmed.
  form:=form||'{"vendor":"  DEMO TRUCK SHOP "}'::jsonb;
  line_receipt:=line_receipt||'{"invoiceNumber":" d-145 ","payer":"carrier"}'::jsonb;
  reply:=public.rr_lease_save_maintenance_receipt(op,fuzzy_key,form,original2,line_receipt);
  assert reply->>'status'='possible_duplicate' and reply->>'recordId'=saved::text;
  reset role;
  assert not exists(select from rr_lease_private.driver_tool_requests q where q.request_id=fuzzy_key);
  assert (select count(*)=1 from rr_lease_private.driver_tool_files where operator_id=op);
  set local role authenticated;
  reply:=public.rr_lease_save_maintenance_receipt(op,fuzzy_key,form,original2,line_receipt,true);
  assert reply->>'status'='saved' and reply->>'recordId'<>saved::text;
  -- Manual confirmed totals and service-only entries need no attachment or fabricated item list.
  assert public.rr_lease_save_maintenance_receipt(op,gen_random_uuid(),service,null,service_receipt)->>'status'='saved';
  assert public.rr_lease_save_maintenance_receipt(op,gen_random_uuid(),service||'{"amount_cents":1100}',null,
    service_receipt||'{"mode":"total_only","totalCents":1100,"payer":"unknown","totalConfirmed":true}')->>'status'='saved';
  foreach bad in array array[
    line_receipt||'{"taxCents":650}', line_receipt||'{"paidCents":6500}',
    line_receipt||'{"totalCents":12599}', jsonb_set(line_receipt,'{lines,0,quantity}','1.001'),
    line_receipt||'{"payer":"invalid"}', service_receipt||'{"totalCents":12600}',
    service_receipt||'{"mode":"total_only","totalCents":12600,"totalConfirmed":false}'] loop
    begin
      perform public.rr_lease_save_maintenance_receipt(op,gen_random_uuid(),form,base64_,bad);
      raise exception 'Invalid receipt was accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.rr_lease_save_maintenance_receipt(op,gen_random_uuid(),form,encode(convert_to('fake PDF','UTF8'),'base64'),line_receipt,true);
    raise exception 'Wrong file signature was accepted';
  exception when invalid_parameter_value then null; end;
  perform pg_temp.receipt_user(office);
  select value into strict history_row from public.rr_lease_maintenance_receipt_history(op) value where value->>'id'=saved::text;
  assert history_row->>'amount_cents'='12600' and history_row->'receipt'->>'payer'='driver' and history_row->'receipt'->>'assetType'='trailer' and jsonb_array_length(history_row->'receipt'->'lines')=3;
  assert decode(public.rr_lease_step3_maintenance_original(saved),'base64')=bytes_;
  perform pg_temp.receipt_user(outsider);
  assert not exists(select from public.rr_lease_maintenance_receipt_history(op));
  begin
    perform public.rr_lease_save_maintenance_receipt(op,gen_random_uuid(),service,null,service_receipt);
    raise exception 'Outsider created a maintenance record';
  exception when insufficient_privilege then null; end;
  begin
    perform public.rr_lease_step3_maintenance_original(saved);
    raise exception 'Outsider retrieved an original';
  exception when insufficient_privilege then null; end;
  reset role;
  assert (select count(*)=5 and sum(amount_cents)=26300 from public.rr_driver_tool_records where operator_id=op);
  assert (select count(*)=4 from rr_lease_private.maintenance_receipts m join public.rr_driver_tool_records r on r.id=m.record_id where r.operator_id=op);
  assert (select count(*)=2 from rr_lease_private.driver_tool_files where operator_id=op);
  assert not exists(select from public.rr_lease_settlements where operator_id=op);
  assert not exists(select from public.rr_lease_ledger_entries where operator_id=op);
end $$;
-- The maintenance writer shares the older expense file store and cannot charge one file twice.
do $$
declare
  op uuid:='ac011000-0000-4000-8000-000000000001';
  driver uuid:='ab011000-0000-4000-8000-000000000002';
  contents bytea:=convert_to('%PDF-1.7'||repeat('x',3145720),'UTF8');
  encoded text:=replace(encode(contents,'base64'),chr(10),'');
  digest_ text:=encode(sha256(contents),'hex');
  form jsonb:='{"kind":"maintenance","record_date":"2026-01-01","description":"Maintenance with original","expense_category":"service","amount_cents":100,"file_name":"full.pdf","mime_type":"application/pdf"}';
  details jsonb:='{"mode":"total_only","payer":"unknown","totalCents":100,"totalConfirmed":true,"lines":[]}';
  key_ uuid:=gen_random_uuid();
  result_ jsonb;
begin
  assert octet_length(contents)=3145728 and length(encoded)=4194304;
  insert into rr_lease_private.driver_tool_files(operator_id,sha256,contents) values(op,digest_,contents);
  insert into public.rr_driver_tool_records(operator_id,request_id,created_by,record_date,kind,description,
      amount_cents,file_name,mime_type,byte_size,sha256)
    values(op,gen_random_uuid(),driver,'2026-01-01','expense','Earlier expense',100,'full.pdf','application/pdf',octet_length(contents),digest_);
  set local role authenticated;
  perform pg_temp.receipt_user(driver);
  begin
    perform public.rr_lease_save_maintenance_receipt(op,key_,form,encoded,details,true);
    raise exception 'The same original was charged twice';
  exception when unique_violation then null; end;
  reset role;
  assert not exists(select from rr_lease_private.driver_tool_requests q where q.request_id=key_);
  -- A different maximum-sized original reaches the authorized download path unchanged.
  contents:=set_byte(contents,3145727,121); encoded:=replace(encode(contents,'base64'),chr(10),'');
  set local role authenticated;
  result_:=public.rr_lease_save_maintenance_receipt(op,key_,form,encoded,details);
  assert result_->>'status'='saved';
  assert decode(public.rr_lease_step3_maintenance_original((result_->>'recordId')::uuid),'base64')=contents;
  begin
    perform public.rr_lease_save_maintenance_receipt(op,gen_random_uuid(),form,encoded||'AAAA',details);
    raise exception 'An oversized file was accepted';
  exception when invalid_parameter_value then null; end;
  reset role;
end $$;
rollback;
