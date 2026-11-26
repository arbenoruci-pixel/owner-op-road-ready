-- Phase 1 Step 3 financial bridge. DEVELOPMENT ONLY. No logbook tables.
create table rr_lease_private.step3_decisions(
 carrier_user_id uuid not null references auth.users(id),
 kind text not null,
 entity_id uuid not null,
 payload jsonb not null,
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 created_at timestamptz not null default clock_timestamp(),
 primary key(carrier_user_id,kind,entity_id)
);
alter table rr_lease_private.step3_decisions enable row level security;
revoke all on rr_lease_private.step3_decisions from public,anon,authenticated,service_role;
create trigger rr_step3_decisions_immutable before update or delete on rr_lease_private.step3_decisions for each row execute function rr_lease_private.phase1_immutable();

-- Exact replay only. The entire decision and mutation commit together.
create function rr_lease_private.step3_decide(p_actor uuid,p_kind text,p_id uuid,p_payload jsonb,p_reason text)
returns boolean language plpgsql set search_path='' as $$
declare d rr_lease_private.step3_decisions;
begin
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Reviewed evidence and reason required' using errcode='22023';end if;
 select * into d from rr_lease_private.step3_decisions where carrier_user_id=p_actor and kind=p_kind and entity_id=p_id;
 if found then
  if d.payload is distinct from p_payload or d.reason<>btrim(p_reason) then raise exception 'Decision already recorded; separate correction review required' using errcode='23505';end if;
  return false;
 end if;
 insert into rr_lease_private.step3_decisions(carrier_user_id,kind,entity_id,payload,reason) values(p_actor,p_kind,p_id,p_payload,btrim(p_reason));
 return true;
end $$;
revoke all on function rr_lease_private.step3_decide(uuid,text,uuid,jsonb,text) from public,anon,authenticated,service_role;

