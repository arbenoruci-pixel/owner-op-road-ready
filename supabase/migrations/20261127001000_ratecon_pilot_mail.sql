-- A carrier opt-in is required for one specific training original and driver.
-- Receipts and simulated broker packets both go to the verified sender's own mailbox.
create table rr_lease_private.ratecon_pilot_authority (
 document_id uuid primary key references public.rr_lease_documents(id),
 driver_id uuid not null references auth.users(id), carrier_id uuid not null references auth.users(id),
 original_sha text not null check(length(original_sha)=64),
 carrier_name text not null, authorized_signer text not null, 
 driver_phone text, truck_number text, trailer_number text,
 authorized_at timestamptz not null default now()
);
create table rr_lease_private.ratecon_pilot_mail (
 document_id uuid references rr_lease_private.ratecon_pilot_authority,
 stage text check(stage in ('notice','packet')), primary key(document_id,stage),
 status text not null check(status in ('queued','processing','sending','accepted','review')),
 ticket_hash bytea, request_id bigint, signed_pdf bytea, updated_at timestamptz not null default now()
);
alter table rr_lease_private.ratecon_pilot_authority enable row level security;
alter table rr_lease_private.ratecon_pilot_mail enable row level security;
revoke all on rr_lease_private.ratecon_pilot_authority,rr_lease_private.ratecon_pilot_mail from public,anon,authenticated;

create function rr_lease_private.queue_ratecon_pilot(p_document uuid,p_stage text) returns void
language plpgsql security definer set search_path='' as $$
declare ticket text := encode(extensions.gen_random_bytes(32),'hex'); rid bigint;
begin
 if not exists(select 1 from rr_lease_private.ratecon_pilot_authority p
   join rr_lease_private.ratecon_test_acceptances a on a.document_id=p.document_id and a.driver_id=p.driver_id and a.sha256=p.original_sha
   join public.rr_lease_documents d on d.id=a.document_id and d.sha256=a.sha256 and d.kind='ratecon' and d.is_current and d.is_ready
   join rr_lease_private.ratecon_test_loads t on t.load_id=d.load_id
   join public.rr_lease_loads l on l.id=t.load_id and l.broker_name='RoadReady Training' and l.load_number like 'TEST-%'
   join public.rr_lease_operators o on o.id=l.operator_id and o.driver_user_id=p.driver_id and o.carrier_user_id=p.carrier_id
   where p.document_id=p_document) then return; end if;
 if p_stage='packet' and not exists(select 1 from rr_lease_private.ratecon_pilot_mail
    where document_id=p_document and stage='notice' and status='accepted') then return; end if;
 insert into rr_lease_private.ratecon_pilot_mail(document_id,stage,status,ticket_hash)
  values(p_document,p_stage,'queued',extensions.digest(ticket,'sha256')) on conflict do nothing;
 if not found then return; end if;
 rid:=net.http_post(url:='https://ghwkcgczuwctzxsxmqzx.supabase.co/functions/v1/rr-ratecon-pilot-mail',
  body:=jsonb_build_object('document',p_document,'stage',p_stage,'ticket',ticket),timeout_milliseconds:=30000);
 update rr_lease_private.ratecon_pilot_mail set request_id=rid where document_id=p_document and stage=p_stage;
end $$;
create function rr_lease_private.on_ratecon_pilot() returns trigger language plpgsql security definer set search_path='' as $$
begin perform rr_lease_private.queue_ratecon_pilot(new.document_id,'notice');return new;end $$;
create trigger pilot_acceptance_notice after insert on rr_lease_private.ratecon_test_acceptances
 for each row execute function rr_lease_private.on_ratecon_pilot();
create trigger pilot_authority_notice after insert on rr_lease_private.ratecon_pilot_authority
 for each row execute function rr_lease_private.on_ratecon_pilot();
revoke all on function rr_lease_private.queue_ratecon_pilot(uuid,text),rr_lease_private.on_ratecon_pilot() from public,anon,authenticated;

create function public.rr_ratecon_pilot_claim(p_document uuid,p_stage text,p_ticket text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job jsonb;
begin
 update rr_lease_private.ratecon_pilot_mail set status='processing',ticket_hash=null,updated_at=now()
 where document_id=p_document and stage=p_stage and status='queued' and ticket_hash=extensions.digest(p_ticket,'sha256');
 if not found then return null;end if;
 select jsonb_build_object('load',l.load_number,'revision',d.revision,'sha',d.sha256,'signer',p.authorized_signer,
  'carrier',p.carrier_name,'driver',a.signer,'accepted_at',a.accepted_at,'phone',p.driver_phone,'truck',p.truck_number,
  'trailer',p.trailer_number,'pilot',u.email,'mail',c.email,
  'original',case when p_stage='packet' then (select encode(string_agg(bytes,''::bytea order by chunk_index),'base64')
  from rr_lease_private.document_chunks where document_id=d.id) end) into job
 from rr_lease_private.ratecon_pilot_authority p
 join rr_lease_private.ratecon_test_acceptances a on a.document_id=p.document_id and a.driver_id=p.driver_id and a.sha256=p.original_sha
 join public.rr_lease_documents d on d.id=a.document_id and d.sha256=a.sha256 and d.kind='ratecon' and d.is_current and d.is_ready and d.storage_backend='database' and d.byte_size between 1 and 1500000
 join rr_lease_private.ratecon_test_loads t on t.load_id=d.load_id
 join public.rr_lease_loads l on l.id=t.load_id and l.broker_name='RoadReady Training' and l.load_number like 'TEST-%'
 join public.rr_lease_operators o on o.id=l.operator_id and o.driver_user_id=p.driver_id and o.carrier_user_id=p.carrier_id
 join auth.users u on u.id=o.driver_user_id join auth.users c on c.id=o.carrier_user_id
 join rr_lease_private.operator_mail_sender m on m.singleton and m.pilot_email=lower(u.email) and m.sender_email=lower(c.email)
 where p.document_id=p_document;
 if job is null then update rr_lease_private.ratecon_pilot_mail set status='review' where document_id=p_document and stage=p_stage;end if;
 return job;
end $$;
create function public.rr_ratecon_pilot_advance(p_document uuid,p_stage text,p_status text,p_pdf text default null)
 returns boolean language plpgsql security definer set search_path='' as $$
begin
 update rr_lease_private.ratecon_pilot_mail set status=p_status,updated_at=now(),
   signed_pdf=case when p_pdf is not null then decode(p_pdf,'base64') else signed_pdf end
 where document_id=p_document and stage=p_stage and
  ((status='processing' and p_status='sending' and (stage='notice' or p_pdf is not null))
   or (status='sending' and p_status='accepted') or (status in ('sending','processing') and p_status='review'));
 if not found then return false; end if;
 if p_stage='notice' and p_status='accepted' then perform rr_lease_private.queue_ratecon_pilot(p_document,'packet');end if;
 return true;
end $$;
revoke all on function public.rr_ratecon_pilot_claim(uuid,text,text),public.rr_ratecon_pilot_advance(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.rr_ratecon_pilot_claim(uuid,text,text),public.rr_ratecon_pilot_advance(uuid,text,text,text) to service_role;
