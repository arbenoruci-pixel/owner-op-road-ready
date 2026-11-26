-- Phase 1 Step 3 audit follow-up: OTR TONU with independent cancellation evidence.
-- Development only. Never writes HOS, logbook, Phase 2, payments or factoring sends.
-- The verified cancellation replaces the quoted freight value only for a never
-- allocated, undelivered load. Preserve quoted amount and frozen fee in the
-- immutable decision. No reopening/rewriting any existing financial history.
create function public.rr_lease_step3_approve_tonu(p_load_id uuid,p_document_id uuid,p_amount_cents bigint,p_cancelled_at timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); l public.rr_lease_loads; o public.rr_lease_operators; d public.rr_lease_documents;
 src rr_lease_private.step2c_mail_sources; r rr_lease_private.intake_review; e public.rr_lease_mail_events;
 prior rr_lease_private.step3_decisions; payload jsonb; req jsonb; st uuid; wk date; sw date; ss text; fresh boolean;
 entry public.rr_lease_ledger_entries;
begin
 perform rr_lease_private.step2c_lock_carrier(actor);
 select x.* into l from public.rr_lease_loads x join public.rr_lease_operators op on op.id=x.operator_id where x.id=p_load_id and op.carrier_user_id=actor for update of x;
 if not found then raise exception 'Load unavailable' using errcode='42501';end if;
 select * into strict o from public.rr_lease_operators where id=l.operator_id and carrier_user_id=actor for share;
 if p_amount_cents is null or p_amount_cents not between 1 and 100000000000 or p_cancelled_at is null or not isfinite(p_cancelled_at)
 or p_cancelled_at>clock_timestamp() or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Exact positive confirmed TONU, actual cancellation time and reason required' using errcode='22023';end if;
 req:=jsonb_build_object('document',p_document_id,'amount',p_amount_cents,'cancelled_at',p_cancelled_at);
 select * into prior from rr_lease_private.step3_decisions where carrier_user_id=actor and kind='OTR_TONU' and entity_id=l.id;
 if found then
  if prior.payload->'request' is distinct from req or prior.reason<>btrim(p_reason) then raise exception 'TONU already decided; separate correction required' using errcode='23505';end if;
  return jsonb_build_object('loadId',l.id,'settlementId',l.settlement_id,'amountCents',l.gross_cents,'feeBps',l.fee_bps,'replay',true);
 end if;
 if l.billing_channel<>'FIRSTLINE_FACTORED' or l.load_type<>'FREIGHT' or l.status not in ('assigned','picked_up') or l.actual_delivery_date is not null or l.final_pod_id is not null or l.settlement_id is not null
 or exists(select 1 from public.rr_lease_ledger_entries z where z.load_id=l.id)
 or exists(select 1 from public.rr_lease_factoring z where z.load_id=l.id)
 or exists(select 1 from public.rr_lease_mail_events z where z.load_id=l.id and z.source_kind='driver_upload' and z.rejected_at is null)
 or exists(select 1 from public.rr_lease_documents z join public.rr_lease_mail_events m on m.document_id=z.id where z.load_id=l.id and z.kind='pod' and m.verified_for_billing)
 then raise exception 'Only never-allocated undelivered OTR freight without unresolved delivery proof can become TONU';end if;
 if l.gross_cents is null or not exists(select 1 from public.rr_lease_documents z join public.rr_lease_mail_events m on m.document_id=z.id where z.load_id=l.id and z.kind='ratecon' and z.is_current and z.is_ready and m.load_id=l.id and m.carrier_user_id=actor and m.verified_for_billing and m.sha256=z.sha256) then raise exception 'Verify original freight rate and frozen terms first';end if;
 -- The cancellation is a DIFFERENT independently filed supporting original,
 -- not a rate confirmation or POD, and not a free-form evidence string.
 select * into d from public.rr_lease_documents where id=p_document_id and load_id=l.id and kind='supporting' and is_ready;
 if not found or not public.rr_lease_original_ready(d.id) then raise exception 'Archived cancellation original required' using errcode='22023';end if;
 select q.* into r from rr_lease_private.intake_review q join rr_lease_private.step2c_assignment_execution ex using(carrier_user_id,source_ref,attachment_ref) where q.carrier_user_id=actor and q.load_document_id=d.id and q.resolved_at is not null and ex.result->>'documentId'=d.id::text order by q.created_at limit 1;
 if not found then raise exception 'File cancellation attachment through owner intake first';end if;
 select * into strict src from rr_lease_private.step2c_mail_sources where carrier_user_id=actor and source_ref=r.source_ref and attachment_ref=r.attachment_ref;
 if not exists(select 1 from rr_lease_private.step2c_archives a where a.id=src.archive_id and a.carrier_user_id=actor and a.sha256=d.sha256 and a.kind='email' and a.format='attachment') then raise exception 'Cancellation archive checksum mismatch';end if;
 if p_cancelled_at>src.received_at then raise exception 'Cancellation date cannot be later than its received confirmation';end if;
 select * into e from public.rr_lease_mail_events where document_id=d.id;
 if not found then
  perform public.rr_lease_step3_verify_attachment(d.id,false,'TONU cancellation reviewed: '||left(btrim(p_reason),960));
 end if;
 if not exists(select 1 from public.rr_lease_mail_events m join public.rr_lease_documents z on z.id=m.document_id where m.document_id=d.id and m.load_id=l.id and m.carrier_user_id=actor and m.source_kind in ('email','owner_upload') and m.verified_for_billing and m.rejected_at is null and m.sha256=d.sha256 and z.is_ready and z.is_current) then raise exception 'Cancellation original not verified';end if;
 payload:=jsonb_build_object('request',req,'priorGrossCents',l.gross_cents,'priorLedgerMode',l.ledger_mode,'feeBps',l.fee_bps,'sha256',d.sha256);
 fresh:=rr_lease_private.step3_decide(actor,'OTR_TONU',l.id,payload,p_reason);
 if not fresh then raise exception 'Unexpected concurrent TONU decision';end if;
 sw:=date_trunc('week',p_cancelled_at at time zone 'America/Chicago')::date;wk:=sw;
 if o.workspace_kind='leased' then
  loop
   insert into public.rr_lease_settlements(operator_id,week_start) values(o.id,wk) on conflict(operator_id,week_start) do nothing;
   select s.id,s.status into strict st,ss from public.rr_lease_settlements s where s.operator_id=o.id and s.week_start=wk for update;
   exit when ss='draft';wk:=greatest(wk+7,date_trunc('week',now() at time zone 'America/Chicago')::date);
  end loop;
 end if;
 -- ITEMIZED means there is one explicit owner-approved TONU posting, never a
 -- duplicate automatic freight projection. Own haul is revenue, no contractor settlement.
 update public.rr_lease_loads set load_type='TONU',status='cancelled',cancelled_at=p_cancelled_at,tonu_confirmation_id=d.id,gross_cents=p_amount_cents,ledger_mode='ITEMIZED',settlement_id=st where id=l.id returning * into l;
 if not rr_lease_private.phase1_load_eligible(l.id) then raise exception 'TONU eligibility failed';end if;
 if st is not null then
  insert into public.rr_lease_ledger_entries(operator_id,settlement_id,load_id,source_kind,entry_type,amount_cents,fee_bps,paid_by,status,description,source_document_id,approved_by,idempotency_key)
  values(l.operator_id,st,l.id,'MANUAL','TONU',p_amount_cents,l.fee_bps,'carrier','POSTED','TONU · '||l.broker_name||' · '||l.load_number,d.id,actor,'step3:tonu:'||l.id::text)
  returning * into entry;
 end if;
 return jsonb_build_object('loadId',l.id,'settlementId',st,'serviceWeek',sw,'amountCents',p_amount_cents,'feeBps',l.fee_bps,'driverEffectCents',entry.driver_effect_cents,'replay',false);
end $$;
revoke all on function public.rr_lease_step3_approve_tonu(uuid,uuid,bigint,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_step3_approve_tonu(uuid,uuid,bigint,timestamptz,text) to authenticated;
