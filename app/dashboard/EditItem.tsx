"use client";

import React, { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { STR } from "@/lib/i18n";
import { type Item } from "@/lib/types";
import { Sheet, Field, TagPicker } from "@/components/ui";

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
export default function EditItem({ item, onClose, onSaved, knownTags }: {
  item: Item;
  onClose: () => void;
  onSaved: (item: Item) => void;
  /** the built-in tags plus every one her board already uses */
  knownTags: string[];
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
    size: item.measurements ?? "",
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

  async function submit() {
    if (busy) return;

    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = t.errTitle;
    if (!free && (!f.price || Number(f.price) <= 0)) e.price = t.errPrice;

    if (isFurniture && !f.size.trim()) e.size = t.errSize;
    if (Object.keys(e).length) { setErr(e); return; }

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
      measurements: isFurniture ? f.size.trim() : null,
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
          <ol className="gs-choices">
            <li>
              <label className={"gs-choice" + (!many ? " on" : "") + (claimed ? " locked" : "")}>
                <input type="radio" name="gs-kind" checked={!many}
                  disabled={busy || claimed} onChange={() => setMany(false)} />
                <span>{t.oneThing}</span>
              </label>
            </li>
            <li>
              <label className={"gs-choice" + (many ? " on" : "") + (claimed ? " locked" : "")}>
                <input type="radio" name="gs-kind" checked={many}
                  disabled={busy || claimed} onChange={() => setMany(true)} />
                <span>{t.manyThings(photoCount)}</span>
              </label>
            </li>
          </ol>
          {claimed && <p className="gs-hint gs-hint-lock">{t.kindLocked}</p>}
        </>
      )}

      <Field label={t.whatIsIt} value={f.title} onChange={(v) => set("title", v)}
        err={err.title} placeholder={multi ? t.whatPhMany : t.whatPhOne} />
      <label className={"gs-choice gs-choice-free" + (free ? " on" : "")}>
        <input type="checkbox" checked={free} disabled={busy}
          onChange={(e) => setFree(e.target.checked)} />
        <span>{t.freeToggle}</span>
      </label>

      {!free && (
        <>
          <Field label={t.price} value={f.price}
            onChange={(v) => set("price", v.replace(/\D/g, ""))}
            err={err.price} ltr numeric />
          {many && (
            <div className="gs-field">
              <span className="gs-label">{t.priceForLabel}</span>
              <div className="gs-seg" role="radiogroup" aria-label={t.priceForLabel}>
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
              <span className="gs-hint">{t.priceForHint}</span>
            </div>
          )}
        </>
      )}


      <Field label={t.description} value={f.desc} onChange={(v) => set("desc", v)}
        err={err.desc} placeholder={t.descPh} area />

      <TagPicker known={knownTags} chosen={f.tags} onChange={(tags) => set("tags", tags)} />

      {isFurniture && (
        <Field label={t.measurements} value={f.size} onChange={(v) => set("size", v)}
          err={err.size} placeholder={t.sizePh} hint={t.sizeHint} ltr />
      )}

      {said && <p className="gs-hint">{t.serverSaid} <span dir="ltr">{said}</span></p>}

      <button className="gs-btn gs-btn-orange gs-btn-wide" onClick={submit} disabled={busy}>
        {busy ? t.saving : t.saveChanges}
      </button>
    </Sheet>
  );
}
