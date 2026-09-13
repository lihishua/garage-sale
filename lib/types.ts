export type ItemStatus = "available" | "reserved" | "sold";

/**
 * Extra views of one unit. A crib shot from five angles is one claimable unit
 * with five pictures: `Unit.photo_path` is the first, these are the rest, in
 * `position` order. A unit photographed once has none of these at all — which
 * is why twenty books produce twenty units and zero rows here.
 */
export type UnitPhoto = {
  id: string;
  unit_id: string;
  photo_path: string;
  thumb_path: string;
  position: number;
};

export type Unit = {
  id: string;
  item_id: string;
  photo_path: string;
  thumb_path: string;
  position: number;
  status: ItemStatus;
  /** what it went for, if the seller wrote it down when marking it sold */
  sold_price?: number | null;
  /**
   * Safe on a public page: `unit_photos` holds image paths and nothing else,
   * exactly like `item_units` itself. No buyer details live here — they are
   * only ever in `requests`. See Global Constraints.
   *
   * Optional because a query may not have asked for them; absent is not the
   * same as "this unit has one photo". Anything that must account for every
   * file — deleting a listing's blobs — has to fetch them.
   */
  photos?: UnitPhoto[];
};

/**
 * Every storage path a unit owns: its own photo, plus each extra view.
 *
 * Deliberately does not deduplicate. Paths are unique by construction —
 * `UploadPhotos` mints each as `${user.id}/${Date.now()}-${random}.webp` — and
 * both consumers are indifferent anyway: `storage.remove()` no-ops on a path
 * it has already deleted, and the dashboard's pool filter feeds the result
 * into a Set.
 */
export const unitPaths = (u: Unit): string[] => [
  u.photo_path, u.thumb_path,
  ...(u.photos ?? []).flatMap((p) => [p.photo_path, p.thumb_path]),
];

export type Item = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number;
  /** what `price` covers: each unit, or the whole lot */
  price_for: "each" | "all";
  /** retired — see the migration. Read nowhere; kept so old rows type. */
  bundle_price: number | null;
  tags: string[];
  measurements: string | null;
  created_at: string;
  units: Unit[];
};

export type StagedPhoto = {
  id: string;
  photo_path: string;
  thumb_path: string;
  created_at: string;
};

export type Sale = { id: string; display_name: string; slug: string };

export type RequestRow = {
  id: string;
  buyer_name: string;
  buyer_phone: string;
  created_at: string;
  request_items: { unit_id: string }[];
};

export type Holder = { name: string; phone: string };
/**
 * Built from requests the dashboard already loads; most recent request wins.
 *
 * Precondition: `requests` must be ordered newest-first (as
 * `app/dashboard/page.tsx` already does via `.order("created_at", { ascending: false })`).
 * This function reverses that order internally so the forward pass overwrites
 * earlier holders with later ones. Pass requests in any other order and the
 * map silently returns a stale holder for a unit reserved more than once —
 * the wrong buyer's name and phone would show on the board, with no crash
 * and no compile error to signal it.
 */
export const holdersByUnit = (requests: RequestRow[]): Map<string, Holder> => {
  const m = new Map<string, Holder>();
  // oldest first, so later requests overwrite earlier ones
  [...requests].reverse().forEach(r =>
    r.request_items.forEach(({ unit_id }) =>
      m.set(unit_id, { name: r.buyer_name, phone: r.buyer_phone })));
  return m;
};

export const availableUnits = (i: Item) => i.units.filter(u => u.status === "available");

// the bundle price is only true while nothing has gone

export const TAGS = ["furniture", "books", "clothes", "kids", "home", "kitchen", "music"] as const;
export type Tag = (typeof TAGS)[number];

/**
 * How many photos a מארז's collage shows — see `.gs-collage` in globals.css
 * for the layout each count gets. The rule is that the grid is always
 * completely full: take the largest tile count the photos can fill without
 * leaving a hole, from 2, 3, 4 and 9. Two photos are two full-height halves,
 * three are one tall beside two stacked, four to eight are a plain 2×2, nine
 * or more a 3×3 — so a count that would leave holes (five in a 3×3) shows
 * fewer photos instead. Nothing is lost by that: what is still free is written
 * under the card in words, never counted off the tiles.
 *
 * Only ever called with n > 1, because a single item or set keeps its cover.
 */
export const collageTiles = (n: number) => (n >= 9 ? 9 : n >= 4 ? 4 : n);
