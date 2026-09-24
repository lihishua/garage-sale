-- The "it's back" email, in the seller's own words.
--
-- Only the email's text changed; the function is otherwise the one in
-- 2026-09-24-waitlist.sql, and the trigger that calls it stays as it is.
-- Safe to run twice.

create or replace function notify_unit_back()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key    text;
  v_from   text;
  v_title  text;
  v_slug   text;
  v_seller text;
  v_url    text;
  v_html   text;
  r        record;
begin
  -- sold: it is not coming back, and nobody is told it did
  if new.status = 'sold' then
    delete from waitlist where unit_id = new.id;
    return new;
  end if;

  if not (old.status = 'reserved' and new.status = 'available') then
    return new;
  end if;
  if not exists (select 1 from waitlist where unit_id = new.id) then
    return new;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key';
  select decrypted_secret into v_from from vault.decrypted_secrets where name = 'notify_from';
  if v_key is null or v_from is null then
    return new;
  end if;

  select i.title, p.slug, p.display_name into v_title, v_slug, v_seller
    from items i join profiles p on p.id = i.seller_id
   where i.id = new.item_id;

  v_url := 'https://garagesaleonline.app/' || v_slug;
  v_html := format(
    '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:17px;line-height:1.6;color:#1B1815">'
    || '<p>היי!</p>'
    || '<p><b>%s</b> שביקשתם עדכון לגביו - חזר למכירה של %s.</p>'
    || '<p><a href="%s" style="display:inline-block;background:#EE5A2A;color:#fff;'
    || 'text-decoration:none;padding:10px 22px;border-radius:10px;font-weight:bold">לכניסה למכירה</a></p>'
    || '<p style="font-size:13px;color:#888">שלחנו את זה פעם אחת בלבד, כי ביקשתם.<br>הכתובת שלכם כבר נמחקה אצלנו.</p>'
    || '</div>',
    replace(replace(replace(v_title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
    replace(replace(replace(v_seller, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
    v_url);

  -- one email each, so no one sees who else was waiting; each address is
  -- deleted as it is used
  for r in delete from waitlist where unit_id = new.id returning email loop
    perform net.http_post(
      url     := 'https://api.resend.com/emails',
      body    := jsonb_build_object(
                   'from', v_from,
                   'to', jsonb_build_array(r.email),
                   'subject', v_title || ' חזר למכירה',
                   'html', v_html),
      headers := jsonb_build_object(
                   'Authorization', 'Bearer ' || v_key,
                   'Content-Type', 'application/json'));
  end loop;
  return new;
end $$;
