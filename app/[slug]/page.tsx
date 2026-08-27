import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { Item, Sale } from "@/lib/types";
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

  // sold items are never sent to the browser at all
  const { data: items } = await supabase
    .from("items")
    .select("id, seller_id, title, description, price, tags, measurements, photo_path, thumb_path, status, created_at")
    .eq("seller_id", sale.id)
    .neq("status", "sold")
    .order("created_at", { ascending: false });

  return <SaleClient sale={sale} items={(items ?? []) as Item[]} />;
}
