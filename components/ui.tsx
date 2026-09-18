"use client";
import React from "react";
import { DIALS, flag } from "@/lib/countries";
import { STR, TAG_LABEL, type Lang } from "@/lib/i18n";
import { TAGS } from "@/lib/types";
import { type Size } from "@/lib/size";

export function Heart({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M12 20.5S3.5 14.8 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.6-8.5 11.3-8.5 11.3z"
        fill={on ? "#EE5A2A" : "#FFFFFF"} stroke="#1B1815" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={"gs-chip" + (on ? " on" : "")} onClick={onClick} aria-pressed={!!on}>
      {children}
    </button>
  );
}

export function StatChip({ n, label, on, onClick }:
  { n: React.ReactNode; label: string; on?: boolean; onClick?: () => void }) {
  const face = <span className="gs-stat-face"><b>{n}</b><span>{label}</span></span>;
  if (!onClick) return <div className="gs-stat gs-stat-flat">{face}</div>;
  return (
    <button type="button" className={"gs-stat" + (on ? " on" : "")} onClick={onClick} aria-pressed={!!on}>
      {face}
    </button>
  );
}

/**
 * The round × that closes a sheet or drops a row. A drawn ×, not the
 * character: the glyph varies by font and was barely there in the hand —
 * a thin scratch in the middle of a 36px circle. This one is drawn to size.
 */
