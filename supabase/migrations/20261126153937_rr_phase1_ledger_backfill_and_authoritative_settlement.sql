
-- Determine eligibility from evidence; no invented receipt dates.
create function rr_lease_private.phase1_load_eligible(p_load uuid) returns boolean
language sql stable set search_path='' as $$
 select coalesce((
 select l.gross_cents is not null and case
 when l.billing_channel='AMAZON_DIRECT' then exists(
   select 1 from public.rr_lease_amazon_import_rows a
   where a.load_id=l.id and a.operator_id=l.operator_id and a.source_kind='RELAY_CSV'
   and a.verified_at is not null and a.amount_cents=l.gross_cents
   and ((l.load_type='TONU' and a.report_status='TONU' and l.cancelled_at is not null)
   or (l.load_type='FREIGHT' and a.report_status in ('COMPLETED','PAID') and l.status in ('delivered','closed'))))
 when l.load_type='TONU' then l.cancelled_at is not null and exists(select 1 from public.rr_lease_documents d where d.id=l.tonu_confirmation_id and d.load_id=l.id and d.kind in ('ratecon','supporting') and d.is_ready)
 else l.status in ('delivered','closed') and l.actual_delivery_date is not null and exists(select 1 from public.rr_lease_documents d where d.id=l.final_pod_id and d.load_id=l.id and d.kind='pod' and d.is_ready)
 end from public.rr_lease_loads l where l.id=p_load),false)
$$;
revoke all on function rr_lease_private.phase1_load_eligible(uuid) from public,anon,authenticated;
grant execute on function rr_lease_private.phase1_load_eligible(uuid) to service_role;

create function rr_lease_private.phase1_sync_load(p_load uuid) returns void
language plpgsql set search_path='' as $$
declare l public.rr_lease_loads; eligible boolean; k text;
begin
 select * into strict l from public.rr_lease_loads where id=p_load;
 if l.settlement_id is not null and exists(select 1 from public.rr_lease_settlements s where s.id=l.settlement_id and s.status<>'draft') then return; end if;
 update public.rr_lease_ledger_entries e set status='VOID'
 where e.source_kind='LEGACY_LOAD' and e.source_id=l.id and e.status<>'VOID'
 and (e.settlement_id is distinct from l.settlement_id or l.ledger_mode<>'LEGACY_TOTAL' or l.gross_cents is null);
 if l.settlement_id is null or l.ledger_mode<>'LEGACY_TOTAL' or l.gross_cents is null then return; end if;
 eligible:=rr_lease_private.phase1_load_eligible(l.id);
 k:='load:'||l.id::text||':'||l.settlement_id::text;
 insert into public.rr_lease_ledger_entries(operator_id,settlement_id,load_id,source_kind,source_id,entry_type,amount_cents,fee_bps,status,description,source_document_id,idempotency_key)
 values(l.operator_id,l.settlement_id,l.id,'LEGACY_LOAD',l.id,case when l.load_type='TONU' then 'TONU' else 'FREIGHT' end,l.gross_cents,l.fee_bps,
 case when eligible then 'POSTED' else 'DRAFT' end,l.broker_name||' · '||l.load_number,
 case when l.load_type='TONU' then l.tonu_confirmation_id else l.final_pod_id end,k)
 on conflict(operator_id,idempotency_key) do update set
 entry_type=excluded.entry_type,amount_cents=excluded.amount_cents,fee_bps=excluded.fee_bps,status=excluded.status,description=excluded.description,source_document_id=excluded.source_document_id
 where row(rr_lease_ledger_entries.entry_type,rr_lease_ledger_entries.amount_cents,rr_lease_ledger_entries.fee_bps,rr_lease_ledger_entries.status,rr_lease_ledger_entries.description,rr_lease_ledger_entries.source_document_id)
 is distinct from row(excluded.entry_type,excluded.amount_cents,excluded.fee_bps,excluded.status,excluded.description,excluded.source_document_id);
end $$;
revoke all on function rr_lease_private.phase1_sync_load(uuid) from public,anon,authenticated;
grant execute on function rr_lease_private.phase1_sync_load(uuid) to service_role;
create function rr_lease_private.phase1_load_sync_trigger() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
  update public.rr_lease_ledger_entries set status='VOID' where source_kind='LEGACY_LOAD' and source_id=old.id and status<>'VOID';
  return old;
 end if;
 perform rr_lease_private.phase1_sync_load(new.id); return new;
