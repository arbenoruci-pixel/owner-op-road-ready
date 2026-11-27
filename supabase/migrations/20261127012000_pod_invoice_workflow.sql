-- Enable only on an isolated staging database for an explicitly enrolled carrier.
-- The reviewer, delivery finalizer, invoice send claim and settlement ledger remain authoritative.
begin;

create table rr_lease_private.pod_workflow_carriers (
  carrier_user_id uuid primary key references auth.users(id),
  enabled_at timestamptz not null default clock_timestamp()
);
create table rr_lease_private.pod_invoice_drafts (
  load_id uuid primary key references public.rr_lease_loads(id),
  id uuid not null unique default gen_random_uuid(),
  received_at timestamptz not null,
  updated_at timestamptz not null,
  delivery_total integer check (delivery_total between 1 and 100)
);
-- A correction supplied after factoring is evidence for the office. It is never
-- inserted as a current billing original or appended to a completed packet.
create table rr_lease_private.pod_addenda (
  document_id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.rr_lease_factoring(load_id),
  actor uuid not null references auth.users(id),
  file_name text not null,
  mime_type text not null,
  sha256 text not null,
  original bytea not null check (octet_length(original) between 1 and 3145728),
  received_at timestamptz not null default clock_timestamp(),
  unique(load_id,sha256)
);
create table rr_lease_private.pod_addendum_requests (
  actor uuid not null references auth.users(id),
  request_id uuid not null,
  load_id uuid not null references public.rr_lease_loads(id),
  document_id uuid not null,
  sha256 text not null,
  primary key(actor,request_id)
);
create table rr_lease_private.pod_mail_outbox (
  -- An original rr_lease_document or a pod_addendum; only the two private enqueue paths can insert.
  document_id uuid primary key,
  carrier_user_id uuid not null references auth.users(id),
  load_id uuid not null references public.rr_lease_loads(id),
  received_at timestamptz not null,
  addendum boolean not null,
  assigned_upload boolean not null,
  status text not null default 'pending' check(status in ('pending','processing','sending','retry','review','accepted')),
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  claim_id uuid,
  lease_until timestamptz,
  reason text,
  reconciliation_history jsonb not null default '[]',
  changed_at timestamptz not null default now()
);
create index pod_mail_due on rr_lease_private.pod_mail_outbox(status, available_at, lease_until);
create index pod_mail_by_load on rr_lease_private.pod_mail_outbox(load_id,received_at,document_id);
-- A correction supersedes one stop's association, never another stop's evidence.
create table rr_lease_private.pod_delivery_links (
  load_id uuid not null references rr_lease_private.pod_invoice_drafts(load_id),
  delivery integer not null check(delivery between 1 and 100),
  revision integer not null check(revision > 0),
  document_id uuid not null references public.rr_lease_documents(id),
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default clock_timestamp(),
  primary key(load_id,delivery,revision)
);
alter table rr_lease_private.pod_workflow_carriers enable row level security;
alter table rr_lease_private.pod_invoice_drafts enable row level security;
alter table rr_lease_private.pod_mail_outbox enable row level security;
alter table rr_lease_private.pod_delivery_links enable row level security;
alter table rr_lease_private.pod_addenda enable row level security;
alter table rr_lease_private.pod_addendum_requests enable row level security;
revoke all on rr_lease_private.pod_workflow_carriers, rr_lease_private.pod_invoice_drafts,
  rr_lease_private.pod_mail_outbox, rr_lease_private.pod_delivery_links, rr_lease_private.pod_addenda,
  rr_lease_private.pod_addendum_requests from public,anon,authenticated,service_role;

create function rr_lease_private.pod_enqueue(p_carrier uuid,p_load uuid,p_doc uuid,p_received timestamptz,p_addendum boolean,p_assigned boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select from rr_lease_private.pod_workflow_carriers where carrier_user_id=p_carrier) then return; end if;
  insert into rr_lease_private.pod_mail_outbox(document_id,carrier_user_id,load_id,received_at,addendum,assigned_upload)
    values(p_doc,p_carrier,p_load,p_received,p_addendum,p_assigned) on conflict(document_id) do nothing;
  if found then
    insert into rr_lease_private.pod_invoice_drafts(load_id,received_at,updated_at) values(p_load,p_received,p_received)
      on conflict(load_id) do update set updated_at=greatest(rr_lease_private.pod_invoice_drafts.updated_at,excluded.updated_at);
  end if;
