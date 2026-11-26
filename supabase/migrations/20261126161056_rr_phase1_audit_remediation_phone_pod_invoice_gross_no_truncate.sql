
-- Audit remediation 1: record phone POD provenance in the same original-evidence
-- registry used by final delivery and factoring, without inventing an email.
alter table public.rr_lease_mail_events add column uploaded_by uuid references auth.users(id);
alter table public.rr_lease_mail_events add column upload_received_at timestamptz;
alter table public.rr_lease_mail_events add column approved_by uuid references auth.users(id);
alter table public.rr_lease_mail_events add column approved_at timestamptz;
alter table public.rr_lease_mail_events add column approval_reason text;
alter table public.rr_lease_mail_events drop constraint rr_lease_mail_events_source_kind_check;
alter table public.rr_lease_mail_events drop constraint rr_lease_mail_events_check;
alter table public.rr_lease_mail_events add constraint rr_lease_mail_events_source_kind_check check(source_kind in ('email','owner_upload','driver_upload'));
alter table public.rr_lease_mail_events add constraint rr_lease_mail_events_check check(
 (source_kind='email' and sender_email is not null and btrim(sender_email)<>'')
 or (source_kind in ('owner_upload','driver_upload') and sender_email is null));
alter table public.rr_lease_mail_events add constraint rr_phase1_driver_upload_proof check(
 (source_kind<>'driver_upload' and uploaded_by is null and upload_received_at is null and approved_by is null and approved_at is null and approval_reason is null)
 or (source_kind='driver_upload' and uploaded_by is not null and upload_received_at is not null and isfinite(upload_received_at) and left(message_id,4)='app:'
     and ((not verified_for_billing and approved_by is null and approved_at is null and approval_reason is null)
       or (verified_for_billing and approved_by is not null and approved_at is not null and isfinite(approved_at) and approved_at>=upload_received_at and approval_reason is not null and length(btrim(approval_reason)) between 1 and 1000))));
comment on table public.rr_lease_mail_events is 'Unified original document provenance: email, owner upload, or authenticated driver app upload. App uploads never require a fabricated email; verified_for_billing requires carrier approval.';
create function rr_lease_private.phase1_driver_pod_event_guard() returns trigger
language plpgsql set search_path='' as $$
declare d record; actor uuid:=auth.uid();
begin
 if tg_op='DELETE' then
  if old.source_kind='driver_upload' then raise exception 'Retain driver upload provenance; add a new original for correction'; end if;
  return old;
 end if;
 if tg_op='UPDATE' and (old.source_kind='driver_upload' or new.source_kind='driver_upload') then
  if row(new.id,new.carrier_user_id,new.load_id,new.document_id,new.message_id,new.source_kind,new.sender_email,new.sha256,new.uploaded_by,new.upload_received_at,new.created_at)
    is distinct from row(old.id,old.carrier_user_id,old.load_id,old.document_id,old.message_id,old.source_kind,old.sender_email,old.sha256,old.uploaded_by,old.upload_received_at,old.created_at) then raise exception 'Driver POD provenance is immutable'; end if;
  if old.verified_for_billing and row(new.verified_for_billing,new.approved_by,new.approved_at,new.approval_reason,new.evidence)
     is distinct from row(old.verified_for_billing,old.approved_by,old.approved_at,old.approval_reason,old.evidence) then raise exception 'Retain approved POD provenance; review a new original'; end if;
 end if;
 if new.source_kind<>'driver_upload' then return new; end if;
 select l.id as load_id,l.status,l.billing_channel,l.load_type,l.settlement_id,o.driver_user_id,o.carrier_user_id,d0.sha256,d0.is_ready,d0.kind
 into strict d from public.rr_lease_documents d0 join public.rr_lease_loads l on l.id=d0.load_id join public.rr_lease_operators o on o.id=l.operator_id where d0.id=new.document_id;
 if d.load_id<>new.load_id or d.kind<>'pod' or not d.is_ready or d.sha256<>new.sha256 or d.carrier_user_id<>new.carrier_user_id or d.billing_channel<>'FIRSTLINE_FACTORED' or d.load_type<>'FREIGHT' then raise exception 'Driver POD must be a matched verified original for this load'; end if;
 if tg_op='INSERT' then
  if actor is null or actor is distinct from d.driver_user_id or new.uploaded_by is distinct from actor or new.verified_for_billing then raise exception 'Register a pending POD using the assigned driver identity' using errcode='42501'; end if;
  if new.upload_received_at>clock_timestamp() then raise exception 'Invalid POD arrival timestamp'; end if;
 end if;
 if new.verified_for_billing and (tg_op='INSERT' or not old.verified_for_billing) then
  if actor is null or actor is distinct from d.carrier_user_id or new.approved_by is distinct from actor or new.approved_at>clock_timestamp() then raise exception 'Only the authenticated carrier may approve a driver POD' using errcode='42501'; end if;
 end if;
 if d.status not in ('assigned','picked_up','delivered') or exists(select 1 from public.rr_lease_settlements s where s.id=d.settlement_id and s.status<>'draft') or exists(select 1 from public.rr_lease_factoring f where f.load_id=d.load_id) then raise exception 'Driver POD requires an open unfactored load; route changes to review'; end if;
 return new;
