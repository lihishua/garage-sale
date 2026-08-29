export type ItemStatus = "available" | "reserved" | "sold";

export type Unit = {
  id: string;
  item_id: string;
  photo_path: string;
  thumb_path: string;
  position: number;
  status: ItemStatus;
};

export type Item = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number;
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
/** built from requests the dashboard already loads; most recent request wins */
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
export const showBundlePrice = (i: Item) =>
  i.bundle_price != null && i.units.length > 1 && i.units.every(u => u.status === "available");

export const TAGS = ["furniture", "books", "clothes", "kids", "home", "kitchen", "music"] as const;
export type Tag = (typeof TAGS)[number];