end $$;

-- Commit RPC assigns document_id only after storing the original and registering
-- driver_upload evidence. The trigger and the original share the transaction.
create function rr_lease_private.pod_committed()
returns trigger language plpgsql security definer set search_path='' as $$
declare evidence public.rr_lease_mail_events; enabled_since timestamptz;
begin
  select c.enabled_at into enabled_since from rr_lease_private.pod_workflow_carriers c
    join public.rr_lease_operators o on c.carrier_user_id=o.carrier_user_id where o.id=new.operator_id;
  if not found then return null; end if;
  select m.* into strict evidence from public.rr_lease_mail_events m
    join public.rr_lease_documents d on d.id=m.document_id and d.load_id=m.load_id
    join public.rr_lease_loads l on l.id=d.load_id and l.operator_id=new.operator_id
    where m.document_id=new.document_id and m.source_kind='driver_upload' and m.uploaded_by=new.actor
      and d.kind='pod' and d.is_ready and d.sha256=new.digest and m.sha256=new.digest;
  if evidence.upload_received_at<enabled_since then return null; end if;
  if exists(select from rr_lease_private.pod_addenda a join public.rr_lease_loads l on l.id=a.load_id
    join public.rr_lease_operators o on o.id=l.operator_id where a.sha256=new.digest
    and o.carrier_user_id=evidence.carrier_user_id and a.load_id<>evidence.load_id) then
    raise exception 'Original already filed; carrier review required' using errcode='23505';
  end if;
  perform rr_lease_private.pod_enqueue(evidence.carrier_user_id,evidence.load_id,new.document_id,
    evidence.upload_received_at,false,new.load_id is not null);
  return null;
end $$;
create trigger pod_commit_enqueue after update of document_id on rr_lease_private.step2b_upload_intents
for each row when(old.document_id is null and new.document_id is not null)
execute function rr_lease_private.pod_committed();

-- An enrolled staging draft cannot release a real FirstLine send through the
-- existing initial-claim or rejected-send retry RPC. Historical status updates
-- (for example, recording confirmed receipt/funding) retain their normal flow.
create function rr_lease_private.pod_staging_factoring_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare checked_loads uuid[]:=array[new.load_id];
begin
  if tg_op='UPDATE' then
    if new.load_id=old.load_id and new.claim_id=old.claim_id
      and (new.status<>'sending' or old.status='sending') then return new; end if;
    checked_loads:=array[old.load_id,new.load_id];
  end if;
  -- Serialize with original registration on enrolled loads. An unenrolled
  -- operator does not take this additional lock or acquire any workflow state.
  perform l.id from public.rr_lease_loads l join public.rr_lease_operators o on o.id=l.operator_id
    join rr_lease_private.pod_workflow_carriers c on c.carrier_user_id=o.carrier_user_id
    where l.id=any(checked_loads) order by l.id for update of l;
  if found and exists(select from rr_lease_private.pod_invoice_drafts dr
    join public.rr_lease_loads l on l.id=dr.load_id join public.rr_lease_operators o on o.id=l.operator_id
    join rr_lease_private.pod_workflow_carriers c on c.carrier_user_id=o.carrier_user_id
    where dr.load_id=any(checked_loads)) then
    raise exception 'FirstLine sending is disabled for this staging draft' using errcode='55000';
  end if;
  return new;
end $$;
create trigger pod_staging_firstline_interlock before insert or update of load_id,claim_id,status on public.rr_lease_factoring
for each row execute function rr_lease_private.pod_staging_factoring_guard();
revoke all on function rr_lease_private.pod_staging_factoring_guard() from public,anon,authenticated,service_role;

