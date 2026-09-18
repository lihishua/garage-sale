// Drives the real app the way a person would — the same steps whether we
// are seeding the demo board quietly or recording them for the video.
import { chromium } from "playwright";

export const SITE = "https://www.garagesaleonline.app";
export const PROFILE = new URL("./.profile", import.meta.url).pathname;

/**
 * A phone-shaped browser on the saved (signed-in) profile. Playwright records
 * the page at CSS-pixel size, so a 390px phone would come out 390px wide; the
 * viewport is 780×1560 and open() zooms the page ×2 instead, which lays out
 * like a 390px phone and records at 780×1560.
 */
export async function phone({ video } = {}) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: true, locale: "he-IL",
    viewport: { width: 780, height: 1560 }, deviceScaleFactor: 1,
    ...(video ? { recordVideo: { dir: video, size: { width: 780, height: 1560 } } } : {}),
  });
  return ctx;
}

/**
 * Navigate, and zoom the page ×2 once it has settled. The zoom is added
 * after load because the app's hydration re-renders the document and drops
 * anything put there earlier. The one phone media query in the app
 * (max-width:560px) is pinned by hand, since the viewport is wider than that.
 */
export async function open(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "html{zoom:2}"
    + ".gs-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))!important;gap:14px!important}"
    + ".gs-fab{top:10px!important;inset-inline-end:10px!important}" });
  await page.waitForTimeout(150);
  page.readyAt = Date.now(); // the recording is trimmed to here
}

/** wait for the sheet with this title to be gone */
const sheetGone = (page, title) => page.getByRole("dialog", { name: title }).waitFor({ state: "hidden", timeout: 60_000 });

/** the upload sheet: pick files, wait for the sheet to close itself */
export async function upload(page, files, { slow = 0 } = {}) {
  await page.getByRole("button", { name: "העלאת תמונות" }).click();
  await page.waitForTimeout(slow);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /בחרו תמונות/ }).click(),
  ]);
  await chooser.setFiles(files);
  await sheetGone(page, "העלאת תמונות");
}

/** pick the last n photos in the pool (the ones just uploaded) */
export async function pickLast(page, n, { slow = 0 } = {}) {
  const picks = page.locator(".gs-pick:not(.used)");
  const count = await picks.count();
  for (let i = count - n; i < count; i++) {
    await picks.nth(i).click();
    await page.waitForTimeout(slow);
  }
}

/** the create sheet, from the picked photos */
export async function createItem(page, { title, price, free, tags = [], size, many = false, slow = 0 }) {
  await page.getByRole("button", { name: /יצירת פריט/ }).click();
  const sheet = page.getByRole("dialog", { name: "יצירת פריט" });
  await sheet.waitFor();
  await page.waitForTimeout(slow);
  if (many) { await sheet.getByRole("radio").nth(1).click(); await page.waitForTimeout(slow); }
  await sheet.getByPlaceholder("שם הפריט").pressSequentially(title, { delay: slow ? 70 : 0 });
  await page.waitForTimeout(slow);
  if (free) await sheet.getByRole("button", { name: "חינם" }).click();
  else await sheet.getByPlaceholder("מחיר").pressSequentially(String(price), { delay: slow ? 90 : 0 });
  await page.waitForTimeout(slow);
  for (const t of tags) { await sheet.getByRole("button", { name: t, exact: true }).click(); await page.waitForTimeout(slow / 2); }
  await page.waitForTimeout(slow);
  // furniture asks for width / height / depth
  if (size) {
    for (const [name, v] of Object.entries(size)) {
      await sheet.getByPlaceholder(name).pressSequentially(String(v), { delay: slow ? 90 : 0 });
    }
    await page.waitForTimeout(slow);
  }
  await sheet.getByRole("button", { name: "להעלות ללוח" }).click();
  await sheetGone(page, "יצירת פריט");
}
