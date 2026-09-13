import Link from "next/link";
import { STR } from "@/lib/i18n";

export const metadata = { title: "Garage Sale — פרטיות" };

/**
 * What the app does with people's information, in plain words.
 *
 * Every claim on this page is something the code actually does, and nothing
 * more — it was written by reading the code, not by copying a template. If a
 * future change stores, sends or loads something new, this page is part of
 * that change.
 */
export default function PrivacyPage() {
  const t = STR.he;
  return (
    <main className="gs-landing gs-privacy">
      <img className="gs-logo" src="/logo.webp" alt="Garage Sale" />
      <h1 className="gs-section-h">{t.privacyTitle}</h1>

      <section>
        <h2>{t.privBuyersH}</h2>
        <p>{t.privBuyers1}</p>
        <p>{t.privBuyers2}</p>
      </section>

      <section>
        <h2>{t.privSellersH}</h2>
        <p>{t.privSellers1}</p>
        <p>{t.privSellers2}</p>
      </section>

      <section>
        <h2>{t.privNotH}</h2>
        <p>{t.privNot1}</p>
        <p>{t.privNot2}</p>
      </section>

      <section>
        <h2>{t.privWhereH}</h2>
        <p>{t.privWhere1}</p>
      </section>

      <p className="gs-fine">{t.privContact}</p>
      <Link href="/" className="gs-btn-ghost">{t.privBack}</Link>
    </main>
  );
}
