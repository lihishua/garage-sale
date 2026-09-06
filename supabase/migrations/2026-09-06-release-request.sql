-- Taking a request back off the board.
--
-- The seller removing a buyer and the buyer withdrawing her own list are the
-- same thing done to the same rows, so they are one function. What differs is
-- only how each side comes to know the request id: the seller reads it through
-- her own RLS policy, the buyer's browser kept it from the moment she sent the
-- list. The id is a uuid that is never displayed and never public — `requests`
-- is readable only by its seller — so holding one is the credential here.
-- There is no account to check it against: buyers never sign in.
--
-- reserve_units therefore has to hand the id back, which is the only change to
-- it. Everything else below is the function as it was.

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
    -- already withdrawn, already removed by the seller, or never existed. The
    -- units were not touched, since nothing joined to a request that is gone.
    return jsonb_build_object('ok', false, 'error', 'no_such_request');
  end if;

  return jsonb_build_object('ok', true, 'released', to_jsonb(v_released));
end $$;

grant execute on function release_request(uuid) to anon, authenticated;
