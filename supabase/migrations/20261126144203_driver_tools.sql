-- Supplemental driver records and original documents. No settlement or ELD writes.
create table rr_lease_private.driver_tool_files (
  operator_id uuid not null references public.rr_lease_operators(id),
  sha256 text not null,
  contents bytea not null check (octet_length(contents) between 1 and 33554432),
  primary key (operator_id, sha256),
  check (sha256 = encode(sha256(contents), 'hex'))
);

-- Preserve efficient slices for large originals stored out of line.
alter table rr_lease_private.driver_tool_files alter column contents set storage external;

create table public.rr_driver_tool_records (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.rr_lease_operators(id),
  request_id uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  record_date date not null check (record_date >= date '1900-01-01' and isfinite(record_date)),
  kind text not null check (kind in ('maintenance','expense','mileage','fuel','logbook','ifta_filing','audit_document')),
  unit text check (length(unit) between 1 and 80 and unit !~ '[[:cntrl:]]'),
  description text not null check (length(btrim(description)) between 1 and 600),
  vendor text check (vendor is null or (kind in ('maintenance','expense','fuel') and length(vendor) between 1 and 160)),
  amount_cents bigint check (amount_cents is null or (kind in ('maintenance','expense','fuel') and amount_cents between 0 and 100000000000)),
  expense_category text check (expense_category is null or (kind in ('maintenance','expense','fuel') and length(expense_category) between 1 and 100)),
  odometer integer check (odometer is null or (kind in ('maintenance','mileage','fuel') and odometer between 0 and 99999999)),
  next_service_odometer integer check (next_service_odometer is null or (kind = 'maintenance' and next_service_odometer between coalesce(odometer,0) and 99999999)),
  next_service_date date check (next_service_date is null or (kind = 'maintenance' and next_service_date >= record_date and isfinite(next_service_date))),
  jurisdiction text check (jurisdiction is null or (kind in ('mileage','fuel') and jurisdiction in (
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN',
    'MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA',
    'WA','WV','WI','WY','AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'))),
  miles numeric check (miles is null or (kind = 'mileage' and miles > 0 and miles <= 9999999 and round(miles,3) = miles)),
  taxable_miles numeric check (taxable_miles is null or (kind = 'mileage' and taxable_miles between 0 and miles and round(taxable_miles,3) = taxable_miles)),
  gallons numeric check (gallons is null or (kind = 'fuel' and gallons > 0 and gallons <= 9999999 and round(gallons,3) = gallons)),
  fuel_type text check (fuel_type is null or (kind = 'fuel' and fuel_type in ('diesel','gasoline','biodiesel','other','reefer','def','unknown'))),
  fuel_tax_paid text check (fuel_tax_paid is null or (kind = 'fuel' and fuel_tax_paid in ('yes','no','unknown'))),
  coverage_start date,
  coverage_end date,
  file_name text check (length(file_name) between 1 and 255 and file_name not in ('.','..')
    and file_name !~ '[[:cntrl:]/]' and strpos(file_name, chr(92)) = 0),
  mime_type text check (mime_type in ('application/pdf','image/jpeg','image/png','text/plain','text/csv')),
  byte_size integer check (byte_size between 1 and 33554432),
  sha256 text,
  unique (operator_id, request_id),
  unique (operator_id, id),
  foreign key (operator_id, sha256) references rr_lease_private.driver_tool_files(operator_id, sha256),
  check (num_nonnulls(file_name,mime_type,byte_size,sha256) in (0,4)),
  check (kind <> 'expense' or amount_cents is not null),
  check (kind <> 'mileage' or (miles is not null and jurisdiction is not null)),
  check (kind <> 'fuel' or (gallons is not null and jurisdiction is not null and fuel_type is not null and fuel_tax_paid is not null)),
  check (kind not in ('logbook','ifta_filing','audit_document') or sha256 is not null),
  check (num_nonnulls(coverage_start,coverage_end) = 0 or
    (num_nonnulls(coverage_start,coverage_end) = 2 and kind in ('logbook','ifta_filing','audit_document')
     and coverage_start >= date '1900-01-01' and coverage_end >= coverage_start and isfinite(coverage_end)))
);
create index rr_driver_tool_dates on public.rr_driver_tool_records(operator_id,record_date,id);
-- A receipt total can be described by several operational rows, but counted only once.
create unique index rr_driver_tool_receipt_amount_once on public.rr_driver_tool_records(operator_id,sha256)
  where amount_cents is not null and sha256 is not null;
