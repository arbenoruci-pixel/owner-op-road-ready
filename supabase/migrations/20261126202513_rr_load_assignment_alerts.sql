create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table rr_lease_private.load_push_devices (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.rr_lease_operators(id) on delete cascade,
  driver_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null
);
create index load_push_operator on rr_lease_private.load_push_devices(operator_id,driver_id);
create table rr_lease_private.load_push_queue (
  id bigint generated always as identity primary key,
  device_id uuid not null references rr_lease_private.load_push_devices(id) on delete cascade,
  load_id uuid not null references public.rr_lease_loads(id) on delete cascade,
  due_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  attempts int not null default 0,
  lease uuid,
  done_at timestamptz,
  result text,
  unique(device_id,load_id)
);
create index load_push_due on rr_lease_private.load_push_queue(due_at) where done_at is null;
alter table rr_lease_private.load_push_devices enable row level security;
alter table rr_lease_private.load_push_queue enable row level security;
revoke all on rr_lease_private.load_push_devices, rr_lease_private.load_push_queue from public, anon, authenticated;

create function public.rr_load_push_subscribe(p_operator uuid,p_subscription jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  driver uuid:=auth.uid();
  dest text:=p_subscription->>'endpoint';
  dh text:=p_subscription#>>'{keys,p256dh}';
  secret text:=p_subscription#>>'{keys,auth}';
begin
  if driver is null or not exists(select 1 from public.rr_lease_operators where id=p_operator and workspace_kind='leased' and driver_user_id=driver)
    then raise exception 'Sign in as the assigned driver' using errcode='42501'; end if;
  if dest is null or length(dest)>2048 or dest !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)+notify\.windows\.com)/[^[:space:]#]+$'
     or dh is null or dh !~ '^[A-Za-z0-9_-]{87}$' or secret is null or secret !~ '^[A-Za-z0-9_-]{22}$'
    then raise exception 'Unsupported push subscription'; end if;
  insert into rr_lease_private.load_push_devices as d(operator_id,driver_id,endpoint,p256dh,auth_key)
    values(p_operator,driver,dest,dh,secret)
    on conflict(endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key
      where d.driver_id=driver and d.operator_id=p_operator;
  if not found then raise exception 'Turn off load alerts on the previous account first'; end if;
end $$;

create function public.rr_load_push_unsubscribe(p_endpoint text)
returns void language sql security definer set search_path='' as $$
  delete from rr_lease_private.load_push_devices where driver_id=(select auth.uid()) and endpoint=p_endpoint;
$$;

create function rr_lease_private.queue_load_push()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status not in ('assigned','picked_up') then return new; end if;
  if tg_op='UPDATE' and old.status<>'staging' then return new; end if;
  insert into rr_lease_private.load_push_queue(device_id,load_id)
    select d.id,new.id from rr_lease_private.load_push_devices d join public.rr_lease_operators o
      on o.id=d.operator_id and o.driver_user_id=d.driver_id
      where o.id=new.operator_id and o.workspace_kind='leased'
    on conflict(device_id,load_id) do nothing;
  return new;
end $$;
create trigger rr_load_assignment_alert after insert or update of status on public.rr_lease_loads
  for each row execute function rr_lease_private.queue_load_push();

do $$ begin
  perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'rr_load_push_wake');
end $$;

create function public.rr_load_push_public_key()
returns text language sql stable security definer set search_path='' as $$
  select decrypted_secret::jsonb->>'publicKey' from vault.decrypted_secrets where name='rr_load_push_vapid';
$$;

create function public.rr_load_push_worker_config(p_token text,p_new_keys jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare keys jsonb;
begin
  if p_token is null or not exists(select 1 from vault.decrypted_secrets where name='rr_load_push_wake' and decrypted_secret=p_token)
    then raise exception 'Worker authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rr_load_push_vapid',0));
  select decrypted_secret::jsonb into keys from vault.decrypted_secrets where name='rr_load_push_vapid';
  if keys is null then
    if coalesce(p_new_keys->>'publicKey','') !~ '^[A-Za-z0-9_-]{87}$' or coalesce(p_new_keys->>'privateKey','') !~ '^[A-Za-z0-9_-]{43}$'
      then raise exception 'Invalid signing key'; end if;
    keys:=jsonb_build_object('publicKey',p_new_keys->>'publicKey','privateKey',p_new_keys->>'privateKey');
    perform vault.create_secret(keys::text,'rr_load_push_vapid');
  end if;
  return keys;
