-- Trusted mail worker. Drivers read released loads through the separate portal.
begin;

create table public.rr_lease_mail_events (
  id uuid primary key default gen_random_uuid(),
  carrier_user_id uuid not null,
  load_id uuid not null references public.rr_lease_loads(id),
  document_id uuid not null unique references public.rr_lease_documents(id),
  message_id text not null check (length(message_id) between 1 and 1024),
  source_kind text not null default 'email' check (source_kind in ('email','owner_upload')),
  sender_email text,
  check ((source_kind='owner_upload' and sender_email is null) or
         (source_kind='email' and sender_email is not null and btrim(sender_email)<>'')),
  sha256 text not null,
  verified_for_billing boolean not null default false,
  evidence text not null check (length(evidence) between 1 and 1500),
  created_at timestamptz not null default now(),
  unique(carrier_user_id, message_id, sha256),
  unique(load_id, sha256)
);

-- One invoice identity per load. A worker disappearance leaves a durable send intent.
create table public.rr_lease_factoring (
  load_id uuid primary key references public.rr_lease_loads(id),
  claim_id uuid not null unique default gen_random_uuid(),
  invoice_no text not null unique check (invoice_no ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  amount_cents bigint not null check (amount_cents > 0),
  packet_id uuid not null unique references public.rr_lease_documents(id),
  ratecon_id uuid not null references public.rr_lease_documents(id),
  pod_ids uuid[] not null,
  supporting_ids uuid[] not null,
  subject text not null,
  recipient text not null default 'ffg@firstlinefundinggroup.com' check (recipient = 'ffg@firstlinefundinggroup.com'),
  status text not null default 'sending' check (status in ('sending','uncertain','sent','funded')),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_reference text,
  funded_at timestamptz,
  funding_reference text,
  explanation text,
  attempt_history jsonb not null default '[]'
);

alter table public.rr_lease_mail_events enable row level security;
alter table public.rr_lease_factoring enable row level security;
revoke all on table public.rr_lease_mail_events,public.rr_lease_factoring from public, anon, authenticated;
grant select, insert, update on table public.rr_lease_mail_events,public.rr_lease_factoring to service_role;

-- A load number alone is not a global identifier. The caller must supply the broker
-- and operator obtained from positive assignment evidence before storing an original.
create function public.rr_lease_stage_load(p_operator_id uuid,p_broker_name text,p_load_number text)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid; v_carrier uuid; v_operator uuid;
begin
  if nullif(btrim(p_broker_name),'') is null or nullif(btrim(p_load_number),'') is null
     or length(p_broker_name)>200 or length(p_load_number)>120 or p_load_number ~ '[[:cntrl:]]' or p_broker_name ~ '[[:cntrl:]]' then
    raise exception 'Broker and load number must be confirmed';
  end if;
  -- Serialize competing creators under the index's normalized business identity.
  select carrier_user_id into strict v_carrier from public.rr_lease_operators where id=p_operator_id;
  perform pg_advisory_xact_lock(hashtextextended(v_carrier::text||':'||lower(btrim(p_broker_name))||':'||lower(btrim(p_load_number)), 0));
  select l.id,l.operator_id into v_id,v_operator from public.rr_lease_loads l join public.rr_lease_operators o on o.id=l.operator_id
    where o.carrier_user_id=v_carrier and lower(btrim(l.broker_name))=lower(btrim(p_broker_name))
      and lower(btrim(l.load_number))=lower(btrim(p_load_number))
    order by (l.operator_id=p_operator_id),l.id limit 1;
  if found then
    if v_operator<>p_operator_id then raise exception 'Broker load already assigned to another driver; review assignment'; end if;
    return v_id;
  end if;
  insert into public.rr_lease_loads(operator_id,broker_name,load_number,status)
    values(p_operator_id,btrim(p_broker_name),btrim(p_load_number),'staging') returning id into v_id;
  return v_id;
end $$;

-- p_fields carries the complete *reviewed* snapshot from this rate con. Omissions
-- clear obsolete instructions on revisions. Original file bytes are verified first.
create function public.rr_lease_apply_intake(
  p_document_id uuid,p_source_kind text,p_message_id text,p_sender_email text,p_evidence text,
  p_fields jsonb default '{}'::jsonb,p_previous_ratecon_id uuid default null,
  p_verified_for_billing boolean default false
) returns uuid language plpgsql set search_path = '' as $$
declare
  d public.rr_lease_documents;
  l public.rr_lease_loads;
  owner_id uuid;
  driver_email text;
  prior public.rr_lease_documents;
  old public.rr_lease_mail_events;
  result_id uuid;
begin
  select * into strict d from public.rr_lease_documents where id=p_document_id;
  select * into strict l from public.rr_lease_loads where id=d.load_id for update;
  select o.carrier_user_id,i.email into strict owner_id,driver_email from public.rr_lease_operators o
    join rr_lease_private.operator_invites i on i.operator_id=o.id where o.id=l.operator_id;
  if p_source_kind is null or p_source_kind not in ('email','owner_upload')
     or nullif(btrim(p_message_id),'') is null or nullif(btrim(p_evidence),'') is null
     or (p_source_kind='email' and nullif(btrim(p_sender_email),'') is null)
     or (p_source_kind='owner_upload' and (p_sender_email is not null or left(p_message_id,5)<>'chat:' or length(btrim(p_message_id))<=5)) then
    raise exception 'Supply an actual source ID and driver assignment evidence. Owner uploads use a chat: file reference and no email';
  end if;
  -- Multiple mailboxes and owner uploads may deliver the same original concurrently.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':'||d.sha256,0));
  if d.kind in ('ratecon','pod') and exists(select 1 from public.rr_lease_mail_events e
      where e.carrier_user_id=owner_id and e.sha256=d.sha256 and e.load_id<>l.id) then
    raise exception 'Original already filed on another load; verify dispatch before reassignment';
  end if;
  select * into old from public.rr_lease_mail_events
    where carrier_user_id=owner_id and message_id=p_message_id and sha256=d.sha256;
  if found then
    if old.load_id<>l.id then raise exception 'Attachment already filed under a different load'; end if;
    return old.document_id;
  end if;
  select * into old from public.rr_lease_mail_events where load_id=l.id and sha256=d.sha256;
  if found then return old.document_id; end if;
  if l.status in ('closed','cancelled') or exists(select 1 from public.rr_lease_settlements where id=l.settlement_id and status <> 'draft')
     or exists(select 1 from public.rr_lease_factoring where load_id=l.id) then
    raise exception 'Load already invoiced, settled or closed: route amendment to carrier review';
  end if;
  if not public.rr_lease_original_ready(d.id) then raise exception 'Original has not been verified'; end if;
  if d.kind='ratecon' then
    if jsonb_typeof(p_fields) is distinct from 'object' or nullif(btrim(p_fields->>'pickup_address'),'') is null
       or nullif(btrim(p_fields->>'delivery_address'),'') is null or jsonb_typeof(p_fields->'steps') is distinct from 'array' then
      raise exception 'Both addresses and reviewed driver steps are required';
    end if;
    if jsonb_array_length(p_fields->'steps')=0 or
       exists(select 1 from jsonb_array_elements(p_fields->'steps') s where nullif(btrim(s->>'title'),'') is null or nullif(btrim(s->>'detail'),'') is null) then
      raise exception 'Each driver step requires a title and detail';
    end if;
    if (p_fields->>'gross_cents') is null or (p_fields->>'gross_cents') !~ '^[1-9][0-9]{0,11}$' then raise exception 'Confirm gross cents'; end if;
    select * into prior from public.rr_lease_documents where load_id=l.id and kind='ratecon' and is_current and id <> d.id;
    if prior.id is distinct from p_previous_ratecon_id then raise exception 'Rate con changed: review revision against current original'; end if;
    if prior.id is not null then
      update public.rr_lease_documents set is_current=false where id=prior.id;
    end if;
    update public.rr_lease_loads set pickup_address=btrim(p_fields->>'pickup_address'),
      delivery_address=btrim(p_fields->>'delivery_address'),pickup_number=p_fields->>'pickup_number',delivery_number=p_fields->>'delivery_number',
      pickup_at=(p_fields->>'pickup_at')::timestamptz,delivery_at=(p_fields->>'delivery_at')::timestamptz,
      pickup_timezone=p_fields->>'pickup_timezone',delivery_timezone=p_fields->>'delivery_timezone',
      reefer_instructions=p_fields->>'reefer_instructions',steps=p_fields->'steps',gross_cents=(p_fields->>'gross_cents')::bigint,
      status=case when status='staging' then 'assigned' else status end,updated_at=now() where id=l.id;
    update public.rr_lease_documents set revision=coalesce(prior.revision,0)+1 where id=d.id;
  elsif d.kind in ('pod','bol','supporting') then
    if l.status='staging' then raise exception 'File the matched rate con first'; end if;
    if d.kind='pod' and p_source_kind='email' and lower(btrim(p_sender_email)) is distinct from lower(btrim(driver_email))
       and not exists(select 1 from rr_lease_private.carrier_intake_mailboxes a where a.carrier_user_id=owner_id and a.email=lower(btrim(p_sender_email))) then
      raise exception 'POD sender does not match the registered operator';
    end if;
  else raise exception 'Unsupported inbound document kind'; end if;
  update public.rr_lease_documents set operator_visible=true,is_current=true where id=d.id;
  insert into public.rr_lease_mail_events(carrier_user_id,load_id,document_id,message_id,source_kind,sender_email,sha256,verified_for_billing,evidence)
    values(owner_id,l.id,d.id,p_message_id,p_source_kind,lower(btrim(p_sender_email)),d.sha256,p_verified_for_billing,btrim(p_evidence))
    returning document_id into result_id;
  return result_id;
