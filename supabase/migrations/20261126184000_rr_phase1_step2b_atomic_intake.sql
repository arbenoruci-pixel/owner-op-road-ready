-- STEP 2B: development only. Apply after the reviewed 2A migration.
-- All user mutations run in authenticated transactions. No client/service-role
-- split check/write, no writable upload table exposed to PostgREST.
create table rr_lease_private.step2b_upload_intents(
 id uuid primary key default gen_random_uuid(),
 actor uuid not null references auth.users(id),
 operator_id uuid not null references public.rr_lease_operators(id),
 request_id uuid not null,
 load_id uuid references public.rr_lease_loads(id),
 broker_name text, load_number text,
 file_name text not null, mime_type text not null, byte_size integer not null,
 created_at timestamptz not null default clock_timestamp(),
 document_id uuid references public.rr_lease_documents(id), digest text,
 result jsonb,
 unique(actor,request_id),
 check (byte_size between 1 and 3145728),
 check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 check ((document_id is null and digest is null and result is null) or
        (document_id is not null and digest is not null and result is not null)),
 check (load_id is not null or (broker_name is not null and load_number is not null))
);
create table rr_lease_private.step2b_pod_decisions(
 document_id uuid primary key references public.rr_lease_documents(id),
 carrier_user_id uuid not null references auth.users(id),
 decision text not null check(decision in ('APPROVE','REJECT')),
 set_as_final boolean not null,
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 decided_at timestamptz not null default clock_timestamp(),
 check(decision='APPROVE' or not set_as_final)
);
create table rr_lease_private.step2b_assignment_drafts(
 carrier_user_id uuid not null, source_ref text not null, attachment_ref text not null,
 operator_id uuid not null references public.rr_lease_operators(id),
 load_id uuid references public.rr_lease_loads(id),
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 kind text not null check(kind in ('fuel','ratecon','pod','bol','supporting','unknown')),
 accessorials jsonb,
 created_at timestamptz not null default clock_timestamp(),
 primary key(carrier_user_id,source_ref,attachment_ref),
 foreign key(carrier_user_id,source_ref,attachment_ref) references rr_lease_private.intake_review(carrier_user_id,source_ref,attachment_ref)
);
alter table rr_lease_private.step2b_upload_intents enable row level security;
alter table rr_lease_private.step2b_pod_decisions enable row level security;
alter table rr_lease_private.step2b_assignment_drafts enable row level security;
revoke all on rr_lease_private.step2b_upload_intents,rr_lease_private.step2b_pod_decisions,rr_lease_private.step2b_assignment_drafts from public,anon,authenticated,service_role;

-- Caller supplies resource selectors only. Identity comes exclusively from auth.uid().
-- Lock the actual operator row in the same transaction as every protected write.
create function public.rr_lease_step2b_create_upload(p_request_id uuid,p_load_id uuid,p_broker text,p_load_number text,p_file_name text,p_mime text,p_size integer)
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
   select * into o from public.rr_lease_operators where id=l.operator_id and driver_user_id=v_actor and workspace_kind='leased' for share;
   if not found then raise exception 'Upload unavailable' using errcode='42501'; end if;
   if p_broker is not null or p_load_number is not null then raise exception 'Use load selector or orphan reference' using errcode='22023'; end if;
 else
   select count(*) into n from public.rr_lease_operators where driver_user_id=v_actor and workspace_kind='leased';
   if n<>1 then raise exception 'An unambiguous driver workspace is required' using errcode='42501'; end if;
   select * into o from public.rr_lease_operators where driver_user_id=v_actor and workspace_kind='leased' for share;
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

create function rr_lease_private.step2b_magic(p_bytes bytea,p_mime text)
returns boolean language sql immutable set search_path='' as $$
 select case p_mime
 when 'application/pdf' then substring(p_bytes from 1 for 5)=decode('255044462d','hex')
 when 'image/jpeg' then substring(p_bytes from 1 for 3)=decode('ffd8ff','hex')
 when 'image/png' then substring(p_bytes from 1 for 8)=decode('89504e470d0a1a0a','hex')
 when 'image/webp' then substring(p_bytes from 1 for 4)=decode('52494646','hex') and substring(p_bytes from 9 for 4)=decode('57454250','hex')
 else false end
$$;

