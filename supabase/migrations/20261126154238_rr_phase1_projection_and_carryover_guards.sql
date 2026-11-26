
create unique index rr_phase1_legacy_load_once on public.rr_lease_ledger_entries(source_id,settlement_id) where source_kind='LEGACY_LOAD';
create unique index rr_phase1_legacy_adjustment_once on public.rr_lease_ledger_entries(source_id) where source_kind='LEGACY_ADJUSTMENT';

create or replace function rr_lease_private.phase1_ledger_guard() returns trigger language plpgsql set search_path='' as $$
declare s record; l record; o uuid;
begin
 for s in select id,status from public.rr_lease_settlements
 where id in (case when tg_op<>'INSERT' then old.settlement_id end,case when tg_op<>'DELETE' then new.settlement_id end)
 order by id for update loop
   if s.status<>'draft' then raise exception 'LOCKED settlement: ledger insert/update/delete denied'; end if;
 end loop;
 if tg_op<>'INSERT' and old.entry_type='CARRYOVER_IN' and exists(select 1 from public.rr_lease_ledger_entries e join public.rr_lease_settlements st on st.id=e.settlement_id where e.id=old.reversal_of_id and st.status in ('issued','paid')) then
  if tg_op='DELETE' then raise exception 'Carry-in from locked history cannot be removed'; end if;
  if row(new.amount_cents,new.status,new.entry_type,new.reversal_of_id,new.settlement_id,new.paid_by) is distinct from row(old.amount_cents,old.status,old.entry_type,old.reversal_of_id,old.settlement_id,old.paid_by) then raise exception 'Carry-in from locked history cannot be altered'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' and row(new.id,new.operator_id,new.source_kind,new.source_id,new.idempotency_key) is distinct from row(old.id,old.operator_id,old.source_kind,old.source_id,old.idempotency_key) then raise exception 'Ledger identity is immutable'; end if;
 if new.status<>'VOID' then
  if new.source_kind='LEGACY_LOAD' and not exists(select 1 from public.rr_lease_loads z where z.id=new.source_id and z.id=new.load_id and z.operator_id=new.operator_id and z.settlement_id=new.settlement_id and z.ledger_mode='LEGACY_TOTAL' and z.gross_cents=new.amount_cents and z.fee_bps=new.fee_bps and new.idempotency_key='load:'||z.id::text||':'||z.settlement_id::text and new.entry_type=case when z.load_type='TONU' then 'TONU' else 'FREIGHT' end) then raise exception 'Invalid legacy load projection'; end if;
  if new.source_kind='LEGACY_ADJUSTMENT' and not exists(select 1 from public.rr_lease_adjustments z where z.id=new.source_id and z.operator_id=new.operator_id and z.settlement_id=new.settlement_id and z.amount_cents=new.amount_cents and z.paid_by=new.paid_by and upper(z.kind)=new.entry_type and new.idempotency_key='adjustment:'||z.id::text) then raise exception 'Invalid legacy adjustment projection'; end if;
 end if;
 if new.load_id is not null then
   select * into strict l from public.rr_lease_loads where id=new.load_id and operator_id=new.operator_id;
   if new.source_document_id is not null and not exists(select 1 from public.rr_lease_documents d where d.id=new.source_document_id and d.load_id=l.id and d.is_ready) then raise exception 'Unmatched load proof'; end if;
   if new.status<>'VOID' and new.source_kind not in ('LEGACY_LOAD','LEGACY_ADJUSTMENT') and new.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') and l.settlement_id=new.settlement_id and l.ledger_mode<>'ITEMIZED' then raise exception 'Itemized revenue requires ITEMIZED load; no duplicate legacy revenue'; end if;
   if new.status='POSTED' and new.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') and new.fee_bps<>l.fee_bps then raise exception 'Fee must match frozen load rate'; end if;
 elsif new.source_kind not in ('LEGACY_LOAD','LEGACY_ADJUSTMENT') and new.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') then raise exception 'Revenue requires load'; end if;
 if new.approved_by is not null then
   select carrier_user_id into strict o from public.rr_lease_operators where id=new.operator_id;
   if new.approved_by<>o then raise exception 'Only carrier approves ledger'; end if;
 end if;
 new.updated_at=clock_timestamp(); return new;
end $$;
create or replace function rr_lease_private.phase1_sync_adjustment(p_id uuid) returns void
language plpgsql set search_path='' as $$
declare a public.rr_lease_adjustments;
begin
 select * into strict a from public.rr_lease_adjustments where id=p_id;
 insert into public.rr_lease_ledger_entries(operator_id,settlement_id,source_kind,source_id,entry_type,amount_cents,fee_bps,paid_by,status,description,source_wallet_document_id,source_reference,idempotency_key)
 values(a.operator_id,a.settlement_id,'LEGACY_ADJUSTMENT',a.id,upper(a.kind),a.amount_cents,0,a.paid_by,'POSTED',a.description,a.wallet_document_id,a.evidence_reference,'adjustment:'||a.id::text)
 on conflict(operator_id,idempotency_key) do update set
 entry_type=excluded.entry_type,amount_cents=excluded.amount_cents,paid_by=excluded.paid_by,status=case when rr_lease_ledger_entries.status='HELD' then 'HELD' else 'POSTED' end,description=excluded.description,source_wallet_document_id=excluded.source_wallet_document_id,source_reference=excluded.source_reference
 where row(rr_lease_ledger_entries.entry_type,rr_lease_ledger_entries.amount_cents,rr_lease_ledger_entries.paid_by,rr_lease_ledger_entries.description,rr_lease_ledger_entries.source_wallet_document_id,rr_lease_ledger_entries.source_reference)
 is distinct from row(excluded.entry_type,excluded.amount_cents,excluded.paid_by,excluded.description,excluded.source_wallet_document_id,excluded.source_reference)
 or rr_lease_ledger_entries.status='VOID';
end $$;