end $$;

-- Approved intake mailboxes may forward originals for a positively identified driver.
-- These addresses confer no portal access and never select a driver on their own.
create table rr_lease_private.carrier_intake_mailboxes (
  carrier_user_id uuid not null references auth.users(id),
  email text not null check(email=lower(btrim(email)) and position('@' in email)>1),
  primary key(carrier_user_id,email)
);
revoke all on rr_lease_private.carrier_intake_mailboxes from public,anon,authenticated;
grant select,insert,delete on rr_lease_private.carrier_intake_mailboxes to service_role;

create function public.rr_lease_apply_mail(
  p_document_id uuid,p_message_id text,p_sender_email text,p_evidence text,
  p_fields jsonb default '{}'::jsonb,p_previous_ratecon_id uuid default null,
  p_verified_for_billing boolean default false
) returns uuid language sql set search_path='' as $$
  select public.rr_lease_apply_intake(p_document_id,'email',p_message_id,p_sender_email,p_evidence,p_fields,p_previous_ratecon_id,p_verified_for_billing);
$$;

-- Service and document receipt are different facts. The driver sees dates; the
-- exact mailbox/evidence references remain restricted to the worker.
alter table public.rr_lease_loads
  add column final_pod_id uuid references public.rr_lease_documents(id),
  add column actual_delivery_date date,
  add column required_docs_submitted_at timestamptz,
  add column payment_deadline date generated always as
    (((required_docs_submitted_at at time zone 'America/Chicago')::date)+15) stored;

