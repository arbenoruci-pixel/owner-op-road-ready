-- Phase 1 Step 2C, private email archive and owner-authorized draft execution.
-- Development only. No logbook or Phase 2 dependency.
-- Advisory lock first; avoid lock upgrade deadlock on the carrier workspace.
create or replace function rr_lease_private.step2c_lock_carrier(p_carrier uuid)
returns void language plpgsql set search_path='' as $$
begin
 if p_carrier is null then raise exception 'Carrier required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('rr-step2c-carrier:'||p_carrier::text,0));
 perform 1 from public.rr_lease_operators o where o.carrier_user_id=p_carrier and o.workspace_kind='carrier' for share;
 if not found then raise exception 'Carrier required' using errcode='42501';end if;
end $$;

-- Source identity is separate from byte identity: forwards and repeat reads
-- may point to the same original archive without duplicating its bytes.
create table rr_lease_private.step2c_mail_sources(
 carrier_user_id uuid not null references auth.users(id),
 provider text not null check(provider in ('gmail','outlook')),
 mailbox text not null,
 message_id text not null, part_id text not null,
 source_ref text not null, attachment_ref text not null,
 received_at timestamptz not null, sender text,
 file_name text not null, mime_type text,
 archive_id uuid references rr_lease_private.step2c_archives(id),
 hold_reason text, proposal jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(carrier_user_id,source_ref,attachment_ref),
 unique(carrier_user_id,provider,mailbox,message_id,part_id),
 check(archive_id is not null or hold_reason is not null)
);
create table rr_lease_private.step2c_assignment_execution(
 carrier_user_id uuid not null,source_ref text not null,attachment_ref text not null,
 request jsonb not null,result jsonb not null,executed_at timestamptz not null default clock_timestamp(),
 primary key(carrier_user_id,source_ref,attachment_ref),
 foreign key(carrier_user_id,source_ref,attachment_ref) references rr_lease_private.intake_review(carrier_user_id,source_ref,attachment_ref)
);
create table rr_lease_private.step2c_mail_windows(
 carrier_user_id uuid not null,mailbox text not null,provider text not null,
 started_at timestamptz not null,ended_at timestamptz not null,manifest jsonb not null,
 completed_at timestamptz not null default clock_timestamp(),
 primary key(carrier_user_id,mailbox,provider,started_at,ended_at)
);
alter table rr_lease_private.step2c_mail_sources enable row level security;
alter table rr_lease_private.step2c_assignment_execution enable row level security;
alter table rr_lease_private.step2c_mail_windows enable row level security;
revoke all on rr_lease_private.step2c_mail_sources,rr_lease_private.step2c_assignment_execution,rr_lease_private.step2c_mail_windows from public,anon,authenticated,service_role;
create trigger rr_step2c_mail_immutable before update or delete on rr_lease_private.step2c_mail_sources for each row execute function rr_lease_private.phase1_immutable();
create trigger rr_step2c_execution_immutable before update or delete on rr_lease_private.step2c_assignment_execution for each row execute function rr_lease_private.phase1_immutable();
create trigger rr_step2c_window_immutable before update or delete on rr_lease_private.step2c_mail_windows for each row execute function rr_lease_private.phase1_immutable();

create function rr_lease_private.step2c_check_mailbox(p_carrier uuid,p_provider text,p_mailbox text)
returns void language plpgsql set search_path='' as $$
begin
 perform rr_lease_private.step2c_lock_carrier(p_carrier);
 if p_provider is null or p_provider not in ('gmail','outlook') or p_mailbox is null or p_mailbox<>lower(btrim(p_mailbox))
 or not exists(select 1 from rr_lease_private.carrier_intake_mailboxes where carrier_user_id=p_carrier and email=p_mailbox) then
  raise exception 'Mailbox not authorized for carrier' using errcode='42501';end if;
end $$;
create function public.rr_lease_step2c_mail_cursor(p_carrier uuid,p_provider text,p_mailbox text)
returns timestamptz language plpgsql security definer set search_path='' as $$
begin
 perform rr_lease_private.step2c_check_mailbox(p_carrier,p_provider,p_mailbox);
 return (select checked_through from rr_lease_private.mailbox_cursors where carrier_user_id=p_carrier and mailbox=p_mailbox);
end $$;

