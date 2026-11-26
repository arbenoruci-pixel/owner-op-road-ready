begin;

-- Financial review records are separate from the original freight, settlement and logbook.
create schema rr_driver_finance_private;
revoke all on schema rr_driver_finance_private from public;
grant usage on schema rr_driver_finance_private to authenticated;

create table rr_driver_finance_private.legacy_confirmations (
  operator_id uuid not null references public.rr_lease_operators(id),
  evidence_hash text not null,
  legacy_key text not null,
  broker_name text not null,
  load_number text not null,
  delivery_date date not null,
  gross_cents bigint not null check (gross_cents >= 0),
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  primary key (operator_id, evidence_hash)
);
alter table rr_driver_finance_private.legacy_confirmations enable row level security;
revoke all on rr_driver_finance_private.legacy_confirmations from public,anon,authenticated;
grant select on rr_driver_finance_private.legacy_confirmations to authenticated;
create policy owner_confirmation_read on rr_driver_finance_private.legacy_confirmations
  for select to authenticated using (public.rr_driver_tools_enabled(operator_id) and confirmed_by=(select auth.uid()) and
    coalesce(((select public.owner_op_access_v1())->>'approved')::boolean,false) and exists(
    select 1 from public.rr_lease_operators o where o.id=operator_id and o.workspace_kind='carrier' and o.carrier_user_id=(select auth.uid())
  ));

create function rr_driver_finance_private.broker_key(broker text)
returns text language sql immutable strict set search_path='' as $$
  with k as (select trim(regexp_replace(lower(broker),'[^a-z0-9]+',' ','g')) as name)
  select case
    when name in ('tql','total quality logistics','total quality logistics llc') then 'total quality logistics'
    when name in ('priority1','priority 1','priority one','priority1 inc','priority 1 inc','priority one inc') then 'priority 1'
    when name in ('klos logistics','klos logistics inc') then 'klos logistics'
    else lower(btrim(broker)) end from k
$$;
create function rr_driver_finance_private.test_reference(ref text)
returns boolean language sql immutable set search_path='' as $$
  select btrim(coalesce(ref,'')) ~* '^(test|demo|fixture|synthetic)($|[-_: /#])'
$$;
create function rr_driver_finance_private.check_quarter(day date)
returns void language plpgsql immutable set search_path='' as $$
begin
  if day is null or not isfinite(day) or day <> date_trunc('quarter',day::timestamp)::date then
    raise exception 'Select the first date of a calendar quarter' using errcode='22023';
  end if;
end $$;

-- An archived transfer folder by itself proves neither delivery nor driver identity.
-- Show it to its approved owner for review. A change to its financial facts invalidates
-- an earlier confirmation; a matching structured load anywhere in the fleet supersedes it.
create function public.rr_driver_quarter_legacy_loads(p_operator_id uuid,p_start date)
returns table(legacy_key text,load_number text,broker_name text,delivery_date date,gross_cents bigint,
  confirmed boolean,evidence_hash text,conflicting boolean)
