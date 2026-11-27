-- Pending PODs stay queued until the staging carrier completes Hotmail consent.
create function rr_lease_private.pod_staging_sender_connected() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from rr_lease_private.operator_mail_sender
     where singleton and sender_email = 'nartaexpress@hotmail.com'
       and pilot_email = 'nartaexpress@hotmail.com'
       and subject_id is not null and grant_id is not null
  );
$$;
revoke all on function rr_lease_private.pod_staging_sender_connected() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION rr_lease_private.wake_pod_staging_mail()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  endpoint_ref text;
  ticket text;
begin
  if not exists (select 1 from rr_lease_private.pod_staging_mail_transport) then return; end if;
  if not rr_lease_private.pod_staging_sender_connected() then return; end if;
  if not exists (
    select 1 from rr_lease_private.pod_mail_outbox q
    join rr_lease_private.pod_workflow_carriers o on o.carrier_user_id = q.carrier_user_id
    where (q.status in ('pending','retry') and q.available_at <= now())
       or (q.status in ('processing','sending') and q.lease_until <= now())
  ) then return; end if;

  ticket := encode(extensions.gen_random_bytes(32),'hex');
  update rr_lease_private.pod_staging_mail_transport
     set ticket_hash = extensions.digest(ticket,'sha256'), ticket_expires_at = now() + interval '60 seconds',
         last_wake_at = now()
   where singleton and (ticket_hash is null or ticket_expires_at <= now())
   returning project_ref into endpoint_ref;
  if not found then return; end if;

  -- pg_net dispatches only after commit. The request contains no document, service key or mail grant.
  perform net.http_post(
    url := 'https://' || endpoint_ref || '.supabase.co/functions/v1/rr-pod-notice',
    body := jsonb_build_object('ticket',ticket), timeout_milliseconds := 60000
  );
exception when others then
  -- An enqueue problem must never roll back an accepted POD or its billing work.
  update rr_lease_private.pod_staging_mail_transport set last_wake_error_at = now() where singleton;
end
$function$;

CREATE OR REPLACE FUNCTION public.rr_pod_mail_claim()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job rr_lease_private.pod_mail_outbox; result jsonb;
begin
  -- An external request may already have succeeded; expired sends never re-enter
  -- the automatic retry path without a verified mailbox/provider outcome.
  update rr_lease_private.pod_mail_outbox set status='review',claim_id=null,lease_until=null,
    reason='Sending timed out. Reconcile the exact message in Hotmail.',changed_at=clock_timestamp()
    where status='sending' and lease_until<=clock_timestamp();
  -- A staging wake ticket may have been issued before a sender disconnected.
  if exists (select 1 from rr_lease_private.pod_staging_mail_transport)
      and not rr_lease_private.pod_staging_sender_connected() then
    return null;
  end if;
  select q.* into job from rr_lease_private.pod_mail_outbox q
    join rr_lease_private.pod_workflow_carriers c on c.carrier_user_id=q.carrier_user_id
    where (q.status in ('pending','retry') and q.available_at<=clock_timestamp())
       or (q.status='processing' and q.lease_until<=clock_timestamp())
    order by q.available_at,q.received_at,q.document_id limit 1 for update of q skip locked;
  if not found then return null; end if;
  update rr_lease_private.pod_mail_outbox set status='processing',claim_id=gen_random_uuid(),
    lease_until=clock_timestamp()+interval '3 minutes',attempts=attempts+1,changed_at=clock_timestamp()
    where document_id=job.document_id returning * into job;
  select jsonb_build_object('document_id',job.document_id,'claim_id',job.claim_id,'load_id',l.id,
    'load_number',l.load_number,'broker',l.broker_name,'driver',o.driver_name,'carrier_user_id',o.carrier_user_id,
    'received_at',job.received_at,'addendum',job.addendum,'assigned_upload',job.assigned_upload)
    into strict result from public.rr_lease_loads l join public.rr_lease_operators o on o.id=l.operator_id
    where l.id=job.load_id and o.carrier_user_id=job.carrier_user_id;
  return result;
end $function$;
