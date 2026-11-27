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
-- First POD committed. Remaining assertions exercise office and delivery flows.

reset role;
do $$begin
  assert (select count(*)=1 from rr_lease_private.pod_invoice_drafts where load_id=current_setting('qa.load')::uuid);
  assert (select count(*)=1 from rr_lease_private.pod_mail_outbox where load_id=current_setting('qa.load')::uuid);
  assert not exists(select from public.rr_lease_factoring where load_id=current_setting('qa.load')::uuid);
end $$;
set local role authenticated;
do $$begin
  assert public.rr_lease_pod_invoice_drafts()='[]'::jsonb,'Driver read an office draft';
  assert not has_function_privilege(current_user,'public.rr_pod_mail_claim()','EXECUTE');
end $$;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000003');
do $$begin
  assert public.rr_lease_pod_invoice_drafts()='[]'::jsonb,'Unrelated user read an office draft';
  begin
    perform public.rr_lease_pod_workflow_original(current_setting('qa.pod1')::uuid,0);
    assert false, 'Unrelated user read the original';
  exception when insufficient_privilege then null; end;
  begin
    perform pg_temp.phone_upload(gen_random_uuid(),'Unrelated driver');
    assert false, 'Unrelated driver uploaded on this load';
  exception when insufficient_privilege then null; end;
end $$;

set local role service_role;
do $$
declare message jsonb:=public.rr_pod_mail_claim(); doc uuid:=(message->>'document_id')::uuid; claim uuid:=(message->>'claim_id')::uuid;
begin
  assert message->>'load_number'='RR-POD-TEST-042' and message->>'broker'='Demo Freight' and message->>'driver'='Test Driver';
  assert message->>'load_id'=current_setting('qa.load') and doc=current_setting('qa.pod1')::uuid;
  assert message->>'assigned_upload'='true' and message->>'addendum'='false';
  assert public.rr_pod_mail_claim() is null,'Another worker claimed the same active job';
  assert not public.rr_pod_mail_advance(doc,gen_random_uuid(),'sending');
  assert public.rr_pod_mail_advance(doc,claim,'retry','Fixture explicit rate limit');
  assert public.rr_pod_mail_claim() is null,'Backoff was skipped';
end $$;
reset role;
update rr_lease_private.pod_mail_outbox set available_at=now()-interval '1 minute' where document_id=current_setting('qa.pod1')::uuid;
set local role service_role;
do $$
declare message jsonb:=public.rr_pod_mail_claim(); doc uuid:=(message->>'document_id')::uuid; claim uuid:=(message->>'claim_id')::uuid;
begin
  assert public.rr_pod_mail_advance(doc,claim,'sending');
  assert public.rr_pod_mail_advance(doc,claim,'accepted','Fixture provider acknowledgement');
  assert public.rr_pod_mail_claim() is null;
end $$;

set local role authenticated;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000001');
do $$
declare doc uuid:=current_setting('qa.pod1')::uuid; load_id uuid:=current_setting('qa.load')::uuid; draft jsonb;
begin
  draft:=public.rr_lease_pod_invoice_drafts(p_load_id=>load_id)->0;
  assert draft->>'load_id'=load_id::text and draft->>'status'='pending_review';
  assert (draft->>'gross_cents')::bigint=320000;
  assert (draft->>'pod_count')::integer=1;
  assert (public.rr_lease_pod_workflow_original(doc,0)->>'sha256')=
    encode(sha256(pg_temp.proof('TEST - RR-POD-TEST-042 - Joliet IL - Delivery 1 - Signed: Test Receiver')),'hex');
  perform set_config('qa.draft',draft->>'draft_id',true);
  perform public.rr_lease_step2b_review_pod(doc,true,false,'Reviewed signed Joliet delivery');
  perform public.rr_lease_pod_cover_delivery(load_id,1,2,doc);
  draft:=public.rr_lease_pod_invoice_drafts(p_load_id=>load_id)->0;
  assert draft::text ilike '%Missing POD for delivery 2 of 2%';
  assert draft->>'status'='pending_review';
