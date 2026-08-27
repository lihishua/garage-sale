import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { Item, RequestRow } from "@/lib/types";
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

  const { data: items } = await supabase
    .from("items").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });

  // row level security already scopes this to the signed-in seller; the
  // explicit filter keeps that intent visible in the query itself
  const { data: requests } = await supabase
    .from("requests")
    .select("id, buyer_name, buyer_phone, created_at, request_items(item_id)")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <BoardClient
      profile={profile}
      items={(items ?? []) as Item[]}
      requests={(requests ?? []) as RequestRow[]}
    />
  );
}