end $$;
revoke all on function rr_lease_private.phase1_load_sync_trigger() from public,anon,authenticated;
create trigger rr_phase1_load_sync after insert or update on public.rr_lease_loads for each row execute function rr_lease_private.phase1_load_sync_trigger();
create trigger rr_phase1_load_void before delete on public.rr_lease_loads for each row execute function rr_lease_private.phase1_load_sync_trigger();

create function rr_lease_private.phase1_sync_adjustment(p_id uuid) returns void
language plpgsql set search_path='' as $$
declare a public.rr_lease_adjustments;
begin
 select * into strict a from public.rr_lease_adjustments where id=p_id;
 insert into public.rr_lease_ledger_entries(operator_id,settlement_id,source_kind,source_id,entry_type,amount_cents,fee_bps,paid_by,status,description,source_wallet_document_id,source_reference,idempotency_key)
 values(a.operator_id,a.settlement_id,'LEGACY_ADJUSTMENT',a.id,upper(a.kind),a.amount_cents,0,a.paid_by,'POSTED',a.description,a.wallet_document_id,a.evidence_reference,'adjustment:'||a.id::text)
 on conflict(operator_id,idempotency_key) do update set
 entry_type=excluded.entry_type,amount_cents=excluded.amount_cents,paid_by=excluded.paid_by,status='POSTED',description=excluded.description,source_wallet_document_id=excluded.source_wallet_document_id,source_reference=excluded.source_reference
 where row(rr_lease_ledger_entries.entry_type,rr_lease_ledger_entries.amount_cents,rr_lease_ledger_entries.paid_by,rr_lease_ledger_entries.status,rr_lease_ledger_entries.description,rr_lease_ledger_entries.source_wallet_document_id,rr_lease_ledger_entries.source_reference)
 is distinct from row(excluded.entry_type,excluded.amount_cents,excluded.paid_by,excluded.status,excluded.description,excluded.source_wallet_document_id,excluded.source_reference);
end $$;
revoke all on function rr_lease_private.phase1_sync_adjustment(uuid) from public,anon,authenticated;
grant execute on function rr_lease_private.phase1_sync_adjustment(uuid) to service_role;
create function rr_lease_private.phase1_adjustment_sync_trigger() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
  update public.rr_lease_ledger_entries set status='VOID' where source_kind='LEGACY_ADJUSTMENT' and source_id=old.id and status<>'VOID';
  return old;
 end if;
 perform rr_lease_private.phase1_sync_adjustment(new.id); return new;
end $$;
revoke all on function rr_lease_private.phase1_adjustment_sync_trigger() from public,anon,authenticated;
create trigger rr_phase1_adjustment_sync after insert or update on public.rr_lease_adjustments for each row execute function rr_lease_private.phase1_adjustment_sync_trigger();
create trigger rr_phase1_adjustment_void before delete on public.rr_lease_adjustments for each row execute function rr_lease_private.phase1_adjustment_sync_trigger();

-- Backfill only actual evidence already recorded, not inferred dates.
update public.rr_lease_loads set pod_received_at=required_docs_submitted_at where final_pod_id is not null and required_docs_submitted_at is not null and pod_received_at is null and exists(select 1 from public.rr_lease_settlements s where s.id=settlement_id and s.status='draft');
do $$ declare x record; begin
 if exists(select 1 from public.rr_lease_settlements where status<>'draft') then raise exception 'Historical issued settlements require separate immutable import'; end if;
 for x in select id from public.rr_lease_loads where settlement_id is not null loop perform rr_lease_private.phase1_sync_load(x.id); end loop;
 for x in select id from public.rr_lease_adjustments loop perform rr_lease_private.phase1_sync_adjustment(x.id); end loop;
end $$;

-- Refresh projected legacy amount when the official Amazon report or POD proof arrives.
create function rr_lease_private.phase1_evidence_sync() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
   if old.load_id is not null and exists(select 1 from public.rr_lease_loads where id=old.load_id) then perform rr_lease_private.phase1_sync_load(old.load_id); end if;
   return old;
 end if;
 if new.load_id is not null then perform rr_lease_private.phase1_sync_load(new.load_id); end if;
 if tg_op='UPDATE' and old.load_id is not null and old.load_id is distinct from new.load_id then perform rr_lease_private.phase1_sync_load(old.load_id); end if;
 return new;
end $$;
revoke all on function rr_lease_private.phase1_evidence_sync() from public,anon,authenticated;
create trigger rr_phase1_amazon_evidence_sync after insert or update or delete on public.rr_lease_amazon_import_rows for each row execute function rr_lease_private.phase1_evidence_sync();
create trigger rr_phase1_pod_evidence_sync after update of is_ready on public.rr_lease_documents for each row execute function rr_lease_private.phase1_evidence_sync();

