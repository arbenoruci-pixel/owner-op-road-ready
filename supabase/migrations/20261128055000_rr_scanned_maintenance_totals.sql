begin;
set local lock_timeout = '4s';

-- Older editors continue to use their existing review contract.
alter function rr_lease_private.validate_maintenance_receipt(jsonb)
  rename to validate_reviewed_maintenance_receipt;

create function rr_lease_private.validate_maintenance_receipt(d jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare
  source_ text := d->>'totalSource';
  legacy_details jsonb;
begin
  if not (d ?| array['totalSource','dateSource']) then
    perform rr_lease_private.validate_reviewed_maintenance_receipt(d);
    return;
  end if;
  if source_ is null or source_ not in ('reader','driver')
    or d->>'dateSource' is null or d->>'dateSource' not in ('printed','recorded')
    or d->>'mode' is distinct from 'total_only'
    or d->'totalConfirmed' is distinct from to_jsonb(source_='driver') then
    raise exception 'Invalid source for the scanned invoice total.' using errcode='22023';
  end if;
  -- Reuse all amount and field constraints. Only the validation copy uses the legacy flag.
  legacy_details := (d - array['totalSource','dateSource']) || '{"totalConfirmed":true}'::jsonb;
  perform rr_lease_private.validate_reviewed_maintenance_receipt(legacy_details);
end $$;
revoke all on function rr_lease_private.validate_maintenance_receipt(jsonb)
  from public,anon,authenticated,service_role;

-- Keep one workspace lock, original-file check, fingerprint and duplicate policy for both flows.
alter function public.rr_lease_save_maintenance_receipt(uuid,uuid,jsonb,text,jsonb,boolean)
  set schema rr_lease_private;
revoke all on function rr_lease_private.rr_lease_save_maintenance_receipt(uuid,uuid,jsonb,text,jsonb,boolean)
  from public,anon,authenticated,service_role;

create function public.rr_lease_save_maintenance_receipt(
  p_operator_id uuid,p_request_id uuid,p_record jsonb,p_file_base64 text,p_receipt jsonb,p_allow_possible_duplicate boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  saved jsonb;
begin
  if p_receipt ?| array['totalSource','dateSource'] and p_file_base64 is null then
    raise exception 'Keep the original with the scanned invoice.' using errcode='22023';
  end if;
  saved := rr_lease_private.rr_lease_save_maintenance_receipt(
    p_operator_id,p_request_id,p_record,p_file_base64,p_receipt,p_allow_possible_duplicate);
  return (select saved || jsonb_build_object('totalCents',r.amount_cents,'totalSource',m.details->>'totalSource')
    from public.rr_driver_tool_records r
    left join rr_lease_private.maintenance_receipts m on m.record_id=r.id
    where r.id=(saved->>'recordId')::uuid and r.operator_id=p_operator_id);
end $$;

-- A driver can correct the amount the reader just entered. Keep the reader's amount and the
-- correction attribution on the same record and preserve the file and original request fingerprint.
create function public.rr_lease_correct_scanned_maintenance_total(
  p_operator_id uuid,p_record_id uuid,p_expected_cents bigint,p_new_cents bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  d jsonb;
  record_cents bigint;
begin
  perform 1 from public.rr_lease_operators o where o.id=p_operator_id
    and auth.uid() in (o.carrier_user_id,o.driver_user_id) for update;
  if not found then raise exception 'Workspace access required.' using errcode='42501'; end if;
  if p_expected_cents is null or p_expected_cents not between 0 and 100000000000
    or p_new_cents is null or p_new_cents not between 0 and 100000000000 then
    raise exception 'Enter a valid invoice total.' using errcode='22023';
  end if;

  select r.amount_cents,m.details into record_cents,d from public.rr_driver_tool_records r
    join rr_lease_private.maintenance_receipts m on m.record_id=r.id
    where r.id=p_record_id and r.operator_id=p_operator_id and r.kind='maintenance' and r.sha256 is not null
    for update of r,m;
  if not found then raise exception 'Scanned receipt unavailable.' using errcode='22023'; end if;

  if d->>'totalSource'='driver' and d->'readerTotalCents'=to_jsonb(p_expected_cents)
    and record_cents=p_new_cents then
    return jsonb_build_object('recordId',p_record_id,'totalCents',record_cents,'totalSource','driver');
  end if;
  if d->>'mode' is distinct from 'total_only' or d->>'totalSource' is distinct from 'reader'
    or record_cents is distinct from p_expected_cents or d->'totalCents' is distinct from to_jsonb(p_expected_cents) then
    raise exception 'This invoice total has changed. Reopen the saved receipt.' using errcode='40001';
  end if;

  update public.rr_driver_tool_records set amount_cents=p_new_cents where id=p_record_id;
  update rr_lease_private.maintenance_receipts
    set details=d || jsonb_build_object('totalCents',p_new_cents,'totalConfirmed',true,'totalSource','driver',
      'readerTotalCents',record_cents,'correctedBy',auth.uid(),'correctedAt',now(),
      'paidCents',null,'balanceDueCents',null)
    where record_id=p_record_id;
  return jsonb_build_object('recordId',p_record_id,'totalCents',p_new_cents,'totalSource','driver');
end $$;

revoke all on function public.rr_lease_save_maintenance_receipt(uuid,uuid,jsonb,text,jsonb,boolean),
  public.rr_lease_correct_scanned_maintenance_total(uuid,uuid,bigint,bigint)
  from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_save_maintenance_receipt(uuid,uuid,jsonb,text,jsonb,boolean),
  public.rr_lease_correct_scanned_maintenance_total(uuid,uuid,bigint,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
