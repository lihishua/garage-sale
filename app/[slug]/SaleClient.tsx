"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser, photoUrl } from "@/lib/supabase-browser";
import { STR, TAG_LABEL, money, type Lang } from "@/lib/i18n";
import { TAGS, availableUnits, showBundlePrice, type Item, type Sale, type Unit } from "@/lib/types";
import { Heart, Chip, Sheet, Field, Toast } from "@/components/ui";

/**
 * The list holds **unit ids**, not item ids — a unit is the thing a buyer can
 * actually claim. The key is unchanged, so a list saved before this became
 * true survives as ids that match nothing at all: it reads as empty, which is
 * the harmless outcome and needs no migration.
 */
const wishKey = (slug: string) => `gs.wish.${slug}`;

/** one photo of one unit — what the gallery in the item sheet walks */
type Slide = { unit: Unit; path: string; thumb: string };

/**
 * Every slide a card has: each unit's own photo, then that unit's extra views
 * in position order. One rule, no branching, and it covers every case the
 * seller can build — a crib shot from five angles is one unit, so five slides
 * that all carry the same single heart; twenty books are twenty units, so
 * twenty slides with twenty separate hearts.
 */
const slidesOf = (i: Item): Slide[] =>
  i.units.flatMap((u) => [
    { unit: u, path: u.photo_path, thumb: u.thumb_path },
    ...(u.photos ?? []).map((p) => ({ unit: u, path: p.photo_path, thumb: p.thumb_path })),
  ]);