end $$;
-- A rate revision changes the existing draft, even before every delivery is received.
savepoint exercise_revised_rate;
set local role service_role;
do $$declare revised uuid:=pg_temp.attach('ratecon','TEST revised rate for the existing load');
begin
  perform public.rr_lease_apply_mail(revised,'qa-revised-rate','dispatch@example.test','Reviewed revised rate',
    '{"pickup_address":"Chicago, IL","delivery_address":"Elkhart, IN","gross_cents":333300,
     "accessorials":{"detention":false,"layover":false,"lumper":false},
     "steps":[{"title":"Delivery 1","detail":"Joliet, IL"},{"title":"Delivery 2","detail":"Elkhart, IN"}]}'::jsonb,
    current_setting('qa.rate')::uuid,true);
end $$;
set local role authenticated;
do $$declare draft jsonb:=public.rr_lease_pod_invoice_drafts(p_load_id=>current_setting('qa.load')::uuid)->0;
begin
  assert (draft->>'gross_cents')::bigint=333300 and draft->>'draft_id'=current_setting('qa.draft');
end $$;
rollback to savepoint exercise_revised_rate;

select pg_temp.sign_in('ab000000-0000-4000-8000-000000000002');
select set_config('qa.pod2',pg_temp.phone_upload(gen_random_uuid(),'TEST - RR-POD-TEST-042 - Elkhart IN - Delivery 2 - Signed: Test Receiver')::text,true);
-- A lost acknowledgement quarantines the attempt until the owning office records evidence.
set local role service_role;
do $$declare message jsonb:=public.rr_pod_mail_claim();
begin
  assert message->>'document_id'=current_setting('qa.pod2');
  assert public.rr_pod_mail_advance((message->>'document_id')::uuid,(message->>'claim_id')::uuid,'sending');
end $$;
reset role;
update rr_lease_private.pod_mail_outbox set lease_until=now()-interval '1 minute' where document_id=current_setting('qa.pod2')::uuid;
set local role service_role;
do $$begin assert public.rr_pod_mail_claim() is null,'Uncertain provider acceptance resubmitted a notice'; end $$;
set local role authenticated;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000003');
do $$begin
  assert not public.rr_lease_pod_mail_reconcile(current_setting('qa.pod2')::uuid,true,'Cross-carrier reference');
end $$;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000001');
do $$
declare doc uuid:=current_setting('qa.pod2')::uuid; load_id uuid:=current_setting('qa.load')::uuid; draft jsonb;
begin
  assert public.rr_lease_pod_mail_reconcile(doc,true,'Fixture provider receipt confirmed by owner');
  assert not public.rr_lease_pod_mail_reconcile(doc,false,'Stale second reviewer');
  perform public.rr_lease_step2b_review_pod(doc,true,true,'Reviewed final signed Elkhart delivery');
  perform public.rr_lease_pod_cover_delivery(load_id,2,2,doc);
  draft:=public.rr_lease_pod_invoice_drafts(p_load_id=>load_id)->0;
  assert draft->>'draft_id'=current_setting('qa.draft') and draft->>'pod_count'='2';
  assert draft->>'status'='pending_review','Actual delivery was never finalized';
end $$;
set local role service_role;
select public.rr_lease_finalize_delivery(current_setting('qa.load')::uuid,current_setting('qa.pod2')::uuid,current_date,true);
set local role authenticated;
do $$declare draft jsonb:=public.rr_lease_pod_invoice_drafts(p_load_id=>current_setting('qa.load')::uuid)->0;
begin
  assert draft->>'status'='ready' and draft->>'draft_id'=current_setting('qa.draft');
end $$;
reset role;
do $$begin
  assert not exists(select from public.rr_lease_factoring where load_id=current_setting('qa.load')::uuid),'Ready triggered a send';
end $$;

-- The real outgoing claim must also remain blocked on a ready staging draft.
set local role service_role;
do $$
declare packet uuid:=pg_temp.attach('invoice','TEST archive packet');
begin
  perform set_config('qa.archive',packet::text,true);
  begin
    perform public.rr_lease_claim_factoring(current_setting('qa.load')::uuid,packet,'TEST-042',320000,
      current_setting('qa.rate')::uuid,array[current_setting('qa.pod2')::uuid]);
    assert false,'Staging issued a live FirstLine send claim';
  exception when sqlstate '55000' then null; end;
end $$;