language plpgsql stable security invoker set search_path='' as $$
declare owner_id uuid;
begin
  if not public.rr_driver_tools_enabled(p_operator_id) then raise exception 'Workspace access required' using errcode='42501'; end if;
  perform rr_driver_finance_private.check_quarter(p_start);
  select carrier_user_id into owner_id from public.rr_lease_operators
    where id=p_operator_id and workspace_kind='carrier' and carrier_user_id=(select auth.uid());
  if owner_id is null then return; end if;
  if not coalesce((public.owner_op_access_v1()->>'approved')::boolean,false) then
    raise exception 'Approved carrier sign-in is required for original freight folders' using errcode='42501';
  end if;
  return query with records as materialized (
    select payload->'records' as data from public.road_ready_account_workspaces where user_id=owner_id
  ), folders as (
    select k as source_key,data->k as item from records cross join lateral jsonb_object_keys(data) k
      where starts_with(k,'["business","loads",')
    union all
    select 'array:'||coalesce(nullif(a->>'id',''),encode(sha256(convert_to(a::text,'UTF8')),'hex')),a
    from records cross join lateral jsonb_array_elements(case when jsonb_typeof(data->'["business-array","loads"]')='array'
      then data->'["business-array","loads"]' else '[]'::jsonb end) a
  ), decoded as (
    select f.source_key,f.item,coalesce(nullif(btrim(item->>'loadNo'),''),nullif(btrim(item->>'canonicalLoadNo'),''),btrim(item->>'loadNumber')) as num,
      coalesce(nullif(btrim(item->>'broker'),''),btrim(item->>'brokerName')) as broker,
      item->>'deliveryDate' as day_text,
      case when btrim(item->>'gross') ~ '^[0-9]{1,10}([.][0-9]{1,2})?$'
        then (btrim(item->>'gross')::numeric*100)::bigint end as cents
    from folders f
  ), identities as (
    select d.*,rr_driver_finance_private.broker_key(broker) as broker_id,lower(num) as number_id,
      lower(coalesce(item->>'status','')) as state
    from decoded d where nullif(broker,'') is not null and nullif(num,'') is not null
      and not rr_driver_finance_private.test_reference(num)
      and not rr_driver_finance_private.test_reference(item->>'source')
      and lower(coalesce(item->>'isTest','false')) <> 'true'
  ), variants as (
    select i.broker_id,i.number_id,
      count(distinct jsonb_build_array(i.day_text,i.cents,i.state))>1 or
      bool_or(coalesce(nullif(i.item->>'operator_id',''),nullif(i.item->>'operatorId',''),p_operator_id::text) <> p_operator_id::text
        or coalesce(nullif(i.item->>'driver_user_id',''),owner_id::text) <> owner_id::text) as disputed
    from identities i group by i.broker_id,i.number_id
  ), eligible as (
    select distinct on(i.broker_id,i.number_id)
      i.source_key,i.num,i.broker,p_start + calendar.n as delivered,i.cents,v.disputed,i.broker_id,i.number_id
    from identities i join variants v using(broker_id,number_id)
    join generate_series(0,((p_start+interval '3 months')::date-p_start)-1) calendar(n)
      on i.day_text=to_char(p_start+calendar.n,'YYYY-MM-DD')
    where i.state in('archived','delivered','closed')
      and not exists(select 1 from public.rr_lease_loads l join public.rr_lease_operators o on o.id=l.operator_id
        where o.carrier_user_id=owner_id and lower(btrim(l.load_number))=i.number_id
          and rr_driver_finance_private.broker_key(l.broker_name)=i.broker_id)
    order by i.broker_id,i.number_id,i.source_key,i.day_text,i.cents,i.broker,i.num
  ), fingerprints as (
    select e.*,encode(sha256(convert_to(jsonb_build_array(p_operator_id,e.source_key,e.broker_id,e.number_id,
      e.delivered,e.cents)::text,'UTF8')),'hex') as digest from eligible e
  )
  select e.source_key,e.num,e.broker,e.delivered,e.cents,
    not e.disputed and exists(select 1 from rr_driver_finance_private.legacy_confirmations c where c.operator_id=p_operator_id
      and c.evidence_hash=e.digest),e.digest,e.disputed from fingerprints e;
end $$;

