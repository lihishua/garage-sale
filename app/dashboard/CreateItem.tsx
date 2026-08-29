"use client";

import React, { useState } from "react";
import { supabaseBrowser, photoUrl } from "@/lib/supabase-browser";
import { STR, TAG_LABEL } from "@/lib/i18n";
import { TAGS, type Item, type StagedPhoto, type Unit } from "@/lib/types";
import { Sheet, Field, Chip } from "@/components/ui";

/**
 * Turn the photos she picked in the pool into a listing.
 *
 * The whole task turns on one question the app cannot answer for her. Six
 * photos are either six things or six views of one, and nothing in the pixels
 * says which:
 *
 *   a crib from 5 angles      -> 1 claimable thing, 5 photos
 *   a table and 4 chairs, set -> 1 claimable thing, however many photos
 *   20 books                  -> 20 claimable things, 20 photos
 *
 * The first two are the same shape to this app. So when more than one photo is
 * picked we ask, in her own words, and default to "one thing" — the answer
 * that is right for every crib, every set, and wrong only for a genuine lot,
 * which she will notice because she counted the books herself.
 *
 * A bundle price belongs only to the lot. "₪100 for all" is meaningless for a
 * single crib, and offering it there is what made the earlier design confusing.
 */
export default function CreateItem({ photos, onClose, onCreated }: {
  photos: StagedPhoto[];
  onClose: () => void;
  /**
   * @param item          the listing, with the units it actually got
   * @param listedPhotoIds staged photos now genuinely part of a listing, and
   *                       therefore never to be offered for picking again
   * @param poolCleared    whether their `staged_photos` rows were really
   *                       deleted. False means they are still in the pool: the
   *                       board must keep showing them, because that is what
   *                       the database holds, while refusing to re-list them.
   */
  onCreated: (item: Item, listedPhotoIds: string[], poolCleared: boolean) => void;
}) {
  const t = STR.he;
  const supabase = supabaseBrowser();

  const [f, setF] = useState({ title: "", price: "", desc: "", size: "", bundle: "", tags: [] as string[] });
  const [mode, setMode] = useState<"one" | "many">("one");
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");        // whatever the server last complained about
  const [notes, setNotes] = useState<string[]>([]);  // what the save left behind
  const [done, setDone] = useState(false);     // the item exists; never create a second one

  const multi = photos.length > 1;
  const many = multi && mode === "many";       // "one" is the only option when there is one photo
  const isFurniture = f.tags.includes("furniture");

  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const toggleTag = (x: string) =>
    set("tags", f.tags.includes(x) ? f.tags.filter((y) => y !== x) : [...f.tags, x]);

  async function submit() {
    // guards the whole run, and set before the first await: getUser() is a
    // round trip on a phone, and a second tap in that window would create the
    // listing twice
    if (busy || done) return;

    if (!photos.length) { setErr({ title: t.errPhoto }); return; }

    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = t.errTitle;
    if (!f.price || Number(f.price) <= 0) e.price = t.errPrice;
    if (!f.desc.trim()) e.desc = t.errDesc;
    if (isFurniture && !f.size.trim()) e.size = t.errSize;
    if (Object.keys(e).length) { setErr(e); return; }

    setErr({}); setSaid(""); setNotes([]); setBusy(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); setErr({ title: t.errCreate }); return; }

    // ---- 1. the card -------------------------------------------------------
    const { data: item, error: itemErr } = await supabase.from("items").insert({
      seller_id: user.id,
      title: f.title.trim(),
      description: f.desc.trim(),
      price: Math.round(Number(f.price)),
      // only a lot has an all-for price, and `check (bundle_price > 0)` rejects
      // 0, so an empty or zeroed field must become null rather than a number
      bundle_price: many && Number(f.bundle) > 0 ? Math.round(Number(f.bundle)) : null,
      tags: f.tags,
      measurements: isFurniture ? f.size.trim() : null,
    }).select("id, seller_id, title, description, price, bundle_price, tags, measurements, created_at").single();

    if (itemErr || !item) {
      // nothing was written; the photos are untouched and still in the pool
      setBusy(false); setSaid(itemErr?.message ?? "insert failed"); setErr({ title: t.errCreate });
      return;
    }

    // ---- 2. the claimable things -------------------------------------------
    // One row per thing someone can buy. That is the entire difference between
    // the two answers: a crib is one row whatever its angles, twenty books are
    // twenty rows. `position` follows her pick order, so 0 is the cover.
    const unitRows = many
      ? photos.map((p, i) => ({ item_id: item.id, photo_path: p.photo_path, thumb_path: p.thumb_path, position: i }))
      : [{ item_id: item.id, photo_path: photos[0].photo_path, thumb_path: photos[0].thumb_path, position: 0 }];

    const { data: rows, error: unitErr } = await supabase.from("item_units")
      .insert(unitRows).select("id, item_id, photo_path, thumb_path, position, status");

    if (unitErr || !rows?.length) {
      // A card with no units is unreachable to a buyer and all but invisible to
      // her, so it must not survive. Undo it.
      const { error: undoErr } = await supabase.from("items").delete().eq("id", item.id);
      setBusy(false);
      setSaid(unitErr?.message ?? "insert failed");

      if (!undoErr) { setErr({ title: t.errCreate }); return; }

      // Even the undo failed, so a hollow card really is on the board and she
      // is told to delete it. Hand it to the board so it is actually there to
      // delete — telling her to remove something that only appears after a
      // reload is an instruction she cannot follow. The board deliberately
      // keeps unit-less cards listed for exactly this. No photo was consumed.
      onCreated({ ...item, units: [] } as Item, [], false);
      setErr({ title: t.itemLeftEmpty });
      setDone(true);
      return;
    }

    // a returning insert carries no order guarantee, and position 0 being the
    // cover is what the rest of this function and the board both rely on
    const units = [...(rows as Unit[])].sort((a, b) => a.position - b.position);

    // ---- 3. the extra views ------------------------------------------------
    // Only "one thing" has any: the rest of the photos are further pictures of
    // the single unit. A lot's photos are already units and own nothing.
    const extras = many ? [] : photos.slice(1);
    let extrasOk = true;

    if (extras.length) {
      const cover = units[0];
      const { error: photoErr } = await supabase.from("unit_photos").insert(
        // position continues the pick order: the unit's own photo is 0
        extras.map((p, i) => ({
          unit_id: cover.id, photo_path: p.photo_path, thumb_path: p.thumb_path, position: i + 1,
        }))
      );
      if (photoErr) {
        // Proceed, do not unwind. The listing is complete and sellable; it
        // just shows one photo instead of five. Tearing down a good listing
        // over a missing camera angle trades something recoverable for
        // something that is not.
        //
        // "Recoverable" is doing honest work here: there is no edit form yet
        // (Task 7), so today the repair is to delete the listing and build it
        // again from the pool. That is why the unattached photos are left in
        // the pool rather than consumed — they are the material for the retry.
        extrasOk = false;
        setSaid(photoErr.message);
        setNotes((n) => [...n, t.photosNotAttached(extras.length)]);
      }
    }

    // ---- 4. clear the pool -------------------------------------------------
    // Only the photos that genuinely landed in the listing. Anything that did
    // not stays in the pool, which is both the retry path and the honest
    // record of what happened.
    const consumed = extrasOk ? photos.map((p) => p.id) : [photos[0].id];
    const { error: poolErr } = await supabase.from("staged_photos").delete().in("id", consumed);

    setBusy(false);

    if (poolErr) {
      // The listing is right; the pool row deletion is what failed. Those
      // photos really are still in `staged_photos`, so the board keeps showing
      // them — but they are already in a listing, and picking them again would
      // build a duplicate from photos that are already spoken for. Report them
      // as listed with poolCleared false: shown, marked, and unpickable.
      setSaid(poolErr.message);
      setNotes((n) => [...n, t.poolNotCleared]);
      onCreated({ ...item, units } as Item, consumed, false);
      setDone(true);
      return;
    }

    onCreated({ ...item, units } as Item, consumed, true);

    // A clean run closes itself. Anything less stays open holding the note,
    // because a toast that fades is no place to learn a photo went missing.
    if (extrasOk) onClose(); else setDone(true);
  }

  return (
    <Sheet title={t.createItem} onClose={onClose} busy={busy}>
      {/* which photo leads the listing is not guessable from a grid, and it is
          the one thing about this strip she needs to know */}
      <div className="gs-pool gs-pool-sm">
        {photos.map((p, i) => (
          <div key={p.id} className="gs-pick">
            <img src={photoUrl(p.thumb_path)} alt="" loading="lazy" />
            {i === 0 && <span className="gs-pick-tag">{t.cover}</span>}
          </div>
        ))}
      </div>

      {/* The question. Only worth asking when there is more than one photo —
          a single photo is one thing by definition. */}
      {multi && (
        <>
          <span className="gs-label">{t.oneOrMany(photos.length)}</span>
          {/* an <ol> so the browser places "1." / "2." on the correct side in
              RTL; a literal "1." before Hebrew text lands on the wrong end */}
          <ol className="gs-choices">
            <li>
              <label className={"gs-choice" + (mode === "one" ? " on" : "")}>
                <input type="radio" name="gs-kind" checked={mode === "one"}
                  disabled={busy || done} onChange={() => setMode("one")} />
                <span>{t.oneThing}</span>
              </label>
            </li>
            <li>
              <label className={"gs-choice" + (mode === "many" ? " on" : "")}>
                <input type="radio" name="gs-kind" checked={mode === "many"}
                  disabled={busy || done} onChange={() => setMode("many")} />
                <span>{t.manyThings(photos.length)}</span>
              </label>
            </li>
          </ol>
        </>
      )}

      {/* the example, and the price label, follow the choice made above */}
      <Field label={t.whatIsIt} value={f.title} onChange={(v) => set("title", v)}
        err={err.title} placeholder={many ? t.whatPhMany : t.whatPhOne} />
      <Field label={many ? t.pricePerUnit : t.price} value={f.price}
        onChange={(v) => set("price", v.replace(/\D/g, ""))}
        err={err.price} hint={many ? t.pricePerUnitHint : undefined} ltr />

      {/* only a lot can be sold all at once. For one crib, `price` is the price. */}
      {many && (
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

      {notes.map((n) => <span key={n} className="gs-err">{n}</span>)}
      {said && <p className="gs-hint">{t.serverSaid} <span dir="ltr">{said}</span></p>}

      {done ? (
        <button className="gs-btn gs-btn-cream gs-btn-wide" onClick={onClose}>{t.close}</button>
      ) : (
        <button className="gs-btn gs-btn-orange gs-btn-wide" onClick={submit} disabled={busy}>
          {busy ? t.uploading : t.postIt}
        </button>
      )}
    </Sheet>
  );
}
