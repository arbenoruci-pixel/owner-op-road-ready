-- A distinct, read-only driver portal. The carrier's existing phone workspace is never opened.
create schema rr_lease_private;
revoke all on schema rr_lease_private from public, anon, authenticated;
grant usage on schema rr_lease_private to service_role;

create table public.rr_lease_operators (
  id uuid primary key default gen_random_uuid(),
  carrier_user_id uuid not null references auth.users(id),
  driver_user_id uuid references auth.users(id),
  company_name text not null check (btrim(company_name) <> ''),
  driver_name text not null check (btrim(driver_name) <> ''),
  pay_weekday smallint check (pay_weekday between 1 and 7),
  share_bps integer not null default 9200 check (share_bps between 0 and 10000),
  check (driver_user_id is distinct from carrier_user_id),
  unique(carrier_user_id, driver_user_id)
);
create index rr_lease_driver_memberships on public.rr_lease_operators(driver_user_id);
create table rr_lease_private.operator_invites (
  operator_id uuid primary key references public.rr_lease_operators(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) > 3 and position('@' in email)>1)
);
create index rr_lease_invite_email on rr_lease_private.operator_invites(email);

create function public.rr_lease_claim_membership() returns integer
language plpgsql security definer set search_path = '' as $$
declare claimed integer;
begin
  update public.rr_lease_operators o set driver_user_id = u.id
  from rr_lease_private.operator_invites i, auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false) = false
    and lower(u.email) = i.email and i.operator_id = o.id and o.driver_user_id is null
    and o.carrier_user_id <> u.id;
  get diagnostics claimed = row_count;
  return claimed;
end $$;

create table public.rr_lease_settlements (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.rr_lease_operators(id),
  week_start date not null check (extract(isodow from week_start) = 1),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'draft' check (status in ('draft','issued','paid')),
  expected_pay_date date,
  paid_at timestamptz,
  payment_reference text,
  payment_amount_cents bigint check(payment_amount_cents>=0),
  check ((status = 'paid' and paid_at is not null and payment_amount_cents is not null and length(btrim(payment_reference)) > 0 and payment_reference is not null)
     or (status <> 'paid' and paid_at is null and payment_reference is null and payment_amount_cents is null)),
  unique(operator_id,week_start),
  unique(operator_id,id)
);
create table public.rr_lease_loads (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.rr_lease_operators(id),
  broker_name text not null check (btrim(broker_name) <> ''),
  load_number text not null check (btrim(load_number) <> ''),
  status text not null default 'staging' check (status in ('staging','assigned','picked_up','delivered','closed','cancelled')),
  pickup_at timestamptz, delivery_at timestamptz,
  pickup_timezone text, delivery_timezone text,
  pickup_address text, delivery_address text, pickup_number text, delivery_number text,
  reefer_instructions text,
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  gross_cents bigint check (gross_cents between 0 and 100000000000),
  share_bps integer not null check (share_bps between 0 and 10000),
  operator_share_cents bigint generated always as ((gross_cents*share_bps+5000)/10000) stored,
  carrier_share_cents bigint generated always as (gross_cents-(gross_cents*share_bps+5000)/10000) stored,
  settlement_id uuid,
  updated_at timestamptz not null default now(),
  unique(operator_id,id),
  foreign key (operator_id,settlement_id) references public.rr_lease_settlements(operator_id,id)
);
create unique index rr_lease_broker_load_identity on public.rr_lease_loads(operator_id,lower(btrim(broker_name)),lower(btrim(load_number)));
create index rr_lease_loads_settlement on public.rr_lease_loads(settlement_id);