create function public.rr_pod_mail_claim() returns jsonb
language plpgsql security definer set search_path='' as $$
declare job rr_lease_private.pod_mail_outbox; result jsonb;
begin
  -- An external request may already have succeeded; expired sends never re-enter
  -- the automatic retry path without a verified mailbox/provider outcome.
  update rr_lease_private.pod_mail_outbox set status='review',claim_id=null,lease_until=null,
    reason='Sending timed out. Reconcile the exact message in Hotmail.',changed_at=clock_timestamp()
    where status='sending' and lease_until<=clock_timestamp();
  select q.* into job from rr_lease_private.pod_mail_outbox q
    join rr_lease_private.pod_workflow_carriers c on c.carrier_user_id=q.carrier_user_id
    where (q.status in ('pending','retry') and q.available_at<=clock_timestamp())
       or (q.status='processing' and q.lease_until<=clock_timestamp())
    order by q.available_at,q.received_at,q.document_id limit 1 for update of q skip locked;
  if not found then return null; end if;
  update rr_lease_private.pod_mail_outbox set status='processing',claim_id=gen_random_uuid(),
    lease_until=clock_timestamp()+interval '3 minutes',attempts=attempts+1,changed_at=clock_timestamp()
    where document_id=job.document_id returning * into job;
  select jsonb_build_object('document_id',job.document_id,'claim_id',job.claim_id,'load_id',l.id,
    'load_number',l.load_number,'broker',l.broker_name,'driver',o.driver_name,'carrier_user_id',o.carrier_user_id,
    'received_at',job.received_at,'addendum',job.addendum,'assigned_upload',job.assigned_upload)
    into strict result from public.rr_lease_loads l join public.rr_lease_operators o on o.id=l.operator_id
    where l.id=job.load_id and o.carrier_user_id=job.carrier_user_id;
  return result;
end $$;