create function public.rr_lease_step2b_commit_upload(p_upload_id uuid,p_base64 text,p_sha256 text,p_mime text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); i rr_lease_private.step2b_upload_intents; o public.rr_lease_operators; l public.rr_lease_loads;
 d public.rr_lease_documents; v_load uuid; v_doc uuid; v_bytes bytea; v_hash text; v_result jsonb; v_part int; v_orphan boolean;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
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
 select * into o from public.rr_lease_operators where id=i.operator_id and driver_user_id=v_actor and workspace_kind='leased' for share;
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
-- Keep the existing registration function internal; direct callers cannot bypass
-- the atomic origin/membership verification or claim a pre-existing worker file.
revoke execute on function public.rr_lease_register_driver_pod(uuid) from authenticated,anon,service_role,public;

create function public.rr_lease_step2b_review_pod(p_document_id uuid,p_approve boolean,p_set_as_final boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); d public.rr_lease_documents; l public.rr_lease_loads; o public.rr_lease_operators; ev public.rr_lease_mail_events;
 z rr_lease_private.step2b_pod_decisions; v_decision text; v_result jsonb;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_approve is null or p_set_as_final is null or (not p_approve and p_set_as_final) or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Explicit review decision, final flag and reason required' using errcode='22023'; end if;
 select * into d from public.rr_lease_documents where id=p_document_id;
 if not found then raise exception 'POD unavailable' using errcode='42501'; end if;
 select * into strict l from public.rr_lease_loads where id=d.load_id for update;
 select * into o from public.rr_lease_operators where id=l.operator_id and carrier_user_id=v_actor for share;
 if not found then raise exception 'POD unavailable' using errcode='42501'; end if;
 select * into ev from public.rr_lease_mail_events where document_id=d.id and load_id=l.id and carrier_user_id=v_actor and source_kind='driver_upload' and sha256=d.sha256 for update;
 if not found or d.kind<>'pod' or not public.rr_lease_original_ready(d.id) then raise exception 'POD unavailable' using errcode='42501'; end if;
 perform rr_lease_private.step2a_assert_pod_review_open(l.id);
 v_decision:=case when p_approve then 'APPROVE' else 'REJECT' end;
 select * into z from rr_lease_private.step2b_pod_decisions where document_id=d.id;
 if found then
   if row(z.decision,z.set_as_final,z.reason) is distinct from row(v_decision,p_set_as_final,btrim(p_reason)) then raise exception 'Review already decided' using errcode='23505'; end if;
   return jsonb_build_object('documentId',d.id,'decision',z.decision,'setAsFinalPod',z.set_as_final,'finalPodId',l.final_pod_id,'eligible',rr_lease_private.phase1_load_eligible(l.id));
 end if;
 if p_approve and ev.rejected_at is not null then raise exception 'Rejected POD cannot be approved' using errcode='22023'; end if;
 if p_approve and not p_set_as_final and l.final_pod_id=d.id then raise exception 'Current final candidate cannot be classified intermediate; reject it first' using errcode='22023'; end if;
 if p_approve and p_set_as_final and l.final_pod_id is not null and l.final_pod_id<>d.id and not exists(select 1 from public.rr_lease_mail_events e where e.document_id=l.final_pod_id and e.load_id=l.id and e.source_kind='driver_upload' and e.rejected_at is not null) then raise exception 'A different final candidate already exists' using errcode='23505'; end if;
 insert into rr_lease_private.step2b_pod_decisions(document_id,carrier_user_id,decision,set_as_final,reason)
 values(d.id,v_actor,v_decision,p_set_as_final,btrim(p_reason));
 if not p_approve then
   v_result:=public.rr_lease_reject_driver_pod(d.id,p_reason);
 else
   if not d.is_current then raise exception 'Current POD required' using errcode='22023'; end if;
   if not ev.verified_for_billing then
     update public.rr_lease_mail_events set verified_for_billing=true,approved_by=v_actor,approved_at=clock_timestamp(),approval_reason=btrim(p_reason) where id=ev.id;
   end if;
   if p_set_as_final then
     update public.rr_lease_loads set final_pod_id=d.id where id=l.id and final_pod_id is distinct from d.id;
   end if;
 end if;
 select * into strict l from public.rr_lease_loads where id=l.id;
 return jsonb_build_object('documentId',d.id,'decision',v_decision,'setAsFinalPod',p_set_as_final,'finalPodId',l.final_pod_id,'eligible',rr_lease_private.phase1_load_eligible(l.id));
