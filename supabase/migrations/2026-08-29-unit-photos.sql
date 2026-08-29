-- Extra views of one thing.
--
-- A photo and a thing-you-can-buy are not the same. A crib shot from five
-- angles is ONE claimable thing with five pictures; a table-and-four-chairs
-- set is likewise one, sold as a unit; twenty books are twenty. So a unit
-- owns its photos: item_units.photo_path stays the unit's first photo and the
-- rest live here, which means the common one-photo case adds no rows at all.
--
-- Safe to make world-readable: this table holds only image paths. No buyer
-- details here, ever — they live solely in `requests`. See Global Constraints.
--
-- Written to be safe to run twice. It is pasted into the SQL editor by hand,
-- and a second paste should be a no-op rather than a wall of red.

create table if not exists unit_photos (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references item_units(id) on delete cascade,
  photo_path text not null,
  thumb_path text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists unit_photos_unit_idx on unit_photos (unit_id, position);

alter table unit_photos enable row level security;

drop policy if exists "anyone can browse unit photos" on unit_photos;
create policy "anyone can browse unit photos" on unit_photos
  for select using (true);

drop policy if exists "sellers manage their own unit photos" on unit_photos;
create policy "sellers manage their own unit photos" on unit_photos
  for all using (exists (
    select 1 from item_units u join items i on i.id = u.item_id
     where u.id = unit_photos.unit_id and i.seller_id = auth.uid()))
  with check (exists (
    select 1 from item_units u join items i on i.id = u.item_id
     where u.id = unit_photos.unit_id and i.seller_id = auth.uid()));
