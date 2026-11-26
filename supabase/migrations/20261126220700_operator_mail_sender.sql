-- Only the service role may access the sender. Deployment-specific addresses are configured separately.
create table rr_lease_private.operator_mail_sender (
  singleton boolean primary key default true check (singleton),
  sender_email text not null,
  pilot_email text not null,
  subject_id text,
  grant_id uuid,
  revision uuid not null default gen_random_uuid()
);
alter table rr_lease_private.operator_mail_sender enable row level security;
revoke all on rr_lease_private.operator_mail_sender from public, anon, authenticated;

create function public.rr_operator_mail_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('sender', sender_email, 'pilot', pilot_email, 'connected',
    grant_id is not null, 'revision', revision) from rr_lease_private.operator_mail_sender where singleton;
$$;

create function public.rr_operator_mail_token(p_email text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('refresh', v.decrypted_secret, 'subject', s.subject_id, 'revision', s.revision,
    'sender', s.sender_email)
    from rr_lease_private.operator_mail_sender s join vault.decrypted_secrets v on v.id = s.grant_id
    where s.singleton and s.pilot_email = lower(p_email);
$$;

create function public.rr_operator_mail_save(p_sender text, p_subject text, p_refresh text, p_revision uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  s rr_lease_private.operator_mail_sender%rowtype;
  saved_id uuid;
begin
  select * into s from rr_lease_private.operator_mail_sender where singleton for update;
  if not found or p_revision is distinct from s.revision
    or lower(p_sender) is distinct from s.sender_email
    or coalesce(length(p_subject), 0) not between 1 and 180
    or coalesce(length(p_refresh), 0) not between 20 and 16384
    or (s.subject_id is not null and p_subject is distinct from s.subject_id) then
    return false;
  end if;
  if s.grant_id is null then
    saved_id := vault.create_secret(p_refresh, 'rr_operator_outlook_grant_v1');
  else
    perform vault.update_secret(s.grant_id, p_refresh);
    saved_id := s.grant_id;
  end if;
  update rr_lease_private.operator_mail_sender set grant_id = saved_id, subject_id = p_subject,
    revision = gen_random_uuid() where singleton;
  return true;
end;
$$;
revoke all on function public.rr_operator_mail_config(), public.rr_operator_mail_token(text),
  public.rr_operator_mail_save(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.rr_operator_mail_config(), public.rr_operator_mail_token(text),
  public.rr_operator_mail_save(text,text,text,uuid) to service_role;
