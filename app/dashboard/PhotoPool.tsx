"use client";

import React, { useMemo, useState } from "react";
import { photoUrl } from "@/lib/supabase-browser";
import { STR } from "@/lib/i18n";
import type { StagedPhoto } from "@/lib/types";

/**
 * The pool: photos uploaded but not yet made into a listing. Tapping picks,
 * tapping again unpicks, and the badge shows the pick order — because that
 * order is load-bearing. The first photo picked becomes position 0, which is
 * the cover of the listing (or of its first unit).
 */
export default function PhotoPool({ photos, onCreate }:
  { photos: StagedPhoto[]; onCreate: (selected: StagedPhoto[]) => void }) {
  const t = STR.he;

  // ids, in the order they were tapped
  const [picked, setPicked] = useState<string[]>([]);

  const live = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  // Derived, never mirrored: once a photo leaves the pool (it became a
  // listing) it drops out of the selection here on its own. That is why the
  // selection needs no effect to reset it after a successful create.
  const selected = useMemo(
    () => picked.map((id) => live.get(id)).filter(Boolean) as StagedPhoto[],
    [picked, live]
  );

  const toggle = (id: string) =>
    setPicked((p) => {
      // the same pass also sheds ids of photos that have since left the pool,
      // so the array cannot grow stale entries over a long session
      const kept = p.filter((x) => x !== id && live.has(x));
      return p.includes(id) ? kept : [...kept, id];
    });

  if (photos.length === 0) return <p className="gs-empty">{t.poolEmpty}</p>;

  return (
    <>
      <p className="gs-lead">{t.poolWaiting(photos.length)}</p>

      <div className="gs-pool">
        {photos.map((p) => {
          const at = picked.indexOf(p.id);
          return (
            <button key={p.id} type="button" aria-pressed={at >= 0}
              className={"gs-pick" + (at >= 0 ? " on" : "")} onClick={() => toggle(p.id)}>
              <img src={photoUrl(p.thumb_path)} alt="" loading="lazy" />
              {at >= 0 && <span className="gs-pick-n">{at + 1}</span>}
            </button>
          );
        })}
      </div>

      <p className="gs-hint">{t.coverHint}</p>

      <button className="gs-btn gs-btn-orange gs-btn-wide"
        disabled={selected.length === 0} onClick={() => onCreate(selected)}>
        {/* createItemFrom(0) would read "מ־0 תמונות" — a disabled button says
            what it is instead of counting nothing */}
        {selected.length ? t.createItemFrom(selected.length) : t.createItem}
      </button>
    </>
  );
}
