begin;

create function public.rr_lease_open_driver_workspace()
returns table (
  id uuid,
  company_name text,
  driver_name text,
  pay_weekday smallint,
  carrier_user_id uuid,
  driver_user_id uuid,
  workspace_kind text
)
language plpgsql volatile security invoker set search_path = '' as $$
begin
  -- Apply any invitation before reading the caller's current memberships under RLS.
  perform public.rr_lease_claim_membership();
  return query
    select o.id, o.company_name, o.driver_name, o.pay_weekday,
           o.carrier_user_id, o.driver_user_id, o.workspace_kind
    from public.rr_lease_operators as o
    order by o.company_name, o.id;
end;
$$;

revoke all on function public.rr_lease_open_driver_workspace()
  from public, anon, authenticated, service_role;
grant execute on function public.rr_lease_open_driver_workspace() to authenticated;

notify pgrst, 'reload schema';
commit;