end $$;
-- Prevent bypassing the explicit role decision through the old two-argument RPCs.
revoke execute on function public.rr_lease_approve_driver_pod(uuid,text),public.rr_lease_reject_driver_pod(uuid,text) from authenticated,anon,service_role,public;

create function rr_lease_private.step2b_final_role_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.final_pod_id is distinct from old.final_pod_id and exists(select 1 from public.rr_lease_mail_events e where e.document_id=new.final_pod_id and e.source_kind='driver_upload')
 and not exists(select 1 from rr_lease_private.step2b_pod_decisions z join public.rr_lease_mail_events e on e.document_id=z.document_id where z.document_id=new.final_pod_id and z.decision='APPROVE' and z.set_as_final and e.verified_for_billing and e.rejected_at is null and e.load_id=new.id) then
   raise exception 'Explicit approved final POD required' using errcode='22023';
 end if;
 return new;
end $$;
create trigger rr_step2b_final_role_guard before update of final_pod_id on public.rr_lease_loads for each row execute function rr_lease_private.step2b_final_role_guard();

-- Direct table insert cannot bypass the final-only packet rule.
create function rr_lease_private.step2b_factoring_pods_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare l public.rr_lease_loads;
begin
 if tg_op='UPDATE' then
   if row(new.load_id,new.packet_id,new.ratecon_id,new.pod_ids,new.supporting_ids) is not distinct from row(old.load_id,old.packet_id,old.ratecon_id,old.pod_ids,old.supporting_ids) then return new; end if;
   raise exception 'Factoring packet identity is immutable';
 end if;
 select * into strict l from public.rr_lease_loads where id=new.load_id for update;
 if l.final_pod_id is null or new.pod_ids is distinct from array[l.final_pod_id]
 or not exists(select 1 from public.rr_lease_documents d join public.rr_lease_mail_events e on e.document_id=d.id where d.id=l.final_pod_id and d.load_id=l.id and d.kind='pod' and d.is_current and d.is_ready and e.verified_for_billing and e.rejected_at is null and (e.source_kind<>'driver_upload' or exists(select 1 from rr_lease_private.step2b_pod_decisions z where z.document_id=d.id and z.decision='APPROVE' and z.set_as_final)))
 or exists(select 1 from public.rr_lease_documents d where d.id=any(new.supporting_ids) and d.kind='pod') then raise exception 'Only approved final POD allowed in factoring packet'; end if;
 return new;
end $$;
create trigger rr_step2b_factoring_pods_guard before insert or update on public.rr_lease_factoring for each row execute function rr_lease_private.step2b_factoring_pods_guard();

create function rr_lease_private.step2b_prepare_itemized(p_load uuid,p_accessorials jsonb)
returns void language plpgsql set search_path='' as $$
declare l public.rr_lease_loads;
begin
 -- Classification is required even when all three flags are false.
 if jsonb_typeof(p_accessorials) is distinct from 'object'
 or jsonb_typeof(p_accessorials->'detention') is distinct from 'boolean'
 or jsonb_typeof(p_accessorials->'layover') is distinct from 'boolean'
 or jsonb_typeof(p_accessorials->'lumper') is distinct from 'boolean'
 or (p_accessorials-'detention'-'layover'-'lumper')<>'{}'::jsonb then raise exception 'Explicit detention, layover and lumper classification required' using errcode='22023'; end if;
 select * into strict l from public.rr_lease_loads where id=p_load for update;
 if (p_accessorials->>'detention')::boolean or (p_accessorials->>'layover')::boolean or (p_accessorials->>'lumper')::boolean then
   if l.ledger_mode='ITEMIZED' then return; end if;
   if l.status not in ('staging','assigned') or l.settlement_id is not null or exists(select 1 from public.rr_lease_ledger_entries e where e.load_id=l.id) or exists(select 1 from public.rr_lease_factoring f where f.load_id=l.id) then raise exception 'Existing financial history requires separate itemized review' using errcode='22023'; end if;
   update public.rr_lease_loads set ledger_mode='ITEMIZED' where id=l.id;
 end if;
