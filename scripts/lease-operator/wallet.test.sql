-- Synthetic fixtures on a disposable local Supabase-compatible Postgres.
begin;
insert into auth.users(id,email) values
 ('da000000-0000-4000-8000-000000000001','wallet-carrier@example.test'),
 ('da000000-0000-4000-8000-000000000002','wallet-driver@example.test'),
 ('da000000-0000-4000-8000-000000000003','wallet-other@example.test');
insert into public.rr_lease_operators(id,carrier_user_id,driver_user_id,company_name,driver_name) values
 ('db000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000002','Test co','Driver A'),
 ('db000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000003','Test co','Driver B');
set local role service_role;
do $$
declare op uuid='db000000-0000-4000-8000-000000000001'; other_op uuid='db000000-0000-4000-8000-000000000002';
 first_doc uuid; renewal uuid; incomplete uuid; content bytea=convert_to('%PDF-1.4 synthetic A','UTF8'); hash text=encode(sha256(content),'hex');
begin
 perform public.rr_lease_wallet_require(op,'registration-17','Cab card',true,true,'test signed checklist');
 perform public.rr_lease_wallet_require(op,'inspection-17','Inspection',true,true,'test signed checklist');
 perform public.rr_lease_wallet_require(op,'old-permit','Old permit',true,false,'retired under reviewed checklist');
 first_doc:=public.rr_lease_wallet_begin(op,'registration-17','registration','Cab card','cab.pdf','application/pdf',length(content),hash,'mail:1:att1','VIN and verified assignment');
 assert first_doc=public.rr_lease_wallet_begin(op,'registration-17','registration','Cab card','copy.pdf','application/pdf',length(content),hash,'mail:1:att1','verified');
 begin
   perform public.rr_lease_wallet_begin(other_op,'registration-17','registration','Cab card','cab.pdf','application/pdf',length(content),hash,'mail:1:att1','replayed across owners');
   raise exception 'wrong operator accepted';
 exception when raise_exception then if sqlerrm not like 'This source attachment%' then raise; end if; end;
 begin perform public.rr_lease_wallet_finish(first_doc); raise exception 'incomplete accepted';
 exception when raise_exception then if sqlerrm not like 'Incomplete wallet%' then raise; end if; end;
 perform public.rr_lease_wallet_put_chunk(first_doc,0,encode(content,'base64'));
 assert first_doc=public.rr_lease_wallet_finish(first_doc);
 perform public.rr_lease_wallet_put_chunk(first_doc,0,encode(content,'base64'));
 begin perform public.rr_lease_wallet_put_chunk(first_doc,0,encode(set_byte(content,10,11),'base64')); raise exception 'changed original accepted';
 exception when raise_exception then if sqlerrm not like 'Conflicting wallet chunk%' then raise; end if; end;
 content:=convert_to('%PDF-1.7 replacement','UTF8'); hash:=encode(sha256(content),'hex');
 begin perform public.rr_lease_wallet_begin(op,'registration-17','registration','Cab card','new.pdf','application/pdf',length(content),hash,'mail:2:att1','renewed');
   raise exception 'unguarded replacement accepted';
 exception when raise_exception then if sqlerrm not like 'Review the current%' then raise; end if; end;
 renewal:=public.rr_lease_wallet_begin(op,'registration-17','registration','Cab card','new.pdf','application/pdf',length(content),hash,'mail:2:att1','renewed','2026-01-01','2026-12-31',first_doc);
 perform public.rr_lease_wallet_put_chunk(renewal,0,encode(content,'base64'));
 perform public.rr_lease_wallet_finish(renewal);
 assert (select is_current and revision=2 from public.rr_lease_wallet_documents where id=renewal);
 assert not (select is_current from public.rr_lease_wallet_documents where id=first_doc);
 assert first_doc=public.rr_lease_wallet_finish(first_doc);
 incomplete:=public.rr_lease_wallet_begin(op,'permit-other','permit','Permit','new.pdf','application/pdf',length(content),hash,'mail:3:att1','reviewed');
 perform set_config('rrqa.wallet_original',first_doc::text,true);
 perform set_config('rrqa.wallet_incomplete',incomplete::text,true);
end $$;
do $$
declare op uuid='db000000-0000-4000-8000-000000000001'; doc uuid; content bytea; receipt jsonb;
begin
 receipt:=jsonb_build_object('format','roadready-outlook-receipt-v1','source_ref','outlook:test:receipt:body',
   'message_id','fixture123','sender','support@mudflapinc.com','mailbox','nartaexpress@hotmail.com',
   'recipients',jsonb_build_array('nartaexpress@hotmail.com'),'received_at','2026-01-18T17:00:00Z','subject','Your Mudflap receipt for test',
   'body',jsonb_build_object('content_type','HTML','content','<p>test amount</p>'));
 content:=convert_to(receipt::text,'UTF8');
 doc:=public.rr_lease_wallet_begin(op,'mudflap:abc','fuel_receipt','Fuel','email-receipt.json','application/json',length(content),
   encode(sha256(content),'hex'),'outlook:test:receipt:body','Assigned truck and driver');
 perform public.rr_lease_wallet_put_chunk(doc,0,encode(content,'base64')); assert doc=public.rr_lease_wallet_finish(doc);
 receipt:=receipt||'{"sender":"unverified@example.test","source_ref":"outlook:test:forward:body"}'::jsonb;
 content:=convert_to(receipt::text,'UTF8');
 doc:=public.rr_lease_wallet_begin(op,'mudflap:forward','fuel_receipt','Fuel','email-receipt.json','application/json',length(content),
   encode(sha256(content),'hex'),'outlook:test:forward:body','Fixture forwarded subject');
 perform public.rr_lease_wallet_put_chunk(doc,0,encode(content,'base64'));
 begin perform public.rr_lease_wallet_finish(doc); raise exception 'Unverified sender accepted';
 exception when raise_exception then if sqlerrm not like 'Original Mudflap receipt%' then raise; end if; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"da000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$begin
 assert (select count(*)=3 from public.rr_lease_wallet_documents);
 assert (select count(slot_key)=2 from public.rr_lease_wallet_requirements);
 assert not has_column_privilege(current_user,'public.rr_lease_wallet_requirements','evidence_reference','select');
 assert decode(public.rr_lease_wallet_download_chunk(current_setting('rrqa.wallet_original')::uuid,0),'base64')=convert_to('%PDF-1.4 synthetic A','UTF8');
 assert not has_function_privilege(current_user,'public.rr_lease_wallet_finish(uuid)','execute');
 assert not has_table_privilege(current_user,'public.rr_lease_wallet_documents','update');
 begin perform public.rr_lease_wallet_download_chunk(current_setting('rrqa.wallet_incomplete')::uuid,0); raise exception 'incomplete bytes visible';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"da000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$begin
 assert not exists(select 1 from public.rr_lease_wallet_documents);
 assert not exists(select slot_key from public.rr_lease_wallet_requirements);
 begin perform public.rr_lease_wallet_download_chunk(current_setting('rrqa.wallet_original')::uuid,0); raise exception 'cross-driver original visible';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"da000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$begin assert (select count(*)=3 from public.rr_lease_wallet_documents); end $$;
set local role anon;
do $$begin
 assert not has_function_privilege(current_user,'public.rr_lease_wallet_download_chunk(uuid,integer)','execute');
 assert not has_table_privilege(current_user,'public.rr_lease_wallet_documents','select');
end $$;
rollback;
