-- Phase 1 Step 3 maintenance-only access. Historical pilot continues to gate
-- the original mileage/IFTA/audit/logbook tool RPCs. No Phase 2 activation.
create policy rr_step3_maintenance_members_read on public.rr_driver_tool_records for select to authenticated using (
 kind='maintenance' and exists(select 1 from public.rr_lease_operators o where o.id=operator_id and auth.uid() in(o.carrier_user_id,o.driver_user_id))
);
create function rr_lease_private.step3_maintenance_save(p_operator_id uuid, p_request_id uuid, p_record jsonb, file_bytes bytea)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  latest_day date := (now() at time zone 'Pacific/Kiritimati')::date;
  row_data public.rr_driver_tool_records;
  saved public.rr_driver_tool_records;
  input_fields constant text[] := array['kind','record_date','unit','description','amount_cents','odometer','next_service_date',
    'next_service_odometer','jurisdiction','miles','taxable_miles','gallons','fuel_type','fuel_tax_paid','vendor','expense_category',
    'coverage_start','coverage_end','file_name','mime_type'];
  server_fields constant text[] := array['id','operator_id','request_id','created_at','created_by'];
  field text;
begin
  -- Serialize this workspace's writes and keep membership stable until commit.
  perform 1 from public.rr_lease_operators o where o.id=p_operator_id
    and actor in (o.carrier_user_id,o.driver_user_id) for update;
  if not found then raise exception 'Workspace access required' using errcode='42501'; end if;
  if p_request_id is null or jsonb_typeof(p_record) is distinct from 'object' then
    raise exception 'A request key and record are required' using errcode='22023';
  end if;
  if p_record->>'kind' is distinct from 'maintenance' or p_record - array['kind','record_date','unit','description','amount_cents','odometer','next_service_date','next_service_odometer','vendor','expense_category','file_name','mime_type'] <> '{}'::jsonb then raise exception 'Unsupported record field' using errcode='22023'; end if;
  foreach field in array input_fields loop
    if p_record->>field is null then continue; end if;
    if field in ('amount_cents','odometer','next_service_odometer','miles','taxable_miles','gallons') then
      if jsonb_typeof(p_record->field) <> 'number' then raise exception 'Invalid number for %',field using errcode='22023'; end if;
    elsif jsonb_typeof(p_record->field) <> 'string' then
      raise exception 'Invalid text for %',field using errcode='22023';
    end if;
    if field in ('record_date','next_service_date','coverage_start','coverage_end') and
       p_record->>field !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Use an ISO calendar date for %',field using errcode='22023';
    end if;
  end loop;
  select * into row_data from jsonb_populate_record(null::public.rr_driver_tool_records,p_record);
  row_data.description := btrim(row_data.description);
  row_data.unit := nullif(btrim(row_data.unit),'');
  row_data.vendor := nullif(btrim(row_data.vendor),'');
  row_data.expense_category := nullif(btrim(row_data.expense_category),'');
  row_data.jurisdiction := upper(btrim(row_data.jurisdiction));
  if row_data.kind = 'fuel' then
    row_data.fuel_type := coalesce(row_data.fuel_type,'unknown');
    row_data.fuel_tax_paid := coalesce(row_data.fuel_tax_paid,'unknown');
  end if;
  if row_data.record_date > latest_day or row_data.coverage_end > latest_day then
    raise exception 'Record and coverage dates cannot be in the future' using errcode='22023';
  end if;

  if file_bytes is not null then
    if row_data.file_name is null or row_data.mime_type is null then
      raise exception 'Supply a named original' using errcode='22023';
    end if;
    row_data.byte_size := octet_length(file_bytes);
    if row_data.byte_size not between 1 and 33554432 then raise exception 'Original must be 1 byte to 32 MiB' using errcode='22023'; end if;
    case row_data.mime_type
      when 'application/pdf' then
        if substr(file_bytes,1,5) <> convert_to('%PDF-','UTF8') then raise exception 'Invalid PDF original' using errcode='22023'; end if;
      when 'image/jpeg' then
        if substr(file_bytes,1,3) <> decode('ffd8ff','hex') then raise exception 'Invalid JPEG original' using errcode='22023'; end if;
      when 'image/png' then
        if substr(file_bytes,1,8) <> decode('89504e470d0a1a0a','hex') then raise exception 'Invalid PNG original' using errcode='22023'; end if;
      when 'text/plain','text/csv' then perform convert_from(file_bytes,'UTF8');
      else raise exception 'Unsupported original file type' using errcode='22023';
    end case;
    row_data.sha256 := encode(sha256(file_bytes),'hex');
  elsif row_data.file_name is not null or row_data.mime_type is not null then
    raise exception 'Original bytes are required for the named file' using errcode='22023';
  end if;

  select r.* into saved from rr_lease_private.driver_tool_requests q
    join public.rr_driver_tool_records r on r.id=q.record_id and r.operator_id=q.operator_id
    where q.operator_id=p_operator_id and q.request_id=p_request_id;
  if saved.id is null and row_data.sha256 is not null then
    select r.* into saved from public.rr_driver_tool_records r
      where r.operator_id=p_operator_id and r.kind=row_data.kind and r.sha256=row_data.sha256
        and (r.kind not in ('mileage','fuel')
          or (r.kind='mileage' and r.record_date=row_data.record_date
              and upper(r.unit) is not distinct from upper(row_data.unit) and r.jurisdiction=row_data.jurisdiction)
          or (r.kind='fuel' and (r.fuel_type=row_data.fuel_type or
              (r.fuel_type not in ('def','reefer') and row_data.fuel_type not in ('def','reefer')))));
  end if;
  if saved.id is not null then
    if (to_jsonb(saved) - server_fields) <> (to_jsonb(row_data) - server_fields) then
      raise exception 'Existing request or original has different details' using errcode='23505';
    end if;
  else
    if row_data.sha256 is not null and row_data.amount_cents is not null and exists (
      select 1 from public.rr_driver_tool_records r where r.operator_id=p_operator_id and r.sha256=row_data.sha256 and r.amount_cents is not null
    ) then
      raise exception 'This original already has a recorded amount. Save additional fuel or maintenance details without an amount.' using errcode='23505';
    end if;
    if file_bytes is not null then
      insert into rr_lease_private.driver_tool_files(operator_id,sha256,contents)
        values(p_operator_id,row_data.sha256,file_bytes) on conflict (operator_id,sha256) do nothing;
    end if;
    row_data.operator_id := p_operator_id;
    row_data.request_id := p_request_id;
    row_data.created_by := actor;
    row_data.created_at := now();
    row_data.id := gen_random_uuid();
    insert into public.rr_driver_tool_records select row_data.* returning * into saved;
  end if;
  insert into rr_lease_private.driver_tool_requests(operator_id,request_id,record_id)
    values(p_operator_id,p_request_id,saved.id) on conflict (operator_id,request_id) do nothing;
  return saved.id;
