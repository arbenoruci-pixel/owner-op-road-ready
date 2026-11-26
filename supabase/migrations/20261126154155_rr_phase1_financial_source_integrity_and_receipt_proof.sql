
-- Tighten permissions against bypass via TRUNCATE and accidental public grants.
revoke all on public.rr_lease_ledger_entries,public.rr_lease_factoring_events,public.rr_lease_settlement_snapshots,public.rr_lease_audit_events,public.rr_lease_amazon_import_rows from service_role;
grant select,insert,update,delete on public.rr_lease_ledger_entries to service_role;
grant select,insert,update on public.rr_lease_factoring_events,public.rr_lease_amazon_import_rows to service_role;
grant select,insert on public.rr_lease_settlement_snapshots,public.rr_lease_audit_events to service_role;
-- Preserve all existing source data. Only actual documented POD receipt times can be recorded.
alter table public.rr_lease_loads add column pod_receipt_reference text;
alter table public.rr_lease_loads add constraint rr_phase1_pod_receipt_proof check((pod_received_at is null and pod_receipt_reference is null) or (pod_received_at is not null and nullif(btrim(pod_receipt_reference),'') is not null));
create or replace function rr_lease_private.phase1_receipt_clock() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if old.pod_received_at is not null and (new.pod_received_at is null or new.pod_received_at>=old.pod_received_at) then
   new.pod_received_at=old.pod_received_at; new.pod_receipt_reference=old.pod_receipt_reference;
  end if;
  if old.required_docs_submitted_at is not null then new.required_docs_submitted_at=least(old.required_docs_submitted_at,new.required_docs_submitted_at); end if;
 end if;
 return new;
end $$;
-- A receipt is evidence of POD arrival. It is separate from receipt of all paperwork.
create function rr_lease_private.phase1_record_pod_receipt(p_load uuid,p_received_at timestamptz,p_reference text) returns void
language plpgsql set search_path='' as $$
begin
 if p_received_at is null or not isfinite(p_received_at) or p_received_at>clock_timestamp() or nullif(btrim(p_reference),'') is null then raise exception 'Actual POD receipt time and proof required'; end if;
 update public.rr_lease_loads set pod_received_at=p_received_at,pod_receipt_reference=btrim(p_reference) where id=p_load and billing_channel='FIRSTLINE_FACTORED' and load_type='FREIGHT';
 if not found then raise exception 'POD receipt applies to a freight load only'; end if;
