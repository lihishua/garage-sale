# Photo pool & batch items — design

**Date:** 2026-08-29
**Status:** awaiting review

Two changes to how a seller adds things and how a buyer claims them.

1. **Uploading is split from describing.** Photos go up in one go, into a pool. Making
   items out of them happens afterwards, at her own pace.
2. **An item can hold several photos.** Twenty books become one card, one description,
   and twenty individually claimable things inside it.

---

## The core idea

Today one row in `items` is three things at once: a card in the grid, a photo, and the
unit that gets reserved. Batch items break that apart, because twenty books need one
card and one description but twenty separate claims.

So the model becomes two levels:

| Level | What it is | What it holds |
|---|---|---|
| **item** | the card | title, description, tags, measurements, price per unit, optional "all for" price |
| **unit** | one photo | its own status, its own reserved-by details |

**A single item is a batch of one.** A sofa is a card with one unit; books are a card
with twenty.

**A photo and a claimable thing are not the same.** A crib shot from five angles is one
unit with five photos. A table-and-four-chairs set is one unit, sold together. Twenty books
are twenty units. So a unit owns its photos (`unit_photos`), and the create form asks which
kind it is whenever more than one photo is selected — the app cannot infer it.

There is no separate code path for "normal" and "batch" items. The grid, the wish list and
the reservation function all work one way. This is the decision the whole design rests on.

---

## Seller flow

### Step 1 — upload

One button on the board: **העלאת תמונות**. She picks any number of photos from her
gallery. Each is resized in the browser exactly as now (1600px full, 480px thumb,
under 1200px wide is rejected) and uploaded straight to storage.

Nothing else is asked. This is deliberately the only step that touches the network in
bulk, so it either finishes or leaves a partial pool — never a half-made item.

### Step 2 — make items

Uploaded photos that don't belong to an item yet sit in a **pool** on the board, above
the items, with a count: *"12 תמונות מחכות לך"*.

She selects photos and taps **צרי פריט**:

- **one photo selected** → a single item
- **several selected** → one item with those photos as its units

Then the item form: title, price per unit, description, tags, measurements if furniture,
and — only when more than one photo is selected — an optional **"הכל ביחד"** price.

On save, those photos leave the pool. She repeats until the pool is empty, or leaves the
rest for another evening.

### Why this shape

The pool *is* the pending list. A photo not yet made into an item is simply an unused
photo, so there are no half-finished items in the database and `items` keeps its
"title, price and description are required" guarantees intact.

Connection loss is handled by construction: photos are already in storage. She reopens
the board and they are waiting.

### Also new: editing an item

Currently the board can only delete. Editing is needed so she can revise the "all for"
price once some units sell. Scope: title, description, price, bundle price, tags,
measurements. Not photos — units are added by making a new item, removed by selling.

---

## Buyer flow

### The grid

One card per item, showing the cover photo (first unit), title, and price.

An item with more than one available unit also shows a count — *"20 פריטים"* — and its
prices as *"₪10 ליחידה · ₪100 להכל"*.

**The heart on the card adds every available unit to the wish list.** From the grid, the
gesture means "I want the lot".

### Inside the item

Tapping the card opens the item with a **carousel** of its available units. Each photo
has its own heart.

**Hearting inside adds only that unit.** The gesture means "I want this one".

If she hearts the card and then opens it, all the photos show as hearted; unhearting one
inside removes just that one. The two gestures act on the same list, at different
granularity.

### Sold and reserved units

**This reverses current behaviour.** Today sold items are never sent to the browser at
all. From now on they stay on the page, greyed out with a **נמכר** band, and a filter
lets buyers hide them.

Keeping them visible shows neighbours the sale is active — an empty-looking page reads
as "nothing here", a page of crossed-off things reads as "get in quickly".

- **Sold units** — shown greyed with **נמכר**, not hearteable.
- **Reserved units** — shown greyed with **מישהו ביקש**, not hearteable. Unchanged.
- **A new filter chip**, *"רק מה שפנוי"*, sits with the existing tag chips and hides
  everything already claimed. Off by default, so the full sale shows on arrival.

An item card is greyed only when **every** unit is gone. A lot with 17 of 20 still
available is a live card showing 17; the three sold ones appear greyed inside its
carousel.