end $$;
create function public.rr_lease_step2b_stage_ratecon(p_operator_id uuid,p_broker text,p_load_number text,p_accessorials jsonb)
returns uuid language plpgsql set search_path='' as $$
declare v_load uuid;
begin
 v_load:=public.rr_lease_stage_load(p_operator_id,p_broker,p_load_number);
 perform rr_lease_private.step2b_prepare_itemized(v_load,p_accessorials);
 return v_load;
end $$;
-- This is the trusted intake worker entry point; no authenticated/anonymous
-- client can stage a financial proposal for another operator.
revoke all on function public.rr_lease_step2b_stage_ratecon(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_step2b_stage_ratecon(uuid,text,text,jsonb) to service_role;

create function public.rr_lease_step2b_owner_inbox(p_limit integer default 50,p_before timestamptz default null)
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
 'amazon',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.id,a.amazon_trip_id,a.amazon_block_id,a.report_status,a.amount_cents,a.event_date,a.created_at
 from public.rr_lease_amazon_import_rows a where a.carrier_user_id=v_actor and a.operator_id is null and (p_before is null or a.created_at<p_before) order by a.created_at desc,a.id limit p_limit) x),'[]'::jsonb));
end $$;

create function public.rr_lease_step2b_assign_draft(p_source_ref text,p_attachment_ref text,p_operator_id uuid,p_load_id uuid,p_kind text,p_reason text,p_accessorials jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); r rr_lease_private.intake_review; o public.rr_lease_operators; l public.rr_lease_loads; a rr_lease_private.step2b_assignment_drafts;
begin
 if v_actor is null or not exists(select 1 from public.rr_lease_operators where carrier_user_id=v_actor and workspace_kind='carrier') then raise exception 'Carrier access required' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('fuel','ratecon','pod','bol','supporting','unknown') or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Kind and reason required' using errcode='22023'; end if;
 select * into r from rr_lease_private.intake_review where carrier_user_id=v_actor and source_ref=p_source_ref and attachment_ref=p_attachment_ref for update;
 if not found or r.resolved_at is not null then raise exception 'Intake unavailable' using errcode='42501'; end if;
 if p_load_id is not null then
   select * into l from public.rr_lease_loads where id=p_load_id and operator_id=p_operator_id for update;
   if not found then raise exception 'Assignment unavailable' using errcode='42501'; end if;
 end if;
 select * into o from public.rr_lease_operators where id=p_operator_id and carrier_user_id=v_actor for share;
 if not found then raise exception 'Assignment unavailable' using errcode='42501'; end if;
 if starts_with(r.source_ref,'driver_upload:') and not exists(select 1 from public.rr_lease_mail_events e join public.rr_lease_loads x on x.id=e.load_id where 'driver_upload:'||e.document_id::text=r.source_ref and e.sha256=r.attachment_ref and e.carrier_user_id=v_actor and x.operator_id=o.id and (p_load_id is null or p_load_id=x.id) and p_kind='pod') then raise exception 'Orphan POD cannot be transferred to another driver/load' using errcode='42501'; end if;
 if p_kind='ratecon' then
   if p_load_id is null then raise exception 'Select staged load for ratecon classification' using errcode='22023'; end if;
   perform rr_lease_private.step2b_prepare_itemized(l.id,p_accessorials);
 elsif p_accessorials is not null then raise exception 'Accessorial flags only apply to ratecon' using errcode='22023'; end if;
 select * into a from rr_lease_private.step2b_assignment_drafts where carrier_user_id=v_actor and source_ref=r.source_ref and attachment_ref=r.attachment_ref;
 if found then
   if row(a.operator_id,a.load_id,a.kind,a.reason,a.accessorials) is distinct from row(o.id,p_load_id,p_kind,btrim(p_reason),p_accessorials) then raise exception 'Assignment already proposed; explicit correction review required' using errcode='23505'; end if;
 else
   insert into rr_lease_private.step2b_assignment_drafts(carrier_user_id,source_ref,attachment_ref,operator_id,load_id,reason,kind,accessorials)
   values(v_actor,r.source_ref,r.attachment_ref,o.id,p_load_id,btrim(p_reason),p_kind,p_accessorials);
 end if;
 -- The original is still unresolved. No ledger write, amount, or payment.
 return jsonb_build_object('status','MATCHED_DRAFT','operatorId',o.id,'loadId',p_load_id,'postAllowed',false,'resolved',false);
