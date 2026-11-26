-- Keep the short interval between requests. The daily count is telemetry only.
create or replace function public.rr_lease_reserve_login_request(p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  clock_at timestamptz := clock_timestamp();
  today_utc date := (clock_at at time zone 'UTC')::date;
begin
  if not public.rr_lease_email_login_allowed(p_email) then return false; end if;
  insert into rr_lease_private.login_requests as previous(email, last_at, utc_day, requests)
  values (lower(btrim(p_email)), clock_at, today_utc, 1)
  on conflict (email) do update
    set last_at = excluded.last_at,
        utc_day = excluded.utc_day,
        requests = case when previous.utc_day = excluded.utc_day then previous.requests + 1 else 1 end
    where previous.last_at <= excluded.last_at - interval '90 seconds';
  return found;
end;
$$;
