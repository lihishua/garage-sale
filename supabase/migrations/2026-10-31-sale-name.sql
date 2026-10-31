-- The name a sale goes by: what the seller writes on her flyer, and what
-- greets a buyer on the sale page ("ברוכים הבאים למכירה של ..."). Null until
-- she changes it, and then the sale is simply hers, display_name.
--
-- It is public by nature — it is printed on a flyer — so public_sales shows
-- it. display_name stays what it was everywhere else (her WhatsApp messages,
-- "send the list to ...").

alter table profiles add column if not exists sale_name text
  check (sale_name is null or length(sale_name) between 1 and 60);

-- a column added at the end, so the view can be replaced in place
create or replace view public_sales with (security_invoker = off) as
  select id, display_name, slug, sale_name from profiles;

grant select on public_sales to anon, authenticated;
