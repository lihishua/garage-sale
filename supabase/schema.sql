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
  tags         text[] not null default '{}',  -- her own tags, beyond the built-in ones
  created_at   timestamptz not null default now()
);

do $$ begin
  create type item_status as enum ('available', 'reserved', 'sold');
exception when duplicate_object then null; end $$;
do $$ begin
  create type price_for as enum ('each', 'all');
exception when duplicate_object then null; end $$;

create table if not exists items (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references profiles(id) on delete cascade,
  title        text not null,
  description  text not null,
  -- 0 is למסירה: given away rather than sold. No is_free column — a second
  -- source of truth for "does this cost anything" is a second thing to keep
  -- in step, and every reader of `price` gets it right by asking for zero.
  price        integer not null check (price >= 0),
  -- what `price` covers: each unit, or the whole lot. One number, one switch.
  price_for    price_for not null default 'each',
  -- retired: nothing writes it. A lot that had one became a price_for='all'
  -- lot at that price. Kept so an old row still reads.
  bundle_price integer check (bundle_price > 0),
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
  -- what it actually went for, written when marked sold. Null: not sold, or
  -- sold before this existed; the board shows the list price for those.
  sold_price        integer check (sold_price >= 0),
  -- deliberately NO reserved_by_* columns: this table is world-readable,
  -- so buyer contact details live only in `requests`. See Global Constraints.
  created_at        timestamptz not null default now()
);
create index if not exists item_units_item_idx on item_units (item_id, position);

