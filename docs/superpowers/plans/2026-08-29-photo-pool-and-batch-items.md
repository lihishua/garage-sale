# Photo Pool & Batch Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split photo uploading from item authoring, and let one item hold several individually claimable photos.

**Architecture:** An item becomes a card (title, description, price per unit, optional bundle price); each of its photos becomes a *unit* carrying the status and reserved-by details that currently live on the item. A single item is a batch of one, so there is no separate code path anywhere. Unassigned photos wait in a `staged_photos` pool, which doubles as the pending list.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS + Storage), no test runner.

**Spec:** `docs/superpowers/specs/2026-08-29-photo-pool-and-batch-items-design.md`

## Global Constraints

- Hebrew is the only shipped locale, but **every new string goes into both `he` and `en`** in `lib/i18n.ts`. The `en` block is kept in sync so a language switch stays possible.
- **No buyer contact details may live on any table carrying a `using (true)` select policy.** Row level security is row-level only: a policy that exposes every row exposes every column in it, whatever the app's own queries happen to ask for. `item_units` therefore has **no** `reserved_by_*` columns at all — the record of who asked for what lives solely in `requests`, whose policy filters by row (`seller_id = auth.uid()`) and so reveals nothing to an anonymous caller.
  *(Corrected mid-build: the original constraint relied on public queries naming their columns, which protects against the app leaking but not against a direct API call with the anon key. Verified against the live project.)*
- Photos are resized in the browser before upload — 1600px full, 480px thumb, source under 1200px wide rejected. `lib/images.ts` is unchanged and must keep being used.
- Items keep `not null` on `title`, `description`, `price`. No draft/incomplete item rows ever exist.
- `price` means **price per unit**. `bundle_price` is nullable and only meaningful when an item has more than one unit.
- Every task ends with `npx tsc --noEmit` clean and `npx next build` succeeding.

## Verification tooling

No test runner exists. These are the real gates:

```bash
# typecheck + build
npx tsc --noEmit && npx next build

# live database probe (anon key, same one the browser uses)
U=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)
K=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2)
curl -s "$U/rest/v1/<table>?select=*" -H "apikey: $K" -H "Authorization: Bearer $K"
```

**Adding vitest is out of scope** — it was not requested and this codebase has no test culture to extend. If the reservation logic grows beyond Task 2, revisit that decision.

---

### Task 1: Schema — two-level model

**Files:**
- Modify: `supabase/schema.sql`
- Create: `supabase/migrations/2026-08-29-units-and-pool.sql`

**Interfaces:**
- Consumes: existing `profiles`, `item_status` enum, `photos` storage bucket
- Produces: tables `items` (reshaped), `item_units`, `staged_photos`, `request_items` (reshaped)

**Safe to drop:** the live project has 1 profile and 0 items/requests. `profiles` and `public_sales` must survive — the seller row `lihi-oren` is real.

- [ ] **Step 1: Write the migration**

