-- Disposable isolated PostgreSQL only. No real email, payments, or accounts.
begin;
do $test$
declare
 own uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); drv uuid:=gen_random_uuid(); drv2 uuid:=gen_random_uuid();
 op uuid; op2 uuid; other_op uuid; st uuid; v_load uuid; d uuid; w uuid; adj uuid;
 report_bytes bytea:=convert_to('synthetic report 1','UTF8'); report2 bytea:=convert_to('synthetic report 2','UTF8');
 f_bytes bytea:=convert_to('synthetic factoring 1','UTF8'); f2 bytea:=convert_to('synthetic factoring 2','UTF8');
 rc_bytes bytea:=convert_to('%PDF-1.4 synthetic RC','UTF8'); fuel_bytes bytea:=convert_to('%PDF-1.4 synthetic fuel','UTF8'); fuel2 bytea:=convert_to('%PDF-1.4 different receipt','UTF8');
 v_mailbox text:='fixture@example.invalid'; v_sr text; v_ar text; ref_rc jsonb; ref_fuel jsonb; ref_hold jsonb; ref_msg jsonb; ref_dup jsonb;
 start_at timestamptz:=date_trunc('hour',clock_timestamp())-interval '2 hours';
 end_at timestamptz:=date_trunc('hour',clock_timestamp())-interval '1 hour';
 received timestamptz:=date_trunc('hour',clock_timestamp())-interval '90 minutes';
 v_rows jsonb; v_result jsonb; v_replay jsonb; v_manifest jsonb; p jsonb; denied boolean; archive uuid; n bigint;
