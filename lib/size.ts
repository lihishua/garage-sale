/**
 * A piece of furniture's measurements: width, length, depth, as typed.
 *
 * Stored in `items.measurements` as text — `80×120×45 ס"מ` — because that
 * is what the sale page prints, and a buyer reads it, nothing computes on
 * it. A number she did not give is a dash, so the two that are there keep
 * their places: `80×–×45` still says which is which.
 */
export type Size = [string, string, string];

export const EMPTY_SIZE: Size = ["", "", ""];

/** how many of the three she filled in */
export const sizeFilled = (s: Size) => s.filter((x) => x.trim()).length;

export const formatSize = (s: Size) =>
  s.map((x) => x.trim() || "–").join("×") + ' ס"מ';

/**
 * The stored text back into three boxes. Reads its own format and the
 * free text that came before it ("80 × 30 × 180 ס\"מ"): the first three
 * numbers, in order, and a dash where one was left out.
 */
export function parseSize(text: string | null | undefined): Size {
  const parts = (text ?? "").match(/\d+|–/g) ?? [];
  const out: Size = ["", "", ""];
  parts.slice(0, 3).forEach((p, i) => { out[i] = p === "–" ? "" : p; });
  return out;
}