```sql
-- item-level tables are empty; profiles is not and must survive
drop function if exists reserve_items(text, uuid[], text, text);
drop table if exists request_items cascade;
drop table if exists requests   cascade;
drop table if exists items      cascade;

create table items (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references profiles(id) on delete cascade,
  title        text not null,
  description  text not null,
  price        integer not null check (price > 0),   -- per unit
  bundle_price integer check (bundle_price > 0),     -- optional "all for"
  tags         text[] not null default '{}',
  measurements text,
  created_at   timestamptz not null default now()
);
create index items_seller_idx on items (seller_id, created_at desc);

create table item_units (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references items(id) on delete cascade,
  photo_path        text not null,
  thumb_path        text not null,
  position          integer not null default 0,      -- 0 is the cover
  status            item_status not null default 'available',
  -- deliberately NO reserved_by_* columns: this table is world-readable,
  -- so buyer contact details live only in `requests`. See Global Constraints.
  created_at        timestamptz not null default now()
);
create index item_units_item_idx on item_units (item_id, position);

create table staged_photos (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid not null references profiles(id) on delete cascade,
  photo_path text not null,
  thumb_path text not null,
  created_at timestamptz not null default now()
);
create index staged_photos_seller_idx on staged_photos (seller_id, created_at);

create table requests (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references profiles(id) on delete cascade,
  buyer_name  text not null,
  buyer_phone text not null,
  created_at  timestamptz not null default now()
);
create index requests_seller_idx on requests (seller_id, created_at desc);

create table request_items (
  request_id uuid references requests(id) on delete cascade,
  unit_id    uuid references item_units(id) on delete cascade,
  primary key (request_id, unit_id)
);

alter table items         enable row level security;
alter table item_units    enable row level security;
alter table staged_photos enable row level security;
alter table requests      enable row level security;
alter table request_items enable row level security;

create policy "anyone can browse items" on items
  for select using (true);
create policy "sellers manage their own items" on items
  for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());

create policy "anyone can browse units" on item_units
  for select using (true);
create policy "sellers manage their own units" on item_units
  for all using (exists (
    select 1 from items i where i.id = item_id and i.seller_id = auth.uid()))
  with check (exists (
    select 1 from items i where i.id = item_id and i.seller_id = auth.uid()));

-- the pool is private; it is never public in any direction
create policy "sellers own their staged photos" on staged_photos
  for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());

create policy "sellers read their own requests" on requests
  for select using (seller_id = auth.uid());
create policy "sellers read their own request lines" on request_items
  for select using (exists (
    select 1 from requests r where r.id = request_id and r.seller_id = auth.uid()));
```

- [ ] **Step 2: Apply it to the live project**

Paste into Supabase SQL Editor and Run. Expect "Success. No rows returned".

- [ ] **Step 3: Verify the tables exist and are readable**

```bash
for t in items item_units requests request_items; do
  echo -n "$t: "; curl -s "$U/rest/v1/$t?select=*&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K"; echo
done
```
Expected: `[]` for each.

- [ ] **Step 4: Verify the pool is NOT publicly readable**

```bash
curl -s "$U/rest/v1/staged_photos?select=*" -H "apikey: $K" -H "Authorization: Bearer $K"
```
Expected: `[]` — anon matches no rows. It must never return another seller's photos. Re-check after Task 4 once rows exist.

- [ ] **Step 5: Fold the same DDL into `supabase/schema.sql`** so a fresh project builds identically. Replace the old `items` / `request_items` blocks; leave `profiles`, `public_sales` and the storage policies untouched.

- [ ] **Step 6: Commit**

```bash
git add supabase/ && git commit -m "Schema: items become cards, photos become claimable units"
```

---

### Task 2: `reserve_units` — the sofa guarantee, one level down

**Files:**
- Modify: `supabase/schema.sql`, `supabase/migrations/2026-08-29-units-and-pool.sql`

**Interfaces:**
- Consumes: `item_units`, `items`, `profiles`, `requests`, `request_items` from Task 1
- Produces: `reserve_units(p_slug text, p_unit_ids uuid[], p_name text, p_phone text) returns jsonb`
  returning `{ok, reserved[], unavailable[], seller_name, seller_phone}` or `{ok:false, error}`
  where error ∈ `missing_details | empty_list | no_such_sale`

- [ ] **Step 1: Write the function**

```sql
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
                         then v_phone else null end
  );
end $$;

grant execute on function reserve_units(text, uuid[], text, text) to anon, authenticated;
```

- [ ] **Step 2: Apply and verify the guard clauses**

```bash
RPC="$U/rest/v1/rpc/reserve_units"
H=(-H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json")

curl -s -X POST "$RPC" "${H[@]}" -d '{"p_slug":"lihi-oren","p_unit_ids":[],"p_name":"","p_phone":""}'
# expect {"ok": false, "error": "missing_details"}

curl -s -X POST "$RPC" "${H[@]}" -d '{"p_slug":"lihi-oren","p_unit_ids":[],"p_name":"A","p_phone":"0501234567"}'
# expect {"ok": false, "error": "empty_list"}

curl -s -X POST "$RPC" "${H[@]}" \
  -d '{"p_slug":"nope","p_unit_ids":["00000000-0000-0000-0000-000000000001"],"p_name":"A","p_phone":"0501234567"}'
# expect {"ok": false, "error": "no_such_sale"}
```

