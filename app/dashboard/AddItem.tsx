"use client";

import React, { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { STR, TAG_LABEL } from "@/lib/i18n";
import { TAGS, type Item } from "@/lib/types";
import { prepare, PHOTO_MIN_WIDTH } from "@/lib/images";
import { Sheet, Field, Chip } from "@/components/ui";

export default function AddItem({ onClose, onAdded }:
  { onClose: () => void; onAdded: (item: Item) => void }) {
  const t = STR.he;
  const supabase = supabaseBrowser();
  const fileRef = useRef<HTMLInputElement>(null);

  const [f, setF] = useState({ title: "", price: "", desc: "", size: "", tags: [] as string[] });
  const [photo, setPhoto] = useState<{ full: Blob; thumb: Blob; preview: string } | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const isFurniture = f.tags.includes("furniture");
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const toggleTag = (x: string) =>
    set("tags", f.tags.includes(x) ? f.tags.filter((y) => y !== x) : [...f.tags, x]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { full, thumb } = await prepare(file);
      setPhoto({ full, thumb, preview: URL.createObjectURL(thumb) });
      setErr((p) => ({ ...p, photo: "" }));
    } catch (ex: any) {
      setErr((p) => ({ ...p, photo: ex.message === "too_small" ? t.photoSmall : t.errPhoto }));
      setPhoto(null);
    }
  }

  async function submit() {
    const e: Record<string, string> = {};
    if (!photo) e.photo = t.errPhoto;
    if (!f.title.trim()) e.title = t.errTitle;
    if (!f.price || Number(f.price) <= 0) e.price = t.errPrice;
    if (!f.desc.trim()) e.desc = t.errDesc;
    if (isFurniture && !f.size.trim()) e.size = t.errSize;
    if (Object.keys(e).length) { setErr(e); return; }
    setErr({});
    setBusy(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !photo) { setBusy(false); return; }

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullPath = `${user.id}/${stamp}.webp`;
    const thumbPath = `${user.id}/${stamp}-thumb.webp`;

    const up1 = await supabase.storage.from("photos").upload(fullPath, photo.full, { contentType: "image/webp" });
    const up2 = await supabase.storage.from("photos").upload(thumbPath, photo.thumb, { contentType: "image/webp" });
    if (up1.error || up2.error) { setBusy(false); setErr({ photo: (up1.error ?? up2.error)!.message }); return; }

    const { data, error } = await supabase.from("items").insert({
      seller_id: user.id,
      title: f.title.trim(),
      description: f.desc.trim(),
      price: Math.round(Number(f.price)),
      tags: f.tags,
      measurements: isFurniture ? f.size.trim() : null,
      photo_path: fullPath,
      thumb_path: thumbPath,
    }).select().single();

    setBusy(false);
    if (error || !data) { setErr({ title: error?.message ?? "failed" }); return; }
    onAdded(data as Item);
  }

  return (
    <Sheet title={t.addTitle} onClose={onClose}>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
      <button className={"gs-drop" + (err.photo ? " bad" : "")} onClick={() => fileRef.current?.click()}>
        {photo ? <img src={photo.preview} alt="" /> : t.photo}
        <span className="gs-drop-note">{t.photoNote}</span>
      </button>
      {err.photo && <span className="gs-err">{err.photo}</span>}

      <Field label={t.whatIsIt} value={f.title} onChange={(v) => set("title", v)} err={err.title} placeholder={t.whatPh} />
      <Field label={t.price} value={f.price} onChange={(v) => set("price", v.replace(/\D/g, ""))} err={err.price} ltr />
      <Field label={t.description} value={f.desc} onChange={(v) => set("desc", v)} err={err.desc} placeholder={t.descPh} area />

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

      <button className="gs-btn gs-btn-orange gs-btn-wide" onClick={submit} disabled={busy}>
        {busy ? t.uploading : t.postIt}
      </button>
      <p className="gs-fine">רוחב מינימלי לתמונה: {PHOTO_MIN_WIDTH} פיקסלים.</p>
    </Sheet>
  );
}
