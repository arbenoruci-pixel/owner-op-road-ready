-- Disposable PostgreSQL/Supabase only. Exercises the financial boundaries and real role grants.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('81000000-0000-4000-8000-000000000001','workspace-carrier@example.test',now()),
 ('81000000-0000-4000-8000-000000000002','workspace-driver@example.test',now()),
 ('81000000-0000-4000-8000-000000000003','workspace-other@example.test',now());
insert into public.rr_lease_operators(id,carrier_user_id,company_name,driver_name)
values('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Fixture','Driver');
insert into rr_lease_private.operator_invites values('82000000-0000-4000-8000-000000000001','workspace-driver@example.test');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$begin
 assert public.rr_lease_claim_membership()=0;
 assert not exists(select 1 from public.rr_lease_operators);
 assert not has_function_privilege(current_user,'public.rr_lease_read_original_chunk(uuid,integer)','execute');
end$$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$begin
 assert public.rr_lease_claim_membership()=1;
 assert public.rr_lease_claim_membership()=0;
 assert (select count(*)=1 from public.rr_lease_operators);
 assert not has_table_privilege(current_user,'public.rr_lease_adjustments','insert');
end$$;
set local role service_role;
do $$
declare
 op uuid='82000000-0000-4000-8000-000000000001'; w uuid; l uuid; totals record; refused boolean;
begin
 insert into public.rr_lease_settlements(operator_id,week_start) values(op,'2026-11-23') returning id into w;
 insert into public.rr_lease_loads(operator_id,broker_name,load_number,status,gross_cents,settlement_id)
 values(op,'Example','420','delivered',250000,w) returning id into l;
 insert into public.rr_lease_adjustments(settlement_id,description,kind,paid_by,amount_cents,evidence_reference)
 values(w,'Direct fuel','fuel','operator',14000,'test-direct'),(w,'Advanced fuel','fuel','carrier',-15000,'test-advance');
 select * into totals from public.rr_lease_settlement_totals where settlement_id=w;
 assert totals.estimated_net_cents=215000 and totals.net_cents is null and totals.operator_paid_cents=14000;
 insert into public.rr_lease_cost_reviews(settlement_id,kind,outcome,evidence_reference) values
 (w,'fuel','complete','Matched fuel receipts'),(w,'eld','none','Confirmed no ELD charge'),(w,'insurance','deferred','Await confirmed premium before deducting');
 select * into totals from public.rr_lease_settlement_totals where settlement_id=w;
 assert totals.net_cents=215000 and totals.costs_reviewed and totals.has_deferred_costs;
 update public.rr_lease_settlements set status='issued' where id=w;
 refused=false;
 begin
  update public.rr_lease_settlements set status='paid',paid_at=now(),payment_reference='test',payment_amount_cents=215 where id=w;
 exception when raise_exception then refused=true;
 end;
 assert refused;
 update public.rr_lease_settlements set status='paid',paid_at=now(),payment_reference='test-proof',payment_amount_cents=215000 where id=w;
 refused=false;
 begin
  update public.rr_lease_loads set gross_cents=100 where id=l;
 exception when raise_exception then refused=true;
 end;
 assert refused;
end$$;
rollback;
