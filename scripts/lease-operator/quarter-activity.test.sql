-- Isolated database fixture only. Apply the lease/mail/wallet/carrier migrations,
-- the approved-owner account workspace policy, and the quarter migration first.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('a1000000-0000-4000-8000-000000000001','owner@example.test',now()),
 ('a1000000-0000-4000-8000-000000000002','leased@example.test',now()),
 ('a1000000-0000-4000-8000-000000000003','other@example.test',now());
insert into owner_op.approved_users(user_id,email,approved_at)
  values('a1000000-0000-4000-8000-000000000001','owner@example.test',now());
insert into public.rr_lease_operators(id,carrier_user_id,driver_user_id,company_name,driver_name,workspace_kind,share_bps) values
 ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',null,'Fleet','Owner','carrier',10000),
 ('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','Lease','Driver','leased',9100);
insert into public.road_ready_account_workspaces(user_id,revision,device_id,payload) values ('a1000000-0000-4000-8000-000000000001',1,gen_random_uuid(),
 '{"records":{"[\"business\",\"loads\",\"x\"]":{"loadNo":"A-01","broker":"Priority 1 Inc.","deliveryDate":"2025-10-10","gross":"1250.75","status":"archived"},
 "[\"business-array\",\"loads\"]":[{"id":"x-copy","loadNo":"A-01","broker":"Priority One","deliveryDate":"2025-10-10","gross":"1250.75","status":"archived"},
 {"id":"copy","loadNo":"A-02","broker":"Total Quality Logistics LLC","deliveryDate":"2025-10-09","gross":"600","status":"archived"},
 {"id":"cross","loadNo":"B-01","broker":"West","deliveryDate":"2025-11-01","gross":"1000","status":"archived"},
 {"id":"clash-a","loadNo":"C-01","broker":"West","deliveryDate":"2025-10-01","gross":"700","status":"archived"},
 {"id":"clash-b","loadNo":"C-01","broker":"West","deliveryDate":"2025-10-01","gross":"710","status":"archived"},
 {"id":"open","loadNo":"D-01","broker":"West","pickupDate":"2025-11-01","gross":"800","status":"booked"},
 {"id":"unknown","loadNo":"U-01","broker":"West","deliveryDate":"2025-11-01","gross":"pending","status":"archived"},
 {"id":"malformed","loadNo":"F-01","broker":"West","deliveryDate":"2025-11-49","gross":"800","status":"archived"},
 {"id":"practice","loadNo":"DEMO-101","broker":"West","deliveryDate":"2025-11-01","gross":"800","status":"archived"},
 {"id":"assigned-away","loadNo":"Y-01","broker":"West","operator_id":"a2000000-0000-4000-8000-000000000002","deliveryDate":"2025-11-01","gross":"10","status":"archived"}]}}');
insert into public.rr_lease_loads(operator_id,broker_name,load_number,status,actual_delivery_date,gross_cents) values
 ('a2000000-0000-4000-8000-000000000001','TQL','A-02','delivered','2025-10-09',60000),
 ('a2000000-0000-4000-8000-000000000001','West','DEMO-02','delivered','2025-10-09',99000),
 ('a2000000-0000-4000-8000-000000000001','West','OLD','closed','2025-09-30',100),
 ('a2000000-0000-4000-8000-000000000001','National Test Engineering','NEXT','delivered','2026-01-01',null),
 ('a2000000-0000-4000-8000-000000000002','West','B-01','delivered','2025-11-01',100000);
insert into public.rr_lease_settlements(id,operator_id,week_start) values
 ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','2025-10-06');
insert into public.rr_lease_adjustments(settlement_id,kind,paid_by,amount_cents,description,evidence_reference) values
 ('a3000000-0000-4000-8000-000000000001','fuel','carrier',-8000,'Fuel','pump.1'),
 ('a3000000-0000-4000-8000-000000000001','insurance','operator',12000,'Insurance','bill.1'),
 ('a3000000-0000-4000-8000-000000000001','advance','carrier',-2000,'Advance','advance.1'),
 ('a3000000-0000-4000-8000-000000000001','credit','carrier',400,'General credit','credit.1');
-- Match real purchase/refund restrictions including the receipt evidence.
do $$
declare op uuid='a2000000-0000-4000-8000-000000000001'; leased uuid='a2000000-0000-4000-8000-000000000002';
  doc uuid; expense uuid; i int; raw bytea;
begin
  for i in 1..3 loop
    raw=convert_to('Synthetic receipt '||i,'UTF8');
    doc=public.rr_lease_wallet_begin(case when i=3 then leased else op end,'fuel.'||i,'fuel_receipt','Receipt','receipt.pdf',
      'application/pdf',length(raw),encode(sha256(raw),'hex'),'receipt.'||i,'Synthetic assigned original');
    perform public.rr_lease_wallet_put_chunk(doc,0,encode(raw,'base64')); perform public.rr_lease_wallet_finish(doc);
    if i=1 then expense=public.rr_lease_record_owner_expense(op,'2025-11-10','fuel',8000,'Fuel','purchase.1',doc);
    elsif i=2 then perform public.rr_lease_record_owner_expense(op,'2025-11-11','fuel',-500,'Refund','refund.1',doc,expense);
    else insert into public.rr_lease_adjustments(settlement_id,kind,paid_by,amount_cents,description,evidence_reference,wallet_document_id)
      values('a3000000-0000-4000-8000-000000000001','credit','carrier',500,'Fuel refund','fuel.refund.3',doc);
    end if;
  end loop;
