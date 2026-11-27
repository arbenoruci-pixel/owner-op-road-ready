-- Use the carrier's connected Outlook mailbox for sign-ins to its own portal.
-- Login eligibility and the per-address resend interval are checked before delivery.
create or replace function public.rr_operator_mail_token(p_email text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'refresh', v.decrypted_secret, 'subject', s.subject_id,
    'revision', s.revision, 'sender', s.sender_email
  )
  from rr_lease_private.operator_mail_sender s
  join vault.decrypted_secrets v on v.id = s.grant_id
  where s.singleton and (
    s.pilot_email = lower(btrim(p_email))
    or (
      public.rr_lease_email_login_allowed(p_email)
      and (
        lower(s.sender_email) = lower(btrim(p_email))
        or exists (
          select 1
          from public.rr_lease_operators o
          join auth.users carrier on carrier.id = o.carrier_user_id
          join auth.users driver on driver.id = o.driver_user_id
          join rr_lease_private.operator_invites invite on invite.operator_id = o.id
          join rr_lease_private.driver_login_pilot enabled
            on enabled.operator_id = o.id and enabled.user_id = driver.id
          where o.workspace_kind = 'leased'
            and lower(carrier.email) = lower(s.sender_email)
            and carrier.email_confirmed_at is not null
            and lower(driver.email) = invite.email
            and invite.email = lower(btrim(p_email))
        )
      )
    )
  );
$$;

revoke all on function public.rr_operator_mail_token(text) from public, anon, authenticated;
grant execute on function public.rr_operator_mail_token(text) to service_role;
