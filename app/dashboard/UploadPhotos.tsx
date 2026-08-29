"use client";

import React, { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { STR } from "@/lib/i18n";
import type { StagedPhoto } from "@/lib/types";
import { prepare, PHOTO_MIN_WIDTH } from "@/lib/images";
import { Sheet } from "@/components/ui";

/**
 * Bulk upload into the photo pool. Nothing here creates an item — the seller
 * empties her camera roll into `staged_photos` first and decides what is a
 * listing afterwards (Task 5).
 */
export default function UploadPhotos({ onClose, onUploaded }:
  { onClose: () => void; onUploaded: (photos: StagedPhoto[]) => void }) {
  const t = STR.he;
  const supabase = supabaseBrowser();
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState(0);
  const [total, setTotal] = useState(0);
  const [added, setAdded] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [failed, setFailed] = useState(0);
  const [err, setErr] = useState("");

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // so picking the same photo twice still fires onChange
    if (files.length) await run(files);
  }

  async function run(files: File[]) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr(t.errSend); return; }

    setBusy(true);
    setErr("");
    setTotal(files.length);
    setAt(0); setAdded(0); setRejected(0); setFailed(0);

    const done: StagedPhoto[] = [];
    let bad = 0, lost = 0, lastErr = "";

    // Strictly sequential, never Promise.all: twenty parallel uploads from a
    // phone stall the connection, and a stalled batch loses every photo
    // instead of some. One bad file is skipped, not fatal to the rest.
    for (let n = 0; n < files.length; n++) {
      setAt(n + 1);

      // too small (under PHOTO_MIN_WIDTH) or unreadable — count it and move on
      const blobs = await prepare(files[n]).catch(() => null);
      if (!blobs) { setRejected(++bad); continue; }

      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fullPath = `${user.id}/${stamp}.webp`;
      const thumbPath = `${user.id}/${stamp}-thumb.webp`;
      const opts = { contentType: "image/webp" };

      const up1 = await supabase.storage.from("photos").upload(fullPath, blobs.full, opts);
      if (up1.error) { lastErr = up1.error.message; setFailed(++lost); continue; }

      const up2 = await supabase.storage.from("photos").upload(thumbPath, blobs.thumb, opts);
      if (up2.error) {
        // the full-size blob is already up and now references nothing
        await supabase.storage.from("photos").remove([fullPath]);
        lastErr = up2.error.message; setFailed(++lost); continue;
      }

      // The row goes in the moment its blobs land, one photo at a time. If the
      // connection dies at photo 7 of 20, the first six are genuinely saved and
      // waiting in the pool when she reopens the board.
      const { data, error } = await supabase.from("staged_photos")
        .insert({ seller_id: user.id, photo_path: fullPath, thumb_path: thumbPath })
        .select("id, photo_path, thumb_path, created_at")
        .single();

      if (error || !data) {
        // nothing references these blobs — do not leave them filling the bucket
        await supabase.storage.from("photos").remove([fullPath, thumbPath]);
        lastErr = error?.message ?? "insert failed";
        setFailed(++lost);
        continue;
      }

      done.push(data as StagedPhoto);
      setAdded(done.length);
    }

    setBusy(false);
    if (lost) setErr(lastErr);
    if (done.length) onUploaded(done);
  }

  return (
    // closing mid-batch would hide the progress of uploads that keep running
    <Sheet title={t.uploadPhotos} onClose={() => { if (!busy) onClose(); }}>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pick} />

      <button className={"gs-drop" + (rejected || failed ? " bad" : "")}
        onClick={() => fileRef.current?.click()} disabled={busy}>
        {t.selectPhotos}
        <span className="gs-drop-note">{t.photoNote}</span>
      </button>

      {busy && <p className="gs-lead">{t.uploadingN(at, total)}</p>}
      {!busy && added > 0 && <p className="gs-lead">{t.photosAdded(added)}</p>}
      {rejected > 0 && <span className="gs-err">{t.photosRejected(rejected)}</span>}
      {failed > 0 && <span className="gs-err">{t.photosFailed(failed)}</span>}
      {err && <p className="gs-hint">{err}</p>}

      <button className="gs-btn gs-btn-cream gs-btn-wide" onClick={onClose} disabled={busy}>
        {t.close}
      </button>
      <p className="gs-fine">רוחב מינימלי לתמונה: {PHOTO_MIN_WIDTH} פיקסלים.</p>
    </Sheet>
  );
}
