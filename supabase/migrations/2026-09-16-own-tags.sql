-- Her own tags, kept.
--
-- A tag she invents used to live only in the items that carried it: type
-- "גינה" on one listing and it was offered on the next, but only for as long
-- as some item wore it. Untick it before posting, or delete the one item
-- that had it, and it was gone — which is not how a word you made up should
-- behave. So the seller's vocabulary gets a column of its own, written the
-- moment she makes a tag, whether or not the listing it was made on is ever
-- posted.
--
-- The built-in tags are not stored here; they are a constant in the app.
-- Nothing public reads this column: public_sales names its columns and this
-- is not one of them.
--
-- Written to be safe to run twice.

alter table profiles add column if not exists tags text[] not null default '{}';
