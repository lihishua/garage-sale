import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

export default async function Home() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="gs-landing">
      <img className="gs-logo" src="/logo.webp" alt="Garage Sale" />
      <p>
        מעלים תמונות של מה שמוכרים, מקבלים קישור אחד, ושולחים אותו לשכנים.
        הם מסמנים בלב מה שהם רוצים ושולחים לכם רשימה בוואטסאפ.
      </p>
      <img className="gs-arrow" src="/arrow.webp" alt="" aria-hidden="true" />
      <Link href="/login?mode=signup">
        <button className="gs-btn gs-btn-orange gs-btn-big">לפתוח מכירת חצר משלי</button>
      </Link>
    </main>
  );
}
