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
    await ev(page, (S) => window.setup({ who: S, sub: "אונליין", ava: "👩" }), SELLER);
    await ev(page, () => window.bubble({ text: "היי! מה שלומך?" }));
    await wait(page, 200);
    await ev(page, () => window.bubble({ text: "הכל טוב 🙂", out: true, ticks: true }));
    await wait(page, 1500);
    mark("link");
    await ev(page, ({ S, LINK }) => window.bubble({ text: `מכירת החצר (ללא חצר) של ${S} 🏡\n${LINK}` }), { S: SELLER, LINK });
    await wait(page, 2600);
    // a tap on the link
    await page.locator(".msg a").last().evaluate((a) => {
      const r = a.getBoundingClientRect();
      a.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    });
    await wait(page, 900);
  },
  reply: async (page) => {
    await ev(page, (S) => window.setup({ who: S, sub: "אונליין", ava: "👩" }), SELLER);
    await ev(page, () => window.bubble({ text: "היי! מה שלומך?" }));
    await ev(page, () => window.bubble({ text: "הכל טוב 🙂", out: true, ticks: true }));
    await wait(page, 900);
    await ev(page, (LIST) => window.type(LIST, 900), LIST);
    await wait(page, 500);
    await ev(page, () => window.send());
    await wait(page, 1000);
    await ev(page, () => window.ticks());
    await wait(page, 1800);
    await ev(page, () => window.bubble({ text: "מעולה! מתי נוח לך לאסוף?" }));
    await wait(page, 800);
  },
};
// the ripple on a tap, as in the app recordings
const RIPPLE = `document.addEventListener("pointerdown",(e)=>{const r=document.createElement("div");r.style.cssText="position:fixed;z-index:99999;pointer-events:none;width:44px;height:44px;border-radius:50%;background:rgba(238,90,42,.35);border:2px solid rgba(238,90,42,.8);transform:translate(-50%,-50%) scale(.4);left:"+e.clientX+"px;top:"+e.clientY+"px;transition:transform .35s ease-out,opacity .35s ease-out;opacity:1";document.body.appendChild(r);requestAnimationFrame(()=>{r.style.transform="translate(-50%,-50%) scale(1.1)";r.style.opacity="0"});setTimeout(()=>r.remove(),450)},true)`;
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(clips);
fs.mkdirSync("out/raw", { recursive: true });
for (const name of wanted) await clip(name, async (page, mark) => { await page.evaluate(RIPPLE); await clips[name](page, mark); });
