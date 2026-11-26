-- Driver road documents and expense originals live outside the carrier's phone/DOT wallet.
create table public.rr_lease_wallet_documents (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.rr_lease_operators(id),
  slot_key text not null check (slot_key ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'),
  category text not null check (category in ('license','medical','registration','insurance','permit',
    'inspection','lease','carrier_document','eld','other','fuel_receipt','expense_receipt')),
  title text not null check (length(btrim(title)) between 1 and 160),
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif')
    or (mime_type='application/json' and category in ('fuel_receipt','expense_receipt') and right(lower(file_name),5)='.json')),
  byte_size integer not null check (byte_size between 1 and 33554432),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  chunk_count integer generated always as ((byte_size+49151)/49152) stored,
  issued_on date,
  expires_on date check (expires_on >= issued_on),
  replaces uuid,
  revision integer check (revision > 0),
  is_ready boolean not null default false,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (is_ready = (revision is not null) and (is_ready or not is_current)),
  unique (operator_id,id),
  unique (operator_id,slot_key,sha256),
  unique (operator_id,slot_key,revision),
  foreign key (operator_id,replaces) references public.rr_lease_wallet_documents(operator_id,id)
);
create unique index rr_lease_wallet_one_current on public.rr_lease_wallet_documents(operator_id,slot_key) where is_current;
create table rr_lease_private.wallet_sources (
  -- Includes mailbox + immutable message ID + attachment ID (or part number).
  source_ref text primary key check (length(btrim(source_ref)) between 1 and 2048),
  document_id uuid not null references public.rr_lease_wallet_documents(id),
  assignment_evidence text not null check (length(btrim(assignment_evidence)) between 1 and 2048)
);
create table rr_lease_private.wallet_chunks (
  document_id uuid not null references public.rr_lease_wallet_documents(id),
  chunk_index integer not null check(chunk_index >= 0),
  bytes bytea not null check(octet_length(bytes) between 1 and 49152),
  primary key(document_id,chunk_index)
);

alter table public.rr_lease_wallet_documents enable row level security;
revoke all on public.rr_lease_wallet_documents,rr_lease_private.wallet_sources,rr_lease_private.wallet_chunks
  from public,anon,authenticated,service_role;
grant select on public.rr_lease_wallet_documents to authenticated,service_role;
create policy rr_lease_read_wallet on public.rr_lease_wallet_documents for select to authenticated
 using (is_ready and exists(select 1 from public.rr_lease_operators o where o.id=operator_id));