-- Reproduce a historical packet that had already been sent before enrollment.
-- This only records fake provider data inside the rollback-only database fixture.
reset role;
delete from rr_lease_private.pod_workflow_carriers where carrier_user_id='ab000000-0000-4000-8000-000000000001';
set local role service_role;
do $$declare result jsonb;
begin
  result:=public.rr_lease_claim_factoring(current_setting('qa.load')::uuid,current_setting('qa.archive')::uuid,
    'TEST-042',320000,current_setting('qa.rate')::uuid,array[current_setting('qa.pod2')::uuid]);
  assert result->>'send'='true';
  perform public.rr_lease_finish_factoring((result->>'claim_id')::uuid,'sent','Local synthetic fixture acknowledgement');
end $$;
reset role;
insert into rr_lease_private.pod_workflow_carriers(carrier_user_id)
values ('ab000000-0000-4000-8000-000000000001');
select set_config('qa.packet',(select to_jsonb(f)::text from public.rr_lease_factoring f where load_id=current_setting('qa.load')::uuid),true);
set local role authenticated;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000002');
do $$
declare load_id uuid:=current_setting('qa.load')::uuid; key uuid:=gen_random_uuid(); original bytea:=pg_temp.proof('TEST late signed receipt');
  corrected jsonb; replay jsonb;
begin
  corrected:=public.rr_lease_pod_addendum(load_id,key,'late.pdf','application/pdf',encode(original,'base64'),encode(sha256(original),'hex'));
  replay:=public.rr_lease_pod_addendum(load_id,key,'late.pdf','application/pdf',encode(original,'base64'),encode(sha256(original),'hex'));
  assert corrected->>'review_status'='CORRECTION_REVIEW' and corrected->>'documentId'=replay->>'documentId';
  perform set_config('qa.addendum',corrected->>'documentId',true);
end $$;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000001');
do $$declare original jsonb:=public.rr_lease_pod_workflow_original(current_setting('qa.addendum')::uuid,0);
begin
  assert decode(original->>'base64','base64')=pg_temp.proof('TEST late signed receipt');
  assert original->>'sha256'=encode(sha256(pg_temp.proof('TEST late signed receipt')),'hex');
end $$;
reset role;
do $$begin
  assert (select count(*)=1 from rr_lease_private.pod_invoice_drafts where load_id=current_setting('qa.load')::uuid);
  assert (select count(*)=3 from rr_lease_private.pod_mail_outbox where load_id=current_setting('qa.load')::uuid);
  assert (select count(*)=2 from rr_lease_private.pod_mail_outbox where load_id=current_setting('qa.load')::uuid and status='accepted');
  assert (select to_jsonb(f) = current_setting('qa.packet')::jsonb from public.rr_lease_factoring f where load_id=current_setting('qa.load')::uuid);
end $$;
-- Disabling the carrier keeps the old signed upload behavior and creates no office work or notices.
delete from rr_lease_private.pod_workflow_carriers where carrier_user_id='ab000000-0000-4000-8000-000000000001';
insert into public.rr_lease_loads(id,operator_id,broker_name,load_number,status)
values ('ad000000-0000-4000-8000-000000000043','ac000000-0000-4000-8000-000000000001','Demo Freight','DISABLED-043','assigned');
select set_config('qa.load','ad000000-0000-4000-8000-000000000043',true);
set local role authenticated;
select pg_temp.sign_in('ab000000-0000-4000-8000-000000000002');
do $$declare original bytea:=pg_temp.proof('TEST disabled carrier original'); reservation jsonb; result jsonb;
begin
  reservation:=public.rr_lease_step2b_create_upload(gen_random_uuid(),current_setting('qa.load')::uuid,null,null,
    'disabled.pdf','application/pdf',octet_length(original));
  result:=public.rr_lease_step2b_commit_upload((reservation->>'uploadId')::uuid,encode(original,'base64'),
    encode(sha256(original),'hex'),'application/pdf');
  assert result->>'loadId'=current_setting('qa.load');
end $$;
reset role;
do $$begin
  assert not exists(select from rr_lease_private.pod_invoice_drafts where load_id=current_setting('qa.load')::uuid);
  assert not exists(select from rr_lease_private.pod_mail_outbox where load_id=current_setting('qa.load')::uuid);
end $$;
rollback;
