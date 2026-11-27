-- Disposable PostgreSQL integration test. All originals and identities are fictional.
-- Uses the real signed-in upload/review functions, without a mail transport.
begin;

insert into auth.users(id,email,email_confirmed_at) values
  ('ab000000-0000-4000-8000-000000000001','qa-office@example.test',now()),
  ('ab000000-0000-4000-8000-000000000002','qa-driver@example.test',now()),
  ('ab000000-0000-4000-8000-000000000003','qa-outsider@example.test',now());
insert into public.rr_lease_operators(id,carrier_user_id,driver_user_id,company_name,driver_name)
values ('ac000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000002','Fixture Carrier','Test Driver');
insert into rr_lease_private.operator_invites(operator_id,email)
values ('ac000000-0000-4000-8000-000000000001','qa-driver@example.test');
insert into rr_lease_private.pod_workflow_carriers(carrier_user_id)
values ('ab000000-0000-4000-8000-000000000001');
insert into public.rr_lease_loads(id,operator_id,broker_name,load_number,status)
values ('ad000000-0000-4000-8000-000000000042','ac000000-0000-4000-8000-000000000001',
  'Demo Freight','RR-POD-TEST-042','staging');
select set_config('qa.load','ad000000-0000-4000-8000-000000000042',true);

-- Build a small, readable PDF with its own complete cross-reference table.
create function pg_temp.proof(contents text) returns bytea language plpgsql as $$
declare
  stream text := 'BT /F1 12 Tf 40 710 Td ('||contents||') Tj ET';
  objects text[] := array[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length '||octet_length(stream)||E' >>\nstream\n'||stream||E'\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  pdf text := E'%PDF-1.4\n';
  xref text := E'xref\n0 6\n0000000000 65535 f \n';
  offset_xref integer;
begin
  for i in 1..array_length(objects,1) loop
    xref:=xref||lpad(octet_length(pdf)::text,10,'0')||E' 00000 n \n';
    pdf:=pdf||i||E' 0 obj\n'||objects[i]||E'\nendobj\n';
  end loop;
  offset_xref:=octet_length(pdf);
  return convert_to(pdf||xref||E'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'||offset_xref||E'\n%%EOF\n','UTF8');
end $$;

create function pg_temp.attach(p_kind text, p_content text) returns uuid language plpgsql as $$
declare
  doc uuid := gen_random_uuid();
  load_id uuid := current_setting('qa.load')::uuid;
  original bytea := pg_temp.proof(p_content);
begin
  insert into public.rr_lease_documents(id,load_id,kind,file_name,storage_path,mime_type,byte_size,sha256)
  values(doc,load_id,p_kind,p_kind||'.pdf','ac000000-0000-4000-8000-000000000001/'||load_id||'/'||doc,
    'application/pdf',octet_length(original),encode(sha256(original),'hex'));
  perform public.rr_lease_put_chunk(doc,0,encode(original,'base64'));
  perform public.rr_lease_finish_original(doc);
  return doc;
end $$;

create function pg_temp.phone_upload(request_id uuid, p_content text) returns uuid language plpgsql as $$
declare
  original bytea := pg_temp.proof(p_content);
  reservation jsonb;
  result jsonb;
begin
  reservation:=public.rr_lease_step2b_create_upload(request_id,current_setting('qa.load')::uuid,null,null,
    'signed-proof.pdf','application/pdf',octet_length(original));
  result:=public.rr_lease_step2b_commit_upload((reservation->>'uploadId')::uuid,encode(original,'base64'),
    encode(sha256(original),'hex'),'application/pdf');
  assert result->>'loadId'=current_setting('qa.load') and result->>'orphan'='false';
  return (result->>'documentId')::uuid;
end $$;

create function pg_temp.sign_in(actor uuid) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
$$;
-- The office already assigned a priced load. Its rate original has not yet
-- been verified. Receiving a POD must not approve, deliver or bill this load.
savepoint before_pending_rate;
update public.rr_lease_loads set status='assigned',gross_cents=216000
where id=current_setting('qa.load')::uuid;
select pg_temp.attach('ratecon','Unverified rate original');
set local role authenticated;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000003');
do $$begin
  perform pg_temp.phone_upload(gen_random_uuid(),'Unrelated driver');
  raise exception 'Unrelated driver could upload';
exception when insufficient_privilege then null; end $$;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000002');
do $$
declare
  original bytea:=pg_temp.proof('Reference only');
  reservation jsonb;
  request_id uuid:=gen_random_uuid();
  doc uuid:=pg_temp.phone_upload(request_id,'Pending signed POD');
begin
  assert doc=pg_temp.phone_upload(request_id,'Pending signed POD');
  assert doc=pg_temp.phone_upload(gen_random_uuid(),'Pending signed POD');
  begin
    reservation:=public.rr_lease_step2b_create_upload(gen_random_uuid(),null,'Demo Freight','RR-POD-TEST-042',
      'reference.pdf','application/pdf',octet_length(original));
    perform public.rr_lease_step2b_commit_upload((reservation->>'uploadId')::uuid,encode(original,'base64'),
      encode(sha256(original),'hex'),'application/pdf');
    raise exception 'Reference-only upload bypassed the financial review';
  exception when invalid_parameter_value then
    assert sqlerrm='Unverified financial load requires carrier review',sqlerrm;
  end;
end $$;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000001');
do $$
declare dr jsonb:=public.rr_lease_pod_invoice_drafts(p_load_id=>current_setting('qa.load')::uuid)->0;
begin
  assert dr->>'status'='pending_review' and dr->>'gross_cents' is null;
  assert (dr->'blocking_reasons') ? 'Verify the current rate confirmation';
  assert (dr->'blocking_reasons') ? 'Review the pending driver POD';
end $$;
reset role;
do $$
declare load_id_ uuid:=current_setting('qa.load')::uuid;
begin
  assert (select count(*)=1 from public.rr_lease_documents where load_id=load_id_ and kind='pod' and is_ready);
  assert (select count(*)=1 from public.rr_lease_mail_events where load_id=load_id_ and source_kind='driver_upload' and not verified_for_billing);
  assert (select count(*)=1 from rr_lease_private.pod_mail_outbox where load_id=load_id_ and assigned_upload and status='pending');
  assert (select count(*)=1 from rr_lease_private.pod_invoice_drafts where load_id=load_id_);
  assert (select gross_cents=216000 and status='assigned' and final_pod_id is null and settlement_id is null
    and pod_received_at is not null from public.rr_lease_loads where id=load_id_);
  assert not exists(select from public.rr_lease_factoring where load_id=load_id_);
  assert not exists(select from public.rr_lease_ledger_entries where load_id=load_id_);
end $$;
create function pg_temp.expect_unverified_rate_block() returns void language plpgsql as $$
begin
  perform pg_temp.phone_upload(gen_random_uuid(),'A fresh POD receipt');
  raise exception 'Unexpectedly accepted an unverified financial load';
exception when invalid_parameter_value then
  assert sqlerrm='Unverified financial load requires carrier review',sqlerrm;
end $$;

savepoint before_disabling;
delete from rr_lease_private.pod_workflow_carriers
where carrier_user_id='ab000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000002');
select pg_temp.expect_unverified_rate_block();
rollback to savepoint before_disabling;
with draft as (
  insert into public.rr_lease_settlements(operator_id,week_start)
  values ('ac000000-0000-4000-8000-000000000001','2026-11-23') returning id
)
update public.rr_lease_loads set settlement_id=draft.id from draft
where rr_lease_loads.id=current_setting('qa.load')::uuid;
set local role authenticated;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000002');
select pg_temp.expect_unverified_rate_block();
rollback to savepoint before_pending_rate;
set local role service_role;
do $$
declare rate uuid:=pg_temp.attach('ratecon','TEST - RR-POD-TEST-042 - USD 3200.00');
begin
  perform public.rr_lease_apply_mail(rate,'qa-rate-042','dispatch@example.test','Fixture rate and routing verified',
    '{"pickup_address":"Chicago, IL","delivery_address":"Elkhart, IN","gross_cents":320000,
      "accessorials":{"detention":false,"layover":false,"lumper":false},
      "steps":[{"title":"Delivery 1","detail":"Joliet, IL"},{"title":"Delivery 2","detail":"Elkhart, IN"}]}'::jsonb,p_verified_for_billing=>true);
  perform set_config('qa.rate',rate::text,true);