create table rr_lease_private.delivery_receipts(
  load_id uuid not null references public.rr_lease_loads(id),
  receipt_reference text not null check(length(btrim(receipt_reference)) between 1 and 1500),
  submitted_at timestamptz not null,
  primary key(load_id,receipt_reference)
);
revoke all on table rr_lease_private.delivery_receipts from public,anon,authenticated;
grant select, insert on table rr_lease_private.delivery_receipts to service_role;

create function public.rr_lease_finalize_delivery(
  p_load_id uuid,p_final_pod_id uuid,p_actual_delivery_date date,p_all_stops_complete boolean,
  p_required_docs_submitted_at timestamptz default null,p_receipt_reference text default null
) returns jsonb language plpgsql set search_path='' as $$
declare
  l public.rr_lease_loads;
  s public.rr_lease_settlements;
  service_week date;
  target_week date;
  this_week date := date_trunc('week',current_timestamp at time zone 'America/Chicago')::date;
  verified_at timestamptz;
  is_leased boolean;
begin
  if p_all_stops_complete is distinct from true then raise exception 'Final delivery and every required stop must be verified'; end if;
  if p_actual_delivery_date is null or not isfinite(p_actual_delivery_date)
      or p_actual_delivery_date>(current_timestamp at time zone 'Pacific/Kiritimati')::date then
    raise exception 'A real delivery date from the final POD is required'; end if;
  if (p_required_docs_submitted_at is null)<>(nullif(btrim(p_receipt_reference),'') is null)
      or p_required_docs_submitted_at>clock_timestamp() or (p_required_docs_submitted_at is not null and not isfinite(p_required_docs_submitted_at)) then
    raise exception 'Use actual document receipt time and its source reference together'; end if;
  select * into strict l from public.rr_lease_loads where id=p_load_id for update;
  -- Older operator rows are leased. A carrier's own haul never creates a driver payable.
  select (coalesce(to_jsonb(o)->>'workspace_kind','leased')='leased') into strict is_leased
    from public.rr_lease_operators o where o.id=l.operator_id;
  if l.status in ('staging','cancelled') then raise exception 'Load cannot be allocated in this state'; end if;
  if not exists(select 1 from public.rr_lease_documents d join public.rr_lease_mail_events e on e.document_id=d.id
      where d.load_id=l.id and d.id=p_final_pod_id and d.kind='pod' and (d.is_current or d.id=l.final_pod_id) and d.is_ready)
      then raise exception 'Verified matched final POD original required'; end if;
  if l.actual_delivery_date is not null and l.actual_delivery_date<>p_actual_delivery_date then
    raise exception 'Actual delivery date conflicts with the recorded final POD; review evidence'; end if;

  service_week:=date_trunc('week',p_actual_delivery_date::timestamp)::date;
  if l.settlement_id is not null then
    select * into strict s from public.rr_lease_settlements where id=l.settlement_id for update;
  end if;
  -- A completed allocation is idempotent even after its statement is issued.
  if is_leased and (l.actual_delivery_date is null or s.id is null) then
    if s.id is not null and s.status<>'draft' then
      raise exception 'Review a previously issued settlement before recording a new delivery'; end if;
    target_week:=service_week;
    loop
      insert into public.rr_lease_settlements(operator_id,week_start) values(l.operator_id,target_week)
        on conflict(operator_id,week_start) do nothing;
      select * into strict s from public.rr_lease_settlements where operator_id=l.operator_id and week_start=target_week for update;
      exit when s.status='draft';
      target_week:=greatest(target_week+7,this_week);
    end loop;
  end if;

  if p_required_docs_submitted_at is not null then
    insert into rr_lease_private.delivery_receipts(load_id,receipt_reference,submitted_at)
      values(l.id,btrim(p_receipt_reference),p_required_docs_submitted_at) on conflict do nothing;
    select submitted_at into strict verified_at from rr_lease_private.delivery_receipts
      where load_id=l.id and receipt_reference=btrim(p_receipt_reference);
    if verified_at<>p_required_docs_submitted_at then raise exception 'Receipt has a conflicting source timestamp'; end if;
    verified_at:=least(verified_at,l.required_docs_submitted_at);
  else verified_at:=l.required_docs_submitted_at;
  end if;
  -- A later retransmission of the same delivery paperwork never moves the payment deadline forward.
  if l.actual_delivery_date is null or l.settlement_id is distinct from s.id
     or (is_leased and l.required_docs_submitted_at is distinct from verified_at) then
    update public.rr_lease_loads set actual_delivery_date=p_actual_delivery_date,final_pod_id=coalesce(final_pod_id,p_final_pod_id),
      required_docs_submitted_at=case when is_leased then verified_at end,settlement_id=s.id,status=case when status='closed' then 'closed' else 'delivered' end
      where id=l.id returning * into l;
  end if;
  return jsonb_build_object('settlement_id',s.id,'week_start',s.week_start,'service_week',service_week,
    'actual_delivery_date',l.actual_delivery_date,'required_docs_submitted_at',l.required_docs_submitted_at,
    'payment_deadline',l.payment_deadline,'catch_up',s.week_start<>service_week);
