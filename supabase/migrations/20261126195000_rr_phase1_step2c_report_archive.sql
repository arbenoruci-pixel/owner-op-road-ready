-- Phase 1 Step 2C, report evidence ingestion. Development only.
-- These tables store original bytes, normalized report rows, and unresolved conflicts.
-- No report RPC allocates a settlement, verifies a payout, or writes a ledger.
create table rr_lease_private.step2c_archives(
 id uuid primary key default gen_random_uuid(),
 carrier_user_id uuid not null references auth.users(id),
 kind text not null check(kind in ('amazon','firstline','email')),
 format text not null check(format in ('csv','xlsx','attachment','message')),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 original bytea not null check(octet_length(original) between 1 and 3145728),
 parsed jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default clock_timestamp(),
 unique(carrier_user_id,kind,format,sha256),
 check(encode(sha256(original),'hex')=sha256)
);
create table rr_lease_private.step2c_report_observations(
 archive_id uuid not null references rr_lease_private.step2c_archives(id),
 canonical_key text not null,
 payload jsonb not null,
 result_kind text not null check(result_kind in ('INSERTED','DUPLICATE','UPGRADED_SIGNAL','NEEDS_REVIEW')),
 row_id uuid,
 reason text,
 primary key(archive_id,canonical_key)
);
alter table rr_lease_private.step2c_archives enable row level security;
alter table rr_lease_private.step2c_report_observations enable row level security;
revoke all on rr_lease_private.step2c_archives,rr_lease_private.step2c_report_observations from public,anon,authenticated,service_role;
create trigger rr_step2c_archive_immutable before update or delete on rr_lease_private.step2c_archives for each row execute function rr_lease_private.phase1_immutable();
create trigger rr_step2c_observation_immutable before update or delete on rr_lease_private.step2c_report_observations for each row execute function rr_lease_private.phase1_immutable();

-- Actual Relay payment exports also contain standalone Load ID (no Trip/Block).
-- Preserve its identity explicitly; never invent a trip identifier.
alter table public.rr_lease_amazon_import_rows add column amazon_load_id text;
alter table public.rr_lease_amazon_import_rows drop constraint rr_lease_amazon_import_rows_check;
alter table public.rr_lease_amazon_import_rows add constraint rr_step2c_amazon_identity check(
 (amazon_trip_id is not null or amazon_block_id is not null) and amazon_load_id is null
 or (amazon_trip_id is null and amazon_block_id is null and amazon_load_id ~ '^[A-Z0-9][A-Z0-9._:-]{0,119}$'));
-- Standalone IDs remain unallocated until their verified load identity is implemented.
alter table public.rr_lease_amazon_import_rows add constraint rr_step2c_standalone_hold check(
 amazon_load_id is null or (load_id is null and verified_at is null and verified_by is null));
create unique index rr_step2c_amazon_standalone on public.rr_lease_amazon_import_rows(carrier_user_id,amazon_load_id) where amazon_load_id is not null;
create or replace view public.v_owner_amazon_assignment_inbox with(security_invoker=true) as
 select id,amazon_trip_id,amazon_block_id,source_kind,report_status,amount_cents,event_date,created_at,amazon_load_id
 from public.rr_lease_amazon_import_rows where operator_id is null;

-- Every FirstLine event is private, even if the invoice is not recognized yet.
-- Existing matched event history remains untouched.
alter table public.rr_lease_factoring_events add column carrier_user_id uuid references auth.users(id),
 add column invoice_reference text, add column reverses_external_reference text;
update public.rr_lease_factoring_events e set carrier_user_id=o.carrier_user_id from public.rr_lease_operators o where o.id=e.operator_id;
alter table public.rr_lease_factoring_events alter column carrier_user_id set not null,
 alter column operator_id drop not null, alter column load_id drop not null;
alter table public.rr_lease_factoring_events add constraint rr_step2c_factoring_unassigned check(
 (operator_id is null and load_id is null and review_status='PENDING_PROOF') or (operator_id is not null and load_id is not null));