create unique index rr_driver_tool_document_once on public.rr_driver_tool_records(operator_id,kind,sha256)
  where sha256 is not null and kind not in ('mileage','fuel');
-- A single mileage report can legitimately support multiple units, days and jurisdictions.
-- A receipt may include propulsion fuel and reefer fuel on separate lines.
create unique index rr_driver_tool_mileage_lines on public.rr_driver_tool_records
  (operator_id,sha256,record_date,coalesce(upper(unit),''),jurisdiction)
  where sha256 is not null and kind='mileage';
create unique index rr_driver_tool_fuel_lines on public.rr_driver_tool_records
  (operator_id,sha256,(case when fuel_type in ('def','reefer') then fuel_type else 'propulsion_or_unknown' end))
  where sha256 is not null and kind='fuel';

-- Remember every successful request key, including one replaying an existing original.
create table rr_lease_private.driver_tool_requests (
  operator_id uuid not null,
  request_id uuid not null,
  record_id uuid not null,
  primary key (operator_id,request_id),
  foreign key (operator_id,record_id) references public.rr_driver_tool_records(operator_id,id)
);
alter table rr_lease_private.driver_tool_files enable row level security;
alter table rr_lease_private.driver_tool_requests enable row level security;
alter table public.rr_driver_tool_records enable row level security;
revoke all on rr_lease_private.driver_tool_files,rr_lease_private.driver_tool_requests,public.rr_driver_tool_records
  from public,anon,authenticated,service_role;
grant select on public.rr_driver_tool_records to authenticated;
create policy rr_driver_tool_members_read on public.rr_driver_tool_records for select to authenticated using (
  public.rr_driver_tools_enabled(operator_id)
);

create function rr_lease_private.driver_tool_save(p_operator_id uuid, p_request_id uuid, p_record jsonb, file_bytes bytea)
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
    and public.rr_driver_tools_enabled(o.id) and actor in (o.carrier_user_id,o.driver_user_id) for update;
  if not found then raise exception 'Workspace access required' using errcode='42501'; end if;
  if p_request_id is null or jsonb_typeof(p_record) is distinct from 'object' then
    raise exception 'A request key and record are required' using errcode='22023';
  end if;
  if p_record - input_fields <> '{}'::jsonb then raise exception 'Unsupported record field' using errcode='22023'; end if;
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