create table public.rr_lease_adjustments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.rr_lease_settlements(id),
  kind text not null check (kind in ('insurance','fuel','eld','advance','other','credit')),
  paid_by text not null default 'carrier' check(paid_by in ('carrier','operator')),
  amount_cents bigint not null check (amount_cents <> 0 and abs(amount_cents::numeric)<=100000000000),
  settlement_effect_cents bigint generated always as (case when paid_by='operator' then 0 else amount_cents end) stored,
  operator_id uuid not null references public.rr_lease_operators(id),
  description text not null check (btrim(description)<>''),
  -- Confirmed receipt / schedule / authorization identifier; never the driver's bank account.
  evidence_reference text not null check(btrim(evidence_reference)<>''),
  check (case when paid_by='operator' then kind<>'credit' and amount_cents>0 else (kind='credit')=(amount_cents>0) end),
  foreign key (operator_id,settlement_id) references public.rr_lease_settlements(operator_id,id),
  unique (operator_id,kind,evidence_reference)
);

-- Absent review = unknown, even when no costs were entered. A documented zero is explicit.
create table public.rr_lease_cost_reviews(
  settlement_id uuid not null references public.rr_lease_settlements(id),
  kind text not null check(kind in ('insurance','fuel','eld')),
  outcome text not null check(outcome in ('none','complete','deferred')),
  evidence_reference text not null check(length(btrim(evidence_reference))>0),
  reviewed_at timestamptz not null default now(),
  primary key(settlement_id,kind)
);
create table rr_lease_private.weekly_cost_schedules(
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.rr_lease_operators(id),
  kind text not null check(kind in ('insurance','eld')),
  first_week date not null check(extract(isodow from first_week)=1),
  last_week date check(extract(isodow from last_week)=1 and last_week>=first_week),
  weekly_cents bigint not null check(weekly_cents between 1 and 100000000000),
  paid_by text not null check(paid_by in ('operator','carrier')),
  description text not null check(length(btrim(description))>0),
  authorization_reference text not null check(length(btrim(authorization_reference))>0),
  unique(operator_id, kind, first_week)
);
-- Overlapping contracts must be reconciled, never deducted twice. Amendments can close the
-- original period and append a newly authorized schedule while retaining prior evidence.
create function rr_lease_private.weekly_schedule_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (to_jsonb(new)-'last_week') is distinct from (to_jsonb(old)-'last_week') then
    raise exception 'Use a new weekly schedule for changed authorized terms';
  end if;
  perform 1 from public.rr_lease_operators where id=new.operator_id for update;
  if exists(select 1 from rr_lease_private.weekly_cost_schedules w where w.operator_id=new.operator_id
    and w.kind=new.kind and w.id<>new.id and daterange(w.first_week,w.last_week,'[]') && daterange(new.first_week,new.last_week,'[]'))
    then raise exception 'Overlapping weekly schedules'; end if;
  return new;
end $$;
create trigger rr_lease_schedule_change before insert or update on rr_lease_private.weekly_cost_schedules
  for each row execute function rr_lease_private.weekly_schedule_guard();

create function rr_lease_private.review_guard() returns trigger language plpgsql set search_path='' as $$
declare target uuid;
begin
  if tg_op='DELETE' then target=old.settlement_id; else target=new.settlement_id; end if;
  perform 1 from public.rr_lease_settlements where id=target and status='draft' for update;
  if not found then raise exception 'An open settlement is required'; end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and row(old.settlement_id,old.kind) is distinct from row(new.settlement_id,new.kind)
    then raise exception 'Cannot move a reviewed cost'; end if;
  if new.outcome<>'deferred' and (new.outcome='complete') <> exists(select 1 from public.rr_lease_adjustments a
      where a.settlement_id=target and a.kind=new.kind)
    then raise exception 'Review must match the actual expense entries'; end if;
  new.reviewed_at=clock_timestamp();
  return new;
end $$;
create trigger rr_lease_cost_review_change before insert or update or delete on public.rr_lease_cost_reviews
  for each row execute function rr_lease_private.review_guard();

