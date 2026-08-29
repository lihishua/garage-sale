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
        מעלים תמונות של כל הפריטים למכירה/למסירה מהבית, מקבלים קישור אחד
        שמעבירים לחברים בשכונה, והם מסמנים בקלות מה הם רוצים.
        תנסו, מקסימום תתייעלו <span dir="ltr">:-)</span>
      </p>
      <img className="gs-arrow" src="/arrow.webp" alt="" aria-hidden="true" />
      <Link href="/login?mode=signup">
        <button className="gs-btn gs-btn-orange gs-btn-big">לפתוח מכירת חצר משלי</button>
      </Link>
    </main>
  );
}
