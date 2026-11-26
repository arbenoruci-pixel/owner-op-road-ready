-- Phase 1 / Step 2A. Requires the five previously applied Phase 1 migrations.
-- Development only: do not apply until the isolated rollback test and review pass.
alter table public.rr_lease_mail_events
  add column rejected_by uuid references auth.users(id),
  add column rejected_at timestamptz,
  add column rejection_reason text;
alter table public.rr_lease_mail_events add constraint rr_step2a_driver_pod_rejection_proof check (
  (rejected_by is null and rejected_at is null and rejection_reason is null)
  or (source_kind='driver_upload' and not verified_for_billing
      and rejected_by is not null and rejected_at is not null and isfinite(rejected_at)
      and rejected_at>=upload_received_at and rejection_reason is not null
      and length(btrim(rejection_reason)) between 1 and 1000
      and approved_by is null and approved_at is null and approval_reason is null)
);

-- Serialize review with finalization, factoring claim, and settlement issue.
create function rr_lease_private.step2a_assert_pod_review_open(p_load_id uuid)
returns void language plpgsql set search_path='' as $$
declare l public.rr_lease_loads; st text;
begin
  select * into strict l from public.rr_lease_loads where id=p_load_id for update;
  if l.status not in ('assigned','picked_up','delivered') then raise exception 'Open unfactored load required'; end if;
  if l.settlement_id is not null then
    select status into strict st from public.rr_lease_settlements where id=l.settlement_id for update;
    if st<>'draft' then raise exception 'Open unfactored load required: settlement locked'; end if;
  end if;
  if exists(select 1 from public.rr_lease_factoring f where f.load_id=l.id) then
    raise exception 'Open unfactored load required: factoring claim exists';
  end if;
end $$;
revoke all on function rr_lease_private.step2a_assert_pod_review_open(uuid) from public,anon,authenticated,service_role;
grant execute on function rr_lease_private.step2a_assert_pod_review_open(uuid) to service_role;

-- Phase 1 original provenance and approval guard remains installed.
create function rr_lease_private.step2a_pod_rejection_guard()
returns trigger language plpgsql set search_path='' as $$
declare owner_id uuid;
begin
  if new.source_kind<>'driver_upload' then return new; end if;
  if tg_op='INSERT' then
    if new.rejected_at is not null then raise exception 'Register a pending POD before rejection'; end if;
  elsif old.rejected_at is not null then
    if new is distinct from old then raise exception 'Rejected POD evidence is immutable'; end if;
    return new;
  end if;
  perform rr_lease_private.step2a_assert_pod_review_open(new.load_id);
  if new.rejected_at is not null then
    select o.carrier_user_id into strict owner_id from public.rr_lease_loads l
      join public.rr_lease_operators o on o.id=l.operator_id where l.id=new.load_id;
    if auth.uid() is distinct from owner_id or new.rejected_by is distinct from owner_id then
      raise exception 'Only the authenticated carrier may reject this POD' using errcode='42501';
    end if;
    if new.rejected_at>clock_timestamp() then raise exception 'Invalid rejection timestamp'; end if;
  end if;
  return new;
end $$;
revoke all on function rr_lease_private.step2a_pod_rejection_guard() from public,anon,authenticated,service_role;
create trigger rr_step2a_pod_rejection_guard before insert or update on public.rr_lease_mail_events
for each row execute function rr_lease_private.step2a_pod_rejection_guard();

create function rr_lease_private.step2a_pod_current_guard()
returns trigger language plpgsql set search_path='' as $$
declare ev public.rr_lease_mail_events;
begin
  if new.is_current is not distinct from old.is_current then return new; end if;
  select * into ev from public.rr_lease_mail_events where document_id=old.id and source_kind='driver_upload';
  if not found then return new; end if;
  perform rr_lease_private.step2a_assert_pod_review_open(old.load_id);
  if new.is_current and ev.rejected_at is not null then raise exception 'Rejected POD cannot become current'; end if;
  return new;
end $$;
revoke all on function rr_lease_private.step2a_pod_current_guard() from public,anon,authenticated,service_role;
create trigger rr_step2a_pod_current_guard before update of is_current on public.rr_lease_documents
for each row execute function rr_lease_private.step2a_pod_current_guard();

