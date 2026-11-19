-- No client role may read or write these tables. Separate, purpose-limited RPCs
-- expose invitation status and person-authorized document submission or review.
create table public.road_ready_recruiting_document_invites (
  application_id uuid primary key references public.road_ready_recruiting_applications(id) on delete cascade,
  generation uuid not null,
  token_hash text unique not null check (token_hash ~ '^[a-f0-9]{64}$'),
  kinds text[] not null check (cardinality(kinds) between 1 and 5 and kinds @> array['cdl']
    and kinds <@ array['cdl','cdlBack','registration','parking','mvrRelease']),
  expires_at timestamptz not null
);
create table public.road_ready_recruiting_documents (
  application_id uuid not null references public.road_ready_recruiting_applications(id) on delete cascade,
  kind text not null check (kind in ('cdl','cdlBack','registration','parking','mvrRelease')),
  generation uuid not null,
  mime text not null check (mime in ('image/jpeg','image/png','application/pdf')),
  bytes bytea not null check (octet_length(bytes) between 8 and 3145728),
  content_hash bytea not null,
  uploaded_at timestamptz not null default now(),
  consent_version text not null check (consent_version='insurance-review-v1'),
  primary key(application_id,kind)
);
comment on column public.road_ready_recruiting_documents.consent_version is
  'insurance-review-v1: I authorize Narta Express LLC to share the documents I submit here with its insurance agent and Sentry for driver and equipment insurance review.';
create table public.road_ready_recruiting_document_audit (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.road_ready_recruiting_applications(id) on delete cascade,
  generation uuid not null,
  action text not null check (action in ('issued','uploaded','downloaded')),
  actor uuid,
  kind text,
  content_hash bytea,
  occurred_at timestamptz not null default now()
);
alter table public.road_ready_recruiting_document_invites enable row level security;
alter table public.road_ready_recruiting_documents enable row level security;
alter table public.road_ready_recruiting_document_audit enable row level security;
revoke all on public.road_ready_recruiting_document_invites, public.road_ready_recruiting_documents,
  public.road_ready_recruiting_document_audit from public, anon, authenticated, service_role;
revoke all on sequence public.road_ready_recruiting_document_audit_id_seq from public, anon, authenticated, service_role;

create function public.road_ready_recruiting_check_reviewer() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.road_ready_recruiting_reviewers where user_id = (select auth.uid()))
    or not coalesce((public.owner_op_access_v1()->>'approved')::boolean, false) then
    raise insufficient_privilege;
  end if;
end;
$$;
create function public.road_ready_recruiting_check_document_key() returns void
language plpgsql security definer set search_path = '' as $$
declare
  secret text := current_setting('request.headers', true)::jsonb->>'x-recruiting-key';
begin
  if secret is null or length(secret) <> 64 or not exists (
    select 1 from public.road_ready_recruiting_intake_key
    where secret_sha256 = encode(sha256(convert_to(secret,'UTF8')),'hex')
  ) then raise insufficient_privilege; end if;
end;
$$;
revoke all on function public.road_ready_recruiting_check_reviewer(), public.road_ready_recruiting_check_document_key()
  from public, anon, authenticated, service_role;

create function public.road_ready_recruiting_issue_documents(p_application_id uuid,p_token_hash text,p_kinds text[])
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  invitation public.road_ready_recruiting_document_invites;
  reviewed timestamptz;
begin
  perform public.road_ready_recruiting_check_reviewer();
  select reviewed_at into reviewed from public.road_ready_recruiting_applications where id=p_application_id for share;
  if not found then raise sqlstate 'PT404' using message='application_missing'; end if;
  if reviewed is null then raise sqlstate 'PT409' using message='review_required'; end if;
  if p_kinds is null or array_position(p_kinds,null::text) is not null or cardinality(p_kinds) not between 1 and 5
    or cardinality(p_kinds) <> (select count(distinct k) from unnest(p_kinds) k)
    or not (p_kinds @> array['cdl'] and p_kinds <@ array['cdl','cdlBack','registration','parking','mvrRelease'])
  then raise sqlstate 'PT422' using message='invalid_document_selection'; end if;
  insert into public.road_ready_recruiting_document_invites(application_id,generation,token_hash,kinds,expires_at)
    values(p_application_id,gen_random_uuid(),p_token_hash,p_kinds,now()+interval '7 days')
    on conflict(application_id) do update set generation=excluded.generation, token_hash=excluded.token_hash,
      kinds=excluded.kinds, expires_at=excluded.expires_at returning * into invitation;
  insert into public.road_ready_recruiting_document_audit(application_id,generation,action,actor)
    values(p_application_id,invitation.generation,'issued',auth.uid());
  return invitation.expires_at;
end;
$$;