create function public.rr_pod_mail_advance(p_document uuid,p_claim uuid,p_status text,p_reason text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('sending','accepted','retry','review') or p_status is null then return false; end if;
  update rr_lease_private.pod_mail_outbox set status=p_status,changed_at=clock_timestamp(),
    reason=left(nullif(btrim(p_reason),''),500),
    lease_until=case when p_status='sending' then clock_timestamp()+interval '3 minutes' end,
    claim_id=case when p_status='sending' then claim_id end,
    available_at=case when p_status='retry' then clock_timestamp()+make_interval(secs=>least(3600,30*(1<<least(attempts,7)))) else available_at end
    where document_id=p_document and claim_id=p_claim
      and ((p_status='sending' and status='processing' and lease_until>clock_timestamp()
        and exists(select from rr_lease_private.pod_workflow_carriers c where c.carrier_user_id=pod_mail_outbox.carrier_user_id))
       or (p_status='accepted' and status='sending')
       or (p_status in ('retry','review') and status in ('processing','sending')));
  return found;
end $$;

create function public.rr_lease_pod_mail_reconcile(p_document uuid,p_has_receipt boolean,p_reference text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or p_has_receipt is null or length(btrim(coalesce(p_reference,''))) not between 5 and 400 then
    raise exception 'Verified mailbox or provider evidence is required' using errcode='22023'; end if;
  update rr_lease_private.pod_mail_outbox set status=case when p_has_receipt then 'accepted' else 'retry' end,
    reason=(case when p_has_receipt then 'Confirmed mailbox receipt: ' else 'Provider confirmed non-delivery: ' end)||btrim(p_reference),
    changed_at=clock_timestamp(),available_at=clock_timestamp(),
    reconciliation_history=reconciliation_history||jsonb_build_array(jsonb_build_object(
      'reviewed_by',auth.uid(),'reviewed_at',clock_timestamp(),'confirmed_receipt',p_has_receipt,'evidence',btrim(p_reference)))
    where document_id=p_document and carrier_user_id=auth.uid() and status='review'
      and exists(select from rr_lease_private.pod_workflow_carriers c where c.carrier_user_id=auth.uid());
  return found;
end $$;

create function public.rr_lease_pod_correction_loads(p_operator_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(l.id order by l.id),'[]') from public.rr_lease_operators o
  join rr_lease_private.pod_workflow_carriers c on c.carrier_user_id=o.carrier_user_id
  join public.rr_lease_loads l on l.operator_id=o.id
  join public.rr_lease_factoring f on f.load_id=l.id and f.status in ('sent','funded')
  where o.id=p_operator_id and (o.carrier_user_id=auth.uid() or (o.workspace_kind='leased' and o.driver_user_id=auth.uid()))
$$;

create function public.rr_lease_pod_addendum(p_load_id uuid,p_request_id uuid,p_file_name text,p_mime text,p_base64 text,p_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); owner_id uuid; evidence_id uuid; contents bytea; received timestamptz;
  prior rr_lease_private.pod_addendum_requests;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_request_id is null or p_file_name is null or length(btrim(p_file_name)) not between 1 and 255
     or p_file_name ~ '[[:cntrl:]/\\]' or p_mime is null or p_mime not in ('application/pdf','image/jpeg','image/png','image/webp')
     or p_base64 is null or length(p_base64) not between 1 and 4194304 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid original metadata' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rr-step2b-intent:'||actor_id::text,0));
  select o.carrier_user_id into owner_id from public.rr_lease_loads l
    join public.rr_lease_operators o on o.id=l.operator_id
    join public.rr_lease_factoring f on f.load_id=l.id and f.status in ('sent','funded')
    join rr_lease_private.pod_workflow_carriers c on c.carrier_user_id=o.carrier_user_id
    where l.id=p_load_id and (o.carrier_user_id=actor_id or (o.workspace_kind='leased' and o.driver_user_id=actor_id))
    for share of l,o,f;
  if not found then raise exception 'Correction unavailable' using errcode='42501'; end if;
  contents:=decode(p_base64,'base64');
  if octet_length(contents) not between 1 and 3145728 or encode(sha256(contents),'hex')<>p_sha256
     or not rr_lease_private.step2b_magic(contents,p_mime) then
    raise exception 'Original size, MIME or checksum mismatch' using errcode='22023';
  end if;
  select * into prior from rr_lease_private.pod_addendum_requests where actor=actor_id and request_id=p_request_id;
  if found then
    if row(prior.load_id,prior.sha256) is distinct from row(p_load_id,p_sha256) then
      raise exception 'Request already used for another original' using errcode='23505'; end if;
    evidence_id:=prior.document_id;
  else
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':'||p_sha256,0));
    if exists(select from public.rr_lease_mail_events where carrier_user_id=owner_id and sha256=p_sha256 and load_id<>p_load_id)
      or exists(select from rr_lease_private.pod_addenda a join public.rr_lease_loads l on l.id=a.load_id
        join public.rr_lease_operators o on o.id=l.operator_id where o.carrier_user_id=owner_id and a.sha256=p_sha256 and a.load_id<>p_load_id) then
      raise exception 'Original already filed; carrier review required' using errcode='23505'; end if;
    select a.document_id into evidence_id from rr_lease_private.pod_addenda a where a.load_id=p_load_id and a.sha256=p_sha256;
    if evidence_id is null then
      select d.id into evidence_id from public.rr_lease_documents d where d.load_id=p_load_id and d.kind='pod' and d.sha256=p_sha256 and d.is_ready;
      if evidence_id is null then
        if (select count(*) from rr_lease_private.pod_addenda where actor=actor_id and received_at>clock_timestamp()-interval '1 day')>=30 then
          raise exception 'Daily correction upload limit reached' using errcode='22023'; end if;
        insert into rr_lease_private.pod_addenda(load_id,actor,file_name,mime_type,sha256,original)
          values(p_load_id,actor_id,btrim(p_file_name),p_mime,p_sha256,contents) returning document_id,received_at into evidence_id,received;
        perform rr_lease_private.pod_enqueue(owner_id,p_load_id,evidence_id,received,true,true);
      end if;
    end if;
    insert into rr_lease_private.pod_addendum_requests(actor,request_id,load_id,document_id,sha256)
      values(actor_id,p_request_id,p_load_id,evidence_id,p_sha256);
  end if;
  return jsonb_build_object('loadId',p_load_id,'documentId',evidence_id,'review_status',
    case when exists(select from rr_lease_private.pod_addenda where document_id=evidence_id) then 'CORRECTION_REVIEW' else 'ALREADY_FILED' end);
