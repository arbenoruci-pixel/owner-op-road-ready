-- Additive device inspection index and reversible, preconditioned corrections.
alter table public.road_ready_backup_settings add column record_sync_enabled boolean not null default false, add column review_after timestamptz;
create table public.road_ready_record_devices (
 user_id uuid not null references auth.users(id),device_id uuid not null,run_id uuid,status text not null default 'idle',lease_until timestamptz,
 started_at timestamptz,completed_at timestamptz,seen_at timestamptz not null default now(),record_count integer not null default 0,summary jsonb not null default '{}',app_version text not null default '',primary key(user_id,device_id)
);
create table public.road_ready_records (
 user_id uuid not null references auth.users(id),device_id uuid not null,record_key text not null check(length(record_key)<=700),kind text not null,
 origin text not null check(origin in ('device','backup_review')),locator jsonb not null default '{}',data jsonb not null,
 load_no text not null default '',driver_id text not null default '',day text not null default '',payload_hash text not null,
 revision bigint not null default 1,deleted boolean not null default false,last_seen_run uuid,captured_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(user_id,device_id,record_key),check(pg_column_size(data)<2097152)
);
create index road_ready_records_load on public.road_ready_records(user_id,load_no,kind) where not deleted;
create index road_ready_records_driver_day on public.road_ready_records(user_id,driver_id,day,kind) where not deleted;
create index road_ready_records_seen on public.road_ready_records(user_id,device_id,last_seen_run);
create table public.road_ready_record_history (
 id bigint generated always as identity primary key,user_id uuid not null,device_id uuid not null,record_key text not null,revision bigint not null,
 recorded_at timestamptz not null default now(),record jsonb not null,unique(user_id,device_id,record_key,revision)
);
create table public.road_ready_corrections (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),device_id uuid not null,record_key text not null,
 base_revision bigint not null,before_data jsonb not null,patch jsonb not null,unset text[] not null default '{}',locator jsonb not null,kind text not null,
 reason text not null check(length(reason) between 5 and 1000),created_at timestamptz not null default now(),created_by text not null default current_user,
 status text not null default 'pending' check(status in ('pending','applied','conflict','rejected','cancelled')),result jsonb not null default '{}',applied_at timestamptz,
 foreign key(user_id,device_id,record_key) references public.road_ready_records(user_id,device_id,record_key)
);
create index road_ready_corrections_pending on public.road_ready_corrections(user_id,device_id,created_at) where status='pending';
create table public.road_ready_correction_history (
 id bigint generated always as identity primary key,user_id uuid not null,correction_id uuid not null references public.road_ready_corrections(id),recorded_at timestamptz not null default now(),status text not null,result jsonb not null
);
create index road_ready_correction_history_owner on public.road_ready_correction_history(user_id,correction_id,recorded_at);

do $$ declare t text;begin
 foreach t in array array['road_ready_record_devices','road_ready_records','road_ready_record_history','road_ready_corrections','road_ready_correction_history'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>''approved'')::boolean)',t);
 end loop;
 foreach t in array array['road_ready_record_devices','road_ready_records','road_ready_record_history','road_ready_correction_history'] loop
 execute format('grant insert on public.%I to authenticated',t);
 execute format('create policy owner_insert on public.%I for insert to authenticated with check(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>''approved'')::boolean)',t);
 end loop;
 foreach t in array array['road_ready_record_devices','road_ready_records','road_ready_corrections'] loop
 execute format('create policy owner_update on public.%I for update to authenticated using(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>''approved'')::boolean) with check(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>''approved'')::boolean)',t);
 end loop;
end $$;
grant update on public.road_ready_record_devices,public.road_ready_records to authenticated;
grant update(status,result,applied_at) on public.road_ready_corrections to authenticated;
grant usage on sequence public.road_ready_record_history_id_seq,public.road_ready_correction_history_id_seq to authenticated;

create function owner_op.record_revision_v1() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
 if new.user_id<>old.user_id or new.device_id<>old.device_id or new.record_key<>old.record_key then raise exception 'Record identity cannot change';end if;
 if (new.data,new.locator,new.deleted,new.kind,new.origin,new.load_no,new.driver_id,new.day) is not distinct from (old.data,old.locator,old.deleted,old.kind,old.origin,old.load_no,old.driver_id,old.day) then new.revision:=old.revision;new.updated_at:=old.updated_at;return new;end if;
 new.revision:=old.revision+1;
 else new.revision:=1;end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