end $$;
insert into rr_lease_private.driver_tools_pilot(operator_id,user_id) values
  ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","email":"owner@example.test","role":"authenticated"}',true);
do $$
declare op uuid='a2000000-0000-4000-8000-000000000001'; q date='2025-10-01'; r jsonb; h record;
begin
  r=public.rr_driver_quarter_activity(op,q);
  assert r->>'load_count'='1' and r->>'gross_cents'='60000' and r->>'operator_share_cents'='60000';
  assert r->>'legacy_review_count'='4' and r->>'legacy_review_gross_cents' is null;
  assert r->>'recorded_expenses_cents'='7500' and r->>'recorded_fuel_cents'='7500' and r->>'operator_paid_cents'='7500' and r->>'carrier_deductions_cents'='0';
  assert r->>'purchased_gallons' is null and r->>'purchase_jurisdictions' is null;
  select * into strict h from public.rr_driver_quarter_legacy_loads(op,q) where load_number='A-01';
  assert public.rr_driver_confirm_legacy_load(op,q,h.legacy_key,h.evidence_hash);
  assert public.rr_driver_confirm_legacy_load(op,q,h.legacy_key,h.evidence_hash);
  assert (select count(*)=1 from rr_driver_finance_private.legacy_confirmations);
  r=public.rr_driver_quarter_activity(op,q);
  assert r->>'legacy_load_count'='1' and r->>'load_count'='2' and r->>'gross_cents'='185075' and r->>'operator_share_cents'='185075';
  for h in select * from public.rr_driver_quarter_legacy_loads(op,q) where load_number in ('C-01','U-01','Y-01') loop
    begin
      perform public.rr_driver_confirm_legacy_load(op,q,h.legacy_key,h.evidence_hash);
      raise exception 'Invalid folder confirmed';
    exception when raise_exception then if sqlerrm <> 'Review conflicting or incomplete freight' then raise; end if; end;
  end loop;
  r=public.rr_driver_quarter_activity(op,'2026-01-01');
  assert r->>'gross_missing'='1' and r->>'gross_cents' is null and r->>'operator_share_cents' is null;
  begin perform public.rr_driver_quarter_activity(op,'2025-10-02'); raise exception 'Accepted non-quarter date'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- A changed amount requires a new review; a later canonical assignment supersedes the old row.
update public.road_ready_account_workspaces set payload=jsonb_set(
 jsonb_set(payload,array['records','["business","loads","x"]','gross'],'"1300"'),array['records','["business-array","loads"]','0','gross'],'"1300"')
where user_id='a1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$begin
 assert (public.rr_driver_quarter_activity('a2000000-0000-4000-8000-000000000001','2025-10-01')->>'legacy_load_count')='0';
 assert not has_table_privilege(current_user,'rr_driver_finance_private.legacy_confirmations','insert');
end $$;
reset role;
insert into public.rr_lease_loads(operator_id,broker_name,load_number,status,actual_delivery_date,gross_cents)
values('a2000000-0000-4000-8000-000000000001','Priority1','A-01','delivered','2025-10-10',130000);
set local role authenticated;
do $$begin
 assert not exists(select 1 from public.rr_driver_quarter_legacy_loads('a2000000-0000-4000-8000-000000000001','2025-10-01') where load_number='A-01');
end $$;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","email":"leased@example.test","role":"authenticated"}',true);
do $$declare r jsonb;begin
 r=public.rr_driver_quarter_activity('a2000000-0000-4000-8000-000000000002','2025-10-01');
 assert r->>'gross_cents'='100000' and r->>'operator_share_cents'='91000' and r->>'legacy_review_count'='0';
 assert r->>'recorded_fuel_cents'='7500' and r->>'recorded_expenses_cents'='19500' and r->>'operator_paid_cents'='12000';
 assert r->>'carrier_deductions_cents'='-9100' and r->>'unclassified_credit_cents'='400';
 begin perform public.rr_driver_quarter_activity('a2000000-0000-4000-8000-000000000001','2025-10-01');raise exception 'Foreign data exposed';
 exception when insufficient_privilege then null;end;
 begin perform public.rr_driver_confirm_legacy_load('a2000000-0000-4000-8000-000000000001','2025-10-01','x','digest');raise exception 'Foreign write allowed';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","email":"wrong@example.test","role":"authenticated"}',true);
do $$begin
 begin perform public.rr_driver_quarter_activity('a2000000-0000-4000-8000-000000000001','2025-10-01');raise exception 'Unapproved identity accepted';
 exception when insufficient_privilege then null;end;
end $$;
rollback;
