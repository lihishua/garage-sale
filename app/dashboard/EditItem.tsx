"use client";

import React, { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { STR, TAG_LABEL } from "@/lib/i18n";
import { TAGS, type Item } from "@/lib/types";
import { Sheet, Field, Chip } from "@/components/ui";

/**
 * Change what a listing says, without touching its photos.
 *
 * Units carry `status` and are referenced by `request_items`, so adding or
 * removing one here could orphan a buyer's request — that stays out of
 * scope, on purpose, for good. Only the words and prices around the fixed
 * set of units are editable: title, description, price, bundle price, tags,
 * measurements.
 *
 * A bundle price belongs only to a lot (see CreateItem) — a single crib
 * never gets one, whatever she types, because the field isn't even shown.
 */
export default function EditItem({ item, onClose, onSaved }: {
  item: Item;
  onClose: () => void;
  onSaved: (item: Item) => void;
}) {
  const t = STR.he;
  const supabase = supabaseBrowser();

  // fixed for the life of this form: units are not editable here, so whether
  // a bundle price even makes sense cannot change mid-edit
  const multi = item.units.length > 1;

  const [f, setF] = useState({
    title: item.title,
    desc: item.description,
    price: String(item.price),
    bundle: item.bundle_price != null ? String(item.bundle_price) : "",
    size: item.measurements ?? "",
    tags: item.tags,
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");  // whatever the server last complained about

  const isFurniture = f.tags.includes("furniture");

  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const toggleTag = (x: string) =>
    set("tags", f.tags.includes(x) ? f.tags.filter((y) => y !== x) : [...f.tags, x]);

  async function submit() {
    if (busy) return;

    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = t.errTitle;
    if (!f.price || Number(f.price) <= 0) e.price = t.errPrice;
    if (!f.desc.trim()) e.desc = t.errDesc;
    if (isFurniture && !f.size.trim()) e.size = t.errSize;
    if (Object.keys(e).length) { setErr(e); return; }

    setErr({}); setSaid(""); setBusy(true);

    // an empty or zeroed field means "no bundle price" — `check (bundle_price
    // > 0)` rejects a literal 0, so it has to become null rather than a number
    const bundlePrice = multi && Number(f.bundle) > 0 ? Math.round(Number(f.bundle)) : null;

    const { data: updated, error } = await supabase.from("items").update({
      title: f.title.trim(),
      description: f.desc.trim(),
      price: Math.round(Number(f.price)),
      bundle_price: bundlePrice,
      tags: f.tags,
      measurements: isFurniture ? f.size.trim() : null,
    }).eq("id", item.id)
      .select("id, seller_id, title, description, price, bundle_price, tags, measurements, created_at")
      .single();

    setBusy(false);

    if (error || !updated) {
      // nothing she typed is lost — the form stays open with her input intact
      setSaid(error?.message ?? "update failed");
      setErr({ title: t.errUpdate });
      return;
    }

    // units and their photos are untouched by this form; carry them over from
    // what the board already has rather than re-fetching them
    onSaved({ ...updated, units: item.units } as Item);
    onClose();
  }

  return (
    <Sheet title={t.editItem} onClose={onClose} busy={busy}>
      {/* a listing with several units prices per item; a single one just has a price */}
      <Field label={t.whatIsIt} value={f.title} onChange={(v) => set("title", v)}
        err={err.title} placeholder={multi ? t.whatPhMany : t.whatPhOne} />
      <Field label={multi ? t.pricePerUnit : t.price} value={f.price}
        onChange={(v) => set("price", v.replace(/\D/g, ""))}
        err={err.price} hint={multi ? t.pricePerUnitHint : undefined} ltr />

      {/* only a lot can be sold all at once — for one crib, `price` is the price */}
      {multi && (
        <Field label={t.bundlePrice} value={f.bundle} onChange={(v) => set("bundle", v.replace(/\D/g, ""))}
          hint={t.bundlePriceHint} ltr />
      )}

      <Field label={t.description} value={f.desc} onChange={(v) => set("desc", v)}
        err={err.desc} placeholder={t.descPh} area />

      <span className="gs-label">{t.tagsLabel}</span>
      <div className="gs-filters gs-filters-tight">
        {TAGS.map((x) => (
          <Chip key={x} on={f.tags.includes(x)} onClick={() => toggleTag(x)}>{TAG_LABEL[x].he}</Chip>
        ))}
      </div>

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
