begin;

-- One bulletin belongs to the carrier's own workspace and serves the drivers of that fleet.
create table rr_lease_private.driver_notices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.rr_lease_operators(id),
  publication_key text not null check (length(publication_key) between 1 and 180),
  title text not null check (length(title) between 1 and 120),
  message text not null check (length(message) between 1 and 1800),
  source_url text check (length(source_url) <= 1600 and source_url ~ '^https://[^[:space:]/]+(/[^[:space:]]*)?$'),
  published_at timestamptz not null default now(),
  unique(workspace_id,publication_key)
);
create index rr_driver_notices_feed on rr_lease_private.driver_notices(workspace_id,published_at desc,id desc);

create table rr_lease_private.driver_notice_reads (
  notice_id uuid not null references rr_lease_private.driver_notices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(notice_id,user_id)
);
alter table rr_lease_private.driver_notices enable row level security;
alter table rr_lease_private.driver_notice_reads enable row level security;
revoke all on rr_lease_private.driver_notices,rr_lease_private.driver_notice_reads from public,anon,authenticated,service_role;

-- Keep reads bound to the particular membership selected by the signed-in user.
create function rr_lease_private.driver_notice_workspace(p_operator uuid)
returns uuid language sql stable set search_path='' as $$
  select c.id from public.rr_lease_operators o
  join public.rr_lease_operators c on c.carrier_user_id=o.carrier_user_id and c.workspace_kind='carrier'
  where o.id=p_operator and auth.uid() in (o.driver_user_id,o.carrier_user_id)
$$;
revoke all on function rr_lease_private.driver_notice_workspace(uuid) from public,anon,authenticated,service_role;

create function public.rr_driver_notices(p_operator uuid,p_page integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
  with visible as (
    select n.id,n.title,n.message,n.source_url,n.published_at,r.user_id is not null as is_read
    from rr_lease_private.driver_notices n
    left join rr_lease_private.driver_notice_reads r on r.notice_id=n.id and r.user_id=auth.uid()
    where n.workspace_id=rr_lease_private.driver_notice_workspace(p_operator)
  ), page as (
    select * from visible order by published_at desc,id desc
    limit 20 offset greatest(0,p_page)::bigint*20
  )
  select jsonb_build_object(
    'unread',(select count(*) from visible where not is_read),
    'total',(select count(*) from visible),
    'items',coalesce((select jsonb_agg(to_jsonb(page) order by published_at desc,id desc) from page),'[]'::jsonb)
  )
$$;

create function public.rr_driver_notice_read(p_operator uuid,p_notice uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select from rr_lease_private.driver_notices n
    where n.id=p_notice and n.workspace_id=rr_lease_private.driver_notice_workspace(p_operator))
  then raise insufficient_privilege using message='Notice unavailable for this workspace'; end if;
  insert into rr_lease_private.driver_notice_reads(notice_id,user_id) values(p_notice,auth.uid()) on conflict do nothing;
end $$;

-- Dispatch uses its normal authenticated session. Scheduled publishers use the server-only service role.
create function public.rr_driver_notice_publish(p_workspace uuid,p_key text,p_title text,p_message text,p_source_url text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved rr_lease_private.driver_notices;
begin
  if not exists(select from public.rr_lease_operators c where c.id=p_workspace and c.workspace_kind='carrier'
    and (c.carrier_user_id=auth.uid() or current_setting('role',true)='service_role'))
  then raise insufficient_privilege using message='Carrier publishing access required'; end if;

  p_key:=btrim(p_key); p_title:=btrim(p_title); p_message:=btrim(p_message); p_source_url:=nullif(btrim(p_source_url),'');
  insert into rr_lease_private.driver_notices(workspace_id,publication_key,title,message,source_url)
    values(p_workspace,p_key,p_title,p_message,p_source_url)
    on conflict(workspace_id,publication_key) do nothing returning * into saved;
  if saved.id is null then
    select * into strict saved from rr_lease_private.driver_notices where workspace_id=p_workspace and publication_key=p_key;
    if row(saved.title,saved.message,saved.source_url) is distinct from row(p_title,p_message,p_source_url)
    then raise unique_violation using message='This publication key already belongs to a different notice'; end if;
  end if;
  return saved.id;
end $$;

revoke all on function public.rr_driver_notices(uuid,integer),public.rr_driver_notice_read(uuid,uuid),
  public.rr_driver_notice_publish(uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.rr_driver_notices(uuid,integer),public.rr_driver_notice_read(uuid,uuid),
  public.rr_driver_notice_publish(uuid,text,text,text,text) to authenticated;
grant execute on function public.rr_driver_notice_publish(uuid,text,text,text,text) to service_role;
commit;