create unique index rr_step2c_factoring_canonical on public.rr_lease_factoring_events(carrier_user_id,upper(btrim(external_reference)),event_type);
-- Adapt the original channel trigger only on the private events table, never on
-- a factoring claim. A known event must still match the assigned carrier/load.
drop trigger rr_phase1_factor_event_channel on public.rr_lease_factoring_events;
create function rr_lease_private.step2c_factor_event_guard()
returns trigger language plpgsql set search_path='' as $$
declare owner_id uuid;
begin
 if new.operator_id is not null then
  select o.carrier_user_id into strict owner_id from public.rr_lease_operators o join public.rr_lease_loads l on l.operator_id=o.id
  where o.id=new.operator_id and l.id=new.load_id and l.billing_channel='FIRSTLINE_FACTORED';
  if new.carrier_user_id is distinct from owner_id then raise exception 'FirstLine carrier mismatch';end if;
 elsif new.load_id is not null or new.review_status<>'PENDING_PROOF' then raise exception 'Unassigned factoring event must remain pending';end if;
 if tg_op='UPDATE' and row(new.carrier_user_id,new.event_type,new.amount_cents,new.event_at,new.external_reference,new.evidence_reference,new.invoice_reference,new.reverses_external_reference)
  is distinct from row(old.carrier_user_id,old.event_type,old.amount_cents,old.event_at,old.external_reference,old.evidence_reference,old.invoice_reference,old.reverses_external_reference)
  then raise exception 'FirstLine imported event evidence is immutable';end if;
 if new.reverses_id is not null and not exists(select 1 from public.rr_lease_factoring_events x where x.id=new.reverses_id and x.carrier_user_id=new.carrier_user_id and x.id<>new.id and x.event_type<>'REVERSAL'
  and x.invoice_reference is not distinct from new.invoice_reference and x.operator_id is not distinct from new.operator_id and x.load_id is not distinct from new.load_id
  and x.amount_cents=-new.amount_cents and new.event_type='REVERSAL') then raise exception 'Reversal must match original event and opposite amount';end if;
 return new;
end $$;
create trigger rr_step2c_factoring_event_guard before insert or update on public.rr_lease_factoring_events for each row execute function rr_lease_private.step2c_factor_event_guard();
create unique index rr_step2c_one_factoring_reversal on public.rr_lease_factoring_events(reverses_id) where reverses_id is not null;
revoke all on function rr_lease_private.step2c_factor_event_guard() from public,anon,authenticated,service_role;
revoke delete,truncate on public.rr_lease_factoring_events from service_role;
-- Backward-compatible default for trusted legacy writers that supplied only
-- operator_id/load_id. The guard still verifies carrier and channel.
create function rr_lease_private.step2c_factoring_owner_default() returns trigger language plpgsql set search_path='' as $$
begin
 if new.carrier_user_id is null and new.operator_id is not null then
  select carrier_user_id into new.carrier_user_id from public.rr_lease_operators where id=new.operator_id;
 end if;return new;
end $$;
create trigger rr_step2c_a_factoring_owner before insert on public.rr_lease_factoring_events for each row execute function rr_lease_private.step2c_factoring_owner_default();
revoke all on function rr_lease_private.step2c_factoring_owner_default() from public,anon,authenticated,service_role;

-- Owner identity is supplied by the server AFTER getUser(token); this service
-- RPC locks the actual carrier workspace in the same transaction as writes.
create function rr_lease_private.step2c_lock_carrier(p_carrier uuid)
returns void language plpgsql set search_path='' as $$
begin
 if p_carrier is null then raise exception 'Carrier required' using errcode='42501';end if;
 perform 1 from public.rr_lease_operators o where o.carrier_user_id=p_carrier and o.workspace_kind='carrier' for share;
 if not found then raise exception 'Carrier required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('rr-step2c-carrier:'||p_carrier::text,0));
