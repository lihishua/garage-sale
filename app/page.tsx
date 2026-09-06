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
      {/* one line per step, so the whole thing is read as a sequence rather
          than as a paragraph to get through */}
      <div className="gs-steps">
        <p>מעלים תמונות של פריטים למכירה/למסירה.</p>
        <p>מקבלים קישור ומעבירים לחברים בשכונה.</p>
        <p>הם מסמנים בקלות מה הם רוצים.</p>
        <p>ומכאן זה ביניכם, בווטסאפ.</p>
        {/* the aside, not a step — hence the air above it */}
        <p className="gs-steps-end">תנסו - מקסימום תתלהבו <span dir="ltr">:-)</span></p>
      </div>
      <img className="gs-arrow" src="/arrow.webp" alt="" aria-hidden="true" />
      <Link href="/login?mode=signup">
        <button className="gs-btn gs-btn-orange gs-btn-big">לפתוח מכירת חצר משלי</button>
      </Link>
    </main>
  );
}
