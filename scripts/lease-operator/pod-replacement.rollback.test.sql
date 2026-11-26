-- Run only on a disposable, empty DB with all Phase 1 + Step 2A migrations.
-- psql -v ON_ERROR_STOP=1 -f scripts/lease-operator/pod-replacement.rollback.test.sql
begin;
do $test$
declare
  v_owner uuid:=gen_random_uuid(); v_driver uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid();
  v_op uuid; v_week date:=date_trunc('week',current_timestamp at time zone 'America/Chicago')::date;
  v_delivery date:=(current_timestamp at time zone 'America/Chicago')::date;
  v_settlement uuid; v_load uuid; v_entry uuid; v_ea uuid; v_eb uuid;
  v_rate uuid:=gen_random_uuid(); v_a uuid:=gen_random_uuid(); v_b uuid:=gen_random_uuid();
  v_c uuid:=gen_random_uuid(); v_packet uuid:=gen_random_uuid();
  v_rate_bytes bytea:=convert_to('%PDF-1.4 synthetic rate','UTF8');
  v_a_bytes bytea:=convert_to('%PDF-1.4 synthetic POD A','UTF8');
  v_b_bytes bytea:=convert_to('%PDF-1.4 synthetic POD B','UTF8');
  v_c_bytes bytea:=convert_to('%PDF-1.4 synthetic POD C','UTF8');
  v_packet_bytes bytea:=convert_to('%PDF-1.4 synthetic packet','UTF8');
  v_doc uuid; v_bytes bytea; v_first timestamptz; v_ref text;
  v_result jsonb; v_reject jsonb; v_denied boolean; v_n bigint; v_i int;
  v_l public.rr_lease_loads;
