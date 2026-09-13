-- One price, and what it is a price for.
--
-- A lot used to carry two numbers: a per-unit price and an optional "all of
-- it for" bundle price. Two numbers for one pile of books was the thing
-- sellers found confusing. Now there is one number and one switch saying
-- what it covers: each item, or the whole pile.
--
--   price_for = 'each'  the price is per unit; a buyer picks photos and pays
--                       per photo. (What every existing lot already means.)
--   price_for = 'all'   the price is for the whole lot; a heart takes all of
--                       it, and the units are the photos of one thing to buy.
--
-- bundle_price stays as a column so nothing already written breaks, but
-- nothing writes it any more. Any lot that had one becomes a per-pile lot at
-- that price — that is the closest thing to what the seller meant.

do $$ begin
  create type price_for as enum ('each', 'all');
exception when duplicate_object then null; end $$;

alter table items add column if not exists price_for price_for not null default 'each';

update items
   set price_for = 'all', price = bundle_price
 where bundle_price is not null;

-- What a unit actually went for. The list price is an opening number; the
-- WhatsApp conversation is where the real one is settled, and the seller
-- writes it here when she marks the unit paid. Null means not sold, or sold
-- before this existed — the board falls back to the list price for those.
alter table item_units add column if not exists sold_price integer check (sold_price >= 0);

-- The public view must not leak it: what a neighbour paid is between the
-- two of them. public_sales does not select from item_units, and the sale
-- page's query names its columns, so nothing needs to change there — this
-- note is so nobody adds it to that select later.
