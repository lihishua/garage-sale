// Puts the demo board back the way the recording expects it:
// no books lot, no pool photos, no requests, the lion back in stock.
import { phone, open, SITE } from "./flow.mjs";
const ctx = await phone();
const page = await ctx.newPage();
const ok = async () => { await page.getByRole("alertdialog").getByRole("button", { name: "אישור" }).click(); await page.waitForTimeout(600); };
await open(page, `${SITE}/dashboard`);

// the lion back in stock (sheet → חזרה למלאי), if it was marked
const lion = page.locator(".gs-tile", { hasText: "אריה לקיר" });
await lion.click(); await page.waitForTimeout(500);
const back = page.getByRole("dialog").getByRole("button", { name: "חזרה למלאי" });
if (await back.isVisible()) { await back.click(); await page.waitForTimeout(600); console.log("lion back in stock"); }
await page.getByRole("dialog").getByRole("button", { name: "×" }).click().catch(() => {});
await page.waitForTimeout(400);

// requests: the × on each row (kept with --keep-requests, for re-taking scene c)
while (!process.argv.includes("--keep-requests") && await page.getByRole("button", { name: "הסרת הבקשה" }).count()) {
  await page.getByRole("button", { name: "הסרת הבקשה" }).first().click();
  if (await page.getByRole("alertdialog").isVisible().catch(() => false)) await ok();
  await page.waitForTimeout(600); console.log("request removed");
}

// the books lots: sheet → מחיקה → confirm (photos return to the pool)
while (await page.locator(".gs-tile", { hasText: "ספרי ילדים" }).count()) {
  await page.locator(".gs-tile", { hasText: "ספרי ילדים" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "מחיקה" }).click();
  await ok(); console.log("lot deleted");
}

// the pool: delete every photo left in it
while (await page.locator(".gs-pick-wrap").count()) {
  await page.locator(".gs-pick-wrap .gs-pick-del[title='מחיקת תמונה']").first().click();
  await ok(); console.log("photo deleted");
}
console.log("tiles:", await page.locator(".gs-tile").count(), "pool:", await page.locator(".gs-pick-wrap").count());
await ctx.close();
