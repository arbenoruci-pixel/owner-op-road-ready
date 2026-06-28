-- Owner-Op Road Ready — operational tables for row-based foundation.
-- Adds pre-trip inspection records, certification history, GPS/IFTA base tables and audit log.

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  client_inspection_id uuid not null unique,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  log_day_id uuid references public.log_days(id) on delete set null,
  log_date date not null,
  timezone text not null,
  type text not null default 'pretrip',
  status text not null default 'completed',
  checked_items jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  source text not null default 'manual_inspection_form',
  source_event_local_id text,
  source_event_chain_id uuid,
  source_start_min integer,
  source_end_min integer,
  location_city text,
  location_state text,
  location_source text,
  notes text,
  created_by uuid not null references auth.users(id),
  device_id text,
  client_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspections_type_check check (type in ('pretrip', 'posttrip', 'other')),
  constraint inspections_status_check check (status in ('open', 'completed', 'voided')),
  constraint inspections_minutes_check check (
    source_start_min is null
    or (
      source_start_min >= 0
      and source_start_min <= 1440
      and source_end_min >= 0
      and source_end_min <= 1440
      and source_end_min >= source_start_min
    )
  )
);

create index if not exists idx_inspections_driver_date on public.inspections(driver_id, log_date);
create index if not exists idx_inspections_updated_at on public.inspections(updated_at desc);
create index if not exists idx_inspections_source_event on public.inspections(source_event_chain_id);

create table if not exists public.certification_events (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  log_day_id uuid references public.log_days(id) on delete set null,
  log_date date not null,
  action text not null,
  signature_id uuid references public.driver_signatures(id) on delete set null,
  reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  device_id text,
  constraint certification_events_action_check check (action in ('certify', 'recertify', 'uncertify'))
);

create index if not exists idx_certification_events_driver_date on public.certification_events(driver_id, log_date, created_at desc);

create table if not exists public.gps_trips (
  id uuid primary key default gen_random_uuid(),
  client_trip_id uuid not null unique,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  duty_event_chain_id uuid,
  status text not null default 'active',
  started_at timestamptz not null,
  stopped_at timestamptz,
  start_trigger text,
  total_miles numeric(12, 3) not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  device_id text,
  constraint gps_trips_status_check check (status in ('active', 'stopped', 'discarded'))
);

create index if not exists idx_gps_trips_driver_started on public.gps_trips(driver_id, started_at desc);