-- Allow existing initial finalization with a pending POD; subsequent phone-POD
-- replacement requires explicitly rejected prior original and approved new one.
create function rr_lease_private.step2a_final_pod_guard()
returns trigger language plpgsql set search_path='' as $$
declare prior public.rr_lease_mail_events; candidate public.rr_lease_mail_events; owner_id uuid; st text;
begin
  if new.final_pod_id is not distinct from old.final_pod_id then return new; end if;
  select * into prior from public.rr_lease_mail_events where document_id=old.final_pod_id and source_kind='driver_upload';
  select * into candidate from public.rr_lease_mail_events where document_id=new.final_pod_id and source_kind='driver_upload';
  if prior.id is null and candidate.id is null then return new; end if;
  -- OLD row is already locked by UPDATE. Lock its settlement without a second
  -- SELECT FOR UPDATE against the target load inside this BEFORE trigger.
  if old.status not in ('assigned','picked_up','delivered') then raise exception 'Open unfactored load required'; end if;
  if old.settlement_id is not null then
    select status into strict st from public.rr_lease_settlements where id=old.settlement_id for update;
    if st<>'draft' then raise exception 'Open unfactored load required: settlement locked'; end if;
  end if;
  if exists(select 1 from public.rr_lease_factoring f where f.load_id=old.id) then
    raise exception 'Open unfactored load required: factoring claim exists';
  end if;
  if candidate.id is not null and (candidate.load_id<>old.id or candidate.rejected_at is not null
      or not exists(select 1 from public.rr_lease_documents d where d.id=candidate.document_id and d.load_id=old.id
        and d.kind='pod' and d.is_current and d.is_ready and d.sha256=candidate.sha256)) then
    raise exception 'Replacement must be a current matched non-rejected original';
  end if;
  if old.final_pod_id is not null then
    select o.carrier_user_id into strict owner_id from public.rr_lease_operators o where o.id=old.operator_id;
    if prior.id is null or prior.load_id<>old.id or prior.rejected_at is null
       or candidate.id is null or not candidate.verified_for_billing
       or candidate.approved_by is distinct from owner_id or candidate.approved_at is null
       or auth.uid() is distinct from owner_id then
      raise exception 'Final POD replacement requires authenticated carrier approval after rejection' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function rr_lease_private.step2a_final_pod_guard() from public,anon,authenticated,service_role;
create trigger rr_step2a_final_pod_guard before update of final_pod_id on public.rr_lease_loads
for each row execute function rr_lease_private.step2a_final_pod_guard();

-- Prevent a claim with only a different intermediate-stop POD while the final
-- pointer is rejected or pending. Existing factoring history is unchanged.
create function rr_lease_private.step2a_phone_pod_factoring_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  perform 1 from public.rr_lease_loads where id=new.load_id for update;
  if exists(select 1 from public.rr_lease_mail_events where load_id=new.load_id and source_kind='driver_upload')
     and not rr_lease_private.phase1_load_eligible(new.load_id) then
    raise exception 'Verified final POD and rate confirmation required before factoring';
  end if;
  return new;
end $$;
revoke all on function rr_lease_private.step2a_phone_pod_factoring_guard() from public,anon,authenticated,service_role;
create trigger rr_step2a_phone_pod_factoring_guard before insert or update of load_id on public.rr_lease_factoring
for each row execute function rr_lease_private.step2a_phone_pod_factoring_guard();

