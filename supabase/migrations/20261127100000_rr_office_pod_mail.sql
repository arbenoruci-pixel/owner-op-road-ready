-- Office mail uses an opt-in independent of the driver's pilot-login configuration.
-- The singleton is empty at installation. Only the named Narta mailbox can be used.
begin;
set local lock_timeout = '4s';

create table rr_lease_private.pod_office_mail_transport (
  singleton boolean primary key default true check (singleton),
  project_ref text not null check (project_ref = 'ghwkcgczuwctzxsxmqzx'),
  carrier_user_id uuid not null references rr_lease_private.pod_workflow_carriers(carrier_user_id) on delete cascade,
  ticket_hash bytea,
  ticket_expires_at timestamptz,
  last_wake_at timestamptz,
  last_wake_error_at timestamptz
);
alter table rr_lease_private.pod_office_mail_transport enable row level security;
revoke all on rr_lease_private.pod_office_mail_transport from public, anon, authenticated, service_role;

create function rr_lease_private.pod_office_mail_carrier() returns uuid
language sql stable security invoker set search_path = '' as $$
  select t.carrier_user_id
    from rr_lease_private.pod_office_mail_transport t
    join auth.users u on u.id = t.carrier_user_id
    join rr_lease_private.operator_mail_sender s on s.singleton and s.sender_email = lower(u.email)
   where t.singleton and s.sender_email = 'nartaexpress@hotmail.com'
     and u.email_confirmed_at is not null and s.subject_id is not null and s.grant_id is not null
$$;

create function rr_lease_private.wake_pod_office_mail() returns void
language plpgsql security definer set search_path = '' as $$
declare
  carrier uuid := rr_lease_private.pod_office_mail_carrier();
  ticket text;
begin
  if carrier is null or not exists (
    select from rr_lease_private.pod_mail_outbox q where q.carrier_user_id = carrier
      and ((q.status in ('pending','retry') and q.available_at <= now())
        or (q.status in ('processing','sending') and q.lease_until <= now()))
  ) then return; end if;
  ticket := encode(extensions.gen_random_bytes(32),'hex');
  update rr_lease_private.pod_office_mail_transport
     set ticket_hash = extensions.digest(ticket,'sha256'), ticket_expires_at = now() + interval '60 seconds',
         last_wake_at = now()
   where singleton and carrier_user_id = carrier and (ticket_hash is null or ticket_expires_at <= now());
  if not found then return; end if;
  perform net.http_post(
    url := 'https://ghwkcgczuwctzxsxmqzx.supabase.co/functions/v1/rr-pod-notice-office',
    body := jsonb_build_object('ticket',ticket), timeout_milliseconds := 60000
  );
exception when others then
  -- Preserve the driver's committed document. The minute job retries the wake.
  update rr_lease_private.pod_office_mail_transport set last_wake_error_at = now() where singleton;
end $$;

create function rr_lease_private.on_pod_office_mail() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform rr_lease_private.wake_pod_office_mail(); return null; end
$$;
create trigger pod_office_mail_after_enqueue after insert on rr_lease_private.pod_mail_outbox
  for each statement execute function rr_lease_private.on_pod_office_mail();

create function public.rr_office_pod_consume_wake(p_ticket text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_ticket is null or p_ticket !~ '^[0-9a-f]{64}$' then return false; end if;
  update rr_lease_private.pod_office_mail_transport set ticket_hash = null, ticket_expires_at = null
   where singleton and carrier_user_id = rr_lease_private.pod_office_mail_carrier()
     and ticket_expires_at > now() and ticket_hash = extensions.digest(p_ticket,'sha256');
  return found;
end $$;

create function public.rr_office_pod_mail_claim() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  carrier uuid := rr_lease_private.pod_office_mail_carrier();
  job rr_lease_private.pod_mail_outbox;
  result jsonb;
begin
  if carrier is null then return null; end if;
  update rr_lease_private.pod_mail_outbox set status='review',claim_id=null,lease_until=null,
    reason='Sending timed out. Reconcile the exact message in Hotmail.',changed_at=clock_timestamp()
    where carrier_user_id=carrier and status='sending' and lease_until<=clock_timestamp();
  select q.* into job from rr_lease_private.pod_mail_outbox q
    where q.carrier_user_id=carrier and ((q.status in ('pending','retry') and q.available_at<=clock_timestamp())
      or (q.status='processing' and q.lease_until<=clock_timestamp()))
    order by q.available_at,q.received_at,q.document_id limit 1 for update of q skip locked;
  if not found then return null; end if;
  update rr_lease_private.pod_mail_outbox set status='processing',claim_id=gen_random_uuid(),
    lease_until=clock_timestamp()+interval '3 minutes',attempts=attempts+1,changed_at=clock_timestamp()
    where document_id=job.document_id returning * into job;
  select jsonb_build_object('document_id',job.document_id,'claim_id',job.claim_id,'load_id',l.id,
    'load_number',l.load_number,'broker',l.broker_name,'driver',o.driver_name,'carrier_user_id',o.carrier_user_id,
    'received_at',job.received_at,'addendum',job.addendum,'assigned_upload',job.assigned_upload)
    into strict result from public.rr_lease_loads l join public.rr_lease_operators o on o.id=l.operator_id
    where l.id=job.load_id and o.carrier_user_id=carrier;
  return result;
end $$;

create function public.rr_office_pod_mail_advance(p_document uuid,p_claim uuid,p_status text,p_reason text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  -- An in-flight send may still need its acknowledgement after transport is disabled.
  if not exists (
    select from rr_lease_private.pod_mail_outbox q join auth.users u on u.id=q.carrier_user_id
     where q.document_id=p_document and lower(u.email)='nartaexpress@hotmail.com'
       and (p_status<>'sending' or u.id=rr_lease_private.pod_office_mail_carrier())
  ) then return false; end if;
  return public.rr_pod_mail_advance(p_document,p_claim,p_status,p_reason);
end $$;

create function public.rr_office_pod_sender_grant() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('sender',s.sender_email,'subject',s.subject_id,
           'revision',s.revision,'refresh',v.decrypted_secret)
    from rr_lease_private.operator_mail_sender s join vault.decrypted_secrets v on v.id=s.grant_id
   where s.singleton and s.sender_email='nartaexpress@hotmail.com'
     and rr_lease_private.pod_office_mail_carrier() is not null
$$;

-- The production worker uses the carrier-scoped entry points above.
revoke execute on function public.rr_pod_mail_claim(),public.rr_pod_mail_advance(uuid,uuid,text,text) from service_role;
revoke all on function rr_lease_private.pod_office_mail_carrier(),rr_lease_private.wake_pod_office_mail(),
  rr_lease_private.on_pod_office_mail(),public.rr_office_pod_consume_wake(text),public.rr_office_pod_mail_claim(),
  public.rr_office_pod_mail_advance(uuid,uuid,text,text),public.rr_office_pod_sender_grant() from public,anon,authenticated,service_role;
grant execute on function public.rr_office_pod_consume_wake(text),public.rr_office_pod_mail_claim(),
  public.rr_office_pod_mail_advance(uuid,uuid,text,text),public.rr_office_pod_sender_grant() to service_role;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('rr-pod-office-mail','* * * * *','select rr_lease_private.wake_pod_office_mail()');
  end if;
end $$;
commit;
