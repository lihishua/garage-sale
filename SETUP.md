# Setup and technical notes

Everything needed to run and work on Garage Sale. For what the app *is*, see
[README.md](README.md).

Next.js 14 (App Router) + Supabase. Domain: **garagesale-online.com**.

> **In progress:** the seller flow is being rebuilt so photos upload in bulk into a pool
> and become listings afterwards, and so one listing can hold several individually
> claimable photos. The database already has this shape; the interface is catching up.
> See `docs/superpowers/plans/2026-08-29-photo-pool-and-batch-items.md`.

## Standing up a Supabase project

1. Create a project at supabase.com — the free plan is plenty.
   **Pick an EU region**, closest to Israel. This cannot be changed afterwards.
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
   That creates the tables, the access rules, the reservation function and the photo
   bucket. Expect "Success. No rows returned".
3. **Authentication → Providers → Email**: make sure it's enabled. There are no passwords
   here — signing in means clicking a link sent by email.
4. **Authentication → URL Configuration → Redirect URLs**: add
   `http://localhost:3000/**` and `https://garagesale-online.com/**`.
   Without these, Supabase refuses to send anyone back to the site.
5. **Set up SMTP before touching the email templates.** Supabase locks template editing
   until you connect your own mail sender, and its built-in one only delivers a handful of
   messages an hour. Since *every* sign-in is an email, this is required, not optional.
   **Project Settings → Authentication → SMTP Settings** — Resend, Postmark and SendGrid
   all have free tiers that cover a project this size.
6. **Authentication → Emails**: replace the body of **both** the *Magic link* and the
   *Confirm signup* templates with:
   ```html
   <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Sign in to my sale</a>
   ```
   This is **mandatory**. The default template puts the token after a `#`, which browsers
   never send to a server — sign-in would fail with nothing to explain why. Both templates
   need it: a brand-new seller may be sent the signup one rather than the magic link one,
   so fixing only one leaves first-time sellers stranded.
7. **Project Settings → API**: copy the `Project URL` and the `anon public` key.

## Running it

```bash
npm install
cp .env.local.example .env.local     # paste the two values in
npm run dev
```

http://localhost:3000

To reach it from a phone on the same Wi-Fi, run `npx next dev -H 0.0.0.0`, browse to the
Mac's LAN address, and add that address to the Redirect URLs list too — otherwise the
sign-in link is rejected.

## A test run

1. "לפתוח מכירת חצר משלי" → email, name, phone and page address (say `dana`) →
   "שלחו לי קישור כניסה". The link arrives by email; clicking it creates the profile and
   opens the board.
2. On the board, upload photos and turn them into listings.
3. Open `http://localhost:3000/dana` in a private window — that's the buyer's view.
4. Heart a few things, send the list, and check it appears on the board.

## Deploying

Push to GitHub, connect Vercel, add the two environment variables there.
`garagesale-online.com` is attached under **Vercel → Settings → Domains**.

The domain also appears in the code, in `metadataBase` in `app/layout.tsx` and in
`addressHint` in `lib/i18n.ts`. If it changes, update those too.

## Layout

```
app/[slug]/          the public sale page (server) plus all the interaction (client)
app/dashboard/       the seller's board
app/login/           requesting a sign-in link
app/auth/confirm/    where the emailed link lands and becomes a session
lib/images.ts        resizing photos in the browser before upload
supabase/schema.sql  the whole database, for a fresh project
supabase/migrations/ changes to apply to a database that already exists
supabase/tests/      SQL checks run by hand in the SQL Editor
docs/superpowers/    specs and implementation plans
```

## The icon

`garage-sale-icon.png` in the project root is the source of truth (2000×2000). Everything
in `public/` is derived from it and wired up in `app/layout.tsx` and `public/manifest.json`:

| file | where it shows |
|---|---|
| `favicon.ico` | browser tab (16/32/48) |
| `icon-192.png`, `icon-512.png` | the manifest, Android home screen |
| `apple-touch-icon-180.png` | iPhone home screen |

