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
export type Dial = { code: string; iso: string; he: string; en: string };

export const DIALS: Dial[] = [
  { code: "972", iso: "IL", he: "ישראל", en: "Israel" },
  { code: "1", iso: "US", he: 'ארה"ב / קנדה', en: "US / Canada" },
  { code: "44", iso: "GB", he: "בריטניה", en: "United Kingdom" },
  { code: "33", iso: "FR", he: "צרפת", en: "France" },
  { code: "49", iso: "DE", he: "גרמניה", en: "Germany" },
  { code: "31", iso: "NL", he: "הולנד", en: "Netherlands" },
  { code: "32", iso: "BE", he: "בלגיה", en: "Belgium" },
  { code: "34", iso: "ES", he: "ספרד", en: "Spain" },
  { code: "39", iso: "IT", he: "איטליה", en: "Italy" },
  { code: "30", iso: "GR", he: "יוון", en: "Greece" },
  { code: "357", iso: "CY", he: "קפריסין", en: "Cyprus" },
  { code: "41", iso: "CH", he: "שווייץ", en: "Switzerland" },
  { code: "43", iso: "AT", he: "אוסטריה", en: "Austria" },
  { code: "351", iso: "PT", he: "פורטוגל", en: "Portugal" },
  { code: "353", iso: "IE", he: "אירלנד", en: "Ireland" },
  { code: "46", iso: "SE", he: "שוודיה", en: "Sweden" },
  { code: "48", iso: "PL", he: "פולין", en: "Poland" },
  { code: "7", iso: "RU", he: "רוסיה", en: "Russia" },
  { code: "380", iso: "UA", he: "אוקראינה", en: "Ukraine" },
  { code: "90", iso: "TR", he: "טורקיה", en: "Turkey" },
  { code: "61", iso: "AU", he: "אוסטרליה", en: "Australia" },
  { code: "27", iso: "ZA", he: "דרום אפריקה", en: "South Africa" },
  { code: "55", iso: "BR", he: "ברזיל", en: "Brazil" },
  { code: "54", iso: "AR", he: "ארגנטינה", en: "Argentina" },
  { code: "52", iso: "MX", he: "מקסיקו", en: "Mexico" },
];

export const DEFAULT_DIAL = "972";

/**
 * The flag, from the ISO code — two regional indicator letters, which every
 * platform that has flags composes into one. Where it has none (Windows draws
 * the letters instead) the row still reads, because the dial code beside it is
 * the part that matters and the name is on the option's title.
 */
export const flag = (isoCode: string) =>
  isoCode.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

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
