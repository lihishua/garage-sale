-- ============================================================
--  Garage Sale — run this once in Supabase → SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- tables ----------

create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null,
  phone        text not null,          -- never exposed publicly, see public_sales
  slug         text not null unique,
  created_at   timestamptz not null default now()
);

do $$ begin
  create type item_status as enum ('available', 'reserved', 'sold');
exception when duplicate_object then null; end $$;

create table if not exists items (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references profiles(id) on delete cascade,
  title        text not null,
  description  text not null,
  price        integer not null check (price > 0),   -- per unit
  bundle_price integer check (bundle_price > 0),     -- optional "all for"
  tags         text[] not null default '{}',
  measurements text,
  created_at   timestamptz not null default now()
);
create index if not exists items_seller_idx on items (seller_id, created_at desc);

create table if not exists item_units (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references items(id) on delete cascade,
  photo_path        text not null,
  thumb_path        text not null,
  position          integer not null default 0,      -- 0 is the cover
  status            item_status not null default 'available',
  -- deliberately NO reserved_by_* columns: this table is world-readable,
  -- so buyer contact details live only in `requests`. See Global Constraints.
  created_at        timestamptz not null default now()
);
create index if not exists item_units_item_idx on item_units (item_id, position);

create table if not exists staged_photos (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid not null references profiles(id) on delete cascade,
  photo_path text not null,
  thumb_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists staged_photos_seller_idx on staged_photos (seller_id, created_at);

create table if not exists requests (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references profiles(id) on delete cascade,
  buyer_name  text not null,
  buyer_phone text not null,
  created_at  timestamptz not null default now()
);
create index if not exists requests_seller_idx on requests (seller_id, created_at desc);

create table if not exists request_items (
  request_id uuid references requests(id) on delete cascade,
  unit_id    uuid references item_units(id) on delete cascade,
  primary key (request_id, unit_id)
);

-- ---------- what the public may see about a seller ----------
-- the phone number is deliberately not in here. buyers only get it
-- back from reserve_items(), after they have actually asked for something.

drop view if exists public_sales;
create view public_sales with (security_invoker = off) as
  select id, display_name, slug from profiles;

grant select on public_sales to anon, authenticated;

-- ---------- row level security ----------

alter table profiles      enable row level security;
alter table items         enable row level security;
alter table item_units    enable row level security;
alter table staged_photos enable row level security;
alter table requests      enable row level security;
alter table request_items enable row level security;

drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "anyone can browse items" on items;
create policy "anyone can browse items" on items
  for select using (true);

drop policy if exists "sellers manage their own items" on items;
create policy "sellers manage their own items" on items
  for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());

drop policy if exists "anyone can browse units" on item_units;
create policy "anyone can browse units" on item_units
  for select using (true);

drop policy if exists "sellers manage their own units" on item_units;
create policy "sellers manage their own units" on item_units
  for all using (exists (
    select 1 from items i where i.id = item_units.item_id and i.seller_id = auth.uid()))
  with check (exists (
    select 1 from items i where i.id = item_units.item_id and i.seller_id = auth.uid()));

-- the pool is private; it is never public in any direction
drop policy if exists "sellers own their staged photos" on staged_photos;
create policy "sellers own their staged photos" on staged_photos
  for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());

drop policy if exists "sellers read their own requests" on requests;
create policy "sellers read their own requests" on requests
  for select using (seller_id = auth.uid());

drop policy if exists "sellers read their own request lines" on request_items;
create policy "sellers read their own request lines" on request_items
  for select using (exists (
    select 1 from requests r where r.id = request_id and r.seller_id = auth.uid()
  ));

-- note: nobody has insert rights on requests. buyers go through a
-- security-definer function, which is the only way a reservation can be
-- created. reserve_items() was dropped along with the old items shape;
-- Task 2 adds its replacement, reserve_units(), here.

-- ---------- photo storage ----------

insert into storage.buckets (id, name, public)
  values ('photos', 'photos', true)
  on conflict (id) do nothing;

drop policy if exists "photos are public" on storage.objects;
create policy "photos are public" on storage.objects
  for select using (bucket_id = 'photos');

drop policy if exists "sellers upload into their own folder" on storage.objects;
create policy "sellers upload into their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "sellers delete their own photos" on storage.objects;
create policy "sellers delete their own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
