-- Application inserts and their mail notifications commit together. This schema
-- is reserved for the delivery worker; it contains no applicant details.
create schema recruiting_mail;
revoke all on schema recruiting_mail from public, anon, authenticated, service_role;

create table recruiting_mail.outbox (
  application_id uuid primary key references public.road_ready_recruiting_applications(id) on delete cascade,
  queued_at timestamptz not null default now(),
  claim_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  sent_at timestamptz
);
revoke all on recruiting_mail.outbox from public, anon, authenticated, service_role;
alter table recruiting_mail.outbox enable row level security;
create index recruiting_mail_pending on recruiting_mail.outbox(queued_at) where sent_at is null;

create function recruiting_mail.enqueue() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into recruiting_mail.outbox(application_id) values (new.id);
  return new;
end;
$$;
revoke all on function recruiting_mail.enqueue() from public, anon, authenticated, service_role;
create trigger queue_recruiting_email after insert on public.road_ready_recruiting_applications
for each row execute function recruiting_mail.enqueue();

create function recruiting_mail.claim_next()
returns table (application_id uuid, claim_id uuid, attempts integer)
language sql security invoker set search_path = '' as $$
  with candidate as (
    select o.application_id from recruiting_mail.outbox o
    where o.sent_at is null and (o.lease_until is null or o.lease_until <= now())
    order by o.queued_at, o.application_id for update skip locked limit 1
  )
  update recruiting_mail.outbox o set claim_id = gen_random_uuid(),
    lease_until = now() + interval '10 minutes', attempts = o.attempts + 1
  from candidate c where o.application_id = c.application_id
  returning o.application_id, o.claim_id, o.attempts;
$$;
create function recruiting_mail.ack(p_application uuid, p_claim uuid) returns boolean
language sql security invoker set search_path = '' as $$
  with completed as (
    update recruiting_mail.outbox o set sent_at = now(), claim_id = null, lease_until = null
    where o.application_id = p_application and o.claim_id = p_claim and o.sent_at is null
    returning 1
  ) select exists(select 1 from completed);
$$;
revoke all on function recruiting_mail.claim_next(), recruiting_mail.ack(uuid,uuid)
from public, anon, authenticated, service_role;
