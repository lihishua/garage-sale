"use client";

import React, { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { STR } from "@/lib/i18n";
import { type Item } from "@/lib/types";
import { Sheet, TagPicker, SizeFields } from "@/components/ui";
import { formatSize, parseSize, sizeFilled, type Size } from "@/lib/size";

/**
 * Change what a listing says — and, while nobody has claimed any of it,
 * what kind of listing it is.
 *
 * Units carry `status` and are referenced by `request_items`, so this form
 * never adds or removes one itself. The one thing that does reshape them is
 * the kind switch, and that goes through `reshape_item`, which rebuilds the
 * units from the same photos in one transaction and refuses outright if any
 * unit is reserved or sold. Everything else here is the words and prices
 * around a fixed set of units: title, description, price, bundle price,
 * tags, measurements.
 *
 * A bundle price belongs only to a lot (see CreateItem) — a single crib
 * never gets one, whatever she types, because the field isn't even shown.
 */
export default function EditItem({ item, onClose, onSaved, knownTags, onTagMade, onTagDropped }: {
  item: Item;
  onClose: () => void;
  onSaved: (item: Item) => void;
  /** the built-in tags plus every one her board already uses */
  knownTags: string[];
  onTagMade: (tag: string) => void;
  onTagDropped: (tag: string) => void;
}) {
  const t = STR.he;
  const supabase = supabaseBrowser();

  /**
   * Every photo the listing owns, whichever shape it is in: a set is one unit
   * with the rest as its extra views, a lot is one unit per photo. The count
   * is what decides whether the kind question is even worth asking, and it is
   * what the question quotes.
   */
  const photoCount = item.units.reduce((n, u) => n + 1 + (u.photos?.length ?? 0), 0);
  // what it is now, and what she wants it to be. `many` drives the form —
  // a lot prices per unit and can carry an all-for price, a set cannot.
  const wasMany = item.units.length > 1;
  const [many, setMany] = useState(wasMany);
  const multi = many;
  // no unit may be claimed for the kind to change; the server checks this
  // too, but the form can say so up front instead of after a failed save
  const claimed = item.units.some((u) => u.status !== "available");

  const [f, setF] = useState({
    title: item.title,
    desc: item.description,
    price: item.price > 0 ? String(item.price) : "",
    size: parseSize(item.measurements) as Size,
    tags: item.tags,
  });
  // seeded from the item itself: price 0 is what למסירה means
  const [free, setFree] = useState(item.price === 0);
  const [priceFor, setPriceFor] = useState<"each" | "all">(item.price_for ?? "each");
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");  // whatever the server last complained about

  const isFurniture = f.tags.includes("furniture");

  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const [askSize, setAskSize] = useState(false);
  const sizeRef = useRef<HTMLInputElement>(null);

  /** `sure` is her answer to the measurements question, when it was asked */
  async function submit(sure = false) {
    if (busy) return;

    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = t.errTitle;
    if (!free && (!f.price || Number(f.price) <= 0)) e.price = t.errPrice;

    if (isFurniture && sizeFilled(f.size) === 0) e.size = t.errSize;
    if (Object.keys(e).length) { setErr(e); return; }
    if (isFurniture && sizeFilled(f.size) < 3 && !sure) { setErr({}); setAskSize(true); return; }

    setErr({}); setSaid(""); setBusy(true);

    // The shape first, on its own, so a refusal leaves the listing exactly as
    // it was. If it succeeds the units are rebuilt server-side, and the board
    // needs the real rows back rather than the ones it is holding.
    let units = item.units;
    if (many !== wasMany) {
      const { data: r, error: rErr } = await supabase.rpc("reshape_item", {
        p_item_id: item.id, p_many: many,
      });
      if (rErr || !r?.ok) {
        setBusy(false);
        setSaid(rErr?.message ?? String(r?.error ?? "reshape failed"));
        setErr({ title: r?.error === "in_use" ? t.kindLocked : t.errUpdate });
        return;
      }
      const { data: fresh } = await supabase.from("item_units")
        .select("id, item_id, photo_path, thumb_path, position, status, photos:unit_photos(id, unit_id, photo_path, thumb_path, position)")
        .eq("item_id", item.id).order("position");
      units = (fresh ?? []) as typeof item.units;
    }


    const { data: updated, error } = await supabase.from("items").update({
      title: f.title.trim(),
      description: f.desc.trim(),
      price: free ? 0 : Math.round(Number(f.price)),
      price_for: many ? priceFor : "each",
      // retired; cleared so an old lot's leftover number cannot resurface
      bundle_price: null,
      tags: f.tags,
      measurements: isFurniture ? formatSize(f.size) : null,
    }).eq("id", item.id)
      .select("id, seller_id, title, description, price, price_for, bundle_price, tags, measurements, created_at")
      .single();

    setBusy(false);

    if (error || !updated) {
      // nothing she typed is lost — the form stays open with her input intact
      setSaid(error?.message ?? "update failed");
      setErr({ title: t.errUpdate });
      return;
    }

    // the board's copy of the units is right unless the kind changed, in which
    // case `units` is what the server just rebuilt
    onSaved({ ...updated, units } as Item);
    onClose();
  }

  return (
    <Sheet title={t.editItem} onClose={onClose} busy={busy}>
      {/* a listing with several units prices per item; a single one just has a price */}
      {/* The same question CreateItem asks, asked again — only for a listing
          with more than one photo, since one photo is one thing either way,
          and only while nobody holds a unit, since reshaping a claimed unit
          would either orphan the request or hand the buyer something else. */}
      {photoCount > 1 && (
        <>
          <span className="gs-label">{t.oneOrMany(photoCount)}</span>
          <div className="gs-choices" role="radiogroup" aria-label={t.oneOrMany(photoCount)}>
            <button type="button" role="radio" aria-checked={!many}
              className={"gs-choice" + (!many ? " on" : "") + (claimed ? " locked" : "")}
              disabled={busy || claimed} onClick={() => setMany(false)}>
              {t.oneThing}
            </button>
            <button type="button" role="radio" aria-checked={many}
              className={"gs-choice" + (many ? " on" : "") + (claimed ? " locked" : "")}
              disabled={busy || claimed} onClick={() => setMany(true)}>
              {t.manyThings(photoCount)}
            </button>
          </div>
          {claimed && <p className="gs-hint gs-hint-lock">{t.kindLocked}</p>}
        </>
      )}

      {/* One row: the name, then the price-or-free pill — the boxes say what
          goes in them, so no labels over them; the sheet has to fit a phone
          screen without scrolling when there is one photo. */}
      <div className="gs-namerow">
        <input className={"gs-input" + (err.title ? " bad" : "")} value={f.title}
          placeholder={t.whatIsIt} aria-label={t.whatIsIt} disabled={busy}
          onChange={(e) => set("title", e.target.value)} />
        {/* price or free: two halves of one pill, the picked one in yellow.
            Typing a number is picking the price, so it un-picks "free" by
            itself; picking "free" empties the number. */}
        <div className={"gs-priceor" + (free ? " free" : "") + (err.price ? " bad" : "")}>
          <label className="gs-priceor-price">
            <span className="gs-priceor-cur" aria-hidden="true">₪</span>
            <input value={free ? "" : f.price} placeholder={t.price} aria-label={t.price}
              inputMode="numeric" pattern="[0-9]*" disabled={busy}
              onFocus={() => setFree(false)}
              onChange={(e) => { setFree(false); set("price", e.target.value.replace(/\D/g, "")); }} />
          </label>
          <button type="button" className="gs-priceor-free" aria-pressed={free}
            disabled={busy} onClick={() => { set("price", ""); setFree(true); }}>
            {t.freeToggle}
          </button>
        </div>
      </div>
      {err.title && <span className="gs-err gs-err-row">{err.title}</span>}
      {err.price && <span className="gs-err gs-err-row">{err.price}</span>}

      {/* a lot's one number, and what it covers: each photo, or the pile.
          A small switch under the price, no label — the two options are
          the whole explanation. The final number is settled on WhatsApp. */}
      {many && !free && (
        <div className="gs-seg gs-seg-sm" role="radiogroup" aria-label={t.priceForLabel}>
          <label className={"gs-seg-opt" + (priceFor === "each" ? " on" : "")}>
            <input type="radio" name="gs-pricefor" checked={priceFor === "each"}
              disabled={busy} onChange={() => setPriceFor("each")} />
            {t.priceForEach}
          </label>
          <label className={"gs-seg-opt" + (priceFor === "all" ? " on" : "")}>
            <input type="radio" name="gs-pricefor" checked={priceFor === "all"}
              disabled={busy} onChange={() => setPriceFor("all")} />
            {t.priceForAll}
          </label>
        </div>
      )}

      <textarea className={"gs-input gs-desc" + (err.desc ? " bad" : "")} rows={2} value={f.desc}
        placeholder={t.description} aria-label={t.description} disabled={busy}
        onChange={(e) => set("desc", e.target.value)} />
      {err.desc && <span className="gs-err gs-err-row">{err.desc}</span>}

      <TagPicker known={knownTags} chosen={f.tags} onChange={(tags) => set("tags", tags)}
        onMade={onTagMade} onDropped={onTagDropped} />

      {isFurniture && (
        <SizeFields value={f.size} err={err.size} firstRef={sizeRef}
          onChange={(v) => { set("size", v); setAskSize(false); }} />
      )}

      {said && <p className="gs-hint">{t.serverSaid} <span dir="ltr">{said}</span></p>}

      {askSize ? (
        <div className="gs-ask">
          <p>{t.sizeAsk}</p>
          <div className="gs-ask-btns">
            <button className="gs-btn gs-btn-orange" onClick={() => { setAskSize(false); submit(true); }}>{t.sizeAskYes}</button>
            <button className="gs-btn" onClick={() => { setAskSize(false); sizeRef.current?.focus(); }}>{t.sizeAskNo}</button>
          </div>
        </div>
      ) : (
        <button className="gs-btn gs-btn-orange gs-btn-wide" onClick={() => submit()} disabled={busy}>
          {busy ? t.saving : t.saveChanges}
        </button>
      )}
    </Sheet>
  );
}
