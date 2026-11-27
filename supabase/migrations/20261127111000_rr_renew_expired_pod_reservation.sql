-- An open phone session can keep its selected PDF and original request key.
begin;
set local lock_timeout = '4s';
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
   if i.document_id is not null or i.created_at>=clock_timestamp()-interval '15 minutes' then
     return jsonb_build_object('uploadId',i.id,'maxBytes',3145728,'committed',i.document_id is not null);
   end if;
   -- Keep the expired upload ID, timestamp and quota history. Move only its
   -- client retry key so an authorized retry can reserve a fresh upload below.
   -- Any failed eligibility, quota or insert check rolls this update back.
   update rr_lease_private.step2b_upload_intents set request_id=gen_random_uuid() where id=i.id;
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
commit;