create function rr_lease_private.load_guard() returns trigger language plpgsql set search_path='' as $$
declare frozen boolean;
begin
  if tg_op <> 'INSERT' and old.settlement_id is not null then
    select status <> 'draft' into frozen from public.rr_lease_settlements where id=old.settlement_id for update;
    if frozen then
      if tg_op='DELETE' then raise exception 'Issued load is immutable'; end if;
      if row(new.operator_id,new.settlement_id,new.gross_cents,new.share_bps,new.load_number,new.broker_name)
        is distinct from row(old.operator_id,old.settlement_id,old.gross_cents,old.share_bps,old.load_number,old.broker_name)
        or new.status not in ('delivered','closed') then raise exception 'Issued load is immutable'; end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='INSERT' and new.share_bps is null then
    select share_bps into new.share_bps from public.rr_lease_operators where id=new.operator_id;
  end if;
  if tg_op='UPDATE' and row(old.id,old.operator_id) is distinct from row(new.id,new.operator_id) then
    raise exception 'Assigned operator identity cannot change';
  end if;
  if new.settlement_id is not null and (tg_op='INSERT' or new.settlement_id is distinct from old.settlement_id) then
    perform 1 from public.rr_lease_settlements where id=new.settlement_id and operator_id=new.operator_id and status='draft' for update;
    if not found then raise exception 'An open settlement belonging to this operator is required'; end if;
  end if;
  new.updated_at=clock_timestamp();
  return new;
end $$;
create trigger rr_lease_load_change before insert or update or delete on public.rr_lease_loads for each row execute function rr_lease_private.load_guard();

create function rr_lease_private.adjustment_guard() returns trigger language plpgsql set search_path='' as $$
declare target uuid; owner_id uuid;
begin
  if tg_op='UPDATE' and new.settlement_id <> old.settlement_id then raise exception 'Cannot move an adjustment'; end if;
  if tg_op='DELETE' then target=old.settlement_id; else target=new.settlement_id; end if;
  select operator_id into owner_id from public.rr_lease_settlements where id=target and status='draft' for update;
  if not found then raise exception 'An open settlement is required'; end if;
  if tg_op<>'INSERT' then
    delete from public.rr_lease_cost_reviews where settlement_id=target and kind=old.kind;
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.operator_id is not null and new.operator_id<>owner_id then raise exception 'Expense belongs to a different operator'; end if;
  new.operator_id=owner_id;
  delete from public.rr_lease_cost_reviews where settlement_id=target and kind=new.kind;
  return new;
end $$;
create trigger rr_lease_adjustment_change before insert or update or delete on public.rr_lease_adjustments for each row execute function rr_lease_private.adjustment_guard();

create function rr_lease_private.statement_guard() returns trigger language plpgsql set search_path='' as $$
declare due numeric;
begin
  if tg_op='DELETE' then
    if old.status<>'draft' then raise exception 'An issued settlement must be retained'; end if;
    return old;
  end if;
  if tg_op='INSERT' then
    if new.status<>'draft' then raise exception 'Create a draft before issuing a settlement'; end if;
    return new;
  end if;
  if row(new.id,new.operator_id,new.week_start) is distinct from row(old.id,old.operator_id,old.week_start) then
    raise exception 'Settlement identity cannot change';
  end if;
  if old.status='paid' and new is distinct from old then raise exception 'Paid settlement is immutable'; end if;
  if old.status='issued' and (new.status='draft' or new.expected_pay_date is distinct from old.expected_pay_date)
    then raise exception 'Issued settlement cannot be reopened or rescheduled'; end if;
  if old.status='draft' and new.status='paid' then raise exception 'Issue a settlement before marking it paid'; end if;
  if old.status='issued' and new.status='paid' then
    if new.paid_at is null or not isfinite(new.paid_at) or new.paid_at>clock_timestamp()
      then raise exception 'Use the actual bank payment date'; end if;
    select coalesce((select sum(operator_share_cents) from public.rr_lease_loads where settlement_id=new.id),0)
      + coalesce((select sum(settlement_effect_cents) from public.rr_lease_adjustments where settlement_id=new.id),0) into due;
    if new.payment_amount_cents is distinct from due then raise exception 'Payment amount must match the issued balance'; end if;
  end if;
  if old.status='draft' and new.status='issued' then
    if (select count(*) from public.rr_lease_cost_reviews where settlement_id=new.id)<>3
      then raise exception 'Review insurance, fuel and ELD costs, including documented zero amounts or deferred charges'; end if;
    if not exists(select 1 from public.rr_lease_loads where settlement_id=new.id)
      or exists(select 1 from public.rr_lease_loads where settlement_id=new.id and (gross_cents is null or status not in ('delivered','closed')))
      then raise exception 'Issue only verified delivered loads with confirmed revenue'; end if;
  end if;
  return new;