revoke all on function owner_op.record_revision_v1() from public,anon,authenticated;
create trigger record_revision before insert or update on public.road_ready_records for each row execute function owner_op.record_revision_v1();
create function owner_op.correction_audit_v1() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and old.status<>'pending' and new.status<>old.status then raise exception 'Completed correction is immutable; queue a new correction to undo';end if;
 if tg_op='INSERT' or (old.status,old.result) is distinct from (new.status,new.result) then
 insert into public.road_ready_correction_history(user_id,correction_id,status,result) values(new.user_id,new.id,new.status,new.result);end if;return new;
end $$;
revoke all on function owner_op.correction_audit_v1() from public,anon,authenticated;
create trigger correction_audit after insert or update on public.road_ready_corrections for each row execute function owner_op.correction_audit_v1();

create function public.road_ready_record_sync_v1(p_device uuid,p_run uuid,p_action text,p_records jsonb default '[]',p_count integer default 0,p_summary jsonb default '{}',p_version text default '') returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid();d public.road_ready_record_devices%rowtype;r jsonb;found_count integer;
begin
 if uid is null or not exists(select 1 from public.road_ready_backup_settings where user_id=uid and record_sync_enabled) then raise exception 'Record synchronization is disabled' using errcode='42501';end if;
 insert into public.road_ready_record_devices(user_id,device_id) values(uid,p_device) on conflict do nothing;
 select * into d from public.road_ready_record_devices where user_id=uid and device_id=p_device for update;
 if p_action='begin' then
 if d.status='uploading' and d.lease_until>now() and d.run_id<>p_run then return jsonb_build_object('busy',true);end if;
 update public.road_ready_record_devices set run_id=p_run,status='uploading',lease_until=now()+interval '5 minutes',started_at=now(),seen_at=now(),app_version=left(p_version,40) where user_id=uid and device_id=p_device;
 return jsonb_build_object('run',p_run);
 end if;
 if d.run_id is distinct from p_run then raise exception 'A newer synchronization has started';end if;
 if p_action='batch' then
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)>200 then raise exception 'Invalid record batch';end if;
 for r in select * from jsonb_array_elements(p_records) loop
 if not(r ? 'data') then
 update public.road_ready_records set last_seen_run=p_run,captured_at=now() where user_id=uid and device_id=p_device and record_key=r->>'record_key' and payload_hash=r->>'payload_hash' and not deleted;
 if not found then raise exception 'Cached record needs a full refresh';end if;
 else
 insert into public.road_ready_records(user_id,device_id,record_key,kind,origin,locator,data,load_no,driver_id,day,payload_hash,last_seen_run)
 values(uid,p_device,r->>'record_key',r->>'kind','device',r->'locator',r->'data',coalesce(r->>'load_no',''),coalesce(r->>'driver_id',''),coalesce(r->>'day',''),r->>'payload_hash',p_run)
 on conflict(user_id,device_id,record_key) do update set kind=excluded.kind,origin=excluded.origin,locator=excluded.locator,data=excluded.data,load_no=excluded.load_no,driver_id=excluded.driver_id,day=excluded.day,payload_hash=excluded.payload_hash,last_seen_run=p_run,captured_at=now(),deleted=false;
 end if;
 end loop;
 elsif p_action='finish' then
 select count(*) into found_count from public.road_ready_records where user_id=uid and device_id=p_device and last_seen_run=p_run;
 if found_count<>p_count then raise exception 'Synchronization count does not match';end if;
 update public.road_ready_records set deleted=true where user_id=uid and device_id=p_device and last_seen_run is distinct from p_run and not deleted;
 update public.road_ready_record_devices set status='current',record_count=p_count,completed_at=now(),summary=p_summary,seen_at=now(),lease_until=null where user_id=uid and device_id=p_device;
 return jsonb_build_object('complete',true,'records',p_count);
 elsif p_action='error' then
 update public.road_ready_record_devices set status='error',summary=p_summary,seen_at=now(),lease_until=null where user_id=uid and device_id=p_device;
 return jsonb_build_object('error',true);
 else raise exception 'Unknown synchronization action';end if;
 update public.road_ready_record_devices set lease_until=now()+interval '5 minutes',seen_at=now() where user_id=uid and device_id=p_device;
 return jsonb_build_object('saved',jsonb_array_length(p_records));