export function XButton({ onClick, disabled, label }:
  { onClick?: () => void; disabled?: boolean; label: string }) {
  return (
    <button className="gs-x" onClick={onClick} disabled={disabled} aria-label={label}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/**
 * `busy` holds the sheet shut through work that must not be interrupted — and
 * says so: an × that silently does nothing reads as a broken button.
 */
// `hand` marks a title that is an item's own name rather than a label for the
// sheet ("רשימת המשאלות", "מי מבקש?") — a name is set in the hand font, like
// the name on the card it was opened from.
// `compact` is the preview size: a card floating over the page, centred,
// rather than a panel that takes the width. For a look at one thing.
/** the magnifying glass on a photo's corner: opens it full size */
export function ZoomButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="gs-zoom" onClick={onClick} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M15.5 15.5L20 20M8 10.5h5M10.5 8v5" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/**
 * One photo, full size, over everything: fitted to the screen, on a dark
 * ground, and gone on a tap anywhere or Escape. Nothing else — the sheet
 * under it keeps the words; this is only for looking closer.
 */
export function Lightbox({ src, alt, onClose, closeLabel }:
  { src: string; alt: string; onClose: () => void; closeLabel: string }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="gs-lightbox" role="dialog" aria-label={alt} onClick={onClose}>
      <img src={src} alt={alt} />
      <XButton onClick={onClose} label={closeLabel} />
    </div>
  );
}

export function Sheet({ title, sub, hand, compact, onClose, busy, children }:
  { title: string; /** a quiet line under the title — the item's tags */ sub?: React.ReactNode;
    hand?: boolean; compact?: boolean; onClose: () => void; busy?: boolean; children: React.ReactNode }) {
  const close = busy ? undefined : onClose;
  return (
    <div className={"gs-scrim" + (compact ? " gs-scrim-mid" : "")} onClick={close}>
      <div className={"gs-sheet" + (compact ? " gs-sheet-compact" : "")} role="dialog" aria-label={title}
        onClick={(e) => e.stopPropagation()}>
        <div className="gs-sheet-head">
          <div className="gs-sheet-titles">
            <h2 className={"gs-sheet-title" + (hand ? " hand" : "")}>{title}</h2>
            {sub && <p className="gs-sheet-sub">{sub}</p>}
          </div>
          <XButton onClick={close} disabled={busy} label="×" />
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, value, onChange, placeholder, err, hint, type = "text", ltr, area, numeric }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; err?: string; hint?: string; type?: string; ltr?: boolean; area?: boolean;
  /** digits only — brings up the number pad on a phone instead of the letters */
  numeric?: boolean;
}) {
  return (
    <label className="gs-field">
      <span className="gs-label">{label}</span>
      {area ? (
        <textarea className={"gs-input" + (err ? " bad" : "")} rows={3} value={value}
          placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={"gs-input" + (err ? " bad" : "")} value={value} type={type}
          dir={ltr ? "ltr" : undefined} placeholder={placeholder}
          inputMode={numeric ? "numeric" : undefined} pattern={numeric ? "[0-9]*" : undefined}
          onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && !err && <span className="gs-hint">{hint}</span>}
      {err && <span className="gs-err">{err}</span>}
    </label>
  );
}

/**
 * A piece of furniture's three numbers, side by side: width, height, depth.
 * Each box names itself; the unit is understood. `firstRef` is for the form
 * to put the cursor back here when she chooses to fix them.
 */
export function SizeFields({ value, onChange, err, firstRef, lang = "he" }: {
  value: Size; onChange: (v: Size) => void; err?: string;
  firstRef?: React.RefObject<HTMLInputElement>; lang?: Lang;
}) {
  const t = STR[lang];
  const names = [t.sizeW, t.sizeL, t.sizeD];
  const setAt = (i: number, v: string) => {
    const next = [...value] as Size;
    next[i] = v.replace(/\D/g, "").slice(0, 4);
    onChange(next);
  };
  return (
    <div className="gs-field" aria-label={t.measurements}>
      <div className="gs-size">
        {names.map((name, i) => (
          <input key={name} ref={i === 0 ? firstRef : undefined}
            className={"gs-input gs-size-in" + (err ? " bad" : "")} value={value[i]}
            placeholder={name} aria-label={name} inputMode="numeric" pattern="[0-9]*"
            onChange={(e) => setAt(i, e.target.value)} />
        ))}
      </div>
      {err && <span className="gs-err">{err}</span>}
    </div>
  );
}

/**
 * The phone field: a country code picked from a list, and the number as she
 * would say it out loud. See lib/countries.ts for why the code has to be there
 * at all — it is WhatsApp's requirement, not ours, and it used to be the
 * seller's problem to know that.
 */
export function PhoneField({ label, dial, onDial, value, onChange, err, hint, lang = "he" }: {
  label: string; dial: string; onDial: (v: string) => void;
  value: string; onChange: (v: string) => void;
  err?: string; hint?: string; lang?: Lang;
}) {
  return (
    <label className="gs-field">
      <span className="gs-label">{label}</span>
      <span className="gs-phone">
        <select className="gs-dial" value={dial} dir="ltr"
          onChange={(e) => onDial(e.target.value)} aria-label={label}>
          {/* the code is the part that is doing work; the country name would
              only be repeating what the flag already says, so it moves to the
              title where it is there for anyone who wants it */}
          {DIALS.map((d) => (
            <option key={d.code} value={d.code} title={lang === "he" ? d.he : d.en}>
              {flag(d.iso)} +{d.code}
            </option>
          ))}
        </select>
        <input className={"gs-input" + (err ? " bad" : "")} value={value} dir="ltr"
          type="tel" inputMode="tel" placeholder="050-1234567"
          onChange={(e) => onChange(e.target.value)} />
      </span>
      {hint && !err && <span className="gs-hint">{hint}</span>}
      {err && <span className="gs-err">{err}</span>}
    </label>
  );
}

/**
 * The tags to pick from, and a chip to invent another.
 *
 * `known` is everything on offer: the built-ins, her own words, and whatever
 * her items already carry — the board assembles it. This picker only says
 * what she did: `onMade` when a new word appears, `onDropped` when she takes
 * one away with its ×. Where those words are kept is the board's business.
 *
 * A new tag starts as a "+" chip at the end of the row: tap it and it opens
 * into a box the size of a chip; type, tap anywhere else (or Enter), and the
 * text becomes a chip of its own, chosen, with the "+" back after it. Her own tags toggle like
 * the built-in ones and carry a small × besides, to take one away for good.
 */
export function TagPicker({ known, chosen, onChange, onMade, onDropped, lang = "he" }: {
  known: string[]; chosen: string[]; onChange: (tags: string[]) => void;
  onMade: (tag: string) => void; onDropped: (tag: string) => void; lang?: Lang;
}) {
  const t = STR[lang];
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const shown = [...known, ...chosen.filter((c) => !known.includes(c))];

  const toggle = (x: string) =>
    onChange(chosen.includes(x) ? chosen.filter((y) => y !== x) : [...chosen, x]);

  const add = () => {
    const tag = draft.trim().replace(/\s+/g, " ");
    if (!tag) return;
    // "גינה" typed twice, or once against an existing "גינה", is one tag —
    // match what is already there rather than making a near-twin of it
    const existing = shown.find((k) => k.toLowerCase() === tag.toLowerCase());
    const use = existing ?? tag;
    if (!existing) onMade(use);
    if (!chosen.includes(use)) onChange([...chosen, use]);
    setDraft("");
  };

  return (
    <>
      <div className="gs-filters gs-filters-tight" aria-label={t.tagsLabel}>
        {shown.map((x) => TAGS.includes(x as never) ? (
          <Chip key={x} on={chosen.includes(x)} onClick={() => toggle(x)}>
            {TAG_LABEL[x]?.[lang] ?? x}
          </Chip>
        ) : (
          // her own: toggles like the rest, and the × takes the tag away
          <span key={x} className="gs-chip-own">
            <Chip on={chosen.includes(x)} onClick={() => toggle(x)}>{x}</Chip>
            <button type="button" className="gs-chip-x" aria-label={t.tagRemove}
              onClick={() => { onDropped(x); onChange(chosen.filter((y) => y !== x)); }}>
              <svg viewBox="0 0 24 24" width="9" height="9" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor"
                  strokeWidth="3" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        {/* a "+" chip until she taps it; then a box the size of a chip, with
            the cursor in it. Tapping away with nothing typed folds it back. */}
        {adding ? (
          <input className="gs-chip gs-chip-new" value={draft} placeholder={t.tagAddPh}
            size={12} autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { add(); setAdding(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); add(); setAdding(false); }
              if (e.key === "Escape") { setDraft(""); setAdding(false); }
            }} />
        ) : (
          <button type="button" className="gs-chip gs-chip-plus" aria-label={t.tagAddPh}
            onClick={() => setAdding(true)}>+</button>
        )}
      </div>
    </>
  );
}

/**
 * The app's own "are you sure?", in place of the browser's: a question in
 * the middle of the screen, centred, and the buttons under it. `confirm`
 * resolves to her answer; `dialog` is the box, rendered wherever the toast
 * is. Tapping the scrim is "no".
 *
 * A question can carry a third way out — `more`, a labelled button under
 * the two — for the one case with a stronger answer than yes ("and delete
 * the photos too"). Picking it resolves to "more".
 */
export type Answer = boolean | "more";

export function useConfirm(lang: Lang = "he") {
  const t = STR[lang];
  const [ask, setAsk] = React.useState<{ text: string; more?: string; resolve: (a: Answer) => void } | null>(null);
  const confirm = React.useCallback(
    (text: string, more?: string) => new Promise<Answer>((resolve) => setAsk({ text, more, resolve })), []);
  const answer = (a: Answer) => { ask?.resolve(a); setAsk(null); };
  const dialog = ask && (
    <div className="gs-scrim gs-scrim-mid gs-scrim-top" onClick={() => answer(false)}>
      <div className="gs-confirm" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p>{ask.text}</p>
        <div className="gs-confirm-btns">
          <button className="gs-btn gs-btn-orange" onClick={() => answer(true)} autoFocus>{t.ok}</button>
          <button className="gs-btn gs-btn-cream" onClick={() => answer(false)}>{t.cancel}</button>
        </div>
        {ask.more && (
          <button className="gs-btn-ghost gs-danger gs-confirm-more" onClick={() => answer("more")}>{ask.more}</button>
        )}
      </div>
    </div>
  );
  return { confirm, dialog };
}

/** the one-line privacy note that closes every page, with the page behind it */
export function PrivacyNote({ lang = "he" }: { lang?: Lang }) {
  const t = STR[lang];
  return (
    <p className="gs-privacy-note">
      {t.privacyNote} <a href="/privacy">{t.privacyLink}</a>
      {/* copyright is automatic and free; it needs no registration to be
          true, unlike a ™ — and it covers the code and the drawings, which
          is what someone would actually copy. The year is the year it was
          first published, and stays put; it is not a "last updated" stamp. */}
      <span className="gs-copyright" dir="ltr">© 2026 Garage Sale</span>
    </p>
  );
}

export function Toast({ text }: { text: string }) {
  return <div className="gs-toast">{text}</div>;
}