end $$;

revoke all on function public.rr_lease_step2b_create_upload(uuid,uuid,text,text,text,text,integer),public.rr_lease_step2b_commit_upload(uuid,text,text,text),public.rr_lease_step2b_review_pod(uuid,boolean,boolean,text),public.rr_lease_step2b_owner_inbox(integer,timestamptz),public.rr_lease_step2b_assign_draft(text,text,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_step2b_create_upload(uuid,uuid,text,text,text,text,integer),public.rr_lease_step2b_commit_upload(uuid,text,text,text),public.rr_lease_step2b_review_pod(uuid,boolean,boolean,text),public.rr_lease_step2b_owner_inbox(integer,timestamptz),public.rr_lease_step2b_assign_draft(text,text,uuid,uuid,text,text,jsonb) to authenticated;
revoke all on function rr_lease_private.step2b_magic(bytea,text),rr_lease_private.step2b_prepare_itemized(uuid,jsonb),rr_lease_private.step2b_final_role_guard(),rr_lease_private.step2b_factoring_pods_guard() from public,anon,authenticated,service_role;
grant execute on function rr_lease_private.step2b_prepare_itemized(uuid,jsonb) to service_role;
-- eligibility is invoked by service_role and security definer review.
grant select on rr_lease_private.step2b_pod_decisions to service_role;
create policy rr_step2b_service_decisions on rr_lease_private.step2b_pod_decisions for select to service_role using(true);

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
 else l.status in ('delivered','closed') and l.actual_delivery_date is not null and exists(select 1 from public.rr_lease_documents d join public.rr_lease_mail_events m on m.document_id=d.id and m.load_id=l.id where d.id=l.final_pod_id and d.load_id=l.id and d.kind='pod' and d.is_ready and m.verified_for_billing and m.sha256=d.sha256 and exists(select 1 from public.rr_lease_operators o where o.id=l.operator_id and o.carrier_user_id=m.carrier_user_id and (m.source_kind in ('email','owner_upload') or (m.source_kind='driver_upload' and m.approved_by=o.carrier_user_id and m.approved_at is not null and exists(select 1 from rr_lease_private.step2b_pod_decisions z where z.document_id=d.id and z.decision='APPROVE' and z.set_as_final)))))
 and exists(select 1 from public.rr_lease_documents d join public.rr_lease_mail_events m on m.document_id=d.id and m.load_id=l.id where d.load_id=l.id and d.kind='ratecon' and d.is_ready and d.is_current and m.verified_for_billing)
 end from public.rr_lease_loads l where l.id=p_load),false)
$function$;

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
      where e.load_id=l.id and e.rejected_at is null and (e.source_kind<>'driver_upload' or exists(select 1 from rr_lease_private.step2b_pod_decisions z where z.document_id=d.id and z.decision='APPROVE' and z.set_as_final)) and e.sha256=d.sha256 and d.load_id=l.id and d.id=p_final_pod_id and d.kind='pod' and (d.is_current or d.id=l.final_pod_id) and d.is_ready)
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

CREATE OR REPLACE FUNCTION public.rr_lease_claim_factoring(p_load_id uuid, p_packet_id uuid, p_invoice_no text, p_amount_cents bigint, p_ratecon_id uuid, p_pod_ids uuid[], p_supporting_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  select array_agg(d0.id order by d0.id) into allowed_pods from public.rr_lease_documents d0 join public.rr_lease_mail_events ev on ev.document_id=d0.id where d0.load_id=l.id and d0.kind='pod' and d0.is_current and d0.id=l.final_pod_id and ev.verified_for_billing and ev.rejected_at is null and (ev.source_kind<>'driver_upload' or exists(select 1 from rr_lease_private.step2b_pod_decisions z where z.document_id=d0.id and z.decision='APPROVE' and z.set_as_final));
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
end $function$;

CREATE OR REPLACE FUNCTION public.rr_lease_apply_intake(p_document_id uuid, p_source_kind text, p_message_id text, p_sender_email text, p_evidence text, p_fields jsonb DEFAULT '{}'::jsonb, p_previous_ratecon_id uuid DEFAULT NULL::uuid, p_verified_for_billing boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    perform rr_lease_private.step2b_prepare_itemized(l.id,p_fields->'accessorials');
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
end $function$;
