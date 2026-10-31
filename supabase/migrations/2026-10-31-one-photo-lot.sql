-- A מארז from one photo: a pile of books shot once.
--
-- Until now a lot was told apart from a single thing by its unit count alone:
-- more than one unit was a lot. A pile in one photo is one unit, so it needs
-- saying outright. `is_lot` says it; a listing with several units is a lot
-- whether or not the flag was written, so every reader asks
-- `is_lot or units > 1` and old rows need nothing.
--
-- Priced per item, a one-photo lot can be asked for whole or in part. The
-- buyer's request says which, the quantity is settled on WhatsApp, and the
-- lot is held either way until the seller marks it. Marking part of it sold
-- puts it back on sale and adds what came in to `part_sold`.

alter table items add column if not exists is_lot boolean not null default false;

update items i set is_lot = true
 where (select count(*) from item_units u where u.item_id = i.id) > 1;

-- what part-sales of this unit have brought in so far. Like sold_price, it is
-- not on the public sale page's select: what a neighbour paid is theirs.
alter table item_units add column if not exists part_sold integer not null default 0
  check (part_sold >= 0);

-- "part of the lot", on the line of the request that asked for it
alter table request_items add column if not exists part boolean not null default false;

-- reserve_units grows one argument: the units asked for in part. It has a
-- default, so a page that does not send it still works.
drop function if exists reserve_units(text, uuid[], text, text);

create or replace function reserve_units(
  p_slug     text,
  p_unit_ids uuid[],
  p_name     text,
  p_phone    text,
  p_part     uuid[] default '{}'
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
    insert into request_items (request_id, unit_id, part)
      select v_request, id, id = any(coalesce(p_part, '{}')) from unnest(v_ok) as id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'reserved', to_jsonb(v_ok),
    'unavailable', to_jsonb(array(select unnest(p_unit_ids) except select unnest(v_ok))),
    'seller_name', v_name,
    'seller_phone', case when coalesce(array_length(v_ok, 1), 0) > 0
                         then v_phone else null end,
    'request', v_request
  );
end $$;

grant execute on function reserve_units(text, uuid[], text, text, uuid[]) to anon, authenticated;