- [ ] **Step 3: The guard test**

Run in the SQL Editor. **Name it honestly: this is not a concurrency test.** Two
sequential calls in one session cannot interleave, so it can never fail on a genuine
race. What it does prove is that the `where status = 'available'` qual rejects a second
claim on an already-taken unit, that the loser is told, and that no orphan request row
is written for them. That is worth having; it is just not the thing its name implied.

**Real concurrency is verified separately** by the controller, firing two simultaneous
`curl` calls at the RPC over two connections against real seeded units (Step 3b).

Every assertion must be scoped to rows this test created. An unscoped
`delete from requests where seller_id = ...` would destroy the seller's real requests,
and an unscoped `count(*)` would fail spuriously once real data exists.

```sql
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
```
Expected: `NOTICE: race test passed`. Any assert failure is a blocker — do not continue.

- [ ] **Step 4: Commit**

```bash
git add supabase/ && git commit -m "reserve_units: per-photo claiming with the same one-winner guarantee"
```

---

### Task 3: Types and strings

**Files:**
- Modify: `lib/types.ts`, `lib/i18n.ts`

**Interfaces:**
- Produces:
  - `type Unit = { id, item_id, photo_path, thumb_path, position, status: ItemStatus }`
  - `type Item = { id, seller_id, title, description, price, bundle_price: number|null, tags: string[], measurements: string|null, created_at, units: Unit[] }`
  - `type StagedPhoto = { id, photo_path, thumb_path, created_at }`
  - `type RequestRow = { id, buyer_name, buyer_phone, created_at, request_items: { unit_id: string }[] }`
  - helpers `availableUnits(item): Unit[]`, `showBundlePrice(item): boolean`

- [ ] **Step 1: Define the types**

`Unit` has no `reserved_by_*` fields because the columns no longer exist — see Global Constraints. There is one `Unit` type for both the public page and the dashboard.

The dashboard needs "who holds this unit", so add:

```ts
export type Holder = { name: string; phone: string };
/** built from requests the dashboard already loads; most recent request wins */
export const holdersByUnit = (requests: RequestRow[]): Map<string, Holder> => {
  const m = new Map<string, Holder>();
  // oldest first, so later requests overwrite earlier ones
  [...requests].reverse().forEach(r =>
    r.request_items.forEach(({ unit_id }) =>
      m.set(unit_id, { name: r.buyer_name, phone: r.buyer_phone })));
  return m;
};
```

- [ ] **Step 2: Add the derived helpers**

```ts
export const availableUnits = (i: Item) => i.units.filter(u => u.status === "available");

// the bundle price is only true while nothing has gone
export const showBundlePrice = (i: Item) =>
  i.bundle_price != null && i.units.length > 1 && i.units.every(u => u.status === "available");
```

- [ ] **Step 3: Add strings to both locales**

New keys, `he` and `en`: `uploadPhotos`, `uploading`, `poolTitle`, `poolWaiting(n)`, `poolEmpty`, `selectPhotos`, `createItem`, `createItemFrom(n)`, `bundlePrice`, `bundlePriceHint`, `perUnit`, `forAll`, `unitsLeft(n)`, `soldBand`, `onlyAvailable`, `allSold`, `editItem`, `saveChanges`, `bundleNudge(sold, total)`, `deletePhoto`, `photoCount(n)`.

- [ ] **Step 4: Verify**

`npx tsc --noEmit` — expect clean.

- [ ] **Step 5: Commit**

```bash
git add lib/ && git commit -m "Types and strings for units, pool and bundle pricing"
```

---

### Task 4: Upload photos into the pool

