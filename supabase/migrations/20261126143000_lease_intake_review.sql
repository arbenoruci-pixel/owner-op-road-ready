-- Private worklist for originals awaiting a driver's identity, a legible copy,
-- an assignment, or correction. Never show an unassigned original to a driver.
create table rr_lease_private.intake_review (
  carrier_user_id uuid not null references auth.users(id),
  source_ref text not null check(length(btrim(source_ref)) between 1 and 1024),
  attachment_ref text not null check(length(btrim(attachment_ref)) between 1 and 1024),
  reason text not null check(length(btrim(reason)) between 1 and 1200),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  resolved_at timestamptz,
  load_document_id uuid references public.rr_lease_documents(id),
  wallet_document_id uuid references public.rr_lease_wallet_documents(id),
  primary key (carrier_user_id,source_ref,attachment_ref),
  check (num_nonnulls(load_document_id,wallet_document_id)=case when resolved_at is null then 0 else 1 end)
);
revoke all on rr_lease_private.intake_review from public,anon,authenticated;
grant select,insert,update on rr_lease_private.intake_review to service_role;
create index rr_lease_pending_intake on rr_lease_private.intake_review(carrier_user_id,created_at) where resolved_at is null;

-- The cursor is advanced only for a successfully processed window whose
-- unresolved items have a durable review reference. Overlapping reads are safe.
create table rr_lease_private.mailbox_cursors (
  carrier_user_id uuid not null references auth.users(id),
  mailbox text not null check (mailbox=lower(btrim(mailbox)) and position('@' in mailbox)>1),
  checked_through timestamptz not null,
  primary key(carrier_user_id,mailbox)
);
revoke all on rr_lease_private.mailbox_cursors from public,anon,authenticated;
grant select,insert,update on rr_lease_private.mailbox_cursors to service_role;

create function rr_lease_private.intake_review_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.carrier_user_id,new.source_ref,new.attachment_ref,new.created_at)
     is distinct from (old.carrier_user_id,old.source_ref,old.attachment_ref,old.created_at) then
    raise exception 'Original intake source is immutable';
  end if;
  if tg_op='UPDATE' and old.resolved_at is not null and new is distinct from old then
    raise exception 'Resolved intake source is immutable';
  end if;
  if new.load_document_id is not null and not exists (
    select 1 from public.rr_lease_documents d join public.rr_lease_loads l on l.id=d.load_id
    join public.rr_lease_operators o on o.id=l.operator_id
    where d.id=new.load_document_id and d.is_ready and d.operator_visible and o.carrier_user_id=new.carrier_user_id
  ) then raise exception 'A filed load original is required'; end if;
  if new.wallet_document_id is not null and not exists (
    select 1 from public.rr_lease_wallet_documents d join public.rr_lease_operators o on o.id=d.operator_id
    where d.id=new.wallet_document_id and d.is_ready and o.carrier_user_id=new.carrier_user_id
  ) then raise exception 'A filed wallet original is required'; end if;
  return new;
end $$;
create trigger rr_intake_review_guard before insert or update on rr_lease_private.intake_review
for each row execute function rr_lease_private.intake_review_guard();
revoke all on function rr_lease_private.intake_review_guard() from public,anon,authenticated;
