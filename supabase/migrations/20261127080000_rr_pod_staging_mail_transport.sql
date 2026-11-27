-- Transport is inactive until an administrator configures the isolated staging project.
-- The private outbox remains authoritative if the HTTP wake-up or mail provider is unavailable.
create table rr_lease_private.pod_staging_mail_transport (
  singleton boolean primary key default true check (singleton),
  project_ref text not null check (project_ref ~ '^[a-z0-9]{20}$' and project_ref <> 'ghwkcgczuwctzxsxmqzx'),
  ticket_hash bytea,
  ticket_expires_at timestamptz,
  last_wake_at timestamptz,
  last_wake_error_at timestamptz
);
alter table rr_lease_private.pod_staging_mail_transport enable row level security;
revoke all on rr_lease_private.pod_staging_mail_transport from public, anon, authenticated, service_role;

create function rr_lease_private.wake_pod_staging_mail() returns void
language plpgsql security definer set search_path = '' as $$
declare
  endpoint_ref text;
  ticket text;
begin
  if not exists (select 1 from rr_lease_private.pod_staging_mail_transport) then return; end if;
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
$$;
create function rr_lease_private.on_pod_staging_mail() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform rr_lease_private.wake_pod_staging_mail(); return null; end
$$;
create trigger pod_mail_after_enqueue after insert on rr_lease_private.pod_mail_outbox
  for each statement execute function rr_lease_private.on_pod_staging_mail();

create function public.rr_pod_mail_consume_wake(p_ticket text, p_project_ref text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_ticket is null or p_ticket !~ '^[0-9a-f]{64}$' then return false; end if;
  update rr_lease_private.pod_staging_mail_transport set ticket_hash=null, ticket_expires_at=null
   where singleton and project_ref=p_project_ref and ticket_expires_at>now()
     and ticket_hash=extensions.digest(p_ticket,'sha256');
  return found;
end
$$;

-- Use only the self-mail grant explicitly connected in this staging database.
-- Its pilot login address, if any, is unrelated to POD delivery.
create function public.rr_pod_mail_sender_grant() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('sender',s.sender_email,'subject',s.subject_id,
           'revision',s.revision,'refresh',v.decrypted_secret)
    from rr_lease_private.operator_mail_sender s
    join vault.decrypted_secrets v on v.id=s.grant_id
   where s.singleton and s.sender_email='nartaexpress@hotmail.com' and s.subject_id is not null
     and exists (select 1 from rr_lease_private.pod_staging_mail_transport)
$$;
revoke all on function rr_lease_private.wake_pod_staging_mail(),rr_lease_private.on_pod_staging_mail(),
  public.rr_pod_mail_consume_wake(text,text),public.rr_pod_mail_sender_grant() from public,anon,authenticated,service_role;
grant execute on function public.rr_pod_mail_consume_wake(text,text),public.rr_pod_mail_sender_grant() to service_role;

-- The release already installs pg_cron. Local stripped-down PostgreSQL fixtures can explicitly call the wake function.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('rr-pod-staging-mail','* * * * *','select rr_lease_private.wake_pod_staging_mail()');
  end if;
end
$$;
