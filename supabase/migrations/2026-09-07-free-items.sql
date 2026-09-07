-- למסירה: an item given away rather than sold.
--
-- price 0 is the whole representation. There is no is_free column, because a
-- second source of truth for "does this cost anything" is a second thing to
-- keep in step, and every place that already reads `price` gets the answer
-- right by asking whether it is zero.
--
-- What has to change is the check: `price > 0` was written when giving
-- something away was not a thing this app could express. `bundle_price` keeps
-- its own `> 0`, because "all of it for nothing" is not an offer anyone makes
-- — a free lot is simply free per unit.

do $$
declare c text;
begin
  -- by definition rather than by name: the constraint was created inline, so
  -- its name is whatever Postgres chose, and a migration should not guess.
  for c in
    select conname from pg_constraint
     where conrelid = 'items'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%price%'
       and pg_get_constraintdef(oid) not like '%bundle_price%'
  loop
    execute format('alter table items drop constraint %I', c);
  end loop;
end $$;

alter table items add constraint items_price_check check (price >= 0);
