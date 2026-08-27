import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * Where the emailed login link lands.
 *
 * The link carries a one-time token_hash, which we trade for a real session.
 * The seller's name, phone and page address are not sent along with it — they
 * were stored as metadata on the auth user when she asked for the link, so
 * they survive her requesting the mail on a laptop and opening it on a phone.
 * The profile row is created here, on her first successful click.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!token_hash || !type) redirect("/login?err=expired");

  const supabase = supabaseServer();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });

  // expired, already clicked, or tampered with
  if (error || !data.user) redirect("/login?err=expired");

  const user = data.user;
  const { data: profile } = await supabase
    .from("profiles").select("id").eq("id", user.id).maybeSingle();

  if (profile) redirect("/dashboard");

  // first time in — build the profile from what she typed on the signup form
  const meta = user.user_metadata ?? {};
  if (!meta.display_name || !meta.phone || !meta.slug) {
    // signed in, but we never captured the details (an old half-made account)
    redirect("/login?err=profile");
  }

  const { error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    display_name: String(meta.display_name),
    phone: String(meta.phone),
    slug: String(meta.slug),
  });

  // almost always a slug someone else claimed between the form and the click
  if (insertError) redirect("/login?err=profile");

  redirect("/dashboard");
}
