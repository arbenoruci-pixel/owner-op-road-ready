
-- Additive schema; no historical data is removed.
alter table public.rr_lease_operators add constraint rr_phase1_operator_share_range check(share_bps between 7000 and 10000);
alter table public.rr_lease_operators add column fee_bps integer generated always as (10000-share_bps) stored;
alter table public.rr_lease_operators add constraint rr_phase1_operator_fee_range check(fee_bps between 0 and 3000);
alter table public.rr_lease_loads add constraint rr_phase1_load_share_range check(share_bps between 7000 and 10000);
alter table public.rr_lease_loads add column fee_bps integer generated always as (10000-share_bps) stored;
alter table public.rr_lease_loads add constraint rr_phase1_load_fee_range check(fee_bps between 0 and 3000);
alter table public.rr_lease_loads add column pod_received_at timestamptz;
alter table public.rr_lease_loads add column billing_channel text not null default 'FIRSTLINE_FACTORED' check(billing_channel in ('AMAZON_DIRECT','FIRSTLINE_FACTORED'));
alter table public.rr_lease_loads add column load_type text not null default 'FREIGHT' check(load_type in ('FREIGHT','TONU'));
alter table public.rr_lease_loads add column amazon_trip_id text;
alter table public.rr_lease_loads add column amazon_block_id text;
alter table public.rr_lease_loads add column cancelled_at timestamptz;
alter table public.rr_lease_loads add column tonu_confirmation_id uuid references public.rr_lease_documents(id);
alter table public.rr_lease_loads add column ledger_mode text not null default 'LEGACY_TOTAL' check(ledger_mode in ('LEGACY_TOTAL','ITEMIZED'));
alter table public.rr_lease_loads add constraint rr_phase1_channel_ids check(billing_channel='AMAZON_DIRECT' or (amazon_trip_id is null and amazon_block_id is null));
create unique index rr_phase1_amazon_trip_unique on public.rr_lease_loads(amazon_trip_id) where amazon_trip_id is not null;
create unique index rr_phase1_amazon_block_only_unique on public.rr_lease_loads(amazon_block_id) where amazon_block_id is not null and amazon_trip_id is null;