end $$;

-- Claim just before sending, after a private PDF has been constructed from these
-- originals and its bytes verified. Only a newly inserted claim can send once.
create function public.rr_lease_claim_factoring(
  p_load_id uuid,p_packet_id uuid,p_invoice_no text,p_amount_cents bigint,p_ratecon_id uuid,p_pod_ids uuid[],p_supporting_ids uuid[] default '{}'::uuid[]
) returns jsonb language plpgsql set search_path = '' as $$
declare
  l public.rr_lease_loads;
  f public.rr_lease_factoring;
  d public.rr_lease_documents;
  allowed_pods uuid[];
  doc_id uuid;
begin
  select * into strict l from public.rr_lease_loads where id=p_load_id for update;
  select * into f from public.rr_lease_factoring where load_id=l.id;
  if found then return jsonb_build_object('send',false,'status',f.status,'invoice_no',f.invoice_no,'subject',f.subject,'claim_id',f.claim_id); end if;
  if l.status not in ('delivered','closed') or l.actual_delivery_date is null or l.gross_cents is distinct from p_amount_cents or coalesce(p_amount_cents,0)<=0 then
    raise exception 'Confirmed delivery and current gross required';
  end if;
  select * into strict d from public.rr_lease_documents where id=p_packet_id and load_id=l.id and kind='invoice' and mime_type='application/pdf';
  if not public.rr_lease_original_ready(d.id) then raise exception 'Verified complete invoice packet required'; end if;
  if not exists(select 1 from public.rr_lease_documents where id=p_ratecon_id and load_id=l.id and kind='ratecon' and is_current and operator_visible)
    or not public.rr_lease_original_ready(p_ratecon_id) then raise exception 'Current rate confirmation required'; end if;
  select array_agg(id order by id) into allowed_pods from public.rr_lease_documents where load_id=l.id and kind='pod' and is_current;
  if coalesce(cardinality(p_pod_ids),0)=0 or allowed_pods is distinct from array(select unnest(p_pod_ids) order by 1) then
    raise exception 'All current matched POD originals are required';
  end if;
  foreach doc_id in array p_pod_ids loop
    if not exists(select 1 from public.rr_lease_mail_events where load_id=l.id and document_id=doc_id and verified_for_billing)
       or not public.rr_lease_original_ready(doc_id) then raise exception 'POD signature, completeness or exception needs review'; end if;
  end loop;
  foreach doc_id in array coalesce(p_supporting_ids,'{}'::uuid[]) loop
    if not exists(select 1 from public.rr_lease_documents doc join public.rr_lease_mail_events ev on ev.document_id=doc.id
      where doc.id=doc_id and doc.load_id=l.id and doc.kind in ('bol','supporting') and doc.is_current and ev.verified_for_billing)
      or not public.rr_lease_original_ready(doc_id) then raise exception 'Supporting document is unrelated or unreviewed'; end if;
  end loop;
  insert into public.rr_lease_factoring(load_id,invoice_no,amount_cents,packet_id,ratecon_id,pod_ids,supporting_ids,subject)
    values(l.id,p_invoice_no,p_amount_cents,p_packet_id,p_ratecon_id,p_pod_ids,coalesce(p_supporting_ids,'{}'::uuid[]),
    'Narta Express LLC | Invoice '||p_invoice_no||' | Load '||l.load_number) returning * into f;
  return jsonb_build_object('send',true,'claim_id',f.claim_id,'subject',f.subject,'recipient',f.recipient,'invoice_no',f.invoice_no);
