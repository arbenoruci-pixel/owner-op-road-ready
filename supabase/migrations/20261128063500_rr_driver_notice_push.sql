begin;
set local lock_timeout='5s';

-- Both preferences use the same browser endpoint. Existing devices opted in to load alerts only.
alter table rr_lease_private.load_push_devices
  add column loads_enabled boolean not null default true,
  add column notices_enabled boolean not null default false;
alter table rr_lease_private.load_push_queue
  alter column load_id drop not null,
  add column notice_id uuid references rr_lease_private.driver_notices(id) on delete cascade,
  add constraint rr_push_one_event check (num_nonnulls(load_id,notice_id)=1),
  add constraint rr_push_one_notice_per_device unique(device_id,notice_id);

create function rr_lease_private.enable_driver_push(p_operator uuid,p_subscription jsonb,p_notice boolean)
returns void language plpgsql security definer set search_path='' as $$
declare
  driver uuid:=auth.uid();
  dest text:=p_subscription->>'endpoint';
  dh text:=p_subscription#>>'{keys,p256dh}';
  secret text:=p_subscription#>>'{keys,auth}';
begin
  if driver is null or not exists(select from public.rr_lease_operators o where o.id=p_operator and
      ((o.workspace_kind='leased' and o.driver_user_id=driver) or
       (p_notice and o.workspace_kind='carrier' and o.carrier_user_id=driver))) then
    raise insufficient_privilege using message='Sign in to your assigned workspace.';
  end if;
  if dest is null or length(dest)>2048 or dest !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)+notify\.windows\.com)/[^[:space:]#]+$'
    or dh is null or dh !~ '^[A-Za-z0-9_-]{87}$' or secret is null or secret !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'Unsupported push subscription' using errcode='22023';
  end if;
  insert into rr_lease_private.load_push_devices as d(operator_id,driver_id,endpoint,p256dh,auth_key,loads_enabled,notices_enabled)
    values(p_operator,driver,dest,dh,secret,not p_notice,p_notice)
    on conflict(endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key,
      loads_enabled=(d.loads_enabled or excluded.loads_enabled),notices_enabled=(d.notices_enabled or excluded.notices_enabled)
    where d.driver_id=driver and d.operator_id=p_operator;
  if not found then raise exception 'Turn off phone alerts for the previous account or workspace first.'; end if;
end $$;

create function rr_lease_private.disable_driver_push(p_operator uuid,p_endpoint text,p_notice boolean)
returns void language plpgsql security definer set search_path='' as $$
declare device rr_lease_private.load_push_devices;
begin
  select * into device from rr_lease_private.load_push_devices
    where endpoint=p_endpoint and driver_id=auth.uid() and (p_operator is null or operator_id=p_operator) for update;
  if not found then return; end if;
  if (p_notice and not device.loads_enabled) or (not p_notice and not device.notices_enabled) then
    delete from rr_lease_private.load_push_devices where id=device.id;
  else
    update rr_lease_private.load_push_devices set
      notices_enabled=not p_notice and notices_enabled, loads_enabled=p_notice and loads_enabled
      where id=device.id;
    -- Turning a channel off discards its pending work, including if the driver turns it back on later.
    update rr_lease_private.load_push_queue set done_at=now(),lease=null,result='disabled'
      where device_id=device.id and done_at is null and (notice_id is not null)=p_notice;
  end if;
end $$;

create or replace function public.rr_load_push_subscribe(p_operator uuid,p_subscription jsonb)
returns void language sql security definer set search_path='' as $$
  select rr_lease_private.enable_driver_push(p_operator,p_subscription,false)
$$;
create or replace function public.rr_load_push_unsubscribe(p_endpoint text)
returns void language sql security definer set search_path='' as $$
  select rr_lease_private.disable_driver_push(null,p_endpoint,false)
$$;
create function public.rr_driver_notice_push_subscribe(p_operator uuid,p_subscription jsonb)
returns void language sql security definer set search_path='' as $$
  select rr_lease_private.enable_driver_push(p_operator,p_subscription,true)
$$;
create function public.rr_driver_notice_push_unsubscribe(p_operator uuid,p_endpoint text)
returns void language sql security definer set search_path='' as $$
  select rr_lease_private.disable_driver_push(p_operator,p_endpoint,true)
$$;
create function public.rr_driver_push_forget_device(p_endpoint text)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner_id uuid;
begin
  if actor is null or p_endpoint is null or length(p_endpoint) not between 1 and 2048 then return false; end if;
  select d.driver_id into owner_id from rr_lease_private.load_push_devices d where d.endpoint=p_endpoint for update;
  if not found then return true; end if;
  if owner_id<>actor then return false; end if;
  delete from rr_lease_private.load_push_devices where driver_id=actor and endpoint=p_endpoint;
  return true;
end $$;
create function public.rr_driver_push_preferences(p_operator uuid,p_endpoint text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((
    select jsonb_build_object('loads',d.loads_enabled,'notices',d.notices_enabled)
    from rr_lease_private.load_push_devices d join public.rr_lease_operators o on o.id=d.operator_id
    where o.id=p_operator and d.driver_id=auth.uid() and d.endpoint=p_endpoint
      and ((o.workspace_kind='leased' and o.driver_user_id=d.driver_id)
        or (o.workspace_kind='carrier' and o.carrier_user_id=d.driver_id))
  ),'{"loads":false,"notices":false}'::jsonb)
$$;

create or replace function rr_lease_private.queue_load_push()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status not in ('assigned','picked_up') then return new; end if;
  if tg_op='UPDATE' and old.status<>'staging' then return new; end if;
  insert into rr_lease_private.load_push_queue(device_id,load_id)
    select d.id,new.id from rr_lease_private.load_push_devices d join public.rr_lease_operators o
      on o.id=d.operator_id and o.driver_user_id=d.driver_id
    where o.id=new.operator_id and o.workspace_kind='leased' and d.loads_enabled
    on conflict(device_id,load_id) do nothing;
  return new;
end $$;

create function rr_lease_private.queue_driver_notice_push()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into rr_lease_private.load_push_queue(device_id,notice_id)
    select d.id,new.id from public.rr_lease_operators carrier
    join public.rr_lease_operators o on o.carrier_user_id=carrier.carrier_user_id
    join rr_lease_private.load_push_devices d on d.operator_id=o.id
    where carrier.id=new.workspace_id and carrier.workspace_kind='carrier' and d.notices_enabled
      and ((o.workspace_kind='leased' and o.driver_user_id=d.driver_id) or
           (o.id=carrier.id and o.carrier_user_id=d.driver_id))
    on conflict(device_id,notice_id) do nothing;
  return new;
end $$;
-- AFTER INSERT fires on first publication. Replays and earlier bulletins never create new jobs.
create trigger rr_driver_notice_alert after insert on rr_lease_private.driver_notices
  for each row execute function rr_lease_private.queue_driver_notice_push();

-- The existing minute wake and both generations of worker recheck current membership and preference.
create view rr_lease_private.eligible_driver_push as
  select q.id,q.due_at from rr_lease_private.load_push_queue q
  join rr_lease_private.load_push_devices d on d.id=q.device_id
  join public.rr_lease_operators o on o.id=d.operator_id
  left join public.rr_lease_loads l on l.id=q.load_id and l.operator_id=o.id
  left join rr_lease_private.driver_notices n on n.id=q.notice_id
  left join public.rr_lease_operators carrier on carrier.id=n.workspace_id and carrier.workspace_kind='carrier'
    and carrier.carrier_user_id=o.carrier_user_id
  where q.done_at is null and q.due_at<=now() and q.created_at>now()-interval '1 day' and q.attempts<8
    and ((d.loads_enabled and o.workspace_kind='leased' and o.driver_user_id=d.driver_id and l.status in ('assigned','picked_up'))
      or (d.notices_enabled and carrier.id is not null and ((o.workspace_kind='leased' and o.driver_user_id=d.driver_id)
          or (o.id=carrier.id and o.carrier_user_id=d.driver_id))
        and not exists(select from rr_lease_private.driver_notice_reads r where r.notice_id=n.id and r.user_id=d.driver_id)));

create function rr_lease_private.claim_driver_push(p_load_only boolean)
returns table(job bigint,token uuid,load_id uuid,notice_id uuid,operator_id uuid,endpoint text,p256dh text,auth_key text)
language sql security definer set search_path='' as $$
  with batch as materialized (
    select q.id from rr_lease_private.load_push_queue q join rr_lease_private.eligible_driver_push e on e.id=q.id
    where (not p_load_only or q.load_id is not null) and q.done_at is null and q.due_at<=now()
    order by q.due_at,q.id for update of q skip locked limit 20
  ), claimed as (
    update rr_lease_private.load_push_queue q set lease=gen_random_uuid(),due_at=now()+interval '2 minutes', attempts=attempts+1
    from batch where q.id=batch.id returning q.*
  )
  select c.id,c.lease,c.load_id,c.notice_id,d.operator_id,d.endpoint,d.p256dh,d.auth_key
    from claimed c join rr_lease_private.load_push_devices d on d.id=c.device_id
$$;
create or replace function public.rr_load_push_claim()
returns table(job bigint,token uuid,load_id uuid,endpoint text,p256dh text,auth_key text)
language sql security definer set search_path='' as $$
  select c.job,c.token,c.load_id,c.endpoint,c.p256dh,c.auth_key from rr_lease_private.claim_driver_push(true) c
$$;
create function public.rr_driver_push_claim()
returns table(job bigint,token uuid,load_id uuid,notice_id uuid,operator_id uuid,endpoint text,p256dh text,auth_key text)
language sql security definer set search_path='' as $$
  select * from rr_lease_private.claim_driver_push(false)
$$;

create or replace function rr_lease_private.wake_load_push(p_force boolean default false)
returns bigint language plpgsql security definer set search_path='' as $$
declare secret text; request_id bigint;
begin
  if not p_force and not exists(select from rr_lease_private.eligible_driver_push) then return null; end if;
  select decrypted_secret into strict secret from vault.decrypted_secrets where name='rr_load_push_wake';
  select net.http_post(url:='https://ghwkcgczuwctzxsxmqzx.supabase.co/functions/v1/rr-load-alerts',
    headers:=jsonb_build_object('Content-Type','application/json','x-rr-worker-token',secret),
    body:=jsonb_build_object('verify',p_force),timeout_milliseconds:=40000) into request_id;
  return request_id;
end $$;

revoke all on rr_lease_private.eligible_driver_push from public,anon,authenticated,service_role;
revoke all on function rr_lease_private.enable_driver_push(uuid,jsonb,boolean),rr_lease_private.disable_driver_push(uuid,text,boolean),
  rr_lease_private.queue_driver_notice_push(),rr_lease_private.claim_driver_push(boolean) from public,anon,authenticated,service_role;
revoke all on function public.rr_driver_notice_push_subscribe(uuid,jsonb),public.rr_driver_notice_push_unsubscribe(uuid,text),
  public.rr_driver_push_preferences(uuid,text),public.rr_driver_push_forget_device(text),public.rr_driver_push_claim() from public,anon,authenticated,service_role;
grant execute on function public.rr_driver_notice_push_subscribe(uuid,jsonb),public.rr_driver_notice_push_unsubscribe(uuid,text),
  public.rr_driver_push_preferences(uuid,text),public.rr_driver_push_forget_device(text) to authenticated;
grant execute on function public.rr_driver_push_claim() to service_role;
notify pgrst,'reload schema';
commit;