-- A rate confirmation approval activates dispatch data, not payment eligibility.
-- Original must have been filed by the carrier through the 2C archive executor.
alter table public.rr_lease_loads add column broker_rules jsonb not null default '{}'::jsonb check(jsonb_typeof(broker_rules)='object');
create function public.rr_lease_step3_verify_ratecon(p_document_id uuid,p_fields jsonb,p_previous_ratecon_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); d public.rr_lease_documents; l public.rr_lease_loads; prior uuid; src rr_lease_private.step2c_mail_sources; r rr_lease_private.intake_review; e public.rr_lease_mail_events; fresh boolean; rules jsonb;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 select z.* into d from public.rr_lease_documents z join public.rr_lease_loads x on x.id=z.load_id join public.rr_lease_operators o on o.id=x.operator_id where z.id=p_document_id and o.carrier_user_id=actor and z.kind='ratecon';
 if not found then raise exception 'Rate confirmation unavailable' using errcode='42501';end if;
 select * into strict l from public.rr_lease_loads where id=d.load_id for update;
 perform 1 from public.rr_lease_operators where id=l.operator_id and carrier_user_id=actor for share;
 if not found then raise exception 'Rate confirmation unavailable' using errcode='42501';end if;
 select q.* into r from rr_lease_private.intake_review q join rr_lease_private.step2c_assignment_execution x using(carrier_user_id,source_ref,attachment_ref) where q.carrier_user_id=actor and q.load_document_id=d.id and q.resolved_at is not null and x.result->>'documentId'=d.id::text order by q.created_at limit 1;
 if not found then raise exception 'Original must be filed through intake' using errcode='22023';end if;
 select * into strict src from rr_lease_private.step2c_mail_sources where carrier_user_id=actor and source_ref=r.source_ref and attachment_ref=r.attachment_ref;
 if not exists(select 1 from rr_lease_private.step2c_archives a where a.id=src.archive_id and a.carrier_user_id=actor and a.sha256=d.sha256) or not public.rr_lease_original_ready(d.id) then raise exception 'Original checksum/evidence missing';end if;
 if jsonb_typeof(p_fields) is distinct from 'object' or (p_fields-'gross_cents'-'pickup_address'-'delivery_address'-'steps'-'accessorials'-'broker_rules'-'pickup_number'-'delivery_number'-'pickup_at'-'delivery_at'-'pickup_timezone'-'delivery_timezone'-'reefer_instructions')<>'{}'::jsonb
 or coalesce(p_fields->>'gross_cents','') !~ '^[1-9][0-9]{0,11}$' or (p_fields->>'gross_cents')::numeric>100000000000
 or nullif(btrim(p_fields->>'pickup_address'),'') is null or nullif(btrim(p_fields->>'delivery_address'),'') is null
 or length(p_fields->>'pickup_address')>1000 or length(p_fields->>'delivery_address')>1000 or jsonb_typeof(p_fields->'steps') is distinct from 'array' then raise exception 'Confirm exact gross, addresses and steps' using errcode='22023';end if;
 if jsonb_array_length(p_fields->'steps') not between 1 and 50 or exists(select 1 from jsonb_array_elements(p_fields->'steps') x where jsonb_typeof(x) is distinct from 'object' or nullif(btrim(x->>'title'),'') is null or nullif(btrim(x->>'detail'),'') is null or length(x->>'title')>200 or length(x->>'detail')>2000) then raise exception 'Reviewed steps required' using errcode='22023';end if;
 rules:=coalesce(p_fields->'broker_rules','{}'::jsonb);
 if jsonb_typeof(rules) is distinct from 'object' or (rules-'tracking'-'detention'-'layover'-'lumper'-'podDeadline')<>'{}'::jsonb or exists(select 1 from jsonb_each(rules) q where jsonb_typeof(q.value)<>'string' or length(q.value#>>'{}')>2000) then raise exception 'Invalid broker rules' using errcode='22023';end if;
 if exists(select 1 from (values(p_fields->>'pickup_timezone'),(p_fields->>'delivery_timezone')) q(tz) where tz is not null and not exists(select 1 from pg_catalog.pg_timezone_names t where t.name=q.tz)) then raise exception 'Invalid appointment timezone' using errcode='22023';end if;
 if (p_fields->>'pickup_at' is not null and (p_fields->>'pickup_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or p_fields->>'pickup_timezone' is null)) or (p_fields->>'delivery_at' is not null and (p_fields->>'delivery_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or p_fields->>'delivery_timezone' is null)) then raise exception 'Appointments require timezone and explicit offset';end if;
 fresh:=rr_lease_private.step3_decide(actor,'RATECON',d.id,jsonb_build_object('fields',p_fields,'previous',p_previous_ratecon_id),p_reason);
 if not fresh then return jsonb_build_object('documentId',d.id,'loadId',l.id,'replay',true);end if;
 if l.status<>'staging' then perform rr_lease_private.step2a_assert_pod_review_open(l.id);end if;
 if l.billing_channel<>'FIRSTLINE_FACTORED' or l.load_type<>'FREIGHT' or l.status in ('closed','cancelled') or exists(select 1 from public.rr_lease_factoring where load_id=l.id) then raise exception 'Rate confirmation requires open OTR load';end if;
 perform rr_lease_private.step2b_prepare_itemized(l.id,p_fields->'accessorials');
 -- Preserve the existing revision pointer on a concurrent/stale review.
 select id into prior from public.rr_lease_documents where load_id=l.id and kind='ratecon' and is_current and id<>d.id;
 if prior is distinct from p_previous_ratecon_id then raise exception 'Current rate confirmation changed' using errcode='23505';end if;
 if exists(select 1 from public.rr_lease_ledger_entries where load_id=l.id and source_kind='MANUAL' and status<>'VOID') then raise exception 'Itemized amounts already recorded; amendment review required';end if;
 if exists(select 1 from public.rr_lease_mail_events m where m.carrier_user_id=actor and m.sha256=d.sha256 and m.load_id<>l.id) then raise exception 'Original already verified on another load';end if;
 select * into e from public.rr_lease_mail_events where document_id=d.id;
 if found and (e.verified_for_billing or e.source_kind='driver_upload') then raise exception 'Existing verified source requires separate review';end if;
 if prior is not null then update public.rr_lease_documents set is_current=false where id=prior;end if;
 update public.rr_lease_loads set gross_cents=(p_fields->>'gross_cents')::bigint,pickup_address=btrim(p_fields->>'pickup_address'),delivery_address=btrim(p_fields->>'delivery_address'),steps=p_fields->'steps',broker_rules=rules,
 pickup_number=p_fields->>'pickup_number',delivery_number=p_fields->>'delivery_number',pickup_at=(p_fields->>'pickup_at')::timestamptz,delivery_at=(p_fields->>'delivery_at')::timestamptz,pickup_timezone=p_fields->>'pickup_timezone',delivery_timezone=p_fields->>'delivery_timezone',reefer_instructions=p_fields->>'reefer_instructions',
 status=case when status='staging' then 'assigned' else status end,updated_at=clock_timestamp() where id=l.id;
 update public.rr_lease_documents set operator_visible=true,is_current=true,revision=coalesce((select revision from public.rr_lease_documents where id=prior),0)+1 where id=d.id;
 if e.id is null then
  insert into public.rr_lease_mail_events(carrier_user_id,load_id,document_id,message_id,source_kind,sender_email,sha256,verified_for_billing,evidence)
  values(actor,l.id,d.id,src.source_ref,'email',src.sender,d.sha256,true,'Owner reviewed archived original: '||btrim(p_reason));
 else
  update public.rr_lease_mail_events set verified_for_billing=true where id=e.id;
 end if;
 return jsonb_build_object('documentId',d.id,'loadId',l.id,'replay',false,'eligible',rr_lease_private.phase1_load_eligible(l.id));
end $$;

-- Final delivery is a separate decision; no invented receipt/date.
create function public.rr_lease_step3_finalize(p_load_id uuid,p_delivery_date date,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); l public.rr_lease_loads; fresh boolean;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 select x.* into l from public.rr_lease_loads x join public.rr_lease_operators o on o.id=x.operator_id where x.id=p_load_id and o.carrier_user_id=actor for update of x;
 if not found then raise exception 'Load unavailable' using errcode='42501';end if;
 if l.final_pod_id is null or not exists(select 1 from public.rr_lease_mail_events e join public.rr_lease_documents d on d.id=e.document_id where e.document_id=l.final_pod_id and e.load_id=l.id and e.carrier_user_id=actor and e.verified_for_billing and e.rejected_at is null and d.is_ready and d.is_current) then raise exception 'Approved final POD required';end if;
 fresh:=rr_lease_private.step3_decide(actor,'FINALIZE',l.id,jsonb_build_object('date',p_delivery_date,'pod',l.final_pod_id),p_reason);
 if not fresh then return jsonb_build_object('settlement_id',l.settlement_id,'replay',true);end if;
 perform rr_lease_private.step2a_assert_pod_review_open(l.id);
 return public.rr_lease_finalize_delivery(l.id,l.final_pod_id,p_delivery_date,true,l.pod_received_at,l.pod_receipt_reference);
end $$;

-- Post one reconciled batch of current-load items. Proof IDs are exact, owner
-- reviewed originals. No arbitrary late adjustment, fee or unverified POD.
create function public.rr_lease_step3_post_components(p_load_id uuid,p_items jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); l public.rr_lease_loads; o public.rr_lease_operators; it jsonb; typ text; cents bigint; total numeric:=0; doc uuid; payer text; n int:=0; fresh boolean;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 select x.* into l from public.rr_lease_loads x join public.rr_lease_operators z on z.id=x.operator_id where x.id=p_load_id and z.carrier_user_id=actor for update of x;
 if not found then raise exception 'Load unavailable' using errcode='42501';end if;
 select * into strict o from public.rr_lease_operators where id=l.operator_id for share;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Item array required';end if;
 if jsonb_array_length(p_items) not between 1 and 6 then raise exception 'Item batch must contain 1-6 categories';end if;
 fresh:=rr_lease_private.step3_decide(actor,'COMPONENTS',l.id,p_items,p_reason);
 if not fresh then return jsonb_build_object('loadId',l.id,'replay',true);end if;
 if o.workspace_kind<>'leased' or l.ledger_mode<>'ITEMIZED' or l.settlement_id is null or not rr_lease_private.phase1_load_eligible(l.id) then raise exception 'Eligible delivered ITEMIZED load with draft settlement required';end if;
 perform rr_lease_private.step2a_assert_pod_review_open(l.id);
 if exists(select 1 from public.rr_lease_ledger_entries where load_id=l.id and status<>'VOID') then raise exception 'Existing financial items require amendment review';end if;
 if (select count(distinct x->>'type') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then raise exception 'One amount per category; reconcile source totals first';end if;
 for it in select value from jsonb_array_elements(p_items) loop
  typ:=it->>'type';payer:=it->>'paidBy';doc:=(it->>'documentId')::uuid;
  if typ is null or typ not in ('FREIGHT','FSC','DETENTION','LAYOVER','TONU','LUMPER_REIMBURSEMENT') or (l.load_type='TONU')<>(typ='TONU') or coalesce(it->>'amountCents','') !~ '^[0-9]{1,12}$' or payer is null or payer not in ('operator','carrier') then raise exception 'Invalid item category, amount or payer';end if;
  cents:=(it->>'amountCents')::bigint;
  if cents>100000000000 or not exists(select 1 from public.rr_lease_documents d join public.rr_lease_mail_events e on e.document_id=d.id where d.id=doc and d.load_id=l.id and d.is_ready and d.is_current and d.kind in ('ratecon','supporting') and e.load_id=l.id and e.carrier_user_id=actor and e.verified_for_billing and e.rejected_at is null and e.sha256=d.sha256) then raise exception 'Verified matching rate/supporting original required';end if;
  -- Carrier-paid lumper has an explicit offset; fee remains zero.
  total:=total+cents;
  insert into public.rr_lease_ledger_entries(operator_id,settlement_id,load_id,source_kind,entry_type,amount_cents,fee_bps,paid_by,status,description,source_document_id,approved_by,idempotency_key)
  values(l.operator_id,l.settlement_id,l.id,'MANUAL',typ,cents,case when typ='LUMPER_REIMBURSEMENT' then 0 else l.fee_bps end,payer,'POSTED',typ,doc,actor,'step3:item:'||l.id::text||':'||typ);
  if typ='LUMPER_REIMBURSEMENT' and payer='carrier' and cents>0 then
   insert into public.rr_lease_ledger_entries(operator_id,settlement_id,load_id,source_kind,entry_type,amount_cents,fee_bps,paid_by,status,description,source_document_id,approved_by,idempotency_key)
   values(l.operator_id,l.settlement_id,l.id,'MANUAL','LUMPER_PREPAID',-cents,0,'carrier','POSTED','Carrier advanced lumper',doc,actor,'step3:item:'||l.id::text||':LUMPER_PREPAID');
  end if;n:=n+1;
 end loop;
 if total is distinct from l.gross_cents::numeric then raise exception 'Itemized amounts do not reconcile exactly to verified invoice gross';end if;
 return jsonb_build_object('loadId',l.id,'components',n,'replay',false);
end $$;

-- Only a carrier decision tied to the exact draft and ready receipt can
-- promote its existing ledger projection. No changes to original amount.
create or replace function rr_lease_private.step2c_adjustment_draft_guard()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and new.intake_status is distinct from old.intake_status then
  if old.intake_status<>'DRAFT' or new.intake_status<>'POSTED' or (to_jsonb(new)-'intake_status'-'settlement_effect_cents') is distinct from (to_jsonb(old)-'intake_status'-'settlement_effect_cents')
    or not exists(select 1 from rr_lease_private.step3_decisions d join public.rr_lease_operators o on o.carrier_user_id=d.carrier_user_id where d.kind='EXPENSE' and d.entity_id=old.id and d.carrier_user_id=auth.uid() and o.id=old.operator_id) then raise exception 'Separate verified expense approval required';end if;
 end if;
 if tg_op='INSERT' and new.intake_status='DRAFT' and new.wallet_document_id is null then raise exception 'Draft adjustment requires archived wallet original';end if;
 return new;
end $$;
create function public.rr_lease_step3_approve_expense(p_adjustment_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a public.rr_lease_adjustments; st public.rr_lease_settlements; fresh boolean;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 select z.* into a from public.rr_lease_adjustments z join public.rr_lease_operators o on o.id=z.operator_id where z.id=p_adjustment_id and o.carrier_user_id=actor for update of z;
 if not found then raise exception 'Expense unavailable' using errcode='42501';end if;
 select * into strict st from public.rr_lease_settlements where id=a.settlement_id for update;
 if not exists(select 1 from public.rr_lease_wallet_documents w where w.id=a.wallet_document_id and w.operator_id=a.operator_id and w.is_ready) then raise exception 'Verified original receipt required';end if;
 fresh:=rr_lease_private.step3_decide(actor,'EXPENSE',a.id,jsonb_build_object('amount',a.amount_cents,'receipt',a.wallet_document_id,'reference',a.evidence_reference,'settlement',st.id),p_reason);
 if not fresh then return jsonb_build_object('adjustmentId',a.id,'replay',true);end if;
 if st.status<>'draft' or a.intake_status<>'DRAFT' then raise exception 'Draft expense and settlement required';end if;
 update public.rr_lease_adjustments set intake_status='POSTED' where id=a.id;
 if not exists(select 1 from public.rr_lease_ledger_entries where source_kind='LEGACY_ADJUSTMENT' and source_id=a.id and status='POSTED' and amount_cents=a.amount_cents) then raise exception 'Expense projection did not post';end if;
 return jsonb_build_object('adjustmentId',a.id,'status','POSTED','replay',false);
end $$;

-- FirstLine evidence decision is private and has NO automatic driver deduction.
-- The owner supplies a separate archived proof, never only a reason or the CSV.
create function public.rr_lease_step3_review_firstline(p_event_id uuid,p_status text,p_proof_archive_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e public.rr_lease_factoring_events; fresh boolean;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 select * into e from public.rr_lease_factoring_events where id=p_event_id and carrier_user_id=actor for update;
 if not found then raise exception 'Event unavailable' using errcode='42501';end if;
 if e.event_type not in ('DEBIT','REJECTION','REVERSAL','FEE','CREDIT','FUNDING','INVOICE') or p_status is null or p_status not in ('VERIFIED','CANCELLED_BY_FACTOR') then raise exception 'Explicit review decision required';end if;
 if not exists(select 1 from rr_lease_private.step2c_archives a where a.id=p_proof_archive_id and a.carrier_user_id=actor and a.kind='email' and a.format='attachment') then raise exception 'Independent archived original proof required';end if;
 fresh:=rr_lease_private.step3_decide(actor,'FIRSTLINE',e.id,jsonb_build_object('status',p_status,'proof',p_proof_archive_id),p_reason);
 if not fresh then return jsonb_build_object('eventId',e.id,'replay',true);end if;
 if e.review_status<>'PENDING_PROOF' or e.operator_id is null or e.load_id is null then raise exception 'Match the actual invoice before review';end if;
 if e.event_type='REVERSAL' and p_status='VERIFIED' and e.reverses_id is null then raise exception 'Reversal must match original';end if;
 update public.rr_lease_factoring_events set review_status=p_status where id=e.id;
 return jsonb_build_object('eventId',e.id,'status',p_status,'driverDeduction',false,'replay',false);
end $$;

-- Canonical standalone Relay load is first-class, never a fabricated trip.
alter table public.rr_lease_loads add column amazon_load_id text;
alter table public.rr_lease_loads add constraint rr_step3_amazon_load_identity check(amazon_load_id is null or (billing_channel='AMAZON_DIRECT' and amazon_trip_id is null and amazon_block_id is null and amazon_load_id ~ '^[A-Z0-9][A-Z0-9._:-]{0,119}$'));
create unique index rr_step3_amazon_load_unique on public.rr_lease_loads(amazon_load_id) where amazon_load_id is not null;
alter table public.rr_lease_amazon_import_rows drop constraint rr_step2c_standalone_hold;
create or replace function rr_lease_private.phase1_amazon_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.operator_id is not null and not exists(select 1 from public.rr_lease_operators o where o.id=new.operator_id and o.carrier_user_id=new.carrier_user_id) then raise exception 'Wrong operator for Amazon carrier';end if;
 if new.load_id is not null and not exists(select 1 from public.rr_lease_loads l where l.id=new.load_id and l.operator_id=new.operator_id and l.billing_channel='AMAZON_DIRECT' and l.amazon_trip_id is not distinct from new.amazon_trip_id and l.amazon_block_id is not distinct from new.amazon_block_id and l.amazon_load_id is not distinct from new.amazon_load_id) then raise exception 'Amazon load identity mismatch';end if;
 if new.amazon_block_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('rr-amazon-import:'||new.carrier_user_id::text||':'||new.amazon_block_id,0));
  if exists(select 1 from public.rr_lease_amazon_import_rows r where r.id<>new.id and r.carrier_user_id=new.carrier_user_id and r.amazon_block_id=new.amazon_block_id and r.verified_at is not null and new.verified_at is not null and (r.amazon_trip_id is null or new.amazon_trip_id is null)) then raise exception 'Verified Amazon block and trips cannot both be paid';end if;
 end if;
 if new.verified_at>clock_timestamp() then raise exception 'Invalid verification time';end if;
 return new;
end $$;
create function rr_lease_private.step3_solo_load_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.amazon_load_id is distinct from old.amazon_load_id and (old.amazon_load_id is not null or exists(select 1 from public.rr_lease_amazon_import_rows where load_id=old.id) or exists(select 1 from public.rr_lease_settlements where id=old.settlement_id and status<>'draft')) then raise exception 'Standalone Amazon identity immutable';end if;
 return new;
end $$;
create trigger rr_step3_solo_load_guard before update of amazon_load_id on public.rr_lease_loads for each row execute function rr_lease_private.step3_solo_load_guard();
create function public.rr_lease_step3_assign_amazon(p_row_id uuid,p_operator_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a public.rr_lease_amazon_import_rows; o public.rr_lease_operators; fresh boolean; k text; lid uuid; st uuid; wk date; status text;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 select * into a from public.rr_lease_amazon_import_rows where id=p_row_id and carrier_user_id=actor for update;
 if not found then raise exception 'Amazon row unavailable' using errcode='42501';end if;
 select * into o from public.rr_lease_operators where id=p_operator_id and carrier_user_id=actor for share;
 if not found then raise exception 'Operator unavailable' using errcode='42501';end if;
 fresh:=rr_lease_private.step3_decide(actor,'AMAZON',a.id,jsonb_build_object('operator',o.id,'hash',a.csv_sha256,'amount',a.amount_cents),p_reason);
 if not fresh then return jsonb_build_object('loadId',a.load_id,'replay',true);end if;
 if a.operator_id is not null or a.load_id is not null or a.verified_at is not null or a.source_kind<>'RELAY_CSV' or a.report_status not in ('COMPLETED','PAID','TONU') or a.amount_cents is null or a.event_date is null then raise exception 'Unassigned official report row required';end if;
 k:=case when a.amazon_trip_id is not null then 'TRIP:'||a.amazon_trip_id when a.amazon_block_id is not null then 'BLOCK:'||a.amazon_block_id else 'LOAD:'||a.amazon_load_id end;
 if not exists(select 1 from rr_lease_private.step2c_report_observations z join rr_lease_private.step2c_archives ar on ar.id=z.archive_id where ar.carrier_user_id=actor and ar.kind='amazon' and ar.sha256=a.csv_sha256 and z.row_id=a.id and z.result_kind in ('INSERTED','UPGRADED_SIGNAL') and z.canonical_key=k and (z.payload->>'amount_cents')::bigint=a.amount_cents) or exists(select 1 from rr_lease_private.step2c_report_observations z join rr_lease_private.step2c_archives ar on ar.id=z.archive_id where ar.carrier_user_id=actor and ar.kind='amazon' and z.canonical_key=k and z.result_kind='NEEDS_REVIEW') then raise exception 'Canonical report proof missing or disputed';end if;
 if o.workspace_kind='leased' then
  wk:=date_trunc('week',a.event_date::timestamp)::date;
  loop
   insert into public.rr_lease_settlements(operator_id,week_start) values(o.id,wk) on conflict(operator_id,week_start) do nothing;
   select s.id,s.status into strict st,status from public.rr_lease_settlements s where s.operator_id=o.id and s.week_start=wk for update;
   exit when status='draft';wk:=greatest(wk+7,date_trunc('week',now() at time zone 'America/Chicago')::date);
  end loop;
 end if;
 insert into public.rr_lease_loads(operator_id,broker_name,load_number,status,billing_channel,load_type,amazon_trip_id,amazon_block_id,amazon_load_id,gross_cents,settlement_id,actual_delivery_date,cancelled_at)
 values(o.id,'Amazon Relay',k,case when a.report_status='TONU' then 'cancelled' else 'delivered' end,'AMAZON_DIRECT',case when a.report_status='TONU' then 'TONU' else 'FREIGHT' end,a.amazon_trip_id,a.amazon_block_id,a.amazon_load_id,a.amount_cents,st,case when a.report_status<>'TONU' then a.event_date end,case when a.report_status='TONU' then a.event_date::timestamp at time zone 'America/Chicago' end)
 returning id into lid;
 update public.rr_lease_amazon_import_rows set operator_id=o.id,load_id=lid,verified_at=clock_timestamp(),verified_by=actor where id=a.id;
 perform rr_lease_private.phase1_sync_load(lid);
 if not rr_lease_private.phase1_load_eligible(lid) then raise exception 'Amazon allocation failed proof validation';end if;
 return jsonb_build_object('loadId',lid,'settlementId',st,'replay',false);
end $$;

-- Carrier cost controls and issue operate on a draft locked row.
create function public.rr_lease_step3_cost_review(p_settlement_id uuid,p_kind text,p_outcome text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); s public.rr_lease_settlements;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 select x.* into s from public.rr_lease_settlements x join public.rr_lease_operators o on o.id=x.operator_id where x.id=p_settlement_id and o.carrier_user_id=actor for update of x;
 if not found then raise exception 'Settlement unavailable' using errcode='42501';end if;
 if s.status<>'draft' or p_kind is null or p_kind not in ('insurance','fuel','eld') or p_outcome is null or p_outcome not in ('none','complete','deferred') or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Draft settlement and documented cost review required';end if;
 if exists(select 1 from public.rr_lease_ledger_entries e where e.settlement_id=s.id and e.entry_type=upper(p_kind) and e.status='DRAFT') then raise exception 'Resolve draft expense before cost review';end if;
 if p_outcome='none' and exists(select 1 from public.rr_lease_ledger_entries e where e.settlement_id=s.id and e.entry_type=upper(p_kind) and e.status='POSTED') then raise exception 'Recorded cost contradicts none';end if;
 if p_outcome<>'deferred' and p_kind in ('insurance','eld') and exists(select 1 from rr_lease_private.weekly_cost_schedules w where w.operator_id=s.operator_id and w.kind=p_kind and w.first_week<=s.week_start and (w.last_week is null or w.last_week>=s.week_start)) and not exists(select 1 from public.rr_lease_adjustments a where a.settlement_id=s.id and a.kind=p_kind and a.evidence_reference like 'weekly/%') then raise exception 'Authorized weekly cost must be applied or deferred';end if;
 insert into public.rr_lease_cost_reviews(settlement_id,kind,outcome,evidence_reference) values(s.id,p_kind,p_outcome,btrim(p_reason)) on conflict(settlement_id,kind) do update set outcome=excluded.outcome,evidence_reference=excluded.evidence_reference,reviewed_at=clock_timestamp();
 insert into public.rr_lease_audit_events(operator_id,entity_type,entity_id,event_type,actor_id,db_role,after_data) values(s.operator_id,'settlement',s.id,'COST_REVIEW',actor,'authenticated',jsonb_build_object('kind',p_kind,'outcome',p_outcome,'reason',p_reason));
 return jsonb_build_object('kind',p_kind,'outcome',p_outcome);
end $$;
create function public.rr_lease_step3_issue(p_settlement_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); s public.rr_lease_settlements; fresh boolean;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 select x.* into s from public.rr_lease_settlements x join public.rr_lease_operators o on o.id=x.operator_id where x.id=p_settlement_id and o.carrier_user_id=actor for update of x;
 if not found then raise exception 'Settlement unavailable' using errcode='42501';end if;
 fresh:=rr_lease_private.step3_decide(actor,'ISSUE',s.id,'{}'::jsonb,p_reason);
 if fresh then
  if s.status<>'draft' then raise exception 'Only draft can be issued';end if;
  if not exists(select 1 from public.rr_lease_ledger_entries where settlement_id=s.id and status='POSTED') then raise exception 'Empty statement cannot issue';end if;
  update public.rr_lease_settlements set status='issued' where id=s.id;
 end if;
 return (select jsonb_build_object('settlementId',s.id,'status','issued','netCents',n.net_cents,'issuedAt',n.issued_at,'replay',not fresh) from public.rr_lease_settlement_snapshots n where n.settlement_id=s.id);
end $$;

-- Read-side carrier-only worklist and driver-safe POD status. No factoring
-- metadata crosses the driver view. Original bytes use existing scoped RPCs.
create function public.rr_lease_step3_pod_status(p_operator_id uuid)
returns table(document_id uuid,load_id uuid,review_status text,rejection_reason text)
language sql stable security definer set search_path='' as $$
 select e.document_id,e.load_id,case when e.rejected_at is not null then 'REJECTED' when e.verified_for_billing then 'APPROVED' else 'PENDING' end,e.rejection_reason
 from public.rr_lease_mail_events e join public.rr_lease_loads l on l.id=e.load_id join public.rr_lease_operators o on o.id=l.operator_id
 where o.id=p_operator_id and auth.uid() in(o.carrier_user_id,o.driver_user_id) and e.source_kind='driver_upload'
$$;
create function public.rr_lease_step3_worklist()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from public.rr_lease_operators where carrier_user_id=actor and workspace_kind='carrier') then raise exception 'Carrier required' using errcode='42501';end if;
 return jsonb_build_object(
 'rates',coalesce((select jsonb_agg(to_jsonb(q)) from (select d.id,d.load_id,l.operator_id,l.broker_name,l.load_number,d.file_name,d.sha256,l.ledger_mode,(select id from public.rr_lease_documents where load_id=l.id and kind='ratecon' and is_current and id<>d.id limit 1) previous_ratecon_id from public.rr_lease_documents d join public.rr_lease_loads l on l.id=d.load_id join public.rr_lease_operators o on o.id=l.operator_id where o.carrier_user_id=actor and d.kind='ratecon' and d.is_ready and exists(select 1 from rr_lease_private.intake_review r where r.carrier_user_id=actor and r.load_document_id=d.id and r.resolved_at is not null) and not exists(select 1 from public.rr_lease_mail_events e where e.document_id=d.id and e.verified_for_billing) order by d.id limit 100) q),'[]'::jsonb),
 'attachments',coalesce((select jsonb_agg(to_jsonb(q)) from (select d.id,d.load_id,l.operator_id,l.broker_name,l.load_number,d.kind,d.file_name from public.rr_lease_documents d join public.rr_lease_loads l on l.id=d.load_id join public.rr_lease_operators o on o.id=l.operator_id where o.carrier_user_id=actor and d.kind in ('pod','bol','supporting') and d.is_ready and exists(select 1 from rr_lease_private.intake_review r where r.carrier_user_id=actor and r.load_document_id=d.id and r.resolved_at is not null) and not exists(select 1 from public.rr_lease_mail_events e where e.document_id=d.id) order by d.id limit 100) q),'[]'::jsonb),
 'expenses',coalesce((select jsonb_agg(to_jsonb(q)) from (select a.id,a.operator_id,a.settlement_id,a.amount_cents,a.kind,a.paid_by,a.description,a.wallet_document_id from public.rr_lease_adjustments a join public.rr_lease_operators o on o.id=a.operator_id where o.carrier_user_id=actor and a.intake_status='DRAFT' order by a.id limit 100) q),'[]'::jsonb),
 'settlements',coalesce((select jsonb_agg(to_jsonb(q)) from (select s.id,s.operator_id,o.driver_name,s.week_start,s.status from public.rr_lease_settlements s join public.rr_lease_operators o on o.id=s.operator_id where o.carrier_user_id=actor and s.status='draft' order by s.week_start desc,s.id limit 100) q),'[]'::jsonb));
end $$;
create function public.rr_lease_step3_company_summary(p_week date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); own_gross numeric; expenses numeric; commissions numeric; fees numeric; pending bigint;
begin
 if actor is null or not exists(select 1 from public.rr_lease_operators where carrier_user_id=actor and workspace_kind='carrier') then raise exception 'Carrier required' using errcode='42501';end if;
 if p_week is null or extract(isodow from p_week)<>1 then raise exception 'Monday week start required';end if;
 select coalesce(sum(l.gross_cents),0) into own_gross from public.rr_lease_loads l join public.rr_lease_operators o on o.id=l.operator_id where o.carrier_user_id=actor and o.workspace_kind='carrier' and coalesce(l.actual_delivery_date,(l.cancelled_at at time zone 'America/Chicago')::date)>=p_week and coalesce(l.actual_delivery_date,(l.cancelled_at at time zone 'America/Chicago')::date)<p_week+7 and rr_lease_private.phase1_load_eligible(l.id);
 select coalesce(sum(e.amount_cents),0) into expenses from public.rr_lease_owner_expenses e join public.rr_lease_operators o on o.id=e.operator_id where o.carrier_user_id=actor and e.purchased_on>=p_week and e.purchased_on<p_week+7;
 select coalesce(sum(e.carrier_effect_cents),0) into commissions from public.rr_lease_ledger_entries e join public.rr_lease_settlements s on s.id=e.settlement_id join public.rr_lease_operators o on o.id=e.operator_id where o.carrier_user_id=actor and s.week_start=p_week and e.status='POSTED';
 select coalesce(sum(abs(e.amount_cents)),0) into fees from public.rr_lease_factoring_events e where e.carrier_user_id=actor and e.event_type='FEE' and e.review_status='VERIFIED' and (e.event_at at time zone 'America/Chicago')::date>=p_week and (e.event_at at time zone 'America/Chicago')::date<p_week+7;
 select count(*) into pending from public.rr_lease_factoring_events e where e.carrier_user_id=actor and e.review_status='PENDING_PROOF' and (e.event_at at time zone 'America/Chicago')::date>=p_week and (e.event_at at time zone 'America/Chicago')::date<p_week+7;
 return jsonb_build_object('ownGrossCents',own_gross,'recordedOwnExpensesCents',expenses,'commissionCents',commissions,'verifiedFirstLineFeesCents',fees,'recordedMarginCents',own_gross-expenses+commissions-fees,'pendingFirstLineEvents',pending,'isCompleteProfit',false);
end $$;

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
 or rr_lease_ledger_entries.status='VOID' or (rr_lease_ledger_entries.status='DRAFT' and excluded.status='POSTED');
end $$;
revoke all on function public.rr_lease_step3_verify_ratecon(uuid,jsonb,uuid,text),
 public.rr_lease_step3_finalize(uuid,date,text),
 public.rr_lease_step3_post_components(uuid,jsonb,text),
 public.rr_lease_step3_approve_expense(uuid,text),
 public.rr_lease_step3_review_firstline(uuid,text,uuid,text),
 public.rr_lease_step3_assign_amazon(uuid,uuid,text),
 public.rr_lease_step3_cost_review(uuid,text,text,text),
 public.rr_lease_step3_issue(uuid,text),
 public.rr_lease_step3_pod_status(uuid),
 public.rr_lease_step3_worklist(),
 public.rr_lease_step3_company_summary(date) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_step3_verify_ratecon(uuid,jsonb,uuid,text),
 public.rr_lease_step3_finalize(uuid,date,text),
 public.rr_lease_step3_post_components(uuid,jsonb,text),
 public.rr_lease_step3_approve_expense(uuid,text),
 public.rr_lease_step3_review_firstline(uuid,text,uuid,text),
 public.rr_lease_step3_assign_amazon(uuid,uuid,text),
 public.rr_lease_step3_cost_review(uuid,text,text,text),
 public.rr_lease_step3_issue(uuid,text),
 public.rr_lease_step3_pod_status(uuid),
 public.rr_lease_step3_worklist(),
 public.rr_lease_step3_company_summary(date) to authenticated;


-- Own-truck upload is permitted only on the authenticated carrier's own
-- workspace; other leased workspaces still require the assigned driver.
-- The same pending review and provenance pipeline is used.
create or replace function rr_lease_private.phase1_driver_pod_event_guard() returns trigger
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
 select l.id as load_id,l.status,l.billing_channel,l.load_type,l.settlement_id,o.driver_user_id,o.carrier_user_id,o.workspace_kind,d0.sha256,d0.is_ready,d0.kind
 into strict d from public.rr_lease_documents d0 join public.rr_lease_loads l on l.id=d0.load_id join public.rr_lease_operators o on o.id=l.operator_id where d0.id=new.document_id;
 if d.load_id<>new.load_id or d.kind<>'pod' or not d.is_ready or d.sha256<>new.sha256 or d.carrier_user_id<>new.carrier_user_id or d.billing_channel<>'FIRSTLINE_FACTORED' or d.load_type<>'FREIGHT' then raise exception 'Driver POD must be a matched verified original for this load'; end if;
 if tg_op='INSERT' then
  if actor is null or not ((d.workspace_kind='leased' and actor is not distinct from d.driver_user_id) or (d.workspace_kind='carrier' and actor=d.carrier_user_id)) or new.uploaded_by is distinct from actor or new.verified_for_billing then raise exception 'Register a pending POD using the assigned driver identity' using errcode='42501'; end if;
  if new.upload_received_at>clock_timestamp() then raise exception 'Invalid POD arrival timestamp'; end if;
 end if;
 if new.verified_for_billing and (tg_op='INSERT' or not old.verified_for_billing) then
  if actor is null or actor is distinct from d.carrier_user_id or new.approved_by is distinct from actor or new.approved_at>clock_timestamp() then raise exception 'Only the authenticated carrier may approve a driver POD' using errcode='42501'; end if;
 end if;
 if d.status not in ('assigned','picked_up','delivered') or exists(select 1 from public.rr_lease_settlements s where s.id=d.settlement_id and s.status<>'draft') or exists(select 1 from public.rr_lease_factoring f where f.load_id=d.load_id) then raise exception 'Driver POD requires an open unfactored load; route changes to review'; end if;
 return new;
end $$;
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
 if not ((o.workspace_kind='leased' and o.driver_user_id is not distinct from actor) or (o.workspace_kind='carrier' and o.carrier_user_id=actor)) then raise exception 'POD unavailable for this driver' using errcode='42501'; end if;
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
create or replace function public.rr_lease_step2b_create_upload(p_request_id uuid,p_load_id uuid,p_broker text,p_load_number text,p_file_name text,p_mime text,p_size integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); o public.rr_lease_operators; l public.rr_lease_loads; i rr_lease_private.step2b_upload_intents; n int;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_request_id is null or p_size is null or p_size not between 1 and 3145728
 or p_mime is null or p_mime not in ('application/pdf','image/jpeg','image/png','image/webp')
 or p_file_name is null or length(p_file_name) not between 1 and 255 or p_file_name ~ '[[:cntrl:]/\\]' then raise exception 'Invalid file metadata' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rr-step2b-intent:'||v_actor::text,0));
 if p_load_id is not null then
   select * into l from public.rr_lease_loads where id=p_load_id for update;
   if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
   select * into o from public.rr_lease_operators where id=l.operator_id and ((driver_user_id=v_actor and workspace_kind='leased') or (carrier_user_id=v_actor and workspace_kind='carrier')) for share;
   if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
   if p_broker is not null or p_load_number is not null then raise exception 'Use load selector or orphan reference' using errcode='22023'; end if;
 else
   select count(*) into n from public.rr_lease_operators where ((driver_user_id=v_actor and workspace_kind='leased') or (carrier_user_id=v_actor and workspace_kind='carrier'));
   if n<>1 then raise exception 'An unambiguous driver workspace is required' using errcode='42501'; end if;
   select * into o from public.rr_lease_operators where ((driver_user_id=v_actor and workspace_kind='leased') or (carrier_user_id=v_actor and workspace_kind='carrier')) for share;
   if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
   if nullif(btrim(p_broker),'') is null or nullif(btrim(p_load_number),'') is null or length(p_broker)>200 or length(p_load_number)>120
      or p_broker ~ '[[:cntrl:]]' or p_load_number ~ '[[:cntrl:]]' then raise exception 'Broker and load reference required for orphan' using errcode='22023'; end if;
   p_broker:=btrim(p_broker); p_load_number:=btrim(p_load_number);
 end if;
 select * into i from rr_lease_private.step2b_upload_intents where actor=v_actor and request_id=p_request_id for update;
 if found then
   if row(i.operator_id,i.load_id,i.broker_name,i.load_number,i.file_name,i.mime_type,i.byte_size)
      is distinct from row(o.id,p_load_id,p_broker,p_load_number,p_file_name,p_mime,p_size) then raise exception 'Request ID already used for another upload' using errcode='23505'; end if;
   if i.document_id is null and i.created_at<clock_timestamp()-interval '15 minutes' then raise exception 'Upload expired' using errcode='22023'; end if;
   return jsonb_build_object('uploadId',i.id,'maxBytes',3145728,'committed',i.document_id is not null);
 end if;
 if p_load_id is not null then
   perform rr_lease_private.step2a_assert_pod_review_open(l.id);
   if l.billing_channel<>'FIRSTLINE_FACTORED' or l.load_type<>'FREIGHT' then raise exception 'Unsupported load channel or type' using errcode='22023'; end if;
 end if;
 if (select count(*) from rr_lease_private.step2b_upload_intents where actor=v_actor and created_at>clock_timestamp()-interval '24 hours')>=30
 or (select count(*) from rr_lease_private.step2b_upload_intents where actor=v_actor and created_at>clock_timestamp()-interval '15 minutes' and document_id is null)>=5 then raise exception 'Upload limit reached' using errcode='22023'; end if;
 insert into rr_lease_private.step2b_upload_intents(actor,operator_id,request_id,load_id,broker_name,load_number,file_name,mime_type,byte_size)
 values(v_actor,o.id,p_request_id,p_load_id,p_broker,p_load_number,p_file_name,p_mime,p_size) returning * into i;
 return jsonb_build_object('uploadId',i.id,'maxBytes',3145728,'committed',false);
end $$;
create or replace function public.rr_lease_step2b_commit_upload(p_upload_id uuid,p_base64 text,p_sha256 text,p_mime text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); i rr_lease_private.step2b_upload_intents; o public.rr_lease_operators; l public.rr_lease_loads;
 d public.rr_lease_documents; v_load uuid; v_doc uuid; v_bytes bytea; v_hash text; v_result jsonb; v_part int; v_orphan boolean;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 -- Same actor lock as reservation creation: consistent lock ordering for concurrent retries.
 perform pg_advisory_xact_lock(hashtextextended('rr-step2b-intent:'||v_actor::text,0));
 select * into i from rr_lease_private.step2b_upload_intents where id=p_upload_id and actor=v_actor for update;
 if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
 if p_base64 is null or length(p_base64)>4194304 or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_mime is distinct from i.mime_type then raise exception 'Invalid upload payload' using errcode='22023'; end if;
 v_bytes:=decode(p_base64,'base64'); v_hash:=encode(sha256(v_bytes),'hex');
 if octet_length(v_bytes)<>i.byte_size or v_hash<>p_sha256 or not rr_lease_private.step2b_magic(v_bytes,p_mime) then raise exception 'Original size, MIME or checksum mismatch' using errcode='22023'; end if;
 -- For an existing load acquire load then operator, matching owner review.
 if i.load_id is not null then
   select * into l from public.rr_lease_loads where id=i.load_id for update;
   if not found or l.operator_id<>i.operator_id then raise exception 'Upload unavailable' using errcode='42501'; end if;
 end if;
 select * into o from public.rr_lease_operators where id=i.operator_id and ((driver_user_id=v_actor and workspace_kind='leased') or (carrier_user_id=v_actor and workspace_kind='carrier')) for share;
 if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
 if i.document_id is not null then
   if i.digest<>v_hash then raise exception 'Upload replay has different bytes' using errcode='23505'; end if;
   return i.result;
 end if;
 if i.created_at<clock_timestamp()-interval '15 minutes' then raise exception 'Upload expired' using errcode='22023'; end if;
 if i.load_id is null then
   v_load:=public.rr_lease_stage_load(o.id,i.broker_name,i.load_number);
   select * into strict l from public.rr_lease_loads where id=v_load for update;
   if l.operator_id<>o.id then raise exception 'Upload unavailable' using errcode='42501'; end if;
   if l.status='staging' then
     if l.gross_cents is not null or l.settlement_id is not null then raise exception 'Staged financial load needs owner review' using errcode='22023'; end if;
     update public.rr_lease_loads set status='assigned' where id=l.id returning * into l;
   end if;
 end if;
 perform rr_lease_private.step2a_assert_pod_review_open(l.id);
 if l.billing_channel<>'FIRSTLINE_FACTORED' or l.load_type<>'FREIGHT' then raise exception 'Unsupported load channel or type' using errcode='22023'; end if;
 v_orphan:=not exists(select 1 from public.rr_lease_documents r join public.rr_lease_mail_events m on m.document_id=r.id where r.load_id=l.id and r.kind='ratecon' and r.is_current and r.is_ready and m.verified_for_billing);
 if v_orphan and (l.gross_cents is not null or l.settlement_id is not null) then raise exception 'Unverified financial load requires carrier review' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(o.carrier_user_id::text||':'||v_hash,0));
 if exists(select 1 from public.rr_lease_mail_events e where e.carrier_user_id=o.carrier_user_id and e.sha256=v_hash and e.load_id<>l.id) then raise exception 'Original already filed; carrier review required' using errcode='23505'; end if;
 select * into d from public.rr_lease_documents where load_id=l.id and kind='pod' and sha256=v_hash;
 if found then
   -- Do not let a driver claim an unrelated, pre-existing worker original.
   if not exists(select 1 from public.rr_lease_mail_events e where e.document_id=d.id and e.source_kind='driver_upload' and e.uploaded_by=v_actor) then raise exception 'Original already filed; carrier review required' using errcode='23505'; end if;
   v_doc:=d.id;
 else
   v_doc:=gen_random_uuid();
   insert into public.rr_lease_documents(id,load_id,kind,file_name,mime_type,byte_size,sha256,storage_backend,storage_path)
   values(v_doc,l.id,'pod',i.file_name,p_mime,i.byte_size,v_hash,'database',o.id::text||'/'||l.id::text||'/'||v_doc::text);
   for v_part in 0..((i.byte_size-1)/49152) loop
     perform public.rr_lease_put_chunk(v_doc,v_part,encode(substring(v_bytes from v_part*49152+1 for 49152),'base64'));
   end loop;
   perform public.rr_lease_finish_original(v_doc);
 end if;
 -- Invoked under the driver's JWT claims, within the same locked transaction.
 v_result:=public.rr_lease_register_driver_pod(v_doc)||jsonb_build_object('documentId',v_doc,'loadId',l.id,'orphan',v_orphan);
 if v_orphan then
   insert into rr_lease_private.intake_review(carrier_user_id,source_ref,attachment_ref,reason)
   values(o.carrier_user_id,'driver_upload:'||v_doc::text,v_hash,'Orphan POD: independently confirm broker/load and rate confirmation; no gross or settlement') on conflict do nothing;
 end if;
 update rr_lease_private.step2b_upload_intents set document_id=v_doc,digest=v_hash,result=v_result where id=i.id;
 return v_result;
end $$;

-- Verify a separately filed supporting/BOL/email POD. The owner explicitly
-- classifies a final POD. Never convert an intermediate phone POD via this RPC.
create function public.rr_lease_step3_verify_attachment(p_document_id uuid,p_set_as_final boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); d public.rr_lease_documents; l public.rr_lease_loads; r rr_lease_private.intake_review; src rr_lease_private.step2c_mail_sources; fresh boolean;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 select z.* into d from public.rr_lease_documents z join public.rr_lease_loads l0 on l0.id=z.load_id join public.rr_lease_operators o on o.id=l0.operator_id where z.id=p_document_id and o.carrier_user_id=actor and z.kind in ('pod','bol','supporting');
 if not found then raise exception 'Attachment unavailable' using errcode='42501';end if;
 select * into strict l from public.rr_lease_loads where id=d.load_id for update;
 if p_set_as_final is null or p_set_as_final and d.kind<>'pod' then raise exception 'Explicit final POD classification required';end if;
 select q.* into r from rr_lease_private.intake_review q join rr_lease_private.step2c_assignment_execution x using(carrier_user_id,source_ref,attachment_ref) where q.carrier_user_id=actor and q.load_document_id=d.id and q.resolved_at is not null and x.result->>'documentId'=d.id::text order by q.created_at limit 1;
 if not found then raise exception 'File archived attachment first';end if;
 select * into strict src from rr_lease_private.step2c_mail_sources where carrier_user_id=actor and source_ref=r.source_ref and attachment_ref=r.attachment_ref;
 if not exists(select 1 from rr_lease_private.step2c_archives a where a.id=src.archive_id and a.carrier_user_id=actor and a.sha256=d.sha256) or not public.rr_lease_original_ready(d.id) then raise exception 'Archived original required';end if;
 fresh:=rr_lease_private.step3_decide(actor,'ATTACHMENT',d.id,jsonb_build_object('final',p_set_as_final),p_reason);
 if not fresh then return jsonb_build_object('documentId',d.id,'replay',true);end if;
 perform rr_lease_private.step2a_assert_pod_review_open(l.id);
 if exists(select 1 from public.rr_lease_mail_events e where e.document_id=d.id or (e.carrier_user_id=actor and e.sha256=d.sha256 and e.load_id<>l.id)) then raise exception 'Original already reviewed; use original review workflow';end if;
 if p_set_as_final and l.final_pod_id is not null and l.final_pod_id<>d.id then raise exception 'Different final POD already exists; separate correction review';end if;
 update public.rr_lease_documents set is_current=true,operator_visible=true where id=d.id;
 insert into public.rr_lease_mail_events(carrier_user_id,load_id,document_id,message_id,source_kind,sender_email,sha256,verified_for_billing,evidence)
 values(actor,l.id,d.id,src.source_ref,'email',src.sender,d.sha256,true,'Owner reviewed archived original: '||btrim(p_reason));
 if p_set_as_final then
  perform rr_lease_private.phase1_record_pod_receipt(l.id,src.received_at,src.source_ref||':'||src.attachment_ref);
  update public.rr_lease_loads set final_pod_id=d.id where id=l.id;
 end if;
 return jsonb_build_object('documentId',d.id,'loadId',l.id,'replay',false);
end $$;

-- Owner-only original preview for the inbox. A private archive ID is not a
-- capability; each read rechecks carrier membership. Never return message bodies.
create function public.rr_lease_step3_intake_original(p_source_ref text,p_attachment_ref text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a rr_lease_private.step2c_archives; s rr_lease_private.step2c_mail_sources;
begin
 if actor is null or not exists(select 1 from public.rr_lease_operators where carrier_user_id=actor and workspace_kind='carrier') then raise exception 'Carrier required' using errcode='42501';end if;
 select * into s from rr_lease_private.step2c_mail_sources where carrier_user_id=actor and source_ref=p_source_ref and attachment_ref=p_attachment_ref and part_id<>'@message';
 if not found then raise exception 'Original unavailable' using errcode='42501';end if;
 select * into a from rr_lease_private.step2c_archives where id=s.archive_id and carrier_user_id=actor and kind='email' and format='attachment';
 if not found then raise exception 'Original unavailable' using errcode='42501';end if;
 return jsonb_build_object('archiveId',a.id,'name',s.file_name,'mime',s.mime_type,'sha256',a.sha256,'bytes',encode(a.original,'base64'));
end $$;
create function public.rr_lease_step3_firstline_proofs()
returns table(archive_id uuid,file_name text,source_ref text,attachment_ref text,received_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from public.rr_lease_operators where carrier_user_id=actor and workspace_kind='carrier') then raise exception 'Carrier required' using errcode='42501';end if;
 return query select m.archive_id,m.file_name,m.source_ref,m.attachment_ref,m.received_at from rr_lease_private.step2c_mail_sources m where m.carrier_user_id=actor and m.part_id<>'@message' and m.archive_id is not null order by m.received_at desc limit 100;
end $$;
-- Assign an initially unmatched FirstLine event only to an exact invoice
-- previously claimed in this carrier, with a separately reviewed reason.
create function public.rr_lease_step3_match_firstline(p_event_id uuid,p_load_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e public.rr_lease_factoring_events; l public.rr_lease_loads; fresh boolean;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 select * into e from public.rr_lease_factoring_events where id=p_event_id and carrier_user_id=actor for update;
 if not found then raise exception 'Event unavailable' using errcode='42501';end if;
 select x.* into l from public.rr_lease_loads x join public.rr_lease_operators o on o.id=x.operator_id where x.id=p_load_id and o.carrier_user_id=actor and x.billing_channel='FIRSTLINE_FACTORED' for update of x;
 if not found then raise exception 'Load unavailable' using errcode='42501';end if;
 fresh:=rr_lease_private.step3_decide(actor,'FIRSTLINE_MATCH',e.id,jsonb_build_object('load',l.id),p_reason);
 if not fresh then return jsonb_build_object('eventId',e.id,'replay',true);end if;
 if e.review_status<>'PENDING_PROOF' or e.operator_id is not null or not exists(select 1 from public.rr_lease_factoring f where f.load_id=l.id and upper(btrim(f.invoice_no))=e.invoice_reference) then raise exception 'Exact unassigned invoice match required';end if;
 if e.reverses_id is not null or exists(select 1 from public.rr_lease_factoring_events z where z.reverses_id=e.id) then raise exception 'Linked reversal needs paired review';end if;
 update public.rr_lease_factoring_events set operator_id=l.operator_id,load_id=l.id where id=e.id;
 return jsonb_build_object('eventId',e.id,'loadId',l.id,'replay',false);
end $$;
create function public.rr_lease_step3_apply_weekly_cost(p_settlement_id uuid,p_kind text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); s public.rr_lease_settlements;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 select x.* into s from public.rr_lease_settlements x join public.rr_lease_operators o on o.id=x.operator_id where x.id=p_settlement_id and o.carrier_user_id=actor for update of x;
 if not found then raise exception 'Settlement unavailable' using errcode='42501';end if;
 if p_kind not in ('insurance','eld') or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Scheduled cost and evidence required';end if;
 return public.rr_lease_apply_weekly_cost(s.id,p_kind,btrim(p_reason));
end $$;
revoke all on function public.rr_lease_step3_verify_attachment(uuid,boolean,text),public.rr_lease_step3_intake_original(text,text),public.rr_lease_step3_firstline_proofs(),public.rr_lease_step3_match_firstline(uuid,uuid,text),public.rr_lease_step3_apply_weekly_cost(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_step3_verify_attachment(uuid,boolean,text),public.rr_lease_step3_intake_original(text,text),public.rr_lease_step3_firstline_proofs(),public.rr_lease_step3_match_firstline(uuid,uuid,text),public.rr_lease_step3_apply_weekly_cost(uuid,text,text) to authenticated;