end $$;
create trigger rr_lease_statement_change before insert or update or delete on public.rr_lease_settlements for each row execute function rr_lease_private.statement_guard();

create table public.rr_lease_documents (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.rr_lease_loads(id),
  kind text not null check (kind in ('ratecon','pod','bol','invoice','supporting')),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif')),
  byte_size integer not null check (byte_size between 1 and 33554432),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_backend text not null default 'database' check (storage_backend in ('storage','database')),
  storage_path text not null unique,
  chunk_count integer generated always as ((byte_size+49151)/49152) stored,
  revision integer not null default 1 check (revision>0),
  is_ready boolean not null default false,
  is_current boolean not null default false,
  operator_visible boolean not null default false,
  created_at timestamptz not null default now(),
  check ((not operator_visible and not is_current) or is_ready),
  unique(load_id,kind,sha256)
);
create unique index rr_lease_current_ratecon on public.rr_lease_documents(load_id) where kind='ratecon' and is_current;
create index rr_lease_load_documents on public.rr_lease_documents(load_id,created_at desc);
create function rr_lease_private.document_guard() returns trigger language plpgsql set search_path='' as $$
declare operator uuid;
begin
  if tg_op='UPDATE' and row(new.id,new.load_id,new.kind,new.byte_size,new.sha256,new.mime_type,new.storage_backend,new.storage_path)
      is distinct from row(old.id,old.load_id,old.kind,old.byte_size,old.sha256,old.mime_type,old.storage_backend,old.storage_path)
      then raise exception 'Original data is immutable; retain it and append a revision'; end if;
  if tg_op='UPDATE' and old.is_ready and not new.is_ready then raise exception 'A verified original is immutable'; end if;
  select operator_id into operator from public.rr_lease_loads where id=new.load_id;
  if operator is null or new.storage_path <> operator::text||'/'||new.load_id::text||'/'||new.id::text
     then raise exception 'Invalid operator document path'; end if;
  return new;
end $$;
create trigger rr_lease_document_identity before insert or update on public.rr_lease_documents for each row execute function rr_lease_private.document_guard();

create table rr_lease_private.document_chunks(
  document_id uuid not null references public.rr_lease_documents(id) on delete cascade,
  chunk_index integer not null check(chunk_index>=0),
  bytes bytea not null check(octet_length(bytes) between 1 and 49152),
  primary key(document_id,chunk_index)
);

-- Carrier credentials and workers are administered separately; web clients can only read.
alter table public.rr_lease_operators enable row level security;
alter table public.rr_lease_loads enable row level security;
alter table public.rr_lease_settlements enable row level security;
alter table public.rr_lease_adjustments enable row level security;
alter table public.rr_lease_documents enable row level security;
revoke all on public.rr_lease_operators,public.rr_lease_loads,public.rr_lease_settlements,
  public.rr_lease_adjustments,public.rr_lease_documents from public,anon,authenticated;
grant select on public.rr_lease_operators,public.rr_lease_loads,public.rr_lease_settlements,
  public.rr_lease_adjustments,public.rr_lease_documents to authenticated;
grant all on public.rr_lease_operators,public.rr_lease_loads,public.rr_lease_settlements,
  public.rr_lease_adjustments,public.rr_lease_documents to service_role;
revoke all on rr_lease_private.operator_invites,rr_lease_private.document_chunks from public,anon,authenticated;
grant select,insert,update,delete on rr_lease_private.operator_invites to service_role;

