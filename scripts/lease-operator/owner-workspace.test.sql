-- Run on the isolated PostgreSQL integration fixture, with lease, mail, wallet and owner migrations.
begin;
create table if not exists public.road_ready_account_workspaces(user_id uuid primary key,payload jsonb not null);
grant select on public.road_ready_account_workspaces to authenticated;
alter table public.road_ready_account_workspaces enable row level security;
create policy owner_legacy_integration_fixture on public.road_ready_account_workspaces for select to authenticated
  using(user_id=(select auth.uid()));
insert into auth.users(id,email,email_confirmed_at) values
 ('91000000-0000-4000-8000-000000000001','real-carrier-login@example.test',now()),
 ('91000000-0000-4000-8000-000000000002','paperwork-only@example.test',now()),
 ('91000000-0000-4000-8000-000000000003','actual-driver@example.test',now());
insert into public.road_ready_account_workspaces values('91000000-0000-4000-8000-000000000001',
  jsonb_build_object('records',jsonb_build_object(
    '["business","loads","old-a"]',jsonb_build_object('id','old-a','loadNo','LEGACY-A','broker','Archive'),
    '["business","loads","copied"]',jsonb_build_object('id','copied','loadNo','CURRENT','broker','Carrier broker'),
    '["business-array","loads"]',jsonb_build_array(jsonb_build_object('id','old-b','loadNo','LEGACY-B','broker','Archive')),
    '["book","d","dummy"]',jsonb_build_object('loadNo','PROTECTED'))));
insert into public.rr_lease_operators(id,carrier_user_id,driver_user_id,company_name,driver_name) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','Leased Fleet','Driver A');
insert into rr_lease_private.operator_invites values('92000000-0000-4000-8000-000000000001','actual-driver@example.test');
set local role service_role;
do $$
declare op uuid; leased uuid='92000000-0000-4000-8000-000000000001'; load_id uuid; s uuid; entry uuid;
 docs uuid[]; proof uuid; raw bytea; i int; refused boolean; settlement jsonb;
begin
  op:=public.rr_lease_register_carrier_workspace('91000000-0000-4000-8000-000000000001','Carrier','Owner','paperwork-only@example.test');
  assert op=public.rr_lease_register_carrier_workspace('91000000-0000-4000-8000-000000000001','Carrier','Owner','PAPERWORK-ONLY@example.test');
  assert public.rr_lease_email_login_allowed('real-carrier-login@example.test');
  assert not public.rr_lease_email_login_allowed('paperwork-only@example.test');
  perform set_config('test.rr_owner',op::text,true);
  load_id:=public.rr_lease_stage_load(op,'Carrier broker','CURRENT');
  assert (select share_bps=10000 from public.rr_lease_loads where id=load_id);
  begin
    insert into public.rr_lease_settlements(operator_id,week_start) values(op,'2025-11-24');
    raise exception 'owner payroll created';
  exception when raise_exception then if sqlerrm not like 'A carrier haul%' then raise; end if;end;
  for i in 1..3 loop
    raw:=convert_to('Owner integration test document '||i,'UTF8');proof:=gen_random_uuid();
    insert into public.rr_lease_documents(id,load_id,kind,file_name,mime_type,byte_size,sha256,storage_path)
      values(proof,load_id,(array['ratecon','pod','invoice'])[i],'test.pdf','application/pdf',length(raw),encode(sha256(raw),'hex'),
        op::text||'/'||load_id::text||'/'||proof::text);
    perform public.rr_lease_put_chunk(proof,0,encode(raw,'base64'));perform public.rr_lease_finish_original(proof);
    docs:=array_append(docs,proof);
  end loop;
  perform public.rr_lease_apply_mail(docs[1],'rate','broker@example.test','Confirmed owner load',
    '{"pickup_address":"A","delivery_address":"B","steps":[{"title":"PU","detail":"Ref"}],"gross_cents":250000}');
  perform public.rr_lease_apply_mail(docs[2],'pod','paperwork-only@example.test','Confirmed owner POD',p_verified_for_billing=>true);
  settlement:=public.rr_lease_finalize_delivery(load_id,docs[2],'2025-11-25',true,'2025-11-25T15:00Z','proof received');
  assert settlement->>'settlement_id' is null and settlement->>'payment_deadline' is null;
  assert (select status='delivered' and operator_share_cents=250000 and carrier_share_cents=0 from public.rr_lease_loads where id=load_id);
  assert (public.rr_lease_claim_factoring(load_id,docs[3],'OWN-TEST',250000,docs[1],array[docs[2]])->>'send')::boolean;
  assert not (public.rr_lease_claim_factoring(load_id,docs[3],'OWN-TEST',250000,docs[1],array[docs[2]])->>'send')::boolean;
  docs:='{}';
  for i in 1..3 loop
    raw:=convert_to('Test fuel receipt '||i,'UTF8');
    proof:=public.rr_lease_wallet_begin(case when i=3 then leased else op end,'fuel.'||i,'fuel_receipt','Fuel','receipt.pdf',
      'application/pdf',length(raw),encode(sha256(raw),'hex'),'expense.'||i,'unit confirmed');
    perform public.rr_lease_wallet_put_chunk(proof,0,encode(raw,'base64'));perform public.rr_lease_wallet_finish(proof);
    docs:=array_append(docs,proof);
  end loop;
  entry:=public.rr_lease_record_owner_expense(op,'2025-11-25','fuel',4000,'Net fuel','Mudflap:TXN-ONE',docs[1]);
  assert entry=public.rr_lease_record_owner_expense(op,'2025-11-25','fuel',4000,'Net fuel','mudflap:txn-one',docs[1]);
  perform public.rr_lease_record_owner_expense(op,'2025-11-26','fuel',-500,'Fuel credit','Mudflap:TXN-ONE:refund-2',docs[2],entry);
  assert (select sum(amount_cents)=3500 from public.rr_lease_owner_expenses where operator_id=op);
  insert into public.rr_lease_settlements(operator_id,week_start) values(leased,'2025-11-24') returning id into s;
  refused:=false;
  begin
    insert into public.rr_lease_adjustments(settlement_id,kind,paid_by,amount_cents,description,evidence_reference,wallet_document_id)
      values(s,'fuel','carrier',-4000,'Wrong driver','mudflap:txn-one',docs[3]);
  exception when unique_violation then refused:=true;end;
  assert refused,'One shared fuel transaction cannot enter two drivers’ accounts';
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$begin
  assert public.rr_lease_claim_membership()=0 and not exists(select 1 from public.rr_lease_operators);
  assert not exists(select 1 from public.rr_lease_owner_legacy_loads(current_setting('test.rr_owner')::uuid));
end $$;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$begin
  assert not exists(select 1 from public.rr_lease_owner_expenses);
  assert not exists(select 1 from public.rr_lease_owner_legacy_loads(current_setting('test.rr_owner')::uuid));
end $$;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$begin
  assert (select sum(amount_cents)=3500 from public.rr_lease_owner_expenses);
  assert (select array_agg(load_number order by load_number)=array['LEGACY-A','LEGACY-B']
    from public.rr_lease_owner_legacy_loads(current_setting('test.rr_owner')::uuid));
  assert not has_function_privilege(current_user,'public.rr_lease_register_carrier_workspace(uuid,text,text,text)','execute');
end $$;
rollback;