-- Set the earliest proven receipt timestamp, preserving separate legal deadline.
create function rr_lease_private.phase1_receipt_clock() returns trigger language plpgsql set search_path='' as $$
begin
 if new.final_pod_id is not null and new.required_docs_submitted_at is not null and new.pod_received_at is null then new.pod_received_at=new.required_docs_submitted_at; end if;
 if tg_op='UPDATE' and old.required_docs_submitted_at is not null then new.required_docs_submitted_at=least(old.required_docs_submitted_at,new.required_docs_submitted_at); end if;
 return new;
end $$;
revoke all on function rr_lease_private.phase1_receipt_clock() from public,anon,authenticated;
create trigger rr_phase1_receipt_clock before insert or update on public.rr_lease_loads for each row execute function rr_lease_private.phase1_receipt_clock();
create view public.v_driver_payment_deadlines with(security_invoker=true) as
 select id as load_id,operator_id,settlement_id,billing_channel,pod_received_at,required_docs_submitted_at,payment_deadline,
 case when pod_received_at is not null then (pod_received_at at time zone 'America/Chicago')::date+15 end as pod_followup_date
 from public.rr_lease_loads;
revoke all on public.v_driver_payment_deadlines from public,anon,authenticated;
grant select on public.v_driver_payment_deadlines to authenticated,service_role;

