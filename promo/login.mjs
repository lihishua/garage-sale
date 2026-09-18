// Opens the recording browser, logged out, at the live login page, and keeps
// it open until you close it. Whatever you sign in as is remembered in
// ./.profile, which the recording scripts reuse.
import { chromium } from "playwright";
const ctx = await chromium.launchPersistentContext(new URL("./.profile", import.meta.url).pathname, {
  headless: false, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "he-IL",
});
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto("https://www.garagesaleonline.app/login");
console.log("window open — sign in there, then close the window");
await new Promise((r) => ctx.on("close", r));
