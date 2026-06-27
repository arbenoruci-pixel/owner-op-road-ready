-- Owner-Op Road Ready — Row Level Security policies

alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_signatures enable row level security;
alter table public.log_days enable row level security;
alter table public.duty_events enable row level security;
alter table public.documents enable row level security;
alter table public.document_links enable row level security;
alter table public.sync_mutations enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles
for insert
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "drivers_select_own"
on public.drivers
for select
using (user_id = auth.uid());

create policy "drivers_insert_own"
on public.drivers
for insert
with check (user_id = auth.uid());

create policy "drivers_update_own"
on public.drivers
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "driver_signatures_select_own"
on public.driver_signatures
for select
using (
  exists (
    select 1
    from public.drivers d
    where d.id = driver_signatures.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "driver_signatures_insert_own"
on public.driver_signatures
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.drivers d
    where d.id = driver_signatures.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "log_days_select_own"
on public.log_days
for select
using (
  exists (
    select 1
    from public.drivers d
    where d.id = log_days.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "log_days_insert_own"
on public.log_days
for insert
with check (
  exists (
    select 1
    from public.drivers d
    where d.id = log_days.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "log_days_update_own"
on public.log_days
for update
using (
  exists (
    select 1
    from public.drivers d
    where d.id = log_days.driver_id
      and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.drivers d
    where d.id = log_days.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "duty_events_select_own"
on public.duty_events
for select
using (
  exists (
    select 1
    from public.drivers d
    where d.id = duty_events.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "duty_events_insert_own"
on public.duty_events
for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.drivers d
    where d.id = duty_events.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "documents_select_own"
on public.documents
for select
using (
  exists (
    select 1
    from public.drivers d
    where d.id = documents.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "documents_insert_own"
on public.documents
for insert
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.drivers d
    where d.id = documents.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "documents_update_own_metadata"
on public.documents
for update
using (
  exists (
    select 1
    from public.drivers d
    where d.id = documents.driver_id
      and d.user_id = auth.uid()
  )
)
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.drivers d
    where d.id = documents.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "document_links_select_own"
on public.document_links
for select
using (
  exists (
    select 1
    from public.drivers d
    where d.id = document_links.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "document_links_insert_own"
on public.document_links
for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.drivers d
    where d.id = document_links.driver_id
      and d.user_id = auth.uid()
  )
);

create policy "sync_mutations_select_own"
on public.sync_mutations
for select
using (user_id = auth.uid());

create policy "sync_mutations_insert_own"
on public.sync_mutations
for insert
with check (user_id = auth.uid());

create policy "sync_mutations_update_own"
on public.sync_mutations
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
