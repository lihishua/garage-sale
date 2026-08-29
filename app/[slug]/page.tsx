import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { Item, Sale, Unit } from "@/lib/types";
import SaleClient from "./SaleClient";

export const revalidate = 0;

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const supabase = supabaseServer();
  const { data } = await supabase.from("public_sales").select("display_name").eq("slug", params.slug).single();
  return { title: data ? `Garage Sale — ${data.display_name}` : "Garage Sale" };
}

export default async function SalePage({ params }: { params: { slug: string } }) {
  const supabase = supabaseServer();

  const { data: sale } = await supabase
    .from("public_sales")
    .select("id, display_name, slug")
    .eq("slug", params.slug)
    .single<Sale>();

  if (!sale) notFound();

  // An item is a card; each of its photos is an `item_units` row with a status
  // of its own, and a unit can carry extra views in `unit_photos`. Columns are
  // named rather than select("*"), as everywhere else — though on this page it
  // is the schema, not the query, that keeps buyer details out: `item_units`
  // has no `reserved_by_*` columns, and both embedded tables hold image paths
  // and nothing more. Who asked for what lives in `requests` alone, which this
  // page never touches.
  //
  // Sold units come down with the rest now. They render greyed with a נמכר
  // band instead of vanishing, so a מארז with three of twenty gone still reads
  // as one card with seventeen left; the רק מה שפנוי chip is what hides them.
  const { data: rows } = await supabase
    .from("items")
    .select(
      "id, seller_id, title, description, price, bundle_price, tags, measurements, created_at," +
      " units:item_units(id, item_id, photo_path, thumb_path, position, status," +
      " photos:unit_photos(id, unit_id, photo_path, thumb_path, position))"
    )
    .eq("seller_id", sale.id)
    .order("created_at", { ascending: false });

  // position 0 is the cover; an embedded select carries no order guarantee, at
  // either level. A card with no units at all is dropped: it has no photo to
  // show and nothing to claim.
  const items: Item[] = ((rows ?? []) as any[])
    .map((r) => ({
      ...r,
      units: [...(r.units ?? [])]
        .sort((a: Unit, b: Unit) => a.position - b.position)
        .map((u: Unit) => ({
          ...u,
          photos: [...(u.photos ?? [])].sort((a, b) => a.position - b.position),
        })),
    }))
    .filter((i) => i.units.length > 0);

  return <SaleClient sale={sale} items={items} />;
}