create policy rr_operator_read on public.rr_lease_operators for select to authenticated
 using (driver_user_id=(select auth.uid()) or carrier_user_id=(select auth.uid()));
create policy rr_load_read on public.rr_lease_loads for select to authenticated
 using (exists(select 1 from public.rr_lease_operators o where o.id=operator_id and (o.carrier_user_id=(select auth.uid()) or status<>'staging')));
create policy rr_settlement_read on public.rr_lease_settlements for select to authenticated
 using (exists(select 1 from public.rr_lease_operators o where o.id=operator_id));
create policy rr_adjustment_read on public.rr_lease_adjustments for select to authenticated
 using (exists(select 1 from public.rr_lease_settlements s where s.id=settlement_id));
create policy rr_document_read on public.rr_lease_documents for select to authenticated
 using (exists(select 1 from public.rr_lease_loads l join public.rr_lease_operators o on o.id=l.operator_id
               where l.id=load_id and (o.carrier_user_id=(select auth.uid()) or (operator_visible and is_ready))));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rr-lease-private','rr-lease-private',false,33554432,
  array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']);
create policy rr_lease_object_read on storage.objects for select to authenticated
 using (bucket_id='rr-lease-private' and exists(select 1 from public.rr_lease_documents d
         where d.storage_backend='storage' and d.is_ready and d.storage_path=storage.objects.name));

-- 48 KiB chunks also allow the authorized SQL connector to store original attachments.
create function public.rr_lease_put_chunk(p_document_id uuid,p_index integer,p_base64 text) returns void
language plpgsql security definer set search_path='' as $$
declare doc public.rr_lease_documents; part bytea; existing bytea; expected integer;
begin
  select * into strict doc from public.rr_lease_documents where id=p_document_id for update;
  if doc.storage_backend <> 'database' or p_index is null or p_index not between 0 and doc.chunk_count-1
     or p_base64 is null or length(p_base64)>65536 then raise exception 'Invalid attachment chunk'; end if;
  part=decode(p_base64,'base64');
  expected=least(49152,doc.byte_size-p_index*49152);
  if octet_length(part)<>expected then raise exception 'Unexpected chunk size'; end if;
  select bytes into existing from rr_lease_private.document_chunks where document_id=p_document_id and chunk_index=p_index;
  if found then
    if existing<>part then raise exception 'Conflicting attachment retry'; end if;
  elsif doc.is_ready then raise exception 'A verified original cannot change';
  else insert into rr_lease_private.document_chunks values(p_document_id,p_index,part);
  end if;
end $$;

