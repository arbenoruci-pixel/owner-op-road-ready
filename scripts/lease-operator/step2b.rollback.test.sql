-- Run only on isolated test DB with Phase 1, Step 2A, and Step 2B.
begin;
do $test$
declare
 v_owner uuid:=gen_random_uuid(); v_d1 uuid:=gen_random_uuid(); v_d2 uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid();
 v_op uuid; v_op2 uuid; v_carrier uuid; v_other_carrier uuid; v_load uuid; v_second uuid; v_rate_load uuid;
 v_req uuid:=gen_random_uuid(); v_intent uuid; v_b_intent uuid; v_c_intent uuid; v_doc uuid; v_b uuid; v_c uuid;
 v_bytes bytea:=convert_to('%PDF-1.4 test A','UTF8'); v_b_bytes bytea:=convert_to('%PDF-1.4 test B','UTF8');
 v_c_bytes bytea:=convert_to('%PDF-1.4 intermediate','UTF8');
 v_hash text:=encode(sha256(v_bytes),'hex'); v_json jsonb; v_replay jsonb; v_denied boolean;
 v_receipt timestamptz; v_ref text; v_rate uuid:=gen_random_uuid(); v_packet uuid:=gen_random_uuid();
 v_rate_bytes bytea:=convert_to('%PDF-1.4 confirmed RC','UTF8'); v_packet_bytes bytea:=convert_to('%PDF-1.4 synthetic invoice','UTF8');
 v_original bytea; v_id uuid; v_week date:=date_trunc('week',now() at time zone 'America/Chicago')::date;
 v_settlement uuid; v_count bigint; v_before bigint;
