-- Telling a buyer when a held item comes back.
--
-- A unit someone has asked for shows "מישהו ביקש", and often that request
-- falls through: the buyer cancels, or the seller releases it. Whoever else
-- wanted it had no way to know. Now they can leave an email on the held unit,
-- and the moment it is back on sale the database emails them, once, and
-- forgets the address.
--
-- The email goes out from here and not from the app, because a unit comes
-- back in two places (release_request, and the seller marking it available on
-- her board) and neither is guaranteed to have a browser still open to send
-- anything. A trigger on the status sees both. pg_net queues the HTTP call and
-- sends it only after the transaction commits, so a release that fails sends
-- nothing.
--
-- Sending is through Resend's API, with the key kept in Supabase Vault. Until
-- both secrets below exist, addresses are still collected and simply wait.
--
--   select vault.create_secret('re_...', 'resend_api_key');
--   select vault.create_secret('Garage Sale <noreply@garagesaleonline.app>', 'notify_from');
--
-- The from-address must be on a domain verified in Resend.
--
-- Written to be safe to run twice.

create extension if not exists pg_net;

create table if not exists waitlist (
  unit_id    uuid not null references item_units(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  primary key (unit_id, email)
);

-- No policies at all: nobody reads or writes this table directly. Buyers add
-- to it through wait_for_unit() below, and the trigger reads and empties it.
-- The addresses are not the seller's to see, since she never asked for them.
alter table waitlist enable row level security;

create or replace function wait_for_unit(p_unit_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_status item_status;
begin
  if length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'bad_email');
  end if;

  select status into v_status from item_units where id = p_unit_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'no_such_unit');
  end if;
  -- already back, or gone for good: there is nothing to wait for
  if v_status <> 'reserved' then
    return jsonb_build_object('ok', false, 'error', v_status::text);
  end if;

  -- a cap, so a script can't pile a thousand addresses onto one teapot and
  -- have us email them all
  if (select count(*) from waitlist where unit_id = p_unit_id) >= 20 then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;

  insert into waitlist (unit_id, email) values (p_unit_id, v_email)
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function wait_for_unit(uuid, text) to anon, authenticated;

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
    || '<p><b>%s</b> שביקשתם שנעדכן עליו חזר למכירה של %s.</p>'
    || '<p>מי שמגיע ראשון לוקח:</p>'
    || '<p><a href="%s" style="display:inline-block;background:#EE5A2A;color:#fff;'
    || 'text-decoration:none;padding:10px 22px;border-radius:10px;font-weight:bold">לכניסה למכירה</a></p>'
    || '<p style="font-size:13px;color:#888">שלחנו את זה פעם אחת בלבד, כי ביקשתם. הכתובת שלכם כבר נמחקה אצלנו.</p>'
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

drop trigger if exists unit_back on item_units;
create trigger unit_back
  after update of status on item_units
  for each row
  when (old.status is distinct from new.status)
  execute function notify_unit_back();
