-- reserve_units guard test — NOT a concurrency test.
--
-- This is not run automatically by any migration or by schema.sql. It is a
-- manual check: paste it into the Supabase SQL Editor and run it by hand
-- after applying reserve_units().
--
-- What it proves: two sequential calls to reserve_units() for the same unit
-- are correctly serialized by the `where status = 'available'` qual in the
-- function's single conditional update — the first call wins, the second
-- gets nothing, is told the unit is unavailable, and leaves no orphan
-- request row behind.
--
-- What it does NOT prove: two sequential calls in one session, inside one
-- transaction, cannot interleave with each other, so this test can never
-- observe or fail on a genuine race between two concurrent buyers. Real
-- concurrency (two simultaneous connections claiming the same unit at the
-- same time) is checked separately, by firing two simultaneous curl calls
-- at the RPC over two connections against real seeded units.
--
-- Every assertion and every cleanup statement below is scoped only to rows
-- this test itself creates (the temporary item/unit, and the single
-- request id returned by the winning call) — it never touches, counts, or
-- deletes any other row belonging to the 'lihi-oren' seller, so it is safe
-- to re-run against a seller that already has real items and real requests.
--
-- `set local plpgsql.check_asserts` is forced on so this test cannot pass
-- vacuously if the server has asserts disabled.
--
-- Expected output: NOTICE: guard test passed
-- Any assert failure is a blocker — do not continue.

do $$
declare
  v_item    uuid;
  v_unit    uuid;
  v_seller  uuid;
  v_request uuid;
  r1 jsonb; r2 jsonb;
begin
  set local plpgsql.check_asserts = on;

  select id into v_seller from profiles where slug = 'lihi-oren';

  insert into items (seller_id, title, description, price)
    values (v_seller, 'guard test', 'temporary', 10) returning id into v_item;
  insert into item_units (item_id, photo_path, thumb_path, position)
    values (v_item, 'x/a.webp', 'x/a-t.webp', 0) returning id into v_unit;

  r1 := reserve_units('lihi-oren', array[v_unit], 'Buyer One', '0500000001');
  r2 := reserve_units('lihi-oren', array[v_unit], 'Buyer Two', '0500000002');

  assert jsonb_array_length(r1->'reserved')    = 1, 'first buyer should win the unit';
  assert jsonb_array_length(r2->'reserved')    = 0, 'second buyer must win nothing';
  assert jsonb_array_length(r2->'unavailable') = 1, 'second buyer must be told it is gone';
  assert (r2->'unavailable'->>0)::uuid = v_unit,
         'second buyer must be told that specific unit is gone, not some other one';

  -- the only request this test is entitled to look at is the one whose id
  -- the winning call caused to exist — never an unscoped count/select on
  -- `requests` for this seller, which would see the seller's real rows too.
  select request_id into v_request
    from request_items where unit_id = v_unit;

  assert v_request is not null, 'the winning claim must have created a request row';
  assert (select buyer_name from requests where id = v_request) = 'Buyer One',
         'the one surviving request must belong to the first buyer, not the second';

  delete from items where id = v_item;          -- cascades unit + request_items line
  delete from requests where id = v_request;     -- only the request this test created
  raise notice 'guard test passed';
end $$;