-- extra views of one thing: a crib shot from five angles is one claimable
-- unit with five pictures. item_units.photo_path is the unit's first photo,
-- the rest live here, so a one-photo unit adds no rows at all. Only image
-- paths — no buyer details here either, see the note on item_units above.
create table if not exists unit_photos (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references item_units(id) on delete cascade,
  photo_path text not null,
  thumb_path text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists unit_photos_unit_idx on unit_photos (unit_id, position);

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
-- back from reserve_units(), after they have actually asked for something.

drop view if exists public_sales;
create view public_sales with (security_invoker = off) as
  select id, display_name, slug from profiles;

grant select on public_sales to anon, authenticated;

-- ---------- row level security ----------

alter table profiles      enable row level security;
alter table items         enable row level security;
alter table item_units    enable row level security;
alter table unit_photos   enable row level security;
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

-- world-readable like item_units, and safe for the same reason: image paths only
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

-- note: nobody has insert rights on requests. buyers go through this
-- security-definer function, which is the only way a reservation can be
-- created.
create or replace function reserve_units(
  p_slug     text,
  p_unit_ids uuid[],
  p_name     text,
  p_phone    text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp   -- pg_temp is searched first unless named
as $$
declare
  v_seller  uuid;
  v_phone   text;
  v_name    text;
  v_ok      uuid[];
  v_request uuid;
begin
  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_phone, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_details');
  end if;
  if coalesce(array_length(p_unit_ids, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_list');
  end if;

  select id, phone, display_name into v_seller, v_phone, v_name
    from profiles where slug = p_slug;
  if v_seller is null then
    return jsonb_build_object('ok', false, 'error', 'no_such_sale');
  end if;

  -- one statement, conditional on status: two buyers, one winner
  -- who asked is recorded in `requests` below, never on the unit itself
  with locked as (
    update item_units u
       set status = 'reserved'
      from items i
     where u.item_id = i.id
       and u.id = any(p_unit_ids)
       and i.seller_id = v_seller
       and u.status = 'available'
    returning u.id
  )
  select coalesce(array_agg(id), '{}') into v_ok from locked;

  if array_length(v_ok, 1) > 0 then
    insert into requests (seller_id, buyer_name, buyer_phone)
      values (v_seller, btrim(p_name), btrim(p_phone))
      returning id into v_request;
    insert into request_items (request_id, unit_id)
      select v_request, unnest(v_ok);
  end if;

  return jsonb_build_object(
    'ok', true,
    'reserved', to_jsonb(v_ok),
    'unavailable', to_jsonb(array(select unnest(p_unit_ids) except select unnest(v_ok))),
    'seller_name', v_name,
    -- the phone is the payoff for actually claiming something. returning it on
    -- every ok:true let anyone with the (public) slug harvest it by calling with
    -- one made-up uuid, reserving nothing and leaving no request row behind.
    'seller_phone', case when coalesce(array_length(v_ok, 1), 0) > 0
                         then v_phone else null end,
    -- null when nothing was held, because no request row was written either.
    -- This is what lets the buyer withdraw later; see release_request below.
    'request', v_request
  );
end $$;

grant execute on function reserve_units(text, uuid[], text, text) to anon, authenticated;

-- Taking a request back off the board. The seller removing a buyer and the
-- buyer withdrawing her own list are the same thing done to the same rows, so
-- they are one function. What differs is only how each side comes to know the
-- request id: the seller reads it through her own RLS policy, the buyer's
-- browser kept it from the moment she sent the list. The id is a uuid that is
-- never displayed and never public, so holding one is the credential here --
-- there is no account to check it against, because buyers never sign in.
create or replace function release_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_released uuid[];
begin
  if p_request_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_request');
  end if;

  -- Only the units this request is still holding. One the seller has since
  -- marked sold stays sold: the sale happened, and releasing a request is not
  -- a claim that it did not. Freeing has to happen before the delete, because
  -- request_items cascades away with the request row and would take the only
  -- record of which units to free with it.
  with freed as (
    update item_units u
       set status = 'available'
      from request_items ri
     where ri.request_id = p_request_id
       and u.id = ri.unit_id
       and u.status = 'reserved'
    returning u.id
  )
  select coalesce(array_agg(id), '{}') into v_released from freed;

  delete from requests where id = p_request_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_such_request');
  end if;

  return jsonb_build_object('ok', true, 'released', to_jsonb(v_released));
end $$;

grant execute on function release_request(uuid) to anon, authenticated;

-- Turning a set into a lot, or a lot into a set, after the fact.
--
-- The two are not a flag on the item; they are two shapes of the same photos.
-- A set is one item_units row (the claimable thing) with the other photos as
-- unit_photos hanging off it. A lot is one item_units row per photo, each
-- claimable on its own. Converting means moving photos between those two
-- tables — several writes that would be a mess to do half of from a browser
-- on a bad connection, so it is one function and one transaction.
--
-- Only an untouched listing may change shape. A unit that is reserved or
-- sold is pointed at by a buyer's request, and reshaping it would either
-- orphan that request or silently hand her a different thing; the function
-- refuses rather than guess. That is the same rule the edit form already
-- applies to every unit, now stated in the one place that can enforce it.

create or replace function reshape_item(p_item_id uuid, p_many boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seller   uuid;
  v_units    integer;
  v_photos   integer;
  v_cover    uuid;
  v_paths    jsonb;
begin
  -- hers, and only hers. security definer bypasses RLS, so the ownership
  -- check the policies would have made has to be made here by hand.
  select seller_id into v_seller from items where id = p_item_id;
  if v_seller is null or v_seller <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;

  if exists (select 1 from item_units where item_id = p_item_id and status <> 'available') then
    return jsonb_build_object('ok', false, 'error', 'in_use');
  end if;

  -- every photo the listing owns, in one flat ordered list: each unit's own
  -- photo, then that unit's extra views, unit by unit. Whichever shape it is
  -- in now, this is the same list, and it is what the new shape is built from.
  select coalesce(jsonb_agg(jsonb_build_object('photo', photo, 'thumb', thumb) order by ord), '[]')
    into v_paths
    from (
      select u.position * 1000 as ord, u.photo_path as photo, u.thumb_path as thumb
        from item_units u where u.item_id = p_item_id
      union all
      select u.position * 1000 + p.position, p.photo_path, p.thumb_path
        from unit_photos p join item_units u on u.id = p.unit_id
       where u.item_id = p_item_id
    ) all_photos;

  v_photos := jsonb_array_length(v_paths);
  select count(*) into v_units from item_units where item_id = p_item_id;

  -- already the shape asked for: a lot has one unit per photo, a set has one
  if (p_many and v_units = v_photos) or (not p_many and v_units = 1) then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  -- a set of one photo is also a lot of one; nothing to do either way
  if v_photos < 2 then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  -- Tear down and rebuild from the list. Nothing references these rows
  -- (the check above), and unit_photos cascades with its unit.
  delete from item_units where item_id = p_item_id;

  if p_many then
    insert into item_units (item_id, photo_path, thumb_path, position)
      select p_item_id, e->>'photo', e->>'thumb', (i - 1)::integer
        from jsonb_array_elements(v_paths) with ordinality as t(e, i);
  else
    insert into item_units (item_id, photo_path, thumb_path, position)
      values (p_item_id, v_paths->0->>'photo', v_paths->0->>'thumb', 0)
      returning id into v_cover;
    insert into unit_photos (unit_id, photo_path, thumb_path, position)
      select v_cover, e->>'photo', e->>'thumb', (i - 1)::integer
        from jsonb_array_elements(v_paths) with ordinality as t(e, i)
       where i > 1;
    -- "all of it for" is a lot's offer; a set has one price
    update items set bundle_price = null where id = p_item_id;
  end if;

  return jsonb_build_object('ok', true, 'changed', true);
end $$;

grant execute on function reshape_item(uuid, boolean) to authenticated;

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