end $$;
revoke all on function rr_lease_private.phase1_record_pod_receipt(uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function rr_lease_private.phase1_record_pod_receipt(uuid,timestamptz,text) to service_role;

create or replace function rr_lease_private.phase1_load_eligible(p_load uuid) returns boolean
language sql stable set search_path='' as $$
 select coalesce((
 select l.gross_cents is not null and case
 when l.billing_channel='AMAZON_DIRECT' then exists(
   select 1 from public.rr_lease_amazon_import_rows a
   where a.load_id=l.id and a.operator_id=l.operator_id and a.source_kind='RELAY_CSV'
   and a.verified_at is not null and a.amount_cents=l.gross_cents
   and ((l.load_type='TONU' and a.report_status='TONU' and l.cancelled_at is not null)
   or (l.load_type='FREIGHT' and a.report_status in ('COMPLETED','PAID') and l.status in ('delivered','closed'))))
 when l.load_type='TONU' then l.cancelled_at is not null and exists(select 1 from public.rr_lease_documents d join public.rr_lease_mail_events m on m.document_id=d.id and m.load_id=l.id where d.id=l.tonu_confirmation_id and d.load_id=l.id and d.kind in ('ratecon','supporting') and d.is_ready and m.verified_for_billing)
 else l.status in ('delivered','closed') and l.actual_delivery_date is not null and exists(select 1 from public.rr_lease_documents d join public.rr_lease_mail_events m on m.document_id=d.id and m.load_id=l.id where d.id=l.final_pod_id and d.load_id=l.id and d.kind='pod' and d.is_ready and m.verified_for_billing)
 and exists(select 1 from public.rr_lease_documents d join public.rr_lease_mail_events m on m.document_id=d.id and m.load_id=l.id where d.load_id=l.id and d.kind='ratecon' and d.is_ready and d.is_current and m.verified_for_billing)
 end from public.rr_lease_loads l where l.id=p_load),false)
$$;
-- Ensure that later proof review, including revocation, updates draft eligibility.
create trigger rr_phase1_mail_evidence_sync after insert or update or delete on public.rr_lease_mail_events for each row execute function rr_lease_private.phase1_evidence_sync();
create trigger rr_phase1_document_current_sync after update of is_current on public.rr_lease_documents for each row execute function rr_lease_private.phase1_evidence_sync();

-- Amazon identity normalization; distinct trips within a block remain possible.
alter table public.rr_lease_loads add constraint rr_phase1_amazon_load_trim check(
 (amazon_trip_id is null or (amazon_trip_id=btrim(amazon_trip_id) and amazon_trip_id<>'')) and
 (amazon_block_id is null or (amazon_block_id=btrim(amazon_block_id) and amazon_block_id<>'')));
create unique index rr_phase1_amazon_trip_normalized on public.rr_lease_loads(upper(amazon_trip_id)) where amazon_trip_id is not null;
create unique index rr_phase1_amazon_block_normalized on public.rr_lease_loads(upper(amazon_block_id)) where amazon_block_id is not null and amazon_trip_id is null;
alter table public.rr_lease_amazon_import_rows add constraint rr_phase1_amazon_import_trim check(
 (amazon_trip_id is null or amazon_trip_id=btrim(amazon_trip_id)) and
 (amazon_block_id is null or amazon_block_id=btrim(amazon_block_id)));
create unique index rr_phase1_amazon_import_trip_normalized on public.rr_lease_amazon_import_rows(carrier_user_id,upper(amazon_trip_id)) where amazon_trip_id is not null;
create unique index rr_phase1_amazon_import_block_normalized on public.rr_lease_amazon_import_rows(carrier_user_id,upper(amazon_block_id)) where amazon_block_id is not null and amazon_trip_id is null;
create function rr_lease_private.phase1_amazon_broker_channel() returns trigger language plpgsql set search_path='' as $$
begin
 if lower(btrim(new.broker_name)) in ('amazon','amazon relay','amazon logistics','amazon.com','amazon logistics inc','amazon logistics, inc.') then
  if exists(select 1 from public.rr_lease_factoring where load_id=new.id) then raise exception 'Amazon broker requires direct channel review'; end if;
  new.billing_channel='AMAZON_DIRECT';
 end if;
 if new.amazon_trip_id is not null then new.amazon_trip_id=upper(btrim(new.amazon_trip_id)); end if;
 if new.amazon_block_id is not null then new.amazon_block_id=upper(btrim(new.amazon_block_id)); end if;
 return new;
end $$;
revoke all on function rr_lease_private.phase1_amazon_broker_channel() from public,anon,authenticated;
create trigger rr_phase1_amazon_broker_channel before insert or update on public.rr_lease_loads for each row execute function rr_lease_private.phase1_amazon_broker_channel();
create function rr_lease_private.phase1_amazon_import_normalize() returns trigger language plpgsql set search_path='' as $$
begin
 if new.amazon_trip_id is not null then new.amazon_trip_id=upper(btrim(new.amazon_trip_id)); end if;
 if new.amazon_block_id is not null then new.amazon_block_id=upper(btrim(new.amazon_block_id)); end if;
 return new;
end $$;
revoke all on function rr_lease_private.phase1_amazon_import_normalize() from public,anon,authenticated;
create trigger rr_phase1_amazon_a_normalize before insert or update on public.rr_lease_amazon_import_rows for each row execute function rr_lease_private.phase1_amazon_import_normalize();

-- Reversal and carry-forward retain an immutable reference to the original line.
create unique index rr_phase1_one_reversal on public.rr_lease_ledger_entries(reversal_of_id) where entry_type='REVERSAL' and status<>'VOID';
create unique index rr_phase1_one_carry_in on public.rr_lease_ledger_entries(reversal_of_id) where entry_type='CARRYOVER_IN' and status<>'VOID';
create unique index rr_phase1_item_proof_once on public.rr_lease_ledger_entries(operator_id,load_id,entry_type,source_document_id) where source_kind in ('MANUAL','AMAZON_CSV') and source_document_id is not null and status<>'VOID';
create function rr_lease_private.phase1_ledger_source_guard() returns trigger language plpgsql set search_path='' as $$
declare original record; l record; new_week date;
begin
 if new.source_document_id is not null and not exists(select 1 from public.rr_lease_documents d join public.rr_lease_loads z on z.id=d.load_id where d.id=new.source_document_id and z.operator_id=new.operator_id and d.is_ready) then raise exception 'Document belongs to a different operator or is incomplete'; end if;
 if new.status='VOID' then return new; end if;
 if new.source_kind in ('MANUAL','AMAZON_CSV') and new.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU','LUMPER_REIMBURSEMENT','LUMPER_PREPAID') then
  if new.load_id is null then raise exception 'Revenue and lumper require a specific load'; end if;
  select * into strict l from public.rr_lease_loads where id=new.load_id and operator_id=new.operator_id;
  if l.settlement_id is distinct from new.settlement_id then
   if new.entry_type not in ('DETENTION','LAYOVER','LUMPER_REIMBURSEMENT','LUMPER_PREPAID') or new.source_document_id is null or not exists(select 1 from public.rr_lease_settlements s where s.id=l.settlement_id and s.status in ('issued','paid')) then raise exception 'Different settlement requires documented late accessorial'; end if;
  elsif l.ledger_mode<>'ITEMIZED' then raise exception 'Use itemized load components to avoid duplicate revenue'; end if;
  if new.source_kind='AMAZON_CSV' and l.billing_channel<>'AMAZON_DIRECT' then raise exception 'Amazon CSV cannot book a factored load'; end if;
 end if;
 if new.entry_type in ('REVERSAL','CARRYOVER_IN') then
  select e.*,s.week_start,s.status as settlement_status into strict original from public.rr_lease_ledger_entries e join public.rr_lease_settlements s on s.id=e.settlement_id where e.id=new.reversal_of_id and e.operator_id=new.operator_id;
  select week_start into strict new_week from public.rr_lease_settlements where id=new.settlement_id;
  if original.status<>'POSTED' or original.week_start>=new_week or new.amount_cents<>-original.driver_effect_cents or new.paid_by<>'carrier' then raise exception 'Reversal must match an earlier posted amount'; end if;
  if new.entry_type='REVERSAL' and original.settlement_status not in ('issued','paid') then raise exception 'Reverse locked history only'; end if;
  if new.entry_type='CARRYOVER_IN' and original.entry_type<>'CARRYOVER_OUT' then raise exception 'Carryover must pair with an earlier carry-out'; end if;
 end if;
 if new.entry_type='CARRYOVER_OUT' and (new.amount_cents<=0 or new.paid_by<>'carrier') then raise exception 'Carry-out must offset actual negative balance'; end if;
 return new;
end $$;
revoke all on function rr_lease_private.phase1_ledger_source_guard() from public,anon,authenticated;
create trigger rr_phase1_ledger_source before insert or update on public.rr_lease_ledger_entries for each row execute function rr_lease_private.phase1_ledger_source_guard();

-- Protect against accidentally missing source projections or duplicate count at issuance.
create function rr_lease_private.phase1_issue_integrity() returns trigger language plpgsql set search_path='' as $$
declare raw_balance numeric; carry numeric;
begin
 if old.status='draft' and new.status='issued' then
  if exists(select 1 from public.rr_lease_loads l where l.settlement_id=new.id and l.ledger_mode='LEGACY_TOTAL' and not exists(
   select 1 from public.rr_lease_ledger_entries e where e.settlement_id=new.id and e.load_id=l.id and e.source_kind='LEGACY_LOAD' and e.source_id=l.id and e.status='POSTED' and e.amount_cents=l.gross_cents and e.fee_bps=l.fee_bps)) then raise exception 'Missing or mismatched load ledger projection'; end if;
  if exists(select 1 from public.rr_lease_adjustments a where a.settlement_id=new.id and not exists(select 1 from public.rr_lease_ledger_entries e where e.settlement_id=new.id and e.source_kind='LEGACY_ADJUSTMENT' and e.source_id=a.id and e.status in ('POSTED','HELD') and e.amount_cents=a.amount_cents and e.driver_effect_cents=a.settlement_effect_cents)) then raise exception 'Missing or mismatched adjustment ledger projection'; end if;
  if exists(select 1 from public.rr_lease_ledger_entries e where e.settlement_id=new.id and e.status='POSTED' and e.source_kind='LEGACY_ADJUSTMENT' and not exists(select 1 from public.rr_lease_adjustments a where a.id=e.source_id and a.settlement_id=new.id)) then raise exception 'Orphan legacy adjustment'; end if;
  select coalesce(sum(driver_effect_cents) filter(where entry_type<>'CARRYOVER_OUT'),0),coalesce(sum(driver_effect_cents) filter(where entry_type='CARRYOVER_OUT'),0) into raw_balance,carry from public.rr_lease_ledger_entries where settlement_id=new.id and status='POSTED';
  if carry<>greatest(-raw_balance,0) then raise exception 'Carry-out must equal exact negative balance'; end if;
  if exists(select 1 from public.rr_lease_ledger_entries e where e.settlement_id=new.id and e.status='POSTED' and e.entry_type='CARRYOVER_OUT' and not exists(
   select 1 from public.rr_lease_ledger_entries next where next.reversal_of_id=e.id and next.entry_type='CARRYOVER_IN' and next.status='POSTED' and next.driver_effect_cents=-e.driver_effect_cents)) then raise exception 'Carry-out requires paired entry in later settlement'; end if;
  if exists(select 1 from public.rr_lease_ledger_entries e join public.rr_lease_ledger_entries prev on prev.id=e.reversal_of_id join public.rr_lease_settlements s on s.id=prev.settlement_id where e.settlement_id=new.id and e.status='POSTED' and e.entry_type='CARRYOVER_IN' and s.status not in ('issued','paid')) then raise exception 'Carry-in requires issued prior settlement'; end if;
 end if;
 return new;
end $$;
revoke all on function rr_lease_private.phase1_issue_integrity() from public,anon,authenticated;
create trigger rr_phase1_issue_integrity before update of status on public.rr_lease_settlements for each row execute function rr_lease_private.phase1_issue_integrity();

-- Do not present unverified draft costs as established debt.
create or replace view public.rr_lease_settlement_totals with(security_invoker=true) as
 select s.id as settlement_id,s.operator_id,s.week_start,s.status,s.currency,
 t.load_count,t.gross_cents,t.operator_share_cents,t.carrier_share_cents,t.carrier_deduction_cents,t.credit_cents,t.operator_paid_cents,
 t.estimated_net_cents,
 case when t.all_confirmed and r.reviewed=3 then greatest(t.verified_net_cents,0) else null::numeric end as net_cents,
 r.reviewed=3 as costs_reviewed,r.deferred>0 as has_deferred_costs,
 t.verified_net_cents, case when t.all_confirmed and r.reviewed=3 then greatest(-t.verified_net_cents,0) else 0::numeric end as negative_balance_cents
 from public.rr_lease_settlements s
 cross join lateral rr_lease_private.phase1_ledger_totals(s.id) t
 cross join lateral (select count(*) as reviewed,count(*) filter(where c.outcome='deferred') as deferred from public.rr_lease_cost_reviews c where c.settlement_id=s.id) r;

-- On already-posted history, a source change never recalculates a paid week.