-- Validate the caller against the approved carrier identity on both the read and write.
-- External clients cannot directly insert, update or delete confirmations.
create function rr_driver_finance_private.confirm_legacy(p_operator_id uuid,p_start date,p_legacy_key text,p_evidence_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare candidate record;
begin
  if not public.rr_driver_tools_enabled(p_operator_id) or not exists(select 1 from public.rr_lease_operators where id=p_operator_id and workspace_kind='carrier'
    and carrier_user_id=(select auth.uid())) or not coalesce((public.owner_op_access_v1()->>'approved')::boolean,false) then
    raise exception 'Approved carrier sign-in is required' using errcode='42501';
  end if;
  select * into strict candidate from public.rr_driver_quarter_legacy_loads(p_operator_id,p_start) r
    where r.legacy_key=p_legacy_key and r.evidence_hash=p_evidence_hash;
  if candidate.conflicting or candidate.gross_cents is null then raise exception 'Review conflicting or incomplete freight'; end if;
  insert into rr_driver_finance_private.legacy_confirmations(operator_id,evidence_hash,legacy_key,broker_name,load_number,delivery_date,gross_cents,confirmed_by)
  values(p_operator_id,candidate.evidence_hash,candidate.legacy_key,candidate.broker_name,candidate.load_number,
    candidate.delivery_date,candidate.gross_cents,auth.uid())
  on conflict(operator_id,evidence_hash) do nothing;
  return true;
end $$;
create function public.rr_driver_confirm_legacy_load(p_operator_id uuid,p_start date,p_legacy_key text,p_evidence_hash text)
returns boolean language sql security invoker set search_path='' as $$
  select rr_driver_finance_private.confirm_legacy(p_operator_id,p_start,p_legacy_key,p_evidence_hash)
$$;

create function public.rr_driver_quarter_activity(p_operator_id uuid,p_start date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare target_kind text; until_date date; result jsonb;
begin
  if not public.rr_driver_tools_enabled(p_operator_id) then raise exception 'Workspace access required' using errcode='42501'; end if;
  perform rr_driver_finance_private.check_quarter(p_start);
  select workspace_kind into target_kind from public.rr_lease_operators where id=p_operator_id
    and (carrier_user_id=(select auth.uid()) or driver_user_id=(select auth.uid()));
  if target_kind is null then raise exception 'Workspace access required' using errcode='42501'; end if;
  until_date:=(p_start+interval '3 months')::date;
  with legacy as materialized (
    select * from public.rr_driver_quarter_legacy_loads(p_operator_id,p_start)
  ), canonical as (
    select l.gross_cents,l.operator_share_cents from public.rr_lease_loads l where l.operator_id=p_operator_id
      and l.status in ('delivered','closed') and l.actual_delivery_date>=p_start and l.actual_delivery_date<until_date
      and not rr_driver_finance_private.test_reference(l.load_number)
  ), freight as (
    select c.gross_cents,c.operator_share_cents from canonical c union all
    select h.gross_cents,h.gross_cents from legacy h where h.confirmed
  ), freight_totals as (
    select count(*) as load_count,count(*)-count(gross_cents) as missing,
      case when count(*)=count(gross_cents) then coalesce(sum(gross_cents),0) end as gross,
      case when count(*)=count(operator_share_cents) then coalesce(sum(operator_share_cents),0) end as share
    from freight
  ), expenses as (
    select x.kind as category,x.amount_cents as operating,x.amount_cents as direct,0::bigint as effect,0::bigint as general_credit
    from public.rr_lease_owner_expenses x where target_kind='carrier' and x.operator_id=p_operator_id and x.purchased_on>=p_start
      and x.purchased_on<until_date and not rr_driver_finance_private.test_reference(x.evidence_reference)
    union all
    select case when a.kind in('fuel','insurance','eld','other') then a.kind
        when a.kind='credit' and (lower(btrim(a.evidence_reference)) like 'mudflap:%' or w.category='fuel_receipt') then 'fuel' end,
      case when a.paid_by='operator' then a.amount_cents else -a.amount_cents end,
      case when a.paid_by='operator' and a.kind in('fuel','insurance','eld','other') then a.amount_cents else 0 end,
      a.settlement_effect_cents,
      case when a.kind='credit' and lower(btrim(a.evidence_reference)) not like 'mudflap:%'
        and w.category is distinct from 'fuel_receipt' then a.amount_cents else 0 end
    from public.rr_lease_adjustments a join public.rr_lease_settlements s on s.id=a.settlement_id and s.operator_id=a.operator_id
      left join public.rr_lease_wallet_documents w on w.id=a.wallet_document_id and w.operator_id=a.operator_id
    where target_kind='leased' and a.operator_id=p_operator_id and s.week_start>=p_start and s.week_start<until_date
      and not rr_driver_finance_private.test_reference(a.evidence_reference)
  ), cost_totals as (
    select coalesce(sum(operating) filter(where category is not null),0) as operating,
      coalesce(sum(operating) filter(where category='fuel'),0) as fuel,
      coalesce(sum(operating) filter(where category='insurance'),0) as insurance,
      coalesce(sum(operating) filter(where category='eld'),0) as eld,
      coalesce(sum(operating) filter(where category='other'),0) as other,
      coalesce(sum(direct),0) as direct,coalesce(sum(effect),0) as effect,coalesce(sum(general_credit),0) as credit from expenses
  )
  select jsonb_build_object('load_count',f.load_count,'gross_missing',f.missing,'gross_cents',f.gross,'operator_share_cents',f.share,
    'canonical_load_count',(select count(*) from canonical),'legacy_load_count',(select count(*) from legacy where confirmed),
    'legacy_review_count',(select count(*) from legacy where not confirmed),
    'legacy_review_gross_cents',(select case when count(*)=count(gross_cents) and not coalesce(bool_or(conflicting),false)
      then coalesce(sum(gross_cents),0) end from legacy where not confirmed),
    'legacy_candidates',coalesce((select jsonb_agg(to_jsonb(r) order by r.delivery_date,r.legacy_key) from (
      select * from legacy where not confirmed order by delivery_date,legacy_key limit 50) r),'[]'::jsonb),
    'recorded_expenses_cents',c.operating,'recorded_fuel_cents',c.fuel,'carrier_deductions_cents',c.effect,'operator_paid_cents',c.direct,
    'unclassified_credit_cents',c.credit,'expense_by_kind',jsonb_build_object('fuel',c.fuel,'insurance',c.insurance,'eld',c.eld,'other',c.other),
    'purchased_gallons',null,'purchase_jurisdictions',null,'revenue_basis','delivery_date',
    'expense_basis',case when target_kind='carrier' then 'purchase_date' else 'settlement_week_start' end)
  into result from freight_totals f cross join cost_totals c;
  return result;
end $$;

revoke all on all functions in schema rr_driver_finance_private from public,anon;
grant execute on all functions in schema rr_driver_finance_private to authenticated;
revoke all on function public.rr_driver_quarter_legacy_loads(uuid,date),public.rr_driver_quarter_activity(uuid,date),
  public.rr_driver_confirm_legacy_load(uuid,date,text,text) from public,anon;
grant execute on function public.rr_driver_quarter_legacy_loads(uuid,date),public.rr_driver_quarter_activity(uuid,date),
  public.rr_driver_confirm_legacy_load(uuid,date,text,text) to authenticated;
commit;