Regenerate after replacing the source artwork:

```bash
sips -Z 512 garage-sale-icon.png --out public/icon-512.png
sips -Z 192 garage-sale-icon.png --out public/icon-192.png
sips -Z 180 garage-sale-icon.png --out public/apple-touch-icon-180.png
```

The source should be full-bleed — no white margin, no pre-rounded corners. iOS and Android
apply their own rounded mask, and leftover white reads as a pale fringe on the home screen.
The current generated icons flood-fill any edge-connected white before resizing.

## Decisions worth knowing

**A listing is a card; each of its photos is a unit.** Twenty books are one card with one
description and twenty individually claimable photos. A sofa is a card with one. Because a
single item is just a lot of one, there is no separate code path for "normal" and "lot"
listings anywhere.

**No passwords.** Signing in means clicking a one-time link sent by email. A garage sale is
an event: a seller signs in once, adds things over a few evenings, and marks them sold at
the weekend — same device, same session throughout. A password is mainly a thing to forget
by the next sale, and "forgot password" sends a link by email anyway, so it was the same
journey with an extra step in front of it.

**The seller's details ride on the auth user, not on the browser.** Name, phone and page
address travel as metadata with the link request, and the `profiles` row is created in
`app/auth/confirm` only after a successful click. That survives requesting the link on a
laptop and opening it on a phone, which browser storage would not.

**Buyer contact details exist in exactly one place.** `requests` holds who asked for what,
and its access rule filters by row (`seller_id = auth.uid()`), so an anonymous caller
matches nothing at all. They are deliberately *not* duplicated onto `item_units`, because
that table is world-readable — and row level security is row-level only, so any column on a
world-readable table is public regardless of what the app's own queries ask for. You cannot
leak a column that does not exist.

**The seller's own phone is released only in exchange for a real claim.** It is not in the
`public_sales` view, and `reserve_units` returns it only when at least one unit was actually
reserved. Returning it on every successful call — which an earlier version did — let anyone
who knew the sale's address harvest it with a made-up photo id, reserving nothing and
leaving no trace.

**Two buyers, one sofa.** Claiming is a single
`update ... where status = 'available' ... returning` inside one database function. The
second buyer's copy finds the row no longer available, so it doesn't match, and the item
comes back to her in the `unavailable` list with a message saying some were taken. There is
no sequence of events in which both get it.

**Buyers need no account.** The wish list lives in the browser's `localStorage`. It doesn't
travel between devices, which is fine — a name and number are asked for only at the moment
of sending.

**Photos are resized in the browser.** A phone camera produces 6MB files. The code makes two
versions, 1600px for the item page and 480px for the grid, and rejects anything narrower
than 1200px at source.

## Still missing before this is really live

- **Rate limiting on `reserve_units`.** Anyone can call it repeatedly, and a single call has
  no cap on how many photos it claims, so one request could lock an entire sale. The fix is
  an Edge Function checking IP, or a captcha before sending.
- **A real notification to the seller.** The list is recorded in the database, but she only
  hears about it if the buyer taps the WhatsApp button. An automatic email through a
  Supabase Edge Function would tell her even when the buyer abandons halfway.
- **Automatic release.** A unit reserved and never completed stays held forever. A daily job
  should return anything held longer than 48 hours.
- **A sweep for stranded photos.** Uploads write the blobs first and the row second, and
  deleting a listing removes the row first and the blobs second. Either way, a connection
  that dies between the two leaves files in the `photos` bucket that nothing points at. The
  app compensates where it can and tells the seller when it cannot, but no retry can be
  trusted on a dead line. A periodic job should list the bucket and delete anything with no
  matching `staged_photos.photo_path` or `item_units.photo_path`.
- **Deleting a sale, and exporting the data.**
- **Hebrew only for now** — `lib/i18n.ts` carries both languages, but there is no language
  switch in the interface yet.
