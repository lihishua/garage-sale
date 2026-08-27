"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser, photoUrl } from "@/lib/supabase-browser";
import { STR, TAG_LABEL, money, type Lang } from "@/lib/i18n";
import { TAGS, type Item, type Sale } from "@/lib/types";
import { Heart, Chip, Sheet, Field, Toast } from "@/components/ui";

const wishKey = (slug: string) => `gs.wish.${slug}`;

export default function SaleClient({ sale, items: initial }: { sale: Sale; items: Item[] }) {
  const [lang] = useState<Lang>("he");
  const t = STR[lang];

  const [items, setItems] = useState(initial);
  const [wish, setWish] = useState<string[]>([]);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("new");
  const [open, setOpen] = useState<Item | null>(null);
  const [panel, setPanel] = useState<null | "wish" | "checkout" | "sent">(null);
  const [buyer, setBuyer] = useState({ name: "", phone: "" });
  const [err, setErr] = useState<{ name?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sent, setSent] = useState<{ msg: string; phone: string; dropped: number } | null>(null);

  /* the wish list lives in the browser — no account needed to keep one */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(wishKey(sale.slug));
      if (raw) setWish(JSON.parse(raw));
    } catch { /* private mode, or corrupted — start empty */ }
  }, [sale.slug]);

  useEffect(() => {
    try { localStorage.setItem(wishKey(sale.slug), JSON.stringify(wish)); } catch { /* ignore */ }
  }, [wish, sale.slug]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    TAGS.forEach((tag) => { c[tag] = items.filter((i) => i.tags.includes(tag)).length; });
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const list = items.filter((i) => filter === "all" || i.tags.includes(filter));
    if (sort === "low") return [...list].sort((a, b) => a.price - b.price);
    if (sort === "high") return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [items, filter, sort]);

  const wished = items.filter((i) => wish.includes(i.id) && i.status === "available");
  const wishTotal = wished.reduce((s, i) => s + i.price, 0);

  const toggleWish = (id: string) => {
    const it = items.find((i) => i.id === id);
    if (!it || it.status !== "available") return;
    setWish((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  };

  async function send() {
    const e: typeof err = {};
    if (!buyer.name.trim()) e.name = t.errName;
    if (!/^[\d\s+-]{7,}$/.test(buyer.phone.trim())) e.phone = t.errPhone;
    if (Object.keys(e).length) { setErr(e); return; }
    setErr({});
    setBusy(true);

    const ids = wished.map((i) => i.id);
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.rpc("reserve_items", {
      p_slug: sale.slug, p_item_ids: ids, p_name: buyer.name.trim(), p_phone: buyer.phone.trim(),
    });
    setBusy(false);

    if (error || !data?.ok) { say(t.errSend); return; }

    const reserved: string[] = data.reserved ?? [];
    const unavailable: string[] = data.unavailable ?? [];

    const lines = items
      .filter((i) => reserved.includes(i.id))
      .map((i) => `• ${i.title} — ${money(i.price)}`)
      .join("\n");
    const total = items.filter((i) => reserved.includes(i.id)).reduce((s, i) => s + i.price, 0);
    const msg = `${lang === "he" ? "היי" : "Hi"} ${data.seller_name}!\n\n${lines}\n\n${t.total}: ${money(total)}\n\n${buyer.name.trim()} — ${buyer.phone.trim()}`;

    setItems((prev) => prev.map((i) =>
      reserved.includes(i.id) || unavailable.includes(i.id) ? { ...i, status: "reserved" } : i));
    setWish([]);
    setSent({ msg, phone: data.seller_phone, dropped: unavailable.length });
    setPanel("sent");
  }

  const openWa = (phone: string, text: string) =>
    window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`, "_blank");

  return (
    <>
      <button className="gs-fab" onClick={() => setPanel("wish")}
        aria-label={t.wishList + (wish.length ? ` (${wish.length})` : "")}>
        <Heart on={wish.length > 0} />
        {wish.length > 0 && <span className="gs-fab-count">{wish.length}</span>}
      </button>

      <main className="gs-wrap">
        <header className="gs-head">
          <img className="gs-logo" src="/logo.webp" alt="Garage Sale" />
        </header>

        {items.length === 0 ? (
          <p className="gs-empty">{t.saleEmpty}</p>
        ) : (
          <>
            <div className="gs-filters" role="group">
              <Chip on={filter === "all"} onClick={() => setFilter("all")}>
                {t.all} <span className="gs-chip-n">{counts.all}</span>
              </Chip>
              {TAGS.filter((tag) => counts[tag] > 0).map((tag) => (
                <Chip key={tag} on={filter === tag} onClick={() => setFilter(tag)}>
                  {TAG_LABEL[tag][lang]} <span className="gs-chip-n">{counts[tag]}</span>
                </Chip>
              ))}
            </div>

            <div className="gs-sortbar">
              <label className="gs-sort">
                <span>{t.sort}</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="new">{t.sortNew}</option>
                  <option value="low">{t.sortLow}</option>
                  <option value="high">{t.sortHigh}</option>
                </select>
              </label>
            </div>

            {shown.length === 0 ? (
              <p className="gs-empty">{t.emptyFilter(TAG_LABEL[filter]?.[lang] ?? filter)}</p>
            ) : (
              <div className="gs-grid">
                {shown.map((it) => (
                  <article key={it.id} className={"gs-card" + (it.status !== "available" ? " taken" : "")}>
                    <button className="gs-photo" onClick={() => setOpen(it)} aria-label={it.title}>
                      <img src={photoUrl(it.thumb_path)} alt={it.title} loading="lazy" />
                      {it.status === "reserved" && <span className="gs-band">{t.taken}</span>}
                    </button>
                    <button className="gs-heart" onClick={() => toggleWish(it.id)}
                      disabled={it.status !== "available"} aria-pressed={wish.includes(it.id)}
                      aria-label={t.addToList}>
                      <Heart on={wish.includes(it.id)} />
                    </button>
                    <div className="gs-card-body">
                      <h3 className="gs-card-title">{it.title}</h3>
                      <div className="gs-card-row">
                        <span className="gs-price">{money(it.price)}</span>
                        <span className="gs-tags">{it.tags.map((x) => TAG_LABEL[x]?.[lang] ?? x).join(" · ")}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        <footer className="gs-footer">
          <img className="gs-arrow" src="/arrow.webp" alt="" aria-hidden="true" />
          <Link href="/login?mode=signup"><button className="gs-btn gs-btn-orange gs-btn-big">{t.startMine}</button></Link>
        </footer>
      </main>

      {showTop && (
        <button className="gs-top" aria-label={t.toTop}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 19V6M6 12l6-6 6 6" fill="none" stroke="#FCFBF7" strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {open && (
        <Sheet title={open.title} onClose={() => setOpen(null)}>
          <div className="gs-detail-photo">
            <img src={photoUrl(open.photo_path)} alt={open.title} />
          </div>
          <p className="gs-detail-price">{money(open.price)}</p>
          <p className="gs-detail-desc">{open.description}</p>
          {open.measurements && (
            <p className="gs-detail-size"><b>{t.measurements}</b> · <span dir="ltr">{open.measurements}</span></p>
          )}
          <p className="gs-detail-tags">{open.tags.map((x) => TAG_LABEL[x]?.[lang] ?? x).join(" · ")}</p>
          {open.status !== "available" ? (
            <p className="gs-note">{t.takenNote}</p>
          ) : (
            <button className={"gs-btn gs-btn-wide " + (wish.includes(open.id) ? "gs-btn-cream" : "gs-btn-orange")}
              onClick={() => toggleWish(open.id)}>
              {wish.includes(open.id) ? t.onList : t.addToList}
            </button>
          )}
        </Sheet>
      )}

      {panel === "wish" && (
        <Sheet title={t.wishList} onClose={() => setPanel(null)}>
          {wished.length === 0 ? <p className="gs-empty">{t.wishEmpty}</p> : (
            <>
              <ul className="gs-list">
                {wished.map((i) => (
                  <li key={i.id} className="gs-list-row">
                    <img className="gs-mini" src={photoUrl(i.thumb_path)} alt="" />
                    <span className="gs-list-name">{i.title}</span>
                    <span className="gs-price">{money(i.price)}</span>
                    <button className="gs-x" onClick={() => toggleWish(i.id)} aria-label={t.close}>×</button>
                  </li>
                ))}
              </ul>
              <p className="gs-total">{t.total} <b>{money(wishTotal)}</b></p>
              <button className="gs-btn gs-btn-orange gs-btn-wide" onClick={() => setPanel("checkout")}>
                {t.sendList(sale.display_name)}
              </button>
            </>
          )}
        </Sheet>
      )}

      {panel === "checkout" && (
        <Sheet title={t.whoAsks} onClose={() => setPanel("wish")}>
          <p className="gs-lead">{t.checkoutLead(wished.length, sale.display_name)}</p>
          <Field label={t.yourName} value={buyer.name} err={err.name}
            onChange={(v) => setBuyer({ ...buyer, name: v })} placeholder={t.namePh} />
          <Field label={t.phone} value={buyer.phone} err={err.phone} ltr
            onChange={(v) => setBuyer({ ...buyer, phone: v })} placeholder={t.phonePh} />
          <button className="gs-btn gs-btn-orange gs-btn-wide" onClick={send} disabled={busy}>
            {busy ? t.loading : t.send}
          </button>
        </Sheet>
      )}

      {panel === "sent" && sent && (
        <Sheet title={t.sentTitle(sale.display_name)} onClose={() => setPanel(null)}>
          {sent.dropped > 0 && <p className="gs-note">{t.someGone}</p>}
          <div className="gs-wa">{sent.msg}</div>
          <button className="gs-btn gs-btn-green gs-btn-wide" onClick={() => openWa(sent.phone, sent.msg)}>
            {t.openWa(sale.display_name)}
          </button>
          <p className="gs-fine">{t.sentFine}</p>
          <button className="gs-btn-ghost" onClick={() => setPanel(null)}>{t.backToSale}</button>
        </Sheet>
      )}

      {toast && <Toast text={toast} />}
    </>
  );
}