create function public.rr_driver_save_record(p_operator_id uuid, p_request_id uuid, p_record jsonb, p_file_base64 text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare original bytea;
begin
  if not public.rr_driver_tools_enabled(p_operator_id) then raise exception 'Workspace access required' using errcode='42501'; end if;
  if p_file_base64 is not null then
    if octet_length(p_file_base64) not between 1 and 5592408 then raise exception 'Use chunk upload for originals over 4 MiB' using errcode='22023'; end if;
    original := decode(p_file_base64,'base64');
    if octet_length(original) not between 1 and 4194304 then raise exception 'Use chunk upload for originals over 4 MiB' using errcode='22023'; end if;
  end if;
  return rr_lease_private.driver_tool_save(p_operator_id,p_request_id,p_record,original);
end $$;

create function public.rr_driver_download_evidence(p_record_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare encoded text;
begin
  select replace(encode(f.contents,'base64'),chr(10),'') into encoded from public.rr_driver_tool_records r
    join public.rr_lease_operators o on o.id=r.operator_id
    join rr_lease_private.driver_tool_files f on f.operator_id=r.operator_id and f.sha256=r.sha256
    where r.id=p_record_id and r.byte_size <= 4194304 and public.rr_driver_tools_enabled(o.id) and auth.uid() in (o.carrier_user_id,o.driver_user_id);
  if not found then raise exception 'Original unavailable for this account' using errcode='42501'; end if;
  return encoded;
end $$;

revoke all on function public.rr_driver_save_record(uuid,uuid,jsonb,text),public.rr_driver_download_evidence(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rr_driver_save_record(uuid,uuid,jsonb,text),public.rr_driver_download_evidence(uuid) to authenticated;

-- Authorize staging separately from freight and wallet intake. Only completed data is listed.
create table rr_lease_private.driver_uploads (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.rr_lease_operators(id),
  created_by uuid not null references auth.users(id),
  request_id uuid not null,
  record_input jsonb not null check (jsonb_typeof(record_input)='object' and octet_length(record_input::text)<=16384),
  byte_size integer not null check (byte_size between 4194305 and 33554432),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  touched_at timestamptz not null default now(),
  record_id uuid,
  foreign key (operator_id,record_id) references public.rr_driver_tool_records(operator_id,id),
  unique (operator_id,created_by,request_id)
);
create index rr_driver_upload_expiry on rr_lease_private.driver_uploads(touched_at) where record_id is null;
create table rr_lease_private.driver_upload_chunks (
  upload_id uuid not null references rr_lease_private.driver_uploads(id) on delete cascade,
  chunk_index integer not null check (chunk_index between 0 and 63),
  contents bytea not null check (octet_length(contents) between 1 and 524288),
  primary key (upload_id,chunk_index)
);
alter table rr_lease_private.driver_uploads enable row level security;
alter table rr_lease_private.driver_upload_chunks enable row level security;
revoke all on rr_lease_private.driver_uploads,rr_lease_private.driver_upload_chunks from public,anon,authenticated,service_role;

create function public.rr_driver_upload_begin(p_operator_id uuid,p_request_id uuid,p_record jsonb,p_byte_size integer,p_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  stage rr_lease_private.driver_uploads;
  received jsonb;
begin
  perform 1 from public.rr_lease_operators o where o.id=p_operator_id and public.rr_driver_tools_enabled(o.id) and actor in (o.carrier_user_id,o.driver_user_id) for update;
  if not found then raise exception 'Workspace access required' using errcode='42501'; end if;
  if p_request_id is null or jsonb_typeof(p_record) is distinct from 'object' or octet_length(p_record::text)>16384
    or p_byte_size is null or p_byte_size not between 4194305 and 33554432 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid large upload metadata or size' using errcode='22023';
  end if;
  -- Expired chunks are inaccessible immediately and reclaimed on the next uploads.
  delete from rr_lease_private.driver_uploads where id in (
    select id from rr_lease_private.driver_uploads where operator_id=p_operator_id and record_id is null and touched_at < now()-interval '24 hours'
    order by touched_at limit 20 for update skip locked
  );
  select * into stage from rr_lease_private.driver_uploads where operator_id=p_operator_id and created_by=actor and request_id=p_request_id;
  if stage.id is not null and stage.record_id is null and stage.touched_at < now()-interval '24 hours' then
    delete from rr_lease_private.driver_uploads where id=stage.id;
    stage.id := null;
  end if;
  if stage.id is null then
    if (select count(*) from rr_lease_private.driver_uploads where operator_id=p_operator_id and record_id is null
        and touched_at>=now()-interval '24 hours') >= 4 then
      raise exception 'Finish a pending upload before starting another' using errcode='22023';
    end if;
    insert into rr_lease_private.driver_uploads(operator_id,created_by,request_id,record_input,byte_size,sha256)
      values(p_operator_id,actor,p_request_id,p_record,p_byte_size,p_sha256) returning * into stage;
  elsif (p_record,p_byte_size,p_sha256) is distinct from (stage.record_input,stage.byte_size,stage.sha256) then
    raise exception 'Upload request already has different details' using errcode='23505';
  end if;
  select coalesce(jsonb_agg(chunk_index order by chunk_index),'[]'::jsonb) into received
    from rr_lease_private.driver_upload_chunks where upload_id=stage.id;
  return jsonb_build_object('upload_id',stage.id,'record_id',stage.record_id,'received',received);
end $$;

-- Lock workspace then stage in the same order as begin/save. Changing membership voids access.
create function rr_lease_private.driver_upload_lock(p_upload_id uuid)
returns rr_lease_private.driver_uploads language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  stage rr_lease_private.driver_uploads;
begin
  perform 1 from public.rr_lease_operators o where o.id=(
    select operator_id from rr_lease_private.driver_uploads where id=p_upload_id and created_by=actor)
    and public.rr_driver_tools_enabled(o.id) and actor in (o.carrier_user_id,o.driver_user_id) for update;
  if not found then raise exception 'Upload unavailable for this account' using errcode='42501'; end if;
  select * into stage from rr_lease_private.driver_uploads where id=p_upload_id and created_by=actor for update;
  if not found or (stage.record_id is null and stage.touched_at < now()-interval '24 hours') then
    raise exception 'Upload expired. Start it again' using errcode='22023';
  end if;
  return stage;
end $$;

create function public.rr_driver_upload_chunk(p_upload_id uuid,p_index integer,p_base64 text)
returns integer language plpgsql security definer set search_path='' as $$
declare
  stage rr_lease_private.driver_uploads := rr_lease_private.driver_upload_lock(p_upload_id);
  part bytea;
  previous bytea;
begin
  if stage.record_id is not null then raise exception 'Upload is already complete' using errcode='22023'; end if;
  if p_base64 is null or octet_length(p_base64) not between 1 and 699052
      or p_index is null or p_index not between 0 and (stage.byte_size-1)/524288 then
    raise exception 'Invalid upload chunk' using errcode='22023';
  end if;
  part := decode(p_base64,'base64');
  if octet_length(part) <> least(524288,stage.byte_size - p_index*524288) then
    raise exception 'Incorrect chunk size' using errcode='22023';
  end if;
  select contents into previous from rr_lease_private.driver_upload_chunks where upload_id=p_upload_id and chunk_index=p_index;
  if found then
    if previous<>part then raise exception 'Chunk already contains different bytes' using errcode='23505'; end if;
  else
    insert into rr_lease_private.driver_upload_chunks(upload_id,chunk_index,contents) values(p_upload_id,p_index,part);
  end if;
  update rr_lease_private.driver_uploads set touched_at=now() where id=p_upload_id;
  return p_index;
end $$;

create function public.rr_driver_finish_upload(p_upload_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  stage rr_lease_private.driver_uploads := rr_lease_private.driver_upload_lock(p_upload_id);
  original bytea;
  result uuid;
begin
  if stage.record_id is not null then return stage.record_id; end if;
  select string_agg(contents,''::bytea order by chunk_index) into original
    from rr_lease_private.driver_upload_chunks where upload_id=p_upload_id;
  if octet_length(original) is distinct from stage.byte_size then raise exception 'Upload is incomplete' using errcode='22023'; end if;
  if encode(sha256(original),'hex') <> stage.sha256 then raise exception 'Original checksum mismatch' using errcode='22023'; end if;
  result := rr_lease_private.driver_tool_save(stage.operator_id,stage.request_id,stage.record_input,original);
  update rr_lease_private.driver_uploads set record_id=result,touched_at=now() where id=p_upload_id;
  delete from rr_lease_private.driver_upload_chunks where upload_id=p_upload_id;
  return result;
end $$;

create function public.rr_driver_download_evidence_chunk(p_record_id uuid,p_index integer)
returns text language plpgsql stable security definer set search_path='' as $$
declare encoded text;
begin
  select replace(encode(substr(f.contents,1 + p_index*524288,524288),'base64'),chr(10),'') into encoded
    from public.rr_driver_tool_records r
    join public.rr_lease_operators o on o.id=r.operator_id
    join rr_lease_private.driver_tool_files f on f.operator_id=r.operator_id and f.sha256=r.sha256
    where r.id=p_record_id and public.rr_driver_tools_enabled(o.id) and auth.uid() in (o.carrier_user_id,o.driver_user_id)
      and p_index between 0 and (r.byte_size-1)/524288;
  if not found then raise exception 'Original chunk unavailable for this account' using errcode='42501'; end if;
  return encoded;
end $$;

revoke all on function rr_lease_private.driver_tool_save(uuid,uuid,jsonb,bytea),rr_lease_private.driver_upload_lock(uuid),
  public.rr_driver_upload_begin(uuid,uuid,jsonb,integer,text),public.rr_driver_upload_chunk(uuid,integer,text),
  public.rr_driver_finish_upload(uuid),public.rr_driver_download_evidence_chunk(uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.rr_driver_upload_begin(uuid,uuid,jsonb,integer,text),public.rr_driver_upload_chunk(uuid,integer,text),
  public.rr_driver_finish_upload(uuid),public.rr_driver_download_evidence_chunk(uuid,integer) to authenticated;