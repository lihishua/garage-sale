/**
 * A piece of furniture's measurements: width, height, depth, as typed.
 *
 * Stored in `items.measurements` as text — `80×120×45 ס"מ` — because that
 * is what the sale page prints, and a buyer reads it, nothing computes on
 * it. A number she did not give is a dash, so the two that are there keep
 * their places: `80×–×45` still says which is which. One number alone is
 * named instead — `רוחב 80 ס"מ` — since `80×–×–` reads as a puzzle.
 */
export type Size = [string, string, string];

export const EMPTY_SIZE: Size = ["", "", ""];

/** the three places, in the order of the boxes */
const NAMES = ["רוחב", "גובה", "עומק"] as const;

/** how many of the three she filled in */
export const sizeFilled = (s: Size) => s.filter((x) => x.trim()).length;

export function formatSize(s: Size) {
  const t = s.map((x) => x.trim());
  if (sizeFilled(s) === 1) {
    const i = t.findIndex(Boolean);
    return `${NAMES[i]} ${t[i]} ס"מ`;
  }
  return t.map((x) => x || "–").join("×") + ' ס"מ';
}

/**
 * The stored text back into three boxes. Reads its own formats — the
 * named single number goes to the place its name says — and the free text
 * that came before it ("80 × 30 × 180 ס\"מ"): the first three numbers, in
 * order, and a dash where one was left out.
 */
export function parseSize(text: string | null | undefined): Size {
  const out: Size = ["", "", ""];
  const named = (text ?? "").match(/^(רוחב|גובה|עומק)\s+(\d+)/);
  if (named) {
    out[NAMES.indexOf(named[1] as (typeof NAMES)[number])] = named[2];
    return out;
  }
  const parts = (text ?? "").match(/\d+|–/g) ?? [];
  parts.slice(0, 3).forEach((p, i) => { out[i] = p === "–" ? "" : p; });
  return out;
}

/**
 * The stored text, ready to print: put through the formatter again, so an
 * item saved as `45×–×–` before lone numbers were named shows `רוחב 45`
 * like the rest. The `×` form is numbers in a fixed order and is printed
 * left-to-right; the named one is Hebrew and reads in the page's direction.
 */
export function showSize(text: string): { text: string; dir?: "ltr" } {
  const s = parseSize(text);
  const out = sizeFilled(s) ? formatSize(s) : text;
  return out.includes("×") ? { text: out, dir: "ltr" } : { text: out };
}
