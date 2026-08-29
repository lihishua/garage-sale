"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser, photoUrl } from "@/lib/supabase-browser";
import { STR, money } from "@/lib/i18n";
import { unitPaths, type Item, type ItemStatus, type RequestRow, type StagedPhoto, type Unit } from "@/lib/types";
import { StatChip, Toast } from "@/components/ui";
import UploadPhotos from "./UploadPhotos";
import PhotoPool from "./PhotoPool";
import CreateItem from "./CreateItem";

type Profile = { display_name: string; phone: string; slug: string };

// who holds a reserved unit is derived from `requests`, not stored on the unit
// — Task 6 wires holdersByUnit in. Until then the request list below is where
// the seller reads a buyer's name and number.
const unitState = (s: ItemStatus) =>
  s === "sold" ? STR.he.statSold : s === "reserved" ? STR.he.statHeld : STR.he.waiting;

export default function BoardClient({ profile, items: initial, requests, staged }:
  { profile: Profile; items: Item[]; requests: RequestRow[]; staged: StagedPhoto[] }) {
  const t = STR.he;
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [items, setItems] = useState(initial);
  const [pool, setPool] = useState(staged);
  const [f, setF] = useState<"all" | ItemStatus>("all");
  const [uploading, setUploading] = useState(false);
  // the photos she picked in the pool, frozen for the duration of the form
  const [making, setMaking] = useState<StagedPhoto[] | null>(null);
  // Photos that are in a listing yet still in the pool, because the create
  // succeeded and clearing the pool afterwards did not. Session-only, and that
  // is honest: on a reload the rows really are still staged, so the pool
  // legitimately shows them again as free.
  const [listed, setListed] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  // a card has no status of its own any more: every count is over its units,
  // and `price` is per unit, so earnings sum one photo at a time
  const units = useMemo(
    () => items.flatMap((i) => i.units.map((u) => ({ u, i }))),
    [items]
  );
  const free = units.filter(({ u }) => u.status === "available");
  const held = units.filter(({ u }) => u.status === "reserved");
  const sold = units.filter(({ u }) => u.status === "sold");
  const earned = sold.reduce((s, { i }) => s + i.price, 0);

  const list = useMemo(() => {
    // a unit-less card would otherwise be unreachable, including to delete
    if (f === "all") return items.filter((i) => !i.units.length || i.units.some((u) => u.status !== "sold"));
    return items.filter((i) => i.units.some((u) => u.status === f));
  }, [f, items]);

  // which card a reserved unit belongs to, for the request lists below
  const unitIndex = useMemo(() => {
    const m = new Map<string, { unit: Unit; item: Item }>();
    items.forEach((item) => item.units.forEach((unit) => m.set(unit.id, { unit, item })));
    return m;
  }, [items]);

  // read after mount: the origin is unknown on the server, and rendering a
  // different string there than in the browser is a hydration mismatch
  const [saleUrl, setSaleUrl] = useState(`/${profile.slug}`);
  useEffect(() => {
    setSaleUrl(`${window.location.origin}/${profile.slug}`);
  }, [profile.slug]);

  async function setUnitStatus(unitId: string, status: ItemStatus) {
    const { error } = await supabase.from("item_units").update({ status }).eq("id", unitId);
    if (error) return say(error.message);
    setItems((prev) => prev.map((i) => ({
      ...i,
      units: i.units.map((u) => (u.id === unitId ? { ...u, status } : u)),
    })));
    say(status === "sold" ? t.statSold : t.backToStock);
  }

  async function remove(item: Item) {
    if (!confirm(t.confirmDelete)) return;
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
    if (gone?.error) say(t.photosNotDeleted);
  }

  const openWa = (phone: string, text: string) =>
    window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`, "_blank");

  return (
    <main className="gs-wrap">
      <div className="gs-board-head">
        <h1 className="gs-board-title">{t.boardTitle}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="gs-btn gs-btn-cream" onClick={() => setUploading(true)}>{t.uploadPhotos}</button>
          <button className="gs-btn-ghost" onClick={async () => {
            await supabase.auth.signOut(); router.push("/login");
          }}>{t.signOut}</button>
        </div>
      </div>

      <div className="gs-linkbar">
        <b>{t.myLink}</b>
        <code>{saleUrl}</code>
        <button className="gs-btn gs-btn-sm" onClick={() => {
          navigator.clipboard?.writeText(saleUrl); say(t.copied);
        }}>{t.copy}</button>
      </div>

      <div className="gs-stats">
        <StatChip n={free.length} label={t.statFree} on={f === "available"}
          onClick={() => setF((c) => (c === "available" ? "all" : "available"))} />
        <StatChip n={held.length} label={t.statHeld} color="#F7BC45" on={f === "reserved"}
          onClick={() => setF((c) => (c === "reserved" ? "all" : "reserved"))} />
        <StatChip n={sold.length} label={t.statSold} color="#9ACB3B" on={f === "sold"}
          onClick={() => setF((c) => (c === "sold" ? "all" : "sold"))} />
        <StatChip n={money(earned)} label={t.statEarned} color="#EE5A2A" />
      </div>

      <h2 className="gs-h2">{t.requestsH}</h2>
      {requests.length === 0 ? <p className="gs-empty">{t.requestsEmpty}</p> : (
        <div className="gs-reqs">
          {requests.map((r) => {
            const lines = r.request_items
              .map((ri) => unitIndex.get(ri.unit_id))
              .filter(Boolean) as { unit: Unit; item: Item }[];
            const total = lines.reduce((s, l) => s + l.item.price, 0);
            return (
              <div key={r.id} className="gs-req">
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
                      {item.title} — {money(item.price)}
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

      <h2 className="gs-h2">{t.poolTitle}</h2>
      <PhotoPool photos={pool} listed={listed} onCreate={setMaking} />

      <h2 className="gs-h2">{f === "sold" ? t.statSold : t.stillHere}</h2>
      <div className="gs-grid">
        {list.map((it) => {
          const cover = it.units[0];
          const gone = it.units.length > 0 && it.units.every((u) => u.status !== "available");
          return (
            <article key={it.id} className={"gs-card" + (gone ? " taken" : "")}>
              <div className="gs-photo">
                {cover && <img src={photoUrl(cover.thumb_path)} alt={it.title} loading="lazy" />}
              </div>
              <div className="gs-card-body">
                <h3 className="gs-card-title">{it.title}</h3>
                <div className="gs-card-row">
                  <span className="gs-price">{money(it.price)}</span>
                  <span className="gs-tags">{t.photoCount(it.units.length)}</span>
                </div>

                {/* one row per photo. a single-photo item is a batch of one, so
                    there is no second code path for it. */}
                <ul className="gs-list">
                  {it.units.map((u) => (
                    <li key={u.id} className="gs-list-row" style={{ flexWrap: "wrap" }}>
                      {it.units.length > 1 && (
                        <img className="gs-mini" src={photoUrl(u.thumb_path)} alt="" loading="lazy" />
                      )}
                      <span className="gs-list-name">{unitState(u.status)}</span>
                      <div className="gs-actions" style={{ marginTop: 0 }}>
                        {u.status !== "sold" && (
                          <button className="gs-btn gs-btn-green gs-btn-sm"
                            onClick={() => setUnitStatus(u.id, "sold")}>{t.markSold}</button>
                        )}
                        {u.status !== "available" && (
                          <button className="gs-btn gs-btn-cream gs-btn-sm"
                            onClick={() => setUnitStatus(u.id, "available")}>{t.backToStock}</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                <button className="gs-btn-ghost" onClick={() => remove(it)}>{t.deleteItem}</button>
              </div>
            </article>
          );
        })}
      </div>

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

      {toast && <Toast text={toast} />}
    </main>
  );
}
