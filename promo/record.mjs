// Records the three demo scenes of video 2 as separate clips in out/:
//   a — the seller: upload three photos, make a lot, copy the link
//   b — a buyer: open the link, filter, want the lion, send the list
//   c — the seller: the request came in; mark it paid, the takings go up
// usage: node record.mjs [a|b|c ...]   (all three when none given)
import fs from "node:fs";
import { phone, open, upload, pickLast, createItem, SITE } from "./flow.mjs";

const SLOW = 700; // a beat between taps, so the eye can follow
const beat = (page, ms = SLOW) => page.waitForTimeout(ms);

// a ripple where each tap lands: a phone shows no cursor, so this is the
// only sign that something was pressed
const RIPPLE = `
  document.addEventListener("pointerdown", (e) => {
    const r = document.createElement("div");
    r.style.cssText = "position:fixed;z-index:99999;pointer-events:none;width:44px;height:44px;border-radius:50%;"
      + "background:rgba(238,90,42,.35);border:2px solid rgba(238,90,42,.8);transform:translate(-50%,-50%) scale(.4);"
      + "left:" + e.clientX + "px;top:" + e.clientY + "px;transition:transform .35s ease-out,opacity .35s ease-out;opacity:1";
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = "translate(-50%,-50%) scale(1.1)"; r.style.opacity = "0"; });
    setTimeout(() => r.remove(), 450);
  }, true);`;

async function scene(name, run) {
  const ctx = await phone({ video: "out/raw" });
  await ctx.addInitScript(RIPPLE);
  const t0 = Date.now();
  const page = await ctx.newPage();
  // moments the captions hang on, as seconds into the recording
  const marks = {};
  const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; };
  let failed = null;
  try { await run(page, mark); await beat(page, 1200); }
  catch (e) { failed = e; await page.screenshot({ path: `out/scene-${name}-failed.png` }).catch(() => {}); }
  const path = await page.video().path();
  await ctx.close();
  fs.renameSync(path, `out/scene-${name}.webm`);
  // the recording starts at page creation, before the page is zoomed: the
  // build cuts in at the last open() plus a breath
  fs.writeFileSync(`out/scene-${name}.json`, JSON.stringify({ start: ((page.readyAt ?? t0) - t0) / 1000 + 0.25, marks }));
  if (failed) { console.error(`scene ${name} FAILED (see out/scene-${name}-failed.png):`, failed.message.split("\n")[0]); process.exit(1); }
  console.log(`scene ${name}: ${((Date.now() - t0) / 1000).toFixed(1)}s -> out/scene-${name}.webm`);
}

const scenes = {
  a: async (page, mark) => {
    await open(page, `${SITE}/dashboard`);
    await beat(page, 1000);
    await upload(page, ["photos/IMG_0437.jpg", "photos/IMG_0438.jpg", "photos/IMG_0439.jpg"], { slow: SLOW });
    await beat(page);
    await pickLast(page, 3, { slow: SLOW });
    await beat(page);
    mark("create");
    await createItem(page, { title: "ספרי ילדים", price: 10, tags: ["ספרים", "ילדים"], many: true, slow: SLOW });
    await beat(page, 1200);
    mark("link");
    await page.locator(".gs-linkbar").scrollIntoViewIfNeeded();
    await beat(page, 900);
    await page.getByRole("button", { name: "העתקה" }).click();
    await beat(page, 1600);
  },
  b: async (page, mark) => {
    // a fresh buyer: whatever an earlier take left in this browser's list
    // is dropped (only the buyer's keys — the seller's login shares the store)
    await open(page, `${SITE}/demo`);
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("gs.")).forEach((k) => localStorage.removeItem(k)));
    await open(page, `${SITE}/demo`);
    await beat(page, 1600);
    // four hearts, slowly, straight off the cards
    for (const title of ["ספה תלת־מושבית", "אריה לקיר", "מקרר", "כורסת דובי"]) {
      const card = page.locator(".gs-card", { hasText: title });
      await card.scrollIntoViewIfNeeded();
      await beat(page, 500);
      await card.locator(".gs-heart").click();
      await beat(page, 1100);
    }
    await beat(page, 600);
    // the list: look it over, take the fridge off
    mark("list");
    await page.locator(".gs-fab").click();
    await beat(page, 2200);
    mark("drop");
    await page.locator(".gs-list-row", { hasText: "מקרר" }).getByRole("button").click();
    await beat(page, 1600);
    // send: who is asking, then the message, then off to WhatsApp
    mark("form");
    await page.getByRole("button", { name: /^לשלוח את הרשימה ל/ }).click();
    await beat(page, 900);
    await page.getByLabel("השם שלך").pressSequentially("דנה", { delay: 110 });
    await beat(page, 400);
    await page.getByLabel("מספר טלפון").pressSequentially("0501234567", { delay: 80 });
    await beat(page, 700);
    mark("send");
    await page.getByRole("button", { name: "לשלוח את הרשימה", exact: true }).click();
    await page.locator(".gs-wa").waitFor();
    await beat(page, 2200);
    // the green button opens WhatsApp — a new tab here, which we drop
    const [popup] = await Promise.all([
      page.context().waitForEvent("page").catch(() => null),
      page.getByRole("button", { name: /ווטסאפ|וואטסאפ/ }).click(),
    ]);
    await beat(page, 600);
    if (popup) await popup.close().catch(() => {});
  },
  c: async (page, mark) => {
    await open(page, `${SITE}/dashboard`);
    await beat(page, 800);
    await page.locator(".gs-section", { hasText: "בקשות שהגיעו" }).scrollIntoViewIfNeeded();
    await beat(page, 1200);
    await page.locator(".gs-tile", { hasText: "אריה לקיר" }).scrollIntoViewIfNeeded();
    await beat(page);
    await page.locator(".gs-tile", { hasText: "אריה לקיר" }).click();
    await beat(page, 1100);
    mark("paid");
    await page.getByRole("button", { name: "קיבלתי תשלום" }).click();
    await beat(page, 900);
    await page.locator(".gs-status-head").first().evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    await beat(page, 1800);
  },
};

fs.mkdirSync("out/raw", { recursive: true });
for (const name of (process.argv.slice(2).length ? process.argv.slice(2) : ["a", "b", "c"])) {
  await scene(name, scenes[name]);
}