begin
 if current_database()<>'rr_step2a_audit' or exists(select 1 from auth.users) or exists(select 1 from public.rr_lease_operators) then raise exception 'Disposable empty DB required';end if;
 insert into auth.users(id,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 (own,'authenticated','authenticated','{}','{}',now(),now()),(other,'authenticated','authenticated','{}','{}',now(),now()),
 (drv,'authenticated','authenticated','{}','{}',now(),now()),(drv2,'authenticated','authenticated','{}','{}',now(),now());
 insert into public.rr_lease_operators(carrier_user_id,company_name,driver_name,workspace_kind,share_bps) values(own,'Fixture carrier','Owner','carrier',10000),(other,'Other carrier','Other','carrier',10000);
 insert into public.rr_lease_operators(carrier_user_id,driver_user_id,company_name,driver_name,workspace_kind) values(own,drv,'Fixture D1','Driver 1','leased') returning id into op;
 insert into public.rr_lease_operators(carrier_user_id,driver_user_id,company_name,driver_name,workspace_kind) values(own,drv2,'Fixture D2','Driver 2','leased') returning id into op2;
 insert into public.rr_lease_operators(carrier_user_id,company_name,driver_name,workspace_kind) values(other,'Other D','Other operator','leased') returning id into other_op;
 insert into rr_lease_private.carrier_intake_mailboxes values(own,v_mailbox);
 insert into public.rr_lease_settlements(operator_id,week_start) values(op,date_trunc('week',now() at time zone 'America/Chicago')::date) returning id into st;
 execute 'set local role service_role';
 denied:=false;begin perform public.rr_lease_step2c_import_report(drv,'amazon','csv',encode(report_bytes,'base64'),encode(sha256(report_bytes),'hex'),'[]','{}');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Driver as carrier permitted';end if;
 v_rows:='[{"trip":"TRIP-1","block":null,"load":null,"status":"COMPLETED","amount_cents":120000,"event_date":"2026-11-21"},{"trip":null,"block":null,"load":"LOAD-1","status":"PAID","amount_cents":50000,"event_date":"2026-11-21"}]';
 v_result:=public.rr_lease_step2c_import_report(own,'amazon','csv',encode(report_bytes,'base64'),encode(sha256(report_bytes),'hex'),v_rows,'{}');archive:=(v_result->>'archiveId')::uuid;
 if v_result#>>'{results,INSERTED}'<>'2' or (v_result->>'postAllowed')::boolean then raise exception 'Amazon insert failed: %',v_result;end if;
 v_replay:=public.rr_lease_step2c_import_report(own,'amazon','csv',encode(report_bytes,'base64'),encode(sha256(report_bytes),'hex'),v_rows,'{}');
 if not (v_replay->>'replay')::boolean or (v_replay->>'archiveId')::uuid<>archive then raise exception 'Report byte replay failed';end if;
 v_result:=public.rr_lease_step2c_import_report(own,'amazon','xlsx',encode(report2,'base64'),encode(sha256(report2),'hex'),v_rows,'{}');
 if v_result#>>'{results,DUPLICATE}'<>'2' or (v_result->>'archiveId')::uuid=archive then raise exception 'Canonical cross-format dedupe failed: %',v_result;end if;
 if (select count(*) from public.rr_lease_amazon_import_rows where carrier_user_id=own)<>2 or exists(select 1 from public.rr_lease_amazon_import_rows where carrier_user_id=own and (operator_id is not null or load_id is not null or verified_at is not null)) then raise exception 'Unverified Amazon report was assigned or verified';end if;
 v_rows:='[{"trip":null,"block":"B-1","load":null,"status":"PAID","amount_cents":10000,"event_date":"2026-11-21"},{"trip":"T-CHILD","block":"B-1","load":null,"status":"COMPLETED","amount_cents":10000,"event_date":"2026-11-21"}]';
 report2:=convert_to('synthetic block overlap','UTF8');
 v_result:=public.rr_lease_step2c_import_report(own,'amazon','csv',encode(report2,'base64'),encode(sha256(report2),'hex'),v_rows,'{}');
 if v_result#>>'{results,NEEDS_REVIEW}'<>'2' or exists(select 1 from public.rr_lease_amazon_import_rows where amazon_block_id='B-1') then raise exception 'Overlapping block/trips were admitted';end if;
 v_rows:='[{"trip":"trip-1","block":null,"load":null,"status":"PAID","amount_cents":120001,"event_date":"2026-11-21"}]';
 report2:=convert_to('synthetic conflict','UTF8');
 v_result:=public.rr_lease_step2c_import_report(own,'amazon','csv',encode(report2,'base64'),encode(sha256(report2),'hex'),v_rows,'{}');
 if v_result#>>'{results,NEEDS_REVIEW}'<>'1' or (select amount_cents from public.rr_lease_amazon_import_rows where carrier_user_id=own and amazon_trip_id='TRIP-1')<>120000 then raise exception 'Canonical conflict overwrote payout';end if;
 report2:=convert_to('synthetic invalid','UTF8');perform public.rr_lease_step2c_hold_report(own,'amazon','csv',encode(report2,'base64'),encode(sha256(report2),'hex'));
 perform public.rr_lease_step2c_import_report(other,'amazon','csv',encode(report_bytes,'base64'),encode(sha256(report_bytes),'hex'),'[{"trip":"TRIP-1","block":null,"load":null,"status":"COMPLETED","amount_cents":777,"event_date":"2026-11-21"}]','{}');
 if exists(select 1 from public.rr_lease_ledger_entries) then raise exception 'Amazon import created ledger';end if;
 raise notice 'PASS Amazon CSV/XLSX canonical cross-format dedupe, block overlap, amount conflict, standalone ID, held invalid report, no payout';
 
 v_rows:='[{"type":"REVERSAL","reference":"EV-R","invoice":"INV-X","reverses":"EV-D","event_at":"2026-11-26T12:00:00Z","amount_cents":2500}]';
 perform public.rr_lease_step2c_import_report(own,'firstline','csv',encode(f_bytes,'base64'),encode(sha256(f_bytes),'hex'),v_rows,'{}');
 if not exists(select 1 from public.rr_lease_factoring_events where carrier_user_id=own and external_reference='EV-R' and reverses_id is null and review_status='PENDING_PROOF') then raise exception 'Early reversal not pending';end if;
 v_rows:='[{"type":"INVOICE","reference":"EV-I","invoice":"INV-X","event_at":"2026-11-26T12:00:00Z","amount_cents":100000},{"type":"FUNDING","reference":"EV-F","invoice":"INV-X","event_at":"2026-11-26T12:00:00Z","amount_cents":97000},{"type":"FEE","reference":"EV-FEE","invoice":"INV-X","event_at":"2026-11-26T12:00:00Z","amount_cents":-3000},{"type":"DEBIT","reference":"EV-D","invoice":"INV-X","event_at":"2026-11-26T12:00:00Z","amount_cents":-2500},{"type":"CREDIT","reference":"EV-C","invoice":"INV-X","event_at":"2026-11-26T12:00:00Z","amount_cents":100},{"type":"REJECTION","reference":"EV-J","invoice":"INV-X","event_at":"2026-11-26T12:00:00Z","amount_cents":0}]';
 v_result:=public.rr_lease_step2c_import_report(own,'firstline','csv',encode(f2,'base64'),encode(sha256(f2),'hex'),v_rows,'{}');
 if v_result#>>'{results,INSERTED}'<>'6' then raise exception 'FirstLine events missing';end if;
 if (select count(*) from public.rr_lease_factoring_events where carrier_user_id=own)<>7 or exists(select 1 from public.rr_lease_factoring_events where carrier_user_id=own and (review_status<>'PENDING_PROOF' or operator_id is not null or load_id is not null))
 or not exists(select 1 from public.rr_lease_factoring_events r join public.rr_lease_factoring_events e on e.id=r.reverses_id where r.external_reference='EV-R' and e.external_reference='EV-D' and e.amount_cents=-r.amount_cents and r.carrier_user_id=own) then raise exception 'FirstLine reversal/proof isolation failed';end if;
 perform public.rr_lease_step2c_import_report(own,'firstline','csv',encode(f2,'base64'),encode(sha256(f2),'hex'),v_rows,'{}');
 if (select count(*) from public.rr_lease_factoring_events where carrier_user_id=own)<>7 or exists(select 1 from public.rr_lease_ledger_entries) or exists(select 1 from public.rr_lease_adjustments) then raise exception 'FirstLine duplication or debit created';end if;
 raise notice 'PASS seven private FirstLine event types, debit/rejection pending, reversal before original linked, exact replay and no driver adjustment';

 -- Source refs are canonical provider/mailbox/message and part IDs.
 v_sr:='gmail:'||encode(sha256(convert_to(v_mailbox||chr(31)||'M1','UTF8')),'hex');
 v_ar:=encode(sha256(convert_to('part:1','UTF8')),'hex');
 p:=jsonb_build_object('source','gmail','sourceRef',v_sr,'attachmentRef',v_ar,'kind','ratecon','sha256',encode(sha256(rc_bytes),'hex'),'amountCents',120000,'brokerRules',jsonb_build_object('detention','After 2h'),'status','DRAFT','requiresVerification',true);
 ref_rc:=public.rr_lease_step2c_record_mail(own,'gmail',v_mailbox,'M1','part:1',received,'fixture@example.invalid','rc.pdf','application/pdf',encode(rc_bytes,'base64'),encode(sha256(rc_bytes),'hex'),null,p,null);
 v_replay:=public.rr_lease_step2c_record_mail(own,'gmail',v_mailbox,'M1','part:1',received,'fixture@example.invalid','rc.pdf','application/pdf',encode(rc_bytes,'base64'),encode(sha256(rc_bytes),'hex'),null,p||'{"amountCents":999}'::jsonb,null);
 if not (v_replay->>'replay')::boolean then raise exception 'Mail replay did not retain original proposal';end if;
 v_ar:=encode(sha256(convert_to('part:2','UTF8')),'hex');
 p:=jsonb_build_object('source','gmail','sourceRef',v_sr,'attachmentRef',v_ar,'kind','fuel','sha256',encode(sha256(fuel_bytes),'hex'),'amountCents',4200,'brokerRules','{}'::jsonb,'status','DRAFT','requiresVerification',true);
 ref_fuel:=public.rr_lease_step2c_record_mail(own,'gmail',v_mailbox,'M1','part:2',received,'fixture@example.invalid','fuel.pdf','application/pdf',encode(fuel_bytes,'base64'),encode(sha256(fuel_bytes),'hex'),null,p,null);
 v_ar:=encode(sha256(convert_to('part:3','UTF8')),'hex');
 p:=jsonb_build_object('source','gmail','sourceRef',v_sr,'attachmentRef',v_ar,'kind','unknown','sha256',null,'amountCents',null,'brokerRules','{}'::jsonb,'status','DRAFT','requiresVerification',true);
 ref_hold:=public.rr_lease_step2c_record_mail(own,'gmail',v_mailbox,'M1','part:3',received,'fixture@example.invalid','oversize.pdf','application/pdf',null,null,'Oversize original; source held',p,null);
 v_ar:=encode(sha256(convert_to('@message','UTF8')),'hex');
 p:=jsonb_build_object('source','gmail','sourceRef',v_sr,'attachmentRef',v_ar,'kind','amazon_report','sha256',encode(sha256(report_bytes),'hex'),'amountCents',null,'brokerRules','{}'::jsonb,'status','DRAFT','requiresVerification',true);
 ref_msg:=public.rr_lease_step2c_record_mail(own,'gmail',v_mailbox,'M1','@message',received,'relay@amazon.com','message.json','application/json',encode(report_bytes,'base64'),encode(sha256(report_bytes),'hex'),null,p,'{"trip":"T-SIGNAL","block":null}');
 if not exists(select 1 from public.rr_lease_amazon_import_rows where carrier_user_id=own and amazon_trip_id='T-SIGNAL' and source_kind='EMAIL_SIGNAL' and report_status='UNVERIFIED' and amount_cents is null and verified_at is null) then raise exception 'Amazon signal was not unverified';end if;
 denied:=false;begin perform public.rr_lease_step2c_finish_window(own,'gmail',v_mailbox,null,start_at,end_at,jsonb_build_array(ref_rc),true);exception when raise_exception then denied:=true;end;
 if not denied or public.rr_lease_step2c_mail_cursor(own,'gmail',v_mailbox) is not null then raise exception 'Incomplete manifest advanced cursor';end if;
 v_manifest:=jsonb_build_array(ref_rc,ref_fuel,ref_hold,ref_msg);
 v_result:=public.rr_lease_step2c_finish_window(own,'gmail',v_mailbox,null,start_at,end_at,v_manifest,true);
 if (v_result->>'items')::int<>4 or public.rr_lease_step2c_mail_cursor(own,'gmail',v_mailbox) is distinct from end_at then raise exception 'Complete window did not advance';end if;
 if not (public.rr_lease_step2c_finish_window(own,'gmail',v_mailbox,null,start_at,end_at,v_manifest,true)->>'replay')::boolean then raise exception 'Window replay not idempotent';end if;
 denied:=false;begin perform public.rr_lease_step2c_mail_cursor(other,'gmail',v_mailbox);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Mailbox crossed carrier';end if;
 execute 'reset role';
 if (select proposal->>'amountCents' from rr_lease_private.step2c_mail_sources where carrier_user_id=own and source_ref=ref_rc->>'sourceRef' and attachment_ref=ref_rc->>'attachmentRef')<>'120000' then raise exception 'AI replay mutated amount';end if;
 raise notice 'PASS immutable mail replay, missing item cursor blocked, archived and held items, complete cursor CAS, unverified Amazon signal';

 -- The carrier can stage a new rate confirmation without an existing load.
 perform set_config('request.jwt.claim.sub',own::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',own,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v_result:=public.rr_lease_step2c_assign_execute(ref_rc->>'sourceRef',ref_rc->>'attachmentRef',op,null,'ratecon','Owner identified original','{"detention":true,"layover":false,"lumper":false}','Fixture broker','RC-001',null,null,null,null);
 v_load:=(v_result->>'loadId')::uuid;d:=(v_result->>'documentId')::uuid;
 if v_result->>'status'<>'FILED_DRAFT' or not (v_result->>'resolved')::boolean or (v_result->>'postAllowed')::boolean then raise exception 'Ratecon execution failed';end if;
 v_replay:=public.rr_lease_step2c_assign_execute(ref_rc->>'sourceRef',ref_rc->>'attachmentRef',op,null,'ratecon','Owner identified original','{"detention":true,"layover":false,"lumper":false}','Fixture broker','RC-001',null,null,null,null);
 if v_replay is distinct from v_result then raise exception 'Assignment replay differs';end if;
 v_result:=public.rr_lease_step2c_assign_execute(ref_fuel->>'sourceRef',ref_fuel->>'attachmentRef',op,null,'fuel','Owner selected exact transaction',null,null,null,st,4200,'carrier','mudflap:fixture-tx');
 w:=(v_result->>'walletDocumentId')::uuid;adj:=(v_result->>'adjustmentId')::uuid;
 if w is null or adj is null or v_result->>'status'<>'FILED_DRAFT' or (v_result->>'postAllowed')::boolean then raise exception 'Fuel filing failed';end if;
 v_replay:=public.rr_lease_step2c_assign_execute(ref_fuel->>'sourceRef',ref_fuel->>'attachmentRef',op,null,'fuel','Owner selected exact transaction',null,null,null,st,4200,'carrier','mudflap:fixture-tx');
 if v_replay is distinct from v_result then raise exception 'Fuel replay differs';end if;
 denied:=false;begin perform public.rr_lease_step2c_assign_execute(ref_hold->>'sourceRef',ref_hold->>'attachmentRef',op,v_load,'pod','Held original',null,null,null,null,null,null,null);exception when invalid_parameter_value then denied:=true;end;if not denied then raise exception 'Held original filed without bytes';end if;
 execute 'reset role';
 if not exists(select 1 from public.rr_lease_loads z where z.id=v_load and z.operator_id=op and z.ledger_mode='ITEMIZED' and z.status='staging' and z.gross_cents is null and z.settlement_id is null) or not exists(select 1 from public.rr_lease_documents z where z.id=d and z.is_ready and z.operator_visible and z.sha256=encode(sha256(rc_bytes),'hex')) then raise exception 'Ratecon staged original missing';end if;
 if not exists(select 1 from rr_lease_private.intake_review z where z.carrier_user_id=own and z.source_ref=ref_rc->>'sourceRef' and z.attachment_ref=ref_rc->>'attachmentRef' and z.resolved_at is not null and z.load_document_id=d) then raise exception 'Ratecon inbox not resolved';end if;
 if not exists(select 1 from public.rr_lease_wallet_documents z where z.id=w and z.operator_id=op and z.is_ready and z.sha256=encode(sha256(fuel_bytes),'hex'))
 or not exists(select 1 from public.rr_lease_adjustments z where z.id=adj and z.wallet_document_id=w and z.intake_status='DRAFT' and z.amount_cents=-4200)
 or not exists(select 1 from rr_lease_private.shared_fuel_references where carrier_user_id=own and reference='mudflap:fixture-tx' and entry_id=adj)
 or not exists(select 1 from public.rr_lease_ledger_entries where source_id=adj and status='DRAFT' and amount_cents=-4200)
 or exists(select 1 from public.rr_lease_ledger_entries where status='POSTED') then raise exception 'Draft expense/wallet/projection invalid';end if;
 denied:=false;begin update public.rr_lease_ledger_entries set status='POSTED' where source_id=adj;exception when raise_exception then denied:=true;end;if not denied then raise exception 'Direct posting permitted';end if;
 raise notice 'PASS new staged ITEMIZED RateCon original, resolved intake, wallet plus exact fuel reservation and DRAFT ledger, no direct posting';
 
 -- Same provider transaction on another operator must not create a second deduction.
 insert into public.rr_lease_settlements(operator_id,week_start) values(op2,date_trunc('week',now() at time zone 'America/Chicago')::date) returning id into st;
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 execute 'set local role service_role';
 v_sr:='outlook:'||encode(sha256(convert_to(v_mailbox||chr(31)||'M2','UTF8')),'hex');v_ar:=encode(sha256(convert_to('part:1','UTF8')),'hex');
 p:=jsonb_build_object('source','outlook','sourceRef',v_sr,'attachmentRef',v_ar,'kind','fuel','sha256',encode(sha256(fuel2),'hex'),'amountCents',4200,'brokerRules','{}'::jsonb,'status','DRAFT','requiresVerification',true);
 ref_dup:=public.rr_lease_step2c_record_mail(own,'outlook',v_mailbox,'M2','part:1',received,'fixture@example.invalid','fuel2.pdf','application/pdf',encode(fuel2,'base64'),encode(sha256(fuel2),'hex'),null,p,null);
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',own::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',own,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 denied:=false;begin perform public.rr_lease_step2c_assign_execute(ref_dup->>'sourceRef',ref_dup->>'attachmentRef',op2,null,'fuel','Duplicate transaction',null,null,null,st,4200,'carrier','mudflap:fixture-tx');exception when unique_violation then denied:=true;end;if not denied then raise exception 'Shared fuel double deduction allowed';end if;
 v_result:=public.rr_lease_step2c_report_review(100);if jsonb_array_length(v_result->'firstline')<>7 or jsonb_array_length(v_result->'conflicts')<>4 then raise exception 'Owner report review missing records: %',v_result;end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',other::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',other,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v_result:=public.rr_lease_step2c_report_review(100);if jsonb_array_length(v_result->'firstline')<>0 or jsonb_array_length(v_result->'conflicts')<>0 then raise exception 'Cross carrier report leakage';end if;
 denied:=false;begin perform public.rr_lease_step2c_assign_execute(ref_dup->>'sourceRef',ref_dup->>'attachmentRef',other_op,null,'fuel','Wrong carrier',null,null,null,st,4200,'carrier','mudflap:fixture-tx');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Cross carrier assignment allowed';end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',drv::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',drv,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 denied:=false;begin perform public.rr_lease_step2c_report_review(100);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Driver report inbox allowed';end if;
 if exists(select 1 from public.v_owner_amazon_assignment_inbox) then raise exception 'Driver saw unassigned Amazon payouts';end if;
 denied:=false;begin perform 1 from public.rr_lease_factoring_events;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Driver read FirstLine events';end if;
 denied:=false;begin perform public.rr_lease_step2c_import_report(own,'amazon','csv','','','[]','{}');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Driver invoked trusted importer';end if;
 execute 'reset role';
 if (select count(*) from public.rr_lease_adjustments)<>1 or (select count(*) from public.rr_lease_ledger_entries)<>1 or exists(select 1 from public.rr_lease_wallet_documents where operator_id=op2) then raise exception 'Duplicate assignment leaked partial wallet/ledger';end if;
 raise notice 'PASS shared fuel cross-operator uniqueness, owner-only reports, driver/other carrier isolation, atomic failure rollback';
end $test$;
rollback;
do $$begin
 if exists(select 1 from auth.users) or exists(select 1 from public.rr_lease_loads) or exists(select 1 from public.rr_lease_ledger_entries) or exists(select 1 from public.rr_lease_amazon_import_rows) or exists(select 1 from public.rr_lease_factoring_events) or exists(select 1 from rr_lease_private.step2c_archives) or exists(select 1 from rr_lease_private.step2c_mail_sources) or exists(select 1 from rr_lease_private.step2c_assignment_execution) then raise exception 'Rollback leaked Step2C fixtures';end if;
 raise notice 'PASS Step 2C rollback zero fixture data';
end $$;
