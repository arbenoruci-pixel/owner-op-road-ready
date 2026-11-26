-- Run in a disposable database after the lease migrations. Both drivers work for one carrier.
begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('44000000-0000-4000-8000-000000000001','carrier-driver@example.test',now()),
  ('44000000-0000-4000-8000-000000000002','contract-driver@example.test',now()),
  ('44000000-0000-4000-8000-000000000003','another-user@example.test',now());
insert into public.rr_lease_operators (id, carrier_user_id, driver_user_id, company_name, driver_name)
values ('45000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000002','Test Lease Company','Contract Driver');
insert into rr_lease_private.operator_invites (operator_id,email)
values ('45000000-0000-4000-8000-000000000001','contract-driver@example.test');

create function pg_temp.attach_fixture(p_load_id uuid, p_kind text, p_content text)
returns uuid language plpgsql as $$
declare
  doc_id uuid := gen_random_uuid();
  operator_id uuid;
  bytes bytea := convert_to(p_content, 'UTF8');
begin
  select l.operator_id into strict operator_id from public.rr_lease_loads l where l.id=p_load_id;
  insert into public.rr_lease_documents (id, load_id, kind, file_name, storage_path, mime_type, byte_size, sha256)
    values (doc_id, p_load_id, p_kind, p_kind||'.pdf', operator_id||'/'||p_load_id||'/'||doc_id,
      'application/pdf', length(bytes), encode(sha256(bytes),'hex'));
  perform public.rr_lease_put_chunk(doc_id, 0, encode(bytes,'base64'));
  perform public.rr_lease_finish_original(doc_id);
  return doc_id;
end $$;

set local role service_role;
do $$
declare
  owner_id uuid;
  driver_id uuid := '45000000-0000-4000-8000-000000000001';
  owner_load uuid;
  driver_load uuid;
  owner_rate uuid;
  driver_rate uuid;
  owner_pod uuid;
  driver_pod uuid;
  driver_packet uuid;
  retry_id uuid;
  driver_settlement uuid;
  attempted_payment_date timestamptz;
  result jsonb;
  fields jsonb := '{"pickup_address":"Dock A","delivery_address":"Dock B","gross_cents":100000,
     "steps":[{"title":"Pickup","detail":"Check in with dispatch"}]}';
