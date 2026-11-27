-- Receive a pending original for an enrolled carrier's explicitly assigned
-- freight before the broker's price is verified. No historical rows change.
begin;
set local lock_timeout = '4s';
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
 if v_orphan and (l.gross_cents is not null or l.settlement_id is not null) then
   -- The driver selected the office's existing assignment. Its unverified rate
   -- blocks billing, while its original POD can already wait for office review.
   if i.load_id is null or l.settlement_id is not null or not exists (
     select from rr_lease_private.pod_workflow_carriers c where c.carrier_user_id=o.carrier_user_id
   ) then
     raise exception 'Unverified financial load requires carrier review' using errcode='22023';
   end if;
   v_orphan:=false;
 end if;
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
commit;