end $$;
revoke all on function public.road_ready_record_sync_v1(uuid,uuid,text,jsonb,integer,jsonb,text) from public,anon;
grant execute on function public.road_ready_record_sync_v1(uuid,uuid,text,jsonb,integer,jsonb,text) to authenticated;

-- Only the administrative connector can enqueue a correction. Device roles can acknowledge it.
create function owner_op.queue_record_correction_v1(p_user uuid,p_device uuid,p_key text,p_revision bigint,p_patch jsonb,p_reason text,p_unset text[] default '{}') returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.road_ready_records%rowtype;allowed text[];k text;result uuid;
begin
 select * into strict r from public.road_ready_records where user_id=p_user and device_id=p_device and record_key=p_key and not deleted for update;
 if r.origin<>'device' or r.revision<>p_revision then raise exception 'Refresh the device record before correcting it';end if;
 if not exists(select 1 from public.road_ready_backup_settings where user_id=p_user and record_sync_enabled) then raise exception 'Record synchronization is disabled';end if;
 allowed:=case r.kind
 when 'business_loads' then array['loadNo','broker','origin','destination','pickup','delivery','pickupDate','deliveryDate','gross','notes','status','documentWorkflowStage','bolNo','poNumber','pickupNumber','deliveryNumber','trailerId']
 when 'business_documents' then array['type','loadNo','date','documentDate','title','notes','broker','origin','destination','total','gross','bolNo','podSigned','stopSequence']
 when 'business_expenses' then array['date','amount','total','category','merchant','notes','loadNo']
 when 'business_fuel' then array['date','gallons','amount','total','state','merchant','notes','loadNo']
 when 'business_maintenance' then array['date','amount','total','type','vendor','notes','vehicle']
 when 'business_settlements' then array['date','amount','gross','net','notes','loadNo']
 when 'documents' then array['load_no','loadNo','type','document_type','document_date','title','expires_on','status','stopSequence','stop_sequence','extracted','classification']
 when 'routes' then array['loadNo','shippingDocs','fromCity','fromState','toCity','toState','pickupDay','deliveryDay','pickupDate','deliveryDate','status','notes']
 when 'wallet' then array['title','expiresOn','issuedOn','documentNumber','notes'] else array[]::text[] end;
 if jsonb_typeof(p_patch)<>'object' or pg_column_size(p_patch)>200000 then raise exception 'Invalid correction';end if;
 for k in select jsonb_object_keys(p_patch) union select unnest(p_unset) loop
 if not(k=any(allowed)) then raise exception 'Field % must use its original app workflow',k;end if;end loop;
 if p_patch='{}' and cardinality(p_unset)=0 then raise exception 'Empty correction';end if;
 insert into public.road_ready_corrections(user_id,device_id,record_key,base_revision,before_data,patch,unset,locator,kind,reason)
 values(p_user,p_device,p_key,p_revision,r.data,p_patch,p_unset,r.locator,r.kind,p_reason) returning id into result;return result;
end $$;
revoke all on function owner_op.queue_record_correction_v1(uuid,uuid,text,bigint,jsonb,text,text[]) from public,anon,authenticated;

create function owner_op.record_history_v1() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' or new.revision<>old.revision then
 insert into public.road_ready_record_history(user_id,device_id,record_key,revision,record) values(new.user_id,new.device_id,new.record_key,new.revision,to_jsonb(new));end if;
 return new;
end $$;
revoke all on function owner_op.record_history_v1() from public,anon,authenticated;
create trigger record_history after insert or update on public.road_ready_records for each row execute function owner_op.record_history_v1();