end $$;
create function rr_lease_private.step2c_archive(p_carrier uuid,p_kind text,p_format text,p_bytes text,p_sha256 text,p_parsed jsonb)
returns uuid language plpgsql set search_path='' as $$
declare b bytea; a uuid; old rr_lease_private.step2c_archives;
begin
 if p_bytes is null or length(p_bytes)>4194304 or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_parsed is null then raise exception 'Invalid archive payload' using errcode='22023';end if;
 b:=decode(p_bytes,'base64');
 if octet_length(b) not between 1 and 3145728 or encode(sha256(b),'hex')<>p_sha256 then raise exception 'Archive checksum mismatch' using errcode='22023';end if;
 insert into rr_lease_private.step2c_archives(carrier_user_id,kind,format,sha256,original,parsed)
 values(p_carrier,p_kind,p_format,p_sha256,b,p_parsed)
 on conflict(carrier_user_id,kind,format,sha256) do nothing returning id into a;
 if a is null then
  select * into strict old from rr_lease_private.step2c_archives where carrier_user_id=p_carrier and kind=p_kind and format=p_format and sha256=p_sha256;
  if old.original<>b or old.parsed is distinct from p_parsed then raise exception 'Original replay has different interpretation; separate review required' using errcode='23505';end if;
  a:=old.id;
 end if;
 return a;
end $$;
revoke all on function rr_lease_private.step2c_lock_carrier(uuid),rr_lease_private.step2c_archive(uuid,text,text,text,text,jsonb) from public,anon,authenticated,service_role;

