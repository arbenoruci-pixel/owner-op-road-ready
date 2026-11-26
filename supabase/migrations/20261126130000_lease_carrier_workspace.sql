begin;

alter table public.rr_lease_operators add column workspace_kind text not null default 'leased'
  check(workspace_kind in ('leased','carrier')),
  add constraint rr_lease_carrier_terms check(workspace_kind <> 'carrier' or
    (driver_user_id is null and share_bps=10000 and pay_weekday is null));
create unique index rr_lease_one_carrier_workspace on public.rr_lease_operators(carrier_user_id)
  where workspace_kind='carrier';

create function rr_lease_private.fixed_workspace_identity() returns trigger
language plpgsql set search_path='' as $$
begin
  if row(new.carrier_user_id,new.workspace_kind) is distinct from row(old.carrier_user_id,old.workspace_kind)
    then raise exception 'A workspace cannot move between carriers or accounting roles'; end if;
  return new;
end $$;
create trigger rr_lease_operator_identity before update of carrier_user_id,workspace_kind on public.rr_lease_operators
  for each row execute function rr_lease_private.fixed_workspace_identity();

-- The owner's dispatch mailbox identifies incoming paperwork. Only the registered carrier UID authenticates.
create or replace function public.rr_lease_claim_membership() returns integer
language plpgsql security definer set search_path='' as $$
declare claimed integer;
begin
  update public.rr_lease_operators o set driver_user_id=u.id
  from rr_lease_private.operator_invites i, auth.users u
  where o.workspace_kind='leased' and u.id=auth.uid() and u.email_confirmed_at is not null
    and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false
    and lower(u.email)=i.email and i.operator_id=o.id and o.driver_user_id is null and o.carrier_user_id<>u.id;
  get diagnostics claimed=row_count;
  return claimed;
end $$;
create or replace function public.rr_lease_email_login_allowed(p_email text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from rr_lease_private.operator_invites i join public.rr_lease_operators o on o.id=i.operator_id
      where o.workspace_kind='leased' and i.email=lower(btrim(p_email)) and o.driver_user_id is null
    union all
    select 1 from auth.users u join public.rr_lease_operators o on u.id in(o.driver_user_id,o.carrier_user_id)
      where lower(u.email)=lower(btrim(p_email)) and u.email_confirmed_at is not null
        and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false
  )
$$;

create function rr_lease_private.distinct_dispatch_mailboxes() returns trigger
language plpgsql set search_path='' as $$
declare target public.rr_lease_operators;
begin
  select * into strict target from public.rr_lease_operators where id=new.operator_id;
  perform pg_advisory_xact_lock(hashtextextended(target.carrier_user_id::text||':email:'||new.email,0));
  if exists(select 1 from rr_lease_private.operator_invites i join public.rr_lease_operators o on o.id=i.operator_id
    where o.carrier_user_id=target.carrier_user_id and i.operator_id<>new.operator_id and i.email=new.email
      and o.workspace_kind<>target.workspace_kind) then raise exception 'Dispatch mailbox belongs to another workspace'; end if;
  return new;
end $$;
create trigger rr_lease_distinct_dispatch_emails before insert or update on rr_lease_private.operator_invites
  for each row execute function rr_lease_private.distinct_dispatch_mailboxes();

create function public.rr_lease_register_carrier_workspace(
  p_carrier_user_id uuid,p_company_name text,p_driver_name text,p_verified_owner_email text
) returns uuid language plpgsql security definer set search_path='' as $$
declare target public.rr_lease_operators; mailbox text=lower(btrim(p_verified_owner_email));
begin
  if mailbox is null or mailbox !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Verified source mailbox is required'; end if;
  if not exists(select 1 from auth.users u where u.id=p_carrier_user_id and u.email_confirmed_at is not null
    and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false) then raise exception 'Confirmed carrier account is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_carrier_user_id::text||':own workspace',0));
  select * into target from public.rr_lease_operators where carrier_user_id=p_carrier_user_id and workspace_kind='carrier';
  if target.id is not null then
    if row(target.driver_name,target.company_name) is distinct from row(btrim(p_driver_name),btrim(p_company_name)) or
       not exists(select 1 from rr_lease_private.operator_invites where operator_id=target.id and email=mailbox)
      then raise exception 'Existing carrier workspace details differ; review before changing identity'; end if;
    return target.id;
  end if;
  insert into public.rr_lease_operators(carrier_user_id,company_name,driver_name,share_bps,workspace_kind)
    values(p_carrier_user_id,btrim(p_company_name),btrim(p_driver_name),10000,'carrier') returning * into target;
  insert into rr_lease_private.operator_invites(operator_id,email) values(target.id,mailbox);
  return target.id;
end $$;
revoke all on function public.rr_lease_register_carrier_workspace(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.rr_lease_register_carrier_workspace(uuid,text,text,text) to service_role;

create function rr_lease_private.check_workspace_terms() returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.rr_lease_operators where id=new.operator_id and workspace_kind='carrier') then
    if tg_table_name='rr_lease_settlements' then raise exception 'A carrier haul does not create a contractor settlement'; end if;
    if new.share_bps is distinct from 10000 then raise exception 'Own haul carries the entire rate'; end if;
  end if;
  return new;
