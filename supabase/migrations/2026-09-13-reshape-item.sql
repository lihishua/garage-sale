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