-- Dispatch records the specific equipment/driver requirements from its verified checklist.
-- A transaction receipt or an unconfigured category cannot imply a truck is ready for the road.
create table public.rr_lease_wallet_requirements (
  operator_id uuid not null references public.rr_lease_operators(id),
  slot_key text not null check (slot_key ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'),
  title text not null check (length(btrim(title)) between 1 and 160),
  expiry_required boolean not null,
  active boolean not null,
  evidence_reference text not null check (length(btrim(evidence_reference)) between 1 and 2048),
  primary key(operator_id,slot_key)
);
alter table public.rr_lease_wallet_requirements enable row level security;
revoke all on public.rr_lease_wallet_requirements from public,anon,authenticated,service_role;
grant select(operator_id,slot_key,title,expiry_required,active) on public.rr_lease_wallet_requirements to authenticated;
grant select on public.rr_lease_wallet_requirements to service_role;
create policy rr_lease_read_wallet_requirements on public.rr_lease_wallet_requirements for select to authenticated
 using (active and exists(select 1 from public.rr_lease_operators o where o.id=operator_id));

create function public.rr_lease_wallet_require(p_operator_id uuid,p_slot_key text,p_title text,p_expiry_required boolean,
  p_active boolean,p_evidence_reference text) returns void language sql security definer set search_path='' as $$
 insert into public.rr_lease_wallet_requirements(operator_id,slot_key,title,expiry_required,active,evidence_reference)
 values(p_operator_id,p_slot_key,btrim(p_title),p_expiry_required,p_active,btrim(p_evidence_reference))
 on conflict (operator_id,slot_key) do update set title=excluded.title,expiry_required=excluded.expiry_required,
   active=excluded.active,evidence_reference=excluded.evidence_reference;
$$;
revoke all on function public.rr_lease_wallet_require(uuid,text,text,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.rr_lease_wallet_require(uuid,text,text,boolean,boolean,text) to service_role;

create function public.rr_lease_wallet_begin(
  p_operator_id uuid,p_slot_key text,p_category text,p_title text,p_file_name text,p_mime_type text,
  p_byte_size integer,p_sha256 text,p_source_ref text,p_assignment_evidence text,
  p_issued_on date default null,p_expires_on date default null,p_replaces uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare doc public.rr_lease_wallet_documents; recorded uuid;
begin
  perform 1 from public.rr_lease_operators where id=p_operator_id for update;
  if not found then raise exception 'Unknown wallet owner'; end if;
  if nullif(btrim(p_assignment_evidence),'') is null or nullif(btrim(p_source_ref),'') is null
    then raise exception 'Verified source and operator assignment required'; end if;
  select * into doc from public.rr_lease_wallet_documents
    where operator_id=p_operator_id and slot_key=p_slot_key and sha256=p_sha256;
  if found then
    if row(doc.category,doc.mime_type,doc.byte_size,doc.issued_on,doc.expires_on)
      is distinct from row(p_category,p_mime_type,p_byte_size,p_issued_on,p_expires_on) then
      raise exception 'Wallet evidence differs from the recorded original';
    end if;
    if not doc.is_ready and p_replaces is distinct from doc.replaces then
      if (select id from public.rr_lease_wallet_documents where operator_id=p_operator_id and slot_key=p_slot_key and is_current)
        is distinct from p_replaces then raise exception 'Review the current wallet version before replacing it'; end if;
      update public.rr_lease_wallet_documents set replaces=p_replaces where id=doc.id;
    end if;
  else
    if (select id from public.rr_lease_wallet_documents
        where operator_id=p_operator_id and slot_key=p_slot_key and is_current) is distinct from p_replaces
      then raise exception 'Review the current wallet version before replacing it'; end if;
    insert into public.rr_lease_wallet_documents(operator_id,slot_key,category,title,file_name,mime_type,byte_size,sha256,issued_on,expires_on,replaces)
    values(p_operator_id,p_slot_key,p_category,btrim(p_title),p_file_name,p_mime_type,p_byte_size,p_sha256,p_issued_on,p_expires_on,p_replaces)
    returning * into doc;
  end if;
  insert into rr_lease_private.wallet_sources(source_ref,document_id,assignment_evidence)
    values(btrim(p_source_ref),doc.id,btrim(p_assignment_evidence)) on conflict (source_ref) do nothing;
  select document_id into strict recorded from rr_lease_private.wallet_sources where source_ref=btrim(p_source_ref);
  if recorded<>doc.id then raise exception 'This source attachment already belongs to a different wallet document'; end if;
  return doc.id;
end $$;

create function public.rr_lease_wallet_put_chunk(p_document_id uuid,p_index integer,p_base64 text) returns void
language plpgsql security definer set search_path='' as $$
declare doc public.rr_lease_wallet_documents; part bytea; original bytea;
begin
  select * into strict doc from public.rr_lease_wallet_documents where id=p_document_id for update;
  if p_index is null or p_index not between 0 and doc.chunk_count-1
    or p_base64 is null or length(p_base64)>65536 then raise exception 'Invalid wallet chunk'; end if;
  part=decode(p_base64,'base64');
  if octet_length(part)<>least(49152,doc.byte_size-p_index*49152) then raise exception 'Unexpected wallet chunk size'; end if;
  select bytes into original from rr_lease_private.wallet_chunks where document_id=doc.id and chunk_index=p_index;
  if found then
    if original<>part then raise exception 'Conflicting wallet chunk retry'; end if;
  elsif doc.is_ready then raise exception 'Verified wallet original cannot change';
  else insert into rr_lease_private.wallet_chunks values(doc.id,p_index,part);
  end if;
end $$;

create function public.rr_lease_wallet_finish(p_document_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare doc public.rr_lease_wallet_documents; previous public.rr_lease_wallet_documents; parts integer; original bytea; receipt jsonb;
begin
  perform 1 from public.rr_lease_operators where id=(
    select operator_id from public.rr_lease_wallet_documents where id=p_document_id) for update;
  select * into strict doc from public.rr_lease_wallet_documents where id=p_document_id for update;
  if doc.is_ready then return doc.id; end if;
  select * into previous from public.rr_lease_wallet_documents
    where operator_id=doc.operator_id and slot_key=doc.slot_key and is_current for update;
  if previous.id is distinct from doc.replaces then raise exception 'Another wallet version is current; review before publishing'; end if;
  if previous.issued_on>doc.issued_on then raise exception 'An older issue date cannot replace a newer original'; end if;
  select count(*),string_agg(bytes,''::bytea order by chunk_index) into parts,original
    from rr_lease_private.wallet_chunks where document_id=doc.id;
  if parts<>doc.chunk_count or octet_length(original)<>doc.byte_size or encode(sha256(original),'hex')<>doc.sha256
    then raise exception 'Incomplete wallet original or checksum mismatch'; end if;
  if doc.mime_type='application/json' then
    receipt=convert_from(original,'UTF8')::jsonb;
    if receipt->>'format' is distinct from 'roadready-outlook-receipt-v1'
      or coalesce(lower(receipt#>>'{body,content_type}'),'') not in ('html','text')
      or jsonb_typeof(receipt#>'{body,content}') is distinct from 'string'
      or coalesce(receipt#>>'{body,content}','')='' or coalesce(receipt->>'message_id','')=''
      or coalesce(receipt->>'sender','')='' or coalesce(receipt->>'received_at','')=''
      or coalesce(receipt->>'subject','')='' or coalesce(receipt->>'mailbox','')=''
      or not exists(select 1 from rr_lease_private.wallet_sources where document_id=doc.id and source_ref=receipt->>'source_ref')
      then raise exception 'Invalid email receipt archive'; end if;
    if doc.category='fuel_receipt' and (lower(receipt->>'sender')<>'support@mudflapinc.com'
      or lower(receipt->>'mailbox')<>'nartaexpress@hotmail.com'
      or not coalesce(receipt->'recipients' ? 'nartaexpress@hotmail.com',false)
      or receipt->>'subject' !~* '^Your Mudflap (receipt|refund)')
      then raise exception 'Original Mudflap receipt required'; end if;
  end if;
  update public.rr_lease_wallet_documents set is_current=false where id=previous.id;
  update public.rr_lease_wallet_documents set is_ready=true,is_current=true,revision=coalesce(previous.revision,0)+1 where id=doc.id;
  return doc.id;
end $$;

-- SECURITY INVOKER would need to expose the chunk table to the client. Authorize each byte read.
create function public.rr_lease_wallet_download_chunk(p_document_id uuid,p_index integer) returns text
language plpgsql stable security definer set search_path='' as $$
declare result text;
begin
  select translate(encode(c.bytes,'base64'),E'\n','') into result from rr_lease_private.wallet_chunks c
    join public.rr_lease_wallet_documents d on d.id=c.document_id
    join public.rr_lease_operators o on o.id=d.operator_id
    where d.id=p_document_id and d.is_ready and c.chunk_index=p_index
      and auth.uid() in(o.carrier_user_id,o.driver_user_id);
  if not found then raise exception 'Wallet original unavailable' using errcode='42501'; end if;
  return result;
end $$;

revoke all on function public.rr_lease_wallet_begin(uuid,text,text,text,text,text,integer,text,text,text,date,date,uuid),
 public.rr_lease_wallet_put_chunk(uuid,integer,text),public.rr_lease_wallet_finish(uuid),
 public.rr_lease_wallet_download_chunk(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_wallet_begin(uuid,text,text,text,text,text,integer,text,text,text,date,date,uuid),
 public.rr_lease_wallet_put_chunk(uuid,integer,text),public.rr_lease_wallet_finish(uuid) to service_role;
grant execute on function public.rr_lease_wallet_download_chunk(uuid,integer) to authenticated;

alter table public.rr_lease_adjustments add column wallet_document_id uuid,
  add foreign key(operator_id,wallet_document_id) references public.rr_lease_wallet_documents(operator_id,id);
create function rr_lease_private.adjustment_wallet_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if new.wallet_document_id is not null and not exists (
    select 1 from public.rr_lease_wallet_documents d join public.rr_lease_settlements s on s.operator_id=d.operator_id
    where s.id=new.settlement_id and d.id=new.wallet_document_id and d.is_ready
  ) then raise exception 'Settlement evidence must be a verified original belonging to its operator'; end if;
  return new;
end $$;
create trigger rr_lease_adjustment_wallet_check before insert or update of wallet_document_id,settlement_id
 on public.rr_lease_adjustments for each row execute function rr_lease_private.adjustment_wallet_guard();
