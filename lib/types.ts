export type ItemStatus = "available" | "reserved" | "sold";

export type Item = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number;
  tags: string[];
  measurements: string | null;
  photo_path: string;
  thumb_path: string;
  status: ItemStatus;
  reserved_by_name: string | null;
  reserved_by_phone: string | null;
  created_at: string;
};

export type Sale = { id: string; display_name: string; slug: string };

export type RequestRow = {
  id: string;
  buyer_name: string;
  buyer_phone: string;
  created_at: string;
  request_items: { item_id: string }[];
};

export const TAGS = ["furniture", "books", "clothes", "kids", "home", "kitchen", "music"] as const;
export type Tag = (typeof TAGS)[number];