create function public.rr_lease_reject_driver_pod(p_document_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); d public.rr_lease_documents; l public.rr_lease_loads; o public.rr_lease_operators; ev public.rr_lease_mail_events;
begin
  if actor is null then raise exception 'Carrier authentication required' using errcode='42501'; end if;
  select * into d from public.rr_lease_documents where id=p_document_id;
  if not found then raise exception 'POD unavailable' using errcode='42501'; end if;
  select * into strict l from public.rr_lease_loads where id=d.load_id for update;
  select * into strict o from public.rr_lease_operators where id=l.operator_id for share;
  if o.carrier_user_id is distinct from actor then raise exception 'Only the carrier may reject this POD' using errcode='42501'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Documented rejection reason required'; end if;
  perform rr_lease_private.step2a_assert_pod_review_open(l.id);
  select * into ev from public.rr_lease_mail_events where document_id=d.id and source_kind='driver_upload'
    and load_id=l.id and carrier_user_id=actor and sha256=d.sha256 for update;
  if not found or d.kind<>'pod' or not public.rr_lease_original_ready(d.id) then raise exception 'Matched phone POD original required'; end if;
  if ev.verified_for_billing then raise exception 'Approved POD cannot be rejected in place'; end if;
  if ev.rejected_at is null then
    if not d.is_current then raise exception 'Current pending POD required'; end if;
    update public.rr_lease_mail_events set rejected_by=actor,rejected_at=clock_timestamp(),rejection_reason=btrim(p_reason)
      where id=ev.id returning * into ev;
    update public.rr_lease_documents set is_current=false where id=d.id;
  elsif ev.rejection_reason is distinct from btrim(p_reason) then
    raise exception 'Rejected POD evidence is immutable';
  end if;
  -- Keep the historical final pointer until the new original is approved.
  -- Never alter original bytes, earliest receipt timestamp or its reference.
  return jsonb_build_object('event_id',ev.id,'review_status','REJECTED','verified_for_billing',false,
    'rejected_at',ev.rejected_at,'final_pod_id',l.final_pod_id,'eligible',rr_lease_private.phase1_load_eligible(l.id));
