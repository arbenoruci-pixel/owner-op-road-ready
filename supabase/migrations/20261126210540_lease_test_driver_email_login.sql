-- Passwordless access for a pilot driver requires an explicit grant on their bound seat.
create table rr_lease_private.driver_login_pilot (
  operator_id uuid primary key references public.rr_lease_operators(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade
);
alter table rr_lease_private.driver_login_pilot enable row level security;
revoke all on rr_lease_private.driver_login_pilot from public, anon, authenticated;

create or replace function public.rr_lease_email_login_allowed(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where lower(u.email) = lower(btrim(p_email))
      and u.email_confirmed_at is not null
      and coalesce((to_jsonb(u)->>'is_anonymous')::boolean, false) = false
      and (
        exists (select 1 from public.rr_lease_operators o
                where o.carrier_user_id = u.id and o.workspace_kind = 'carrier')
        or exists (select 1 from rr_lease_private.driver_login_pilot p
                   join public.rr_lease_operators o on o.id = p.operator_id
                   where p.user_id = u.id and o.driver_user_id = u.id and o.workspace_kind = 'leased')
      )
  );
$$;
revoke all on function public.rr_lease_email_login_allowed(text) from public, anon, authenticated;
grant execute on function public.rr_lease_email_login_allowed(text) to service_role;
