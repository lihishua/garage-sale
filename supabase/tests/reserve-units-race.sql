-- reserve_units race test — the one that actually matters.
--
-- This is NOT run automatically by any migration or by schema.sql. It is a
-- manual check: paste it into the Supabase SQL Editor and run it by hand
-- after applying reserve_units(). It creates a lot of 1 (one item, one
-- unit) under the 'lihi-oren' seller, fires two competing claims for the
-- *same* unit, and asserts exactly one wins the guaranteed single-winner
-- update in reserve_units(). It cleans up everything it creates before
-- exiting (the temporary item/unit via cascade, and the seller's requests
-- rows), so it is safe to re-run, but it does touch real data for that
-- seller — do not point it at a production slug you care about.
--
-- Expected output: NOTICE: race test passed
-- Any assert failure is a blocker — do not continue past it.

do $$
declare
  v_item uuid; v_unit uuid; v_seller uuid;
  r1 jsonb; r2 jsonb;
begin
  select id into v_seller from profiles where slug = 'lihi-oren';

  insert into items (seller_id, title, description, price)
    values (v_seller, 'race test', 'temporary', 10) returning id into v_item;
  insert into item_units (item_id, photo_path, thumb_path, position)
    values (v_item, 'x/a.webp', 'x/a-t.webp', 0) returning id into v_unit;

  r1 := reserve_units('lihi-oren', array[v_unit], 'Buyer One', '0500000001');
  r2 := reserve_units('lihi-oren', array[v_unit], 'Buyer Two', '0500000002');

  assert jsonb_array_length(r1->'reserved')    = 1, 'first buyer should win the unit';
  assert jsonb_array_length(r2->'reserved')    = 0, 'second buyer must win nothing';
  assert jsonb_array_length(r2->'unavailable') = 1, 'second buyer must be told it is gone';
  assert (select count(*) from requests where seller_id = v_seller) = 1,
         'no request row should be written for a buyer who won nothing';

  delete from items where id = v_item;       -- cascades units + request lines
  delete from requests where seller_id = v_seller;
  raise notice 'race test passed';
end $$;
