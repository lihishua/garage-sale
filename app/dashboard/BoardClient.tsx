"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser, photoUrl } from "@/lib/supabase-browser";
import { rotated } from "@/lib/images";
import { STR, TAG_LABEL, money, priceOf } from "@/lib/i18n";
import { showSize } from "@/lib/size";
import {
  availableUnits, holdersByUnit, unitPaths, collageTiles, TAGS,
  type Item, type ItemStatus, type RequestRow, type StagedPhoto, type Unit,
} from "@/lib/types";
import { StatChip, Toast, PrivacyNote, Sheet, ZoomButton, Lightbox, useConfirm } from "@/components/ui";
import UploadPhotos from "./UploadPhotos";
import PhotoPool from "./PhotoPool";
import CreateItem from "./CreateItem";
import EditItem from "./EditItem";

type Profile = { id: string; display_name: string; phone: string; slug: string; tags: string[] };

export default function BoardClient({ profile, items: initial, requests, holderRequests, staged }:
  {
    profile: Profile; items: Item[];
    /** the capped "wish lists that came in" display list — do not use for holders, see `holderRequests` */
    requests: RequestRow[];
    /** exact, uncapped: every request that touches a unit still `reserved` today. See page.tsx. */
    holderRequests: RequestRow[];
    staged: StagedPhoto[];
  }) {
  const t = STR.he;
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [items, setItems] = useState(initial);
  const [pool, setPool] = useState(staged);
  const [f, setF] = useState<"all" | ItemStatus>("all");
  const [uploading, setUploading] = useState(false);
  // the photos she picked in the pool, frozen for the duration of the form
  const [making, setMaking] = useState<StagedPhoto[] | null>(null);
  // the item currently open in the edit sheet, frozen for the duration of the form
  const [editing, setEditing] = useState<Item | null>(null);
  // the tile she tapped, by id rather than by value, so marking a unit sold
  // inside the sheet is reflected in the sheet without closing it
  const [openId, setOpenId] = useState<string | null>(null);
  /** the photo being looked at full size, or none */
  const [zoom, setZoom] = useState<string | null>(null);
  // Photos that are in a listing yet still in the pool, because the create
  // succeeded and clearing the pool afterwards did not. Session-only, and that
  // is honest: on a reload the rows really are still staged, so the pool
  // legitimately shows them again as free.
  const [listed, setListed] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  // requests released in this session. The rows come from the server component,
  // so they are held here until router.refresh() brings the board back without
  // them — otherwise a removed buyer sits on screen until a manual reload.
  const [dropped, setDropped] = useState<string[]>([]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const { confirm: ask, dialog: confirmDialog } = useConfirm();

  // a card has no status of its own any more: every count is over its units,
  // and `price` is per unit, so earnings sum one photo at a time
  const units = useMemo(
    () => items.flatMap((i) => i.units.map((u) => ({ u, i }))),
    [items]
  );
  const free = units.filter(({ u }) => u.status === "available");
  const held = units.filter(({ u }) => u.status === "reserved");
  const sold = units.filter(({ u }) => u.status === "sold");
  // What actually came in. sold_price is what she wrote down when marking the
  // unit paid; a unit sold before that existed, or with the field left alone,
  // falls back to what the listing asked. A per-pile lot's price is for the
  // whole lot, so its list price counts once, not once per unit.
  const earned = items.reduce((sum, i) => {
    const soldUnits = i.units.filter((u) => u.status === "sold");
    if (!soldUnits.length) return sum;
    const written = soldUnits.reduce((a, u) => a + (u.sold_price ?? 0), 0);
    const unwritten = soldUnits.filter((u) => u.sold_price == null).length;
    const fallback = i.price_for === "all" && i.units.length > 1
      ? (unwritten > 0 ? i.price : 0)
      : unwritten * i.price;
    return sum + written + fallback;
  }, 0);

  /**
   * Her own tags: the words she made up, kept on the profile so they outlive
   * the listing they were made on (see the own-tags migration). Written the
   * moment one is made, since a form that closes without posting must not
   * lose a word she typed.
   */
  const [ownTags, setOwnTags] = useState<string[]>(profile.tags ?? []);

  async function makeTag(tag: string) {
    if (ownTags.includes(tag) || TAGS.includes(tag as never)) return;
    const next = [...ownTags, tag];
    setOwnTags(next);
    // best effort: the chip is already there, and the item's own tags array
    // carries the word regardless, so a failed write costs only its memory
    await supabase.from("profiles").update({ tags: next }).eq("id", profile.id);
  }

  async function dropTag(tag: string) {
    const next = ownTags.filter((x) => x !== tag);
    setOwnTags(next);
    await supabase.from("profiles").update({ tags: next }).eq("id", profile.id);
  }

  /**
   * Everything she can tag with: the built-ins, her own, then every tag her
   * board already carries — a tag she dropped stays offered while some item
   * still wears it, because that item is the honest reason it is there.
   */
  const knownTags = useMemo(() => {
    const mine = new Set<string>(ownTags);
    items.forEach((i) => i.tags.forEach((x) => mine.add(x)));
    return [...TAGS, ...[...mine].filter((x) => !TAGS.includes(x as never))];
  }, [items, ownTags]);

  const list = useMemo(() => {
    // הכל means all of it, sold included. It used to hide fully-sold items,
    // which read as "everything" until the last unit of something was marked
    // paid — at which point the item dropped out of the list, the open sheet
    // lost the item it was showing, and vanished mid-tap. There is a נמכר
    // chip for the sold slice; there is no reason for הכל to be "all but".
    if (f === "all") return items;
    return items.filter((i) => i.units.some((u) => u.status === f));
  }, [f, items]);

  // A chip up top reads e.g. "12 פנוי" (12 units); the grid below, filtered to
  // the same status, shows however many cards that spans — a different, smaller
  // number, because one card can hold several units. Both are true, but shown
  // bare they read as disagreeing. `matchCount` on the section heading below
  // ties them together in one sentence instead of leaving her to reconcile two
  // bare numbers herself. `null` under "all": there is no single chip to check
  // the grid against, so nothing needs tying together.
  const matchedCount =
    f === "available" ? free.length : f === "reserved" ? held.length : f === "sold" ? sold.length : null;

  // which card a reserved unit belongs to, for the request lists below
  const unitIndex = useMemo(() => {
    const m = new Map<string, { unit: Unit; item: Item }>();
    items.forEach((item) => item.units.forEach((unit) => m.set(unit.id, { unit, item })));
    return m;
  }, [items]);

  // Who holds each reserved unit — derived from `holderRequests`, never
  // stored on `item_units` (no `reserved_by_*` columns: that table is
  // world-readable). `holderRequests` is the exact, uncapped set for this —
  // unlike the capped `requests` display list above, it cannot lose an older
  // still-pending hold on a busy sale. It arrives newest-first from
  // page.tsx, which is what holdersByUnit requires to let a later request
  // overwrite an earlier one for the same unit.
  const holders = useMemo(() => holdersByUnit(holderRequests), [holderRequests]);

  const unitLabel = (u: Unit) => {
    if (u.status === "sold") return t.statSold;
    if (u.status === "reserved") {
      const h = holders.get(u.id);
      // heldFor takes a first name, matching messageX/waReply elsewhere on
      // this board. statHeld is a defensive fallback, not an expected path:
      // reserve_units inserts a unit's request_items row in the same call
      // that reserves it, and `holderRequests` is fetched scoped to exactly
      // today's reserved unit ids, so every reserved unit should resolve a
      // holder here — a unit reserved with no request row at all shouldn't
      // be reachable.
      return h ? t.heldFor(h.name.split(" ")[0]) : t.statHeld;
    }
    return t.waiting;
  };

  // read after mount: the origin is unknown on the server, and rendering a
  // different string there than in the browser is a hydration mismatch
  const [saleUrl, setSaleUrl] = useState(`/${profile.slug}`);
  useEffect(() => {
    setSaleUrl(`${window.location.origin}/${profile.slug}`);
  }, [profile.slug]);

  /**
   * Marking a unit sold writes down what it went for, because the list price
   * is an opening number and the WhatsApp conversation is where the real one
   * lands. Back to stock clears it: the unit is for sale again at the asking
   * price, and the old sale did not happen.
   */
  async function setUnitStatus(unitId: string, status: ItemStatus, paid?: number) {
    const patch = status === "sold"
      ? { status, sold_price: paid ?? null }
      : { status, sold_price: null };
    const { error } = await supabase.from("item_units").update(patch).eq("id", unitId);
    if (error) return say(error.message);
    setItems((prev) => prev.map((i) => ({
      ...i,
      units: i.units.map((u) => (u.id === unitId ? { ...u, ...patch } : u)),
    })));
    say(status === "sold" ? t.statSold : t.backToStock);
  }

  /**
   * The price beside each "paid" button. Keyed by unit and pre-filled with
   * the asking price the moment the sheet opens, so pressing paid without
   * touching it records the list price — and a haggle is one edit first.
   */
  const [paidDraft, setPaidDraft] = useState<Record<string, string>>({});
  const askingFor = (i: Item) => (i.price_for === "all" && i.units.length > 1 ? i.price : i.price);
  const draftFor = (i: Item, u: Unit) => paidDraft[u.id] ?? String(u.sold_price ?? askingFor(i));
  const paidOf = (i: Item, u: Unit) => {
    const n = Number(draftFor(i, u));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : askingFor(i);
  };

  /**
   * The price box and the paid button, side by side: edit the number if the
   * WhatsApp conversation landed somewhere else, then press. Untouched, it
   * records the asking price. `after` runs once the status is written — a
   * single item closes its preview, a lot's rows stay for the next one.
   */
  /* A free item has no sum to write down: no box, and the button says the
     thing was handed over rather than paid for. */
  const paidRow = (i: Item, u: Unit, after?: () => void) => (
    <div className="gs-actions gs-paid" style={{ marginTop: 0 }}>
      {u.status !== "sold" && (
        <>
          {i.price > 0 && (
            <span className="gs-paid-box">
              <span className="gs-paid-cur">₪</span>
              <input className="gs-input gs-paid-in" value={draftFor(i, u)} dir="ltr"
                inputMode="numeric" pattern="[0-9]*" aria-label={t.paidPrice}
                onChange={(e) => setPaidDraft((d) => ({ ...d, [u.id]: e.target.value.replace(/\D/g, "") }))} />
            </span>
          )}
          <button className="gs-btn gs-btn-green gs-btn-sm"
            onClick={async () => { await setUnitStatus(u.id, "sold", i.price > 0 ? paidOf(i, u) : 0); after?.(); }}>
            {i.price > 0 ? t.markSold : t.markGiven}
          </button>
        </>
      )}
      {u.status !== "available" && (
        <button className="gs-btn gs-btn-cream gs-btn-sm"
          onClick={async () => { await setUnitStatus(u.id, "available"); after?.(); }}>
          {t.backToStock}
        </button>
      )}
    </div>
  );

  /**
   * Taking a buyer off the board. Everything her request still holds goes back
   * on sale in one statement — `release_request` frees only units that are
   * still `reserved`, so a unit already marked sold stays sold: the sale
   * happened, and removing the request is not a claim that it did not.
   *
   * The same function is what a buyer calls to withdraw her own list. The two
   * differ only in how each side comes to know the request id.
   */
  /** the incoming lists minus the ones released here since the last refresh */
  const shownRequests = useMemo(
    () => requests.filter((r) => !dropped.includes(r.id)),
    [requests, dropped]
  );

  async function releaseRequest(r: RequestRow) {
    if (!(await ask(t.confirmRemoveReq(r.buyer_name.split(" ")[0])))) return;
    const { data, error } = await supabase.rpc("release_request", { p_request_id: r.id });
    if (error || !data?.ok) return say(t.reqRemoveErr);

    const released: string[] = data.released ?? [];
    setItems((prev) => prev.map((i) => ({
      ...i,
      units: i.units.map((u) => (released.includes(u.id) ? { ...u, status: "available" as const } : u)),
    })));
    setDropped((d) => [...d, r.id]);
    say(t.reqRemoved);
    // the requests lists are server props; bring them back without this row
    router.refresh();
  }

  /**
   * Delete a listing; its photos go back to the pool. Deleting is usually
   * undoing — she listed the wrong photos, or the wrong way — and the
   * photos are the expensive part, so they are kept, staged again, ready to
   * list over. The question's third button is for when they are not
   * wanted either: then the item goes and the files with it.
   *
   * Pool rows first, item second: if the item delete then fails, the rows
   * are taken back and nothing changed. The other order could leave the
   * photos owned by nothing at all.
   */
  async function remove(item: Item) {
    const answer = await ask(t.confirmDelete, t.deleteWithPhotos);
    if (!answer) return;
    if (answer === "more") return removeWithPhotos(item);

    // every photo the listing owns — each unit's own, and its extra views
    const rows = item.units.flatMap((u) => [
      { photo_path: u.photo_path, thumb_path: u.thumb_path },
      ...(u.photos ?? []).map((p) => ({ photo_path: p.photo_path, thumb_path: p.thumb_path })),
    ]).map((r) => ({ ...r, seller_id: profile.id }));

    const { data: staged, error: stageErr } = rows.length
      ? await supabase.from("staged_photos").insert(rows).select("id, photo_path, thumb_path, created_at")
      : { data: [] as StagedPhoto[], error: null };
    if (stageErr) return say(stageErr.message);

    const { error } = await supabase.from("items").delete().eq("id", item.id);
    if (error) {
      await supabase.from("staged_photos").delete().in("id", (staged ?? []).map((s) => s.id));
      return say(error.message);
    }

    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setPool((p) => [...p, ...((staged ?? []) as StagedPhoto[])]);
    say(t.itemDeleted);
  }

  /** the item and its files, for good */
  async function removeWithPhotos(item: Item) {
    const { error } = await supabase.from("items").delete().eq("id", item.id);
    if (error) return say(error.message);

    // Row first on purpose: better an orphan blob than a listing pointing at a
    // photo that is gone. The cost is that once the row is deleted these paths
    // exist nowhere else, so a failure here strands them for good — say so
    // instead of dropping it. They need the same reconciliation sweep the
    // upload orphans do (see SETUP.md).
    //
    // Every path the listing owns, not just the cover of each unit: the
    // unit_photos rows cascade away with the item, but their blobs do not, so
    // a crib with five angles would strand eight files without unitPaths.
    const paths = item.units.flatMap(unitPaths);
    const gone = paths.length ? await supabase.storage.from("photos").remove(paths) : null;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    say(gone?.error ? t.photosNotDeleted : t.itemAndPhotosDeleted);
  }

  const [turning, setTurning] = useState<string[]>([]);
  // the turned thumbnail, straight from memory, shown the moment it exists:
  // the upload behind it takes seconds on a phone and the eye should not
  // have to wait for a CDN to serve back what the browser just drew
  const [previews, setPreviews] = useState<Record<string, string>>({});

  /**
   * A quarter turn clockwise, saved: the photo is fetched back, turned,
   * both sizes uploaded under new names, and the row pointed at them. New
   * names rather than overwriting, because the old ones are cached in every
   * browser that has seen the pool — the same path would show the old
   * photo until the cache gave up. The old files go last; if that fails the
   * photo is still right and only a stray file is left behind.
   */
  async function rotatePhoto(photo: StagedPhoto) {
    if (turning.includes(photo.id)) return;
    setTurning((s) => [...s, photo.id]);
    try {
      const res = await fetch(photoUrl(photo.photo_path));
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const out = await rotated(await res.blob());
      setPreviews((m) => ({ ...m, [photo.id]: URL.createObjectURL(out.thumb) }));

      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fullPath = `${profile.id}/${stamp}.webp`;
      const thumbPath = `${profile.id}/${stamp}-thumb.webp`;
      const opts = { contentType: "image/webp" };
      const [up1, up2] = await Promise.all([
        supabase.storage.from("photos").upload(fullPath, out.full, opts),
        supabase.storage.from("photos").upload(thumbPath, out.thumb, opts),
      ]);
      if (up1.error || up2.error) {
        await supabase.storage.from("photos").remove([fullPath, thumbPath]);
        throw new Error((up1.error ?? up2.error)!.message);
      }

      const { error } = await supabase.from("staged_photos")
        .update({ photo_path: fullPath, thumb_path: thumbPath }).eq("id", photo.id);
      if (error) {
        await supabase.storage.from("photos").remove([fullPath, thumbPath]);
        throw new Error(error.message);
      }

      setPool((p) => p.map((x) => (x.id === photo.id ? { ...x, photo_path: fullPath, thumb_path: thumbPath } : x)));
      setTurning((s) => s.filter((id) => id !== photo.id));
      // housekeeping, after the spinner stops: nothing waits on it
      await supabase.storage.from("photos").remove([photo.photo_path, photo.thumb_path]);
    } catch (e) {
      // the preview was optimistic; the saved photo is still the old way up
      setPreviews((m) => { const { [photo.id]: _, ...rest } = m; return rest; });
      say(t.rotateFailed);
    } finally {
      setTurning((s) => s.filter((id) => id !== photo.id));
    }
  }

  async function removePhoto(photo: StagedPhoto) {
    if (!(await ask(t.confirmDeletePhoto))) return;
    const { error } = await supabase.from("staged_photos").delete().eq("id", photo.id);
    if (error) return say(error.message);

    // Row first, same as remove() above and for the same reason: better a
    // stray blob than a row surviving with no photo behind it — here that
    // would mean a broken thumbnail stuck in the pool with no way to clear
    // it, worse than a file merely wasting space in the bucket. The cost is
    // the same too: once the row is gone these paths exist nowhere else, so
    // a failure below strands them for good — say so instead of dropping it.
    // Local state drops the photo regardless of how the blob delete goes,
    // because the row really is gone from the database; leaving it drawn in
    // the pool here would just be lying about that.
    const gone = await supabase.storage.from("photos").remove([photo.photo_path, photo.thumb_path]);
    setPool((p) => p.filter((x) => x.id !== photo.id));
    if (gone.error) say(t.photoNotDeleted);
  }

  /**
   * Passing the app on. This is the seller recommending the tool to a friend
   * who might sell too — a different act from sharing her sale link, which is
   * for buyers. On a phone it opens the native share sheet, so it lands in
   * whatever she uses; where there is none it copies the message, which is
   * the next best thing and says so.
   */
  const shareApp = async () => {
    const url = window.location.origin;
    const text = `${t.shareAppText} ${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Garage Sale", text, url }); } catch { /* dismissed */ }
      return;
    }
    navigator.clipboard?.writeText(text);
    say(t.shareAppCopied);
  };

  const openItem = openId ? items.find((i) => i.id === openId) ?? null : null;

  const openWa = (phone: string, text: string) =>
    window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`, "_blank");

  return (
    <main className="gs-wrap">
      {/* The page's head is the logo, small, with signing out beside it —
          outside the tinted panels, where it cannot read as one of the
          controls for adding stock. */}
      <div className="gs-board-head">
        <img className="gs-board-logo" src="/logo.webp" alt="Garage Sale" />
        <button className="gs-btn-ghost gs-signout" onClick={async () => {
          await supabase.auth.signOut(); router.push("/login");
        }}>{t.signOut}</button>
      </div>

      {/* her link, on its own between the head and the sections: it is the
          one thing here that leaves the board */}
      <div className="gs-linkbar">
        <b className="gs-linkbar-h">{t.myLink}</b>
        {/* the link and the button that copies it are one thing, on their own
            line — the heading above names them rather than sharing a row */}
        <div className="gs-linkbar-row">
          <code>{saleUrl}</code>
          <button className="gs-btn gs-btn-sm" onClick={() => {
            navigator.clipboard?.writeText(saleUrl); say(t.copied);
          }}>{t.copy}</button>
        </div>
      </div>

      {/* Section one: the photos, and the way to add to them. The other two
          sections are what is happening to that stock. */}
      <section className="gs-section gs-section-add">
        {/* the count sits with the heading, the way what came in sits with
            the sales heading: a number, not a sentence */}
        <div className="gs-status-head">
          <h2 className="gs-section-h">{t.poolTitle}</h2>
          {pool.length > 0 && <p className="gs-earned"><b>{pool.length}</b></p>}
        </div>
        {/* the way in sits above the photos: with a screenful of them, a
            button underneath was a scroll away every time */}
        <button className="gs-btn gs-btn-cream gs-btn-wide gs-upload-btn"
          onClick={() => setUploading(true)}>{t.uploadPhotos}</button>
        <PhotoPool photos={pool} listed={listed} onCreate={setMaking} onDelete={removePhoto}
          onRotate={rotatePhoto} turning={turning} previews={previews} />
      </section>

      {/* The lists that came in are the part she acts on, so they come
          before the shelf-check below. It also puts the stat chips next to
          the grid they filter: with the requests in between, the filter and
          the thing being filtered were a screen apart. */}
      <section className="gs-section">
        <h2 className="gs-section-h" style={{ marginBottom: 16 }}>{t.requestsH}</h2>
          {shownRequests.length === 0 ? <p className="gs-empty">{t.requestsEmpty}</p> : (
            <div className="gs-reqs">
              {shownRequests.map((r) => {
                const lines = r.request_items
                  .map((ri) => unitIndex.get(ri.unit_id))
                  .filter(Boolean) as { unit: Unit; item: Item }[];
                const total = lines.reduce((s, l) => s + l.item.price, 0);
                return (
                  <div key={r.id} className="gs-req">
                    {/* in the corner rather than in the footer: it undoes the
                        whole card, so it belongs to the card, not beside the
                        one action that acts on its contents */}
                    <button className="gs-req-x" onClick={() => releaseRequest(r)}
                      title={t.removeReq} aria-label={t.removeReq}>×</button>
                    <div className="gs-req-top">
                      <span className="gs-req-name">{r.buyer_name}</span>
                      <span className="gs-req-phone" dir="ltr">{r.buyer_phone}</span>
                      <span className="gs-req-time" dir="ltr">
                        {new Date(r.created_at).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <ul className="gs-req-items">
                      {lines.map(({ unit, item }) => (
                        <li key={unit.id}>
                          {item.title} — {priceOf(item.price)}
                          {unit.status === "sold" && <b> · {t.statSold}</b>}
                          {unit.status === "available" && <b> · {t.backToStock}</b>}
                        </li>
                      ))}
                    </ul>
                    <div className="gs-req-foot">
                      <b>{money(total)}</b>
                      <button className="gs-btn gs-btn-green gs-btn-sm"
                        onClick={() => openWa(r.buyer_phone, t.waReply(r.buyer_name.split(" ")[0], profile.display_name))}>
                        {t.messageX(r.buyer_name.split(" ")[0])}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </section>

      <section className="gs-section">
        {/* what came in is not a filter and never was — it sits with the
            heading, where a headline number belongs, instead of standing in a
            row of things that all toggle when tapped */}
        <div className="gs-status-head">
          <h2 className="gs-section-h">{t.sectionStatusH}</h2>
          <p className="gs-earned"><b>{money(earned)}</b> <span>{t.statEarned}</span></p>
        </div>

        <div className="gs-stats">
          {/* the way back. Tapping a lit chip already returned here, but
              nothing on screen said so, so the first tap looked like a
              one-way door. */}
          <StatChip n={units.length} label={t.all} on={f === "all"}
            onClick={() => setF("all")} />
          <StatChip n={free.length} label={t.statFree} on={f === "available"}
            onClick={() => setF((c) => (c === "available" ? "all" : "available"))} />
          <StatChip n={held.length} label={t.statHeld} on={f === "reserved"}
            onClick={() => setF((c) => (c === "reserved" ? "all" : "reserved"))} />
          <StatChip n={sold.length} label={t.statSold} on={f === "sold"}
            onClick={() => setF((c) => (c === "sold" ? "all" : "sold"))} />
        </div>


        <h3 className="gs-h2">
          {/* name the slice actually on screen. "what is still left" was only
              true under the פנוי chip — with a chip off, this list includes
              reserved and sold units, and something claimed is the opposite
              of left over. */}
          {f === "all" ? t.allItems
            : f === "available" ? t.statFree
            : f === "reserved" ? t.statHeld
            : t.statSold}
          {/* ties the chip's unit count to the card count below it, in one
              sentence, so the two numbers cannot read as disagreeing. Skipped
              at zero: "0 out of 0 items" is technically true but not a phrase
              anyone would say, and an empty filter needs no reconciling. */}
          {matchedCount !== null && matchedCount > 0 && (
            <span className="gs-tags"> · {matchedCount} {t.matchCount(list.length)}</span>
          )}
        </h3>
        <div className="gs-grid gs-grid-board">
        {list.map((it) => {
          const cover = it.units[0];
          const gone = it.units.length > 0 && it.units.every((u) => u.status !== "available");
          const soldCount = it.units.filter((u) => u.status === "sold").length;
          // A tile, and nothing else: photo, name, price, one badge. Every
          // action lives in the sheet it opens, so every tile is the same
          // height and the grid reads as a grid. Sold is a small green check
          // in the corner — the thing she glances for, and the only state
          // worth a mark; a partly-sold lot shows its count, available shows
          // nothing at all.
          return (
            <div key={it.id} className="gs-tile-wrap">
            <button type="button"
              className={"gs-tile" + (gone ? " taken" : "")}
              onClick={() => setOpenId(it.id)}>
              <span className="gs-tile-photo">
                {/* a lot is a collage, as on the buyer's card, so the tile
                    says "several things" before its name is read */}
                {it.units.length > 1 ? (
                  <span className={`gs-collage gs-collage-${collageTiles(it.units.length)}`}>
                    {it.units.slice(0, collageTiles(it.units.length)).map((u) => (
                      <img key={u.id} src={photoUrl(u.thumb_path)} alt="" loading="lazy" />
                    ))}
                  </span>
                ) : cover && <img src={photoUrl(cover.thumb_path)} alt="" loading="lazy" />}
                {soldCount > 0 && soldCount === it.units.length && (
                  <span className="gs-tile-sold" title={t.statSold} aria-label={t.statSold}>
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor"
                        strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
                {soldCount > 0 && soldCount < it.units.length && (
                  <span className="gs-tile-part">{soldCount}/{it.units.length}</span>
                )}
              </span>
              <span className="gs-tile-body">
                <span className="gs-tile-title">{it.title}</span>
                <span className="gs-tile-row">
                  <span className="gs-price">{priceOf(it.price)}</span>
                  {it.units.length > 1 && (
                    <span className="gs-tile-meta">{t.unitsLeft(availableUnits(it).length)}</span>
                  )}
                </span>
                {/* furniture: the measurements on the tile, as on the buyer's card */}
                {it.measurements && (
                  <span className="gs-tile-size" dir={showSize(it.measurements).dir}>{showSize(it.measurements).text}</span>
                )}
              </span>
            </button>
              {/* the same × as on a pool photo: the listing goes, the photos
                  come back to the pool */}
              <button type="button" className="gs-pick-del gs-tile-del" title={t.deleteItem}
                aria-label={t.deleteItem} onClick={() => remove(it)}>
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" fill="none"
                        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
              </button>
            </div>
          );
        })}
      </div>
      </section>

      {uploading && (
        <UploadPhotos
          onClose={() => setUploading(false)}
          onUploaded={(photos) => {
            // appended, matching the oldest-first order the board is fetched in
            setPool((p) => [...p, ...photos]);
            say(t.photosAdded(photos.length));
          }}
        />
      )}

      {making && (
        <CreateItem
          photos={making}
          knownTags={knownTags} onTagMade={makeTag} onTagDropped={dropTag}
          onClose={() => setMaking(null)}
          // `used` is only the photos that genuinely landed in the listing, so
          // anything the save could not attach stays in the pool — both the
          // retry path and an honest record. `cleared` splits the two ways a
          // photo can be spoken for: gone from the pool, or still in it
          // because the delete failed. Either way it must never be picked
          // again, which is what `listed` carries to the pool. The form closes
          // itself only after a clean run; it stays open otherwise to hold the
          // explanation, which is why closing is not done here.
          onCreated={(item, used, cleared) => {
            setItems((prev) => [item, ...prev]);
            setListed((prev) => [...prev, ...used]);
            if (cleared) setPool((p) => p.filter((x) => !used.includes(x.id)));
            say(t.itemAdded);
          }}
        />
      )}

      {editing && (
        <EditItem
          item={editing}
          knownTags={knownTags} onTagMade={makeTag} onTagDropped={dropTag}
          onClose={() => setEditing(null)}
          onSaved={(item) => {
            setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
            say(t.itemUpdated);
          }}
        />
      )}

      {/* the board's last word, not its first: a seller who has scrolled
          through her own sale is the one who will pass the tool on */}
      <div className="gs-share-app">
        <button className="gs-btn gs-btn-cream" onClick={shareApp}>{t.shareApp}</button>
      </div>
      <PrivacyNote />

      {/* Tapping a tile opens this. It is the old card, whole — the unit list,
          the paid buttons, the nudge, edit, delete — in a place that can be as
          tall as it needs to be without dragging the grid with it. */}
      {zoom && <Lightbox src={zoom} alt={openItem?.title ?? ""} onClose={() => setZoom(null)} closeLabel={t.zoomOut} />}

      {openItem && (
        <Sheet title={openItem.title} hand compact onClose={() => setOpenId(null)}
          sub={openItem.tags.length > 0 && openItem.tags.map((x) => TAG_LABEL[x]?.he ?? x).join(" · ")}>
          <div className="gs-detail-photo">
            <img src={photoUrl(openItem.units[0]?.thumb_path ?? "")} alt="" />
            {openItem.units[0] && (
              <ZoomButton onClick={() => setZoom(photoUrl(openItem.units[0].photo_path))} label={t.zoomIn} />
            )}
          </div>
          <p className="gs-detail-price">{priceOf(openItem.price)}</p>
          {openItem.measurements && (
            <p className="gs-detail-size"><b>{t.measurements}</b> · <span dir={showSize(openItem.measurements).dir}>{showSize(openItem.measurements).text}</span></p>
          )}
          {openItem.description && <p className="gs-detail-desc">{openItem.description}</p>}

          {/* A lot gets one row per photo — each a separate claimable thing,
              so marking one sold is obviously about that photo alone. A
              single listing has exactly one thing to sell and gets one set
              of buttons. */}
          {openItem.units.length > 1 ? (
            <ul className="gs-list">
              {openItem.units.map((u) => (
                <li key={u.id} className="gs-list-row" style={{ flexWrap: "wrap" }}>
                  <img className="gs-mini" src={photoUrl(u.thumb_path)} alt="" loading="lazy" />
                  <span className="gs-list-name">
                    {unitLabel(u)}
                    {u.status === "sold" && u.sold_price != null && (
                      <span className="gs-list-paid"> · {money(u.sold_price)}</span>
                    )}
                  </span>
                  {paidRow(openItem, u)}
                </li>
              ))}
            </ul>
          ) : openItem.units[0] && (
            <>
              {openItem.units[0].status !== "available" && (
                <p className="gs-waiting">{unitLabel(openItem.units[0])}</p>
              )}
              {/* The same size as a lot's per-unit buttons: one action, one
                  look. But unlike a lot, a single item has nothing left to do
                  once it is paid, so the tap that marks it also closes the
                  preview — she is back at the grid with the check on the tile.
                  A lot stays open, because its next unit is right there. */}
              {openItem.units[0].status === "sold" && openItem.units[0].sold_price != null && (
                <p className="gs-waiting">{t.paidPrice}: {money(openItem.units[0].sold_price)}</p>
              )}
              {paidRow(openItem, openItem.units[0], () => setOpenId(null))}
            </>
          )}


          <div className="gs-sheet-foot">
            <button className="gs-btn-ghost" onClick={() => { setEditing(openItem); setOpenId(null); }}>
              {t.editItem}
            </button>
            <button className="gs-btn-ghost gs-danger" onClick={() => { remove(openItem); setOpenId(null); }}>
              {t.deleteItem}
            </button>
          </div>
        </Sheet>
      )}

      {confirmDialog}
      {toast && <Toast text={toast} />}
    </main>
  );
}