end $$;

create function public.rr_lease_finish_factoring(p_claim_id uuid,p_status text,p_reference text)
returns text language plpgsql set search_path = '' as $$
declare f public.rr_lease_factoring;
begin
  if nullif(btrim(p_reference),'') is null then raise exception 'Provide provider confirmation or reason'; end if;
  select * into strict f from public.rr_lease_factoring where claim_id=p_claim_id for update;
  if f.status=p_status then return f.status; end if;
  if p_status='sent' and f.status in ('sending','uncertain') then
    update public.rr_lease_factoring set status='sent',sent_at=now(),sent_reference=p_reference where claim_id=f.claim_id;
  elsif p_status='uncertain' and f.status='sending' then
    update public.rr_lease_factoring set status='uncertain',explanation=p_reference where claim_id=f.claim_id;
  elsif p_status='funded' and f.status='sent' then
    update public.rr_lease_factoring set status='funded',funded_at=now(),funding_reference=p_reference where claim_id=f.claim_id;
  else raise exception 'Unsupported transition from % to %',f.status,p_status; end if;
  return p_status;
end $$;
-- Complete a previously ambiguous review against the actual original. Retire a
-- superseded scan only when its verified replacement belongs to the same load.
create function public.rr_lease_review_evidence(p_document_id uuid,p_reason text,p_replaces_id uuid default null)
returns void language plpgsql set search_path='' as $$
declare d public.rr_lease_documents;
begin
  select * into strict d from public.rr_lease_documents where id=p_document_id and kind in ('pod','supporting','bol') and is_current;
  perform 1 from public.rr_lease_loads where id=d.load_id and status in ('assigned','picked_up','delivered') for update;
  if not found or exists(select 1 from public.rr_lease_factoring where load_id=d.load_id)
     or nullif(btrim(p_reason),'') is null or not public.rr_lease_original_ready(d.id) then
    raise exception 'Verify evidence on an open unfactored load'; end if;
  if p_replaces_id is not null then
    if p_replaces_id=d.id then raise exception 'Cannot replace this original with itself'; end if;
    update public.rr_lease_documents set is_current=false where id=p_replaces_id and kind=d.kind and load_id=d.load_id and is_current;
    if not found then raise exception 'No matching prior original'; end if;
  end if;
  update public.rr_lease_mail_events set verified_for_billing=true,
    evidence=left(evidence,850)||' | Reviewed: '||left(btrim(p_reason),625) where document_id=d.id;
  if not found then raise exception 'Document has no mail provenance'; end if;