begin
  if exists(select 1 from public.rr_lease_operators) or exists(select 1 from public.rr_lease_loads)
    or exists(select 1 from auth.users) then raise exception 'Fresh disposable database required'; end if;
  insert into auth.users(id,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(v_owner,'authenticated','authenticated','{}','{}',now(),now()),
          (v_driver,'authenticated','authenticated','{}','{}',now(),now()),
          (v_other,'authenticated','authenticated','{}','{}',now(),now());
  insert into public.rr_lease_operators(carrier_user_id,driver_user_id,company_name,driver_name,pay_weekday,workspace_kind)
    values(v_owner,v_driver,'STEP2A rollback fixture','Synthetic driver',4,'leased') returning id into v_op;
  execute 'set local role service_role';
  insert into public.rr_lease_settlements(operator_id,week_start) values(v_op,v_week) returning id into v_settlement;
  insert into public.rr_lease_loads(operator_id,broker_name,load_number,status,settlement_id,gross_cents)
    values(v_op,'Synthetic broker','STEP2A-'||gen_random_uuid()::text,'assigned',v_settlement,120000) returning id into v_load;
  insert into public.rr_lease_documents(id,load_id,kind,file_name,mime_type,byte_size,sha256,storage_backend,storage_path)
    values(v_rate,v_load,'ratecon','rate.pdf','application/pdf',octet_length(v_rate_bytes),encode(sha256(v_rate_bytes),'hex'),'database',v_op::text||'/'||v_load::text||'/'||v_rate::text),
          (v_a,v_load,'pod','a.pdf','application/pdf',octet_length(v_a_bytes),encode(sha256(v_a_bytes),'hex'),'database',v_op::text||'/'||v_load::text||'/'||v_a::text);
  for v_doc,v_bytes in select * from (values(v_rate,v_rate_bytes),(v_a,v_a_bytes)) as originals(id,bytes) loop
    perform public.rr_lease_put_chunk(v_doc,0,encode(v_bytes,'base64'));
    perform public.rr_lease_finish_original(v_doc);
  end loop;
  update public.rr_lease_documents set is_current=true,operator_visible=true where id=v_rate;
  insert into public.rr_lease_mail_events(carrier_user_id,load_id,document_id,message_id,source_kind,sha256,verified_for_billing,evidence)
    values(v_owner,v_load,v_rate,'step2a:rate','owner_upload',encode(sha256(v_rate_bytes),'hex'),true,'Synthetic verified rate confirmation');

  execute 'reset role';
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver,'role','authenticated','aud','authenticated')::text,true);
  execute 'set local role authenticated';
  if auth.uid() is distinct from v_driver then raise exception 'Wrong driver claim'; end if;
  v_result:=public.rr_lease_register_driver_pod(v_a);
  v_ea:=(v_result->>'event_id')::uuid; v_first:=(v_result->>'received_at')::timestamptz;
  if v_result->>'review_status' is distinct from 'PENDING' then raise exception 'A must start pending'; end if;
  v_denied:=false; begin perform public.rr_lease_reject_driver_pod(v_a,'driver self rejection'); exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Driver self rejection allowed'; end if;
  v_denied:=false; begin perform public.rr_lease_approve_driver_pod(v_a,'driver self approval'); exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Driver self approval allowed'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  execute 'set local role service_role';
  perform public.rr_lease_finalize_delivery(v_load,v_a,v_delivery,true,v_first,'step2a:first-receipt');
  select pod_receipt_reference into strict v_ref from public.rr_lease_loads where id=v_load;
  select e.id into strict v_entry from public.rr_lease_ledger_entries e where e.load_id=v_load and e.status='DRAFT';
  if rr_lease_private.phase1_load_eligible(v_load) then raise exception 'Pending A must be ineligible'; end if;
  raise notice 'PASS A pending/finalized, DRAFT, self review denied';

  execute 'reset role';
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_other,'role','authenticated','aud','authenticated')::text,true);
  execute 'set local role authenticated';
  v_denied:=false; begin perform public.rr_lease_reject_driver_pod(v_a,'unrelated user'); exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Unrelated user rejected A'; end if;
  v_denied:=false; begin perform public.rr_lease_approve_driver_pod(v_a,'unrelated user'); exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Unrelated user approved A'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aud','authenticated')::text,true);
  execute 'set local role authenticated';
  v_reject:=public.rr_lease_reject_driver_pod(v_a,'Signature missing');
  if v_reject->>'review_status' is distinct from 'REJECTED' or (v_reject->>'eligible')::boolean is distinct from false then raise exception 'A rejection failed'; end if;
  if public.rr_lease_reject_driver_pod(v_a,'Signature missing') is distinct from v_reject then raise exception 'Reject replay changed state'; end if;
  v_denied:=false; begin perform public.rr_lease_approve_driver_pod(v_a,'Try approval'); exception when raise_exception then if sqlerrm not like 'Rejected POD cannot be approved%' then raise; end if; v_denied:=true; end;
  if not v_denied then raise exception 'Rejected A was approved'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  execute 'set local role service_role';
  -- B is uploaded only after the owner has rejected A. C and packet are for
  -- the later lock tests. No email or actual factoring/payment is performed.
  insert into public.rr_lease_documents(id,load_id,kind,file_name,mime_type,byte_size,sha256,storage_backend,storage_path)
    values(v_b,v_load,'pod','b.pdf','application/pdf',octet_length(v_b_bytes),encode(sha256(v_b_bytes),'hex'),'database',v_op::text||'/'||v_load::text||'/'||v_b::text),
          (v_c,v_load,'pod','c.pdf','application/pdf',octet_length(v_c_bytes),encode(sha256(v_c_bytes),'hex'),'database',v_op::text||'/'||v_load::text||'/'||v_c::text),
          (v_packet,v_load,'invoice','packet.pdf','application/pdf',octet_length(v_packet_bytes),encode(sha256(v_packet_bytes),'hex'),'database',v_op::text||'/'||v_load::text||'/'||v_packet::text);
  for v_doc,v_bytes in select * from (values(v_b,v_b_bytes),(v_c,v_c_bytes),(v_packet,v_packet_bytes)) as originals(id,bytes) loop
    perform public.rr_lease_put_chunk(v_doc,0,encode(v_bytes,'base64'));
    perform public.rr_lease_finish_original(v_doc);
  end loop;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_other,'role','authenticated','aud','authenticated')::text,true);
  execute 'set local role authenticated';
  v_denied:=false; begin perform public.rr_lease_register_driver_pod(v_b); exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Unrelated user registered B'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver,'role','authenticated','aud','authenticated')::text,true);
  execute 'set local role authenticated';
  v_result:=public.rr_lease_register_driver_pod(v_a);
  if v_result->>'review_status' is distinct from 'REJECTED' or (v_result->>'event_id')::uuid is distinct from v_ea or (v_result->>'received_at')::timestamptz is distinct from v_first then raise exception 'Rejected A replay changed provenance'; end if;
  v_result:=public.rr_lease_register_driver_pod(v_b); v_eb:=(v_result->>'event_id')::uuid;
  if v_result->>'review_status' is distinct from 'PENDING' then raise exception 'B approved on upload'; end if;
  if public.rr_lease_register_driver_pod(v_b) is distinct from v_result then raise exception 'B registration replay changed state'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  execute 'set local role service_role';
  select * into strict v_l from public.rr_lease_loads where id=v_load;
  if v_l.final_pod_id is distinct from v_a or v_l.pod_received_at is distinct from v_first or rr_lease_private.phase1_load_eligible(v_load) then raise exception 'B upload changed final pointer or receipt'; end if;
  if exists(select 1 from public.rr_lease_ledger_entries where load_id=v_load and status='POSTED') then raise exception 'Posted before B approval'; end if;
  v_denied:=false; begin perform public.rr_lease_finalize_delivery(v_load,v_a,v_delivery,true,v_first,'step2a:first-receipt'); exception when raise_exception then if sqlerrm not like 'Verified matched final POD%' then raise; end if; v_denied:=true; end;
  if not v_denied then raise exception 'Rejected A re-finalized'; end if;
  v_denied:=false; begin update public.rr_lease_documents set is_current=true where id=v_a; exception when raise_exception then if sqlerrm<>'Rejected POD cannot become current' then raise; end if; v_denied:=true; end;
  if not v_denied then raise exception 'Rejected A reactivated'; end if;
  v_denied:=false; begin update public.rr_lease_loads set final_pod_id=v_b where id=v_load; exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Unapproved B became final'; end if;
  raise notice 'PASS A rejected, replay immutable; B pending; no early posting or pointer changes; cross-user denied';

  execute 'reset role';
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aud','authenticated')::text,true);
  execute 'set local role authenticated';
  v_result:=public.rr_lease_approve_driver_pod(v_b,'Signed replacement reviewed');
  if (v_result->>'final_pod_id')::uuid is distinct from v_b or (v_result->>'replaced_pod_id')::uuid is distinct from v_a or (v_result->>'eligible')::boolean is distinct from true then raise exception 'B approval failed: %',v_result; end if;
  v_result:=public.rr_lease_approve_driver_pod(v_b,'Signed replacement reviewed');
  if (v_result->>'final_pod_id')::uuid is distinct from v_b or v_result->>'replaced_pod_id' is not null then raise exception 'Approval replay changed pointer'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  execute 'set local role service_role';
  select * into strict v_l from public.rr_lease_loads where id=v_load;
  if v_l.final_pod_id is distinct from v_b or v_l.pod_received_at is distinct from v_first or v_l.pod_receipt_reference is distinct from v_ref
    or v_l.required_docs_submitted_at is distinct from v_first or v_l.payment_deadline is distinct from (v_first at time zone 'America/Chicago')::date+15 then raise exception 'Receipt, deadline or final pointer corrupted'; end if;
  if not exists(select 1 from public.rr_lease_mail_events e where e.id=v_ea and e.rejected_by=v_owner and e.rejected_at is not null and e.rejection_reason='Signature missing' and not e.verified_for_billing)
    or not exists(select 1 from public.rr_lease_mail_events e where e.id=v_eb and e.approved_by=v_owner and e.verified_for_billing and e.rejected_at is null) then raise exception 'Review provenance missing'; end if;
  if not public.rr_lease_original_ready(v_a) or decode(public.rr_lease_read_original_chunk(v_a,0),'base64') is distinct from v_a_bytes
    or not exists(select 1 from public.rr_lease_documents d where d.id=v_a and not d.is_current and d.is_ready and d.sha256=encode(sha256(v_a_bytes),'hex')) then raise exception 'A original changed/lost'; end if;
  select count(*) into v_n from public.rr_lease_ledger_entries where load_id=v_load;
  if v_n<>1 or not exists(select 1 from public.rr_lease_ledger_entries e where e.id=v_entry and e.load_id=v_load and e.status='POSTED' and e.source_document_id=v_b and e.amount_cents=120000 and e.driver_effect_cents=110400) then raise exception 'Ledger duplicated or B not posted'; end if;
  raise notice 'PASS A rejected -> B registered -> approved -> final B; original A bytes and earliest receipt/deadline preserved; one same-ID ledger row POSTED, gross 120000 cents, driver 110400 cents';

  -- Factoring claim inside a rolled-back subtransaction. No external send.
  begin
    v_result:=public.rr_lease_claim_factoring(v_load,v_packet,'STEP2A-'||gen_random_uuid()::text,120000,v_rate,array[v_b]);
    if (v_result->>'send')::boolean is distinct from true then raise exception 'Synthetic claim not created'; end if;
    v_denied:=false; begin update public.rr_lease_loads set final_pod_id=v_a where id=v_load; exception when raise_exception then if sqlerrm not like 'Open unfactored load required%' then raise; end if; v_denied:=true; end;
    if not v_denied then raise exception 'Factored pointer editable'; end if;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub',v_driver::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver,'role','authenticated','aud','authenticated')::text,true);
    execute 'set local role authenticated';
    v_denied:=false; begin perform public.rr_lease_register_driver_pod(v_c); exception when raise_exception then if sqlerrm not like 'Open unfactored load required%' then raise; end if; v_denied:=true; end;
    if not v_denied then raise exception 'Factored registration allowed'; end if;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aud','authenticated')::text,true);
    execute 'set local role authenticated';
    v_denied:=false; begin perform public.rr_lease_approve_driver_pod(v_b,'Factored approval'); exception when raise_exception then if sqlerrm not like 'Open unfactored load required%' then raise; end if; v_denied:=true; end;
    if not v_denied then raise exception 'Factored approval allowed'; end if;
    v_denied:=false; begin perform public.rr_lease_reject_driver_pod(v_b,'Factored reject'); exception when raise_exception then if sqlerrm not like 'Open unfactored load required%' then raise; end if; v_denied:=true; end;
    if not v_denied then raise exception 'Factored rejection allowed'; end if;
    execute 'reset role';
    raise exception using errcode='PT999',message='rollback factoring fixture';
  exception when sqlstate 'PT999' then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  execute 'set local role service_role';
  if exists(select 1 from public.rr_lease_factoring where load_id=v_load) then raise exception 'Factoring fixture not rolled back'; end if;
  raise notice 'PASS factored load rejects pointer, registration, approval and rejection';

  insert into public.rr_lease_cost_reviews(settlement_id,kind,outcome,evidence_reference)
    values(v_settlement,'insurance','none','synthetic review'),(v_settlement,'fuel','none','synthetic review'),(v_settlement,'eld','none','synthetic review');
  update public.rr_lease_settlements set status='issued' where id=v_settlement;
  for v_i in 1..2 loop
    if v_i=2 then update public.rr_lease_settlements set status='paid',paid_at=clock_timestamp(),payment_reference='synthetic no payment',payment_amount_cents=110400 where id=v_settlement; end if;
    v_denied:=false; begin update public.rr_lease_loads set final_pod_id=v_a where id=v_load; exception when raise_exception then if sqlerrm not like 'Open unfactored load required%' then raise; end if; v_denied:=true; end;
    if not v_denied then raise exception 'Locked pointer editable'; end if;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub',v_driver::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver,'role','authenticated','aud','authenticated')::text,true);
    execute 'set local role authenticated';
    v_denied:=false; begin perform public.rr_lease_register_driver_pod(v_c); exception when raise_exception then if sqlerrm not like 'Open unfactored load required%' then raise; end if; v_denied:=true; end;
    if not v_denied then raise exception 'Locked registration allowed'; end if;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aud','authenticated')::text,true);
    execute 'set local role authenticated';
    v_denied:=false; begin perform public.rr_lease_approve_driver_pod(v_b,'Locked approval'); exception when raise_exception then if sqlerrm not like 'Open unfactored load required%' then raise; end if; v_denied:=true; end;
    if not v_denied then raise exception 'Locked approval allowed'; end if;
    v_denied:=false; begin perform public.rr_lease_reject_driver_pod(v_b,'Locked rejection'); exception when raise_exception then if sqlerrm not like 'Open unfactored load required%' then raise; end if; v_denied:=true; end;
    if not v_denied then raise exception 'Locked rejection allowed'; end if;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
    execute 'set local role service_role';
    raise notice 'PASS % settlement rejects pointer, registration, approval and rejection',case when v_i=1 then 'ISSUED' else 'PAID' end;
  end loop;
  execute 'reset role';
  if has_function_privilege('anon','public.rr_lease_reject_driver_pod(uuid,text)','EXECUTE')
     or has_function_privilege('service_role','public.rr_lease_reject_driver_pod(uuid,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.rr_lease_reject_driver_pod(uuid,text)','EXECUTE') then raise exception 'Wrong reject RPC grants'; end if;
  raise notice 'PASS restricted reject RPC grants';
end $test$;
rollback;
do $after$
begin
  if exists(select 1 from public.rr_lease_operators) or exists(select 1 from public.rr_lease_loads)
    or exists(select 1 from public.rr_lease_ledger_entries) or exists(select 1 from public.rr_lease_mail_events)
    or exists(select 1 from public.rr_lease_settlements) or exists(select 1 from public.rr_lease_documents)
    or exists(select 1 from public.rr_lease_factoring) or exists(select 1 from auth.users)
    or exists(select 1 from rr_lease_private.document_chunks) then raise exception 'Rollback leaked fixture data'; end if;
  raise notice 'PASS rollback: zero fixture rows remain';
end $after$;