create function public.road_ready_recruiting_invitation(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.road_ready_recruiting_document_invites;
begin
  perform public.road_ready_recruiting_check_document_key();
  select * into invitation from public.road_ready_recruiting_document_invites
    where token_hash=p_token_hash and expires_at > clock_timestamp();
  if not found then raise sqlstate 'PT410' using message='invalid_invitation'; end if;
  return jsonb_build_object('requested',invitation.kinds,'expiresAt',invitation.expires_at,
    'received',coalesce((select jsonb_agg(kind order by kind) from public.road_ready_recruiting_documents
      where application_id=invitation.application_id and generation=invitation.generation),'[]'::jsonb));
end;
$$;

create function public.road_ready_recruiting_upload_document(p_token_hash text,p_kind text,p_mime text,p_content text,p_consent text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  invitation public.road_ready_recruiting_document_invites;
  payload bytea;
  fingerprint bytea;
  prior_hash bytea;
begin
  perform public.road_ready_recruiting_check_document_key();
  select * into invitation from public.road_ready_recruiting_document_invites where token_hash=p_token_hash for update;
  if not found or invitation.expires_at <= clock_timestamp() then raise sqlstate 'PT410' using message='invalid_invitation'; end if;
  if p_kind is null or not(p_kind=any(invitation.kinds)) then raise sqlstate 'PT403' using message='unrequested_kind'; end if;
  if p_consent is distinct from 'insurance-review-v1' then raise sqlstate 'PT422' using message='consent_required'; end if;
  if p_content is null or length(p_content) > 4194304 then raise sqlstate 'PT413' using message='too_large'; end if;
  payload := decode(p_content,'base64');
  if octet_length(payload) not between 8 and 3145728 or not coalesce(
    (p_mime='application/pdf' and substring(payload from 1 for 5)=decode('255044462d','hex'))
    or (p_mime='image/jpeg' and substring(payload from 1 for 3)=decode('ffd8ff','hex'))
    or (p_mime='image/png' and substring(payload from 1 for 8)=decode('89504e470d0a1a0a','hex')),false)
  then raise sqlstate 'PT415' using message='invalid_document'; end if;
  fingerprint := sha256(payload);
  select content_hash into prior_hash from public.road_ready_recruiting_documents
    where application_id=invitation.application_id and kind=p_kind and generation=invitation.generation;
  if found then
    if fingerprint=prior_hash then return true; end if;
    raise sqlstate 'PT409' using message='already_uploaded';
  end if;
  -- Each new generation permits replacing a kind once, preserving its consent/audit trail.
  insert into public.road_ready_recruiting_documents(application_id,kind,generation,mime,bytes,content_hash,consent_version)
    values(invitation.application_id,p_kind,invitation.generation,p_mime,payload,fingerprint,p_consent)
    on conflict(application_id,kind) do update set generation=excluded.generation,mime=excluded.mime,bytes=excluded.bytes,
      content_hash=excluded.content_hash,consent_version=excluded.consent_version,uploaded_at=now();
  insert into public.road_ready_recruiting_document_audit(application_id,generation,action,kind,content_hash)
    values(invitation.application_id,invitation.generation,'uploaded',p_kind,fingerprint);
  return true;
end;
$$;

create function public.road_ready_recruiting_document_overview(p_application_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.road_ready_recruiting_document_invites;
begin
  perform public.road_ready_recruiting_check_reviewer();
  if not exists(select 1 from public.road_ready_recruiting_applications where id=p_application_id)
    then raise sqlstate 'PT404' using message='application_missing'; end if;
  select * into invitation from public.road_ready_recruiting_document_invites where application_id=p_application_id;
  return jsonb_build_object('requested',coalesce(invitation.kinds,'{}'::text[]),'expiresAt',invitation.expires_at,
    'files',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'mime',mime,'bytes',octet_length(bytes),
      'uploadedAt',uploaded_at,'consentVersion',consent_version,'current',generation=invitation.generation) order by kind)
      from public.road_ready_recruiting_documents where application_id=p_application_id),'[]'::jsonb));
end;
$$;

create function public.road_ready_recruiting_download_document(p_application_id uuid,p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare doc public.road_ready_recruiting_documents;
begin
  perform public.road_ready_recruiting_check_reviewer();
  select * into doc from public.road_ready_recruiting_documents where application_id=p_application_id and kind=p_kind;
  if not found then raise sqlstate 'PT404' using message='document_missing'; end if;
  insert into public.road_ready_recruiting_document_audit(application_id,generation,action,actor,kind,content_hash)
    values(p_application_id,doc.generation,'downloaded',auth.uid(),p_kind,doc.content_hash);
  return jsonb_build_object('mime',doc.mime,'content',encode(doc.bytes,'base64'));
end;
$$;
revoke all on function public.road_ready_recruiting_issue_documents(uuid,text,text[]),
  public.road_ready_recruiting_document_overview(uuid),public.road_ready_recruiting_download_document(uuid,text),
  public.road_ready_recruiting_invitation(text),public.road_ready_recruiting_upload_document(text,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.road_ready_recruiting_issue_documents(uuid,text,text[]),
  public.road_ready_recruiting_document_overview(uuid),public.road_ready_recruiting_download_document(uuid,text) to authenticated;
grant execute on function public.road_ready_recruiting_invitation(text),
  public.road_ready_recruiting_upload_document(text,text,text,text,text) to anon;