end $$;

-- A definitive provider rejection is positive evidence that the send failed.
-- A timeout, no response or an empty Sent search must stay uncertain.
create function public.rr_lease_retry_rejected(p_previous_claim uuid,p_rejection_reference text)
returns jsonb language plpgsql set search_path='' as $$
declare f public.rr_lease_factoring;
begin
  if nullif(btrim(p_rejection_reference),'') is null then raise exception 'Definitive provider rejection evidence required'; end if;
  select * into f from public.rr_lease_factoring where claim_id=p_previous_claim for update;
  if not found or f.status not in ('sending','uncertain') then return jsonb_build_object('send',false); end if;
  update public.rr_lease_factoring set attempt_history=attempt_history||jsonb_build_array(
      jsonb_build_object('claim_id',p_previous_claim,'at',claimed_at,'rejection',p_rejection_reference)),
    status='sending',claim_id=gen_random_uuid(),claimed_at=now(),explanation=null where load_id=f.load_id returning * into f;
  return jsonb_build_object('send',true,'claim_id',f.claim_id,'subject',f.subject,'recipient',f.recipient,'invoice_no',f.invoice_no,'packet_id',f.packet_id);
end $$;
revoke all on function public.rr_lease_stage_load(uuid,text,text),
  public.rr_lease_apply_intake(uuid,text,text,text,text,jsonb,uuid,boolean),
  public.rr_lease_apply_mail(uuid,text,text,text,jsonb,uuid,boolean),
  public.rr_lease_finalize_delivery(uuid,uuid,date,boolean,timestamptz,text),
  public.rr_lease_claim_factoring(uuid,uuid,text,bigint,uuid,uuid[],uuid[]),
  public.rr_lease_review_evidence(uuid,text,uuid),public.rr_lease_retry_rejected(uuid,text),
  public.rr_lease_finish_factoring(uuid,text,text) from public,anon,authenticated;
grant execute on function public.rr_lease_stage_load(uuid,text,text),
  public.rr_lease_apply_intake(uuid,text,text,text,text,jsonb,uuid,boolean),
  public.rr_lease_apply_mail(uuid,text,text,text,jsonb,uuid,boolean),
  public.rr_lease_finalize_delivery(uuid,uuid,date,boolean,timestamptz,text),
  public.rr_lease_claim_factoring(uuid,uuid,text,bigint,uuid,uuid[],uuid[]),
  public.rr_lease_review_evidence(uuid,text,uuid),public.rr_lease_retry_rejected(uuid,text),
  public.rr_lease_finish_factoring(uuid,text,text) to service_role;
commit;