end $$;
create trigger rr_lease_own_settlement before insert or update of operator_id on public.rr_lease_settlements
  for each row execute function rr_lease_private.check_workspace_terms();
-- This runs after the existing load_change trigger has populated the agreed rate split.
create trigger rr_lease_own_terms before insert or update of operator_id,share_bps on public.rr_lease_loads
  for each row execute function rr_lease_private.check_workspace_terms();

create table public.rr_lease_owner_expenses(
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.rr_lease_operators(id),
  purchased_on date not null,
  kind text not null check(kind in ('fuel','eld','insurance','other')),
  amount_cents bigint not null check(amount_cents<>0 and abs(amount_cents::numeric)<=100000000000),
  description text not null check(length(btrim(description)) between 1 and 500),
  evidence_reference text not null check(length(btrim(evidence_reference)) between 1 and 500),
  wallet_document_id uuid not null unique,
  reverses_id uuid,
  created_at timestamptz not null default now(),
  unique(operator_id,id),
  foreign key(operator_id,wallet_document_id) references public.rr_lease_wallet_documents(operator_id,id),
  foreign key(operator_id,reverses_id) references public.rr_lease_owner_expenses(operator_id,id),
  check((amount_cents<0)=(reverses_id is not null))
);
create unique index rr_lease_owner_expense_source on public.rr_lease_owner_expenses(operator_id,lower(btrim(evidence_reference)));
create index rr_lease_owner_expense_date on public.rr_lease_owner_expenses(operator_id,purchased_on desc,id);
alter table public.rr_lease_owner_expenses enable row level security;
revoke all on public.rr_lease_owner_expenses from public,anon,authenticated,service_role;
grant select on public.rr_lease_owner_expenses to authenticated;
grant select,insert on public.rr_lease_owner_expenses to service_role;
create policy rr_lease_own_expenses_read on public.rr_lease_owner_expenses for select to authenticated
  using(exists(select 1 from public.rr_lease_operators o where o.id=operator_id and o.workspace_kind='carrier' and o.carrier_user_id=(select auth.uid())));
create function rr_lease_private.validate_carrier_expense() returns trigger language plpgsql security definer set search_path='' as $$
declare source public.rr_lease_owner_expenses; remaining numeric;
begin
  if tg_op<>'INSERT' then raise exception 'Use an evidenced adjustment to correct a posted carrier expense'; end if;
  if not exists(select 1 from public.rr_lease_operators where id=new.operator_id and workspace_kind='carrier')
    then raise exception 'Own expenses require the carrier workspace'; end if;
  if not isfinite(new.purchased_on) or new.purchased_on>(now() at time zone 'Pacific/Kiritimati')::date
    then raise exception 'A real purchase date is required'; end if;
  if not exists(select 1 from public.rr_lease_wallet_documents d where d.id=new.wallet_document_id and d.operator_id=new.operator_id
        and d.is_ready and (d.category='expense_receipt' or (new.kind='fuel' and d.category='fuel_receipt')
          or (new.kind='insurance' and d.category='insurance')))
    then raise exception 'Verified expense evidence for the same operator is required'; end if;
  if new.reverses_id is not null then
    select * into strict source from public.rr_lease_owner_expenses where id=new.reverses_id and operator_id=new.operator_id for update;
    select source.amount_cents+coalesce(sum(amount_cents),0) into remaining from public.rr_lease_owner_expenses where reverses_id=source.id;
    if source.amount_cents<=0 or source.kind<>new.kind or new.purchased_on<source.purchased_on or remaining+new.amount_cents<0
      then raise exception 'Refund must match the original expense, available amount and purchase date'; end if;
  end if;
  return new;
end $$;
create trigger rr_lease_owner_expense_check before insert or update or delete on public.rr_lease_owner_expenses
  for each row execute function rr_lease_private.validate_carrier_expense();

create function public.rr_lease_record_owner_expense(
  p_operator_id uuid,p_purchased_on date,p_kind text,p_amount_cents bigint,p_description text,
  p_evidence_reference text,p_wallet_document_id uuid,p_reverses_id uuid default null
) returns uuid language plpgsql set search_path='' as $$
declare entry public.rr_lease_owner_expenses; ref text=btrim(p_evidence_reference);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_operator_id::text||':expense:'||lower(ref),0));
  select * into entry from public.rr_lease_owner_expenses where operator_id=p_operator_id and lower(btrim(evidence_reference))=lower(ref);
  if found then
    if row(entry.purchased_on,entry.kind,entry.amount_cents,entry.wallet_document_id,entry.reverses_id) is distinct from
       row(p_purchased_on,p_kind,p_amount_cents,p_wallet_document_id,p_reverses_id) then raise exception 'Source already recorded with different facts'; end if;
    return entry.id;
  end if;
  insert into public.rr_lease_owner_expenses(operator_id,purchased_on,kind,amount_cents,description,evidence_reference,wallet_document_id,reverses_id)
    values(p_operator_id,p_purchased_on,p_kind,p_amount_cents,btrim(p_description),ref,p_wallet_document_id,p_reverses_id) returning id into entry.id;
  return entry.id;
