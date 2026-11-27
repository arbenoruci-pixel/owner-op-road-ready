-- A receipt enriches the original maintenance record. Its amount remains the one expense.
begin;
set local lock_timeout = '4s';

create table rr_lease_private.maintenance_receipts (
  record_id uuid primary key references public.rr_driver_tool_records(id),
  details jsonb not null check (jsonb_typeof(details) = 'object')
);
create index rr_maintenance_receipt_invoice on rr_lease_private.maintenance_receipts
  (lower(btrim(details->>'invoiceNumber'))) where details->>'invoiceNumber' is not null;
alter table rr_lease_private.maintenance_receipts enable row level security;
revoke all on rr_lease_private.maintenance_receipts from public, anon, authenticated, service_role;
-- Bind a retry to its exact reviewed data, including aliases of a previously saved file.
alter table rr_lease_private.driver_tool_requests add column maintenance_fingerprint bytea;

create function rr_lease_private.validate_maintenance_receipt(d jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare
  mode_ text := d->>'mode';
  line jsonb;
  value_ numeric;
  quantity numeric;
  sum_ numeric := 0;
  field text;
  total numeric;
  subtotal numeric;
  tax numeric;
  paid numeric;
  balance numeric;
begin
  if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>131072
    or d-array['mode','assetType','invoiceNumber','payer','paidCents','balanceDueCents','subtotalCents','taxCents','totalCents','lines','totalConfirmed']<>'{}'::jsonb
    or mode_ is null or mode_ not in ('itemized','total_only','service_only')
    or (d->>'assetType' is not null and d->>'assetType' not in ('truck','trailer','unknown'))
    or d->>'payer' is null or d->>'payer' not in ('unknown','driver','carrier')
    or jsonb_typeof(d->'totalConfirmed') is distinct from 'boolean'
    or jsonb_typeof(d->'lines') is distinct from 'array' then
    raise exception 'Review the receipt details and paid-by field.' using errcode='22023';
  end if;
  if d->>'invoiceNumber' is not null and (jsonb_typeof(d->'invoiceNumber')<>'string'
    or length(btrim(d->>'invoiceNumber')) not between 1 and 160 or d->>'invoiceNumber' ~ '[[:cntrl:]]') then
    raise exception 'Enter a valid invoice number.' using errcode='22023';
  end if;
  foreach field in array array['paidCents','balanceDueCents','subtotalCents','taxCents','totalCents'] loop
    if d->>field is null then continue; end if;
    if jsonb_typeof(d->field)<>'number' then raise exception 'Receipt amounts must be whole cents.' using errcode='22023'; end if;
    value_:=(d->>field)::numeric;
    if trunc(value_)<>value_ or value_ not between 0 and 100000000000 then
      raise exception 'Receipt amounts must be nonnegative whole cents.' using errcode='22023';
    end if;
  end loop;
  total:=(d->>'totalCents')::numeric; subtotal:=(d->>'subtotalCents')::numeric;
  tax:=(d->>'taxCents')::numeric; paid:=(d->>'paidCents')::numeric; balance:=(d->>'balanceDueCents')::numeric;
  if jsonb_array_length(d->'lines')>200 then raise exception 'Use at most 200 receipt items.' using errcode='22023'; end if;
  if mode_='service_only' then
    if num_nonnulls(total,subtotal,tax,paid,balance)>0 or jsonb_array_length(d->'lines')<>0 then
      raise exception 'A service-only record cannot contain a cost.' using errcode='22023';
    end if;
    return;
  end if;
  if total is null or paid>total or balance>total or paid+balance<>total then
    raise exception 'Review the invoice total, amount paid and balance due.' using errcode='22023';
  end if;
  if mode_='total_only' then
    if d->'totalConfirmed'<>'true'::jsonb or jsonb_array_length(d->'lines')<>0 or num_nonnulls(subtotal,tax)>0 then
      raise exception 'Confirm the receipt total to save without itemized costs.' using errcode='22023';
    end if;
    return;
  end if;
  if jsonb_array_length(d->'lines')=0 then raise exception 'Add at least one item.' using errcode='22023'; end if;
  for line in select value from jsonb_array_elements(d->'lines') loop
    if jsonb_typeof(line) is distinct from 'object' or line-array['description','quantity','unitPriceCents','amountCents']<>'{}'::jsonb
      or jsonb_typeof(line->'description') is distinct from 'string' or length(btrim(line->>'description')) not between 1 and 600
      or jsonb_typeof(line->'amountCents') is distinct from 'number' then
      raise exception 'Each receipt item needs a description and a line amount.' using errcode='22023';
    end if;
    foreach field in array array['amountCents','unitPriceCents'] loop
      if line->>field is null then continue; end if;
      if jsonb_typeof(line->field)<>'number' then raise exception 'Item prices must be whole cents.' using errcode='22023'; end if;
      value_:=(line->>field)::numeric;
      if trunc(value_)<>value_ or abs(value_)>100000000000 then raise exception 'Invalid item amount.' using errcode='22023'; end if;
    end loop;
    if line->>'quantity' is not null then
      if jsonb_typeof(line->'quantity')<>'number' then raise exception 'Enter a numeric quantity.' using errcode='22023'; end if;
      quantity:=(line->>'quantity')::numeric;
      if quantity<=0 or quantity>1000000000 or round(quantity,3)<>quantity then
        raise exception 'Use a positive quantity with up to three decimal places.' using errcode='22023';
      end if;
      if round(quantity*(line->>'unitPriceCents')::numeric)<>(line->>'amountCents')::numeric then
        raise exception 'Quantity times unit price differs from the item amount.' using errcode='22023';
      end if;
    end if;
    sum_:=sum_+(line->>'amountCents')::numeric;
  end loop;
  if (subtotal is not null and sum_<>subtotal) or sum_+coalesce(tax,0)<>total then
    raise exception 'The receipt items and tax must match the invoice total.' using errcode='22023';
  end if;
end $$;
revoke all on function rr_lease_private.validate_maintenance_receipt(jsonb) from public, anon, authenticated, service_role;

create function public.rr_lease_save_maintenance_receipt(
  p_operator_id uuid,p_request_id uuid,p_record jsonb,p_file_base64 text,p_receipt jsonb,p_allow_possible_duplicate boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  original bytea;
  file_hash text;
  fingerprint bytea;
  prior_fingerprint bytea;
  saved_id uuid;
  status_ text:='saved';
begin
  perform 1 from public.rr_lease_operators o where o.id=p_operator_id
    and auth.uid() in (o.carrier_user_id,o.driver_user_id) for update;
  if not found then raise exception 'Workspace access required.' using errcode='42501'; end if;
  perform rr_lease_private.validate_maintenance_receipt(p_receipt);
  if p_request_id is null or jsonb_typeof(p_record) is distinct from 'object' or p_record->>'kind' is distinct from 'maintenance'
    or p_record->'amount_cents' is distinct from coalesce(p_receipt->'totalCents','null'::jsonb) then
    raise exception 'The maintenance cost must match the reviewed receipt total.' using errcode='22023';
  end if;
  if p_file_base64 is not null then
    if length(p_file_base64) not between 1 and 4194304 or coalesce(p_record->>'mime_type','') not in ('application/pdf','image/jpeg','image/png') then
      raise exception 'Choose a PDF, JPEG or PNG original up to 3 MiB.' using errcode='22023';
    end if;
    original:=decode(p_file_base64,'base64');
    if octet_length(original) not between 1 and 3145728 then raise exception 'Maximum original 3 MiB.' using errcode='22023'; end if;
    file_hash:=encode(sha256(original),'hex');
  end if;
  fingerprint:=sha256(convert_to(jsonb_build_array(p_record,p_receipt,file_hash)::text,'UTF8'));
  select q.record_id,q.maintenance_fingerprint into saved_id,prior_fingerprint
    from rr_lease_private.driver_tool_requests q where q.operator_id=p_operator_id and q.request_id=p_request_id;
  if found then
    if prior_fingerprint is not null and prior_fingerprint<>fingerprint then
      raise exception 'This save was already used for different details.' using errcode='23505';
    elsif prior_fingerprint is null then
      -- An older writer owns this key. Its existing replay validator checks every original field.
      saved_id:=rr_lease_private.step3_maintenance_save(p_operator_id,p_request_id,p_record,original);
    end if;
    status_:='already_saved';
  elsif file_hash is not null then
    select r.id into saved_id from public.rr_driver_tool_records r where r.operator_id=p_operator_id and r.kind='maintenance' and r.sha256=file_hash;
    if found then status_:='already_saved'; end if;
  end if;
  if saved_id is null and not coalesce(p_allow_possible_duplicate,false) and p_receipt->>'invoiceNumber' is not null
       and p_record->>'vendor' is not null and p_record->>'amount_cents' is not null then
    select r.id into saved_id from public.rr_driver_tool_records r
      join rr_lease_private.maintenance_receipts m on m.record_id=r.id
      where r.operator_id=p_operator_id and lower(btrim(r.vendor))=lower(btrim(p_record->>'vendor'))
        and lower(btrim(m.details->>'invoiceNumber'))=lower(btrim(p_receipt->>'invoiceNumber'))
        and r.amount_cents=(p_record->>'amount_cents')::bigint
      order by r.record_date desc,r.id limit 1;
    if found then status_:='possible_duplicate'; end if;
  end if;
  if saved_id is null then
    -- This also enforces dates, mileage, field types, file signatures, per-workspace evidence uniqueness and cost-once across expense kinds.
    saved_id:=rr_lease_private.step3_maintenance_save(p_operator_id,p_request_id,p_record,original);
    insert into rr_lease_private.maintenance_receipts(record_id,details) values(saved_id,p_receipt);
  end if;
  if status_<>'possible_duplicate' then
    insert into rr_lease_private.driver_tool_requests(operator_id,request_id,record_id,maintenance_fingerprint)
      values(p_operator_id,p_request_id,saved_id,fingerprint)
      on conflict(operator_id,request_id) do update set maintenance_fingerprint=excluded.maintenance_fingerprint
      where rr_lease_private.driver_tool_requests.maintenance_fingerprint is null;
  end if;
  return (select jsonb_build_object('recordId',r.id,'recordDate',r.record_date,'status',status_)
    from public.rr_driver_tool_records r where r.id=saved_id);
end $$;

create function public.rr_lease_maintenance_receipt_history(p_operator_id uuid)
returns setof jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(r)||jsonb_build_object('receipt',m.details)
    from public.rr_driver_tool_records r join public.rr_lease_operators o on o.id=r.operator_id
    left join rr_lease_private.maintenance_receipts m on m.record_id=r.id
    where r.operator_id=p_operator_id and r.kind='maintenance' and auth.uid() in (o.carrier_user_id,o.driver_user_id)
    order by r.record_date desc,r.id
$$;
revoke all on function public.rr_lease_save_maintenance_receipt(uuid,uuid,jsonb,text,jsonb,boolean),
  public.rr_lease_maintenance_receipt_history(uuid) from public, anon, authenticated, service_role;
grant execute on function public.rr_lease_save_maintenance_receipt(uuid,uuid,jsonb,text,jsonb,boolean),
  public.rr_lease_maintenance_receipt_history(uuid) to authenticated;
commit;
