create table rr_lease_private.ratecon_test_loads (
  load_id uuid primary key references public.rr_lease_loads
);
create table rr_lease_private.ratecon_test_acceptances (
  document_id uuid not null references public.rr_lease_documents,
  driver_id uuid not null references auth.users,
  sha256 text not null,
  signer text not null,
  accepted_at timestamptz not null default now(),
  primary key (document_id,driver_id)
);
revoke all on rr_lease_private.ratecon_test_loads, rr_lease_private.ratecon_test_acceptances from public,anon,authenticated;
create function public.rr_ratecon_driver_test(p_document uuid, p_hash text, p_signer text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a rr_lease_private.ratecon_test_acceptances;
  driver uuid;
begin
  select o.driver_user_id into driver from public.rr_lease_documents d
    join public.rr_lease_loads l on l.id=d.load_id
    join public.rr_lease_operators o on o.id=l.operator_id
    join rr_lease_private.ratecon_test_loads t on t.load_id=l.id
    where d.id=p_document and d.sha256=p_hash and d.is_ready and d.is_current
      and d.operator_visible and d.kind='ratecon' and l.status='assigned'
      and o.driver_user_id=auth.uid() for share of l,d,o;
  if not found then return null; end if;
  if p_signer is not null then
    if length(btrim(p_signer)) not between 2 and 90 or p_signer ~ '[[:cntrl:]]' then raise exception 'Enter your name'; end if;
    insert into rr_lease_private.ratecon_test_acceptances (document_id,driver_id,sha256,signer)
      values(p_document,driver,p_hash,btrim(p_signer)) on conflict do nothing;
  end if;
  select * into a from rr_lease_private.ratecon_test_acceptances where document_id=p_document and driver_id=driver;
  return jsonb_build_object('signer',a.signer,'accepted_at',a.accepted_at);
end $$;
revoke all on function public.rr_ratecon_driver_test(uuid,text,text) from public,anon;
grant execute on function public.rr_ratecon_driver_test(uuid,text,text) to authenticated;
