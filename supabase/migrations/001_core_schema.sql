-- Owner-Op Road Ready — core database schema
-- Phase 2: immutable duty event ledger, log day certification, document wallet, sync mutation receipts.

create extension if not exists "pgcrypto";

create type public.duty_status as enum ('OFF', 'SB', 'D', 'ON');
create type public.duty_event_action as enum ('create', 'edit', 'void');
create type public.duty_event_source as enum ('manual', 'system', 'import', 'gps_assisted');
create type public.special_duty_mode as enum ('none', 'personal_conveyance', 'yard_move');
create type public.document_type as enum (
  'driver_license',
  'medical_card',
  'insurance',
  'registration',
  'annual_inspection',
  'bol',
  'pod',
  'fuel_receipt',
  'scale_ticket',
  'inspection_photo',
  'other'
);
create type public.document_status as enum ('active', 'archived', 'voided');
create type public.sync_mutation_status as enum ('pending', 'processed', 'failed', 'duplicate');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'driver',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  timezone text not null default 'America/Chicago',
  hos_cycle text not null default '70_8',
  hos_property_carrying boolean not null default true,
  exempt_eld boolean not null default true,
  license_number text,
  license_state text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_drivers_user_id on public.drivers(user_id);

create table public.driver_signatures (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_bucket text not null default 'driver-documents',
  storage_path text not null,
  mime_type text not null default 'image/png',
  sha256 text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(driver_id, storage_path)
);

create index idx_driver_signatures_driver on public.driver_signatures(driver_id);

create table public.log_days (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  log_date date not null,
  timezone text not null,
  certification_status text not null default 'not_certified',
  certified_at timestamptz,
  certified_by uuid references auth.users(id),
  signature_id uuid references public.driver_signatures(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(driver_id, log_date),
  constraint log_days_certification_status check (
    certification_status in ('not_certified', 'certified', 'needs_recertification')
  )
);

create index idx_log_days_driver_date on public.log_days(driver_id, log_date);

create table public.duty_events (
  id uuid primary key default gen_random_uuid(),

  -- Client-generated ID for idempotency. Every create/edit/void revision has one.
  client_event_id uuid not null,

  -- Stable ID for the same logical event across versions.
  event_chain_id uuid not null,
  version integer not null default 1,
  action public.duty_event_action not null,

  driver_id uuid not null references public.drivers(id) on delete cascade,
  log_day_id uuid references public.log_days(id) on delete set null,
  log_date date not null,
  timezone text not null,

  status public.duty_status,
  special_mode public.special_duty_mode not null default 'none',

  start_time timestamptz,
  end_time timestamptz,
  start_min integer,
  end_min integer,

  location_city text,
  location_state text,
  location_text text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  location_source text,

  note text,
  description text,
  source public.duty_event_source not null default 'manual',

  previous_event_id uuid references public.duty_events(id),
  change_reason text,

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  device_id text,
  client_created_at timestamptz,

  constraint duty_event_minute_bounds check (
    start_min is null
    or (
      start_min >= 0
      and start_min <= 1440
      and end_min >= 0
      and end_min <= 1440
      and end_min > start_min
    )
  ),
  constraint duty_event_time_bounds check (
    start_time is null
    or end_time is null
    or end_time > start_time
  ),
  constraint duty_event_unique_client unique(client_event_id),
  constraint duty_event_unique_version unique(event_chain_id, version)
);

create index idx_duty_events_driver_date on public.duty_events(driver_id, log_date);
create index idx_duty_events_chain on public.duty_events(event_chain_id, version desc);
create index idx_duty_events_previous on public.duty_events(previous_event_id);
create index idx_duty_events_created_at on public.duty_events(created_at desc);

create or replace view public.current_duty_events as
with ranked as (
  select
    de.*,
    row_number() over (
      partition by de.event_chain_id
      order by de.version desc, de.created_at desc
    ) as rn
  from public.duty_events de
)
select *
from ranked
where rn = 1
  and action <> 'void';

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_document_id uuid not null unique,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  type public.document_type not null default 'other',
  status public.document_status not null default 'active',
  storage_bucket text not null default 'driver-documents',
  storage_path text not null unique,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  sha256 text,
  title text,
  notes text,
  issued_on date,
  expires_on date,
  created_at timestamptz not null default now(),
  client_created_at timestamptz,
  device_id text
);

create index idx_documents_driver on public.documents(driver_id);
create index idx_documents_type on public.documents(driver_id, type);
create index idx_documents_expiry on public.documents(driver_id, expires_on);

create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  log_day_id uuid references public.log_days(id) on delete set null,
  duty_event_chain_id uuid,
  duty_event_revision_id uuid references public.duty_events(id) on delete set null,
  load_id uuid,
  relation_type text not null default 'supporting_document',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_document_links_document on public.document_links(document_id);
create index idx_document_links_driver on public.document_links(driver_id);
create index idx_document_links_log_day on public.document_links(log_day_id);
create index idx_document_links_event_chain on public.document_links(duty_event_chain_id);

create table public.sync_mutations (
  id uuid primary key default gen_random_uuid(),
  client_mutation_id uuid not null unique,
  user_id uuid not null references auth.users(id),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  entity text not null,
  operation text not null,
  entity_client_id uuid,
  payload jsonb not null,
  status public.sync_mutation_status not null default 'pending',
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_sync_mutations_driver on public.sync_mutations(driver_id, created_at desc);
create index idx_sync_mutations_status on public.sync_mutations(status);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger trg_drivers_touch_updated_at
before update on public.drivers
for each row execute function public.touch_updated_at();

create trigger trg_log_days_touch_updated_at
before update on public.log_days
for each row execute function public.touch_updated_at();

create or replace function public.prevent_duty_event_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'duty_events are immutable. Use append-only revisions.';
end;
$$;

create trigger trg_prevent_duty_event_update
before update on public.duty_events
for each row execute function public.prevent_duty_event_update_delete();

create trigger trg_prevent_duty_event_delete
before delete on public.duty_events
for each row execute function public.prevent_duty_event_update_delete();

create or replace function public.mark_log_day_needs_recertification()
returns trigger
language plpgsql
as $$
begin
  update public.log_days
  set certification_status = 'needs_recertification',
      updated_at = now()
  where id = new.log_day_id
    and certification_status = 'certified'
    and new.action in ('edit', 'void');

  return new;
end;
$$;

create trigger trg_mark_log_day_needs_recertification
after insert on public.duty_events
for each row execute function public.mark_log_day_needs_recertification();