end $$;
revoke all on function public.rr_lease_reject_driver_pod(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_reject_driver_pod(uuid,text) to authenticated;

create or replace function public.rr_lease_approve_driver_pod(p_document_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); d public.rr_lease_documents; l public.rr_lease_loads; o public.rr_lease_operators; ev public.rr_lease_mail_events; replaced uuid;
begin
  if actor is null then raise exception 'Carrier authentication required' using errcode='42501'; end if;
  select * into d from public.rr_lease_documents where id=p_document_id;
  if not found then raise exception 'POD unavailable' using errcode='42501'; end if;
  select * into strict l from public.rr_lease_loads where id=d.load_id for update;
  select * into strict o from public.rr_lease_operators where id=l.operator_id for share;
  if o.carrier_user_id is distinct from actor then raise exception 'Only the carrier may approve this POD' using errcode='42501'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Documented approval reason required'; end if;
  perform rr_lease_private.step2a_assert_pod_review_open(l.id);
  select * into ev from public.rr_lease_mail_events where document_id=d.id and source_kind='driver_upload'
    and load_id=l.id and carrier_user_id=actor and sha256=d.sha256 for update;
  if not found or d.kind<>'pod' or not public.rr_lease_original_ready(d.id) then raise exception 'Matched phone POD original required'; end if;
  if ev.rejected_at is not null then raise exception 'Rejected POD cannot be approved; upload a new original'; end if;
  if not d.is_current then raise exception 'Current phone POD required'; end if;
  if not ev.verified_for_billing then
    update public.rr_lease_mail_events set verified_for_billing=true,approved_by=actor,approved_at=clock_timestamp(),approval_reason=btrim(p_reason)
      where id=ev.id returning * into ev;
  end if;
  if l.final_pod_id is distinct from d.id and exists(
    select 1 from public.rr_lease_mail_events prior
    where prior.document_id=l.final_pod_id and prior.load_id=l.id and prior.carrier_user_id=actor
      and prior.source_kind='driver_upload' and prior.rejected_at is not null) then
    replaced:=l.final_pod_id;
    update public.rr_lease_loads set final_pod_id=d.id where id=l.id returning * into l;
  end if;
  -- Additional stop approval does not displace a non-rejected final POD.
  -- For a rejected final, the owner must select the intended replacement.
  return jsonb_build_object('event_id',ev.id,'review_status','APPROVED','verified_for_billing',true,
    'final_pod_id',l.final_pod_id,'replaced_pod_id',replaced,'eligible',rr_lease_private.phase1_load_eligible(l.id));
end $$;
revoke all on function public.rr_lease_approve_driver_pod(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_approve_driver_pod(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION public.rr_lease_register_driver_pod(p_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); d public.rr_lease_documents; l public.rr_lease_loads; o public.rr_lease_operators; ev public.rr_lease_mail_events; received timestamptz;
begin
 if actor is null then raise exception 'Driver authentication required' using errcode='42501'; end if;
 select * into d from public.rr_lease_documents where id=p_document_id;
 if not found then raise exception 'POD unavailable' using errcode='42501'; end if;
 select * into strict l from public.rr_lease_loads where id=d.load_id for update;
 select * into strict o from public.rr_lease_operators where id=l.operator_id;
 if o.driver_user_id is distinct from actor then raise exception 'POD unavailable for this driver' using errcode='42501'; end if;
 if d.kind<>'pod' or not public.rr_lease_original_ready(d.id) or l.billing_channel<>'FIRSTLINE_FACTORED' or l.load_type<>'FREIGHT' then raise exception 'Matched ready freight POD required'; end if;
 select * into ev from public.rr_lease_mail_events where document_id=d.id;
 if found then
  if ev.source_kind='driver_upload' and ev.uploaded_by=actor then return jsonb_build_object('event_id',ev.id,'verified_for_billing',ev.verified_for_billing,'received_at',ev.upload_received_at,'review_status',case when ev.rejected_at is not null then 'REJECTED' when ev.verified_for_billing then 'APPROVED' else 'PENDING' end); end if;
  raise exception 'Original already registered through another source; use existing evidence';
 end if;
 perform rr_lease_private.step2a_assert_pod_review_open(l.id);
 perform pg_advisory_xact_lock(hashtextextended(o.carrier_user_id::text||':'||d.sha256,0));
 if exists(select 1 from public.rr_lease_mail_events m where m.carrier_user_id=o.carrier_user_id and m.sha256=d.sha256 and m.load_id<>l.id) then raise exception 'POD original already assigned to a different load'; end if;
 received:=clock_timestamp();
 update public.rr_lease_documents set operator_visible=true,is_current=true where id=d.id;
 insert into public.rr_lease_mail_events(carrier_user_id,load_id,document_id,message_id,source_kind,sender_email,sha256,verified_for_billing,evidence,uploaded_by,upload_received_at)
 values(o.carrier_user_id,l.id,d.id,'app:'||d.id::text,'driver_upload',null,d.sha256,false,'Authenticated driver app upload; pending carrier review',actor,received)
 returning * into ev;
 perform rr_lease_private.phase1_record_pod_receipt(l.id,received,ev.message_id);
 return jsonb_build_object('event_id',ev.id,'verified_for_billing',false,'received_at',received,'review_status','PENDING');
end $function$;
revoke all on function public.rr_lease_register_driver_pod(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_register_driver_pod(uuid) to authenticated;

-- Keep original coalesce/allocation semantics. Deny re-finalization with rejected POD.
CREATE OR REPLACE FUNCTION public.rr_lease_finalize_delivery(p_load_id uuid, p_final_pod_id uuid, p_actual_delivery_date date, p_all_stops_complete boolean, p_required_docs_submitted_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_receipt_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
      where e.load_id=l.id and e.rejected_at is null and e.sha256=d.sha256 and d.load_id=l.id and d.id=p_final_pod_id and d.kind='pod' and (d.is_current or d.id=l.final_pod_id) and d.is_ready)
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
  if l.actual_delivery_date is null or l.final_pod_id is null or l.settlement_id is distinct from s.id
     or (is_leased and l.required_docs_submitted_at is distinct from verified_at) then
    update public.rr_lease_loads set actual_delivery_date=p_actual_delivery_date,final_pod_id=coalesce(final_pod_id,p_final_pod_id),
      required_docs_submitted_at=case when is_leased then verified_at end,settlement_id=s.id,status=case when status='closed' then 'closed' else 'delivered' end
      where id=l.id returning * into l;
  end if;
  return jsonb_build_object('settlement_id',s.id,'week_start',s.week_start,'service_week',service_week,
    'actual_delivery_date',l.actual_delivery_date,'required_docs_submitted_at',l.required_docs_submitted_at,
    'payment_deadline',l.payment_deadline,'catch_up',s.week_start<>service_week);
end $function$;