end $$;
revoke all on function public.rr_lease_record_owner_expense(uuid,date,text,bigint,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rr_lease_record_owner_expense(uuid,date,text,bigint,text,text,uuid,uuid) to service_role;

-- One Mudflap transaction may affect one ledger, even when receipts arrive in different mailboxes.
create table rr_lease_private.shared_fuel_references(
  carrier_user_id uuid not null references auth.users(id),
  reference text not null,
  ledger text not null,
  entry_id uuid not null,
  primary key(carrier_user_id,reference),
  unique(ledger,entry_id)
);
revoke all on rr_lease_private.shared_fuel_references from public,anon,authenticated,service_role;
create function rr_lease_private.reserve_shared_fuel_reference() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op<>'INSERT' then
    delete from rr_lease_private.shared_fuel_references where ledger=tg_table_name and entry_id=old.id;
  end if;
  if tg_op='DELETE' then return old; end if;
  if lower(btrim(new.evidence_reference)) like 'mudflap:%' then
    if lower(btrim(new.evidence_reference)) !~ '^mudflap:[a-z0-9][a-z0-9._:-]*$'
       or new.kind not in ('fuel','credit') then raise exception 'Use the stable Mudflap transaction or refund reference for fuel'; end if;
    if new.wallet_document_id is null then raise exception 'Mudflap posting requires the original private receipt'; end if;
    insert into rr_lease_private.shared_fuel_references(carrier_user_id,reference,ledger,entry_id)
      select carrier_user_id,lower(btrim(new.evidence_reference)),tg_table_name,new.id from public.rr_lease_operators where id=new.operator_id;
  end if;
  return new;
end $$;
create trigger rr_lease_owner_count_fuel after insert or update or delete on public.rr_lease_owner_expenses
  for each row execute function rr_lease_private.reserve_shared_fuel_reference();
create trigger rr_lease_settlement_count_fuel after insert or update or delete on public.rr_lease_adjustments
  for each row execute function rr_lease_private.reserve_shared_fuel_reference();
insert into rr_lease_private.shared_fuel_references(carrier_user_id,reference,ledger,entry_id)
  select o.carrier_user_id,lower(btrim(a.evidence_reference)),'rr_lease_adjustments',a.id
    from public.rr_lease_adjustments a join public.rr_lease_operators o on o.id=a.operator_id
    where lower(btrim(a.evidence_reference)) like 'mudflap:%';

-- Read only the original app's synchronized business-load records. Both representations are used
-- by recordsFrom(): normal individual rows and an array when old records had duplicate local IDs.
create function public.rr_lease_owner_legacy_loads(p_operator_id uuid)
returns table(legacy_key text,broker_name text,load_number text,pickup_date text,delivery_date text,origin text,destination text)
language plpgsql stable security invoker set search_path='' as $$
declare owner_id uuid;
begin
  select carrier_user_id into owner_id from public.rr_lease_operators where id=p_operator_id and workspace_kind='carrier'
    and carrier_user_id=(select auth.uid());
  if owner_id is null or to_regclass('public.road_ready_account_workspaces') is null then return; end if;
  return query with records as materialized (
    select payload->'records' as data from public.road_ready_account_workspaces where user_id=owner_id
  ), load_rows as (
    select k as source_key,data->k as item from records cross join lateral jsonb_object_keys(data) k
      where starts_with(k,'["business","loads",')
    union all
    select 'array:'||a.seq::text,a.item from records cross join lateral jsonb_array_elements(
      case when jsonb_typeof(data->'["business-array","loads"]')='array' then data->'["business-array","loads"]' else '[]'::jsonb end
    ) with ordinality a(item,seq)
  ), items as (
    select source_key,item,coalesce(nullif(btrim(item->>'broker'),''),btrim(item->>'brokerName')) as broker,
      coalesce(nullif(btrim(item->>'loadNo'),''),nullif(btrim(item->>'canonicalLoadNo'),''),btrim(item->>'loadNumber')) as number
    from load_rows
  )
  select i.source_key,i.broker,i.number,i.item->>'pickupDate',i.item->>'deliveryDate',i.item->>'origin',i.item->>'destination'
    from items i where nullif(i.number,'') is not null and not exists(
      select 1 from public.rr_lease_loads l join public.rr_lease_operators o on o.id=l.operator_id
      where o.carrier_user_id=owner_id and lower(btrim(l.load_number))=lower(i.number) and lower(btrim(l.broker_name))=lower(i.broker)
    )
    order by coalesce(i.item->>'deliveryDate',i.item->>'pickupDate') desc nulls last,i.source_key;
end $$;
revoke all on function public.rr_lease_owner_legacy_loads(uuid) from public,anon;
grant execute on function public.rr_lease_owner_legacy_loads(uuid) to authenticated;
commit;