create function public.rr_lease_finish_original(p_document_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare doc public.rr_lease_documents; original bytea; parts integer;
begin
  select * into strict doc from public.rr_lease_documents where id=p_document_id for update;
  if doc.is_ready then return true; end if;
  if doc.storage_backend='database' then
    select count(*),string_agg(bytes,''::bytea order by chunk_index) into parts,original
      from rr_lease_private.document_chunks where document_id=doc.id;
    if parts<>doc.chunk_count or octet_length(original)<>doc.byte_size or encode(sha256(original),'hex')<>doc.sha256
      then raise exception 'Incomplete attachment or checksum mismatch'; end if;
  else
    -- The trusted uploader hashes the original before upload; the portal verifies downloads again.
    if not exists(select 1 from storage.objects o where o.bucket_id='rr-lease-private' and o.name=doc.storage_path
      and (o.metadata->>'size')::bigint=doc.byte_size and o.metadata->>'mimetype'=doc.mime_type
      and (to_jsonb(o)->'user_metadata'->>'sha256')=doc.sha256) then raise exception 'Storage original is missing or inconsistent'; end if;
  end if;
  update public.rr_lease_documents set is_ready=true where id=doc.id;
  return true;
end $$;

create function public.rr_lease_original_ready(p_document_id uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.rr_lease_documents where id=p_document_id and is_ready);
$$;

create function public.rr_lease_download_chunk(p_document_id uuid,p_index integer) returns text
language plpgsql stable security definer set search_path='' as $$
declare result text;
begin
  select translate(encode(c.bytes,'base64'),E'\n','') into result
  from public.rr_lease_documents d
  join public.rr_lease_loads l on l.id=d.load_id
  join public.rr_lease_operators o on o.id=l.operator_id
  join rr_lease_private.document_chunks c on c.document_id=d.id and c.chunk_index=p_index
  where d.id=p_document_id and d.is_ready and d.storage_backend='database'
   and (o.carrier_user_id=auth.uid() or (o.driver_user_id=auth.uid() and d.operator_visible and l.status<>'staging'));
  if not found then raise exception 'Original unavailable' using errcode='42501'; end if;
  return result;
end $$;

revoke all on function public.rr_lease_claim_membership(),public.rr_lease_download_chunk(uuid,integer),
  public.rr_lease_original_ready(uuid),public.rr_lease_put_chunk(uuid,integer,text),public.rr_lease_finish_original(uuid) from public,anon,authenticated;
grant execute on function public.rr_lease_claim_membership(),public.rr_lease_download_chunk(uuid,integer) to authenticated;
grant execute on function public.rr_lease_original_ready(uuid),public.rr_lease_put_chunk(uuid,integer,text),public.rr_lease_finish_original(uuid) to service_role;

alter table public.rr_lease_cost_reviews enable row level security;
revoke all on public.rr_lease_cost_reviews from public,anon,authenticated;
grant select on public.rr_lease_cost_reviews to authenticated;
grant all on public.rr_lease_cost_reviews to service_role;
create policy rr_cost_review_read on public.rr_lease_cost_reviews for select to authenticated
 using (exists(select 1 from public.rr_lease_settlements s where s.id=settlement_id));
revoke all on rr_lease_private.weekly_cost_schedules from public,anon,authenticated;
grant select,insert,update on rr_lease_private.weekly_cost_schedules to service_role;

-- A verified contract fixes the weekly amount. Evidence of the billed cost or direct payment
-- for this statement is also required; replays reuse the original line, including after issue.
create function public.rr_lease_apply_weekly_cost(p_settlement_id uuid,p_kind text,p_period_evidence text)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.rr_lease_settlements; w rr_lease_private.weekly_cost_schedules;
        item_id uuid; ref text;
begin
  if p_period_evidence is null or length(btrim(p_period_evidence))=0 then raise exception 'Period evidence required'; end if;
  select * into strict s from public.rr_lease_settlements where id=p_settlement_id for update;
  select * into strict w from rr_lease_private.weekly_cost_schedules where operator_id=s.operator_id
    and kind=p_kind and first_week<=s.week_start and (last_week is null or last_week>=s.week_start);
  ref='weekly/'||w.id||'/'||s.week_start;
  select id into item_id from public.rr_lease_adjustments where settlement_id=s.id and kind=w.kind and evidence_reference=ref;
  if found then return item_id; end if;
  if s.status<>'draft' then raise exception 'An open settlement is required'; end if;
  insert into public.rr_lease_adjustments(settlement_id,kind,paid_by,amount_cents,description,evidence_reference)
    values(s.id,w.kind,w.paid_by,case when w.paid_by='operator' then w.weekly_cents else -w.weekly_cents end,
       w.description||' · '||w.authorization_reference||' · '||btrim(p_period_evidence),ref) returning id into item_id;
  return item_id;
end $$;
revoke all on function public.rr_lease_apply_weekly_cost(uuid,text,text) from public,anon,authenticated;
grant execute on function public.rr_lease_apply_weekly_cost(uuid,text,text) to service_role;

create view public.rr_lease_settlement_totals with (security_invoker=true) as
select s.id settlement_id,s.operator_id,s.week_start,s.status,s.currency,
  l.load_count,l.gross_cents,l.operator_share_cents,l.carrier_share_cents,
  a.carrier_deduction_cents,a.credit_cents,a.operator_paid_cents,
  l.operator_share_cents+a.net_effect_cents estimated_net_cents,
  case when l.all_confirmed and r.reviewed=3 then l.operator_share_cents+a.net_effect_cents end net_cents,
  r.reviewed=3 costs_reviewed,r.deferred>0 has_deferred_costs
from public.rr_lease_settlements s
cross join lateral (select count(*) load_count,coalesce(sum(gross_cents),0) gross_cents,
     coalesce(sum(operator_share_cents),0) operator_share_cents,coalesce(sum(carrier_share_cents),0) carrier_share_cents,
     count(*)>0 and count(gross_cents)=count(*) all_confirmed
     from public.rr_lease_loads where settlement_id=s.id) l
cross join lateral (select coalesce(sum(-settlement_effect_cents) filter(where settlement_effect_cents<0),0) carrier_deduction_cents,
     coalesce(sum(settlement_effect_cents) filter(where settlement_effect_cents>0),0) credit_cents,
     coalesce(sum(amount_cents) filter(where paid_by='operator'),0) operator_paid_cents,
     coalesce(sum(settlement_effect_cents),0) net_effect_cents
     from public.rr_lease_adjustments where settlement_id=s.id) a
cross join lateral (select count(*) reviewed,count(*) filter(where outcome='deferred') deferred from public.rr_lease_cost_reviews where settlement_id=s.id) r;
revoke all on public.rr_lease_settlement_totals from public,anon,authenticated;
grant select on public.rr_lease_settlement_totals to authenticated,service_role;

create function public.rr_lease_email_login_allowed(p_email text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from rr_lease_private.operator_invites i join public.rr_lease_operators o on o.id=i.operator_id
    where i.email=lower(btrim(p_email)) and o.driver_user_id is null
    union all
    select 1 from auth.users u join public.rr_lease_operators o on u.id in(o.driver_user_id,o.carrier_user_id)
    where lower(u.email)=lower(btrim(p_email)) and u.email_confirmed_at is not null
      and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false
  );
$$;
revoke all on function public.rr_lease_email_login_allowed(text) from public,anon,authenticated;
grant execute on function public.rr_lease_email_login_allowed(text) to service_role;

create table rr_lease_private.login_requests(
  email text primary key, last_at timestamptz not null, utc_day date not null, requests integer not null
);
revoke all on rr_lease_private.login_requests from public,anon,authenticated,service_role;
create function public.rr_lease_reserve_login_request(p_email text) returns boolean
language plpgsql security definer set search_path='' as $$
declare clock_at timestamptz=clock_timestamp(); today_utc date=(clock_at at time zone 'UTC')::date;
begin
  if not public.rr_lease_email_login_allowed(p_email) then return false; end if;
  insert into rr_lease_private.login_requests as previous(email,last_at,utc_day,requests)
  values(lower(btrim(p_email)),clock_at,today_utc,1)
  on conflict(email) do update set last_at=excluded.last_at,utc_day=excluded.utc_day,
    requests=case when previous.utc_day=excluded.utc_day then previous.requests+1 else 1 end
  where previous.last_at <= excluded.last_at-interval '90 seconds'
    and (previous.utc_day<>excluded.utc_day or previous.requests<8);
  return found;
end $$;
revoke all on function public.rr_lease_reserve_login_request(text) from public,anon,authenticated;
grant execute on function public.rr_lease_reserve_login_request(text) to service_role;

-- Backend-only reconstruction of verified originals for the invoice packet. A job can
-- resume on any chunk without persisting an email credential or a public attachment URL.
create function public.rr_lease_read_original_chunk(p_document_id uuid,p_index integer) returns text
language sql stable security definer set search_path='' as $$
  select translate(encode(c.bytes,'base64'),E'\n','')
  from rr_lease_private.document_chunks c join public.rr_lease_documents d on d.id=c.document_id
  where d.id=p_document_id and d.is_ready and d.storage_backend='database' and c.chunk_index=p_index;
$$;
revoke all on function public.rr_lease_read_original_chunk(uuid,integer) from public,anon,authenticated;
grant execute on function public.rr_lease_read_original_chunk(uuid,integer) to service_role;