end $$;
set local role authenticated;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000002');
do $$
declare
  key uuid:='ae000000-0000-4000-8000-000000000001';
  contents text:='TEST - RR-POD-TEST-042 - Joliet IL - Delivery 1 - Signed: Test Receiver';
  doc uuid:=pg_temp.phone_upload(key,contents);
begin
  assert doc=pg_temp.phone_upload(key,contents),'Same request duplicated a signed original';
  assert doc=pg_temp.phone_upload(gen_random_uuid(),contents),'Same bytes re-uploaded as a new original';
  perform set_config('qa.pod1',doc::text,true);
end $$;

select pg_temp.sign_in('ab000000-0000-4000-8000-000000000001');
create function pg_temp.assert_draft(expected text, blocked text default null) returns void language plpgsql as $$
declare dr jsonb:=public.rr_lease_pod_invoice_drafts(p_load_id=>current_setting('qa.load')::uuid)->0;
begin
 assert (dr->>'gross_cents')::int=320000, 'Draft must reflect the full verified broker rate';
 assert dr->>'status'=expected, format('expected %s but observed %s',expected,dr);
 assert blocked is null or exists(select 1 from jsonb_array_elements_text(dr->'blocking_reasons') x where x=blocked), 'Missing blocker '||blocked;
end $$;
savepoint before_review;
select public.rr_lease_step2b_review_pod(current_setting('qa.pod1')::uuid,true,true,'Received one original, final delivery verified');
set local role service_role;
select public.rr_lease_finalize_delivery(current_setting('qa.load')::uuid,current_setting('qa.pod1')::uuid,current_date,true);
set local role authenticated;
select pg_temp.assert_draft('pending_review','Confirm the number of deliveries on the rate confirmation');
rollback to savepoint before_review;
select public.rr_lease_step2b_review_pod(current_setting('qa.pod1')::uuid,true,true,'Received one signed original');
select public.rr_lease_pod_cover_delivery(current_setting('qa.load')::uuid,1,1,current_setting('qa.pod1')::uuid);
set local role service_role;
select public.rr_lease_finalize_delivery(current_setting('qa.load')::uuid,current_setting('qa.pod1')::uuid,current_date,true);
set local role authenticated;
select pg_temp.assert_draft('ready');
reset role;
do $$begin assert not exists(select from public.rr_lease_factoring where load_id=current_setting('qa.load')::uuid),'Draft sent without office action'; end $$;
rollback to savepoint before_review;
select public.rr_lease_step2b_review_pod(current_setting('qa.pod1')::uuid,true,false,'Reviewed first signed original');
select public.rr_lease_pod_cover_delivery(current_setting('qa.load')::uuid,1,2,current_setting('qa.pod1')::uuid);
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000002');
select set_config('qa.pod2',pg_temp.phone_upload(gen_random_uuid(),'TEST signed POD for second delivery')::text,true);
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000001');
select public.rr_lease_step2b_review_pod(current_setting('qa.pod2')::uuid,true,true,'Reviewed second signed original');
savepoint before_finalization;
set local role service_role;
select public.rr_lease_finalize_delivery(current_setting('qa.load')::uuid,current_setting('qa.pod2')::uuid,current_date,true);
set local role authenticated;
select pg_temp.assert_draft('pending_review','Missing POD for delivery 2 of 2');
rollback to savepoint before_finalization;
select public.rr_lease_pod_cover_delivery(current_setting('qa.load')::uuid,2,2,current_setting('qa.pod2')::uuid);
set local role service_role;
select public.rr_lease_finalize_delivery(current_setting('qa.load')::uuid,current_setting('qa.pod2')::uuid,current_date,true);
set local role authenticated;
select pg_temp.assert_draft('ready');
reset role;
do $$begin assert not exists(select from public.rr_lease_factoring where load_id=current_setting('qa.load')::uuid),'Draft sent without office action'; end $$;
set local role service_role;
do $$declare res jsonb;
begin
 res:=public.rr_lease_claim_factoring(current_setting('qa.load')::uuid,pg_temp.attach('invoice','TEST archive packet for offline explicit claim'),'TEST-042',320000,current_setting('qa.rate')::uuid,array[current_setting('qa.pod2')::uuid]);
 assert res->>'send'='true','Explicit manual invoice claim must still succeed for an eligible load';
end $$;
rollback;