create function public.rr_lease_step2c_import_report(p_carrier uuid,p_kind text,p_format text,p_bytes text,p_sha256 text,p_rows jsonb,p_summary jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid; r jsonb; t text; b text; solo text; k text; state text; cents bigint; dt date; reason text; result text; row_id uuid;
 old public.rr_lease_amazon_import_rows; event public.rr_lease_factoring_events; original public.rr_lease_factoring_events;
 ref text; inv text; rev text; typ text; at_time timestamptz; target uuid; operator uuid; old_count int; matched int;
begin
 perform rr_lease_private.step2c_lock_carrier(p_carrier);
 if p_kind is null or p_kind not in ('amazon','firstline') or p_format is null or p_format not in ('csv','xlsx') or (p_kind='firstline' and p_format<>'csv')
 or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 or jsonb_typeof(p_summary) is distinct from 'object' then raise exception 'Invalid report schema' using errcode='22023';end if;
 a:=rr_lease_private.step2c_archive(p_carrier,p_kind,p_format,p_bytes,p_sha256,jsonb_build_object('rows',p_rows,'summary',p_summary));
 select count(*) into old_count from rr_lease_private.step2c_report_observations where archive_id=a;
 if old_count=0 then
  for r in select value from jsonb_array_elements(p_rows) loop
   reason:=null;row_id:=null;result:='INSERTED';
   if p_kind='amazon' then
    t:=nullif(upper(btrim(r->>'trip')),'');b:=nullif(upper(btrim(r->>'block')),'');solo:=nullif(upper(btrim(r->>'load')),'');
    if (t is null and b is null and solo is null) or solo is not null and (t is not null or b is not null)
    or coalesce(t,'X') !~ '^[A-Z0-9][A-Z0-9._:-]{0,119}$' or coalesce(b,'X') !~ '^[A-Z0-9][A-Z0-9._:-]{0,119}$' or coalesce(solo,'X') !~ '^[A-Z0-9][A-Z0-9._:-]{0,119}$' then raise exception 'Invalid Amazon canonical identity' using errcode='22023';end if;
    k:=case when t is not null then 'TRIP:'||t when b is not null then 'BLOCK:'||b else 'LOAD:'||solo end;
    if (r->>'amount_cents') is null or (r->>'amount_cents') !~ '^-?[0-9]{1,12}$' then raise exception 'Exact integer cents required' using errcode='22023';end if;
    cents:=(r->>'amount_cents')::bigint;dt:=(r->>'event_date')::date;state:=r->>'status';
    if state is null or state not in ('COMPLETED','PAID','TONU','OTHER') or dt is null or not isfinite(dt) or abs(cents::numeric)>100000000000 then raise exception 'Invalid Amazon report row' using errcode='22023';end if;
    reason:=nullif(btrim(r->>'review_reason'),'');
    if cents<0 or state='OTHER' then reason:=coalesce(reason,'Unsupported or negative report row');end if;
    -- Serialize with all Step 2C reports and preserve Phase 1 guard. Block
    -- aggregate vs child trip is quarantined even before verification.
    if b is not null and (exists(select 1 from public.rr_lease_amazon_import_rows z where z.carrier_user_id=p_carrier and upper(z.amazon_block_id)=b and z.source_kind='RELAY_CSV' and (z.amazon_trip_id is null)<>(t is null))
      or exists(select 1 from jsonb_array_elements(p_rows) x where upper(x->>'block')=b and (nullif(x->>'trip','') is null)<>(t is null))) then reason:='Block and child trip overlap';end if;
    select * into old from public.rr_lease_amazon_import_rows z where z.carrier_user_id=p_carrier and
     ((t is not null and upper(z.amazon_trip_id)=t) or (t is null and b is not null and z.amazon_trip_id is null and upper(z.amazon_block_id)=b) or (solo is not null and z.amazon_load_id=solo)) for update;
    if reason is not null then result:='NEEDS_REVIEW';row_id:=old.id;
    elsif not found then
     insert into public.rr_lease_amazon_import_rows(carrier_user_id,amazon_trip_id,amazon_block_id,amazon_load_id,source_kind,report_status,amount_cents,event_date,source_ref,csv_sha256)
     values(p_carrier,t,b,solo,'RELAY_CSV',state,cents,dt,'report:'||a::text||':'||k,p_sha256) returning id into row_id;
    elsif old.source_kind='EMAIL_SIGNAL' and old.verified_at is null and old.load_id is null and old.operator_id is null
      and (old.amazon_block_id is null or old.amazon_block_id is not distinct from b) then
     update public.rr_lease_amazon_import_rows set source_kind='RELAY_CSV',amazon_block_id=b,report_status=state,amount_cents=cents,event_date=dt,source_ref='report:'||a::text||':'||k,csv_sha256=p_sha256 where id=old.id returning id into row_id;result:='UPGRADED_SIGNAL';
    elsif old.source_kind='RELAY_CSV' and row(old.amazon_block_id,old.amount_cents,old.event_date) is not distinct from row(b,cents,dt)
     and (old.report_status=state or old.report_status in ('COMPLETED','PAID') and state in ('COMPLETED','PAID')) then row_id:=old.id;result:='DUPLICATE';
    else row_id:=old.id;result:='NEEDS_REVIEW';reason:='Existing canonical payout differs; immutable source retained';end if;
   else
    typ:=r->>'type';ref:=upper(btrim(r->>'reference'));inv:=upper(btrim(r->>'invoice'));rev:=nullif(upper(btrim(r->>'reverses')),'');
    if typ is null or typ not in ('INVOICE','FUNDING','FEE','DEBIT','CREDIT','REJECTION','REVERSAL') or ref is null or inv is null or ref !~ '^[A-Z0-9][A-Z0-9._:-]{0,119}$' or inv !~ '^[A-Z0-9][A-Z0-9._:-]{0,119}$'
     or (typ='REVERSAL')<>(rev is not null) or rev=ref or coalesce(rev,'X') !~ '^[A-Z0-9][A-Z0-9._:-]{0,119}$' then raise exception 'Invalid FirstLine event identity' using errcode='22023';end if;
    if (r->>'amount_cents') is null or (r->>'amount_cents') !~ '^-?[0-9]{1,12}$' then raise exception 'Exact FirstLine cents required' using errcode='22023';end if;
    cents:=(r->>'amount_cents')::bigint;at_time:=(r->>'event_at')::timestamptz;if at_time is null or not isfinite(at_time) or abs(cents::numeric)>100000000000 then raise exception 'Invalid FirstLine event' using errcode='22023';end if;
    k:=typ||':'||ref;
    select * into event from public.rr_lease_factoring_events z where z.carrier_user_id=p_carrier and upper(btrim(z.external_reference))=ref and z.event_type=typ for update;
    if found then
     row_id:=event.id;
     if row(event.invoice_reference,event.amount_cents,event.event_at,event.reverses_external_reference) is not distinct from row(inv,cents,at_time,rev) then result:='DUPLICATE';else result:='NEEDS_REVIEW';reason:='Existing FirstLine event differs';end if;
    else
     target:=null;operator:=null;
     select count(*) into matched from public.rr_lease_factoring f join public.rr_lease_loads l on l.id=f.load_id join public.rr_lease_operators o on o.id=l.operator_id
     where o.carrier_user_id=p_carrier and upper(btrim(f.invoice_no))=inv and l.billing_channel='FIRSTLINE_FACTORED';
     if matched=1 then
      select l.id,l.operator_id into target,operator from public.rr_lease_factoring f join public.rr_lease_loads l on l.id=f.load_id join public.rr_lease_operators o on o.id=l.operator_id where o.carrier_user_id=p_carrier and upper(btrim(f.invoice_no))=inv and l.billing_channel='FIRSTLINE_FACTORED';
     end if;
     insert into public.rr_lease_factoring_events(carrier_user_id,operator_id,load_id,event_type,amount_cents,event_at,external_reference,evidence_reference,review_status,invoice_reference,reverses_external_reference)
      values(p_carrier,operator,target,typ,cents,at_time,ref,'report:'||a::text||':'||k,'PENDING_PROOF',inv,rev) returning id into row_id;
     if target is null then reason:='Unmatched invoice; owner evidence required';elsif typ in ('DEBIT','REJECTION','REVERSAL') then reason:='Owner proof required';end if;
    end if;
   end if;
   insert into rr_lease_private.step2c_report_observations(archive_id,canonical_key,payload,result_kind,row_id,reason) values(a,k,r,result,row_id,reason);
  end loop;
 end if;
 -- Link only an unambiguous opposite-amount reversal, even if the original
 -- arrived later. A link is provenance, never a financial adjustment.
 if p_kind='firstline' then
  for event in select * from public.rr_lease_factoring_events z where z.carrier_user_id=p_carrier and z.event_type='REVERSAL' and z.reverses_id is null and z.review_status='PENDING_PROOF' and z.reverses_external_reference is not null order by z.id for update loop
   select count(*) into matched from public.rr_lease_factoring_events x where x.carrier_user_id=p_carrier and upper(btrim(x.external_reference))=event.reverses_external_reference and x.event_type<>'REVERSAL' and x.invoice_reference is not distinct from event.invoice_reference and x.operator_id is not distinct from event.operator_id and x.load_id is not distinct from event.load_id and x.amount_cents=-event.amount_cents;
   if matched=1 then
    select * into original from public.rr_lease_factoring_events x where x.carrier_user_id=p_carrier and upper(btrim(x.external_reference))=event.reverses_external_reference and x.event_type<>'REVERSAL' and x.invoice_reference is not distinct from event.invoice_reference and x.operator_id is not distinct from event.operator_id and x.load_id is not distinct from event.load_id and x.amount_cents=-event.amount_cents;
    if not exists(select 1 from public.rr_lease_factoring_events where reverses_id=original.id) then update public.rr_lease_factoring_events set reverses_id=original.id where id=event.id;end if;
   end if;
  end loop;
 end if;
 return jsonb_build_object('archiveId',a,'sha256',p_sha256,'replay',old_count>0,'postAllowed',false,
 'results',coalesce((select jsonb_object_agg(result_kind,n) from (select result_kind,count(*) n from rr_lease_private.step2c_report_observations where archive_id=a group by result_kind) q),'{}'::jsonb));
end $$;
revoke all on function public.rr_lease_step2c_import_report(uuid,text,text,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_step2c_import_report(uuid,text,text,text,text,jsonb,jsonb) to service_role;

-- Private owner report worklist. Only the authenticated carrier sees its own
-- reports, disputes, FirstLine metadata or unresolved events. Never return bytes.
create function public.rr_lease_step2c_report_review(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from public.rr_lease_operators where carrier_user_id=actor and workspace_kind='carrier') then raise exception 'Carrier required' using errcode='42501';end if;
 if p_limit not between 1 and 100 or p_limit is null then raise exception 'Invalid limit';end if;
 return jsonb_build_object('conflicts',coalesce((select jsonb_agg(to_jsonb(q)) from (select a.id as archive_id,a.kind,a.format,a.sha256,o.canonical_key,o.reason,o.payload from rr_lease_private.step2c_report_observations o join rr_lease_private.step2c_archives a on a.id=o.archive_id where a.carrier_user_id=actor and o.result_kind='NEEDS_REVIEW' order by a.created_at desc,o.canonical_key limit p_limit) q),'[]'::jsonb),
 'firstline',coalesce((select jsonb_agg(to_jsonb(q)) from (select id,operator_id,load_id,event_type,amount_cents,event_at,external_reference,invoice_reference,review_status,reverses_id,reverses_external_reference from public.rr_lease_factoring_events where carrier_user_id=actor order by event_at desc,id limit p_limit) q),'[]'::jsonb));
end $$;
revoke all on function public.rr_lease_step2c_report_review(integer) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_step2c_report_review(integer) to authenticated;

create or replace function public.rr_lease_step2b_owner_inbox(p_limit integer default 50,p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null or not exists(select 1 from public.rr_lease_operators o where o.carrier_user_id=v_actor and o.workspace_kind='carrier') then raise exception 'Carrier access required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid page limit' using errcode='22023'; end if;
 return jsonb_build_object(
 'intake',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.source_ref,r.attachment_ref,r.reason,r.created_at,a.operator_id,a.load_id,a.kind,a.accessorials,a.reason as assignment_reason,case when a.operator_id is not null then 'MATCHED_DRAFT' else 'NEEDS_OWNER_REVIEW' end as status
 from rr_lease_private.intake_review r left join rr_lease_private.step2b_assignment_drafts a using(carrier_user_id,source_ref,attachment_ref)
 where r.carrier_user_id=v_actor and r.resolved_at is null and (p_before is null or r.created_at<p_before)
 order by r.created_at desc,r.source_ref,r.attachment_ref limit p_limit) x),'[]'::jsonb),
 'pods',coalesce((select jsonb_agg(to_jsonb(x)) from (select e.document_id,e.load_id,l.operator_id,l.broker_name,l.load_number,l.final_pod_id,d.file_name,d.mime_type,d.byte_size,e.upload_received_at,e.sha256,l.gross_cents is null as no_gross
 from public.rr_lease_mail_events e join public.rr_lease_documents d on d.id=e.document_id join public.rr_lease_loads l on l.id=e.load_id
 where e.carrier_user_id=v_actor and e.source_kind='driver_upload' and e.rejected_at is null and not exists(select 1 from rr_lease_private.step2b_pod_decisions z where z.document_id=e.document_id)
 and (p_before is null or e.upload_received_at<p_before) order by e.upload_received_at desc,e.id limit p_limit) x),'[]'::jsonb),
 'amazon',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.id,a.amazon_trip_id,a.amazon_block_id,a.amazon_load_id,a.report_status,a.amount_cents,a.event_date,a.created_at
 from public.rr_lease_amazon_import_rows a where a.carrier_user_id=v_actor and a.operator_id is null and (p_before is null or a.created_at<p_before) order by a.created_at desc,a.id limit p_limit) x),'[]'::jsonb));
end $$;