begin
  owner_id := public.rr_lease_register_carrier_workspace('44000000-0000-4000-8000-000000000001',
    'Fixture Carrier','Carrier Driver','carrier-driver@example.test');
  owner_load := public.rr_lease_stage_load(owner_id,'Same broker','C12');
  driver_load := public.rr_lease_stage_load(driver_id,'Same broker','L57');
  assert owner_load <> driver_load;
  begin
    perform public.rr_lease_stage_load(driver_id,'same broker',' c12 ');
    assert false, 'One carrier load was opened again for its other driver';
  exception when raise_exception or unique_violation then null;
  end;
  owner_rate := pg_temp.attach_fixture(owner_load,'ratecon','owner rate');
  driver_rate := pg_temp.attach_fixture(driver_load,'ratecon','contractor rate');
  perform public.rr_lease_apply_mail(owner_rate,'provider-id:rate:1','dispatch@example.test','Confirmed carrier driver',fields);
  perform public.rr_lease_apply_mail(driver_rate,'provider-id:rate:2','dispatch@example.test','Confirmed contracted driver',fields);
  assert public.rr_lease_apply_intake(driver_rate,'owner_upload','chat:replayed',null,
    'Arben supplied the same original directly',fields)=driver_rate;

  -- A retried attachment from one mailbox cannot be filed under the other driver's load.
  retry_id := pg_temp.attach_fixture(driver_load,'ratecon','owner rate');
  begin
    perform public.rr_lease_apply_mail(retry_id,'provider-id:rate:1','dispatch@example.test','same original',fields);
    raise exception 'Cross-driver retry filed';
  exception when raise_exception then
    if sqlerrm not like 'Original already filed%' then raise; end if;
  end;
  assert not (select operator_visible from public.rr_lease_documents where id=retry_id);

  owner_pod := pg_temp.attach_fixture(owner_load,'pod','owner signed POD');
  driver_pod := pg_temp.attach_fixture(driver_load,'pod','contractor signed POD');
  begin
    perform public.rr_lease_apply_mail(driver_pod,'provider-id:pod:2','another-user@example.test','mismatched driver');
    raise exception 'Wrong sender accepted';
  exception when raise_exception then
    if sqlerrm not like 'POD sender%' then raise; end if;
  end;
  perform public.rr_lease_apply_mail(owner_pod,'provider-id:pod:1','carrier-driver@example.test','Owner booked and signed',
    p_verified_for_billing=>true);
  perform public.rr_lease_apply_intake(driver_pod,'owner_upload','chat:pod:2',null,
    'Carrier supplied matched signed contractor POD',p_verified_for_billing=>true);
  assert public.rr_lease_apply_mail(driver_pod,'provider-id:pod:2','contract-driver@example.test',
    'Operator and delivery verified',p_verified_for_billing=>true)=driver_pod;
  perform public.rr_lease_finalize_delivery(owner_load,owner_pod,'2025-11-25',true);
  perform public.rr_lease_finalize_delivery(driver_load,driver_pod,'2025-11-25',true);
  assert (select settlement_id is null from public.rr_lease_loads where id=owner_load);
  assert (select settlement_id is not null from public.rr_lease_loads where id=driver_load);
  assert not exists (select from public.rr_lease_settlements where operator_id=owner_id);

  driver_packet := pg_temp.attach_fixture(driver_load,'invoice','driver billing packet');
  begin
    perform public.rr_lease_claim_factoring(driver_load,driver_packet,'FIXTURE-L57',100000,owner_rate,array[driver_pod]);
    raise exception 'Wrong rate accepted';
  exception when raise_exception then
    if sqlerrm not like 'Current rate confirmation%' then raise; end if;
  end;
  begin
    perform public.rr_lease_claim_factoring(driver_load,driver_packet,'FIXTURE-L57',100000,driver_rate,array[owner_pod]);
    raise exception 'Wrong POD accepted';
  exception when raise_exception then
    if sqlerrm not like 'All current matched POD%' then raise; end if;
  end;
  result := public.rr_lease_claim_factoring(driver_load,driver_packet,'FIXTURE-L57',100000,driver_rate,array[driver_pod]);
  assert (result->>'send')::boolean;
  result := public.rr_lease_claim_factoring(driver_load,driver_packet,'FIXTURE-L57',100000,driver_rate,array[driver_pod]);
  assert not (result->>'send')::boolean;
  select settlement_id into strict driver_settlement from public.rr_lease_loads where id=driver_load;
  insert into public.rr_lease_cost_reviews(settlement_id,kind,outcome,evidence_reference)
    select driver_settlement,k,'none','Reviewed fixture evidence' from unnest(array['insurance','fuel','eld']) k;
  update public.rr_lease_settlements set status='issued' where id=driver_settlement;
  foreach attempted_payment_date in array array[now()+interval '1 day','infinity'::timestamptz] loop
    begin
      update public.rr_lease_settlements set status='paid',paid_at=attempted_payment_date,
        payment_reference='bank fixture',payment_amount_cents=92000 where id=driver_settlement;
      assert false, 'Accepted an unexecuted future payment';
    exception when raise_exception then
      if sqlerrm not like 'Use the actual bank payment date%' then raise; end if;
    end;
  end loop;
  assert (select status='issued' and paid_at is null from public.rr_lease_settlements where id=driver_settlement);
  perform set_config('fixture.owner_pod',owner_pod::text,true);
  perform set_config('fixture.driver_pod',driver_pod::text,true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$begin
  assert (select count(*) from public.rr_lease_loads where broker_name='Same broker')=1;
  assert not exists (select from public.rr_lease_documents where id=current_setting('fixture.owner_pod')::uuid);
  assert convert_from(decode(public.rr_lease_download_chunk(current_setting('fixture.driver_pod')::uuid,0),'base64'),'UTF8')
    ='contractor signed POD';
  begin
    perform public.rr_lease_download_chunk(current_setting('fixture.owner_pod')::uuid,0);
    raise exception 'Contract driver accessed the owner POD';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims','{"sub":"44000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$begin
  assert not exists(select from public.rr_lease_loads where broker_name='Same broker');
  assert not exists(select from public.rr_lease_documents where id=current_setting('fixture.driver_pod')::uuid);
end $$;
rollback;
