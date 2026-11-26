begin;

-- Enrollment is explicit per signed-in person AND workspace; migrations enroll nobody.
create table rr_lease_private.driver_tools_pilot (
  operator_id uuid not null references public.rr_lease_operators(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (operator_id,user_id)
);
alter table rr_lease_private.driver_tools_pilot enable row level security;
revoke all on rr_lease_private.driver_tools_pilot from public,anon,authenticated,service_role;

create function public.rr_driver_tools_enabled(p_operator_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from rr_lease_private.driver_tools_pilot p
    join public.rr_lease_operators o on o.id=p.operator_id
    where p.operator_id=p_operator_id and p.user_id=(select auth.uid())
      and p.user_id in (o.carrier_user_id,o.driver_user_id)
  )
$$;
revoke all on function public.rr_driver_tools_enabled(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rr_driver_tools_enabled(uuid) to authenticated;
commit;