create function public.rr_lease_step2c_record_mail(p_carrier uuid,p_provider text,p_mailbox text,p_message_id text,p_part_id text,
 p_received_at timestamptz,p_sender text,p_file_name text,p_mime text,p_bytes text,p_sha256 text,p_hold_reason text,p_proposal jsonb,p_signal jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sr text; ar text; a uuid; old rr_lease_private.step2c_mail_sources; t text;b text; v_reason text; v_format text;
begin
 perform rr_lease_private.step2c_check_mailbox(p_carrier,p_provider,p_mailbox);
 if p_message_id is null or length(p_message_id) not between 1 and 2048 or p_message_id ~ '[[:cntrl:]]'
 or p_part_id is null or length(p_part_id) not between 1 and 2048 or p_part_id ~ '[[:cntrl:]]'
 or p_received_at is null or not isfinite(p_received_at) or p_received_at>clock_timestamp()+interval '5 minutes'
 or p_file_name is null or length(p_file_name) not between 1 and 255 or p_file_name ~ '[[:cntrl:]/\\]' then raise exception 'Invalid mail evidence metadata' using errcode='22023';end if;
 sr:=p_provider||':'||encode(sha256(convert_to(p_mailbox||chr(31)||p_message_id,'UTF8')),'hex');
 ar:=encode(sha256(convert_to(p_part_id,'UTF8')),'hex');
 if jsonb_typeof(p_proposal) is distinct from 'object' or p_proposal->>'status' is distinct from 'DRAFT'
  or p_proposal->'requiresVerification' is distinct from 'true'::jsonb
  or p_proposal->>'source' is distinct from p_provider or p_proposal->>'sourceRef' is distinct from sr or p_proposal->>'attachmentRef' is distinct from ar
  or (p_proposal-'source'-'sourceRef'-'attachmentRef'-'kind'-'sha256'-'amountCents'-'brokerRules'-'status'-'requiresVerification')<>'{}'::jsonb
  or p_proposal->>'kind' is null or p_proposal->>'kind' not in ('ratecon','bol','pod','fuel','expense','firstline_report','amazon_report','unknown')
  or (p_proposal->>'amountCents' is not null and (p_proposal->>'amountCents' !~ '^-?[0-9]{1,12}$' or abs((p_proposal->>'amountCents')::numeric)>100000000000))
  then raise exception 'Only canonical DRAFT proposal permitted' using errcode='22023';end if;
 if p_bytes is not null then
  if p_proposal->>'sha256' is distinct from p_sha256 then raise exception 'Proposal must refer to original hash';end if;
  v_format:=case when p_part_id='@message' then 'message' else 'attachment' end;
  a:=rr_lease_private.step2c_archive(p_carrier,'email',v_format,p_bytes,p_sha256,'{}'::jsonb);
 elsif nullif(btrim(p_hold_reason),'') is null or length(p_hold_reason)>1000 or p_sha256 is not null or p_proposal->>'amountCents' is not null then raise exception 'Unavailable original requires durable review without amount';end if;
 select * into old from rr_lease_private.step2c_mail_sources where carrier_user_id=p_carrier and source_ref=sr and attachment_ref=ar;
 if found then
  if row(old.provider,old.mailbox,old.message_id,old.part_id,old.archive_id,old.received_at,old.sender,old.file_name,old.mime_type) is distinct from row(p_provider,p_mailbox,p_message_id,p_part_id,a,p_received_at,p_sender,p_file_name,p_mime) then raise exception 'Mail original replay conflicts' using errcode='23505';end if;
  -- Retain the first proposal. A model re-run cannot mutate its audit history.
  return jsonb_build_object('sourceRef',sr,'attachmentRef',ar,'replay',true,'archived',a is not null);
 end if;
 insert into rr_lease_private.step2c_mail_sources(carrier_user_id,provider,mailbox,message_id,part_id,source_ref,attachment_ref,received_at,sender,file_name,mime_type,archive_id,hold_reason,proposal)
 values(p_carrier,p_provider,p_mailbox,p_message_id,p_part_id,sr,ar,p_received_at,p_sender,p_file_name,p_mime,a,p_hold_reason,p_proposal);
 v_reason:=coalesce(nullif(btrim(p_hold_reason),''),'Original archived; independent owner assignment and evidence review required');
 insert into rr_lease_private.intake_review(carrier_user_id,source_ref,attachment_ref,reason) values(p_carrier,sr,ar,v_reason) on conflict do nothing;
 -- Booking/cancellation notices are only unverified identity signals.
 if p_signal is not null then
  if p_part_id<>'@message' or a is null or lower(coalesce(p_sender,'')) !~ '^[^@]+@(amazon\.com|amazonrelay\.com)$' or jsonb_typeof(p_signal) is distinct from 'object'
   or (p_signal-'trip'-'block')<>'{}'::jsonb then raise exception 'Untrusted Amazon signal';end if;
  t:=nullif(upper(btrim(p_signal->>'trip')),'');b:=nullif(upper(btrim(p_signal->>'block')),'');
  if t is null and b is null or coalesce(t,'X') !~ '^[A-Z0-9][A-Z0-9._:-]{0,119}$' or coalesce(b,'X') !~ '^[A-Z0-9][A-Z0-9._:-]{0,119}$' then raise exception 'Invalid Amazon signal identity';end if;
  if not exists(select 1 from public.rr_lease_amazon_import_rows z where z.carrier_user_id=p_carrier and ((t is not null and upper(z.amazon_trip_id)=t) or (t is null and b is not null and z.amazon_trip_id is null and upper(z.amazon_block_id)=b)))
    and not exists(select 1 from public.rr_lease_amazon_import_rows z where z.carrier_user_id=p_carrier and b is not null and upper(z.amazon_block_id)=b and (z.amazon_trip_id is null)<>(t is null)) then
    insert into public.rr_lease_amazon_import_rows(carrier_user_id,amazon_trip_id,amazon_block_id,source_kind,report_status,source_ref) values(p_carrier,t,b,'EMAIL_SIGNAL','UNVERIFIED',sr);
  end if;
 end if;
 return jsonb_build_object('sourceRef',sr,'attachmentRef',ar,'replay',false,'archived',a is not null);
end $$;

-- The service worker calls this only after exhaustive provider pagination.
-- A manifest must enumerate every message body and attachment in the window.
-- DB verifies all manifest items and requires a compare-and-swap cursor.
create function public.rr_lease_step2c_finish_window(p_carrier uuid,p_provider text,p_mailbox text,p_expected timestamptz,
 p_start timestamptz,p_end timestamptz,p_manifest jsonb,p_complete boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cur timestamptz; old rr_lease_private.step2c_mail_windows; item jsonb; n int;
begin
 perform rr_lease_private.step2c_check_mailbox(p_carrier,p_provider,p_mailbox);
 if p_complete is distinct from true or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
 or p_end<=p_start or p_end>clock_timestamp() or p_end-p_start>interval '31 days' or jsonb_typeof(p_manifest) is distinct from 'array' or jsonb_array_length(p_manifest)>10000
 then raise exception 'Incomplete or invalid mailbox window' using errcode='22023';end if;
 select * into old from rr_lease_private.step2c_mail_windows where carrier_user_id=p_carrier and mailbox=p_mailbox and provider=p_provider and started_at=p_start and ended_at=p_end;
 if found then
  if old.manifest is distinct from p_manifest then raise exception 'Mailbox replay manifest differs' using errcode='23505';end if;
  return jsonb_build_object('checkedThrough',p_end,'replay',true);
 end if;
 select checked_through into cur from rr_lease_private.mailbox_cursors where carrier_user_id=p_carrier and mailbox=p_mailbox for update;
 if cur is distinct from p_expected or cur is not null and (p_start>cur or p_end<=cur) then raise exception 'Mailbox cursor changed; reread and retry' using errcode='40001';end if;
 for item in select value from jsonb_array_elements(p_manifest) loop
  if not exists(select 1 from rr_lease_private.step2c_mail_sources m join rr_lease_private.intake_review r using(carrier_user_id,source_ref,attachment_ref)
   where m.carrier_user_id=p_carrier and m.provider=p_provider and m.mailbox=p_mailbox and m.source_ref=item->>'sourceRef' and m.attachment_ref=item->>'attachmentRef'
   and m.received_at>=p_start and m.received_at<p_end and (m.archive_id is not null or m.hold_reason is not null)) then raise exception 'Mailbox manifest item not durably archived or held';end if;
 end loop;
 select count(*) into n from (select distinct x->>'sourceRef',x->>'attachmentRef' from jsonb_array_elements(p_manifest) x) q;
 if n<>jsonb_array_length(p_manifest) then raise exception 'Duplicate manifest references';end if;
 -- Detect an omitted previously recorded item in this exact window as well.
 if exists(select 1 from rr_lease_private.step2c_mail_sources m where m.carrier_user_id=p_carrier and m.provider=p_provider and m.mailbox=p_mailbox and m.received_at>=p_start and m.received_at<p_end
  and not exists(select 1 from jsonb_array_elements(p_manifest) x where x->>'sourceRef'=m.source_ref and x->>'attachmentRef'=m.attachment_ref)) then raise exception 'Mailbox manifest omitted recorded item';end if;
 insert into rr_lease_private.step2c_mail_windows(carrier_user_id,mailbox,provider,started_at,ended_at,manifest) values(p_carrier,p_mailbox,p_provider,p_start,p_end,p_manifest);
 insert into rr_lease_private.mailbox_cursors(carrier_user_id,mailbox,checked_through) values(p_carrier,p_mailbox,p_end)
 on conflict(carrier_user_id,mailbox) do update set checked_through=excluded.checked_through;
 return jsonb_build_object('checkedThrough',p_end,'replay',false,'items',n);
end $$;
revoke all on function rr_lease_private.step2c_check_mailbox(uuid,text,text),public.rr_lease_step2c_mail_cursor(uuid,text,text),public.rr_lease_step2c_record_mail(uuid,text,text,text,text,timestamptz,text,text,text,text,text,text,jsonb,jsonb),public.rr_lease_step2c_finish_window(uuid,text,text,timestamptz,timestamptz,timestamptz,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_step2c_mail_cursor(uuid,text,text),public.rr_lease_step2c_record_mail(uuid,text,text,text,text,timestamptz,text,text,text,text,text,text,jsonb,jsonb),public.rr_lease_step2c_finish_window(uuid,text,text,timestamptz,timestamptz,timestamptz,jsonb,boolean) to service_role;

-- Existing legacy adjustments are confirmed historical entries. New imported
-- adjustments explicitly carry DRAFT, with a DB guard against accidental posting.
alter table public.rr_lease_adjustments add column intake_status text not null default 'POSTED' check(intake_status in ('DRAFT','POSTED'));
create function rr_lease_private.step2c_adjustment_draft_guard()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and new.intake_status is distinct from old.intake_status then raise exception 'Separate verified expense approval required';end if;
 if tg_op='INSERT' and new.intake_status='DRAFT' and new.wallet_document_id is null then raise exception 'Draft adjustment requires archived wallet original';end if;
 return new;
end $$;
create trigger rr_step2c_adjustment_draft_guard before insert or update on public.rr_lease_adjustments for each row execute function rr_lease_private.step2c_adjustment_draft_guard();
create function rr_lease_private.step2c_draft_ledger_guard()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.source_kind='LEGACY_ADJUSTMENT' and new.status='POSTED' and exists(select 1 from public.rr_lease_adjustments a where a.id=new.source_id and a.intake_status='DRAFT') then
  raise exception 'Imported expense awaits independent verified approval';end if;
 return new;
end $$;
create trigger rr_step2c_draft_ledger_guard before insert or update on public.rr_lease_ledger_entries for each row execute function rr_lease_private.step2c_draft_ledger_guard();
revoke all on function rr_lease_private.step2c_adjustment_draft_guard(),rr_lease_private.step2c_draft_ledger_guard() from public,anon,authenticated,service_role;

-- Include normalized fuel/expense references in the existing cross-operator
-- reservation table. Mudflap remains compatible with the legacy reference.
create or replace function rr_lease_private.reserve_shared_fuel_reference() returns trigger
language plpgsql security definer set search_path='' as $$
declare ref text;
begin
 if tg_op<>'INSERT' then delete from rr_lease_private.shared_fuel_references where ledger=tg_table_name and entry_id=old.id;end if;
 if tg_op='DELETE' then return old;end if;
 ref:=lower(btrim(new.evidence_reference));
 if ref like 'mudflap:%' or ref like 'fuel:%' or ref like 'expense:%' then
  if ref !~ '^(mudflap|fuel|expense):[a-z0-9][a-z0-9._:-]*$' or new.kind not in ('fuel','credit','other') then raise exception 'Stable provider transaction reference required';end if;
  if new.wallet_document_id is null then raise exception 'Receipt original required';end if;
  if (ref like 'mudflap:%' or ref like 'fuel:%') and new.kind not in ('fuel','credit') then raise exception 'Fuel reference requires fuel or credit';end if;
  insert into rr_lease_private.shared_fuel_references(carrier_user_id,reference,ledger,entry_id)
   select carrier_user_id,ref,tg_table_name,new.id from public.rr_lease_operators where id=new.operator_id;
 end if;return new;
end $$;

alter table rr_lease_private.step2b_assignment_drafts drop constraint step2b_assignment_drafts_kind_check;
alter table rr_lease_private.step2b_assignment_drafts add constraint step2b_assignment_drafts_kind_check check(kind in ('fuel','expense','ratecon','pod','bol','supporting','unknown'));

-- This owner-scoped wrapper executes an assignment and files original bytes in
-- one transaction. No amount is guessed from an AI proposal or a card number.
create function public.rr_lease_step2c_assign_execute(p_source_ref text,p_attachment_ref text,p_operator_id uuid,p_load_id uuid,
 p_kind text,p_reason text,p_accessorials jsonb,p_broker text,p_load_number text,
 p_settlement_id uuid,p_amount_cents bigint,p_paid_by text,p_transaction_ref text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r rr_lease_private.intake_review; src rr_lease_private.step2c_mail_sources; a rr_lease_private.step2c_archives;
 o public.rr_lease_operators; l public.rr_lease_loads; st public.rr_lease_settlements; doc public.rr_lease_documents;
 ex rr_lease_private.step2c_assignment_execution; d uuid; w uuid; adj uuid; part int; v_load uuid;
 req jsonb; res jsonb; v_mime text; v_category text; v_ref text; v_kind text; v_amount bigint;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 if p_kind is null or p_kind not in ('fuel','expense','ratecon','pod','bol','supporting') or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Classified assignment and reason required' using errcode='22023';end if;
 req:=jsonb_build_object('operator',p_operator_id,'load',p_load_id,'kind',p_kind,'reason',btrim(p_reason),'accessorials',p_accessorials,'broker',p_broker,'loadNumber',p_load_number,'settlement',p_settlement_id,'amount',p_amount_cents,'paidBy',p_paid_by,'transaction',p_transaction_ref);
 select * into r from rr_lease_private.intake_review where carrier_user_id=actor and source_ref=p_source_ref and attachment_ref=p_attachment_ref for update;
 if not found then raise exception 'Intake unavailable' using errcode='42501';end if;
 select * into ex from rr_lease_private.step2c_assignment_execution where carrier_user_id=actor and source_ref=r.source_ref and attachment_ref=r.attachment_ref;
 if found then
  if ex.request is distinct from req then raise exception 'Assignment already executed; separate correction review required' using errcode='23505';end if;
  return ex.result;
 end if;
 if r.resolved_at is not null then raise exception 'Intake already resolved' using errcode='23505';end if;
 select * into o from public.rr_lease_operators where id=p_operator_id and carrier_user_id=actor for share;
 if not found then raise exception 'Assignment unavailable' using errcode='42501';end if;
 v_load:=p_load_id;
 if p_kind='ratecon' and v_load is null then
  v_load:=public.rr_lease_step2b_stage_ratecon(o.id,p_broker,p_load_number,p_accessorials);
 elsif p_broker is not null or p_load_number is not null then raise exception 'Broker/load creation only for unassigned ratecon' using errcode='22023';end if;
 if p_kind in ('ratecon','pod','bol','supporting') then
  if p_settlement_id is not null or p_amount_cents is not null or p_paid_by is not null or p_transaction_ref is not null then raise exception 'Load filing cannot book a financial adjustment';end if;
  if starts_with(r.source_ref,'driver_upload:') and p_kind='pod' then
   select d0.* into doc from public.rr_lease_documents d0 join public.rr_lease_mail_events e on e.document_id=d0.id join public.rr_lease_loads z on z.id=d0.load_id
    where 'driver_upload:'||d0.id::text=r.source_ref and d0.sha256=r.attachment_ref and e.carrier_user_id=actor and z.operator_id=o.id and e.source_kind='driver_upload' and d0.is_ready and d0.operator_visible;
   if not found or v_load is not null and v_load<>doc.load_id then raise exception 'Orphan original unavailable' using errcode='42501';end if;
   v_load:=doc.load_id;d:=doc.id;
  end if;
  if v_load is null then raise exception 'Select exact load for document' using errcode='22023';end if;
  select * into l from public.rr_lease_loads where id=v_load and operator_id=o.id for update;
  if not found then raise exception 'Assignment unavailable' using errcode='42501';end if;
  if l.status in ('closed','cancelled') or exists(select 1 from public.rr_lease_factoring where load_id=l.id) or exists(select 1 from public.rr_lease_settlements where id=l.settlement_id and status<>'draft') then raise exception 'Locked load; separate review required';end if;
  if p_kind='ratecon' then perform rr_lease_private.step2b_prepare_itemized(l.id,p_accessorials);
  elsif p_accessorials is not null then raise exception 'Accessorial classification only for ratecon';end if;
 else
  if v_load is not null or p_accessorials is not null then raise exception 'Expense assignment is settlement-scoped';end if;
  if o.workspace_kind<>'leased' then raise exception 'Carrier own expense workflow requires separate review';end if;
  if p_settlement_id is null or p_amount_cents is null or p_amount_cents not between 1 and 100000000000 or p_paid_by is null or p_paid_by not in ('carrier','operator') then raise exception 'Select draft settlement, exact positive cents and actual payer' using errcode='22023';end if;
  select * into st from public.rr_lease_settlements where id=p_settlement_id and operator_id=o.id and status='draft' for update;
  if not found then raise exception 'Draft settlement unavailable' using errcode='42501';end if;
  v_ref:=lower(btrim(p_transaction_ref));
  if v_ref is null or length(v_ref)>200 or v_ref !~ '^(mudflap|fuel|expense):[a-z0-9][a-z0-9._:-]*$'
   or p_kind='fuel' and v_ref like 'expense:%' or p_kind='expense' and v_ref not like 'expense:%' then raise exception 'Exact provider transaction reference required' using errcode='22023';end if;
 end if;
 if d is null then
  select * into src from rr_lease_private.step2c_mail_sources where carrier_user_id=actor and source_ref=r.source_ref and attachment_ref=r.attachment_ref;
  if not found or src.archive_id is null or src.part_id='@message' then raise exception 'Retrieve the exact original attachment before filing' using errcode='22023';end if;
  select * into strict a from rr_lease_private.step2c_archives where id=src.archive_id and carrier_user_id=actor and kind='email';
  v_mime:=src.mime_type;
  if not rr_lease_private.step2b_magic(a.original,v_mime) then raise exception 'Unsupported document signature; leave in review' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||a.sha256,0));
  if p_kind in ('ratecon','pod','bol','supporting') then
   if exists(select 1 from public.rr_lease_documents z join public.rr_lease_loads q on q.id=z.load_id join public.rr_lease_operators op on op.id=q.operator_id where op.carrier_user_id=actor and z.sha256=a.sha256 and (z.load_id<>l.id or z.kind<>p_kind)) then raise exception 'Original already belongs to another load or document kind' using errcode='23505';end if;
   select * into doc from public.rr_lease_documents where load_id=l.id and kind=p_kind and sha256=a.sha256;
   if found then d:=doc.id;
   else
    d:=gen_random_uuid();
    insert into public.rr_lease_documents(id,load_id,kind,file_name,mime_type,byte_size,sha256,storage_backend,storage_path)
    values(d,l.id,p_kind,src.file_name,v_mime,octet_length(a.original),a.sha256,'database',o.id::text||'/'||l.id::text||'/'||d::text);
    for part in 0..((octet_length(a.original)-1)/49152) loop perform public.rr_lease_put_chunk(d,part,encode(substring(a.original from part*49152+1 for 49152),'base64'));end loop;
    perform public.rr_lease_finish_original(d);
   end if;
   if not public.rr_lease_original_ready(d) then raise exception 'Original incomplete';end if;
   update public.rr_lease_documents set operator_visible=true where id=d and not operator_visible;
   -- Deliberately no verified_for_billing event, current rate replacement,
   -- gross or settlement. Later independent verification uses apply_intake.
  else
   if exists(select 1 from public.rr_lease_wallet_documents z join public.rr_lease_operators op on op.id=z.operator_id where op.carrier_user_id=actor and z.sha256=a.sha256 and (z.operator_id<>o.id or z.slot_key<>'receipt:'||a.sha256)) then raise exception 'Receipt original already filed; review duplicate' using errcode='23505';end if;
   v_category:=case when p_kind='fuel' then 'fuel_receipt' else 'expense_receipt' end;
   w:=public.rr_lease_wallet_begin(o.id,'receipt:'||a.sha256,v_category,case when p_kind='fuel' then 'Fuel receipt' else 'Expense receipt' end,src.file_name,v_mime,octet_length(a.original),a.sha256,actor::text||':'||r.source_ref||':'||r.attachment_ref,btrim(p_reason));
   for part in 0..((octet_length(a.original)-1)/49152) loop perform public.rr_lease_wallet_put_chunk(w,part,encode(substring(a.original from part*49152+1 for 49152),'base64'));end loop;
   perform public.rr_lease_wallet_finish(w);
   v_kind:=case when p_kind='fuel' then 'fuel' else 'other' end;
   v_amount:=case when p_paid_by='carrier' then -p_amount_cents else p_amount_cents end;
   select a0.id into adj from public.rr_lease_adjustments a0 where a0.operator_id=o.id and a0.kind=v_kind and a0.evidence_reference=v_ref and a0.settlement_id=st.id and a0.wallet_document_id=w and a0.amount_cents=v_amount and a0.paid_by=p_paid_by and a0.intake_status='DRAFT';
   if adj is null then
    if exists(select 1 from rr_lease_private.shared_fuel_references where carrier_user_id=actor and reference=v_ref)
     or exists(select 1 from public.rr_lease_adjustments z where z.wallet_document_id=w) then raise exception 'Transaction or receipt already assigned; review duplicate' using errcode='23505';end if;
    insert into public.rr_lease_adjustments(settlement_id,operator_id,kind,paid_by,amount_cents,description,evidence_reference,wallet_document_id,intake_status)
    values(st.id,o.id,v_kind,p_paid_by,v_amount,case when p_kind='fuel' then 'Fuel receipt - pending verification' else 'Expense receipt - pending verification' end,v_ref,w,'DRAFT') returning id into adj;
   end if;
  end if;
 end if;
 -- Record the actual target of the assignment, including automatically staged
 -- load ID. The old assignment endpoint is superseded (cannot bypass filing).
 insert into rr_lease_private.step2b_assignment_drafts(carrier_user_id,source_ref,attachment_ref,operator_id,load_id,reason,kind,accessorials)
 values(actor,r.source_ref,r.attachment_ref,o.id,v_load,btrim(p_reason),p_kind,p_accessorials)
 on conflict(carrier_user_id,source_ref,attachment_ref) do nothing;
 if not exists(select 1 from rr_lease_private.step2b_assignment_drafts z where z.carrier_user_id=actor and z.source_ref=r.source_ref and z.attachment_ref=r.attachment_ref and z.operator_id=o.id and z.load_id is not distinct from v_load and z.kind=p_kind and z.reason=btrim(p_reason) and z.accessorials is not distinct from p_accessorials) then raise exception 'Existing assignment proposal conflicts';end if;
 update rr_lease_private.intake_review set resolved_at=clock_timestamp(),load_document_id=d,wallet_document_id=w where carrier_user_id=actor and source_ref=r.source_ref and attachment_ref=r.attachment_ref;
 res:=jsonb_build_object('status','FILED_DRAFT','operatorId',o.id,'loadId',v_load,'documentId',d,'walletDocumentId',w,'adjustmentId',adj,'resolved',true,'postAllowed',false);
 insert into rr_lease_private.step2c_assignment_execution(carrier_user_id,source_ref,attachment_ref,request,result) values(actor,r.source_ref,r.attachment_ref,req,res);
 return res;
end $$;
revoke all on function public.rr_lease_step2c_assign_execute(text,text,uuid,uuid,text,text,jsonb,text,text,uuid,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_step2c_assign_execute(text,text,uuid,uuid,text,text,jsonb,text,text,uuid,bigint,text,text) to authenticated;
-- The Step 2B draft RPC is retained for backwards compatibility and regression
-- tests; it cannot resolve intake, file bytes, or post a financial amount.

create or replace function rr_lease_private.phase1_sync_adjustment(p_id uuid) returns void
language plpgsql set search_path='' as $$
declare a public.rr_lease_adjustments;
begin
 select * into strict a from public.rr_lease_adjustments where id=p_id;
 insert into public.rr_lease_ledger_entries(operator_id,settlement_id,source_kind,source_id,entry_type,amount_cents,fee_bps,paid_by,status,description,source_wallet_document_id,source_reference,idempotency_key)
 values(a.operator_id,a.settlement_id,'LEGACY_ADJUSTMENT',a.id,upper(a.kind),a.amount_cents,0,a.paid_by,a.intake_status,a.description,a.wallet_document_id,a.evidence_reference,'adjustment:'||a.id::text)
 on conflict(operator_id,idempotency_key) do update set
 entry_type=excluded.entry_type,amount_cents=excluded.amount_cents,paid_by=excluded.paid_by,status=case when rr_lease_ledger_entries.status='HELD' then 'HELD' else excluded.status end,description=excluded.description,source_wallet_document_id=excluded.source_wallet_document_id,source_reference=excluded.source_reference
 where row(rr_lease_ledger_entries.entry_type,rr_lease_ledger_entries.amount_cents,rr_lease_ledger_entries.paid_by,rr_lease_ledger_entries.description,rr_lease_ledger_entries.source_wallet_document_id,rr_lease_ledger_entries.source_reference)
 is distinct from row(excluded.entry_type,excluded.amount_cents,excluded.paid_by,excluded.description,excluded.source_wallet_document_id,excluded.source_reference)
 or rr_lease_ledger_entries.status='VOID';
end $$;

create or replace function public.rr_lease_step2b_owner_inbox(p_limit integer default 50,p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null or not exists(select 1 from public.rr_lease_operators o where o.carrier_user_id=v_actor and o.workspace_kind='carrier') then raise exception 'Carrier access required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid page limit' using errcode='22023'; end if;
 return jsonb_build_object(
 'intake',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.source_ref,r.attachment_ref,r.reason,r.created_at,m.proposal,m.file_name,m.mime_type,m.archive_id is not null as original_archived,m.hold_reason,a.operator_id,a.load_id,a.kind,a.accessorials,a.reason as assignment_reason,case when a.operator_id is not null then 'MATCHED_DRAFT' else 'NEEDS_OWNER_REVIEW' end as status
 from rr_lease_private.intake_review r left join rr_lease_private.step2b_assignment_drafts a using(carrier_user_id,source_ref,attachment_ref)
 left join rr_lease_private.step2c_mail_sources m using(carrier_user_id,source_ref,attachment_ref)
 where r.carrier_user_id=v_actor and r.resolved_at is null and (p_before is null or r.created_at<p_before)
 order by r.created_at desc,r.source_ref,r.attachment_ref limit p_limit) x),'[]'::jsonb),
 'pods',coalesce((select jsonb_agg(to_jsonb(x)) from (select e.document_id,e.load_id,l.operator_id,l.broker_name,l.load_number,l.final_pod_id,d.file_name,d.mime_type,d.byte_size,e.upload_received_at,e.sha256,l.gross_cents is null as no_gross
 from public.rr_lease_mail_events e join public.rr_lease_documents d on d.id=e.document_id join public.rr_lease_loads l on l.id=e.load_id
 where e.carrier_user_id=v_actor and e.source_kind='driver_upload' and e.rejected_at is null and not exists(select 1 from rr_lease_private.step2b_pod_decisions z where z.document_id=e.document_id)
 and (p_before is null or e.upload_received_at<p_before) order by e.upload_received_at desc,e.id limit p_limit) x),'[]'::jsonb),
 'amazon',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.id,a.amazon_trip_id,a.amazon_block_id,a.amazon_load_id,a.report_status,a.amount_cents,a.event_date,a.created_at
 from public.rr_lease_amazon_import_rows a where a.carrier_user_id=v_actor and a.operator_id is null and (p_before is null or a.created_at<p_before) order by a.created_at desc,a.id limit p_limit) x),'[]'::jsonb));
end $$;
