-- Append-only owner confirmations. These do not edit logs, documents or the
-- device-authoritative account workspace. Reopen by appending an 'open' review.
create table public.road_ready_shipment_reviews (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 driver_id text not null check (length(driver_id) between 1 and 200),
 pickup_event_id text not null check (length(pickup_event_id) between 1 and 300),
 pickup_day date not null,
 shipment_reference text not null check (length(shipment_reference) between 1 and 200),
 status text not null check (status in ('completed','open')),
 basis text not null check (basis='user_confirmed'),
 confirmed_at timestamptz not null default now(),
 reason text not null check (length(reason) between 1 and 1000)
);
create index road_ready_shipment_reviews_owner_time on public.road_ready_shipment_reviews(user_id,confirmed_at,id);
alter table public.road_ready_shipment_reviews enable row level security;
revoke all on public.road_ready_shipment_reviews from public,anon,authenticated,service_role;
grant select on public.road_ready_shipment_reviews to authenticated;
grant select,insert on public.road_ready_shipment_reviews to service_role;
create policy "Owner reads shipment confirmations" on public.road_ready_shipment_reviews for select to authenticated using ((select auth.uid())=user_id);
comment on table public.road_ready_shipment_reviews is 'Explicit operational completion reviews; no fabricated delivery dates or signed delivery evidence. Authorized support appends reviews after owner confirmation.';
