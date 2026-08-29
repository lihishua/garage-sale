import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { Item, RequestRow, StagedPhoto, Unit } from "@/lib/types";
import BoardClient from "./BoardClient";

export const revalidate = 0;

export default async function Dashboard() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("display_name, phone, slug").eq("id", user.id).single();

  // signed up but the profile row never landed — send them back to finish
  if (!profile) redirect("/login");

  // An item is a card, each of its units is a claimable thing, and each unit
  // owns its extra views. Columns are named rather than select("*"):
  // item_units and unit_photos are both world-readable, so the shape this
  // query takes is the shape the public page copies. Both tables hold image
  // paths only — buyer details are in `requests` alone.
  //
  // unit_photos is fetched even though the board draws none of them: deleting
  // a listing has to remove every blob it owns, and a path nobody fetched is a
  // file stranded in the bucket forever.
  const { data: rows } = await supabase
    .from("items")
    .select(
      "id, seller_id, title, description, price, bundle_price, tags, measurements, created_at," +
      " units:item_units(id, item_id, photo_path, thumb_path, position, status," +
      " photos:unit_photos(id, unit_id, photo_path, thumb_path, position))"
    )
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  // position 0 is the cover; an embedded select carries no order guarantee,
  // at either level
  const items: Item[] = ((rows ?? []) as any[]).map((r) => ({
    ...r,
    units: [...(r.units ?? [])]
      .sort((a: Unit, b: Unit) => a.position - b.position)
      .map((u: Unit) => ({
        ...u,
        photos: [...(u.photos ?? [])].sort((a, b) => a.position - b.position),
      })),
  }));

  // row level security already scopes this to the signed-in seller; the
  // explicit filter keeps that intent visible in the query itself
  const { data: requests } = await supabase
    .from("requests")
    .select("id, buyer_name, buyer_phone, created_at, request_items(unit_id)")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // the pool: photos uploaded but not yet made into a listing. private to this
  // seller by RLS, and never handed to the public sale page.
  const { data: staged } = await supabase
    .from("staged_photos")
    .select("id, photo_path, thumb_path, created_at")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: true });

  return (
    <BoardClient
      profile={profile}
      items={items}
      requests={(requests ?? []) as RequestRow[]}
      staged={(staged ?? []) as StagedPhoto[]}
    />
  );
}