export default function SaleClient({ sale, items: initial }: { sale: Sale; items: Item[] }) {
  const [lang] = useState<Lang>("he");
  const t = STR[lang];

  const [items, setItems] = useState(initial);
  const [wish, setWish] = useState<string[]>([]);
  const [filter, setFilter] = useState("all");
  // off by default: the whole sale — sold things included — shows on arrival
  const [onlyFree, setOnlyFree] = useState(false);
  const [sort, setSort] = useState("new");
  // the open card is held by id, not by value, so the sheet keeps up with a
  // status that changed under it after a send
  const [openId, setOpenId] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [panel, setPanel] = useState<null | "wish" | "checkout" | "sent">(null);
  const [buyer, setBuyer] = useState({ name: "", phone: "" });
  const [err, setErr] = useState<{ name?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sent, setSent] = useState<{ msg: string; phone: string | null; dropped: number } | null>(null);

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

  const wishSet = useMemo(() => new Set(wish), [wish]);

  // Every count is over *available units* — the things still there to claim.
  // A category whose units have all gone loses its chip rather than offering a
  // number that leads to nothing claimable; its cards are still in "הכל".
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    items.forEach((i) => {
      const free = availableUnits(i).length;
      c.all += free;
      i.tags.forEach((tag) => { c[tag] = (c[tag] ?? 0) + free; });
    });
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const list = items.filter((i) =>
      (filter === "all" || i.tags.includes(filter)) &&
      (!onlyFree || availableUnits(i).length > 0));
    if (sort === "low") return [...list].sort((a, b) => a.price - b.price);
    if (sort === "high") return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [items, filter, onlyFree, sort]);

  // The list, resolved against what is still claimable: stale ids from an old
  // visit and units someone else took both drop out on their own.
  const wishUnits = useMemo(
    () => items.flatMap((i) => i.units
      .filter((u) => wishSet.has(u.id) && u.status === "available")
      .map((u) => ({ unit: u, item: i }))),
    [items, wishSet]
  );

  // grouped by card, because that is how both the list panel and the seller's
  // WhatsApp message read it: "מארז ספרים ×3 — ₪30"
  const wishGroups = useMemo(() => {
    const m = new Map<string, { item: Item; units: Unit[] }>();
    wishUnits.forEach(({ unit, item }) => {
      const g = m.get(item.id) ?? { item, units: [] };
      g.units.push(unit);
      m.set(item.id, g);
    });
    return [...m.values()];
  }, [wishUnits]);

  // `price` is per unit, so the total counts photos, not cards. The bundle
  // price deliberately does not enter here: it is the seller's offer to make
  // in the chat, and reserve_units has no notion of it.
  const wishTotal = wishGroups.reduce((s, g) => s + g.item.price * g.units.length, 0);

  const open = openId ? items.find((i) => i.id === openId) ?? null : null;
  const slides = useMemo(() => (open ? slidesOf(open) : []), [open]);
  // a unit that just went to someone else can shrink the gallery under us
  const at = Math.min(slide, Math.max(slides.length - 1, 0));
  const cur = slides[at] ?? null;

  const openCard = (i: Item) => { setOpenId(i.id); setSlide(0); };

  /* ---- the two levels of hearting, both writing the same list ---- */

  // inside the sheet: this photo's unit alone
  const toggleUnit = (u: Unit) => {
    if (u.status !== "available") return;
    setWish((w) => (w.includes(u.id) ? w.filter((x) => x !== u.id) : [...w, u.id]));
  };

  // on the card: pressed means every available unit of it is already on the
  // list — which is exactly what the gesture from outside means, "I want the
  // whole מארז". Un-hearting one photo inside then leaves the card unpressed
  // with the rest still on the list, and that is honest.
  const cardOn = (i: Item) => {
    const free = availableUnits(i);
    return free.length > 0 && free.every((u) => wishSet.has(u.id));
  };

  const toggleCard = (i: Item) => {
    const free = availableUnits(i).map((u) => u.id);
    if (!free.length) return;
    const on = cardOn(i);
    setWish((w) => (on
      ? w.filter((x) => !free.includes(x))
      : [...w, ...free.filter((x) => !w.includes(x))]));
  };

  // the × in the list panel drops the whole grouped row it sits on
  const dropCard = (i: Item) => {
    const ids = new Set(i.units.map((u) => u.id));
    setWish((w) => w.filter((x) => !ids.has(x)));
  };

  async function send() {
    const e: typeof err = {};
    if (!buyer.name.trim()) e.name = t.errName;
    if (!/^[\d\s+-]{7,}$/.test(buyer.phone.trim())) e.phone = t.errPhone;
    if (Object.keys(e).length) { setErr(e); return; }
    setErr({});
    setBusy(true);

    const ids = wishUnits.map(({ unit }) => unit.id);
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.rpc("reserve_units", {
      p_slug: sale.slug, p_unit_ids: ids, p_name: buyer.name.trim(), p_phone: buyer.phone.trim(),
    });
    setBusy(false);

    if (error || !data?.ok) { say(t.errSend); return; }

    const reserved: string[] = data.reserved ?? [];
    const unavailable: string[] = data.unavailable ?? [];
    const claimed = new Set([...reserved, ...unavailable]);

    // Everything the call touched is off the board for this buyer. `reserved`
    // is genuinely held for them; `unavailable` went to someone else, and the
    // reply does not say whether that was a hold or a sale — either way it is
    // no longer claimable, and the next load has the exact answer.
    setItems((prev) => prev.map((i) => ({
      ...i,
      units: i.units.map((u) => (claimed.has(u.id) ? { ...u, status: "reserved" as const } : u)),
    })));
    setWish([]);

    // Nothing held means nothing to send, and no number to send it to:
    // `seller_phone` comes back null unless something was actually reserved,
    // deliberately, so the (public) slug alone cannot be used to harvest it.
    if (reserved.length === 0) { setPanel(null); say(t.allTaken); return; }

    // one line per card, however many of its photos are on the list
    const held = new Map<string, { item: Item; n: number }>();
    items.forEach((i) => i.units.forEach((u) => {
      if (!reserved.includes(u.id)) return;
      const g = held.get(i.id) ?? { item: i, n: 0 };
      g.n += 1;
      held.set(i.id, g);
    }));
    const lines = [...held.values()]
      .map(({ item, n }) => `• ${item.title}${n > 1 ? ` ×${n}` : ""} — ${money(item.price * n)}`)
      .join("\n");
    const total = [...held.values()].reduce((s, g) => s + g.item.price * g.n, 0);
    const msg = `${lang === "he" ? "היי" : "Hi"} ${data.seller_name}!\n\n${lines}\n\n${t.total}: ${money(total)}\n\n${buyer.name.trim()} — ${buyer.phone.trim()}`;

    setSent({ msg, phone: data.seller_phone ?? null, dropped: unavailable.length });
    setPanel("sent");
  }

  const openWa = (phone: string, text: string) =>
    window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`, "_blank");

  /** נמכר once every unit is sold, מישהו ביקש while a hold is what's holding it */
  const bandFor = (i: Item) =>
    i.units.every((u) => u.status === "sold")
      ? (i.units.length > 1 ? t.allSold : t.soldBand)
      : t.taken;

  return (
    <>
      <button className="gs-fab" onClick={() => setPanel("wish")}
        aria-label={t.wishList + (wishUnits.length ? ` (${wishUnits.length})` : "")}>
        <Heart on={wishUnits.length > 0} />
        {wishUnits.length > 0 && <span className="gs-fab-count">{wishUnits.length}</span>}
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
              {/* sits with the tag chips because it filters the same grid, but
                  it is a toggle, not one of the choices */}
              <Chip on={onlyFree} onClick={() => setOnlyFree((v) => !v)}>{t.onlyAvailable}</Chip>
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
              <p className="gs-empty">
                {filter === "all" ? t.nothingFree : t.emptyFilter(TAG_LABEL[filter]?.[lang] ?? filter)}
              </p>
            ) : (
              <div className="gs-grid">
                {shown.map((it) => {
                  const cover = it.units[0];
                  const free = availableUnits(it).length;
                  const many = it.units.length > 1;
                  // greys only when every one of its units is gone: 17 of 20
                  // left is a live card, with the three greyed inside it
                  const gone = free === 0;
                  const on = cardOn(it);
                  return (
                    <article key={it.id} className={"gs-card" + (gone ? " taken" : "")}>
                      <button className="gs-photo" onClick={() => openCard(it)} aria-label={it.title}>
                        <img src={photoUrl(cover.thumb_path)} alt={it.title} loading="lazy" />
                        {gone && <span className="gs-band">{bandFor(it)}</span>}
                      </button>
                      <button className="gs-heart" onClick={() => toggleCard(it)}
                        disabled={gone} aria-pressed={on}
                        aria-label={many ? t.wantAll : t.addToList}>
                        <Heart on={on} />
                      </button>
                      <div className="gs-card-body">
                        <h3 className="gs-card-title">{it.title}</h3>
                        <div className="gs-card-row">
                          <span className="gs-price">
                            {money(it.price)}
                            {/* a single crib has nothing to be "per unit" of */}
                            {many && <span className="gs-detail-per"> {t.perUnit}</span>}
                          </span>
                          <span className="gs-tags">
                            {many && free > 0
                              ? t.unitsLeft(free)
                              : it.tags.map((x) => TAG_LABEL[x]?.[lang] ?? x).join(" · ")}
                          </span>
                        </div>
                        {showBundlePrice(it) && (
                          <p className="gs-card-bundle">{money(it.bundle_price!)} {t.forAll}</p>
                        )}
                      </div>
                    </article>
                  );
                })}
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

      {open && cur && (
        <Sheet title={open.title} onClose={() => setOpenId(null)}>
          {/* the heart here claims the unit this photo belongs to — so five
              angles of one crib share one heart, and each of twenty books has
              its own */}
          <div className={"gs-slide" + (cur.unit.status !== "available" ? " gone" : "")}>
            <div className="gs-detail-photo">
              <img src={photoUrl(cur.path)} alt={open.title} />
            </div>
            {cur.unit.status === "sold" && <span className="gs-band">{t.soldBand}</span>}
            {cur.unit.status === "reserved" && <span className="gs-band">{t.taken}</span>}
            {cur.unit.status === "available" && (
              <button className="gs-heart" onClick={() => toggleUnit(cur.unit)}
                aria-pressed={wishSet.has(cur.unit.id)} aria-label={t.addToList}>
                <Heart on={wishSet.has(cur.unit.id)} />
              </button>
            )}
          </div>

          {slides.length > 1 && (
            <div className="gs-pool gs-pool-sm">
              {slides.map((s, n) => (
                <button key={`${s.unit.id}-${s.path}`} type="button"
                  className={"gs-pick" + (n === at ? " cur" : "") + (s.unit.status !== "available" ? " gone" : "")}
                  onClick={() => setSlide(n)} aria-pressed={n === at}
                  aria-label={t.photoOf(n + 1, slides.length)}>
                  <img src={photoUrl(s.thumb)} alt="" loading="lazy" />
                  {s.unit.status === "sold" && <span className="gs-pick-tag">{t.soldBand}</span>}
                  {s.unit.status === "reserved" && <span className="gs-pick-tag">{t.taken}</span>}
                </button>
              ))}
            </div>
          )}

          <p className="gs-detail-price">
            {money(open.price)}
            {open.units.length > 1 && <span className="gs-detail-per"> {t.perUnit}</span>}
          </p>
          {open.units.length > 1 && (
            <p className="gs-detail-per">
              {t.unitsLeft(availableUnits(open).length)}
              {/* the bundle price goes quiet the moment one unit is gone —
                  "all of it for ₪100" stopped being true (showBundlePrice) */}
              {showBundlePrice(open) && ` · ${money(open.bundle_price!)} ${t.forAll}`}
            </p>
          )}
          <p className="gs-detail-desc">{open.description}</p>
          {open.measurements && (
            <p className="gs-detail-size"><b>{t.measurements}</b> · <span dir="ltr">{open.measurements}</span></p>
          )}
          <p className="gs-detail-tags">{open.tags.map((x) => TAG_LABEL[x]?.[lang] ?? x).join(" · ")}</p>

          {cur.unit.status !== "available" ? (
            <p className="gs-note">{cur.unit.status === "sold" ? t.soldNote : t.takenNote}</p>
          ) : (
            <button className={"gs-btn gs-btn-wide " + (wishSet.has(cur.unit.id) ? "gs-btn-cream" : "gs-btn-orange")}
              onClick={() => toggleUnit(cur.unit)}>
              {wishSet.has(cur.unit.id) ? t.onList : t.addToList}
            </button>
          )}
          {/* the same gesture as the heart on the card, reachable from inside.
              It says "the whole מארז" in both directions, so it cannot be read
              as another way to press the button just above it, which speaks
              only for the photo on screen. */}
          {open.units.length > 1 && availableUnits(open).length > 0 && (
            <button className="gs-btn-ghost" onClick={() => toggleCard(open)}>
              {cardOn(open) ? t.dropAll : t.wantAll}
            </button>
          )}
        </Sheet>
      )}

      {panel === "wish" && (
        <Sheet title={t.wishList} onClose={() => setPanel(null)}>
          {wishGroups.length === 0 ? <p className="gs-empty">{t.wishEmpty}</p> : (
            <>
              <ul className="gs-list">
                {wishGroups.map((g) => (
                  <li key={g.item.id} className="gs-list-row">
                    <img className="gs-mini" src={photoUrl(g.units[0].thumb_path)} alt="" />
                    <span className="gs-list-name">
                      {g.item.title}{g.units.length > 1 && ` ×${g.units.length}`}
                    </span>
                    <span className="gs-price">{money(g.item.price * g.units.length)}</span>
                    <button className="gs-x" onClick={() => dropCard(g.item)} aria-label={t.close}>×</button>
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
        // held shut while the reservation is in flight: sending twice would
        // hold the same units under two requests
        <Sheet title={t.whoAsks} busy={busy} onClose={() => setPanel("wish")}>
          <p className="gs-lead">{t.checkoutLead(wishUnits.length, sale.display_name)}</p>
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
          {sent.phone ? (
            <button className="gs-btn gs-btn-green gs-btn-wide" onClick={() => openWa(sent.phone!, sent.msg)}>
              {t.openWa(sale.display_name)}
            </button>
          ) : (
            // shouldn't happen — the number comes back whenever something was
            // reserved, and we only get here if something was — but the
            // message is theirs either way, so hand it over instead of
            // opening a chat with "null"
            <p className="gs-note">{t.noPhone}</p>
          )}
          <p className="gs-fine">{t.sentFine}</p>
          <button className="gs-btn-ghost" onClick={() => setPanel(null)}>{t.backToSale}</button>
        </Sheet>
      )}

      {toast && <Toast text={toast} />}
    </>
  );
}
