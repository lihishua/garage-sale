import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { unitPaths, type Item, type RequestRow, type StagedPhoto, type Unit } from "@/lib/types";
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
  //
  // This is a display list — "wish lists that came in" — and capping it at
  // the newest 50 is the right call there. It must NOT be reused to derive
  // who holds a reserved unit: on a busy sale an older still-pending hold
  // can fall outside this window, and that is exactly the hold she most
  // needs the name on. See `holderRequests` below for that.
  const { data: requests } = await supabase
    .from("requests")
    .select("id, buyer_name, buyer_phone, created_at, request_items(unit_id)")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  /**
   * The requests that hold today's still-reserved units — exact, unlike the
   * capped list above. `reserve_units` (see the migration) sets a unit's
   * status to 'reserved' and inserts its `request_items` row in the same
   * function call, so a reserved unit always has at least one such row; this
   * query fetches exactly those rows, filtered on the join with `!inner`, so
   * its size is bounded by how many units are currently reserved — naturally
   * small — rather than by how many requests the seller has ever received.
   */
  const reservedUnitIds = items.flatMap((i) => i.units)
    .filter((u) => u.status === "reserved").map((u) => u.id);

  const { data: holderRequests } = reservedUnitIds.length
    ? await supabase
        .from("requests")
        .select("id, buyer_name, buyer_phone, created_at, request_items!inner(unit_id)")
        .eq("seller_id", user.id)
        .in("request_items.unit_id", reservedUnitIds)
        .order("created_at", { ascending: false })
    : { data: [] as RequestRow[] };

  // the pool: photos uploaded but not yet made into a listing. private to this
  // seller by RLS, and never handed to the public sale page.
  const { data: staged } = await supabase
    .from("staged_photos")
    .select("id, photo_path, thumb_path, created_at")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: true });

  /**
   * Drop staged rows whose photo is already in a listing.
   *
   * This is an exact test, not a fuzzy dedupe, and it must not be weakened
   * into one. `UploadPhotos` mints every path as `${user.id}/${Date.now()}-
   * ${random}.webp`, so two photos cannot legitimately share a path — a match
   * has exactly one cause: `CreateItem` built the listing but the follow-up
   * delete of the `staged_photos` row failed, leaving the row behind.
   *
   * Without this, a reload puts those photos back in the pool unmarked and she
   * can build a second listing out of photos that are already in one.
   * `BoardClient` guards the same thing within a session; this is what makes
   * the guard survive a refresh. The paths are already in memory from the
   * items query, so it costs one Set and one pass.
   */
  const inAListing = new Set(items.flatMap((i) => i.units.flatMap(unitPaths)));
  const pool = ((staged ?? []) as StagedPhoto[]).filter((p) => !inAListing.has(p.photo_path));

  return (
    <BoardClient
      profile={profile}
      items={items}
      requests={(requests ?? []) as RequestRow[]}
      holderRequests={(holderRequests ?? []) as RequestRow[]}
      staged={pool}
    />
  );
}