end $$;

-- The actual signed original is opened on demand by an authenticated carrier owner.
create function public.rr_lease_pod_workflow_original(p_document_id uuid,p_index integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_index is null or p_index not between 0 and 63 then raise exception 'Invalid chunk' using errcode='22023'; end if;
  select jsonb_build_object('file_name',coalesce(d.file_name,a.file_name),'mime_type',coalesce(d.mime_type,a.mime_type),
    'sha256',coalesce(d.sha256,a.sha256),'byte_size',coalesce(d.byte_size,octet_length(a.original)),
    'chunk_count',coalesce(d.chunk_count,(octet_length(a.original)+49151)/49152),
    'base64',encode(coalesce(k.bytes,substring(a.original from p_index*49152+1 for 49152)),'base64'))
    into result from rr_lease_private.pod_mail_outbox q join rr_lease_private.pod_workflow_carriers c using(carrier_user_id)
    left join public.rr_lease_documents d on d.id=q.document_id and d.load_id=q.load_id and d.kind='pod' and d.is_ready
    left join rr_lease_private.document_chunks k on k.document_id=d.id and k.chunk_index=p_index
    left join rr_lease_private.pod_addenda a on a.document_id=q.document_id and a.load_id=q.load_id
    where q.document_id=p_document_id and q.carrier_user_id=auth.uid()
      and (k.bytes is not null or (q.addendum and p_index*49152<octet_length(a.original)));
  if result is null then raise exception 'Original unavailable' using errcode='42501'; end if;
  return result;
end $$;

create function public.rr_lease_pod_cover_delivery(p_load_id uuid,p_delivery integer,p_total integer,p_document_id uuid,p_previous_document_id uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare latest rr_lease_private.pod_delivery_links; known_total int;
begin
  if p_total is null or p_total not between 1 and 100 or p_delivery is null or p_delivery not between 1 and p_total then
    raise exception 'Invalid delivery number or total' using errcode='22023'; end if;
  select dr.delivery_total into known_total from public.rr_lease_loads l join public.rr_lease_operators o on o.id=l.operator_id
    join rr_lease_private.pod_invoice_drafts dr on dr.load_id=l.id join rr_lease_private.pod_workflow_carriers c on c.carrier_user_id=o.carrier_user_id
    where l.id=p_load_id and o.carrier_user_id=auth.uid() for update of l,dr;
  if not found then raise exception 'Load unavailable' using errcode='42501'; end if;
  perform rr_lease_private.step2a_assert_pod_review_open(p_load_id);
  if known_total is not null and known_total<>p_total then raise exception 'Delivery total differs from the recorded total' using errcode='22023'; end if;
  if not exists(select from public.rr_lease_documents d join public.rr_lease_mail_events m on m.document_id=d.id and m.load_id=d.load_id
      where d.id=p_document_id and d.load_id=p_load_id and d.kind='pod' and d.is_ready and d.is_current
      and m.verified_for_billing and m.rejected_at is null and m.carrier_user_id=auth.uid()) then
    raise exception 'Approve this load’s current POD before covering a delivery' using errcode='22023'; end if;
  select * into latest from rr_lease_private.pod_delivery_links where load_id=p_load_id and delivery=p_delivery order by revision desc limit 1;
  if latest.document_id=p_document_id then return true; end if;
  if latest.document_id is distinct from p_previous_document_id then raise exception 'Delivery has changed; refresh before replacing its POD' using errcode='40001'; end if;
  insert into rr_lease_private.pod_delivery_links(load_id,delivery,revision,document_id,decided_by)
    values(p_load_id,p_delivery,coalesce(latest.revision,0)+1,p_document_id,auth.uid());
  update rr_lease_private.pod_invoice_drafts set delivery_total=p_total,updated_at=clock_timestamp() where load_id=p_load_id;
  return true;
end $$;

-- A durable draft has a single identity. Its projection reads the live approved
-- evidence on every request, so a corrected rate or a rejected POD cannot leave
-- an obsolete amount or release decision cached on the draft.
create function public.rr_lease_pod_invoice_drafts(p_after_load_id uuid default null,p_limit integer default 50,p_load_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
with selected as materialized (
  select dr.id draft_id,dr.delivery_total,dr.received_at,dr.updated_at draft_changed,
    l.id load_id,l.load_number,l.broker_name,l.pickup_address,l.delivery_address,l.gross_cents,
    l.actual_delivery_date,l.final_pod_id,l.status load_status,l.updated_at load_changed,
    o.driver_name,o.carrier_user_id,f.invoice_no,f.amount_cents recorded_amount,f.status factoring_status
  from rr_lease_private.pod_invoice_drafts dr join public.rr_lease_loads l on l.id=dr.load_id
  join public.rr_lease_operators o on o.id=l.operator_id and o.carrier_user_id=auth.uid()
  join rr_lease_private.pod_workflow_carriers c on c.carrier_user_id=o.carrier_user_id
  left join public.rr_lease_factoring f on f.load_id=l.id
  where (p_after_load_id is null or l.id>p_after_load_id) and (p_load_id is null or l.id=p_load_id)
  order by l.id limit least(greatest(coalesce(p_limit,50),1),100)
), evidence as (
  select s.*,
    exists(select from public.rr_lease_documents r join public.rr_lease_mail_events m on m.document_id=r.id and m.load_id=r.load_id
      where r.load_id=s.load_id and r.kind='ratecon' and r.is_ready and r.is_current and m.sha256=r.sha256
        and m.carrier_user_id=s.carrier_user_id and m.verified_for_billing and m.rejected_at is null) rate_verified,
    exists(select from public.rr_lease_documents d join public.rr_lease_mail_events m on m.document_id=d.id and m.load_id=d.load_id
      where d.id=s.final_pod_id and d.load_id=s.load_id and d.kind='pod' and d.is_ready and d.is_current
        and m.carrier_user_id=s.carrier_user_id and m.verified_for_billing and m.sha256=d.sha256 and m.rejected_at is null
        and (m.source_kind<>'driver_upload' or exists(select from rr_lease_private.step2b_pod_decisions z where z.document_id=d.id
          and z.decision='APPROVE' and z.set_as_final))) final_verified,
    n.notifications,n.pod_count,n.pending,n.corrections,n.unmatched_pending,n.last_change,
    stops.covered,stops.assignments,stops.missing,stops.stop_blockers
  from selected s
  cross join lateral (
    select count(*) pod_count,bool_or(q.addendum) corrections,
      bool_or(not q.addendum and e.rejected_at is null and not e.verified_for_billing and d.is_current) pending,
      bool_or(not q.assigned_upload and e.rejected_at is null and not e.verified_for_billing) unmatched_pending,
      max(greatest(q.changed_at,e.approved_at,e.rejected_at)) last_change,
      jsonb_agg(jsonb_build_object('document_id',q.document_id,'status',q.status,'received_at',q.received_at,
        'reason',q.reason,'file_name',coalesce(d.file_name,a.file_name),'sha256',coalesce(d.sha256,a.sha256),
        'addendum',q.addendum,'verified_for_billing',coalesce(e.verified_for_billing,false),
        'review_status',case when q.addendum then 'CORRECTION_REVIEW' when e.rejected_at is not null then 'REJECTED'
          when e.verified_for_billing then 'APPROVED' else 'PENDING' end)
        order by q.received_at desc,q.document_id) notifications
      from rr_lease_private.pod_mail_outbox q
      left join public.rr_lease_documents d on d.id=q.document_id and d.load_id=q.load_id
      left join public.rr_lease_mail_events e on e.document_id=d.id and e.load_id=q.load_id
      left join rr_lease_private.pod_addenda a on a.document_id=q.document_id and a.load_id=q.load_id
      where q.load_id=s.load_id and q.carrier_user_id=s.carrier_user_id
  ) n
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('delivery',t.delivery,'document_id',t.document_id)
        order by t.delivery) filter(where t.document_id is not null),'[]') covered,
      coalesce(jsonb_agg(jsonb_build_object('delivery',t.delivery,'document_id',t.recorded_document)
        order by t.delivery) filter(where t.recorded_document is not null),'[]') assignments,
      coalesce(jsonb_agg(t.delivery order by t.delivery) filter(where t.document_id is null),'[]') missing,
      coalesce(array_agg(format('Missing POD for delivery %s of %s',t.delivery,s.delivery_total) order by t.delivery)
        filter(where t.document_id is null),array[]::text[]) stop_blockers
    from (select ord delivery,latest.document_id recorded_document,case when d.id is not null and e.verified_for_billing and e.rejected_at is null then d.id end document_id
      from generate_series(1,s.delivery_total) ord
      left join lateral (select link.document_id from rr_lease_private.pod_delivery_links link
        where link.load_id=s.load_id and link.delivery=ord order by link.revision desc limit 1) latest on true
      left join public.rr_lease_documents d on d.id=latest.document_id and d.load_id=s.load_id and d.is_current and d.is_ready
      left join public.rr_lease_mail_events e on e.document_id=d.id and e.load_id=d.load_id and e.sha256=d.sha256
    ) t
  ) stops
), assessed as (
 select e.*,case when e.factoring_status is not null then
   case when e.corrections then array['Review the correction against the existing invoice and sent packet'] else array[]::text[] end
   else array_remove(array[
     case when e.unmatched_pending then 'Confirm the broker and assigned load for this POD' end,
     case when not e.rate_verified then 'Verify the current rate confirmation' end,
     case when coalesce(e.gross_cents,0)<=0 then 'Confirm the broker gross on the rate confirmation' end,
     case when e.pending then 'Review the pending driver POD' end,
     case when not e.final_verified then 'Approve the final delivery POD' end,
     case when e.actual_delivery_date is null or e.load_status not in ('delivered','closed') then 'Confirm all delivery stops and the actual delivery date' end
   ],null)||e.stop_blockers end blockers from evidence e
)
select coalesce(jsonb_agg(jsonb_build_object('load_id',a.load_id,'load_number',a.load_number,'broker_name',a.broker_name,
  'driver_name',a.driver_name,'pickup_address',a.pickup_address,'delivery_address',a.delivery_address,
  'gross_cents',case when a.factoring_status is not null then a.recorded_amount when a.rate_verified and a.gross_cents>0 then a.gross_cents end,
  'draft_id',a.draft_id,'status',case when a.corrections then 'correction_review' when a.factoring_status is not null then 'factoring_recorded'
    when cardinality(a.blockers)>0 then 'pending_review' else 'ready' end,'blocking_reasons',to_jsonb(a.blockers),
  'notifications',coalesce(a.notifications,'[]'),'updated_at',greatest(a.draft_changed,a.load_changed,a.last_change),
  'received_at',a.received_at,'pod_count',a.pod_count,'invoice_number',a.invoice_no,
  'deliveries',jsonb_build_object('total',a.delivery_total,'covered',a.covered,'assignments',a.assignments,'missing',a.missing)) order by a.load_id),'[]') from assessed a