end $$;

create function public.rr_load_push_claim()
returns table(job bigint, token uuid, load_id uuid, endpoint text, p256dh text, auth_key text)
language sql security definer set search_path='' as $$
  with batch as materialized (
    select q.id from rr_lease_private.load_push_queue q join rr_lease_private.load_push_devices d on d.id=q.device_id
      join public.rr_lease_loads l on l.id=q.load_id and l.operator_id=d.operator_id
      join public.rr_lease_operators o on o.id=d.operator_id and o.driver_user_id=d.driver_id and o.workspace_kind='leased'
    where q.done_at is null and q.due_at<=now() and q.created_at>now()-interval '1 day'
      and l.status in ('assigned','picked_up') and q.attempts<8
    order by q.due_at,q.id for update of q skip locked limit 20
  ), claimed as (
    update rr_lease_private.load_push_queue q set lease=gen_random_uuid(),due_at=now()+interval '2 minutes', attempts=attempts+1
    from batch where q.id=batch.id returning q.*
  )
  select c.id,c.lease,c.load_id,d.endpoint,d.p256dh,d.auth_key from claimed c join rr_lease_private.load_push_devices d on d.id=c.device_id;
$$;

create function public.rr_load_push_finish(p_job bigint,p_token uuid,p_status int)
returns void language plpgsql security definer set search_path='' as $$
declare task rr_lease_private.load_push_queue;
begin
  select * into task from rr_lease_private.load_push_queue where id=p_job and lease=p_token and done_at is null for update;
  if not found then return; end if;
  if p_status in (404,410) then
    delete from rr_lease_private.load_push_devices where id=task.device_id;
  elsif p_status between 200 and 299 then
    update rr_lease_private.load_push_queue set done_at=now(),result='accepted',lease=null where id=p_job;
  elsif task.attempts>=8 or p_status in (400,413) then
    update rr_lease_private.load_push_queue set done_at=now(),result='failed '||p_status,lease=null where id=p_job;
  else
    update rr_lease_private.load_push_queue set due_at=now()+make_interval(secs=>least(1800,30*(2^task.attempts)::int)),result='retry '||p_status,lease=null where id=p_job;
  end if;
end $$;

create function rr_lease_private.wake_load_push(p_force boolean default false)
returns bigint language plpgsql security definer set search_path='' as $$
declare secret text; request_id bigint;
begin
  if not p_force and not exists(select 1 from rr_lease_private.load_push_queue q join public.rr_lease_loads l on l.id=q.load_id
      join rr_lease_private.load_push_devices d on d.id=q.device_id and l.operator_id=d.operator_id
      join public.rr_lease_operators o on o.id=d.operator_id and o.driver_user_id=d.driver_id
      where q.done_at is null and q.due_at<=now() and q.created_at>now()-interval '1 day' and q.attempts<8 and l.status in ('assigned','picked_up'))
    then return null; end if;
  select decrypted_secret into strict secret from vault.decrypted_secrets where name='rr_load_push_wake';
  select net.http_post(url:='https://ghwkcgczuwctzxsxmqzx.supabase.co/functions/v1/rr-load-alerts',
    headers:=jsonb_build_object('Content-Type','application/json','x-rr-worker-token',secret),
    body:=jsonb_build_object('verify',p_force),timeout_milliseconds:=40000) into request_id;
  return request_id;
end $$;

revoke all on function rr_lease_private.wake_load_push(boolean), rr_lease_private.queue_load_push() from public,anon,authenticated,service_role;
revoke all on function public.rr_load_push_subscribe(uuid,jsonb),public.rr_load_push_unsubscribe(text),public.rr_load_push_public_key() from public,anon;
grant execute on function public.rr_load_push_subscribe(uuid,jsonb),public.rr_load_push_unsubscribe(text),public.rr_load_push_public_key() to authenticated;
revoke all on function public.rr_load_push_worker_config(text,jsonb),public.rr_load_push_claim(),public.rr_load_push_finish(bigint,uuid,int) from public,anon,authenticated;
grant execute on function public.rr_load_push_worker_config(text,jsonb),public.rr_load_push_claim(),public.rr_load_push_finish(bigint,uuid,int) to service_role;
select cron.schedule('rr-load-assignment-alerts','* * * * *','select rr_lease_private.wake_load_push()');