**Files:**
- Create: `app/dashboard/UploadPhotos.tsx`
- Modify: `app/dashboard/BoardClient.tsx` (button), `app/dashboard/page.tsx` (fetch pool)
- Delete: `app/dashboard/AddItem.tsx` (replaced by Task 5's `CreateItem.tsx`)

**Interfaces:**
- Consumes: `prepare()` from `lib/images.ts`, `StagedPhoto` from Task 3
- Produces: `<UploadPhotos onClose onUploaded={(photos: StagedPhoto[]) => void} />`

- [ ] **Step 1: Multi-file input**

`<input type="file" accept="image/*" multiple>`. For each file: `prepare()`, upload both sizes to `photos/{user.id}/{stamp}.webp`, insert a `staged_photos` row.

- [ ] **Step 2: Upload one at a time, reporting progress**

Sequential, not `Promise.all` — a phone uploading 20 photos in parallel will stall. Show `מעלה 3 מתוך 12`. Each success inserts its row immediately, so a mid-way connection loss leaves every completed photo safely in the pool.

- [ ] **Step 3: Per-file failure is not fatal**

A file that fails `prepare()` (too small, unreadable) is collected and reported at the end — `2 תמונות נדחו`. The rest still upload.

- [ ] **Step 4: Verify in the browser**

Upload 3 photos, then:
```bash
curl -s "$U/rest/v1/staged_photos?select=id,photo_path" -H "apikey: $K" -H "Authorization: Bearer $K"
```
Expected: `[]` from anon (RLS working), and 3 rows visible on the board while signed in.

- [ ] **Step 5: Commit**

---

### Task 5: Make items from selected pool photos

**Files:**
- Create: `app/dashboard/PhotoPool.tsx`, `app/dashboard/CreateItem.tsx`
- Modify: `app/dashboard/BoardClient.tsx`

**Interfaces:**
- Consumes: `StagedPhoto[]`, `Item`, `Unit`
- Produces: `<PhotoPool photos onCreate={(selected: StagedPhoto[]) => void} />`, `<CreateItem photos={StagedPhoto[]} onClose onCreated={(item: Item) => void} />`

- [ ] **Step 1: Pool grid with selection**

Thumbnails with a tick overlay. Header shows `poolWaiting(n)`. Action button reads `createItemFrom(selectedCount)` and is disabled at zero.

- [ ] **Step 1b: Extra views of one thing — schema**

A photo and a thing-you-can-buy are not the same. A crib shot from five angles is **one**
claimable thing with five pictures; a table-and-four-chairs set is likewise one, sold as a
unit; twenty books are twenty. So a unit owns its photos.

New migration `supabase/migrations/2026-08-29-unit-photos.sql`, folded into `schema.sql`:

```sql
create table unit_photos (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references item_units(id) on delete cascade,
  photo_path text not null,
  thumb_path text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index unit_photos_unit_idx on unit_photos (unit_id, position);

alter table unit_photos enable row level security;

create policy "anyone can browse unit photos" on unit_photos
  for select using (true);

create policy "sellers manage their own unit photos" on unit_photos
  for all using (exists (
    select 1 from item_units u join items i on i.id = u.item_id
     where u.id = unit_photos.unit_id and i.seller_id = auth.uid()))
  with check (exists (
    select 1 from item_units u join items i on i.id = u.item_id
     where u.id = unit_photos.unit_id and i.seller_id = auth.uid()));
```

Safe to make world-readable: it holds only image paths, no buyer details. `item_units`
keeps its own `photo_path` as the unit's first photo, so the common one-photo case adds no
rows here at all.

- [ ] **Step 2: The create form**

Title, price, description, tags, measurements when furniture — same validation as the old
`AddItem`.

**When more than one photo is selected, ask first — this is the whole point of the task.**
The app cannot infer whether six photos are six things or six views of one. The seller's
own wording, to be used verbatim:

> בחרת 6 תמונות. הן מייצגות:
> 1. פריט אחד/סט שנמכר כיחידה אחת.
> 2. מארז תמונות של 6 פריטים.

Option 1 default. The count interpolates in both the prompt and option 2.

What each does on save:
- **One thing / a set** → one `item_units` row using the first selected photo, and a
  `unit_photos` row for each of the rest.
- **Several things** → one `item_units` row per photo, no `unit_photos` rows.

**The bundle-price field appears only for "several things".** "₪100 for all" is meaningless
for a single crib, and showing it there is what made the old design confusing. For one
thing, `price` is simply its price, and no per-unit label is shown.

- [ ] **Step 3: Save**

Insert the `items` row, then `item_units` rows with `position` following selection order (index 0 is the cover), then delete those `staged_photos` rows. If the units insert fails, delete the item row so no unit-less item is left behind.

- [ ] **Step 4: Verify**

Create one single-photo item and one 3-photo lot. Then:
```bash
curl -s "$U/rest/v1/items?select=id,title,price,bundle_price,item_units(id,position,status)" \
  -H "apikey: $K" -H "Authorization: Bearer $K"
```
Expected: one item with 1 unit, one with 3 units at positions 0,1,2, all `available`. Pool now empty.

- [ ] **Step 5: Commit**

---

### Task 6: Board shows units

**Files:**
- Modify: `app/dashboard/BoardClient.tsx`, `app/dashboard/page.tsx`

- [ ] **Step 1: Fetch items with their units** and the `request_items(unit_id)` join.

- [ ] **Step 2: Stat chips count units, not items** — `free`, `held`, `sold` and earnings all sum over units. Add a `poolWaiting` chip.

- [ ] **Step 3: Item cards show unit state** — `unitsLeft(n)` on a multi-unit item; mark-sold and back-to-stock act per unit for a lot, on the whole item for a single.

  **Who holds a reserved unit** is derived, not stored. The dashboard already loads
  `requests` with their `request_items(unit_id)`; build a `Map<unit_id, {name, phone}>`
  from the most recent request containing each unit. There are no `reserved_by_*`
  columns to read — see Global Constraints.

- [ ] **Step 4: The bundle nudge** — when an item has `bundle_price` and some units are sold, show `bundleNudge(sold, total)` linking to the edit form.

- [ ] **Step 5: Verify** in the browser, then commit.

---

### Task 7: Edit an item

**Files:**
- Create: `app/dashboard/EditItem.tsx`
- Modify: `app/dashboard/BoardClient.tsx`

**Interfaces:**
- Produces: `<EditItem item onClose onSaved={(item: Item) => void} />`

- [ ] **Step 1:** Form over title, description, price, bundle_price, tags, measurements. Photos are not editable — noted in the spec's exclusions.
- [ ] **Step 2:** Update by `id`; RLS confines it to the seller's own rows.
- [ ] **Step 3:** Clearing the bundle price field writes `null`, not `0` — `check (bundle_price > 0)` would reject `0`.
- [ ] **Step 4:** Verify a bundle re-price round-trips, then commit.

---

### Task 8: Public page — carousel and two-level hearts

**Files:**
- Modify: `app/[slug]/SaleClient.tsx`, `app/[slug]/page.tsx`

- [ ] **Step 1: Fetch items with units, naming columns explicitly**

```ts
.select("id, seller_id, title, description, price, bundle_price, tags, measurements, created_at, item_units(id, item_id, photo_path, thumb_path, position, status)")
```
There are no `reserved_by_*` columns to omit — the table does not have them. Naming
columns explicitly is still the house style, but it is no longer what protects buyer
details; the schema is. See Global Constraints.

- [ ] **Step 2: The wish list holds unit ids**, not item ids. `localStorage` key stays `gs.wish.{slug}` — existing lists become stale ids that simply match nothing, which is harmless.

- [ ] **Step 3: Card heart = every available unit of that item.** Pressed state is "all available units are on the list". Toggling off removes all of them.

- [ ] **Step 4: Item sheet carousel.** The carousel walks **units**, and each unit shows its
own photos — its `photo_path` followed by its `unit_photos` in `position` order. That one
rule covers every case with no branching:

| listing | units | photos shown | hearts |
|---|---|---|---|
| Crib, 5 angles | 1 | 5 | 1, on the unit |
| Table + 4 chairs | 1 | however many | 1, on the set |
| 20 books | 20 | 1 each | 20, one per book |

Reserved and sold units are shown but not hearteable.

- [ ] **Step 5: Prices.** One unit → just `₪10`, no per-unit label and no bundle line —
those mean nothing for a single crib. Several units → `₪10 perUnit`, plus `₪100 forAll`
when `showBundlePrice(item)`.

- [ ] **Step 6: Send calls `reserve_units`** with the selected unit ids. The WhatsApp message groups units by item — `ספרי בישול ×3 — ₪30`.

- [ ] **Step 7: Verify** the full buyer path in the browser, then commit.

---

### Task 9: Sold stays visible, with a filter

**Files:**
- Modify: `app/[slug]/page.tsx`, `app/[slug]/SaleClient.tsx`, `app/globals.css`

- [ ] **Step 1: Stop excluding sold.** Remove `.neq("status", "sold")` — sold units now reach the browser. Delete the stale "sold items are never sent to the browser" comment.
- [ ] **Step 2: Grey a card only when every unit is gone**, with the `allSold` band. A lot with some left stays live.
- [ ] **Step 3: Sold units in the carousel** render greyed with the `soldBand`.
- [ ] **Step 4: The `onlyAvailable` filter chip** joins the existing tag chips. Off by default.
- [ ] **Step 5: Tag counts count available units**, so a filter never leads to an empty-looking category.
- [ ] **Step 6: Verify** — mark a unit sold on the board, confirm it greys rather than vanishing, and that the filter hides it. Commit.

---

## Self-review

**Spec coverage:** upload pool → T4; make items from selection → T5; single vs batch by selection count → T5; carousel → T8; card heart = all, inside heart = one → T8; per-unit claiming → T2, T8; bundle price with two real numbers → T1, T5, T8; bundle hidden once a unit sells → T3 helper, T8; bundle nudge → T6; item editing → T7; sold visible + greyed + filter → T9; pool as pending list → T4, T6; connection loss safety → T4 step 2.

**Placeholders:** none — every SQL block is complete and runnable; TypeScript steps name exact signatures and files.

**Type consistency:** `Unit` / `Item` / `StagedPhoto` / `OwnUnit` defined in T3 and used unchanged in T4–T9. `reserve_units` signature identical in T2 and T8. `availableUnits` / `showBundlePrice` defined in T3, used in T6 and T8.

**Known gap:** no automated coverage of the React layer. Task 2 covers the one piece where a bug is silent and costly — the reservation race. UI regressions surface in the browser.

---

### Task 10: Two sections on the board

**Added after the seller used it.** Her words: the board should have two sections —
first upload, waiting photos, the sale link and sign out; second the state of the sale:
what is left, what is sold, and messages waiting.

The current order grew task by task and reads as one long column with no seam. Her split
is the right one: **things I do** above, **what is happening** below.

**Files:** `app/dashboard/BoardClient.tsx`, `app/dashboard/PhotoPool.tsx`,
`app/dashboard/page.tsx` if the query needs it.

- [ ] **Step 1: Section one — putting things in**

Upload button, the waiting-photos pool, the sale link with its copy button, and sign out.
Everything about getting stock onto the board, in one place.

- [ ] **Step 2: Remove a photo from the pool — new capability**

There is currently no way to discard a bad photo; it waits forever. Deleting must remove
the `staged_photos` row **and** both blobs (`photo_path`, `thumb_path`), reporting failure
rather than swallowing it, exactly as `remove()` does for a listing.

Confirm first — it is irreversible, and the photo is already uploaded.

- [ ] **Step 3: Section two — what is happening**

What is left, what is sold, and the wish lists that have arrived. The stat chips and their
filter belong here, with the listings grid.

- [ ] **Step 4: Make the seam visible** — a heading per section, in the existing style. The
two halves should be distinguishable at a glance on a phone, which is where she will use it.

- [ ] **Step 5: Verify and commit.**