**Making sold units visible must not become a route to who bought what.** It cannot:
there are no buyer-detail columns on `item_units` to expose. That is enforced by the
schema rather than by query discipline — see the data model below.

### The bundle price

**Shown only while every unit is still available.** The moment one is gone, "₪100 להכל"
stops being true, so buyers stop seeing it and the card falls back to the per-unit price.

It isn't deleted. The seller's board shows *"נמכרו 3 מתוך 20 — לעדכן את מחיר הלוט?"*, and
she can set a new one through the edit form. Silently clearing it would leave her
wondering where her price went.

---

## Data model

```
profiles ──< items ──< item_units ──< unit_photos
                          │
                          └──< request_items >── requests

profiles ──< staged_photos (the pool)
```

### `items` — changed

Keeps: `id`, `seller_id`, `title`, `description`, `price`, `tags`, `measurements`, `created_at`.
`price` keeps its name and now means **price per unit** — for a single item that is
simply its price.

- **adds** `bundle_price integer null check (bundle_price > 0)` — the "all for" price
- **loses** `photo_path`, `thumb_path`, `status`, `reserved_by_name`, `reserved_by_phone`
  — all four move down to the unit

### `item_units` — new

| column | notes |
|---|---|
| `id` | uuid |
| `item_id` | → items, cascade |
| `photo_path`, `thumb_path` | as items had |
| `position` | integer, 0 is the cover |
| `status` | available / reserved / sold — the existing enum, unchanged |

Deliberately **no** `reserved_by_*` columns. This table is world-readable, and row level
security is row-level only, so any column on it is public whatever the app's own queries
ask for. Who asked for what lives solely in `requests`.

### `staged_photos` — new

`id`, `seller_id` → profiles cascade, `photo_path`, `thumb_path`, `created_at`.
Rows are deleted when their photo becomes a unit.

### `request_items` — changed

Now points at `unit_id` rather than `item_id`, since units are what get claimed. The
dashboard reaches the item by joining up through the unit.

### Access rules

Unchanged in spirit, extended to the new tables:

- `item_units` — anyone may read; only the owning seller may write (via the parent item's
  `seller_id`)
- `unit_photos` — anyone may read (image paths only, no buyer details); only the owning
  seller may write, reached through the unit's parent item
- `staged_photos` — the owning seller only, for everything. Never public.
- `items` — as today
- Nobody may write `requests` directly; the function below stays the only route

### `reserve_items` → `reserve_units`

Same shape, one level down. Takes unit ids instead of item ids, and the conditional
update becomes:

```sql
update item_units set status = 'reserved', ...
 where id = any(p_unit_ids) and status = 'available'
returning id
```

The sofa guarantee is unchanged and now also covers a single book inside a lot: two
buyers claiming the same book, exactly one wins, the loser is told.

The seller lookup joins unit → item → profile to confirm every unit belongs to the sale
in the link.

---

## Files affected

| File | Change |
|---|---|
| `supabase/schema.sql` | the model above |
| new migration | applied against the live project |
| `lib/types.ts` | `Item`, new `Unit`, `StagedPhoto` |
| `app/dashboard/AddItem.tsx` | becomes upload-to-pool + create-item-from-selection |
| `app/dashboard/BoardClient.tsx` | pool section, unit-aware cards, edit form |
| `app/dashboard/page.tsx` | fetch units and pool |
| `app/[slug]/page.tsx` | fetch items with units |
| `app/[slug]/SaleClient.tsx` | carousel, two-level hearts, wish list of units |
| `lib/i18n.ts` | new strings, both locales |

---

## Deliberately not included

- **Reordering photos inside an item.** Upload order is the order; the first is the cover.
- **Moving a photo between items.** Delete the item, the photos return to the pool.
- **Per-unit titles.** A lot has one description; that is the point of it.
- **Quantity without photos** ("I have 20 of these, one picture"). Every unit is a photo.
- **The guided walkthrough** of photos one by one. The pool replaces it. Worth revisiting
  once the pool has been used in anger.

---

## Decided during review

**Sold things stay visible.** Greyed, banded **נמכר**, with a *"רק מה שפנוי"* filter for
buyers who only want what's still going. See *Sold and reserved units* above. This
replaces the current rule that sold items never reach the browser.
