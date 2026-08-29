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
  // units a reserve_units reply took back from this buyer without saying why —
  // see `standing` below
  const [claimed, setClaimed] = useState<Set<string>>(new Set());

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

  /**
   * What this page can honestly say about one unit right now.
   *
   * `sold` and `held` are the server's own words. `gone` is not: it is a unit
   * `reserve_units` handed back as unavailable, which says it is no longer
   * claimable and deliberately does not say whether it was sold or held. The
   * page repeats exactly that much — greyed, not hearteable, worded so it
   * asserts neither — rather than inventing a status nobody reported. The next
   * load carries the real one.
   */
  const standing = (u: Unit) =>
    u.status === "sold" ? "sold" as const
      : u.status === "reserved" ? "held" as const
        : claimed.has(u.id) ? "gone" as const : "free" as const;

  /** what is still there to claim: available per the server, and not taken since */
  const freeUnits = (i: Item) => availableUnits(i).filter((u) => !claimed.has(u.id));

  // Every count is over *free units* — the things still there to claim.
  // A category whose units have all gone loses its chip rather than offering a
  // number that leads to nothing claimable; its cards are still in "הכל".
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    items.forEach((i) => {
      const free = availableUnits(i).filter((u) => !claimed.has(u.id)).length;
      c.all += free;
      i.tags.forEach((tag) => { c[tag] = (c[tag] ?? 0) + free; });
    });
    return c;
  }, [items, claimed]);

  // A send can empty the category the buyer is standing in. Its chip goes with
  // it, and a filter whose chip is gone leaves the grid narrowed with nothing
  // pressed and no way back — so step out of it.
  useEffect(() => {
    if (filter !== "all" && !(counts[filter] > 0)) setFilter("all");
  }, [counts, filter]);

  const shown = useMemo(() => {
    const list = items.filter((i) =>
      (filter === "all" || i.tags.includes(filter)) &&
      (!onlyFree || availableUnits(i).some((u) => !claimed.has(u.id))));
    if (sort === "low") return [...list].sort((a, b) => a.price - b.price);
    if (sort === "high") return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [items, filter, onlyFree, sort, claimed]);

  // The list, resolved against what is still claimable: stale ids from an old
  // visit and units someone else took both drop out on their own.
  const wishUnits = useMemo(
    () => items.flatMap((i) => i.units
      .filter((u) => wishSet.has(u.id) && u.status === "available" && !claimed.has(u.id))
      .map((u) => ({ unit: u, item: i }))),
    [items, wishSet, claimed]
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

  /**
   * The photo the grid shows for a card: the first one still up for grabs.
   * Falling back to `units[0]` only once nothing is free, where the card is
   * greyed and banded and so reads honestly anyway. Showing a claimed photo on
   * a live card would offer a buyer one book and hand them another.
   */
  const coverOf = (i: Item) => freeUnits(i)[0] ?? i.units[0];

  // opens on the photo the card was showing, not blindly on the first slide,
  // for the same reason
  const openCard = (i: Item) => {
    const cover = coverOf(i);
    setOpenId(i.id);
    setSlide(Math.max(slidesOf(i).findIndex((s) => s.unit.id === cover.id), 0));
  };

  /* ---- the two levels of hearting, both writing the same list ---- */

  // inside the sheet: this photo's unit alone
  const toggleUnit = (u: Unit) => {
    if (standing(u) !== "free") return;
    setWish((w) => (w.includes(u.id) ? w.filter((x) => x !== u.id) : [...w, u.id]));
  };

  // on the card: pressed means every free unit of it is already on the list —
  // which is exactly what the gesture from outside means, "I want the whole
  // מארז". Un-hearting one photo inside then leaves the card unpressed with
  // the rest still on the list, and that is honest.
  const cardOn = (i: Item) => {
    const free = freeUnits(i);
    return free.length > 0 && free.every((u) => wishSet.has(u.id));
  };

  const toggleCard = (i: Item) => {
    const free = freeUnits(i).map((u) => u.id);
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

    // Two different things, kept apart. A `reserved` unit is now genuinely held
    // for this buyer, and the server said so — that is a status, so it goes on
    // the unit. An `unavailable` one went to someone else and the reply does
    // not say whether it was held or sold, so it goes into `claimed` instead
    // and the page says only what it knows: no longer yours. Writing
    // "reserved" onto it would have put "מישהו ביקש" under a photo that was
    // actually sold.
    setItems((prev) => prev.map((i) => ({
      ...i,
      units: i.units.map((u) => (reserved.includes(u.id) ? { ...u, status: "reserved" as const } : u)),
    })));
    setClaimed((prev) => new Set([...prev, ...unavailable]));
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

  /**
   * "all of it for ₪100" stops being true the moment one unit goes, which
   * `showBundlePrice` already handles for sold and held ones — this closes it
   * for a unit taken out from under the buyer mid-visit, whose status here is
   * still the stale "available".
   */
  const bundleOn = (i: Item) => showBundlePrice(i) && freeUnits(i).length === i.units.length;

  /** what a claimed unit says on its band — the server's word where there is one */
  const unitBand = (u: Unit) =>
    standing(u) === "sold" ? t.soldBand : standing(u) === "held" ? t.taken : t.claimedBand;

  /**
   * The band on a card with nothing left. נמכר only when every unit really
   * sold, מישהו ביקש only when every one is held; a card that mixes the two —
   * or holds a unit we only know is gone — gets נתפס, which is true of all of
   * them and claims none.
   */
  const bandFor = (i: Item) => {
    const how = i.units.map(standing);
    if (how.every((s) => s === "sold")) return i.units.length > 1 ? t.allSold : t.soldBand;
    if (how.every((s) => s === "held")) return t.taken;
    return i.units.length > 1 ? t.allGone : t.claimedBand;
  };

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
                  const cover = coverOf(it);
                  const free = freeUnits(it).length;
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
                      {/* the label follows the press, so nothing announces
                          "add" on a control that is about to remove */}
                      <button className="gs-heart" onClick={() => toggleCard(it)}
                        disabled={gone} aria-pressed={on}
                        aria-label={on
                          ? (many ? t.dropAll : t.onList)
                          : (many ? t.wantAll : t.addToList)}>
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
                        {bundleOn(it) && (
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
          <div className={"gs-slide" + (standing(cur.unit) !== "free" ? " gone" : "")}>
            <div className="gs-detail-photo">
              <img src={photoUrl(cur.path)} alt={open.title} />
            </div>
            {standing(cur.unit) === "free" ? (
              <button className="gs-heart" onClick={() => toggleUnit(cur.unit)}
                aria-pressed={wishSet.has(cur.unit.id)}
                aria-label={wishSet.has(cur.unit.id) ? t.onList : t.addToList}>
                <Heart on={wishSet.has(cur.unit.id)} />
              </button>
            ) : (
              <span className="gs-band">{unitBand(cur.unit)}</span>
            )}
          </div>

          {slides.length > 1 && (
            <div className="gs-pool gs-pool-sm">
              {slides.map((s, n) => (
                <button key={`${s.unit.id}-${s.path}`} type="button"
                  className={"gs-pick" + (n === at ? " cur" : "") + (standing(s.unit) !== "free" ? " gone" : "")}
                  onClick={() => setSlide(n)} aria-pressed={n === at}
                  aria-label={t.photoOf(n + 1, slides.length)}>
                  <img src={photoUrl(s.thumb)} alt="" loading="lazy" />
                  {standing(s.unit) !== "free" && <span className="gs-pick-tag">{unitBand(s.unit)}</span>}
                </button>
              ))}
            </div>
          )}

          <p className="gs-detail-price">
            {money(open.price)}
            {open.units.length > 1 && <span className="gs-detail-per"> {t.perUnit}</span>}
          </p>
          {/* "נשארו 0" is not a thing anyone says — a מארז with nothing left
              says so instead, the same guard the card uses */}
          {open.units.length > 1 && (
            <p className="gs-detail-per">
              {freeUnits(open).length > 0 ? t.unitsLeft(freeUnits(open).length) : bandFor(open)}
              {bundleOn(open) && ` · ${money(open.bundle_price!)} ${t.forAll}`}
            </p>
          )}
          <p className="gs-detail-desc">{open.description}</p>
          {open.measurements && (
            <p className="gs-detail-size"><b>{t.measurements}</b> · <span dir="ltr">{open.measurements}</span></p>
          )}
          <p className="gs-detail-tags">{open.tags.map((x) => TAG_LABEL[x]?.[lang] ?? x).join(" · ")}</p>

          {standing(cur.unit) !== "free" ? (
            <p className="gs-note">
              {standing(cur.unit) === "sold" ? t.soldNote
                : standing(cur.unit) === "held" ? t.takenNote : t.goneNote}
            </p>
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
          {open.units.length > 1 && freeUnits(open).length > 0 && (
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