begin
 if exists(select 1 from public.rr_lease_operators) or exists(select 1 from auth.users) then raise exception 'Disposable empty DB only'; end if;
 insert into auth.users(id,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 (v_owner,'authenticated','authenticated','{}','{}',now(),now()),(v_d1,'authenticated','authenticated','{}','{}',now(),now()),(v_d2,'authenticated','authenticated','{}','{}',now(),now()),(v_other,'authenticated','authenticated','{}','{}',now(),now());
 insert into public.rr_lease_operators(carrier_user_id,company_name,driver_name,workspace_kind,share_bps) values(v_owner,'Synthetic carrier','Synthetic owner','carrier',10000) returning id into v_carrier;
 insert into public.rr_lease_operators(carrier_user_id,company_name,driver_name,workspace_kind,share_bps) values(v_other,'Other carrier','Other owner','carrier',10000) returning id into v_other_carrier;
 insert into public.rr_lease_operators(carrier_user_id,driver_user_id,company_name,driver_name,workspace_kind) values(v_owner,v_d1,'Driver 1','Driver 1','leased') returning id into v_op;
 insert into public.rr_lease_operators(carrier_user_id,driver_user_id,company_name,driver_name,workspace_kind) values(v_owner,v_d2,'Driver 2','Driver 2','leased') returning id into v_op2;
 insert into rr_lease_private.operator_invites(operator_id,email) values(v_op,'driver1@example.invalid'),(v_op2,'driver2@example.invalid');
 insert into public.rr_lease_loads(operator_id,broker_name,load_number,status) values(v_op2,'Synthetic broker','DRIVER2','assigned') returning id into v_second;
 insert into rr_lease_private.intake_review(carrier_user_id,source_ref,attachment_ref,reason) values(v_owner,'gmail:test','part-1','Shared fuel, owner assignment required'),(v_other,'gmail:other','part-1','Other carrier only');

 perform set_config('request.jwt.claim.sub',v_d1::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_d1,'role','authenticated','aud','authenticated')::text,true);
 execute 'set local role authenticated';
 v_denied:=false;begin perform public.rr_lease_step2b_create_upload(gen_random_uuid(),v_second,null,null,'a.pdf','application/pdf',octet_length(v_bytes));exception when insufficient_privilege then v_denied:=true;end;if not v_denied then raise exception 'Cross driver create permitted';end if;
 v_json:=public.rr_lease_step2b_create_upload(v_req,null,'Synthetic broker','ORPHAN1','a.pdf','application/pdf',octet_length(v_bytes));
 v_intent:=(v_json->>'uploadId')::uuid;
 if v_json is distinct from public.rr_lease_step2b_create_upload(v_req,null,'Synthetic broker','ORPHAN1','a.pdf','application/pdf',octet_length(v_bytes)) then raise exception 'Create not idempotent';end if;
 execute 'reset role';
 if exists(select 1 from public.rr_lease_loads where operator_id=v_op) then raise exception 'Reservation created orphan before commit';end if;
 perform set_config('request.jwt.claim.sub',v_d2::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',v_d2,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v_denied:=false;begin perform public.rr_lease_step2b_commit_upload(v_intent,encode(v_bytes,'base64'),v_hash,'application/pdf');exception when insufficient_privilege then v_denied:=true;end;if not v_denied then raise exception 'Cross driver commit permitted';end if;
 execute 'reset role';
 -- Revoke membership after reservation. Commit must recheck it inside the transaction.
 update public.rr_lease_operators set driver_user_id=null where id=v_op;
 perform set_config('request.jwt.claim.sub',v_d1::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',v_d1,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v_denied:=false;begin perform public.rr_lease_step2b_commit_upload(v_intent,encode(v_bytes,'base64'),v_hash,'application/pdf');exception when insufficient_privilege then v_denied:=true;end;if not v_denied then raise exception 'Revoked membership permitted commit';end if;
 execute 'reset role';update public.rr_lease_operators set driver_user_id=v_d1 where id=v_op;
 execute 'set local role authenticated';
 v_denied:=false;begin perform public.rr_lease_step2b_commit_upload(v_intent,encode(v_bytes,'base64'),repeat('0',64),'application/pdf');exception when invalid_parameter_value then v_denied:=true;end;if not v_denied then raise exception 'Forged hash accepted';end if;
 v_json:=public.rr_lease_step2b_commit_upload(v_intent,encode(v_bytes,'base64'),v_hash,'application/pdf');v_doc:=(v_json->>'documentId')::uuid;v_load:=(v_json->>'loadId')::uuid;
 if not (v_json->>'orphan')::boolean or v_json->>'review_status'<>'PENDING' then raise exception 'Missing orphan/pending result';end if;
 if v_json is distinct from public.rr_lease_step2b_commit_upload(v_intent,encode(v_bytes,'base64'),v_hash,'application/pdf') then raise exception 'Commit retry differs';end if;
 v_denied:=false;begin perform public.rr_lease_step2b_review_pod(v_doc,true,true,'driver self approval');exception when insufficient_privilege then v_denied:=true;end;if not v_denied then raise exception 'Driver self approve permitted';end if;
 v_denied:=false;begin perform public.rr_lease_step2b_owner_inbox(50,null);exception when insufficient_privilege then v_denied:=true;end;if not v_denied then raise exception 'Driver inbox permitted';end if;
 execute 'reset role';
 if not exists(select 1 from public.rr_lease_loads where id=v_load and operator_id=v_op and gross_cents is null and settlement_id is null and status='assigned' and final_pod_id is null) or exists(select 1 from public.rr_lease_ledger_entries where load_id=v_load) then raise exception 'Orphan financial contamination';end if;
 if (select count(*) from public.rr_lease_documents where load_id=v_load)<>1 or not exists(select 1 from rr_lease_private.intake_review where carrier_user_id=v_owner and source_ref='driver_upload:'||v_doc::text and attachment_ref=v_hash and resolved_at is null) then raise exception 'Orphan original/inbox missing';end if;
 select pod_received_at,pod_receipt_reference into v_receipt,v_ref from public.rr_lease_loads where id=v_load;
 raise notice 'PASS atomic membership/revocation, wrong driver, hash, orphan, receipt, idempotent retry, zero financial rows';

 -- Another carrier cannot see or assign the first carrier inbox.
 perform set_config('request.jwt.claim.sub',v_other::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',v_other,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v_json:=public.rr_lease_step2b_owner_inbox(50,null);
 if jsonb_array_length(v_json->'intake')<>1 or v_json->'intake'->0->>'source_ref'<>'gmail:other' or jsonb_array_length(v_json->'pods')<>0 then raise exception 'Cross carrier inbox exposed';end if;
 v_denied:=false;begin perform public.rr_lease_step2b_assign_draft('gmail:test','part-1',v_op,null,'fuel','wrong carrier');exception when insufficient_privilege then v_denied:=true;end;if not v_denied then raise exception 'Cross carrier assignment allowed';end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',v_owner::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v_json:=public.rr_lease_step2b_owner_inbox(50,null);
 if jsonb_array_length(v_json->'intake')<>2 or jsonb_array_length(v_json->'pods')<>1 then raise exception 'Owner inbox incorrect: %',v_json;end if;
 v_json:=public.rr_lease_step2b_assign_draft('gmail:test','part-1',v_op,null,'fuel','Exact transaction assigned; amount unverified');
 if v_json->>'status'<>'MATCHED_DRAFT' or (v_json->>'postAllowed')::boolean or (v_json->>'resolved')::boolean then raise exception 'Unsafe draft assignment';end if;
 v_denied:=false;begin perform public.rr_lease_step2b_assign_draft('driver_upload:'||v_doc::text,v_hash,v_op2,null,'pod','transfer');exception when insufficient_privilege then v_denied:=true;end;if not v_denied then raise exception 'Orphan transfer allowed';end if;
 v_json:=public.rr_lease_step2b_review_pod(v_doc,false,false,'Missing signature');
 if v_json->>'decision'<>'REJECT' then raise exception 'Reject failed';end if;
 execute 'reset role';
 if exists(select 1 from public.rr_lease_ledger_entries) then raise exception 'Assignment created financial row';end if;
 raise notice 'PASS owner-only inbox and assignment; orphan transfer blocked; all assignments remain draft';

 perform set_config('request.jwt.claim.sub',v_d1::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',v_d1,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v_b_intent:=(public.rr_lease_step2b_create_upload(gen_random_uuid(),v_load,null,null,'b.pdf','application/pdf',octet_length(v_b_bytes))->>'uploadId')::uuid;
 v_b:=(public.rr_lease_step2b_commit_upload(v_b_intent,encode(v_b_bytes,'base64'),encode(sha256(v_b_bytes),'hex'),'application/pdf')->>'documentId')::uuid;
 v_c_intent:=(public.rr_lease_step2b_create_upload(gen_random_uuid(),v_load,null,null,'stop.pdf','application/pdf',octet_length(v_c_bytes))->>'uploadId')::uuid;
 v_c:=(public.rr_lease_step2b_commit_upload(v_c_intent,encode(v_c_bytes,'base64'),encode(sha256(v_c_bytes),'hex'),'application/pdf')->>'documentId')::uuid;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',v_owner::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v_json:=public.rr_lease_step2b_review_pod(v_c,true,false,'Intermediate stop');
 if v_json->>'finalPodId' is not null or (v_json->>'setAsFinalPod')::boolean then raise exception 'Intermediate became final';end if;
 v_json:=public.rr_lease_step2b_review_pod(v_b,true,true,'Final delivery original');
 if (v_json->>'finalPodId')::uuid is distinct from v_b or (v_json->>'eligible')::boolean then raise exception 'Orphan final wrongly eligible';end if;
 v_replay:=public.rr_lease_step2b_review_pod(v_b,true,true,'Final delivery original');
 if v_json is distinct from v_replay then raise exception 'Review retry differs';end if;
 v_denied:=false;begin perform public.rr_lease_step2b_review_pod(v_c,true,true,'Change role');exception when unique_violation then v_denied:=true;end;if not v_denied then raise exception 'Intermediate role changed';end if;
 execute 'reset role';
 if not exists(select 1 from public.rr_lease_loads where id=v_load and final_pod_id=v_b and pod_received_at=v_receipt and pod_receipt_reference=v_ref and gross_cents is null) then raise exception 'Final or receipt mismatch';end if;
 if exists(select 1 from public.rr_lease_ledger_entries where load_id=v_load) then raise exception 'Orphan review posted revenue';end if;
 raise notice 'PASS rejected original retained; explicit intermediate/final; replay and role conflict; earliest receipt preserved';

 -- Separate staging classification; no financial data or ledger created.
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 execute 'set local role service_role';
 v_rate_load:=public.rr_lease_step2b_stage_ratecon(v_op,'Synthetic broker','ITEMIZED1','{"detention":true,"layover":false,"lumper":false}');
 if not exists(select 1 from public.rr_lease_loads where id=v_rate_load and ledger_mode='ITEMIZED' and status='staging' and gross_cents is null and settlement_id is null) then raise exception 'Staging not itemized';end if;
 -- Matched rate for orphan: explicit classification, independent source evidence.
 insert into public.rr_lease_documents(id,load_id,kind,file_name,mime_type,byte_size,sha256,storage_backend,storage_path) values
 (v_rate,v_load,'ratecon','rate.pdf','application/pdf',octet_length(v_rate_bytes),encode(sha256(v_rate_bytes),'hex'),'database',v_op::text||'/'||v_load::text||'/'||v_rate::text),
 (v_packet,v_load,'invoice','packet.pdf','application/pdf',octet_length(v_packet_bytes),encode(sha256(v_packet_bytes),'hex'),'database',v_op::text||'/'||v_load::text||'/'||v_packet::text);
 for v_id,v_original in select * from (values(v_rate,v_rate_bytes),(v_packet,v_packet_bytes)) x(id,bytes) loop
  perform public.rr_lease_put_chunk(v_id,0,encode(v_original,'base64'));perform public.rr_lease_finish_original(v_id);
 end loop;
 perform public.rr_lease_apply_intake(v_rate,'owner_upload','chat:synthetic-rate',null,'Synthetic independent evidence',jsonb_build_object('pickup_address','Origin','delivery_address','Destination','steps',jsonb_build_array(jsonb_build_object('title','Deliver','detail','Synthetic')),'gross_cents',120000,'accessorials','{"detention":false,"layover":false,"lumper":false}'::jsonb),null,true);
 perform public.rr_lease_finalize_delivery(v_load,v_b,(now() at time zone 'America/Chicago')::date,true,v_receipt,v_ref);
 if not rr_lease_private.phase1_load_eligible(v_load) or (select count(*) from public.rr_lease_ledger_entries where load_id=v_load and status='POSTED')<>1 then raise exception 'Independent verification did not produce one posting';end if;
 v_denied:=false;begin perform public.rr_lease_claim_factoring(v_load,v_packet,'TEST-PACKET',120000,v_rate,array[v_c]);exception when raise_exception then v_denied:=true;end;if not v_denied then raise exception 'Intermediate packet accepted';end if;
 v_denied:=false;begin perform public.rr_lease_claim_factoring(v_load,v_packet,'TEST-PACKET',120000,v_rate,array[v_doc]);exception when raise_exception then v_denied:=true;end;if not v_denied then raise exception 'Rejected packet accepted';end if;
 v_denied:=false;begin perform public.rr_lease_claim_factoring(v_load,v_packet,'TEST-PACKET',120000,v_rate,array[v_b,v_c]);exception when raise_exception then v_denied:=true;end;if not v_denied then raise exception 'Mixed packet accepted';end if;
 v_json:=public.rr_lease_claim_factoring(v_load,v_packet,'TEST-PACKET',120000,v_rate,array[v_b]);
 if not (v_json->>'send')::boolean then raise exception 'Valid final-only claim failed';end if;
 execute 'reset role';
 raise notice 'PASS staging ITEMIZED; verified final only claim; intermediate/rejected/mixed packet rejected; exactly one verified ledger posting';
 if has_function_privilege('authenticated','public.rr_lease_register_driver_pod(uuid)','EXECUTE') or has_function_privilege('authenticated','public.rr_lease_approve_driver_pod(uuid,text)','EXECUTE') or has_function_privilege('anon','public.rr_lease_step2b_commit_upload(uuid,text,text,text)','EXECUTE') or has_function_privilege('service_role','public.rr_lease_step2b_review_pod(uuid,boolean,boolean,text)','EXECUTE') then raise exception 'RPC bypass grant';end if;
 raise notice 'PASS private RPC grants and old bypass revoked';
end $test$;
rollback;
do $$begin
 if exists(select 1 from public.rr_lease_loads) or exists(select 1 from public.rr_lease_ledger_entries) or exists(select 1 from rr_lease_private.step2b_upload_intents) or exists(select 1 from rr_lease_private.step2b_pod_decisions) or exists(select 1 from rr_lease_private.step2b_assignment_drafts) or exists(select 1 from auth.users) then raise exception 'Rollback leaked test rows';end if;
 raise notice 'PASS Step 2B rollback zero rows';
end $$;
