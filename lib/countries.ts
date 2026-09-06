/**
 * Country codes for the WhatsApp number.
 *
 * The code is not paperwork: every message this app sends goes through a
 * `wa.me/<digits>` link, and WhatsApp resolves those only against a full
 * international number — no `+`, no leading zero, country code included. A
 * number typed as `0501234567` reaches nobody. Asking a seller to type
 * `972501234567` worked but explained none of that, so the code is a list she
 * picks from instead, already on ישראל.
 *
 * Short on purpose: the countries an Israeli garage sale actually reaches.
 * Adding one is a line.
 */
export type Dial = { code: string; he: string; en: string };

export const DIALS: Dial[] = [
  { code: "972", he: "ישראל", en: "Israel" },
  { code: "1", he: 'ארה"ב / קנדה', en: "US / Canada" },
  { code: "44", he: "בריטניה", en: "United Kingdom" },
  { code: "33", he: "צרפת", en: "France" },
  { code: "49", he: "גרמניה", en: "Germany" },
  { code: "31", he: "הולנד", en: "Netherlands" },
  { code: "32", he: "בלגיה", en: "Belgium" },
  { code: "34", he: "ספרד", en: "Spain" },
  { code: "39", he: "איטליה", en: "Italy" },
  { code: "30", he: "יוון", en: "Greece" },
  { code: "357", he: "קפריסין", en: "Cyprus" },
  { code: "41", he: "שווייץ", en: "Switzerland" },
  { code: "43", he: "אוסטריה", en: "Austria" },
  { code: "351", he: "פורטוגל", en: "Portugal" },
  { code: "353", he: "אירלנד", en: "Ireland" },
  { code: "46", he: "שוודיה", en: "Sweden" },
  { code: "48", he: "פולין", en: "Poland" },
  { code: "7", he: "רוסיה", en: "Russia" },
  { code: "380", he: "אוקראינה", en: "Ukraine" },
  { code: "90", he: "טורקיה", en: "Turkey" },
  { code: "61", he: "אוסטרליה", en: "Australia" },
  { code: "27", he: "דרום אפריקה", en: "South Africa" },
  { code: "55", he: "ברזיל", en: "Brazil" },
  { code: "54", he: "ארגנטינה", en: "Argentina" },
  { code: "52", he: "מקסיקו", en: "Mexico" },
];

export const DEFAULT_DIAL = "972";

/**
 * The two halves into the one string WhatsApp wants.
 *
 * The leading zero goes: it is the domestic trunk prefix, and it is exactly
 * what makes `972` + `0501234567` unreachable. Everything that is not a digit
 * goes with it, so spaces and dashes typed out of habit cost nothing.
 */
export const fullPhone = (dial: string, local: string) =>
  dial + local.replace(/\D/g, "").replace(/^0+/, "");

/** enough digits left, once the trunk zero and the punctuation are gone */
export const validLocal = (local: string) =>
  /^\d{6,14}$/.test(local.replace(/\D/g, "").replace(/^0+/, ""));