end $$;
revoke all on function rr_lease_private.phase1_driver_pod_event_guard() from public,anon,authenticated;
create trigger rr_phase1_driver_pod_event_guard before insert or update or delete on public.rr_lease_mail_events for each row execute function rr_lease_private.phase1_driver_pod_event_guard();

-- A trusted upload service must first finish/verify the original document.
-- This RPC registers it as the assigned authenticated driver, pending owner review.
create function public.rr_lease_register_driver_pod(p_document_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
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
  if ev.source_kind='driver_upload' and ev.uploaded_by=actor then return jsonb_build_object('event_id',ev.id,'verified_for_billing',ev.verified_for_billing,'received_at',ev.upload_received_at); end if;
  raise exception 'Original already registered through another source; use existing evidence';
 end if;
 if l.status not in ('assigned','picked_up','delivered') or exists(select 1 from public.rr_lease_settlements s where s.id=l.settlement_id and s.status<>'draft') or exists(select 1 from public.rr_lease_factoring f where f.load_id=l.id) then raise exception 'Open unfactored load required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(o.carrier_user_id::text||':'||d.sha256,0));
 if exists(select 1 from public.rr_lease_mail_events m where m.carrier_user_id=o.carrier_user_id and m.sha256=d.sha256 and m.load_id<>l.id) then raise exception 'POD original already assigned to a different load'; end if;
 received:=clock_timestamp();
 update public.rr_lease_documents set operator_visible=true,is_current=true where id=d.id;
 insert into public.rr_lease_mail_events(carrier_user_id,load_id,document_id,message_id,source_kind,sender_email,sha256,verified_for_billing,evidence,uploaded_by,upload_received_at)
 values(o.carrier_user_id,l.id,d.id,'app:'||d.id::text,'driver_upload',null,d.sha256,false,'Authenticated driver app upload; pending carrier review',actor,received)
 returning * into ev;
 perform rr_lease_private.phase1_record_pod_receipt(l.id,received,ev.message_id);
 return jsonb_build_object('event_id',ev.id,'verified_for_billing',false,'received_at',received);
end $$;
revoke all on function public.rr_lease_register_driver_pod(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_register_driver_pod(uuid) to authenticated;

create function public.rr_lease_approve_driver_pod(p_document_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); d public.rr_lease_documents; l public.rr_lease_loads; o public.rr_lease_operators; ev public.rr_lease_mail_events;
begin
 if actor is null then raise exception 'Carrier authentication required' using errcode='42501'; end if;
 select * into d from public.rr_lease_documents where id=p_document_id;
 if not found then raise exception 'POD unavailable' using errcode='42501'; end if;
 select * into strict l from public.rr_lease_loads where id=d.load_id for update;
 select * into strict o from public.rr_lease_operators where id=l.operator_id;
 if o.carrier_user_id is distinct from actor then raise exception 'Only the carrier may approve this POD' using errcode='42501'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Documented approval reason required'; end if;
 select * into ev from public.rr_lease_mail_events where document_id=d.id and source_kind='driver_upload' and load_id=l.id and carrier_user_id=actor and sha256=d.sha256 for update;
 if not found or d.kind<>'pod' or not d.is_current or not public.rr_lease_original_ready(d.id) then raise exception 'Matched pending phone POD original required'; end if;
 if ev.verified_for_billing then return jsonb_build_object('event_id',ev.id,'verified_for_billing',true,'eligible',rr_lease_private.phase1_load_eligible(l.id)); end if;
 if l.status not in ('assigned','picked_up','delivered') or exists(select 1 from public.rr_lease_settlements s where s.id=l.settlement_id and s.status<>'draft') or exists(select 1 from public.rr_lease_factoring f where f.load_id=l.id) then raise exception 'Open unfactored load required'; end if;
 update public.rr_lease_mail_events set verified_for_billing=true,approved_by=actor,approved_at=clock_timestamp(),approval_reason=btrim(p_reason) where id=ev.id returning * into ev;
 return jsonb_build_object('event_id',ev.id,'verified_for_billing',true,'eligible',rr_lease_private.phase1_load_eligible(l.id));
end $$;
revoke all on function public.rr_lease_approve_driver_pod(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_approve_driver_pod(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION rr_lease_private.phase1_load_eligible(p_load uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce((
 select l.gross_cents is not null and case
 when l.billing_channel='AMAZON_DIRECT' then exists(
   select 1 from public.rr_lease_amazon_import_rows a
   where a.load_id=l.id and a.operator_id=l.operator_id and a.source_kind='RELAY_CSV'
   and a.verified_at is not null and a.amount_cents=l.gross_cents
   and ((l.load_type='TONU' and a.report_status='TONU' and l.cancelled_at is not null)
   or (l.load_type='FREIGHT' and a.report_status in ('COMPLETED','PAID') and l.status in ('delivered','closed'))))
 when l.load_type='TONU' then l.cancelled_at is not null and exists(select 1 from public.rr_lease_documents d join public.rr_lease_mail_events m on m.document_id=d.id and m.load_id=l.id where d.id=l.tonu_confirmation_id and d.load_id=l.id and d.kind in ('ratecon','supporting') and d.is_ready and m.verified_for_billing)
 else l.status in ('delivered','closed') and l.actual_delivery_date is not null and exists(select 1 from public.rr_lease_documents d join public.rr_lease_mail_events m on m.document_id=d.id and m.load_id=l.id where d.id=l.final_pod_id and d.load_id=l.id and d.kind='pod' and d.is_ready and m.verified_for_billing and m.sha256=d.sha256 and exists(select 1 from public.rr_lease_operators o where o.id=l.operator_id and o.carrier_user_id=m.carrier_user_id and (m.source_kind in ('email','owner_upload') or (m.source_kind='driver_upload' and m.approved_by=o.carrier_user_id and m.approved_at is not null))))
 and exists(select 1 from public.rr_lease_documents d join public.rr_lease_mail_events m on m.document_id=d.id and m.load_id=l.id where d.load_id=l.id and d.kind='ratecon' and d.is_ready and d.is_current and m.verified_for_billing)
 end from public.rr_lease_loads l where l.id=p_load),false)
$function$
;
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
      where e.load_id=l.id and e.sha256=d.sha256 and d.load_id=l.id and d.id=p_final_pod_id and d.kind='pod' and (d.is_current or d.id=l.final_pod_id) and d.is_ready)
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
end $function$
;

-- Audit remediation 2: keep the historical fee base as gross_cents on the
-- settlement view; explicitly expose the invoice gross including lumper.
-- Both the statement check and Pay summary use this same component definition.
create function rr_lease_private.phase1_invoice_breakdown(p_settlement uuid,p_load uuid,p_posted_only boolean)
returns table(fee_eligible_gross_cents numeric,lumper_reimbursement_cents numeric,invoice_gross_cents numeric)
language sql stable security definer set search_path='' as $$
 select
 coalesce(sum(e.amount_cents) filter(where e.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU')),0),
 coalesce(sum(e.amount_cents) filter(where e.entry_type='LUMPER_REIMBURSEMENT'),0),
 coalesce(sum(e.amount_cents) filter(where e.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU','LUMPER_REIMBURSEMENT')),0)
 from public.rr_lease_settlements s join public.rr_lease_operators o on o.id=s.operator_id
 left join public.rr_lease_ledger_entries e on e.settlement_id=s.id and (p_load is null or e.load_id=p_load) and (e.status='POSTED' or (p_posted_only is false and e.status='DRAFT'))
 where s.id=p_settlement and (
 (auth.uid() is not null and (o.driver_user_id=auth.uid() or o.carrier_user_id=auth.uid()))
 or current_setting('role',true)='service_role'
 or (current_setting('role',true)='none' and session_user in ('postgres','service_role','supabase_admin')))
 group by s.id
$$;
revoke all on function rr_lease_private.phase1_invoice_breakdown(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function rr_lease_private.phase1_invoice_breakdown(uuid,uuid,boolean) to authenticated,service_role;
CREATE OR REPLACE FUNCTION rr_lease_private.phase1_ledger_totals(p_settlement uuid)
 RETURNS TABLE(load_count bigint, gross_cents numeric, operator_share_cents numeric, carrier_share_cents numeric, carrier_deduction_cents numeric, credit_cents numeric, operator_paid_cents numeric, estimated_net_cents numeric, verified_net_cents numeric, all_confirmed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select count(distinct e.load_id) filter(where e.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU')),
 max(b.fee_eligible_gross_cents),
 coalesce(sum(e.driver_effect_cents) filter(where e.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU')),0),
 coalesce(sum(e.carrier_effect_cents),0),
 coalesce(sum(-e.driver_effect_cents) filter(where e.driver_effect_cents<0),0),
 coalesce(sum(e.driver_effect_cents) filter(where e.entry_type not in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') and e.driver_effect_cents>0),0),
 coalesce(sum(e.amount_cents) filter(where e.paid_by='operator' and e.entry_type in ('FUEL','INSURANCE','ELD','ADVANCE','OTHER')),0),
 coalesce(sum(e.driver_effect_cents),0),
 coalesce(sum(e.driver_effect_cents) filter(where e.status='POSTED'),0),
 coalesce(bool_and(e.status='POSTED'),true)
 from public.rr_lease_settlements s join public.rr_lease_operators o on o.id=s.operator_id
 cross join lateral rr_lease_private.phase1_invoice_breakdown(s.id,null,false) b
 left join public.rr_lease_ledger_entries e on e.settlement_id=s.id and e.status in ('DRAFT','POSTED')
 where s.id=p_settlement and (
 (auth.uid() is not null and (o.driver_user_id=auth.uid() or o.carrier_user_id=auth.uid()))
 or current_setting('role',true)='service_role'
 or (current_setting('role',true)='none' and session_user in ('postgres','service_role','supabase_admin')))
 group by s.id
$function$
;
CREATE OR REPLACE FUNCTION rr_lease_private.statement_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare due numeric; snap bigint; bad boolean;
begin
 if tg_op='DELETE' then if old.status<>'draft' then raise exception 'An issued settlement must be retained'; end if; return old; end if;
 if tg_op='INSERT' then if new.status<>'draft' then raise exception 'Create a draft before issuing a settlement'; end if; return new; end if;
 if row(new.id,new.operator_id,new.week_start) is distinct from row(old.id,old.operator_id,old.week_start) then raise exception 'Settlement identity cannot change'; end if;
 if old.status='paid' and new is distinct from old then raise exception 'Paid settlement is immutable'; end if;
 if old.status='issued' and (new.status='draft' or new.expected_pay_date is distinct from old.expected_pay_date) then raise exception 'Issued settlement cannot be reopened or rescheduled'; end if;
 if old.status='draft' and new.status='paid' then raise exception 'Issue a settlement before marking it paid'; end if;
 if old.status='issued' and new.status='paid' then
  if new.paid_at is null or not isfinite(new.paid_at) or new.paid_at>clock_timestamp() then raise exception 'Use actual bank payment date'; end if;
  select net_cents into strict snap from public.rr_lease_settlement_snapshots where settlement_id=new.id;
  if new.payment_amount_cents is distinct from snap then raise exception 'Payment amount must match the immutable ledger snapshot'; end if;
 end if;
 if old.status='draft' and new.status='issued' then
  if (select count(*) from public.rr_lease_cost_reviews where settlement_id=new.id)<>3 then raise exception 'Review insurance, fuel and ELD costs'; end if;
  if exists(select 1 from public.rr_lease_ledger_entries where settlement_id=new.id and status='DRAFT') then raise exception 'Unverified ledger item: verify or defer before issue'; end if;
  if exists(select 1 from public.rr_lease_loads l where l.settlement_id=new.id and not rr_lease_private.phase1_load_eligible(l.id)) then raise exception 'Load lacks required official evidence'; end if;
  if exists(select 1 from public.rr_lease_loads l where l.settlement_id=new.id and l.ledger_mode='ITEMIZED' and (
   not exists(select 1 from public.rr_lease_ledger_entries e where e.load_id=l.id and e.settlement_id=new.id and e.status='POSTED' and e.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU'))
   or l.gross_cents is distinct from (select b.invoice_gross_cents from rr_lease_private.phase1_invoice_breakdown(new.id,l.id,true) b))) then raise exception 'Itemized load total does not match verified invoice or Amazon report'; end if;
  if exists(select 1 from public.rr_lease_ledger_entries e where e.settlement_id=new.id and e.status='POSTED' and e.entry_type in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU') and not rr_lease_private.phase1_load_eligible(e.load_id)) then raise exception 'Revenue lacks verified load evidence'; end if;
  select coalesce(sum(driver_effect_cents),0) into due from public.rr_lease_ledger_entries where settlement_id=new.id and status='POSTED';
  if due<0 then raise exception 'Negative balance must be explicitly carried forward with approved evidence before issue'; end if;
  insert into public.rr_lease_settlement_snapshots(settlement_id,operator_id,net_cents,snapshot)
  select new.id,new.operator_id,due::bigint,jsonb_build_object('currency',new.currency,'week_start',new.week_start,'entries',coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id) filter(where e.id is not null),'[]'::jsonb))
  from public.rr_lease_ledger_entries e where e.settlement_id=new.id and e.status='POSTED';
 end if;
 return new;
end $function$
;
create or replace view public.rr_lease_settlement_totals with(security_invoker=true) as
 select s.id as settlement_id,s.operator_id,s.week_start,s.status,s.currency,
 t.load_count,t.gross_cents,t.operator_share_cents,t.carrier_share_cents,t.carrier_deduction_cents,t.credit_cents,t.operator_paid_cents,
 t.estimated_net_cents,
 case when t.all_confirmed and r.reviewed=3 then greatest(t.verified_net_cents,0) else null::numeric end as net_cents,
 r.reviewed=3 as costs_reviewed,r.deferred>0 as has_deferred_costs,
 t.verified_net_cents,case when t.all_confirmed and r.reviewed=3 then greatest(-t.verified_net_cents,0) else 0::numeric end as negative_balance_cents,
 b.fee_eligible_gross_cents,b.lumper_reimbursement_cents,b.invoice_gross_cents
 from public.rr_lease_settlements s
 cross join lateral rr_lease_private.phase1_ledger_totals(s.id) t
 cross join lateral rr_lease_private.phase1_invoice_breakdown(s.id,null,false) b
 cross join lateral (select count(*) as reviewed,count(*) filter(where c.outcome='deferred') as deferred from public.rr_lease_cost_reviews c where c.settlement_id=s.id) r;
comment on column public.rr_lease_loads.gross_cents is 'Confirmed invoice/report total; for ITEMIZED loads this includes documented lumper reimbursement. Settlement fee base is computed from ledger revenue components only.';
comment on column public.rr_lease_settlement_totals.gross_cents is 'Backward-compatible alias for fee_eligible_gross_cents; excludes lumper reimbursement.';
comment on column public.rr_lease_settlement_totals.fee_eligible_gross_cents is 'Freight, FSC, detention, layover and TONU before company fee. Excludes lumper.';
comment on column public.rr_lease_settlement_totals.lumper_reimbursement_cents is 'Lumper reimbursed by broker, at 0% company fee; also included in credit_cents, never add it twice.';
comment on column public.rr_lease_settlement_totals.invoice_gross_cents is 'Fee-eligible gross plus lumper reimbursement, same component basis used by statement_guard.';
-- Audit remediation 3: prevent bypass of row-level LOCKED triggers.
revoke truncate on public.rr_lease_settlements,public.rr_lease_loads,public.rr_lease_adjustments from service_role;