$$;

revoke all on function rr_lease_private.pod_enqueue(uuid,uuid,uuid,timestamptz,boolean,boolean),
  rr_lease_private.pod_committed(),public.rr_pod_mail_claim(),public.rr_pod_mail_advance(uuid,uuid,text,text),
  public.rr_lease_pod_mail_reconcile(uuid,boolean,text),public.rr_lease_pod_correction_loads(uuid),
  public.rr_lease_pod_addendum(uuid,uuid,text,text,text,text),public.rr_lease_pod_workflow_original(uuid,int),
  public.rr_lease_pod_cover_delivery(uuid,int,int,uuid,uuid),public.rr_lease_pod_invoice_drafts(uuid,int,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rr_pod_mail_claim(),public.rr_pod_mail_advance(uuid,uuid,text,text) to service_role;
grant execute on function public.rr_lease_pod_mail_reconcile(uuid,boolean,text),public.rr_lease_pod_correction_loads(uuid),
  public.rr_lease_pod_addendum(uuid,uuid,text,text,text,text),public.rr_lease_pod_workflow_original(uuid,int),
  public.rr_lease_pod_cover_delivery(uuid,int,int,uuid,uuid),public.rr_lease_pod_invoice_drafts(uuid,int,uuid) to authenticated;
commit;