create table if not exists public.gps_points (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.gps_trips(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  recorded_at timestamptz not null,
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  accuracy_meters numeric(10, 2),
  speed_mps numeric(10, 3),
  heading numeric(10, 3),
  state_code text,
  created_at timestamptz not null default now()
);

create index if not exists idx_gps_points_trip_time on public.gps_points(trip_id, recorded_at);
create index if not exists idx_gps_points_driver_time on public.gps_points(driver_id, recorded_at desc);

create table if not exists public.ifta_state_miles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  trip_id uuid references public.gps_trips(id) on delete cascade,
  quarter text not null,
  state_code text not null,
  miles numeric(12, 3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(driver_id, trip_id, quarter, state_code)
);

create index if not exists idx_ifta_state_miles_driver_quarter on public.ifta_state_miles(driver_id, quarter);

create table if not exists public.fuel_receipts (
  id uuid primary key default gen_random_uuid(),
  client_fuel_receipt_id uuid not null unique,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  purchased_at timestamptz,
  state_code text,
  gallons numeric(12, 3),
  total_amount numeric(12, 2),
  vendor text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  device_id text
);

create index if not exists idx_fuel_receipts_driver_date on public.fuel_receipts(driver_id, purchased_at desc);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.drivers(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  entity text not null,
  entity_id uuid,
  action text not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  device_id text
);

create index if not exists idx_audit_log_driver_time on public.audit_log(driver_id, created_at desc);
create index if not exists idx_audit_log_entity on public.audit_log(entity, entity_id);

create trigger trg_inspections_touch_updated_at
before update on public.inspections
for each row execute function public.touch_updated_at();

create trigger trg_gps_trips_touch_updated_at
before update on public.gps_trips
for each row execute function public.touch_updated_at();

create trigger trg_ifta_state_miles_touch_updated_at
before update on public.ifta_state_miles
for each row execute function public.touch_updated_at();

create trigger trg_fuel_receipts_touch_updated_at
before update on public.fuel_receipts
for each row execute function public.touch_updated_at();

alter table public.inspections enable row level security;
alter table public.certification_events enable row level security;
alter table public.gps_trips enable row level security;
alter table public.gps_points enable row level security;
alter table public.ifta_state_miles enable row level security;
alter table public.fuel_receipts enable row level security;
alter table public.audit_log enable row level security;

create policy "inspections_select_own"
on public.inspections
for select
using (
  exists (
    select 1 from public.drivers d
    where d.id = inspections.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "inspections_insert_own"
on public.inspections
for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.drivers d
    where d.id = inspections.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "inspections_update_own"
on public.inspections
for update
using (
  exists (
    select 1 from public.drivers d
    where d.id = inspections.driver_id
      and d.user_id = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.drivers d
    where d.id = inspections.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "certification_events_select_own"
on public.certification_events
for select
using (
  exists (
    select 1 from public.drivers d
    where d.id = certification_events.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "certification_events_insert_own"
on public.certification_events
for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.drivers d
    where d.id = certification_events.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "gps_trips_select_own"
on public.gps_trips
for select
using (exists (select 1 from public.drivers d where d.id = gps_trips.driver_id and d.user_id = auth.uid()));

create policy "gps_trips_insert_own"
on public.gps_trips
for insert
with check (created_by = auth.uid() and exists (select 1 from public.drivers d where d.id = gps_trips.driver_id and d.user_id = auth.uid()));

create policy "gps_trips_update_own"
on public.gps_trips
for update
using (exists (select 1 from public.drivers d where d.id = gps_trips.driver_id and d.user_id = auth.uid()))
with check (created_by = auth.uid() and exists (select 1 from public.drivers d where d.id = gps_trips.driver_id and d.user_id = auth.uid()));

create policy "gps_points_select_own"
on public.gps_points
for select
using (exists (select 1 from public.drivers d where d.id = gps_points.driver_id and d.user_id = auth.uid()));

create policy "gps_points_insert_own"
on public.gps_points
for insert
with check (exists (select 1 from public.drivers d where d.id = gps_points.driver_id and d.user_id = auth.uid()));

create policy "ifta_state_miles_select_own"
on public.ifta_state_miles
for select
using (exists (select 1 from public.drivers d where d.id = ifta_state_miles.driver_id and d.user_id = auth.uid()));

create policy "ifta_state_miles_insert_own"
on public.ifta_state_miles
for insert
with check (exists (select 1 from public.drivers d where d.id = ifta_state_miles.driver_id and d.user_id = auth.uid()));

create policy "ifta_state_miles_update_own"
on public.ifta_state_miles
for update
using (exists (select 1 from public.drivers d where d.id = ifta_state_miles.driver_id and d.user_id = auth.uid()))
with check (exists (select 1 from public.drivers d where d.id = ifta_state_miles.driver_id and d.user_id = auth.uid()));

create policy "fuel_receipts_select_own"
on public.fuel_receipts
for select
using (exists (select 1 from public.drivers d where d.id = fuel_receipts.driver_id and d.user_id = auth.uid()));

create policy "fuel_receipts_insert_own"
on public.fuel_receipts
for insert
with check (created_by = auth.uid() and exists (select 1 from public.drivers d where d.id = fuel_receipts.driver_id and d.user_id = auth.uid()));

create policy "fuel_receipts_update_own"
on public.fuel_receipts
for update
using (exists (select 1 from public.drivers d where d.id = fuel_receipts.driver_id and d.user_id = auth.uid()))
with check (created_by = auth.uid() and exists (select 1 from public.drivers d where d.id = fuel_receipts.driver_id and d.user_id = auth.uid()));

create policy "audit_log_select_own"
on public.audit_log
for select
using (exists (select 1 from public.drivers d where d.id = audit_log.driver_id and d.user_id = auth.uid()));