create function owner_op.index_verified_backup_v1(p_snapshot uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare s public.road_ready_backup_snapshots%rowtype;r jsonb;e jsonb;rows jsonb:='[]';i integer:=0;n integer:=0;
begin
 select * into strict s from public.road_ready_backup_snapshots where id=p_snapshot and missing_originals=0;
 for r in select * from jsonb_array_elements(s.review->'loads') loop
 i:=i+1;rows:=rows||jsonb_build_array(jsonb_build_object('key','load/'||i,'kind','business_loads','data',r,'load',r->>'loadNo'));end loop;
 i:=0;for r in select * from jsonb_array_elements(s.review->'documents') loop
 i:=i+1;rows:=rows||jsonb_build_array(jsonb_build_object('key','document/'||i,'kind','documents','data',r,'load',r->>'loadNo'));end loop;
 for r in select * from jsonb_array_elements(s.review->'logbook') loop
 rows:=rows||jsonb_build_array(jsonb_build_object('key','day/'||(r->>'driverId')||'/'||(r->>'day'),'kind','logbook_days','data',r,'driver',r->>'driverId','day',r->>'day'));
 i:=0;for e in select * from jsonb_array_elements(r->'events') loop
 i:=i+1;rows:=rows||jsonb_build_array(jsonb_build_object('key','event/'||(r->>'driverId')||'/'||(r->>'day')||'/'||i,'kind','duty_events','data',e,'driver',r->>'driverId','day',r->>'day','load',e->>'loadNo'));end loop;
 end loop;
 i:=0;for r in select * from jsonb_array_elements(s.manifest->'files') loop
 i:=i+1;rows:=rows||jsonb_build_array(jsonb_build_object('key','file/'||i,'kind','backup_files','data',r));end loop;
 for r in select * from jsonb_array_elements(rows) loop
 insert into public.road_ready_records(user_id,device_id,record_key,kind,origin,locator,data,load_no,driver_id,day,payload_hash,captured_at)
 values(s.user_id,s.device_id,'backup-review/'||(r->>'key'),r->>'kind','backup_review',jsonb_build_object('snapshotId',s.id),r->'data',coalesce(r->>'load',''),coalesce(r->>'driver',''),coalesce(r->>'day',''),md5((r->'data')::text),s.created_at)
 on conflict(user_id,device_id,record_key) do nothing;n:=n+1;
 end loop;
 insert into public.road_ready_record_devices(user_id,device_id,status,record_count,completed_at,summary,app_version)
 values(s.user_id,s.device_id,'indexed_backup',n,s.created_at,jsonb_build_object('backupId',s.id,'source','verified_backup','awaitingLiveIndex',true),s.app_version) on conflict do nothing;
 return n;
end $$;
revoke all on function owner_op.index_verified_backup_v1(uuid) from public,anon,authenticated;

create view public.road_ready_loads with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('business_loads');
grant select on public.road_ready_loads to authenticated;
revoke all on public.road_ready_loads from anon,public;

create view public.road_ready_documents with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('documents','business_documents');
grant select on public.road_ready_documents to authenticated;
revoke all on public.road_ready_documents from anon,public;

create view public.road_ready_logbook_days with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('logbook_days');
grant select on public.road_ready_logbook_days to authenticated;
revoke all on public.road_ready_logbook_days from anon,public;

create view public.road_ready_duty_events with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('duty_events');
grant select on public.road_ready_duty_events to authenticated;
revoke all on public.road_ready_duty_events from anon,public;

create view public.road_ready_drivers with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('drivers');
grant select on public.road_ready_drivers to authenticated;
revoke all on public.road_ready_drivers from anon,public;

create view public.road_ready_routes with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('routes');
grant select on public.road_ready_routes to authenticated;
revoke all on public.road_ready_routes from anon,public;

create view public.road_ready_wallet with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('wallet');
grant select on public.road_ready_wallet to authenticated;
revoke all on public.road_ready_wallet from anon,public;

create view public.road_ready_signatures with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('signatures');
grant select on public.road_ready_signatures to authenticated;
revoke all on public.road_ready_signatures from anon,public;

create view public.road_ready_inspections with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('inspections');
grant select on public.road_ready_inspections to authenticated;
revoke all on public.road_ready_inspections from anon,public;

create view public.road_ready_forms with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('forms');
grant select on public.road_ready_forms to authenticated;
revoke all on public.road_ready_forms from anon,public;

create view public.road_ready_settings with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('settings','local_settings','saved_records');
grant select on public.road_ready_settings to authenticated;
revoke all on public.road_ready_settings from anon,public;

create view public.road_ready_expenses with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('business_expenses','business_fuel','business_maintenance','business_settlements');
grant select on public.road_ready_expenses to authenticated;
revoke all on public.road_ready_expenses from anon,public;

create view public.road_ready_files with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('document_files','capture_assets','backup_files');
grant select on public.road_ready_files to authenticated;
revoke all on public.road_ready_files from anon,public;

create view public.road_ready_recovery with(security_invoker=true) as select user_id,device_id,record_key,revision,origin,load_no,driver_id,day,kind,data,locator,captured_at,updated_at from public.road_ready_records where not deleted and kind in ('recovery_history','recovery_snapshots');
grant select on public.road_ready_recovery to authenticated;
revoke all on public.road_ready_recovery from anon,public;
