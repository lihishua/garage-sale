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
export default function PhotoPool({ photos, listed, onCreate, onDelete }: {
  photos: StagedPhoto[];
  /**
   * Photos that are already part of a listing but are still sitting in the
   * pool — which happens only when the listing was created and clearing the
   * pool afterwards failed. Nothing was lost, so they stay visible, but
   * picking them again would build a second listing from photos that are
   * already in one. They are shown struck out of the running instead.
   */
  listed: string[];
  onCreate: (selected: StagedPhoto[]) => void;
  /**
   * Discards a photo that never made it into a listing. Not offered for a
   * `listed` one — its blob is the live listing's own photo, not a spare
   * copy, so removing it here would strip images off something already on
   * the board.
   */
  onDelete: (photo: StagedPhoto) => void;
}) {
  const t = STR.he;

  // ids, in the order they were tapped
  const [picked, setPicked] = useState<string[]>([]);

  // what may still be picked: in the pool, and not already in a listing
  const live = useMemo(
    () => new Map(photos.filter((p) => !listed.includes(p.id)).map((p) => [p.id, p])),
    [photos, listed]
  );

  // Derived, never mirrored: once a photo becomes part of a listing it drops
  // out of the selection here on its own, whether it left the pool or merely
  // failed to. That is why the selection needs no effect to reset it, and why
  // the button cannot go on counting photos that are already spoken for.
  const selected = useMemo(
    () => picked.map((id) => live.get(id)).filter(Boolean) as StagedPhoto[],
    [picked, live]
  );

  const toggle = (id: string) =>
    setPicked((p) => {
      // the same pass also sheds ids that are no longer pickable, so the array
      // cannot grow stale entries over a long session
      const kept = p.filter((x) => x !== id && live.has(x));
      return p.includes(id) ? kept : [...kept, id];
    });

  if (photos.length === 0) return <p className="gs-empty">{t.poolEmpty}</p>;

  return (
    <>
      <p className="gs-lead">{t.poolWaiting(photos.length)}</p>

      <div className="gs-pool">
        {photos.map((p) => {
          const used = listed.includes(p.id);
          const at = used ? -1 : picked.indexOf(p.id);
          return (
            <div key={p.id} className="gs-pick-wrap">
              <button type="button" aria-pressed={at >= 0} disabled={used}
                className={"gs-pick" + (at >= 0 ? " on" : "") + (used ? " used" : "")}
                onClick={() => toggle(p.id)}>
                <img src={photoUrl(p.thumb_path)} alt="" loading="lazy" />
                {at >= 0 && <span className="gs-pick-n">{at + 1}</span>}
                {/* a durable mark, so she still knows after the message is gone */}
                {used && <span className="gs-pick-tag">{t.alreadyListed}</span>}
              </button>
              {/* not offered on a `used` tile — see onDelete's doc above */}
              {!used && (
                <button type="button" className="gs-pick-del" title={t.deletePhoto}
                  aria-label={t.deletePhoto} onClick={() => onDelete(p)}>
                  ×
                </button>
              )}
            </div>
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