-- Email signals can exist unassigned. Only a verified CSV row is official.
create table public.rr_lease_amazon_import_rows(
 id uuid primary key default gen_random_uuid(),
 carrier_user_id uuid not null references auth.users(id),
 operator_id uuid references public.rr_lease_operators(id),
 load_id uuid unique references public.rr_lease_loads(id),
 amazon_trip_id text, amazon_block_id text,
 source_kind text not null check(source_kind in ('EMAIL_SIGNAL','RELAY_CSV')),
 report_status text not null check(report_status in ('UNVERIFIED','COMPLETED','PAID','TONU','OTHER')),
 amount_cents bigint check(amount_cents between 0 and 100000000000),
 event_date date,
 source_ref text not null check(btrim(source_ref)<>''),
 csv_sha256 text check(csv_sha256 ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz, verified_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 check(amazon_trip_id is not null or amazon_block_id is not null),
 check(amazon_trip_id is null or btrim(amazon_trip_id)<>''),
 check(amazon_block_id is null or btrim(amazon_block_id)<>''),
 check(source_kind <> 'EMAIL_SIGNAL' or (verified_at is null and verified_by is null and report_status='UNVERIFIED')),
 check(verified_at is null or (source_kind='RELAY_CSV' and csv_sha256 is not null and verified_by=carrier_user_id and event_date is not null and amount_cents is not null)),
 check(load_id is null or operator_id is not null)
);
create unique index rr_phase1_amazon_import_trip_unique on public.rr_lease_amazon_import_rows(carrier_user_id,amazon_trip_id) where amazon_trip_id is not null;
create unique index rr_phase1_amazon_import_block_unique on public.rr_lease_amazon_import_rows(carrier_user_id,amazon_block_id) where amazon_block_id is not null and amazon_trip_id is null;
alter table public.rr_lease_amazon_import_rows enable row level security;
revoke all on public.rr_lease_amazon_import_rows from public,anon,authenticated;
grant select on public.rr_lease_amazon_import_rows to authenticated;
grant select,insert,update on public.rr_lease_amazon_import_rows to service_role;
create policy rr_phase1_amazon_owner_read on public.rr_lease_amazon_import_rows for select to authenticated using(carrier_user_id=(select auth.uid()));
create view public.v_owner_amazon_assignment_inbox with(security_invoker=true) as
 select id,amazon_trip_id,amazon_block_id,source_kind,report_status,amount_cents,event_date,created_at
 from public.rr_lease_amazon_import_rows where operator_id is null;
revoke all on public.v_owner_amazon_assignment_inbox from public,anon,authenticated;
grant select on public.v_owner_amazon_assignment_inbox to authenticated,service_role;

create table public.rr_lease_ledger_entries(
 id uuid primary key default gen_random_uuid(),
 operator_id uuid not null references public.rr_lease_operators(id),
 settlement_id uuid not null,
 load_id uuid,
 source_kind text not null check(source_kind in ('LEGACY_LOAD','LEGACY_ADJUSTMENT','MANUAL','AMAZON_CSV')),
 source_id uuid,
 entry_type text not null check(entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU','LUMPER_REIMBURSEMENT','LUMPER_PREPAID','INSURANCE','FUEL','ELD','ADVANCE','OTHER','CREDIT','CARRYOVER_IN','CARRYOVER_OUT','REVERSAL')),
 amount_cents bigint not null check(amount_cents between -100000000000 and 100000000000),
 fee_bps integer not null default 0 check(fee_bps between 0 and 3000),
 share_bps integer generated always as (10000-fee_bps) stored check(share_bps between 7000 and 10000),
 paid_by text not null default 'carrier' check(paid_by in ('carrier','operator')),
 driver_effect_cents bigint generated always as (
 case when entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') then (amount_cents*(10000-fee_bps)+5000)/10000
 when paid_by='operator' and entry_type in ('INSURANCE','FUEL','ELD','ADVANCE','OTHER') then 0
 else amount_cents end) stored,
 carrier_effect_cents bigint generated always as (
 case when entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') then amount_cents-(amount_cents*(10000-fee_bps)+5000)/10000 else 0 end) stored,
 status text not null default 'DRAFT' check(status in ('DRAFT','POSTED','HELD','VOID')),
 description text not null check(btrim(description)<>''),
 source_document_id uuid references public.rr_lease_documents(id),
 source_wallet_document_id uuid,
 source_reference text,
 approved_by uuid references auth.users(id),
 reversal_of_id uuid,
 idempotency_key text not null check(btrim(idempotency_key)<>''),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(operator_id,id),
 unique(operator_id,idempotency_key),
 foreign key(operator_id,settlement_id) references public.rr_lease_settlements(operator_id,id),
 foreign key(operator_id,load_id) references public.rr_lease_loads(operator_id,id) on delete set null(load_id),
 foreign key(operator_id,source_wallet_document_id) references public.rr_lease_wallet_documents(operator_id,id),
 foreign key(operator_id,reversal_of_id) references public.rr_lease_ledger_entries(operator_id,id),
 check(entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') or fee_bps=0),
 check(entry_type not in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU','LUMPER_REIMBURSEMENT','CREDIT','CARRYOVER_OUT') or amount_cents>=0),
 check(entry_type not in ('LUMPER_PREPAID','CARRYOVER_IN') or amount_cents<=0),
 check(source_kind not in ('LEGACY_LOAD','LEGACY_ADJUSTMENT') or source_id is not null),
 check(status<>'POSTED' or source_kind in ('LEGACY_LOAD','LEGACY_ADJUSTMENT') or (approved_by is not null and (source_document_id is not null or source_wallet_document_id is not null or nullif(btrim(source_reference),'') is not null))),
 check(entry_type not in ('REVERSAL','CARRYOVER_IN') or reversal_of_id is not null)
);
create index rr_phase1_ledger_settlement on public.rr_lease_ledger_entries(settlement_id,status);
create index rr_phase1_ledger_load on public.rr_lease_ledger_entries(load_id);
alter table public.rr_lease_ledger_entries enable row level security;
revoke all on public.rr_lease_ledger_entries from public,anon,authenticated;
grant select,insert,update,delete on public.rr_lease_ledger_entries to service_role;

create table public.rr_lease_factoring_events(
 id uuid primary key default gen_random_uuid(),
 operator_id uuid not null,
 load_id uuid not null,
 event_type text not null check(event_type in ('INVOICE','FUNDING','FEE','DEBIT','CREDIT','REJECTION','REVERSAL')),
 amount_cents bigint not null check(amount_cents between -100000000000 and 100000000000),
 event_at timestamptz not null,
 external_reference text not null check(btrim(external_reference)<>''),
 evidence_reference text not null check(btrim(evidence_reference)<>''),
 review_status text not null default 'PENDING_PROOF' check(review_status in ('PENDING_PROOF','VERIFIED','CANCELLED_BY_FACTOR')),
 reverses_id uuid references public.rr_lease_factoring_events(id),
 created_at timestamptz not null default now(),
 foreign key(operator_id,load_id) references public.rr_lease_loads(operator_id,id),
 unique(operator_id,external_reference,event_type)
);
alter table public.rr_lease_factoring_events enable row level security;
revoke all on public.rr_lease_factoring_events from public,anon,authenticated;
grant select,insert,update on public.rr_lease_factoring_events to service_role;

create table public.rr_lease_settlement_snapshots(
 settlement_id uuid primary key, operator_id uuid not null,
 issued_at timestamptz not null default now(),
 net_cents bigint not null check(net_cents>=0),
 snapshot jsonb not null,
 foreign key(operator_id,settlement_id) references public.rr_lease_settlements(operator_id,id)
);
alter table public.rr_lease_settlement_snapshots enable row level security;
revoke all on public.rr_lease_settlement_snapshots from public,anon,authenticated;
grant select,insert on public.rr_lease_settlement_snapshots to service_role;
create table public.rr_lease_audit_events(
 id bigint generated always as identity primary key,
 operator_id uuid not null references public.rr_lease_operators(id),
 entity_type text not null, entity_id uuid not null,
 event_type text not null, actor_id uuid, db_role text not null,
 before_data jsonb, after_data jsonb,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.rr_lease_audit_events enable row level security;
revoke all on public.rr_lease_audit_events from public,anon,authenticated;
grant select,insert on public.rr_lease_audit_events to service_role;
grant usage on sequence public.rr_lease_audit_events_id_seq to service_role;

create function rr_lease_private.phase1_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Immutable financial history'; end $$;
create trigger rr_phase1_snapshot_immutable before update or delete on public.rr_lease_settlement_snapshots for each row execute function rr_lease_private.phase1_immutable();
create trigger rr_phase1_audit_immutable before update or delete on public.rr_lease_audit_events for each row execute function rr_lease_private.phase1_immutable();

create function rr_lease_private.phase1_ledger_guard() returns trigger language plpgsql set search_path='' as $$
declare s record; l record; o uuid;
begin
 for s in select id,status from public.rr_lease_settlements
 where id in (case when tg_op<>'INSERT' then old.settlement_id end,case when tg_op<>'DELETE' then new.settlement_id end)
 order by id for update loop
   if s.status<>'draft' then raise exception 'LOCKED settlement: ledger insert/update/delete denied'; end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' and row(new.id,new.operator_id,new.source_kind,new.source_id,new.idempotency_key) is distinct from row(old.id,old.operator_id,old.source_kind,old.source_id,old.idempotency_key) then
   raise exception 'Ledger identity is immutable';
 end if;
 if new.load_id is not null then
   select * into strict l from public.rr_lease_loads where id=new.load_id and operator_id=new.operator_id;
   if new.source_document_id is not null and not exists(select 1 from public.rr_lease_documents d where d.id=new.source_document_id and d.load_id=l.id and d.is_ready) then raise exception 'Unmatched load proof'; end if;
   if new.source_kind not in ('LEGACY_LOAD','LEGACY_ADJUSTMENT') and new.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') and new.reversal_of_id is null and l.ledger_mode<>'ITEMIZED' then raise exception 'Itemized revenue requires ITEMIZED load; no duplicate legacy revenue'; end if;
   if new.status='POSTED' and new.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') and new.fee_bps<>l.fee_bps then raise exception 'Fee must match frozen load rate'; end if;
 elsif new.source_kind not in ('LEGACY_LOAD','LEGACY_ADJUSTMENT') and new.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') then raise exception 'Revenue requires load'; end if;
 if new.approved_by is not null then
   select carrier_user_id into strict o from public.rr_lease_operators where id=new.operator_id;
   if new.approved_by<>o then raise exception 'Only carrier approves ledger'; end if;
 end if;
 new.updated_at=clock_timestamp(); return new;
end $$;
create trigger rr_phase1_ledger_lock before insert or update or delete on public.rr_lease_ledger_entries for each row execute function rr_lease_private.phase1_ledger_guard();

create function rr_lease_private.phase1_ledger_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.rr_lease_audit_events(operator_id,entity_type,entity_id,event_type,actor_id,db_role,before_data,after_data)
 values(case when tg_op='DELETE' then old.operator_id else new.operator_id end,tg_table_name,case when tg_op='DELETE' then old.id else new.id end,tg_op,auth.uid(),current_setting('role',true),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function rr_lease_private.phase1_ledger_audit() from public,anon,authenticated;
create trigger rr_phase1_ledger_audit after insert or update or delete on public.rr_lease_ledger_entries for each row execute function rr_lease_private.phase1_ledger_audit();

create function rr_lease_private.phase1_load_meta_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if old.settlement_id is not null and exists(select 1 from public.rr_lease_settlements where id=old.settlement_id and status<>'draft') and row(new.billing_channel,new.load_type,new.amazon_trip_id,new.amazon_block_id,new.ledger_mode,new.cancelled_at,new.tonu_confirmation_id) is distinct from row(old.billing_channel,old.load_type,old.amazon_trip_id,old.amazon_block_id,old.ledger_mode,old.cancelled_at,old.tonu_confirmation_id) then raise exception 'LOCKED load billing metadata'; end if;
   if old.pod_received_at is not null then new.pod_received_at=least(old.pod_received_at,new.pod_received_at); end if;
 end if;
 if new.pod_received_at is not null and (not isfinite(new.pod_received_at) or new.pod_received_at>clock_timestamp()) then raise exception 'Use actual POD receipt time'; end if;
 if new.billing_channel='AMAZON_DIRECT' and exists(select 1 from public.rr_lease_factoring where load_id=new.id) then raise exception 'Amazon direct cannot have factoring claim'; end if;
 if new.billing_channel='AMAZON_DIRECT' and new.amazon_block_id is not null then
   perform pg_advisory_xact_lock(hashtextextended('rr-amazon-block:'||new.amazon_block_id,0));
   if exists(select 1 from public.rr_lease_loads l where l.id<>new.id and l.amazon_block_id=new.amazon_block_id and (l.amazon_trip_id is null or new.amazon_trip_id is null)) then raise exception 'Block and trip cannot both be payable'; end if;
 end if;
 return new;
end $$;
create trigger rr_phase1_load_meta before insert or update on public.rr_lease_loads for each row execute function rr_lease_private.phase1_load_meta_guard();

create function rr_lease_private.phase1_amazon_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.operator_id is not null and not exists(select 1 from public.rr_lease_operators o where o.id=new.operator_id and o.carrier_user_id=new.carrier_user_id) then raise exception 'Wrong operator for Amazon carrier'; end if;
 if new.load_id is not null and not exists(select 1 from public.rr_lease_loads l where l.id=new.load_id and l.operator_id=new.operator_id and l.billing_channel='AMAZON_DIRECT' and l.amazon_trip_id is not distinct from new.amazon_trip_id and l.amazon_block_id is not distinct from new.amazon_block_id) then raise exception 'Amazon load identity mismatch'; end if;
 if new.amazon_block_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('rr-amazon-import:'||new.carrier_user_id::text||':'||new.amazon_block_id,0));
  if exists(select 1 from public.rr_lease_amazon_import_rows r where r.id<>new.id and r.carrier_user_id=new.carrier_user_id and r.amazon_block_id=new.amazon_block_id and r.verified_at is not null and new.verified_at is not null and (r.amazon_trip_id is null or new.amazon_trip_id is null)) then raise exception 'Verified Amazon block and trips cannot both be paid'; end if;
 end if;
 if new.verified_at>clock_timestamp() then raise exception 'Invalid verification time'; end if;
 return new;
end $$;
create trigger rr_phase1_amazon_guard before insert or update on public.rr_lease_amazon_import_rows for each row execute function rr_lease_private.phase1_amazon_guard();

create function rr_lease_private.phase1_factor_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.rr_lease_loads l where l.id=new.load_id and l.billing_channel='FIRSTLINE_FACTORED') then raise exception 'FirstLine not allowed for AMAZON_DIRECT'; end if;
 return new;
end $$;
create trigger rr_phase1_factor_channel before insert or update on public.rr_lease_factoring for each row execute function rr_lease_private.phase1_factor_guard();
create trigger rr_phase1_factor_event_channel before insert or update on public.rr_lease_factoring_events for each row execute function rr_lease_private.phase1_factor_guard();

-- Restrict private trigger functions; no authenticated base access.
revoke all on function rr_lease_private.phase1_immutable(),rr_lease_private.phase1_ledger_guard(),rr_lease_private.phase1_load_meta_guard(),rr_lease_private.phase1_amazon_guard(),rr_lease_private.phase1_factor_guard() from public,anon,authenticated;

-- Driver read gateway returns only a deliberately limited projection.
create function rr_lease_private.phase1_driver_entries()
returns table(id uuid,operator_id uuid,settlement_id uuid,load_id uuid,entry_type text,amount_cents bigint,fee_bps integer,driver_effect_cents bigint,status text,description text,source_document_id uuid,source_wallet_document_id uuid,reversal_of_id uuid,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select e.id,e.operator_id,e.settlement_id,e.load_id,e.entry_type,e.amount_cents,e.fee_bps,e.driver_effect_cents,e.status,e.description,e.source_document_id,e.source_wallet_document_id,e.reversal_of_id,e.created_at
 from public.rr_lease_ledger_entries e join public.rr_lease_operators o on o.id=e.operator_id
 where auth.uid() is not null and (o.driver_user_id=auth.uid() or o.carrier_user_id=auth.uid()) and e.status<>'VOID'
$$;
revoke all on function rr_lease_private.phase1_driver_entries() from public,anon,authenticated;
grant execute on function rr_lease_private.phase1_driver_entries() to authenticated,service_role;
create view public.v_driver_ledger_entries with(security_invoker=true,security_barrier=true) as select * from rr_lease_private.phase1_driver_entries();
revoke all on public.v_driver_ledger_entries from public,anon,authenticated;
grant select on public.v_driver_ledger_entries to authenticated,service_role;
