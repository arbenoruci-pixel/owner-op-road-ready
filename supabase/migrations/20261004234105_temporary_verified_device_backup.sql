-- Additive temporary copies; existing files, logs and local records are untouched.
create table public.road_ready_backup_settings (
 user_id uuid primary key references auth.users(id), enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.road_ready_backup_devices (
 user_id uuid not null references auth.users(id), device_id uuid not null,
 status text not null check(status in ('preparing','uploading','verified','partial','error')),
 details jsonb not null default '{}'::jsonb check(pg_column_size(details)<65536),
 app_version text not null, seen_at timestamptz not null default now(), primary key(user_id,device_id)
);
create table public.road_ready_backup_snapshots (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),device_id uuid not null,
 created_at timestamptz not null default now(), app_version text not null,
 manifest_sha text not null check(manifest_sha ~ '^[a-f0-9]{64}$'),
 manifest jsonb not null check(jsonb_typeof(manifest)='object' and pg_column_size(manifest)<8388608),
 review jsonb not null check(jsonb_typeof(review)='object' and pg_column_size(review)<8388608),
 missing_originals integer not null check(missing_originals>=0)
);
create index road_ready_backup_snapshots_device on public.road_ready_backup_snapshots(user_id,device_id,created_at desc);
alter table public.road_ready_backup_settings enable row level security;
alter table public.road_ready_backup_devices enable row level security;
alter table public.road_ready_backup_snapshots enable row level security;
revoke all on public.road_ready_backup_settings,public.road_ready_backup_devices,public.road_ready_backup_snapshots from public,anon,authenticated;
grant select on public.road_ready_backup_settings to authenticated;
grant select,insert,update on public.road_ready_backup_devices to authenticated;
grant select,insert on public.road_ready_backup_snapshots to authenticated;
create policy backup_settings_read on public.road_ready_backup_settings for select to authenticated using(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>'approved')::boolean);
create policy backup_devices_read on public.road_ready_backup_devices for select to authenticated using(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>'approved')::boolean);
create policy backup_devices_insert on public.road_ready_backup_devices for insert to authenticated with check(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>'approved')::boolean);
create policy backup_devices_update on public.road_ready_backup_devices for update to authenticated using(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>'approved')::boolean) with check(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>'approved')::boolean);
create policy backup_snapshots_read on public.road_ready_backup_snapshots for select to authenticated using(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>'approved')::boolean);
create policy backup_snapshots_insert on public.road_ready_backup_snapshots for insert to authenticated with check(user_id=(select auth.uid()) and ((select public.owner_op_access_v1())->>'approved')::boolean);

create function owner_op.validate_device_backup_v1() returns trigger language plpgsql security invoker set search_path='' as $$
declare f jsonb;c jsonb; total bigint;
begin
 if new.user_id<>auth.uid() or auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if not exists(select 1 from public.road_ready_backup_settings where user_id=auth.uid() and enabled) then raise exception 'Temporary backup is disabled';end if;
 if new.manifest->>'format' is distinct from 'road_ready_cloud_mirror_v1' or jsonb_typeof(new.manifest->'files') is distinct from 'array' or jsonb_array_length(new.manifest->'files')<1 then raise exception 'Invalid backup index';end if;
 for f in select * from jsonb_array_elements(new.manifest->'files') loop
  if coalesce(f->>'name','')='' or position('..' in f->>'name')>0 or left(f->>'name',1)='/' or jsonb_typeof(f->'chunks') is distinct from 'array' then raise exception 'Invalid backup file';end if;
  total:=0;
  for c in select * from jsonb_array_elements(f->'chunks') loop
   if coalesce(c->>'sha256','') !~ '^[a-f0-9]{64}$' or (c->>'bytes')::bigint not between 1 and 1048576 then raise exception 'Invalid backup chunk';end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='owner-op-private' and o.name=new.user_id::text||'/temporary-backup/'||(c->>'sha256')||'.bin' and (o.metadata->>'size')::bigint=(c->>'bytes')::bigint) then raise exception 'A backup chunk has not been stored';end if;
   total:=total+(c->>'bytes')::bigint;
  end loop;
  if total is distinct from (f->>'size')::bigint then raise exception 'Backup file size mismatch';end if;
 end loop;
 return new;
end $$;
revoke all on function owner_op.validate_device_backup_v1() from public,anon,authenticated;
create trigger validate_device_backup before insert on public.road_ready_backup_snapshots for each row execute function owner_op.validate_device_backup_v1();

create function public.road_ready_commit_backup_v1(p_device uuid,p_manifest jsonb,p_manifest_sha text,p_review jsonb,p_missing integer,p_version text) returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='30s' as $$
declare result public.road_ready_backup_snapshots%rowtype;
begin
 insert into public.road_ready_backup_snapshots(user_id,device_id,manifest,manifest_sha,review,missing_originals,app_version)
 values(auth.uid(),p_device,p_manifest,p_manifest_sha,p_review,p_missing,left(p_version,40)) returning * into result;
 return jsonb_build_object('id',result.id,'created_at',result.created_at);
end $$;
revoke all on function public.road_ready_commit_backup_v1(uuid,jsonb,text,jsonb,integer,text) from public,anon;
grant execute on function public.road_ready_commit_backup_v1(uuid,jsonb,text,jsonb,integer,text) to authenticated;