-- Authoritative totals: exclusively ledger amounts. Existing API shape is preserved.
create function rr_lease_private.phase1_ledger_totals(p_settlement uuid)
returns table(load_count bigint,gross_cents numeric,operator_share_cents numeric,carrier_share_cents numeric,carrier_deduction_cents numeric,credit_cents numeric,operator_paid_cents numeric,estimated_net_cents numeric,verified_net_cents numeric,all_confirmed boolean)
language sql stable security definer set search_path='' as $$
 select count(distinct e.load_id) filter(where e.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU')),
 coalesce(sum(e.amount_cents) filter(where e.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU')),0),
 coalesce(sum(e.driver_effect_cents) filter(where e.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU')),0),
 coalesce(sum(e.carrier_effect_cents),0),
 coalesce(sum(-e.driver_effect_cents) filter(where e.driver_effect_cents<0),0),
 coalesce(sum(e.driver_effect_cents) filter(where e.entry_type not in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') and e.driver_effect_cents>0),0),
 coalesce(sum(e.amount_cents) filter(where e.paid_by='operator' and e.entry_type in ('FUEL','INSURANCE','ELD','ADVANCE','OTHER')),0),
 coalesce(sum(e.driver_effect_cents),0),
 coalesce(sum(e.driver_effect_cents) filter(where e.status='POSTED'),0),
 coalesce(bool_and(e.status='POSTED'),true)
 from public.rr_lease_settlements s join public.rr_lease_operators o on o.id=s.operator_id
 left join public.rr_lease_ledger_entries e on e.settlement_id=s.id and e.status in ('DRAFT','POSTED')
 where s.id=p_settlement and (
 (auth.uid() is not null and (o.driver_user_id=auth.uid() or o.carrier_user_id=auth.uid()))
 or current_setting('role',true)='service_role'
 or (current_setting('role',true)='none' and session_user in ('postgres','service_role','supabase_admin')))
 group by s.id
$$;
revoke all on function rr_lease_private.phase1_ledger_totals(uuid) from public,anon,authenticated;
grant execute on function rr_lease_private.phase1_ledger_totals(uuid) to authenticated,service_role;
create or replace view public.rr_lease_settlement_totals with(security_invoker=true) as
 select s.id as settlement_id,s.operator_id,s.week_start,s.status,s.currency,
 t.load_count,t.gross_cents,t.operator_share_cents,t.carrier_share_cents,t.carrier_deduction_cents,t.credit_cents,t.operator_paid_cents,
 t.estimated_net_cents,
 case when t.all_confirmed and r.reviewed=3 then greatest(t.verified_net_cents,0) else null::numeric end as net_cents,
 r.reviewed=3 as costs_reviewed,r.deferred>0 as has_deferred_costs,
 t.verified_net_cents, greatest(-t.verified_net_cents,0) as negative_balance_cents
 from public.rr_lease_settlements s
 cross join lateral rr_lease_private.phase1_ledger_totals(s.id) t
 cross join lateral (select count(*) as reviewed,count(*) filter(where c.outcome='deferred') as deferred from public.rr_lease_cost_reviews c where c.settlement_id=s.id) r;

-- Issuance is atomic; payments match immutable ledger snapshot, never legacy totals.
create or replace function rr_lease_private.statement_guard() returns trigger language plpgsql set search_path='' as $$
declare due numeric; snap bigint; bad boolean;
begin
 if tg_op='DELETE' then if old.status<>'draft' then raise exception 'An issued settlement must be retained'; end if; return old; end if;
 if tg_op='INSERT' then if new.status<>'draft' then raise exception 'Create a draft before issuing a settlement'; end if; return new; end if;
 if row(new.id,new.operator_id,new.week_start) is distinct from row(old.id,old.operator_id,old.week_start) then raise exception 'Settlement identity cannot change'; end if;
 if old.status='paid' and new is distinct from old then raise exception 'Paid settlement is immutable'; end if;
 if old.status='issued' and (new.status='draft' or new.expected_pay_date is distinct from old.expected_pay_date) then raise exception 'Issued settlement cannot be reopened or rescheduled'; end if;
 if old.status='draft' and new.status='paid' then raise exception 'Issue a settlement before marking it paid'; end if;
 if old.status='issued' and new.status='paid' then
  if new.paid_at is null or not isfinite(new.paid_at) or new.paid_at>clock_timestamp() then raise exception 'Use actual bank payment date'; end if;
  select net_cents into strict snap from public.rr_lease_settlement_snapshots where settlement_id=new.id;
  if new.payment_amount_cents is distinct from snap then raise exception 'Payment amount must match the immutable ledger snapshot'; end if;
 end if;
 if old.status='draft' and new.status='issued' then
  if (select count(*) from public.rr_lease_cost_reviews where settlement_id=new.id)<>3 then raise exception 'Review insurance, fuel and ELD costs'; end if;
  if exists(select 1 from public.rr_lease_ledger_entries where settlement_id=new.id and status='DRAFT') then raise exception 'Unverified ledger item: verify or defer before issue'; end if;
  if exists(select 1 from public.rr_lease_loads l where l.settlement_id=new.id and not rr_lease_private.phase1_load_eligible(l.id)) then raise exception 'Load lacks required official evidence'; end if;
  if exists(select 1 from public.rr_lease_loads l where l.settlement_id=new.id and l.ledger_mode='ITEMIZED' and (
   not exists(select 1 from public.rr_lease_ledger_entries e where e.load_id=l.id and e.settlement_id=new.id and e.status='POSTED' and e.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU'))
   or l.gross_cents is distinct from (select coalesce(sum(e.amount_cents),0) from public.rr_lease_ledger_entries e where e.load_id=l.id and e.settlement_id=new.id and e.status='POSTED' and e.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU','LUMPER_REIMBURSEMENT')))) then raise exception 'Itemized load total does not match verified invoice or Amazon report'; end if;
  if exists(select 1 from public.rr_lease_ledger_entries e where e.settlement_id=new.id and e.status='POSTED' and e.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') and not rr_lease_private.phase1_load_eligible(e.load_id)) then raise exception 'Revenue lacks verified load evidence'; end if;
  select coalesce(sum(driver_effect_cents),0) into due from public.rr_lease_ledger_entries where settlement_id=new.id and status='POSTED';
  if due<0 then raise exception 'Negative balance must be explicitly carried forward with approved evidence before issue'; end if;
  insert into public.rr_lease_settlement_snapshots(settlement_id,operator_id,net_cents,snapshot)
  select new.id,new.operator_id,due::bigint,jsonb_build_object('currency',new.currency,'week_start',new.week_start,'entries',coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id) filter(where e.id is not null),'[]'::jsonb))
  from public.rr_lease_ledger_entries e where e.settlement_id=new.id and e.status='POSTED';
 end if;
 return new;
end $$;

-- Ensure an already issued Amazon report cannot be silently rewritten.
create function rr_lease_private.phase1_amazon_frozen() returns trigger language plpgsql set search_path='' as $$
begin
 if old.load_id is not null and exists(select 1 from public.rr_lease_loads l join public.rr_lease_settlements s on s.id=l.settlement_id where l.id=old.load_id and s.status<>'draft') then raise exception 'Issued Amazon evidence is immutable; use an adjustment'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function rr_lease_private.phase1_amazon_frozen() from public,anon,authenticated;
create trigger rr_phase1_amazon_frozen before update or delete on public.rr_lease_amazon_import_rows for each row execute function rr_lease_private.phase1_amazon_frozen();
