-- Run only on a disposable local Postgres/Supabase fixture with both lease migrations.
begin;
insert into auth.users(id,email) values ('11111111-1111-4111-8111-111111111111','carrier@example.com');
insert into public.rr_lease_operators(id,carrier_user_id,company_name,driver_name) values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Company','Driver');
insert into rr_lease_private.operator_invites values('22222222-2222-4222-8222-222222222222','driver@example.com');
set role service_role;
do $$
declare
 op uuid:='22222222-2222-4222-8222-222222222222';
 l uuid; doc uuid; ids uuid[]:='{}'; v_content bytea;
 idx int; kind text; outcome jsonb; c uuid; w uuid;
 fields jsonb:='{"pickup_address":"Example A","delivery_address":"Example B","steps":[{"title":"Pickup","detail":"Ref 456"}],"gross_cents":250000}';
begin
 l:=public.rr_lease_stage_load(op,'Broker One','Ex1');
 assert l=public.rr_lease_stage_load(op,'broker one',' ex1 ');
 for idx in 1..5 loop
  doc:=gen_random_uuid();kind:=(array['ratecon','pod','pod','invoice','ratecon'])[idx];v_content:=convert_to('fixture '||idx,'UTF8');ids:=array_append(ids,doc);
  insert into public.rr_lease_documents(id,load_id,kind,file_name,storage_path,mime_type,byte_size,sha256)
  values(doc,l,kind,'test.pdf',op::text||'/'||l::text||'/'||doc::text,'application/pdf',length(v_content),encode(sha256(v_content),'hex'));
  perform public.rr_lease_put_chunk(doc,0,encode(v_content,'base64'));
  perform public.rr_lease_finish_original(doc);
 end loop;
 perform public.rr_lease_apply_mail(ids[1],'m1','broker@example.com','explicit assignment and original',fields);
 assert (select gross_cents from public.rr_lease_loads where id=l)=250000;
 assert public.rr_lease_apply_mail(ids[1],'m1','broker@example.com','repeat',fields)=ids[1];
 insert into public.rr_lease_settlements(operator_id,week_start) values(op,'2025-11-24') returning id into w;
 update public.rr_lease_loads set settlement_id=w where id=l;
 perform public.rr_lease_apply_mail(ids[5],'m5','broker@example.com','later authenticated revision',fields,ids[1]);
 assert not (select is_current from public.rr_lease_documents where id=ids[1]);
 begin perform public.rr_lease_apply_mail(ids[2],'wrong','external@example.com','test');raise exception 'bad send accepted';
 exception when raise_exception then if sqlerrm not like 'POD sender%' then raise; end if;end;
 perform public.rr_lease_apply_mail(ids[2],'m2','driver@example.com','Matching load but signature unclear');
 perform public.rr_lease_apply_mail(ids[3],'m3','driver@example.com','Matched corrected POD',p_verified_for_billing=>true);
 perform public.rr_lease_review_evidence(ids[3],'all pages + signature checked',ids[2]);
 assert (select status from public.rr_lease_loads where id=l)='assigned';
 begin perform public.rr_lease_finalize_delivery(l,ids[3],'2025-11-25',false);raise exception 'partial allowed';
 exception when raise_exception then if sqlerrm not like 'Final delivery and every%' then raise; end if;end;
 outcome:=public.rr_lease_finalize_delivery(l,ids[3],'2025-11-25',true);
 assert (outcome->>'settlement_id')::uuid=w and outcome->>'payment_deadline' is null;
 -- 01:30 UTC on Nov 27 was Nov 26 for the carrier's receipt clock.
 outcome:=public.rr_lease_finalize_delivery(l,ids[3],'2025-11-25',true,'2025-11-27T01:30:00Z','message-1');
 assert outcome->>'payment_deadline'='2025-12-11';
 outcome:=public.rr_lease_finalize_delivery(l,ids[3],'2025-11-25',true,'2025-11-28T01:30:00Z','same-docs-resent');
 assert outcome->>'payment_deadline'='2025-12-11';
 assert (select count(*) from public.rr_lease_settlements where operator_id=op)=1;
 outcome:=public.rr_lease_claim_factoring(l,ids[4],'QA-ONE',250000,ids[5],array[ids[3]]);
 assert (outcome->>'send')::boolean;
 c:=(outcome->>'claim_id')::uuid;
 assert not (public.rr_lease_claim_factoring(l,ids[4],'QA-ONE',250000,ids[5],array[ids[3]])->>'send')::boolean;
 assert public.rr_lease_finish_factoring(c,'uncertain','timeout')='uncertain';
 outcome:=public.rr_lease_retry_rejected(c,'synthetic provider definitive rejection');
 assert (outcome->>'send')::boolean;
 assert not (public.rr_lease_retry_rejected(c,'same rejection') ->> 'send')::boolean;
 c:=(outcome->>'claim_id')::uuid;
 assert public.rr_lease_finish_factoring(c,'sent','verified provider id')='sent';
 assert public.rr_lease_finish_factoring(c,'funded','verified statement')='funded';

 -- A late, different load for an issued week goes into an open catch-up week.
 insert into public.rr_lease_cost_reviews(settlement_id,kind,outcome,evidence_reference)
 select w,k,'none','fixture review' from unnest(array['fuel','insurance','eld']) k;
 update public.rr_lease_settlements set status='issued' where id=w;
 outcome:=public.rr_lease_finalize_delivery(l,ids[3],'2025-11-25',true,'2025-11-27T01:30:00Z','message-1');
 assert (outcome->>'settlement_id')::uuid=w;
 l:=public.rr_lease_stage_load(op,'Broker One','Ex2');
 doc:=gen_random_uuid();v_content:=convert_to('synthetic rate','UTF8');
 insert into public.rr_lease_documents(id,load_id,kind,file_name,storage_path,mime_type,byte_size,sha256)
 values(doc,l,'ratecon','test.pdf',op::text||'/'||l::text||'/'||doc::text,'application/pdf',length(v_content),encode(sha256(v_content),'hex'));
 perform public.rr_lease_put_chunk(doc,0,encode(v_content,'base64')); perform public.rr_lease_finish_original(doc);
 perform public.rr_lease_apply_mail(doc,'late-rate','broker@example.com','assigned',fields);
 doc:=gen_random_uuid();v_content:=convert_to('synthetic disputed final POD','UTF8');
 insert into public.rr_lease_documents(id,load_id,kind,file_name,storage_path,mime_type,byte_size,sha256)
 values(doc,l,'pod','test.pdf',op::text||'/'||l::text||'/'||doc::text,'application/pdf',length(v_content),encode(sha256(v_content),'hex'));
 perform public.rr_lease_put_chunk(doc,0,encode(v_content,'base64')); perform public.rr_lease_finish_original(doc);
 perform public.rr_lease_apply_mail(doc,'late-pod','driver@example.com','final delivery; discrepancy on POD');
 outcome:=public.rr_lease_finalize_delivery(l,doc,'2025-11-26',true,'2025-12-01T13:00Z','late-receipt');
 assert (outcome->>'catch_up')::boolean and (outcome->>'settlement_id')::uuid<>w;
 assert (outcome->>'week_start')::date=date_trunc('week',current_timestamp at time zone 'America/Chicago')::date;
 assert (outcome->>'actual_delivery_date')::date='2025-11-26'::date and outcome->>'payment_deadline'='2025-12-16';
 assert (select count(*) from public.rr_lease_loads where settlement_id=w)=1;
end $$;
reset role;
rollback;