end $$;
revoke all on function rr_lease_private.step3_maintenance_save(uuid,uuid,jsonb,bytea) from public,anon,authenticated,service_role;
create function public.rr_lease_step3_save_maintenance(p_operator_id uuid,p_request_id uuid,p_record jsonb,p_file_base64 text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare b bytea;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_file_base64 is not null then
  if length(p_file_base64)>4194304 then raise exception 'Maximum original 3 MiB' using errcode='22023';end if;
  b:=decode(p_file_base64,'base64');
  if octet_length(b) not between 1 and 3145728 then raise exception 'Maximum original 3 MiB' using errcode='22023';end if;
 end if;
 return rr_lease_private.step3_maintenance_save(p_operator_id,p_request_id,p_record,b);
end $$;
create function public.rr_lease_step3_maintenance_original(p_record_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare b bytea;
begin
 select f.contents into b from public.rr_driver_tool_records r join public.rr_lease_operators o on o.id=r.operator_id
 join rr_lease_private.driver_tool_files f on f.operator_id=r.operator_id and f.sha256=r.sha256
 where r.id=p_record_id and r.kind='maintenance' and r.byte_size<=3145728 and auth.uid() in(o.carrier_user_id,o.driver_user_id);
 if not found then raise exception 'Maintenance original unavailable' using errcode='42501';end if;
 return encode(b,'base64');
end $$;
revoke all on function public.rr_lease_step3_save_maintenance(uuid,uuid,jsonb,text),public.rr_lease_step3_maintenance_original(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rr_lease_step3_save_maintenance(uuid,uuid,jsonb,text),public.rr_lease_step3_maintenance_original(uuid) to authenticated;
