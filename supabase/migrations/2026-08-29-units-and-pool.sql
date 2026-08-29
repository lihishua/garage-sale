-- item-level tables are empty; profiles is not and must survive
drop function if exists reserve_items(text, uuid[], text, text);
drop table if exists request_items cascade;
drop table if exists requests   cascade;
drop table if exists items      cascade;

create table items (
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
create index items_seller_idx on items (seller_id, created_at desc);

create table item_units (
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
create index item_units_item_idx on item_units (item_id, position);

create table staged_photos (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid not null references profiles(id) on delete cascade,
  photo_path text not null,
  thumb_path text not null,
  created_at timestamptz not null default now()
);
create index staged_photos_seller_idx on staged_photos (seller_id, created_at);

create table requests (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references profiles(id) on delete cascade,
  buyer_name  text not null,
  buyer_phone text not null,
  created_at  timestamptz not null default now()
);
create index requests_seller_idx on requests (seller_id, created_at desc);

create table request_items (
  request_id uuid references requests(id) on delete cascade,
  unit_id    uuid references item_units(id) on delete cascade,
  primary key (request_id, unit_id)
);

alter table items         enable row level security;
alter table item_units    enable row level security;
alter table staged_photos enable row level security;
alter table requests      enable row level security;
alter table request_items enable row level security;

create policy "anyone can browse items" on items
  for select using (true);
create policy "sellers manage their own items" on items
  for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());

create policy "anyone can browse units" on item_units
  for select using (true);
create policy "sellers manage their own units" on item_units
  for all using (exists (
    select 1 from items i where i.id = item_units.item_id and i.seller_id = auth.uid()))
  with check (exists (
    select 1 from items i where i.id = item_units.item_id and i.seller_id = auth.uid()));

-- the pool is private; it is never public in any direction
create policy "sellers own their staged photos" on staged_photos
  for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());

create policy "sellers read their own requests" on requests
  for select using (seller_id = auth.uid());
create policy "sellers read their own request lines" on request_items
  for select using (exists (
    select 1 from requests r where r.id = request_id and r.seller_id = auth.uid()));
