"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser, photoUrl } from "@/lib/supabase-browser";
import { STR, money } from "@/lib/i18n";
import type { Item, ItemStatus, RequestRow } from "@/lib/types";
import { StatChip, Toast } from "@/components/ui";
import AddItem from "./AddItem";

type Profile = { display_name: string; phone: string; slug: string };

export default function BoardClient({ profile, items: initial, requests }:
  { profile: Profile; items: Item[]; requests: RequestRow[] }) {
  const t = STR.he;
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [items, setItems] = useState(initial);
  const [f, setF] = useState<"all" | ItemStatus>("all");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const free = items.filter((i) => i.status === "available");
  const held = items.filter((i) => i.status === "reserved");
  const sold = items.filter((i) => i.status === "sold");
  const earned = sold.reduce((s, i) => s + i.price, 0);

  const list = useMemo(() => {
    if (f === "available") return free;
    if (f === "reserved") return held;
    if (f === "sold") return sold;
    return items.filter((i) => i.status !== "sold");
  }, [f, items, free, held, sold]);

  // read after mount: the origin is unknown on the server, and rendering a
  // different string there than in the browser is a hydration mismatch
  const [saleUrl, setSaleUrl] = useState(`/${profile.slug}`);
  useEffect(() => {
    setSaleUrl(`${window.location.origin}/${profile.slug}`);
  }, [profile.slug]);

  async function setStatus(id: string, status: ItemStatus) {
    const patch: Partial<Item> = { status };
    if (status === "available") { patch.reserved_by_name = null; patch.reserved_by_phone = null; }
    const { error } = await supabase.from("items").update(patch).eq("id", id);
    if (error) return say(error.message);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } as Item : i)));
    say(status === "sold" ? t.statSold : t.backToStock);
  }

  async function remove(item: Item) {
    if (!confirm(t.confirmDelete)) return;
    const { error } = await supabase.from("items").delete().eq("id", item.id);
    if (error) return say(error.message);
    await supabase.storage.from("photos").remove([item.photo_path, item.thumb_path]);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  const openWa = (phone: string, text: string) =>
    window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`, "_blank");

  return (
    <main className="gs-wrap">
      <div className="gs-board-head">
        <h1 className="gs-board-title">{t.boardTitle}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="gs-btn gs-btn-cream" onClick={() => setAdding(true)}>{t.addTitle}</button>
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
              .map((ri) => items.find((i) => i.id === ri.item_id))
              .filter(Boolean) as Item[];
            const total = lines.reduce((s, i) => s + i.price, 0);
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
                  {lines.map((i) => (
                    <li key={i.id}>
                      {i.title} — {money(i.price)}
                      {i.status === "sold" && <b> · {t.statSold}</b>}
                      {i.status === "available" && <b> · {t.backToStock}</b>}
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

      <h2 className="gs-h2">{f === "sold" ? t.statSold : t.stillHere}</h2>
      <div className="gs-grid">
        {list.map((it) => (
          <article key={it.id} className={"gs-card" + (it.status !== "available" ? " taken" : "")}>
            <div className="gs-photo">
              <img src={photoUrl(it.thumb_path)} alt={it.title} loading="lazy" />
              {it.status === "reserved" && (
                <span className="gs-band">{t.heldFor(it.reserved_by_name?.split(" ")[0] ?? "")}</span>
              )}
            </div>
            <div className="gs-card-body">
              <h3 className="gs-card-title">{it.title}</h3>
              <div className="gs-card-row">
                <span className="gs-price">{money(it.price)}</span>
                {it.status === "reserved" && (
                  <span className="gs-tags" dir="ltr">{it.reserved_by_phone}</span>
                )}
              </div>
              {it.status === "reserved" ? (
                <div className="gs-actions">
                  <button className="gs-btn gs-btn-green gs-btn-sm" onClick={() => setStatus(it.id, "sold")}>
                    {t.markSold}
                  </button>
                  <button className="gs-btn gs-btn-cream gs-btn-sm" onClick={() => setStatus(it.id, "available")}>
                    {t.backToStock}
                  </button>
                </div>
              ) : it.status === "sold" ? (
                <p className="gs-waiting">{t.statSold}</p>
              ) : (
                <div className="gs-actions">
                  <p className="gs-waiting">{t.waiting}</p>
                  <button className="gs-btn-ghost" onClick={() => remove(it)}>{t.deleteItem}</button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {adding && (
        <AddItem
          onClose={() => setAdding(false)}
          onAdded={(item) => { setItems((p) => [item, ...p]); setAdding(false); say(t.itemAdded); }}
        />
      )}

      {toast && <Toast text={toast} />}
    </main>
  );
}
