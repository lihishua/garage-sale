// The chat moments the app itself cannot show, on the drawn chat screen in
// cards/chat.html. Records out/chat-<name>.webm plus a start mark each.
//   group  — the seller sends her link to the neighbours' group
//   inbox  — the buyer's list lands in the seller's chat
//   invite — the buyer gets the link from the seller
//   reply  — the buyer's list goes off to the seller, who answers
import fs from "node:fs";
import { chromium } from "playwright";

const SELLER = process.env.SELLER ?? "ליהי";     // the demo account's display name
const LINK = "https://www.garagesaleonline.app/demo";
const LIST = `היי ${SELLER}!\n\n• ספה תלת־מושבית — 800₪\n• אריה לקיר — 60₪\n• כורסת דובי — למסירה\n\nסה"כ: 860₪\n\nדנה — 0501234567`;

async function clip(name, run) {
  const ctx = await chromium.launch().then((b) => b.newContext({
    viewport: { width: 780, height: 1560 }, locale: "he-IL",
    recordVideo: { dir: "out/raw", size: { width: 780, height: 1560 } },
  }));
  const t0 = Date.now();
  const page = await ctx.newPage();
  await page.goto(new URL("./cards/chat.html", import.meta.url).href);
  await page.evaluate(() => document.fonts.ready);
  const start = (Date.now() - t0) / 1000 + 0.2;
  const marks = {};
  const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; };
  await run(page, mark);
  await page.waitForTimeout(1500);
  const path = await page.video().path();
  await ctx.close();
  fs.renameSync(path, `out/chat-${name}.webm`);
  fs.writeFileSync(`out/chat-${name}.json`, JSON.stringify({ start, marks }));
  console.log(`chat ${name} -> out/chat-${name}.webm`);
}
const wait = (page, ms) => page.waitForTimeout(ms);
const ev = (page, fn, arg) => page.evaluate(fn, arg);

const clips = {
  group: async (page) => {
    await ev(page, () => window.setup({ who: "השכונה שלנו", sub: "רוני, מאיה, יובל, אבא של נועם, את", ava: "🏘️" }));
    await ev(page, () => window.bubble({ from: "רוני", text: "מישהו מכיר חשמלאי טוב באזור?" }));
    await wait(page, 250);
    await ev(page, () => window.bubble({ from: "מאיה", text: "כן! שולחת לך בפרטי 🙂", blue: true }));
    await wait(page, 1400);
    await ev(page, (LINK) => window.type(`היי! אני עושה מכירת חצר אונליין — הכל כאן:\n${LINK}`, 1300), LINK);
    await wait(page, 700);
    await ev(page, () => window.send());
    await wait(page, 900);
    await ev(page, () => window.ticks());
    await wait(page, 1600);
    await ev(page, () => window.bubble({ from: "מאיה", text: "וואו, אני רוצה את הספה 😍", blue: true }));
    await wait(page, 600);
  },
  inbox: async (page) => {
    await ev(page, () => window.setup({ who: "דנה", sub: "050-123-4567", ava: "🙂" }));
    await wait(page, 1200);
    await ev(page, (LIST) => window.bubble({ text: LIST }), LIST);
    await wait(page, 2400);
    await ev(page, () => window.type("מעולה! אפשר לאסוף היום אחרי 5 🙂", 1100));
    await wait(page, 500);
    await ev(page, () => window.send());
    await wait(page, 900);
    await ev(page, () => window.ticks());
    await wait(page, 400);
  },
  invite: async (page, mark) => {
    // strangers until now: no history, just the message the seller sends
    await ev(page, (S) => window.setup({ who: S, sub: "אונליין", ava: "👩" }), SELLER);
    await wait(page, 2800);
    mark("link");
    await ev(page, ({ S, LINK }) => window.bubble({ text: `מכירת החצר (ללא חצר) של ${S} 🏡\n${LINK}` }), { S: SELLER, LINK });
    await wait(page, 3000);
    // the finger settles on the link, then taps it
    const a = page.locator(".msg a").last();
    await a.hover(); await wait(page, 900);
    await a.dispatchEvent("pointerdown");
    await wait(page, 1200);
  },
  reply: async (page) => {
    await ev(page, (S) => window.setup({ who: S, sub: "אונליין", ava: "👩" }), SELLER);
    await wait(page, 2800);
    await ev(page, (LIST) => window.type(LIST, 1100), LIST);
    await wait(page, 700);
    await ev(page, () => window.send());
    await wait(page, 1200);
    await ev(page, () => window.ticks());
    await wait(page, 2200);
    await ev(page, () => window.bubble({ text: "מעולה! מתי נוח לך לאסוף?" }));
    await wait(page, 1200);
  },
};
// the ripple on a tap, as in the app recordings
const RIPPLE = `
  const ring = document.createElement("div");
  ring.style.cssText = "position:fixed;z-index:99999;pointer-events:none;width:64px;height:64px;border-radius:50%;"
    + "border:4px solid #EE5A2A;background:rgba(238,90,42,.18);transform:translate(-50%,-50%);opacity:0;"
    + "box-shadow:0 0 0 6px rgba(238,90,42,.25);transition:opacity .25s,transform .18s,background .18s";
  document.body.appendChild(ring);
  document.addEventListener("pointermove", (e) => { ring.style.left = e.clientX + "px"; ring.style.top = e.clientY + "px"; ring.style.opacity = "1"; }, true);
  document.addEventListener("pointerdown", (e) => {
    ring.style.left = e.clientX + "px"; ring.style.top = e.clientY + "px"; ring.style.opacity = "1";
    ring.style.transform = "translate(-50%,-50%) scale(.8)"; ring.style.background = "rgba(238,90,42,.6)";
    setTimeout(() => { ring.style.transform = "translate(-50%,-50%)"; ring.style.background = "rgba(238,90,42,.18)"; }, 220);
    setTimeout(() => { ring.style.opacity = "0"; }, 900);
  }, true);`;
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(clips);
fs.mkdirSync("out/raw", { recursive: true });
for (const name of wanted) await clip(name, async (page, mark) => { await page.evaluate(RIPPLE); await clips[name](page, mark); });
